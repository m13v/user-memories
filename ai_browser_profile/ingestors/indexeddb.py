"""Ingest WhatsApp contacts from Chromium IndexedDB (LevelDB)."""

import json
import shutil
import tempfile
import logging
from pathlib import Path

from ai_browser_profile.db import MemoryDB
from ai_browser_profile.ingestors.browser_detect import BrowserProfile

log = logging.getLogger(__name__)


def _copy_dir(src: Path) -> Path:
    """Copy a directory to temp to avoid browser locks."""
    tmp = Path(tempfile.mkdtemp(prefix="ai_browser_profile_idb_"))
    dst = tmp / src.name
    shutil.copytree(src, dst)
    return dst


def _serialize_value(val, depth=0):
    """Recursively convert ccl IndexedDB value to JSON-safe dict."""
    if depth > 20:
        return "<nested too deep>"
    if val is None:
        return None
    if isinstance(val, (bool, int, float, str)):
        return val
    if isinstance(val, bytes):
        try:
            return val.decode("utf-8")
        except UnicodeDecodeError:
            return f"<binary {len(val)} bytes>"
    if isinstance(val, dict):
        return {str(k): _serialize_value(v, depth + 1) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_serialize_value(v, depth + 1) for v in val]
    if hasattr(val, "value"):
        return _serialize_value(val.value, depth + 1)
    return str(val)


def _normalize_phone(raw: str) -> str:
    """Normalize a phone number to digits-only with leading +."""
    digits = "".join(c for c in raw if c.isdigit())
    if not digits:
        return raw
    if not digits.startswith("+"):
        digits = "+" + digits
    return digits


def _extract_phone(data: dict) -> str:
    """Extract and normalize a phone number from a WhatsApp contact record."""
    phone = data.get("phoneNumber") or ""
    jid = data.get("id") or ""

    if not phone and "@" in str(jid):
        # Extract digits from JID (works for both @c.us and @s.whatsapp.net)
        phone = str(jid).split("@")[0]

    if phone:
        return _normalize_phone(phone)
    return ""


def ingest_indexeddb(mem: MemoryDB, profiles: list[BrowserProfile]):
    """Extract WhatsApp contacts from Chromium IndexedDB.

    Deduplicates contacts by normalized phone number — WhatsApp stores each
    contact under both @c.us and @s.whatsapp.net JIDs, which previously
    inflated the database by ~44%.
    """
    from ccl_chromium_reader import ccl_chromium_indexeddb

    # Collect all contacts first, dedup by (name, phone)
    seen: dict[tuple[str, str], dict] = {}  # (name, phone) -> {tags, value}

    for profile in profiles:
        if profile.browser in ("safari", "firefox"):
            continue

        idb_root = profile.path / "IndexedDB"
        if not idb_root.exists():
            continue

        for db_dir in sorted(idb_root.glob("*whatsapp*_0.indexeddb.leveldb")):
            blob_dir = db_dir.parent / db_dir.name.replace(".leveldb", ".blob")

            tmp_db = _copy_dir(db_dir)
            tmp_blob = _copy_dir(blob_dir) if blob_dir.exists() else None

            try:
                wrapper = ccl_chromium_indexeddb.WrappedIndexDB(
                    str(tmp_db),
                    str(tmp_blob) if tmp_blob else None,
                )

                for db_id in wrapper.database_ids:
                    try:
                        db = wrapper[db_id.name, db_id.origin]
                    except Exception:
                        continue

                    if "contact" not in db.object_store_names:
                        continue

                    for record in db["contact"].iterate_records():
                        try:
                            data = _serialize_value(record.value)
                            if not isinstance(data, dict):
                                continue

                            name = data.get("name") or data.get("pushname") or data.get("verifiedName") or ""
                            if not name:
                                continue

                            # Skip junk names
                            stripped = name.strip()
                            if not stripped or stripped == "." or stripped == "<Undefined>":
                                continue
                            # Skip emoji-only names (no alphanumeric chars)
                            if not any(c.isalnum() for c in stripped):
                                continue

                            phone = _extract_phone(data)
                            jid = data.get("id") or ""

                            tags = ["contact", "communication"]
                            if data.get("isBusiness") or data.get("isEnterprise"):
                                tags.append("work")

                            value = phone if phone else str(jid)
                            dedup_key = (name, phone if phone else str(jid))

                            if dedup_key not in seen:
                                seen[dedup_key] = {"tags": tags, "value": value}
                            else:
                                # Merge tags (e.g. one record has "work", the other doesn't)
                                for t in tags:
                                    if t not in seen[dedup_key]["tags"]:
                                        seen[dedup_key]["tags"].append(t)

                        except Exception:
                            continue

            except Exception as e:
                log.warning(f"Failed to read WhatsApp IndexedDB for {profile.browser}/{profile.name}: {e}")
            finally:
                shutil.rmtree(tmp_db.parent, ignore_errors=True)
                if tmp_blob:
                    shutil.rmtree(tmp_blob.parent, ignore_errors=True)

    # Upsert deduplicated contacts
    for (name, _phone), entry in seen.items():
        mem.upsert(f"contact:{name}", entry["value"], entry["tags"], source="whatsapp")

    # Clean up old JID-format entries (@c.us, @s.whatsapp.net) that now have normalized phone values
    old_jid_rows = mem.conn.execute("""
        SELECT id, key, value FROM memories
        WHERE source = 'whatsapp'
          AND (value LIKE '%@c.us' OR value LIKE '%@s.whatsapp.net')
          AND superseded_by IS NULL
    """).fetchall()

    cleaned = 0
    for old_id, old_key, old_value in old_jid_rows:
        # Check if a normalized version exists for the same contact name
        normalized = mem.conn.execute("""
            SELECT id FROM memories
            WHERE key = ? AND source = 'whatsapp'
              AND value NOT LIKE '%@c.us' AND value NOT LIKE '%@s.whatsapp.net'
              AND superseded_by IS NULL
            LIMIT 1
        """, (old_key,)).fetchone()
        if normalized:
            mem.conn.execute(
                "UPDATE memories SET superseded_by = ? WHERE id = ?",
                (normalized[0], old_id),
            )
            cleaned += 1
        else:
            # No normalized version — delete the junk entry entirely
            mem.conn.execute("DELETE FROM memories WHERE id = ?", (old_id,))
            cleaned += 1

    if cleaned:
        mem.conn.commit()
        log.info(f"  Cleaned {cleaned} old JID-format WhatsApp entries")

    # Also clean up junk names that slipped through previous extractions
    junk = mem.conn.execute("""
        DELETE FROM memories
        WHERE source = 'whatsapp' AND superseded_by IS NULL
          AND (value = '<Undefined>' OR key = 'contact:.' OR key = 'contact:<Undefined>')
    """).rowcount
    if junk:
        mem.conn.commit()
        log.info(f"  Deleted {junk} junk WhatsApp entries")

    log.info(f"  IndexedDB: {len(seen)} WhatsApp contacts (deduplicated)")
