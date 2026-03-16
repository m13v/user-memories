"""MemoryDB — schema, upsert, search, mark_accessed, stats, profile, text_search, semantic_search."""

import logging
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from ai_browser_profile.embeddings import (
    embed_text, embed_batch, setup_embeddings_table, store_embedding, cosine_search,
    is_available as embeddings_available,
)

log = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
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

# ── Key Schema ────────────────────────────────────────────────────────

KEY_SCHEMA = {
    # Identity (single-value: new value supersedes old)
    "first_name": "single", "last_name": "single", "full_name": "single",
    "date_of_birth": "single", "gender": "single", "job_title": "single",
    "card_holder_name": "single",
    # Multi-value (one per suffix, e.g., account:github.com)
    "email": "multi", "phone": "multi", "username": "multi", "language": "multi",
    "street_address": "multi", "address_line_2": "multi",
    "city": "multi", "state": "multi",
    "zip": "multi", "country": "multi", "company": "multi",
    "account": "multi", "tool": "multi", "contact": "multi", "linkedin": "multi", "bookmark": "multi",
    "product": "multi", "project": "multi", "interest": "multi",
    "skill": "multi", "location": "multi", "relationship": "multi",
    "work": "multi", "business": "multi", "activity": "multi",
}

CANONICAL_TAGS = {
    "identity", "contact_info", "address", "payment",
    "account", "tool", "contact", "work",
    "knowledge", "communication", "social", "finance",
}

TAG_MIGRATION = {
    "email": "contact_info", "phone": "contact_info",
    "credential": "account", "dev": "tool", "ai": "tool",
    "location": "address", "company": "work",
    "business": "knowledge", "interest": "knowledge",
    "lifestyle": "knowledge", "product": "knowledge",
    "project": "knowledge", "skill": "knowledge",
    "activity": "knowledge", "language": "identity",
    "relationship": "contact", "real_estate": "knowledge",
    "spiritual": "knowledge", "autofill": "identity",
}

# Profile section mapping based on KEY_SCHEMA
PROFILE_SECTIONS = {
    "identity": ["first_name", "last_name", "full_name", "email", "phone",
                  "date_of_birth", "gender", "job_title", "language"],
    "address": ["street_address", "address_line_2", "city", "state", "zip", "country"],
    "payment": ["card_holder_name"],
    "work": ["company"],
}


class MemoryDB:
    def __init__(self, path: str = "memories.db", defer_embeddings: bool = False):
        self.path = path
        self.conn = sqlite3.connect(path)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)
        self._migrate()
        self._defer_embeddings = defer_embeddings
        self._vec_ready = setup_embeddings_table(self.conn) if not defer_embeddings else False

    # ── Migration ──────────────────────────────────────────────────

    def _migrate(self):
        """Add new columns/tables to existing DBs and migrate to v2."""
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

        # v2 migration: normalize confidence, migrate tags
        version = self.get_meta("schema_version") or "1"
        if version == "1":
            self._migrate_v2()

    def _migrate_v2(self):
        """V2: set all confidence to 1.0, migrate tags to canonical set."""
        log.info("Migrating to schema v2: normalizing confidence, migrating tags")

        # Set all confidence to 1.0
        self.conn.execute("UPDATE memories SET confidence = 1.0")

        # Migrate tags
        for old_tag, new_tag in TAG_MIGRATION.items():
            # Update existing tags, ignore if the (memory_id, new_tag) combo already exists
            self.conn.execute("""
                UPDATE OR IGNORE memory_tags SET tag = ? WHERE tag = ?
            """, (new_tag, old_tag))
            # Delete any remaining old tags (dupes that couldn't be updated)
            self.conn.execute("DELETE FROM memory_tags WHERE tag = ?", (old_tag,))

        self.conn.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '2')")
        self.conn.commit()
        log.info("Schema v2 migration complete")

    # ── Tag Normalization ─────────────────────────────────────────

    def _normalize_tags(self, tags: list[str]) -> list[str]:
        """Normalize tags via TAG_MIGRATION, deduplicate."""
        normalized = set()
        for tag in tags:
            normalized.add(TAG_MIGRATION.get(tag, tag))
        return list(normalized)

    def _key_prefix(self, key: str) -> str:
        """Extract key prefix before ':' delimiter."""
        return key.split(":")[0] if ":" in key else key

    # ── Upsert ─────────────────────────────────────────────────────

    def upsert(self, key: str, value: str, tags: list[str],
               confidence: float = 1.0, source: str = ""):
        """Insert or update a memory with semantic dedup.

        Decision framework:
        1. Exact (key, value) match → bump appeared_count, merge source
        2. Semantic match (cosine >= 0.92, same key prefix) → supersede old
        3. Same exact key, different value, single-cardinality → supersede old
        4. Brand new → INSERT
        """
        if not value or not value.strip():
            return
        value = value.strip()
        now = datetime.now(timezone.utc).isoformat()
        search_text = f"{key}: {value}"
        tags = self._normalize_tags(tags)

        # Warn on unknown key prefix (soft — doesn't block)
        prefix = self._key_prefix(key)
        if prefix not in KEY_SCHEMA and not key.startswith("autofill:") and not key.startswith("address_type_"):
            log.debug(f"Unknown key prefix: {prefix} (key={key})")

        # 1. Exact (key, value) match
        existing = self.conn.execute(
            "SELECT id, source, appeared_count FROM memories WHERE key=? AND value=?",
            (key, value),
        ).fetchone()

        if existing:
            mem_id, old_source, appeared = existing
            new_source = old_source or ""
            if source and source not in (new_source or ""):
                new_source = f"{new_source}, {source}" if new_source else source
            self.conn.execute(
                "UPDATE memories SET source=?, appeared_count=?, last_appeared_at=?, search_text=?, confidence=1.0 WHERE id=?",
                (new_source, (appeared or 0) + 1, now, search_text, mem_id),
            )
            self._ensure_tags(mem_id, tags)
            self.conn.commit()
            return mem_id

        # 2. Semantic dedup — check for near-duplicate with same key prefix
        mem_id = self._try_semantic_supersede(key, value, search_text, tags, source, now)
        if mem_id:
            return mem_id

        # 3. Single-cardinality key supersession
        cardinality = KEY_SCHEMA.get(prefix, "multi")
        if cardinality == "single":
            old_row = self.conn.execute(
                "SELECT id FROM memories WHERE key=? AND superseded_by IS NULL",
                (key,),
            ).fetchone()
            if old_row:
                mem_id = self._insert_and_supersede(key, value, search_text, tags, source, now, old_row[0])
                return mem_id

        # 4. Brand new
        mem_id = self._insert_new(key, value, search_text, tags, source, now)
        return mem_id

    def _try_semantic_supersede(self, key: str, value: str, search_text: str,
                                 tags: list[str], source: str, now: str) -> Optional[int]:
        """Check for semantic near-duplicate. Returns new mem_id if superseded, else None."""
        if not self._vec_ready:
            return None

        vec = embed_text(search_text)
        if vec is None:
            return None

        prefix = self._key_prefix(key)
        matches = cosine_search(self.conn, vec, limit=5, threshold=0.92)

        for old_id, similarity in matches:
            # Check same key prefix and not already superseded
            old_row = self.conn.execute(
                "SELECT key, value, superseded_by FROM memories WHERE id=?", (old_id,)
            ).fetchone()
            if not old_row or old_row[2] is not None:
                continue
            old_prefix = self._key_prefix(old_row[0])
            if old_prefix != prefix:
                continue
            # Same key prefix, high similarity — supersede
            log.debug(f"Semantic dedup: '{old_row[0]}: {old_row[1][:50]}' → '{key}: {value[:50]}' (sim={similarity:.3f})")
            return self._insert_and_supersede(key, value, search_text, tags, source, now, old_id)

        return None

    def _insert_new(self, key: str, value: str, search_text: str,
                    tags: list[str], source: str, now: str) -> int:
        """Insert a brand new memory."""
        cursor = self.conn.execute(
            "INSERT INTO memories (key, value, confidence, source, created_at, search_text, appeared_count, last_appeared_at) "
            "VALUES (?, ?, 1.0, ?, ?, ?, 1, ?)",
            (key, value, source, now, search_text, now),
        )
        mem_id = cursor.lastrowid
        self._ensure_tags(mem_id, tags)
        self._auto_link(mem_id, key, value)
        self._store_embedding(mem_id, search_text)
        self.conn.commit()
        return mem_id

    def _insert_and_supersede(self, key: str, value: str, search_text: str,
                               tags: list[str], source: str, now: str,
                               old_id: int) -> int:
        """Insert new memory and supersede old one."""
        cursor = self.conn.execute(
            "INSERT INTO memories (key, value, confidence, source, created_at, search_text, appeared_count, last_appeared_at) "
            "VALUES (?, ?, 1.0, ?, ?, ?, 1, ?)",
            (key, value, source, now, search_text, now),
        )
        mem_id = cursor.lastrowid
        self.conn.execute(
            "UPDATE memories SET superseded_by=?, superseded_at=? WHERE id=?",
            (mem_id, now, old_id),
        )
        self._ensure_tags(mem_id, tags)
        self._auto_link(mem_id, key, value)
        self._store_embedding(mem_id, search_text)
        self.conn.commit()
        return mem_id

    def _ensure_tags(self, mem_id: int, tags: list[str]):
        """Ensure all tags exist for a memory."""
        for tag in tags:
            self.conn.execute(
                "INSERT OR IGNORE INTO memory_tags (memory_id, tag) VALUES (?, ?)",
                (mem_id, tag),
            )

    def _store_embedding(self, mem_id: int, search_text: str):
        """Compute and store embedding for a memory."""
        if not self._vec_ready:
            return
        vec = embed_text(search_text)
        if vec:
            store_embedding(self.conn, mem_id, vec)

    # ── Search ─────────────────────────────────────────────────────

    def search(self, tags: list[str], limit: int = 20,
               include_superseded: bool = False) -> list[dict]:
        """Search memories by tags, ranked by hit_rate then appeared/accessed counts."""
        placeholders = ",".join("?" for _ in tags)
        superseded_filter = "" if include_superseded else "AND m.superseded_by IS NULL"
        rows = self.conn.execute(f"""
            SELECT DISTINCT m.id, m.key, m.value, m.source,
                   m.appeared_count, m.accessed_count,
                   m.last_appeared_at, m.last_accessed_at, m.created_at,
                   CASE WHEN m.appeared_count = 0 THEN 0.0
                        ELSE CAST(m.accessed_count AS REAL) / m.appeared_count
                   END AS hit_rate
            FROM memories m
            JOIN memory_tags t ON m.id = t.memory_id
            WHERE t.tag IN ({placeholders}) {superseded_filter}
            ORDER BY hit_rate DESC, m.accessed_count DESC, m.appeared_count DESC
            LIMIT ?
        """, (*tags, limit)).fetchall()

        now = datetime.now(timezone.utc).isoformat()

        results = []
        for r in rows:
            results.append({
                "id": r[0], "key": r[1], "value": r[2],
                "source": r[3], "appeared_count": r[4] + 1,
                "accessed_count": r[5], "hit_rate": r[9],
            })

        ids = [r["id"] for r in results]
        if ids:
            id_placeholders = ",".join("?" for _ in ids)
            self.conn.execute(
                f"UPDATE memories SET appeared_count = appeared_count + 1, "
                f"accessed_count = accessed_count + 1, "
                f"last_appeared_at = ?, last_accessed_at = ? "
                f"WHERE id IN ({id_placeholders})",
                (now, now, *ids),
            )
            self.conn.commit()

        return results

    # ── Semantic Search ────────────────────────────────────────────

    def semantic_search(self, query: str, limit: int = 20,
                        threshold: float = 0.3) -> list[dict]:
        """Search memories by semantic similarity. Falls back to text_search if unavailable."""
        if not self._vec_ready:
            return self.text_search(query, limit)

        vec = embed_text(query, prefix="search_query")
        if vec is None:
            return self.text_search(query, limit)

        matches = cosine_search(self.conn, vec, limit=limit, threshold=threshold)
        if not matches:
            return self.text_search(query, limit)

        now = datetime.now(timezone.utc).isoformat()
        results = []
        for mem_id, similarity in matches:
            row = self.conn.execute(
                "SELECT id, key, value, source, appeared_count, accessed_count, superseded_by "
                "FROM memories WHERE id=?",
                (mem_id,),
            ).fetchone()
            if not row or row[6] is not None:  # skip superseded
                continue
            results.append({
                "id": row[0], "key": row[1], "value": row[2],
                "source": row[3], "appeared_count": row[4] + 1,
                "accessed_count": row[5] + 1, "similarity": similarity,
            })

        # Auto-bump appeared + accessed for all returned results
        ids = [r["id"] for r in results]
        if ids:
            id_placeholders = ",".join("?" for _ in ids)
            self.conn.execute(
                f"UPDATE memories SET appeared_count = appeared_count + 1, "
                f"accessed_count = accessed_count + 1, "
                f"last_appeared_at = ?, last_accessed_at = ? "
                f"WHERE id IN ({id_placeholders})",
                (now, now, *ids),
            )
            self.conn.commit()

        return results

    # ── Text Search ────────────────────────────────────────────────

    def text_search(self, query: str, limit: int = 20) -> list[dict]:
        """Full-text-ish search across memories using LIKE matching."""
        words = query.lower().split()
        if not words:
            return []
        conditions = " AND ".join("LOWER(m.search_text) LIKE ?" for _ in words)
        params = [f"%{w}%" for w in words]
        rows = self.conn.execute(f"""
            SELECT m.id, m.key, m.value, m.source,
                   m.appeared_count, m.accessed_count,
                   CASE WHEN m.appeared_count = 0 THEN 0.0
                        ELSE CAST(m.accessed_count AS REAL) / m.appeared_count
                   END AS hit_rate
            FROM memories m
            WHERE {conditions} AND m.superseded_by IS NULL
            ORDER BY hit_rate DESC, m.accessed_count DESC
            LIMIT ?
        """, (*params, limit)).fetchall()

        now = datetime.now(timezone.utc).isoformat()
        results = []
        for r in rows:
            st = f"{r[1]}: {r[2]}".lower()
            matched = sum(1 for w in words if w in st)
            results.append({
                "id": r[0], "key": r[1], "value": r[2],
                "source": r[3], "appeared_count": r[4] + 1, "accessed_count": r[5] + 1,
                "hit_rate": r[6], "score": matched,
            })
        results.sort(key=lambda x: (x["score"], x["hit_rate"]), reverse=True)

        # Auto-bump appeared + accessed for all returned results
        ids = [r["id"] for r in results]
        if ids:
            id_placeholders = ",".join("?" for _ in ids)
            self.conn.execute(
                f"UPDATE memories SET appeared_count = appeared_count + 1, "
                f"accessed_count = accessed_count + 1, "
                f"last_appeared_at = ?, last_accessed_at = ? "
                f"WHERE id IN ({id_placeholders})",
                (now, now, *ids),
            )
            self.conn.commit()

        return results

    # ── Backfill Embeddings ────────────────────────────────────────

    def backfill_embeddings(self) -> int:
        """Compute embeddings for all existing memories. Returns count embedded."""
        if not self._vec_ready:
            log.warning("sqlite-vec not available, cannot backfill embeddings")
            return 0

        rows = self.conn.execute(
            "SELECT id, key, value FROM memories WHERE superseded_by IS NULL"
        ).fetchall()

        if not rows:
            return 0

        # Check which already have embeddings
        existing_ids = set()
        try:
            for (mid,) in self.conn.execute("SELECT memory_id FROM memory_embeddings"):
                existing_ids.add(mid)
        except Exception:
            pass

        to_embed = [(r[0], f"{r[1]}: {r[2]}") for r in rows if r[0] not in existing_ids]
        if not to_embed:
            log.info("All memories already have embeddings")
            return 0

        log.info(f"Backfilling embeddings for {len(to_embed)} memories...")
        texts = [t[1] for t in to_embed]
        vectors = embed_batch(texts)

        count = 0
        for (mem_id, _), vec in zip(to_embed, vectors):
            if vec is not None:
                store_embedding(self.conn, mem_id, vec)
                count += 1

        self.conn.commit()
        log.info(f"Embedded {count} memories")
        return count

    def regenerate_embeddings(self) -> int:
        """Wipe all embeddings and recompute with current model. Use after model change."""
        if not self._vec_ready:
            log.warning("Embeddings table not available, cannot regenerate")
            return 0

        self.conn.execute("DELETE FROM memory_embeddings")
        self.conn.commit()
        log.info("Cleared all existing embeddings")
        return self.backfill_embeddings()

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
        if key == "email":
            accounts = self.conn.execute(
                "SELECT id FROM memories WHERE key LIKE 'account:%' AND value=? AND id!=?",
                (value, mem_id),
            ).fetchall()
            for (aid,) in accounts:
                self.link(mem_id, aid, "belongs_to")

        if key.startswith("account:"):
            same_user = self.conn.execute(
                "SELECT id FROM memories WHERE key LIKE 'account:%' AND value=? AND id!=?",
                (value, mem_id),
            ).fetchall()
            for (sid,) in same_user:
                self.link(mem_id, sid, "same_identity")

    # ── Mark Accessed ──────────────────────────────────────────────

    def mark_accessed(self, memory_id: int):
        """Manually bump accessed_count. Kept for backward compat — search methods now auto-increment."""
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

        # Count embeddings
        embedded = 0
        try:
            embedded = self.conn.execute("SELECT COUNT(*) FROM memory_embeddings").fetchone()[0]
        except Exception:
            pass

        return {
            "total_memories": total,
            "superseded": superseded,
            "links": links,
            "embedded": embedded,
            "by_tag": {r[0]: r[1] for r in by_tag},
            "top_accessed": [{"key": r[0], "value": r[1], "accessed": r[2]} for r in top_accessed],
        }

    # ── Profile ────────────────────────────────────────────────────

    def profile(self) -> dict:
        """Generate structured user profile from non-superseded memories."""
        rows = self.conn.execute("""
            SELECT m.key, m.value, m.appeared_count
            FROM memories m
            WHERE m.superseded_by IS NULL
            ORDER BY m.appeared_count DESC, m.accessed_count DESC
        """).fetchall()

        by_key: dict[str, list[tuple]] = {}
        for key, value, appeared in rows:
            by_key.setdefault(key, []).append((value, appeared))

        def pick(k, n=1, min_appeared=1):
            """Pick top n values for a key, filtered by min appeared_count."""
            vals = [(v, a) for v, a in by_key.get(k, []) if a >= min_appeared]
            if n == 1:
                return vals[0][0] if vals else None
            return [v for v, _ in vals[:n]]

        def pick_prefixed(prefix, n=20, min_appeared=1):
            """Pick top n entries matching a key prefix."""
            items = []
            for k, vals in by_key.items():
                if k.startswith(prefix):
                    suffix = k[len(prefix):]
                    top_val, top_appeared = vals[0]
                    if top_appeared >= min_appeared:
                        items.append((suffix, top_val, top_appeared))
            items.sort(key=lambda x: x[2], reverse=True)
            return [(name, val) for name, val, _ in items[:n]]

        # Identity
        name_parts = [pick("first_name"), pick("last_name")]
        full_name = pick("full_name") or " ".join(n for n in name_parts if n)
        emails = pick("email", n=10, min_appeared=5)
        phones = pick("phone", n=5, min_appeared=2)
        # Usernames: exclude values that look like emails
        raw_usernames = pick("username", n=20, min_appeared=2) or []
        usernames = [u for u in raw_usernames if "@" not in u and "." not in u]

        # Addresses — deduplicate similar streets, group into full addresses
        addresses = []
        raw_streets = pick("street_address", n=10, min_appeared=2) or []
        # Deduplicate: normalize by lowercasing and stripping punctuation
        seen_streets = set()
        unique_streets = []
        for s in raw_streets:
            # Clean trailing commas/spaces
            s = s.rstrip(", ")
            normalized = s.lower().replace(" blvd", " boulevard").replace(" st.", " street").replace(" st", " street")
            if normalized not in seen_streets:
                seen_streets.add(normalized)
                unique_streets.append(s)
        if unique_streets:
            primary = {
                "street": unique_streets[0],
                "city": pick("city"), "state": pick("state"),
                "zip": pick("zip"), "country": pick("country"),
            }
            addresses.append(primary)
            for s in unique_streets[1:]:
                addresses.append({"street": s})

        # Payment — count active (non-expired) cards
        card_holder = pick("card_holder_name")
        expiries = pick("card_expiry", n=20)
        from datetime import datetime
        now_ym = datetime.now().strftime("%Y%m")
        active_cards = []
        for e in (expiries or []):
            if isinstance(e, str) and "/" in e:
                try:
                    mm, yyyy = e.split("/")
                    if f"{yyyy}{mm.zfill(2)}" >= now_ym:
                        active_cards.append(e)
                except ValueError:
                    pass

        # Work — deduplicate case-insensitive, strip suffixes
        raw_companies = pick("company", n=10, min_appeared=2) or []
        seen_companies = set()
        companies = []
        for c in (raw_companies if isinstance(raw_companies, list) else [raw_companies]):
            # Normalize: lowercase, strip Inc/LLC/etc
            norm = c.lower().rstrip(".,").replace(", inc", "").replace(" inc", "")
            if norm not in seen_companies:
                seen_companies.add(norm)
                companies.append(c)

        # Tools — sorted by appeared_count
        tool_items = pick_prefixed("tool:", n=20)

        # Accounts — group by username/email, deduplicate domains
        acct_items = pick_prefixed("account:", n=100)
        accounts_by_user: dict[str, list[str]] = {}
        for domain, user in acct_items:
            accounts_by_user.setdefault(user, []).append(domain)

        # Contacts
        contact_items = pick_prefixed("contact:", n=10000)
        total_contacts = len(contact_items)

        # Projects (Notion)
        project_items = pick_prefixed("project:", n=20)

        return {
            "name": full_name or None,
            "emails": emails or [],
            "phones": phones or [],
            "usernames": usernames or [],
            "gender": pick("gender"),
            "date_of_birth": pick("date_of_birth"),
            "addresses": addresses,
            "card_holder": card_holder,
            "active_cards": len(active_cards),
            "companies": companies or [],
            "tools": [name for name, _ in tool_items],
            "accounts": accounts_by_user,
            "total_contacts": total_contacts,
            "projects": [name for name, _ in project_items],
        }

    def profile_text(self) -> str:
        """Format profile as markdown text for LLM context injection."""
        p = self.profile()
        lines = ["## User Profile"]

        if p["name"]:
            lines.append(f"**Name:** {p['name']}")
        if p.get("gender"):
            lines[-1] += f" ({p['gender']})"

        if p["emails"]:
            lines.append(f"**Emails:** {', '.join(p['emails'])}")

        if p["phones"]:
            lines.append(f"**Phones:** {', '.join(p['phones'])}")

        if p["usernames"]:
            lines.append(f"**Handles:** {', '.join(p['usernames'])}")

        # Addresses
        for i, addr in enumerate(p.get("addresses", [])):
            parts = [addr.get("street", "")]
            city_state = ", ".join(filter(None, [addr.get("city"), addr.get("state")]))
            if city_state:
                parts.append(city_state)
            if addr.get("zip"):
                parts[-1] = parts[-1] + " " + addr["zip"] if parts else addr["zip"]
            if addr.get("country"):
                parts.append(addr["country"])
            addr_str = ", ".join(filter(None, parts))
            if addr_str:
                label = "**Address:**" if i == 0 else "**Address " + str(i + 1) + ":**"
                lines.append(f"{label} {addr_str}")

        # Payment
        if p.get("card_holder") or p.get("active_cards"):
            card_parts = []
            if p["card_holder"]:
                card_parts.append(p["card_holder"])
            if p["active_cards"]:
                card_parts.append(f"{p['active_cards']} cards on file")
            lines.append(f"**Payment:** {', '.join(card_parts)}")

        # Companies
        if p.get("companies"):
            if isinstance(p["companies"], list):
                lines.append(f"**Companies:** {', '.join(p['companies'])}")
            else:
                lines.append(f"**Company:** {p['companies']}")

        # Tools
        if p.get("tools"):
            lines.append(f"**Top Tools:** {', '.join(p['tools'][:15])}")

        # Accounts grouped by identity
        if p.get("accounts"):
            lines.append("**Accounts:**")
            for user, domains in sorted(p["accounts"].items(),
                                         key=lambda x: len(x[1]), reverse=True)[:8]:
                # Clean domain names: extract meaningful service name
                seen = set()
                short_domains = []
                for d in domains:
                    # Use second-level domain as service name
                    parts = d.replace("www.", "").split(".")
                    if len(parts) >= 2:
                        short = parts[-2]  # e.g. "mercury" from "app.mercury.com"
                    else:
                        short = parts[0]
                    # Skip generic TLDs, gov subdomains, localhost
                    if short in ("com", "co", "io", "ai", "org", "net", "ru",
                                 "gov", "ca", "us", "localhost", "localhost:3000"):
                        # For .gov domains (dmv.ca.gov), use the subdomain
                        short = parts[0] if len(parts) > 2 else d
                    if "localhost" in short:
                        continue
                    if short not in seen:
                        seen.add(short)
                        short_domains.append(short)
                display = short_domains[:6]
                extra = f" +{len(short_domains) - 6}" if len(short_domains) > 6 else ""
                lines.append(f"  {user}: {', '.join(display)}{extra}")

        # Projects
        if p.get("projects"):
            # Clean up Notion page titles, deduplicate by core name
            seen_proj = set()
            clean = []
            for name in p["projects"]:
                c = name.rstrip(" ‣").strip()
                # Extract last meaningful name for dedup (e.g. "Eugene O'Donald" from "TBD: Eugene O'Donald")
                core = c.split(" - ")[-1].split(": ")[-1].lower().strip()
                if core not in seen_proj and c:
                    seen_proj.add(core)
                    clean.append(c)
            if clean:
                lines.append(f"**Projects:** {', '.join(clean[:10])}")

        # Contacts
        if p.get("total_contacts"):
            lines.append(f"**Contacts:** {p['total_contacts']} total")

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
