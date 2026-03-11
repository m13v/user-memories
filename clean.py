#!/usr/bin/env python3
"""Programmatic cleanup of memories.db — rule-based, no LLM required.

Rules:
1. Delete autofill:* and address_type_* keys (noise/duplicate keys)
2. Delete superseded entries
3. Fix single-value key chains (pick winner by appeared_count)
4. Deduplicate phones (normalize, keep highest appeared_count)
5. Deduplicate emails (lowercase, keep highest appeared_count)
6. Delete known noise patterns (feliciti flood, etc.)
7. Mark everything touched as reviewed
"""

import re
import sys
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("clean")

sys.path.insert(0, "/Users/matthewdi/user-memories")
from user_memories import MemoryDB

DB_PATH = "/Users/matthewdi/user-memories/memories.db"

SINGLE_VALUE_KEYS = ["first_name", "last_name", "full_name", "card_holder_name"]

NOISE_VALUE_PATTERNS = [
    r"^application\.from\.feliciti\.co",  # feliciti housing app flood
]

NOISE_WORDS = {
    "test", "asdf", "qwerty", "foo", "bar", "baz", "placeholder",
    "technical placeholder just to pay",
    "wegs sdg", "sdgsdg",  # keyboard mash garbage
    "mediar inc", "mediar, inc.", "mediar",  # company name in card holder field
    "omi",  # product name in name field
}

# Known garbage address field combinations (city + state that don't match real location)
# Keep only entries where city/state are consistent with San Francisco, CA
KNOWN_CITIES = {"san francisco", "sf"}
KNOWN_STATES = {"california", "ca"}
KNOWN_ZIPS = {"94102", "94103", "94105", "94107", "94109", "94110", "94111",
              "94114", "94115", "94117", "94118", "94121", "94122", "94123",
              "94124", "94127", "94129", "94130", "94131", "94132", "94133",
              "94134"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_phone(phone: str) -> str | None:
    """Normalize phone to digits only, return None if not a valid US/intl number."""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("1") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10:
        return digits
    return None


def normalize_email(email: str) -> str:
    return email.strip().lower()


def run_cleanup(db_path: str = DB_PATH, dry_run: bool = False):
    mem = MemoryDB(db_path)
    conn = mem.conn
    now = now_iso()

    stats = {
        "autofill_deleted": 0,
        "address_type_deleted": 0,
        "superseded_deleted": 0,
        "single_value_fixed": 0,
        "phone_deduped": 0,
        "email_deduped": 0,
        "noise_pattern_deleted": 0,
        "marked_reviewed": 0,
    }

    def delete_id(mid):
        if not dry_run:
            mem.delete(mid)

    def mark_reviewed(ids):
        if not dry_run and ids:
            mem.mark_reviewed(ids)
        stats["marked_reviewed"] += len(ids)

    # ── 1. Delete autofill:* keys ──────────────────────────────────
    autofill_ids = [r[0] for r in conn.execute(
        "SELECT id FROM memories WHERE key LIKE 'autofill:%'"
    ).fetchall()]
    for mid in autofill_ids:
        delete_id(mid)
    stats["autofill_deleted"] = len(autofill_ids)
    log.info(f"Deleted {len(autofill_ids)} autofill:* entries")

    # ── 2. Delete address_type_* keys ─────────────────────────────
    addr_type_ids = [r[0] for r in conn.execute(
        "SELECT id FROM memories WHERE key LIKE 'address_type_%'"
    ).fetchall()]
    for mid in addr_type_ids:
        delete_id(mid)
    stats["address_type_deleted"] = len(addr_type_ids)
    log.info(f"Deleted {len(addr_type_ids)} address_type_* entries")

    # ── 3. Fix single-value key chains ────────────────────────────
    # Must run BEFORE deleting superseded entries, so we can see the full chain
    # (including superseded entries like "Matthew Diakonov") to pick the best winner.
    for key in SINGLE_VALUE_KEYS:
        rows = conn.execute(
            "SELECT id, value, appeared_count FROM memories WHERE key=? ORDER BY appeared_count DESC",
            (key,)
        ).fetchall()

        if not rows:
            continue

        # Filter out obvious garbage to find the real winner
        good = [(r[0], r[1], r[2]) for r in rows
                if r[1].lower() not in NOISE_WORDS
                and "_" not in r[1]
                and len(r[1]) > 2
                and not r[1].isdigit()]

        if good:
            winner_id = good[0][0]
            winner_val = good[0][1]
        else:
            winner_id = rows[0][0]
            winner_val = rows[0][1]

        # Unsupersede the winner, delete everything else
        if not dry_run:
            conn.execute(
                "UPDATE memories SET superseded_by=NULL, superseded_at=NULL WHERE id=?",
                (winner_id,)
            )
        losers = [r[0] for r in rows if r[0] != winner_id]
        for mid in losers:
            delete_id(mid)
            stats["single_value_fixed"] += 1

        if losers:
            log.info(f"  {key}: winner='{winner_val}' (deleted {len(losers)} others)")

    if not dry_run:
        conn.commit()

    # ── 4. Delete remaining superseded entries ────────────────────
    superseded_ids = [r[0] for r in conn.execute(
        "SELECT id FROM memories WHERE superseded_by IS NOT NULL"
    ).fetchall()]
    for mid in superseded_ids:
        delete_id(mid)
    stats["superseded_deleted"] = len(superseded_ids)
    log.info(f"Deleted {len(superseded_ids)} superseded entries")

    # ── 5. Deduplicate phones ─────────────────────────────────────
    phone_rows = conn.execute(
        "SELECT id, value, appeared_count FROM memories WHERE key='phone' AND superseded_by IS NULL"
    ).fetchall()

    groups: dict[str, list] = {}
    for mid, val, count in phone_rows:
        norm = normalize_phone(val)
        if norm:
            groups.setdefault(norm, []).append((mid, val, count))
        # phones that can't be normalized: leave alone

    for norm, entries in groups.items():
        if len(entries) <= 1:
            continue
        entries.sort(key=lambda x: -x[2])  # sort by appeared_count desc
        winner_id = entries[0][0]
        for mid, val, _ in entries[1:]:
            delete_id(mid)
            stats["phone_deduped"] += 1
        log.info(f"  phone {norm}: kept id={winner_id}, deleted {len(entries)-1} duplicates")

    # ── 6. Deduplicate emails ─────────────────────────────────────
    email_rows = conn.execute(
        "SELECT id, value, appeared_count FROM memories WHERE key='email' AND superseded_by IS NULL"
    ).fetchall()

    email_groups: dict[str, list] = {}
    for mid, val, count in email_rows:
        norm = normalize_email(val)
        email_groups.setdefault(norm, []).append((mid, val, count))

    for norm, entries in email_groups.items():
        if len(entries) <= 1:
            continue
        entries.sort(key=lambda x: -x[2])
        winner_id = entries[0][0]
        for mid, val, _ in entries[1:]:
            delete_id(mid)
            stats["email_deduped"] += 1
        log.info(f"  email {norm}: kept id={winner_id}, deleted {len(entries)-1} duplicates")

    # ── 7. Delete known noise patterns ────────────────────────────
    all_rows = conn.execute(
        "SELECT id, value FROM memories WHERE superseded_by IS NULL"
    ).fetchall()

    for mid, val in all_rows:
        for pattern in NOISE_VALUE_PATTERNS:
            if re.search(pattern, val, re.IGNORECASE):
                delete_id(mid)
                stats["noise_pattern_deleted"] += 1
                break

    if not dry_run:
        conn.commit()

    # ── 8. Clean up bad address entries ──────────────────────────
    # Delete city/state/zip entries that don't match known SF location
    city_rows = conn.execute(
        "SELECT id, value FROM memories WHERE key='city' AND superseded_by IS NULL"
    ).fetchall()
    for mid, val in city_rows:
        if val.lower().strip() not in KNOWN_CITIES:
            delete_id(mid)
            stats.setdefault("address_noise_deleted", 0)
            stats["address_noise_deleted"] += 1

    state_rows = conn.execute(
        "SELECT id, value FROM memories WHERE key='state' AND superseded_by IS NULL"
    ).fetchall()
    for mid, val in state_rows:
        if val.lower().strip() not in KNOWN_STATES:
            delete_id(mid)
            stats.setdefault("address_noise_deleted", 0)
            stats["address_noise_deleted"] += 1

    zip_rows = conn.execute(
        "SELECT id, value FROM memories WHERE key='zip' AND superseded_by IS NULL"
    ).fetchall()
    for mid, val in zip_rows:
        if val.strip() not in KNOWN_ZIPS:
            delete_id(mid)
            stats.setdefault("address_noise_deleted", 0)
            stats["address_noise_deleted"] += 1

    if not dry_run:
        conn.commit()
    log.info(f"Deleted {stats.get('address_noise_deleted', 0)} bad address entries")

    # ── 9. Mark all remaining non-superseded as reviewed ─────────
    unreviewed_ids = [r[0] for r in conn.execute(
        "SELECT id FROM memories WHERE reviewed_at IS NULL AND superseded_by IS NULL"
    ).fetchall()]
    mark_reviewed(unreviewed_ids)

    if not dry_run:
        conn.commit()

    # ── Report ────────────────────────────────────────────────────
    final_stats = mem.stats()
    log.info("\n── Cleanup complete ──────────────────────────────────")
    log.info(f"  autofill:* deleted:      {stats['autofill_deleted']}")
    log.info(f"  address_type_* deleted:  {stats['address_type_deleted']}")
    log.info(f"  superseded deleted:      {stats['superseded_deleted']}")
    log.info(f"  single-value fixed:      {stats['single_value_fixed']}")
    log.info(f"  phone dupes removed:     {stats['phone_deduped']}")
    log.info(f"  email dupes removed:     {stats['email_deduped']}")
    log.info(f"  noise patterns deleted:  {stats['noise_pattern_deleted']}")
    log.info(f"  address noise deleted:   {stats.get('address_noise_deleted', 0)}")
    log.info(f"  marked reviewed:         {stats['marked_reviewed']}")
    log.info(f"\n  Final DB: {final_stats['total_memories']} memories")
    log.info(f"  Unreviewed remaining: {conn.execute('SELECT COUNT(*) FROM memories WHERE reviewed_at IS NULL').fetchone()[0]}")
    log.info("\n── Profile after cleanup ─────────────────────────────")
    print(mem.profile_text())

    mem.close()
    return stats


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Rule-based cleanup of memories.db")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without changing anything")
    parser.add_argument("--db", default=DB_PATH, help="Path to memories.db")
    args = parser.parse_args()

    if args.dry_run:
        log.info("DRY RUN — no changes will be made")

    run_cleanup(db_path=args.db, dry_run=args.dry_run)
