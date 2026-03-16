"""Ingest LinkedIn connections from Chromium Local Storage (LevelDB)."""

import json
import shutil
import tempfile
import logging
from pathlib import Path

from ai_browser_profile.db import MemoryDB
from ai_browser_profile.ingestors.browser_detect import BrowserProfile

log = logging.getLogger(__name__)


def ingest_localstorage(mem: MemoryDB, profiles: list[BrowserProfile]):
    """Extract LinkedIn connections from Chromium Local Storage."""
    from ccl_chromium_reader import ccl_chromium_localstorage

    total = 0
    for profile in profiles:
        if profile.browser in ("safari", "firefox"):
            continue

        ls_dir = profile.path / "Local Storage" / "leveldb"
        if not ls_dir.exists():
            continue

        tmp = Path(tempfile.mkdtemp(prefix="ai_browser_profile_ls_"))
        tmp_ls = tmp / "leveldb"
        try:
            shutil.copytree(ls_dir, tmp_ls)
        except Exception as e:
            log.warning(f"Failed to copy Local Storage for {profile.browser}/{profile.name}: {e}")
            shutil.rmtree(tmp, ignore_errors=True)
            continue

        try:
            ldb = ccl_chromium_localstorage.LocalStoreDb(tmp_ls)
            for record in ldb.iter_all_records():
                try:
                    origin = record.storage_key or ""
                    key = record.script_key or ""

                    # LinkedIn connections
                    if "linkedin" in origin and key == "linkedin_assistant_profiles":
                        value = record.value or ""
                        data = json.loads(value)
                        profiles_data = data.get("profiles", {})
                        for url, p in profiles_data.items():
                            name = p.get("name", "")
                            title = p.get("title", "")
                            if not name:
                                continue
                            value_str = title if title else url
                            mem.upsert(f"linkedin:{name}", value_str,
                                       ["contact", "work", "social"], source="linkedin")
                            total += 1
                except Exception:
                    continue

        except Exception as e:
            log.warning(f"Failed to read Local Storage for {profile.browser}/{profile.name}: {e}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    log.info(f"  Local Storage: {total} LinkedIn connections")
