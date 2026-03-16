"""Ingest memories directly from Chromium Web Data files (address profiles, autofill, cards)."""

import shutil
import sqlite3
import tempfile
import logging
from pathlib import Path
from typing import Optional

from ai_browser_profile.db import MemoryDB
from ai_browser_profile.ingestors.constants import (
    ADDRESS_TYPE_MAP, AUTOFILL_FIELD_MAP, BROWSER_PATHS,
    clean_field_name, is_noise_field, infer_tags,
)

log = logging.getLogger(__name__)


def _copy_db(src: Path) -> Optional[Path]:
    """Copy a SQLite DB to temp dir to avoid browser locks."""
    if not src.exists():
        return None
    tmp = Path(tempfile.mkdtemp(prefix="ai_browser_profile_"))
    dst = tmp / src.name
    shutil.copy2(src, dst)
    for suffix in ["-wal", "-shm"]:
        wal = src.parent / (src.name + suffix)
        if wal.exists():
            shutil.copy2(wal, tmp / (src.name + suffix))
    return dst


def _extract_webdata(mem: MemoryDB, browser: str, profile: str, webdata_path: Path):
    """Extract address profiles, form autofill, and credit card info from Web Data."""
    tmp_db = _copy_db(webdata_path)
    if not tmp_db:
        return
    source_prefix = f"autofill:{browser}:{profile}"

    try:
        conn = sqlite3.connect(f"file:{tmp_db}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        # --- Structured address profiles (all type codes) ---
        use_counts = {}
        try:
            for row in conn.execute("SELECT guid, use_count FROM addresses"):
                use_counts[row["guid"]] = row["use_count"]
        except sqlite3.OperationalError:
            pass

        try:
            for row in conn.execute("SELECT guid, type, value FROM address_type_tokens WHERE value != ''"):
                type_code = row["type"]
                use_count = use_counts.get(row["guid"], 0)

                if type_code in ADDRESS_TYPE_MAP:
                    key_name, tags = ADDRESS_TYPE_MAP[type_code]
                else:
                    key_name = f"address_type_{type_code}"
                    tags = ["address"]

                mem.upsert(key_name, row["value"], tags, source=source_prefix)
        except sqlite3.OperationalError:
            pass

        # --- Form autofill entries (ALL fields, not just mapped ones) ---
        try:
            for row in conn.execute("SELECT name, value, count FROM autofill WHERE value != '' ORDER BY count DESC"):
                raw_field = row["name"]
                value = row["value"]
                use_count = row["count"]

                # Skip noise: pure numbers, UUIDs, timestamps, CSS selectors
                if is_noise_field(raw_field):
                    continue

                # Skip very low usage (likely accidental fills)
                if use_count < 2:
                    continue

                # Skip very long values (likely not user data)
                if len(value) > 500:
                    continue

                # Clean the field name
                cleaned = clean_field_name(raw_field)
                if not cleaned or len(cleaned) < 2:
                    continue

                # Try to map to a known normalized key
                if cleaned in AUTOFILL_FIELD_MAP:
                    key_name, tags = AUTOFILL_FIELD_MAP[cleaned]
                else:
                    key_name = f"autofill:{cleaned}"
                    tags = infer_tags(cleaned)

                mem.upsert(key_name, value, tags, source=f"form:{browser}:{profile}")
        except sqlite3.OperationalError:
            pass

        # --- Credit cards (metadata only, no card numbers) ---
        try:
            for row in conn.execute("SELECT name_on_card, expiration_month, expiration_year, nickname FROM credit_cards"):
                if row["name_on_card"]:
                    mem.upsert("card_holder_name", row["name_on_card"],
                               ["payment", "identity"], source=f"card:{browser}:{profile}")
                if row["expiration_month"] and row["expiration_year"]:
                    mem.upsert("card_expiry", f"{row['expiration_month']:02d}/{row['expiration_year']}",
                               ["payment"], source=f"card:{browser}:{profile}")
                if row["nickname"]:
                    mem.upsert("card_nickname", row["nickname"],
                               ["payment"], source=f"card:{browser}:{profile}")
        except sqlite3.OperationalError:
            pass

        conn.close()
    except Exception as e:
        log.warning(f"Failed to extract Web Data for {browser}/{profile}: {e}")
    finally:
        shutil.rmtree(tmp_db.parent, ignore_errors=True)


def ingest_webdata(mem: MemoryDB):
    """Extract memories from all Chromium Web Data files."""
    for browser, base in BROWSER_PATHS.items():
        if not base.exists():
            continue
        for d in sorted(base.iterdir()):
            if d.is_dir() and (d.name == "Default" or d.name.startswith("Profile ")):
                webdata = d / "Web Data"
                if webdata.exists():
                    log.info(f"  Web Data: {browser}/{d.name}")
                    _extract_webdata(mem, browser, d.name, webdata)
