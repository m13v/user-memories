"""Orchestrate memory extraction from all browser sources."""

import logging
from typing import Optional, Set

from user_memories.db import MemoryDB
from user_memories.ingestors.browser_detect import detect_browsers
from user_memories.ingestors.webdata import ingest_webdata
from user_memories.ingestors.history import ingest_history
from user_memories.ingestors.logins import ingest_logins
from user_memories.ingestors.bookmarks import ingest_bookmarks

log = logging.getLogger(__name__)


def extract_memories(memories_db_path: str = "memories.db",
                     browsers: Optional[Set[str]] = None,
                     skip_indexeddb: bool = False,
                     skip_localstorage: bool = False,
                     skip_notion: bool = False,
                     skip_notion_llm: bool = False) -> MemoryDB:
    """Build the memories database directly from browser files.

    Args:
        memories_db_path: Output database path.
        browsers: Set of browser names to scan (None = all).
        skip_indexeddb: Skip IndexedDB extraction (requires ccl_chromium_reader).
        skip_localstorage: Skip Local Storage extraction (requires ccl_chromium_reader).
    """
    mem = MemoryDB(memories_db_path)
    profiles = detect_browsers(allowed=browsers)
    log.info(f"Extracting memories from {len(profiles)} profiles...")

    # 1. Web Data (autofill, addresses, credit cards) — reads browser files directly
    ingest_webdata(mem)

    # 2. History → tool/service usage
    ingest_history(mem, profiles)

    # 3. Bookmarks → interests + tool boosts
    ingest_bookmarks(mem, profiles)

    # 4. Logins → accounts + emails
    ingest_logins(mem, profiles)

    # 5. IndexedDB → WhatsApp contacts
    if not skip_indexeddb:
        try:
            from user_memories.ingestors.indexeddb import ingest_indexeddb
            ingest_indexeddb(mem, profiles)
        except ImportError:
            log.warning("ccl_chromium_reader not installed — skipping IndexedDB")

    # 6. Local Storage → LinkedIn connections
    if not skip_localstorage:
        try:
            from user_memories.ingestors.localstorage import ingest_localstorage
            ingest_localstorage(mem, profiles)
        except ImportError:
            log.warning("ccl_chromium_reader not installed — skipping Local Storage")

    # 7. Notion → workspace contacts, page knowledge, meeting summaries
    if not skip_notion:
        try:
            from user_memories.ingestors.notion import ingest_notion
            ingest_notion(mem, skip_llm=skip_notion_llm)
        except Exception as e:
            log.warning(f"Notion ingestor failed: {e}")

    mem.conn.commit()
    stats = mem.stats()
    log.info(
        f"Memories: {stats['total_memories']} total, "
        f"tags: {', '.join(f'{t}={c}' for t, c in list(stats['by_tag'].items())[:10])}"
    )
    return mem
