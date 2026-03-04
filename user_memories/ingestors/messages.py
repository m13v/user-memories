"""Store and query decrypted WhatsApp messages."""

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from user_memories.db import MemoryDB

log = logging.getLogger(__name__)

MESSAGES_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    sender_name TEXT,
    text TEXT NOT NULL,
    captured_at TEXT,
    source TEXT DEFAULT 'whatsapp'
);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_captured ON messages(captured_at);
"""


def _ensure_table(conn: sqlite3.Connection):
    """Create messages table if it doesn't exist."""
    conn.executescript(MESSAGES_SCHEMA)


def _resolve_sender(mem: MemoryDB, sender_jid: Optional[str]) -> Optional[str]:
    """Look up contact name from sender JID using existing memories."""
    if not sender_jid:
        return None
    phone = sender_jid.split("@")[0]
    if not phone.startswith("+") and len(phone) > 5:
        phone = "+" + phone

    # Search for contact:* memories with this phone number as value
    try:
        row = mem.conn.execute(
            "SELECT key FROM memories WHERE key LIKE 'contact:%' AND value LIKE ? AND superseded_by IS NULL LIMIT 1",
            (f"%{sender_jid.split('@')[0]}%",)
        ).fetchone()
        if row:
            return row[0].replace("contact:", "")
    except Exception:
        pass
    return None


def ingest_messages(mem: MemoryDB, messages: list[dict]) -> int:
    """Store decrypted messages into the messages table, deduplicating.

    Args:
        mem: MemoryDB instance (uses its connection).
        messages: List of dicts with keys: text, sender (JID or None), ts (epoch ms).

    Returns:
        Number of new messages inserted.
    """
    _ensure_table(mem.conn)
    now = datetime.now(timezone.utc).isoformat()

    # Deduplicate against existing messages
    existing = set()
    try:
        for row in mem.conn.execute("SELECT sender, substr(text, 1, 100) FROM messages"):
            existing.add((row[0], row[1]))
    except sqlite3.OperationalError:
        pass

    inserted = 0
    for m in messages:
        text = m.get("text", "").strip()
        if not text:
            continue

        sender = m.get("sender")
        dedup_key = (sender, text[:100])
        if dedup_key in existing:
            continue
        existing.add(dedup_key)

        # Fix mojibake (Latin-1 encoded UTF-8)
        try:
            text = text.encode("latin-1").decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            pass

        sender_name = _resolve_sender(mem, sender)
        ts = m.get("ts")
        captured_at = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat() if ts else now

        mem.conn.execute(
            "INSERT INTO messages (sender, sender_name, text, captured_at, source) VALUES (?, ?, ?, ?, ?)",
            (sender, sender_name, text, captured_at, "whatsapp"),
        )
        inserted += 1

    mem.conn.commit()
    log.info(f"  Messages: {inserted} new, {len(existing)} total")
    return inserted


def get_messages(mem: MemoryDB, sender: Optional[str] = None,
                 search: Optional[str] = None, limit: int = 100) -> list[dict]:
    """Query stored messages.

    Args:
        sender: Filter by sender JID or name.
        search: Full-text search in message text.
        limit: Max results.
    """
    _ensure_table(mem.conn)

    query = "SELECT id, sender, sender_name, text, captured_at, source FROM messages WHERE 1=1"
    params = []

    if sender:
        query += " AND (sender LIKE ? OR sender_name LIKE ?)"
        params.extend([f"%{sender}%", f"%{sender}%"])

    if search:
        query += " AND text LIKE ?"
        params.append(f"%{search}%")

    query += " ORDER BY captured_at DESC LIMIT ?"
    params.append(limit)

    rows = mem.conn.execute(query, params).fetchall()
    return [
        {"id": r[0], "sender": r[1], "sender_name": r[2],
         "text": r[3], "captured_at": r[4], "source": r[5]}
        for r in rows
    ]


def message_stats(mem: MemoryDB) -> dict:
    """Get message statistics."""
    _ensure_table(mem.conn)
    total = mem.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    senders = mem.conn.execute(
        "SELECT COALESCE(sender_name, sender, 'unknown'), COUNT(*) FROM messages "
        "GROUP BY COALESCE(sender_name, sender, 'unknown') ORDER BY COUNT(*) DESC LIMIT 20"
    ).fetchall()
    return {
        "total_messages": total,
        "top_senders": {r[0]: r[1] for r in senders},
    }
