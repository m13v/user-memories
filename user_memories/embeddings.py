"""Lazy-loading embedding model + vector storage for semantic search.

Uses a plain SQLite table for embeddings (no sqlite-vec extension needed)
and computes cosine similarity in Python via numpy.

Model: nomic-embed-text-v1.5 (768-dim, 2K context, MTEB ~65).
Nomic uses task prefixes: "search_document: " for stored texts,
"search_query: " for queries.
"""

import logging
import struct
from typing import Optional

log = logging.getLogger(__name__)

# Module-level state — loaded on first call
_model = None

EMBEDDING_DIM = 768
MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5"


def _load_model():
    """Load sentence-transformers model on first use (~274MB download)."""
    global _model
    if _model is not None:
        return _model
    try:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME, trust_remote_code=True)
        log.info(f"Loaded embedding model: {MODEL_NAME}")
    except ImportError:
        log.warning("sentence-transformers not installed — semantic search disabled")
        _model = None
    return _model


def is_available() -> bool:
    """Check if embedding model can be loaded."""
    return _load_model() is not None


def embed_text(text: str, prefix: str = "search_document") -> Optional[list[float]]:
    """Embed a single text string. Returns 768-dim vector or None if unavailable.

    Args:
        text: The text to embed.
        prefix: "search_document" for storing, "search_query" for searching.
    """
    model = _load_model()
    if model is None:
        return None
    vec = model.encode(f"{prefix}: {text}", normalize_embeddings=True)
    return vec.tolist()


def embed_batch(texts: list[str], prefix: str = "search_document") -> list[Optional[list[float]]]:
    """Embed a batch of texts. Returns list of 768-dim vectors."""
    model = _load_model()
    if model is None:
        return [None] * len(texts)
    prefixed = [f"{prefix}: {t}" for t in texts]
    vecs = model.encode(prefixed, normalize_embeddings=True, batch_size=64)
    return [v.tolist() for v in vecs]


def _serialize_vec(vec: list[float]) -> bytes:
    """Serialize a float vector to bytes for SQLite BLOB storage."""
    return struct.pack(f"{len(vec)}f", *vec)


def _deserialize_vec(blob: bytes) -> list[float]:
    """Deserialize bytes back to float vector."""
    n = len(blob) // 4
    return list(struct.unpack(f"{n}f", blob))


def setup_embeddings_table(conn) -> bool:
    """Create memory_embeddings table (plain SQLite, no extensions needed)."""
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS memory_embeddings (
                memory_id INTEGER PRIMARY KEY,
                embedding BLOB NOT NULL
            )
        """)
        conn.commit()
        return True
    except Exception as e:
        log.warning(f"Failed to create embeddings table: {e}")
        return False


def store_embedding(conn, memory_id: int, vec: list[float]):
    """Store an embedding for a memory."""
    try:
        conn.execute(
            "INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)",
            (memory_id, _serialize_vec(vec)),
        )
    except Exception as e:
        log.debug(f"Failed to store embedding for {memory_id}: {e}")


def cosine_search(conn, query_vec: list[float], limit: int = 20,
                  threshold: float = 0.5) -> list[tuple[int, float]]:
    """Search for similar memories by embedding.

    Computes cosine similarity in Python (vectors are pre-normalized).
    Returns [(memory_id, similarity)] sorted by similarity descending.
    """
    try:
        import numpy as np
    except ImportError:
        log.warning("numpy not available for cosine search")
        return []

    try:
        rows = conn.execute("SELECT memory_id, embedding FROM memory_embeddings").fetchall()
    except Exception:
        return []

    if not rows:
        return []

    q = np.array(query_vec, dtype=np.float32)

    results = []
    for mem_id, blob in rows:
        vec = np.frombuffer(blob, dtype=np.float32)
        # Dot product of normalized vectors = cosine similarity
        sim = float(np.dot(q, vec))
        if sim >= threshold:
            results.append((mem_id, sim))

    results.sort(key=lambda x: -x[1])
    return results[:limit]
