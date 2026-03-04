"""MemoryDB — schema, upsert, search, mark_accessed, stats, profile, text_search."""

import sqlite3
from datetime import datetime, timezone
from typing import Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    source TEXT,
    appeared_count INTEGER DEFAULT 0,
    accessed_count INTEGER DEFAULT 0,
    created_at TEXT,
    last_appeared_at TEXT,
    last_accessed_at TEXT,
    superseded_by INTEGER REFERENCES memories(id),
    superseded_at TEXT,
    search_text TEXT,
    UNIQUE(key, value)
);

CREATE TABLE IF NOT EXISTS memory_tags (
    memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (memory_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags ON memory_tags(tag);

CREATE TABLE IF NOT EXISTS memory_links (
    source_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
    relation TEXT NOT NULL,
    created_at TEXT,
    PRIMARY KEY (source_id, target_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_links_source ON memory_links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON memory_links(target_id);

CREATE INDEX IF NOT EXISTS idx_search_text ON memories(search_text);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

SINGLE_VALUE_KEYS = {
    "first_name", "last_name", "full_name", "email", "phone",
    "company", "street_address", "address_line_2", "city",
    "state", "zip", "country", "card_holder_name",
}

STALE_DAYS = {
    "identity": 1095, "address": 730, "payment": 365,
    "contact": 365, "account": 365, "tool": 180,
    "social": 365, "communication": 365,
}
DEFAULT_STALE_DAYS = 365

TAG_SECTIONS = {
    "identity": ["first_name", "last_name", "full_name", "email", "phone"],
    "address": ["street_address", "address_line_2", "city", "state", "zip", "country"],
    "payment": ["card_holder_name"],
    "work": ["company"],
}


class MemoryDB:
    def __init__(self, path: str = "memories.db"):
        self.path = path
        self.conn = sqlite3.connect(path)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)
        self._migrate()

    # ── Migration ──────────────────────────────────────────────────

    def _migrate(self):
        """Add new columns/tables to existing DBs."""
        cols = {r[1] for r in self.conn.execute("PRAGMA table_info(memories)").fetchall()}
        if "superseded_by" not in cols:
            self.conn.execute("ALTER TABLE memories ADD COLUMN superseded_by INTEGER REFERENCES memories(id)")
        if "superseded_at" not in cols:
            self.conn.execute("ALTER TABLE memories ADD COLUMN superseded_at TEXT")
        if "search_text" not in cols:
            self.conn.execute("ALTER TABLE memories ADD COLUMN search_text TEXT")
            self.conn.execute("UPDATE memories SET search_text = key || ': ' || value WHERE search_text IS NULL")
            self.conn.commit()
        if "reviewed_at" not in cols:
            self.conn.execute("ALTER TABLE memories ADD COLUMN reviewed_at TEXT")

    # ── Upsert ─────────────────────────────────────────────────────

    def upsert(self, key: str, value: str, tags: list[str],
               confidence: float = 0.5, source: str = ""):
        """Insert or update a memory. Handles supersession for single-value keys."""
        if not value or not value.strip():
            return
        value = value.strip()
        now = datetime.now(timezone.utc).isoformat()
        search_text = f"{key}: {value}"

        existing = self.conn.execute(
            "SELECT id, confidence, source FROM memories WHERE key=? AND value=?",
            (key, value),
        ).fetchone()

        if existing:
            mem_id, old_conf, old_source = existing
            new_conf = old_conf
            if source and old_source and source not in old_source:
                new_conf = min(1.0, old_conf + 0.1)
                source = f"{old_source}, {source}"
            self.conn.execute(
                "UPDATE memories SET confidence=?, source=?, search_text=? WHERE id=?",
                (new_conf, source, search_text, mem_id),
            )
        else:
            # Supersession: for single-value keys, supersede old value if new confidence >= old
            if key in SINGLE_VALUE_KEYS:
                old_row = self.conn.execute(
                    "SELECT id, confidence FROM memories WHERE key=? AND superseded_by IS NULL",
                    (key,),
                ).fetchone()
                if old_row and old_row[1] <= confidence:
                    # Insert new, then supersede old
                    cursor = self.conn.execute(
                        "INSERT INTO memories (key, value, confidence, source, created_at, search_text) VALUES (?, ?, ?, ?, ?, ?)",
                        (key, value, confidence, source, now, search_text),
                    )
                    mem_id = cursor.lastrowid
                    self.conn.execute(
                        "UPDATE memories SET superseded_by=?, superseded_at=? WHERE id=?",
                        (mem_id, now, old_row[0]),
                    )
                else:
                    cursor = self.conn.execute(
                        "INSERT INTO memories (key, value, confidence, source, created_at, search_text) VALUES (?, ?, ?, ?, ?, ?)",
                        (key, value, confidence, source, now, search_text),
                    )
                    mem_id = cursor.lastrowid
            else:
                cursor = self.conn.execute(
                    "INSERT INTO memories (key, value, confidence, source, created_at, search_text) VALUES (?, ?, ?, ?, ?, ?)",
                    (key, value, confidence, source, now, search_text),
                )
                mem_id = cursor.lastrowid

        for tag in tags:
            self.conn.execute(
                "INSERT OR IGNORE INTO memory_tags (memory_id, tag) VALUES (?, ?)",
                (mem_id, tag),
            )

        self._auto_link(mem_id, key, value)
        return mem_id

    # ── Search ─────────────────────────────────────────────────────

    def search(self, tags: list[str], limit: int = 20,
               include_superseded: bool = False) -> list[dict]:
        """Search memories by tags, ranked with staleness decay applied."""
        placeholders = ",".join("?" for _ in tags)
        superseded_filter = "" if include_superseded else "AND m.superseded_by IS NULL"
        rows = self.conn.execute(f"""
            SELECT DISTINCT m.id, m.key, m.value, m.confidence, m.source,
                   m.appeared_count, m.accessed_count,
                   m.last_appeared_at, m.last_accessed_at, m.created_at,
                   CASE WHEN m.appeared_count = 0 THEN 0.0
                        ELSE CAST(m.accessed_count AS REAL) / m.appeared_count
                   END AS hit_rate
            FROM memories m
            JOIN memory_tags t ON m.id = t.memory_id
            WHERE t.tag IN ({placeholders}) {superseded_filter}
            ORDER BY hit_rate DESC, m.accessed_count DESC, m.confidence DESC
            LIMIT ?
        """, (*tags, limit)).fetchall()

        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()

        # Compute effective confidence with staleness decay
        results = []
        for r in rows:
            mem_id = r[0]
            raw_conf = r[3]
            last_seen = r[7] or r[9]  # last_appeared_at or created_at
            eff_conf = self._apply_decay(mem_id, raw_conf, last_seen, now_dt)
            results.append({
                "id": mem_id, "key": r[1], "value": r[2],
                "confidence": raw_conf, "effective_confidence": eff_conf,
                "source": r[4], "appeared_count": r[5] + 1,
                "accessed_count": r[6], "hit_rate": r[10],
            })

        # Re-sort by effective confidence (preserving hit_rate as primary)
        results.sort(key=lambda x: (x["hit_rate"], x["effective_confidence"]), reverse=True)

        ids = [r["id"] for r in results]
        if ids:
            id_placeholders = ",".join("?" for _ in ids)
            self.conn.execute(
                f"UPDATE memories SET appeared_count = appeared_count + 1, last_appeared_at = ? WHERE id IN ({id_placeholders})",
                (now, *ids),
            )
            self.conn.commit()

        return results

    def _apply_decay(self, mem_id: int, confidence: float,
                     last_seen: Optional[str], now_dt: datetime) -> float:
        """Compute effective confidence with staleness decay."""
        if not last_seen:
            return confidence
        try:
            seen_dt = datetime.fromisoformat(last_seen)
        except (ValueError, TypeError):
            return confidence
        days_old = (now_dt - seen_dt).total_seconds() / 86400
        # Get minimum stale_days from this memory's tags
        tag_rows = self.conn.execute(
            "SELECT tag FROM memory_tags WHERE memory_id=?", (mem_id,)
        ).fetchall()
        stale_days = DEFAULT_STALE_DAYS
        for (tag,) in tag_rows:
            if tag in STALE_DAYS:
                stale_days = min(stale_days, STALE_DAYS[tag])
        decay = max(0.1, 1.0 - days_old / stale_days)
        return confidence * decay

    # ── Text Search ────────────────────────────────────────────────

    def text_search(self, query: str, limit: int = 20) -> list[dict]:
        """Full-text-ish search across memories using LIKE matching."""
        words = query.lower().split()
        if not words:
            return []
        conditions = " AND ".join("LOWER(m.search_text) LIKE ?" for _ in words)
        params = [f"%{w}%" for w in words]
        rows = self.conn.execute(f"""
            SELECT m.id, m.key, m.value, m.confidence, m.source,
                   m.appeared_count, m.accessed_count,
                   m.last_appeared_at, m.last_accessed_at, m.created_at
            FROM memories m
            WHERE {conditions} AND m.superseded_by IS NULL
            LIMIT ?
        """, (*params, limit)).fetchall()

        now_dt = datetime.now(timezone.utc)
        results = []
        for r in rows:
            raw_conf = r[3]
            last_seen = r[7] or r[9]
            eff_conf = self._apply_decay(r[0], raw_conf, last_seen, now_dt)
            # Score: matched word count + confidence tiebreaker
            st = f"{r[1]}: {r[2]}".lower()
            matched = sum(1 for w in words if w in st)
            results.append({
                "id": r[0], "key": r[1], "value": r[2],
                "confidence": raw_conf, "effective_confidence": eff_conf,
                "source": r[4], "appeared_count": r[5], "accessed_count": r[6],
                "score": matched + eff_conf,
            })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    # ── Contradiction / History ────────────────────────────────────

    def history(self, key: str) -> list[dict]:
        """Return all values for a key ordered by created_at, showing supersession chain."""
        rows = self.conn.execute("""
            SELECT id, key, value, confidence, source, created_at,
                   superseded_by, superseded_at
            FROM memories WHERE key=? ORDER BY created_at
        """, (key,)).fetchall()
        return [
            {
                "id": r[0], "key": r[1], "value": r[2], "confidence": r[3],
                "source": r[4], "created_at": r[5],
                "superseded_by": r[6], "superseded_at": r[7],
            }
            for r in rows
        ]

    # ── Entity Linking ─────────────────────────────────────────────

    def link(self, source_id: int, target_id: int, relation: str):
        """Create a link between two memories."""
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "INSERT OR IGNORE INTO memory_links (source_id, target_id, relation, created_at) VALUES (?, ?, ?, ?)",
            (source_id, target_id, relation, now),
        )

    def related(self, memory_id: int, relation: Optional[str] = None) -> list[dict]:
        """Return memories linked to this one."""
        if relation:
            rows = self.conn.execute("""
                SELECT m.id, m.key, m.value, m.confidence, ml.relation
                FROM memory_links ml
                JOIN memories m ON m.id = CASE WHEN ml.source_id = ? THEN ml.target_id ELSE ml.source_id END
                WHERE (ml.source_id = ? OR ml.target_id = ?) AND ml.relation = ?
            """, (memory_id, memory_id, memory_id, relation)).fetchall()
        else:
            rows = self.conn.execute("""
                SELECT m.id, m.key, m.value, m.confidence, ml.relation
                FROM memory_links ml
                JOIN memories m ON m.id = CASE WHEN ml.source_id = ? THEN ml.target_id ELSE ml.source_id END
                WHERE ml.source_id = ? OR ml.target_id = ?
            """, (memory_id, memory_id, memory_id)).fetchall()
        return [
            {"id": r[0], "key": r[1], "value": r[2], "confidence": r[3], "relation": r[4]}
            for r in rows
        ]

    def _auto_link(self, mem_id: int, key: str, value: str):
        """Deterministic auto-linking on upsert."""
        # Email → account linking
        if key == "email":
            accounts = self.conn.execute(
                "SELECT id FROM memories WHERE key LIKE 'account:%' AND value=? AND id!=?",
                (value, mem_id),
            ).fetchall()
            for (aid,) in accounts:
                self.link(mem_id, aid, "belongs_to")

        # Cross-account same-identity linking
        if key.startswith("account:"):
            same_user = self.conn.execute(
                "SELECT id FROM memories WHERE key LIKE 'account:%' AND value=? AND id!=?",
                (value, mem_id),
            ).fetchall()
            for (sid,) in same_user:
                self.link(mem_id, sid, "same_identity")

    # ── Mark Accessed ──────────────────────────────────────────────

    def mark_accessed(self, memory_id: int):
        """Mark a memory as actually used by the consuming agent."""
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "UPDATE memories SET accessed_count = accessed_count + 1, last_accessed_at = ? WHERE id = ?",
            (now, memory_id),
        )
        self.conn.commit()

    # ── Stats ──────────────────────────────────────────────────────

    def stats(self) -> dict:
        """Return summary stats about the memory database."""
        total = self.conn.execute("SELECT COUNT(*) FROM memories WHERE superseded_by IS NULL").fetchone()[0]
        superseded = self.conn.execute("SELECT COUNT(*) FROM memories WHERE superseded_by IS NOT NULL").fetchone()[0]
        by_tag = self.conn.execute(
            "SELECT tag, COUNT(*) FROM memory_tags GROUP BY tag ORDER BY COUNT(*) DESC"
        ).fetchall()
        top_accessed = self.conn.execute(
            "SELECT key, value, accessed_count FROM memories WHERE accessed_count > 0 ORDER BY accessed_count DESC LIMIT 10"
        ).fetchall()
        links = self.conn.execute("SELECT COUNT(*) FROM memory_links").fetchone()[0]
        return {
            "total_memories": total,
            "superseded": superseded,
            "links": links,
            "by_tag": {r[0]: r[1] for r in by_tag},
            "top_accessed": [{"key": r[0], "value": r[1], "accessed": r[2]} for r in top_accessed],
        }

    # ── Profile ────────────────────────────────────────────────────

    def profile(self) -> dict:
        """Generate structured user profile from non-superseded memories."""
        rows = self.conn.execute("""
            SELECT m.id, m.key, m.value, m.confidence
            FROM memories m
            WHERE m.superseded_by IS NULL
            ORDER BY m.confidence DESC
        """).fetchall()

        # Build key→values map
        by_key: dict[str, list[tuple]] = {}
        for mid, key, value, conf in rows:
            by_key.setdefault(key, []).append((value, conf))

        def pick_single(k):
            vals = by_key.get(k, [])
            return vals[0][0] if vals else None

        def pick_multi(prefix, n=20):
            out = {}
            for k, vals in by_key.items():
                if k.startswith(prefix):
                    suffix = k[len(prefix):]
                    out[suffix] = vals[0][0]
            return dict(list(out.items())[:n])

        identity = {}
        for k in TAG_SECTIONS["identity"]:
            v = pick_single(k)
            if v:
                identity[k] = v

        address = {}
        for k in TAG_SECTIONS["address"]:
            v = pick_single(k)
            if v:
                address[k] = v

        payment = {}
        for k in TAG_SECTIONS["payment"]:
            v = pick_single(k)
            if v:
                payment[k] = v

        work = {}
        company = pick_single("company")
        if company:
            work["company"] = company

        accounts = pick_multi("account:")
        tools = {}
        for k, vals in by_key.items():
            if k.startswith("tool:"):
                name = k[5:]
                tools[name] = vals[0][0]

        contacts = pick_multi("contact:")
        linkedin = pick_multi("linkedin:")

        if linkedin:
            work["linkedin_contacts"] = linkedin
        if tools:
            work["tools"] = list(tools.keys())[:20]

        result = {}
        if identity:
            result["identity"] = identity
        if address:
            result["address"] = address
        if payment:
            result["payment"] = payment
        if work:
            result["work"] = work
        if accounts:
            result["accounts"] = accounts
        if contacts:
            result["contacts"] = contacts
        if tools:
            result["tools"] = tools
        return result

    def profile_text(self) -> str:
        """Format profile as markdown text for LLM context injection."""
        p = self.profile()
        lines = ["## User Profile"]

        ident = p.get("identity", {})
        name_parts = [ident.get("first_name", ""), ident.get("last_name", "")]
        name = ident.get("full_name") or " ".join(n for n in name_parts if n)
        if name:
            lines.append(f"**Name:** {name}")
        if ident.get("email"):
            lines.append(f"**Email:** {ident['email']}")
        if ident.get("phone"):
            lines.append(f"**Phone:** {ident['phone']}")

        addr = p.get("address", {})
        if addr:
            parts = [addr.get("street_address", ""), addr.get("address_line_2", "")]
            city_state = ", ".join(filter(None, [addr.get("city"), addr.get("state")]))
            if city_state:
                parts.append(city_state)
            if addr.get("zip"):
                parts[-1] = parts[-1] + " " + addr["zip"] if parts else addr["zip"]
            if addr.get("country"):
                parts.append(addr["country"])
            addr_str = ", ".join(filter(None, parts))
            if addr_str:
                lines.append(f"**Address:** {addr_str}")

        pay = p.get("payment", {})
        if pay.get("card_holder_name"):
            lines.append(f"**Card Holder:** {pay['card_holder_name']}")

        work = p.get("work", {})
        if work.get("company"):
            lines.append(f"**Company:** {work['company']}")

        tools = p.get("tools", {})
        if tools:
            top = list(tools.keys())[:10]
            lines.append(f"**Top Tools:** {', '.join(top)}")

        accounts = p.get("accounts", {})
        if accounts:
            acct_strs = [f"{site} ({user})" for site, user in list(accounts.items())[:10]]
            lines.append(f"**Accounts:** {', '.join(acct_strs)}")

        contacts = p.get("contacts", {})
        if contacts:
            lines.append(f"**Contacts:** {len(contacts)} saved")

        return "\n".join(lines)

    # ── Review Operations ─────────────────────────────────────────

    def delete(self, memory_id: int):
        """Delete a memory and its tags/links."""
        self.conn.execute("DELETE FROM memory_tags WHERE memory_id=?", (memory_id,))
        self.conn.execute("DELETE FROM memory_links WHERE source_id=? OR target_id=?", (memory_id, memory_id))
        self.conn.execute("UPDATE memories SET superseded_by=NULL WHERE superseded_by=?", (memory_id,))
        self.conn.execute("DELETE FROM memories WHERE id=?", (memory_id,))
        self.conn.commit()

    def update_memory(self, memory_id: int, key: str = None, value: str = None,
                      confidence: float = None, tags: list[str] = None):
        """Update fields on a memory. Regenerates search_text if key/value changed."""
        updates, params = [], []
        if key is not None:
            updates.append("key=?")
            params.append(key)
        if value is not None:
            updates.append("value=?")
            params.append(value)
        if confidence is not None:
            updates.append("confidence=?")
            params.append(confidence)
        if key is not None or value is not None:
            # Fetch current key/value to build search_text
            row = self.conn.execute("SELECT key, value FROM memories WHERE id=?", (memory_id,)).fetchone()
            if row:
                new_key = key if key is not None else row[0]
                new_val = value if value is not None else row[1]
                updates.append("search_text=?")
                params.append(f"{new_key}: {new_val}")
        if updates:
            params.append(memory_id)
            self.conn.execute(f"UPDATE memories SET {', '.join(updates)} WHERE id=?", params)
        if tags is not None:
            self.conn.execute("DELETE FROM memory_tags WHERE memory_id=?", (memory_id,))
            for tag in tags:
                self.conn.execute("INSERT OR IGNORE INTO memory_tags (memory_id, tag) VALUES (?, ?)", (memory_id, tag))
        self.conn.commit()

    def get_unreviewed(self, limit: int = 100) -> list[dict]:
        """Get memories where reviewed_at IS NULL, with their tags."""
        rows = self.conn.execute("""
            SELECT m.id, m.key, m.value, m.confidence, m.source, m.created_at,
                   m.superseded_by
            FROM memories m
            WHERE m.reviewed_at IS NULL
            ORDER BY m.id
            LIMIT ?
        """, (limit,)).fetchall()
        results = []
        for r in rows:
            tags = [t[0] for t in self.conn.execute(
                "SELECT tag FROM memory_tags WHERE memory_id=?", (r[0],)
            ).fetchall()]
            results.append({
                "id": r[0], "key": r[1], "value": r[2], "confidence": r[3],
                "source": r[4], "created_at": r[5], "superseded_by": r[6],
                "tags": tags,
            })
        return results

    def mark_reviewed(self, memory_ids: list[int]):
        """Set reviewed_at = now for given IDs."""
        if not memory_ids:
            return
        now = datetime.now(timezone.utc).isoformat()
        placeholders = ",".join("?" for _ in memory_ids)
        self.conn.execute(
            f"UPDATE memories SET reviewed_at=? WHERE id IN ({placeholders})",
            (now, *memory_ids),
        )
        self.conn.commit()

    def get_meta(self, key: str) -> Optional[str]:
        """Get metadata value."""
        row = self.conn.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return row[0] if row else None

    def set_meta(self, key: str, value: str):
        """Set metadata value (INSERT OR REPLACE)."""
        self.conn.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", (key, value))
        self.conn.commit()

    # ── Close ──────────────────────────────────────────────────────

    def close(self):
        self.conn.commit()
        self.conn.close()
