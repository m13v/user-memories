#!/usr/bin/env python3
"""CLI entry point for ai-browser-profile extraction."""

import argparse
import logging

from ai_browser_profile import extract_memories
from clean import run_cleanup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("extract")


def main():
    parser = argparse.ArgumentParser(description="Extract user memories from browser data")
    parser.add_argument("--output", "-o", default="memories.db",
                        help="Output memories database path (default: memories.db)")
    parser.add_argument("--browsers", nargs="*",
                        help="Only scan specific browsers (arc, chrome, safari, firefox, brave, edge)")
    parser.add_argument("--no-indexeddb", action="store_true",
                        help="Skip IndexedDB extraction (WhatsApp contacts)")
    parser.add_argument("--no-localstorage", action="store_true",
                        help="Skip Local Storage extraction (LinkedIn connections)")
    parser.add_argument("--no-notion", action="store_true",
                        help="Skip Notion extraction (workspace, users, pages)")
    parser.add_argument("--no-clean", action="store_true",
                        help="Skip auto-cleanup after extraction")
    args = parser.parse_args()

    browsers = set(b.lower() for b in args.browsers) if args.browsers else None

    mem = extract_memories(
        memories_db_path=args.output,
        browsers=browsers,
        skip_indexeddb=args.no_indexeddb,
        skip_localstorage=args.no_localstorage,
        skip_notion=args.no_notion,
    )
    stats = mem.stats()
    log.info(f"Extraction done — {stats['total_memories']} memories in {args.output}")
    mem.close()

    if not args.no_clean:
        log.info("Running auto-cleanup...")
        run_cleanup(db_path=args.output)


if __name__ == "__main__":
    main()
