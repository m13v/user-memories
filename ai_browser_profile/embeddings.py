"""Lazy-loading embedding model + vector storage for semantic search.

Uses a plain SQLite table for embeddings (no sqlite-vec extension needed)
and computes cosine similarity in Python via numpy.

Model: nomic-embed-text-v1.5 (768-dim, 2K context, MTEB ~65).
Runtime: ONNX Runtime (~50MB) with pre-built quantized model (~131MB).
No PyTorch, transformers, scipy, or sklearn needed.

Nomic uses task prefixes: "search_document: " for stored texts,
"search_query: " for queries.
"""

import logging
import struct
from typing import Optional

log = logging.getLogger(__name__)

# Module-level state — loaded on first call
_session = None
_tokenizer = None

EMBEDDING_DIM = 768
MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5"
ONNX_FILE = "onnx/model_quantized.onnx"
MAX_LENGTH = 512


def _load_model():
    """Load ONNX model + tokenizer on first use (~131MB download)."""
    global _session, _tokenizer
    if _session is not None:
        return True
    try:
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer

        onnx_path = hf_hub_download(MODEL_NAME, ONNX_FILE)
        tok_path = hf_hub_download(MODEL_NAME, "tokenizer.json")

        providers = ['CoreMLExecutionProvider', 'CPUExecutionProvider'] \
            if 'CoreMLExecutionProvider' in ort.get_available_providers() \
            else ['CPUExecutionProvider']
        _session = ort.InferenceSession(onnx_path, providers=providers)

        _tokenizer = Tokenizer.from_file(tok_path)
        # Only truncate; padding is done dynamically per-batch in _embed_raw
        _tokenizer.enable_truncation(max_length=MAX_LENGTH)

        log.info(f"Loaded embedding model: {MODEL_NAME} (ONNX, {_session.get_providers()})")
        return True
    except ImportError as e:
        log.warning(f"ONNX runtime dependencies not installed — semantic search disabled: {e}")
        return False
    except Exception as e:
        log.warning(f"Failed to load embedding model: {e}")
        return False


def _embed_raw(texts: list[str]) -> list[Optional[list[float]]]:
    """Embed pre-prefixed texts via ONNX Runtime. Returns normalized vectors."""
    import numpy as np

    results = []
    batch_size = 32
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        encoded = _tokenizer.encode_batch(batch)

        # Dynamic padding: pad to max length in this batch, not MAX_LENGTH
        max_len = max(len(e.ids) for e in encoded)
        input_ids = np.zeros((len(encoded), max_len), dtype=np.int64)
        attention_mask = np.zeros((len(encoded), max_len), dtype=np.int64)
        for j, e in enumerate(encoded):
            seq_len = len(e.ids)
            input_ids[j, :seq_len] = e.ids
            attention_mask[j, :seq_len] = e.attention_mask
        token_type_ids = np.zeros_like(input_ids)

        outputs = _session.run(None, {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "token_type_ids": token_type_ids,
        })

        last_hidden = outputs[0]  # (batch, seq, 768)
        mask = attention_mask[:, :, None].astype(np.float32)
        emb = (last_hidden * mask).sum(axis=1) / mask.sum(axis=1)
        norms = np.linalg.norm(emb, axis=1, keepdims=True)
        emb = emb / norms

        for vec in emb:
            results.append(vec.tolist())

    return results


def is_available() -> bool:
    """Check if embedding model can be loaded."""
    return _load_model()


def embed_text(text: str, prefix: str = "search_document") -> Optional[list[float]]:
    """Embed a single text string. Returns 768-dim vector or None if unavailable.

    Args:
        text: The text to embed.
        prefix: "search_document" for storing, "search_query" for searching.
    """
    if not _load_model():
        return None
    results = _embed_raw([f"{prefix}: {text}"])
    return results[0] if results else None


def embed_batch(texts: list[str], prefix: str = "search_document") -> list[Optional[list[float]]]:
    """Embed a batch of texts. Returns list of 768-dim vectors."""
    if not _load_model():
        return [None] * len(texts)
    prefixed = [f"{prefix}: {t}" for t in texts]
    return _embed_raw(prefixed)


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
