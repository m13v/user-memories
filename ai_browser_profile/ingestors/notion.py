"""Notion desktop app ingestor — extracts memories from notion.db SQLite mirror.

Tier 1 (heuristic, no LLM): workspace info, users as contacts, page titles.
Tier 2 (LLM via claude -p): handled by run.sh, uses dump_changed_pages() to
reconstruct pages and pass to a Claude Code session for extraction.

Sync tracking: notion_last_sync_ts in MemoryDB metadata.
"""

import json
import logging
import shutil
import sqlite3
import tempfile
from collections import deque
from pathlib import Path
from typing import Optional

from ai_browser_profile.db import MemoryDB

log = logging.getLogger(__name__)

NOTION_DB = Path.home() / "Library" / "Application Support" / "Notion" / "notion.db"

# Block type → markdown prefix mapping
BLOCK_MD = {
    "header": "#",
    "sub_header": "##",
    "sub_sub_header": "###",
    "bulleted_list": "-",
    "numbered_list": "1.",
    "to_do": "- [ ]",
    "quote": ">",
    "callout": ">",
    "toggle": "-",
    "text": "",
    "code": "```",
}

# Block types to skip entirely
SKIP_TYPES = {
    "page", "collection_view_page", "collection_view",
    "image", "video", "bookmark", "divider", "table_of_contents",
    "column_list", "column", "table", "table_row",
    "external_object_instance", "ai_block", "personal_home_page",
}

# Valid key prefixes for LLM extraction
VALID_PREFIXES = {
    "contact", "project", "business", "work",
    "relationship", "product", "company", "activity",
}

# Valid tags for LLM extraction
VALID_TAGS = {"contact", "work", "knowledge", "finance", "tool"}

MAX_BLOCKS_PER_PAGE = 500
MAX_CHARS_TO_LLM = 8000


def _copy_notion_db() -> Optional[Path]:
    """Copy notion.db + WAL/SHM to temp dir (same pattern as copy_db)."""
    if not NOTION_DB.exists():
        return None
    tmp = Path(tempfile.mkdtemp(prefix="ai_browser_profile_notion_"))
    dst = tmp / NOTION_DB.name
    shutil.copy2(NOTION_DB, dst)
    for suffix in ["-wal", "-shm"]:
        wal = NOTION_DB.parent / (NOTION_DB.name + suffix)
        if wal.exists():
            shutil.copy2(wal, tmp / (NOTION_DB.name + suffix))
    return dst


def _extract_title(properties_json: Optional[str]) -> str:
    """Parse Notion rich-text title from properties JSON.

    Format: {"title": [["plain text"], ["bold text", [["b"]]], ...]}
    """
    if not properties_json:
        return ""
    try:
        props = json.loads(properties_json)
    except (json.JSONDecodeError, TypeError):
        return ""
    title_parts = props.get("title", [])
    if not title_parts:
        return ""
    segments = []
    for part in title_parts:
        if isinstance(part, list) and len(part) >= 1 and isinstance(part[0], str):
            segments.append(part[0])
    return "".join(segments).strip()


def _block_to_markdown(block_type: str, properties_json: Optional[str], depth: int = 0) -> Optional[str]:
    """Convert a single block to a markdown line."""
    if block_type in SKIP_TYPES:
        return None

    title = _extract_title(properties_json)
    if not title:
        return None

    prefix = BLOCK_MD.get(block_type, "")
    indent = "  " * depth

    # Handle to_do checked state
    if block_type == "to_do":
        try:
            props = json.loads(properties_json) if properties_json else {}
            checked = props.get("checked", [])
            if checked and checked[0][0] == "Yes":
                prefix = "- [x]"
        except (json.JSONDecodeError, TypeError, IndexError):
            pass

    # Handle code blocks
    if block_type == "code":
        return f"{indent}```\n{indent}{title}\n{indent}```"

    if prefix:
        return f"{indent}{prefix} {title}"
    return f"{indent}{title}"


def _reconstruct_page(conn: sqlite3.Connection, page_id: str, page_title: str) -> str:
    """BFS walk child blocks via parent_id, assemble markdown. Cap at MAX_BLOCKS_PER_PAGE."""
    lines = [f"# {page_title}", ""]

    # BFS: queue of (block_id, depth)
    queue = deque()
    block_count = 0

    # Get direct children of the page
    rows = conn.execute(
        "SELECT id, type, properties FROM block "
        "WHERE parent_id = ? AND alive = 1 ORDER BY rowid",
        (page_id,)
    ).fetchall()

    for row in rows:
        queue.append((row["id"], row["type"], row["properties"], 0))

    while queue and block_count < MAX_BLOCKS_PER_PAGE:
        block_id, btype, props, depth = queue.popleft()
        block_count += 1

        md_line = _block_to_markdown(btype, props, depth)
        if md_line:
            lines.append(md_line)

        # Add children to queue
        children = conn.execute(
            "SELECT id, type, properties FROM block "
            "WHERE parent_id = ? AND alive = 1 ORDER BY rowid",
            (block_id,)
        ).fetchall()
        for child in children:
            queue.append((child["id"], child["type"], child["properties"], depth + 1))

    return "\n".join(lines)


def _ingest_workspace(mem: MemoryDB, conn: sqlite3.Connection) -> int:
    """Tier 1: space table → company: memories."""
    count = 0
    for row in conn.execute("SELECT name FROM space WHERE name IS NOT NULL AND name != ''"):
        mem.upsert(
            f"company:notion_workspace",
            row["name"],
            tags=["work"],
            source="notion:workspace",
        )
        count += 1
    return count


def _ingest_users(mem: MemoryDB, conn: sqlite3.Connection) -> int:
    """Tier 1: notion_user → contact:Name memories."""
    count = 0
    for row in conn.execute(
        "SELECT name, email, given_name, family_name FROM notion_user "
        "WHERE name IS NOT NULL AND name != '' AND email IS NOT NULL AND email != ''"
    ):
        name = row["name"].strip()
        email = row["email"].strip()
        if not name or not email:
            continue
        mem.upsert(
            f"contact:{name}",
            email,
            tags=["contact", "work"],
            source="notion:user",
        )
        count += 1
    return count


def _ingest_page_titles(mem: MemoryDB, conn: sqlite3.Connection) -> int:
    """Tier 1: page/transcription titles → project:/activity: memories."""
    count = 0
    for row in conn.execute(
        "SELECT id, type, properties FROM block "
        "WHERE type IN ('page', 'transcription') AND alive = 1 "
        "AND properties IS NOT NULL AND parent_table = 'space'"
    ):
        title = _extract_title(row["properties"])
        if not title or len(title) < 3:
            continue

        if row["type"] == "transcription":
            mem.upsert(
                f"activity:meeting:{title[:80]}",
                title,
                tags=["work", "contact"],
                source="notion:transcription",
            )
        else:
            mem.upsert(
                f"project:{title[:80]}",
                title,
                tags=["work", "knowledge"],
                source="notion:page",
            )
        count += 1
    return count


def dump_changed_pages(mem: MemoryDB, limit: int = 50, min_blocks: int = 5) -> str:
    """Reconstruct changed Notion pages as markdown for LLM extraction.

    Returns concatenated markdown of pages changed since last sync,
    filtered to pages with at least min_blocks child blocks.
    Used by run.sh to pass content to a claude -p session.
    """
    tmp = _copy_notion_db()
    if not tmp:
        return ""

    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        since_ts = float(mem.get_meta("notion_last_sync_ts") or "0")

        rows = conn.execute(
            "SELECT id, type, properties, last_edited_time FROM block "
            "WHERE type IN ('page', 'transcription') AND alive = 1 "
            "AND properties IS NOT NULL AND last_edited_time > ? "
            "ORDER BY last_edited_time DESC LIMIT ?",
            (since_ts, limit * 3),  # fetch extra to filter by block count
        ).fetchall()

        pages = []
        for row in rows:
            title = _extract_title(row["properties"])
            if not title or len(title) < 3:
                continue
            child_count = conn.execute(
                "SELECT COUNT(*) FROM block WHERE parent_id = ? AND alive = 1",
                (row["id"],)
            ).fetchone()[0]
            if child_count < min_blocks:
                continue
            page_md = _reconstruct_page(conn, row["id"], title)
            if len(page_md) > 50:
                pages.append(page_md[:MAX_CHARS_TO_LLM])
            if len(pages) >= limit:
                break

        conn.close()
        return "\n\n---\n\n".join(pages)
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)


def ingest_notion(mem: MemoryDB):
    """Main entry point. Copies DB, runs Tier 1, updates high-water mark."""
    tmp = _copy_notion_db()
    if not tmp:
        log.warning("Notion DB not found — skipping Notion ingestor")
        return

    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        # Get max last_edited_time for new high-water mark
        row = conn.execute(
            "SELECT MAX(last_edited_time) as max_ts FROM block"
        ).fetchone()
        new_ts = row["max_ts"] if row and row["max_ts"] else 0

        # Tier 1: always runs
        ws_count = _ingest_workspace(mem, conn)
        user_count = _ingest_users(mem, conn)
        title_count = _ingest_page_titles(mem, conn)
        log.info(
            f"Notion Tier 1: {ws_count} workspaces, {user_count} users, "
            f"{title_count} page titles"
        )

        # Update high-water mark
        if new_ts:
            mem.set_meta("notion_last_sync_ts", str(new_ts))

        conn.close()
    except Exception as e:
        log.warning(f"Notion ingestor error: {e}")
        raise
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)
