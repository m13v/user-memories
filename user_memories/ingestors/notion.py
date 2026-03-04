"""Notion desktop app ingestor — extracts memories from notion.db SQLite mirror.

Tier 1 (heuristic, no LLM): workspace info, users as contacts, page titles.
Tier 2 (LLM, optional): reconstructs pages to markdown, sends to Claude for
structured memory extraction. Guarded by anthropic SDK + ANTHROPIC_API_KEY.

Sync tracking: notion_last_sync_ts in MemoryDB metadata. First run processes
50 most recent pages via LLM; incremental runs process up to 100 changed pages.
"""

import json
import logging
import os
import shutil
import sqlite3
import tempfile
from collections import deque
from pathlib import Path
from typing import Optional

from user_memories.db import MemoryDB

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
    tmp = Path(tempfile.mkdtemp(prefix="user_memories_notion_"))
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


def _extract_memories_llm(client, page_markdown: str, page_title: str) -> list[dict]:
    """Send page to Claude Sonnet for structured memory extraction."""
    prompt = f"""Extract structured memories from this Notion page. Return a JSON array of objects, each with:
- "key": one of these formats: contact:Name, project:Name, business:Topic, work:Topic, relationship:Name, product:Name, company:Name, activity:Description
- "value": the extracted information (concise, factual)
- "tags": array from: contact, work, knowledge, finance, tool

Focus on factual, reusable knowledge: people, companies, projects, decisions, relationships, skills, tools.
Skip trivial content, formatting artifacts, and meeting logistics.

Page title: {page_title}

{page_markdown[:MAX_CHARS_TO_LLM]}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text

        # Extract JSON from response (handle ```json ... ``` wrapping)
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0]
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0]

        memories = json.loads(text.strip())
        if not isinstance(memories, list):
            return []

        # Validate each memory
        valid = []
        for m in memories:
            if not isinstance(m, dict):
                continue
            key = m.get("key", "")
            value = m.get("value", "")
            tags = m.get("tags", [])
            if not key or not value:
                continue
            # Validate key prefix
            prefix = key.split(":")[0] if ":" in key else ""
            if prefix not in VALID_PREFIXES:
                continue
            # Validate tags
            tags = [t for t in tags if t in VALID_TAGS]
            if not tags:
                tags = ["knowledge"]
            valid.append({"key": key, "value": value, "tags": tags})
        return valid

    except Exception as e:
        log.warning(f"LLM extraction failed for '{page_title}': {e}")
        return []


def _ingest_pages_llm(mem: MemoryDB, conn: sqlite3.Connection,
                      since_ts: float, page_limit: int):
    """Tier 2: query changed pages, reconstruct, LLM extract, upsert."""
    try:
        import anthropic
    except ImportError:
        log.warning("anthropic SDK not installed — skipping Tier 2")
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        log.warning("ANTHROPIC_API_KEY not set — skipping Tier 2")
        return

    client = anthropic.Anthropic()

    # Query pages changed since high-water mark
    rows = conn.execute(
        "SELECT id, type, properties, last_edited_time FROM block "
        "WHERE type IN ('page', 'transcription') AND alive = 1 "
        "AND properties IS NOT NULL AND last_edited_time > ? "
        "ORDER BY last_edited_time DESC LIMIT ?",
        (since_ts, page_limit),
    ).fetchall()

    if not rows:
        log.info("Notion Tier 2: no changed pages to process")
        return

    log.info(f"Notion Tier 2: processing {len(rows)} changed pages via LLM")
    total_memories = 0

    for row in rows:
        title = _extract_title(row["properties"])
        if not title or len(title) < 3:
            continue

        page_md = _reconstruct_page(conn, row["id"], title)
        if len(page_md) < 50:
            continue

        source = "notion:transcription" if row["type"] == "transcription" else "notion:page"
        memories = _extract_memories_llm(client, page_md, title)

        for m in memories:
            mem.upsert(
                m["key"],
                m["value"],
                tags=m["tags"],
                source=source,
            )
            total_memories += 1

    log.info(f"Notion Tier 2: extracted {total_memories} memories from {len(rows)} pages")


def ingest_notion(mem: MemoryDB, skip_llm: bool = False):
    """Main entry point. Copies DB, runs Tier 1 + optional Tier 2, updates high-water mark."""
    tmp = _copy_notion_db()
    if not tmp:
        log.warning("Notion DB not found — skipping Notion ingestor")
        return

    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        # Read high-water mark
        since_ts = float(mem.get_meta("notion_last_sync_ts") or "0")
        is_first_run = since_ts == 0

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

        # Tier 2: LLM extraction (optional)
        if not skip_llm:
            page_limit = 50 if is_first_run else 100
            _ingest_pages_llm(mem, conn, since_ts, page_limit)

        # Update high-water mark
        if new_ts:
            mem.set_meta("notion_last_sync_ts", str(new_ts))

        conn.close()
    except Exception as e:
        log.warning(f"Notion ingestor error: {e}")
        raise
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)
