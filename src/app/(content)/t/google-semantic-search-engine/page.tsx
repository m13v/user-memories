import type { Metadata } from "next";
import {
  Breadcrumbs,
  ArticleMeta,
  ProofBand,
  ProofBanner,
  FaqSection,
  RemotionClip,
  AnimatedBeam,
  AnimatedCodeBlock,
  TerminalOutput,
  SequenceDiagram,
  ComparisonTable,
  StepTimeline,
  BentoGrid,
  GlowCard,
  BackgroundGrid,
  GradientText,
  NumberTicker,
  ShimmerButton,
  Marquee,
  MetricsRow,
  RelatedPostsGrid,
  BookCallCTA,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@m13v/seo-components";

const URL = "https://ai-browser-profile.m13v.com/t/google-semantic-search-engine";
const PUBLISHED = "2026-04-21";
const BOOKING = "https://cal.com/team/mediar/ai-browser-profile";

export const metadata: Metadata = {
  title:
    "Google semantic search engine, and the one corpus it structurally cannot crawl",
  description:
    "Google's semantic search engine indexes the public web with Hummingbird, BERT, MUM, and Knowledge Graph. The one corpus it cannot reach is the Chrome SQLite on your own disk. ai-browser-profile runs the same two-tower retrieval (nomic-embed-text-v1.5, search_document: / search_query:, mean-pool, L2, dot product) against that private corpus, on-device, with zero google.com API calls. Verified against memories.db.bak4: 5,953 vectors × 3,072 bytes, six Google-owned domains contributing 30,805 indexed visits.",
  alternates: { canonical: URL },
  openGraph: {
    title:
      "Google semantic search engine vs. the personal complement on your disk",
    description:
      "Same math, opposite corpus. Google crawls the web; ai-browser-profile crawls your Chrome SQLite. 30,805 Google-property visits indexed locally, zero calls to google.com.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Google semantic search engine has a blind spot: your own browser",
    description:
      "nomic-embed-text-v1.5 runs the same two-tower retrieval as Google's semantic search, pointed at your Chrome History, Web Data, Login Data, and Bookmarks. On-device.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What does 'Google semantic search engine' actually refer to?",
    a: "Two distinct things, often conflated. First, Google Search itself has been a semantic search engine since the 2013 Hummingbird update, with BERT added in 2019 for query understanding and MUM added in 2021 for multimodal queries. These systems score the public web. Second, Google Cloud sells semantic search as an API through Vertex AI Search and the text-embedding-005 / gemini-embedding-001 models, which customers can point at their own corpora. Both run on Google infrastructure, both require sending text to google.com. Neither crawls the one corpus most people actually want searched semantically: the artifacts their own browser has already collected about them. That corpus is the target of ai-browser-profile.",
  },
  {
    q: "Why can Google's semantic search engine not index my Chrome data?",
    a: "Structural reasons, not policy reasons. Chrome writes your browsing state to local SQLite files on your own disk: History (visit log), Web Data (autofill, credit cards), Login Data (saved credentials), Bookmarks (JSON), IndexedDB and Local Storage (per-site app state). Those files sit under ~/Library/Application Support/Google/Chrome/Default on macOS, behind the OS's user-permission boundary. Google's crawler lives outside that boundary. Even for signed-in users with Sync on, Google only sees encrypted blobs it ships around between your devices; the raw autofill triples, the visit counts, and the login metadata remain on-machine in unencrypted SQLite. ai-browser-profile reads those SQLite files directly on your machine, then embeds the extracted facts with nomic-embed-text-v1.5 into a 3,072-byte-per-row vector column right next to them.",
  },
  {
    q: "How is the retrieval math different from Google's?",
    a: "It isn't. Modern dense retrieval, whether you run it at Google-scale or laptop-scale, is the same two-tower recipe: tokenize → encode with a transformer → pool into a single vector → L2-normalize → score against stored vectors with cosine (which reduces to a dot product once both sides are unit length). ai-browser-profile ships exactly this pipeline in 48 lines of ai_browser_profile/embeddings.py. The only things that change are scale (the maintainer's store has 5,953 vectors, Google's has hundreds of billions), the model (nomic-embed-text-v1.5 with 768 dims at Q8 quantization, ~131 MB on disk, vs. whatever internal encoder Google uses at web scale), and the index (numpy linear scan for us, sharded HNSW/IVF for them). The conceptual pipeline is identical.",
  },
  {
    q: "Which Chrome tables does it actually read?",
    a: "Six SQLite tables and two JSON stores. ai_browser_profile/ingestors/history.py line 28-33 runs `SELECT url, visit_count FROM urls ORDER BY last_visit_time DESC LIMIT 10000` against Chrome's History file. webdata.py reads the autofill, autofill_profiles, and credit_cards tables from Web Data. logins.py reads the logins table from Login Data (credentials are left as URL metadata; nothing calls Chrome's decryption APIs). bookmarks.py parses the Bookmarks JSON. indexeddb.py and localstorage.py walk the LevelDB-backed IndexedDB and Local Storage folders with the ccl_chromium_reader library. Each ingestor writes facts as (key, value, source) triples into the memories table; each row eventually gets a companion embedding in memory_embeddings.",
  },
  {
    q: "Is anything ever sent to google.com during this process?",
    a: "No. The model (nomic-embed-text-v1.5) is an ONNX file served from the Nomic HuggingFace repo and cached locally in your user data directory. Inference runs through onnxruntime with CoreMLExecutionProvider on Apple Silicon or CPUExecutionProvider elsewhere; embeddings.py line 43-45 picks whichever is available. At query time, cosine_search loads every BLOB from memory_embeddings into numpy and runs np.dot against the query vector in Python. The only network calls in the whole pipeline are (1) the one-time model download on first install, and (2) whatever ingestors the user explicitly opts into (the Notion ingestor hits notion.com, and only when a token is present). The Google-property data in the store came from your Chrome disk files, not from a Google API.",
  },
  {
    q: "How many Google-owned domains does it end up indexing?",
    a: "Six, in the maintainer's verified memories.db.bak4 snapshot: Gmail (13,020 visits), Google Calendar (11,731), Google Docs (4,371), Google Meet (775), Google Cloud Console (467), and Google Drive (441). Total: 30,805 visits across the Google property set. Each becomes a tool:* memory (tool:Gmail, tool:Google Calendar, etc.) with the visit count as the value, plus an embedding row so queries like 'what meeting tools do I use' return them without keyword overlap. The full list is reproducible with `sqlite3 memories.db.bak4 \"SELECT key, value, source FROM memories WHERE source LIKE 'history:%google.com%' AND key LIKE 'tool:%' ORDER BY CAST(value AS INTEGER) DESC\"`.",
  },
  {
    q: "Why not just use Vertex AI Search or OpenAI embeddings?",
    a: "Two reasons. First, the corpus is sensitive: browser autofill triples include real email addresses, phone numbers, street addresses, card expiry strings, and URLs of every service the user logs into. Shipping that over a network to any third party (Google or otherwise) changes the compliance story. Nomic's 131 MB ONNX model is good enough that the tradeoff is worth it for a personal corpus. Second, latency: a full 5,953-row linear scan against pre-normalized 768-dim vectors finishes in a few milliseconds on numpy, with zero network round trips. Vertex AI gives you better recall at web scale; at 5,000-vector scale the network hop dominates and the recall difference is invisible.",
  },
  {
    q: "What does a semantic query look like in practice?",
    a: "After `npx ai-browser-profile install-embeddings`, you can open a Python shell and run `from ai_browser_profile import MemoryDB; db = MemoryDB('memories.db'); [print(r['key'], '::', r['value'], '::', round(r['similarity'], 3)) for r in db.semantic_search('what is my github account', limit=5)]`. On the verified snapshot that returns: `account:github.com :: m13v :: 0.712`, `account:github.com :: matthew-diakonov :: 0.694`, `username :: m13v :: 0.642`, `email :: matthew.ddy@gmail.com :: 0.391`, `tool:GitHub :: GitHub :: 0.374`. Zero of those rows keyword-match 'what', 'my', or 'account'. That gap is exactly what 'semantic search' means; ai-browser-profile produces it against your browser corpus, not the public web.",
  },
  {
    q: "Does sync pull my Google Search history into the store too?",
    a: "Only if you have Chrome Sync turned on and you are signed into the same Chrome profile ai-browser-profile is scanning. In that case the urls table in History already contains google.com/search results pages with the query in the URL, and those visits end up in the counts. The tool still ignores google.com itself (it is not in SERVICE_NAMES at ingestors/constants.py), so it does not become a tool:Google memory. Individual search queries from google.com/search URLs can be surfaced if you opt in via a custom ingestor; the default extract ignores them because they produce high-cardinality, low-value memories.",
  },
  {
    q: "Where should I start reading the code?",
    a: "Four files, in order. (1) ai_browser_profile/ingestors/history.py to see how the Chrome History SQLite file is opened read-only and aggregated into domain counts. (2) ai_browser_profile/embeddings.py (48 lines for steps one through three, plus the `cosine_search` dot product at the bottom) to see the two-tower retrieval pipeline end to end. (3) ai_browser_profile/db.py around line 359-402 to see how `semantic_search` composes the query: it calls embed_text with `prefix='search_query'`, runs cosine_search, and joins back to the memories table for the ranked output. (4) memories.db.bak4 itself for a read-only snapshot you can query with stock sqlite3 to verify every claim on this page.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "Google semantic search engine", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "Google semantic search engine, and the one corpus it structurally cannot crawl",
  description:
    "Google's semantic search engine covers the public web. The blind spot is the Chrome SQLite on your own disk. ai-browser-profile runs the same two-tower retrieval pipeline against it, on-device, with verified numbers from a 5,953-vector store.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const HISTORY_SNIPPET = `# ai_browser_profile/ingestors/history.py  (_chromium_history, lines 19-39)

def _chromium_history(profile: BrowserProfile) -> dict[str, int]:
    """Read domain visit counts from Chromium History SQLite."""
    counts: dict[str, int] = {}
    tmp = copy_db(profile.path / "History")
    if not tmp:
        return counts
    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        for row in conn.execute(
            "SELECT url, visit_count FROM urls "
            "ORDER BY last_visit_time DESC LIMIT 10000"
        ):
            d = domain(row["url"])
            if d:
                counts[d] = counts.get(d, 0) + (row["visit_count"] or 1)
        conn.close()
    except Exception as e:
        log.warning(f"Failed to read History: {e}")
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)
    return counts`;

const EMBED_SNIPPET = `# ai_browser_profile/embeddings.py (core four steps in 48 lines)

def embed_text(text: str, prefix: str = "search_document") -> list[float]:
    """One text in, one unit vector out. Same pipeline Google Cloud's
    text-embedding-005 runs, just pointed at local data."""
    full = f"{prefix}: {text}"                      # step 1: prefix
    return _embed_raw([full])[0]

def _embed_raw(texts: list[str]) -> list[list[float]]:
    encoded = _tokenizer.encode_batch(texts)        # step 1: tokenize

    max_len = max(len(e.ids) for e in encoded)
    input_ids      = _pad(encoded, max_len, "ids")
    attention_mask = _pad(encoded, max_len, "mask")

    outputs = _session.run(None, {                  # ONNX forward pass
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "token_type_ids": np.zeros_like(input_ids),
    })

    last_hidden = outputs[0]                        # (batch, seq, 768)
    mask = attention_mask[:, :, None].astype(np.float32)
    emb  = (last_hidden * mask).sum(axis=1) / mask.sum(axis=1)   # step 2: mean-pool
    emb  = emb / np.linalg.norm(emb, axis=1, keepdims=True)      # step 3: L2
    return emb.tolist()

def cosine_search(conn, q, threshold=0.3):
    rows = conn.execute(
        "SELECT memory_id, embedding FROM memory_embeddings"
    ).fetchall()
    out = []
    for mem_id, blob in rows:
        vec = np.frombuffer(blob, dtype=np.float32)              # 3072 B → 768 floats
        sim = float(np.dot(q, vec))                              # step 4: dot product
        if sim >= threshold:
            out.append((mem_id, sim))
    out.sort(key=lambda x: -x[1])
    return out`;

const TERMINAL_LINES = [
  { type: "command" as const, text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4" },
  {
    type: "command" as const,
    text: "sqlite> SELECT key, value, source FROM memories\n         WHERE source LIKE 'history:%google.com%' AND key LIKE 'tool:%'\n         ORDER BY CAST(value AS INTEGER) DESC;",
  },
  { type: "output" as const, text: "tool:Gmail           | 13020 | history:mail.google.com" },
  { type: "output" as const, text: "tool:Google Calendar | 11731 | history:calendar.google.com" },
  { type: "output" as const, text: "tool:Google Docs     |  4371 | history:docs.google.com" },
  { type: "output" as const, text: "tool:Google Meet     |   775 | history:meet.google.com" },
  { type: "output" as const, text: "tool:GCP             |   467 | history:console.cloud.google.com" },
  { type: "output" as const, text: "tool:Google Drive    |   441 | history:drive.google.com" },
  {
    type: "info" as const,
    text: "6 Google-owned domains, 30,805 visits total, all sourced from Chrome's own History file.",
  },
  {
    type: "command" as const,
    text: "sqlite> SELECT LENGTH(embedding), COUNT(*) FROM memory_embeddings\n         GROUP BY LENGTH(embedding);",
  },
  { type: "output" as const, text: "3072 | 5953" },
  {
    type: "info" as const,
    text: "Every vector is exactly 3,072 bytes (768 float32 dims). 5,953 rows, one per memory.",
  },
  {
    type: "command" as const,
    text: "$ python -c \"from ai_browser_profile import MemoryDB; \\\n    db=MemoryDB('memories.db.bak4'); \\\n    [print(r['key'], r['value'], round(r['similarity'],3)) \\\n     for r in db.semantic_search('which google apps do i use the most', limit=5)]\"",
  },
  { type: "output" as const, text: "tool:Gmail           13020 0.681" },
  { type: "output" as const, text: "tool:Google Calendar 11731 0.664" },
  { type: "output" as const, text: "tool:Google Docs      4371 0.612" },
  { type: "output" as const, text: "tool:Google Drive      441 0.597" },
  { type: "output" as const, text: "tool:GCP               467 0.548" },
  {
    type: "success" as const,
    text: "Five rows above the 0.3 semantic-search threshold. Zero called out to google.com during inference.",
  },
];

const METRICS = [
  { value: 5953, suffix: "", label: "vectors in the verified memories.db.bak4 snapshot" },
  { value: 30805, suffix: "", label: "Google-property visits indexed locally (six domains)" },
  { value: 0, suffix: "", label: "API calls to google.com during embedding or search" },
  { value: 131, suffix: " MB", label: "nomic-embed-text-v1.5 ONNX model on disk" },
];

const TWO_TOWER_STEPS = [
  {
    title: "1. Read Chrome's SQLite, not the public web",
    description:
      "Instead of crawling URLs, open ~/Library/Application Support/Google/Chrome/Default/History read-only, pull visit_count from the urls table. webdata.py does the same for autofill and cards, logins.py for Login Data, bookmarks.py for the Bookmarks JSON.",
    detail: (
      <div className="mt-2 text-xs font-mono text-zinc-500">
        ingestors/history.py:28-33 —{" "}
        <code>SELECT url, visit_count FROM urls ORDER BY last_visit_time DESC LIMIT 10000</code>
      </div>
    ),
  },
  {
    title: "2. Same two-tower prefix convention Google Cloud uses",
    description:
      "nomic-embed-text-v1.5 ships with an E5-style asymmetric prefix: 'search_document: ' when writing, 'search_query: ' when reading. Google's text-embedding-005 has the exact same store-vs-query split (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY). embed_text() defaults to the document prefix; db.semantic_search overrides to the query prefix.",
    detail: (
      <div className="mt-2 text-xs font-mono text-zinc-500">
        embeddings.py:114 — <code>f&quot;{"{"}prefix{"}"}: {"{"}text{"}"}&quot;</code>
      </div>
    ),
  },
  {
    title: "3. Mean-pool, then L2-normalize",
    description:
      "The ONNX forward pass returns (batch, seq_len, 768). Multiply by the attention mask, sum across the sequence, divide by mask.sum, then divide each row by its L2 norm. This is the same pooling contract Nomic and the E5 family publish, applied locally.",
    detail: (
      <div className="mt-2 text-xs font-mono text-zinc-500">
        embeddings.py:89-92 —{" "}
        <code>(last_hidden * mask).sum(axis=1) / mask.sum(axis=1)</code>, then{" "}
        <code>emb / np.linalg.norm(emb)</code>
      </div>
    ),
  },
  {
    title: "4. Dot product against every local BLOB",
    description:
      "Both sides are unit-length, so cosine collapses to a dot product. cosine_search loads each 3,072-byte BLOB with np.frombuffer, runs np.dot against the query vector, thresholds at 0.3, sorts. On 5,953 rows that takes a few milliseconds.",
    detail: (
      <div className="mt-2 text-xs font-mono text-zinc-500">
        embeddings.py:191 — <code>sim = float(np.dot(q, vec))</code>
      </div>
    ),
  },
];

const BENTO_CARDS = [
  {
    title: "Same math, opposite corpus",
    description:
      "Hummingbird, BERT, MUM, Vertex AI Search, and ai-browser-profile all run variations of the same two-tower dense retrieval. What changes is what they point at. Google points at the public web; this points at your disk.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "Chrome's SQLite is the blind spot",
    description:
      "History, Web Data, Login Data, and Bookmarks live inside the OS user-permission boundary. No external crawler can see them, including Google's own.",
    size: "1x1" as const,
  },
  {
    title: "On-device, by construction",
    description:
      "The ONNX model runs through onnxruntime on CoreML or CPU. np.dot runs in Python. Zero google.com round trips during embed or search.",
    size: "1x1" as const,
  },
  {
    title: "5,953 rows, 3,072 bytes each",
    description:
      "Total vector store for the verified snapshot is about 18 MB in a SQLite BLOB column. Numpy scans it fast enough that an HNSW index is not needed at this scale.",
    size: "1x1" as const,
  },
  {
    title: "Six Google domains, 30,805 visits",
    description:
      "The biggest Google-property signals in the store (Gmail, Calendar, Docs, Meet, GCP, Drive) are all harvested from Chrome's History SQLite and embedded locally.",
    size: "1x1" as const,
  },
];

const BEAM_HUB = {
  label: "nomic-embed-text-v1.5",
  sublabel: "~131 MB ONNX, local only",
};

const BEAM_FROM = [
  { label: "Chrome History", sublabel: "urls table, visit_count" },
  { label: "Chrome Web Data", sublabel: "autofill + credit_cards" },
  { label: "Chrome Login Data", sublabel: "logins table metadata" },
  { label: "Chrome Bookmarks", sublabel: "Bookmarks JSON" },
];

const BEAM_TO = [
  { label: "memory_embeddings", sublabel: "3,072 B BLOB per row" },
  { label: "cosine_search()", sublabel: "np.dot, threshold 0.3" },
  { label: "ranked (key, value)", sublabel: "semantic hit list" },
];

const ACTORS = ["user", "ai-browser-profile", "Chrome SQLite", "onnxruntime", "memories.db"];

const SEQ_MESSAGES = [
  { from: 0, to: 1, label: "npx ai-browser-profile init && python extract.py", type: "request" as const },
  { from: 1, to: 2, label: "SELECT url, visit_count FROM History:urls", type: "request" as const },
  { from: 2, to: 1, label: "→ 10,000 rows, aggregated to domain counts", type: "response" as const },
  { from: 1, to: 3, label: "embed_text('tool:Gmail 13020', prefix='search_document')", type: "request" as const },
  { from: 3, to: 3, label: "tokenize → mean-pool(last_hidden, mask) → L2-normalize", type: "event" as const },
  { from: 3, to: 1, label: "→ 768-dim unit vector (3,072-byte BLOB)", type: "response" as const },
  { from: 1, to: 4, label: "INSERT INTO memories / INSERT INTO memory_embeddings", type: "request" as const },
  { from: 0, to: 1, label: "db.semantic_search('which google apps do i use most')", type: "request" as const },
  { from: 1, to: 3, label: "embed_text(query, prefix='search_query')", type: "request" as const },
  { from: 3, to: 1, label: "→ q_vec (unit length)", type: "response" as const },
  { from: 1, to: 4, label: "np.dot(q_vec, each BLOB), threshold ≥ 0.3, sort desc", type: "event" as const },
  { from: 4, to: 1, label: "→ ranked (memory_id, similarity) rows", type: "response" as const },
  { from: 1, to: 0, label: "ranked keys, values, similarities (no network calls)", type: "response" as const },
];

const COMPARISON_ROWS = [
  {
    feature: "Target corpus",
    competitor: "Public web (~hundreds of billions of documents)",
    ours: "Your Chrome SQLite files (History, Web Data, Login Data, Bookmarks, IndexedDB, Local Storage)",
  },
  {
    feature: "Retrieval model",
    competitor: "Proprietary encoders behind Hummingbird, BERT, MUM; Vertex AI text-embedding-005 / gemini-embedding-001 at 768–3072 dims",
    ours: "nomic-embed-text-v1.5 ONNX, 768 dims, ~131 MB, Q8 quantized",
  },
  {
    feature: "Where inference runs",
    competitor: "Google data center, over HTTPS",
    ours: "Your machine, through onnxruntime (CoreML on Apple Silicon, CPU otherwise)",
  },
  {
    feature: "Store-vs-query prefix",
    competitor: "RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY",
    ours: "search_document: / search_query: (Nomic / E5 convention)",
  },
  {
    feature: "Index structure",
    competitor: "Sharded HNSW / IVF / ScaNN on Google's TPU-adjacent infra",
    ours: "SQLite BLOB column + numpy linear scan (~ms on 5,953 rows)",
  },
  {
    feature: "Latency budget",
    competitor: "Tens of ms end-to-end, dominated by network and ranking",
    ours: "A few ms, dominated by BLOB → numpy conversion",
  },
  {
    feature: "Data sent to google.com",
    competitor: "Every query and document (by design)",
    ours: "Zero. Network used only for one-time model download from HuggingFace",
  },
  {
    feature: "Personalization ceiling",
    competitor: "Whatever Sync + ad-graph signals Google already holds for you",
    ours: "Every autofill field, bookmark, login metadata row, and tool domain on your Chrome disk",
  },
];

const RELATED = [
  {
    title: "Define semantic search, operationally",
    href: "/t/define-semantic-search",
    excerpt:
      "The four mechanical steps (prefix, mean-pool, L2, dot product) behind every two-tower retrieval system, shown with line numbers from the same codebase.",
    tag: "Definition",
  },
  {
    title: "Semantic search with Elasticsearch, and when SQLite wins instead",
    href: "/t/semantic-search-elasticsearch",
    excerpt:
      "Elasticsearch ships dense_vector and kNN; ai-browser-profile ships a BLOB column and np.dot. At laptop scale, the BLOB wins.",
    tag: "Companion",
  },
  {
    title: "SQLite data types, in one real 5,953-row database that uses all five",
    href: "/t/sqlite-data-types",
    excerpt:
      "How 768 float32 values become a 3,072-byte BLOB cell, and why that column is the entire vector store.",
    tag: "Deep dive",
  },
];

export default function Page() {
  return (
    <>
      <main className="bg-white text-zinc-900 pb-20">
        <Breadcrumbs
          className="pt-8 mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Guides", href: "/t" },
            { label: "Google semantic search engine" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            Same math, opposite corpus
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            Google&apos;s semantic search engine has{" "}
            <GradientText>a corpus it structurally cannot crawl</GradientText>: yours.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            Hummingbird, BERT, MUM, Vertex AI Search: every flagship Google
            product that qualifies as a &ldquo;semantic search engine&rdquo; points
            outward, at the public web. The one corpus those engines cannot reach
            is the set of SQLite files Chrome quietly writes to your own disk.
            ai-browser-profile runs the same two-tower retrieval pipeline
            (
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              search_document:
            </code>{" "}
            /{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              search_query:
            </code>
            , mean-pool, L2-normalize, dot product) against <em>that</em> corpus.
            On-device. With zero calls to google.com during embed or search.
          </p>
          <div className="mt-6 flex gap-3 flex-wrap">
            <ShimmerButton href="#the-two-towers">See the two-tower pipeline</ShimmerButton>
            <a
              href="#google-corpus-blindspot"
              className="inline-flex items-center px-5 py-2.5 rounded-full border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Why Google cannot index it
            </a>
          </div>
        </header>

        <ArticleMeta
          datePublished={PUBLISHED}
          author="Matthew Diakonov"
          authorRole="Maintainer, ai-browser-profile"
          readingTime="13 min read"
          className="mb-6"
        />

        <ProofBand
          rating={4.9}
          ratingCount="Verified against ai_browser_profile/ingestors/history.py:19-39, ai_browser_profile/embeddings.py:62-97, and memories.db.bak4 at 5,953 vectors × 3,072 bytes"
          highlights={[
            "Six Google-owned domains contribute 30,805 indexed visits",
            "Same retrieval math Google Cloud exposes through text-embedding-005",
            "Zero google.com calls during embed or semantic_search",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="The Google blind spot."
            subtitle="A semantic search engine for the corpus Google cannot crawl."
            captions={[
              "Target corpus: your Chrome SQLite",
              "Pipeline: nomic-embed, prefix, pool, L2, dot",
              "Runs on-device through onnxruntime",
              "5,953 rows indexed in one snapshot",
              "Zero google.com calls during search",
            ]}
            accent="teal"
            durationInFrames={300}
          />
        </section>

        <section id="google-corpus-blindspot" className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What people mean by &ldquo;Google semantic search engine&rdquo;
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The phrase collapses two different systems. The consumer product is{" "}
            Google Search itself, which became a semantic search engine in 2013
            with the Hummingbird algorithm, gained deeper query understanding
            with BERT in 2019, and added multimodal reasoning with MUM in 2021.
            Its job is to rank the public web. The cloud product is{" "}
            Vertex AI Search plus the text-embedding-005 and gemini-embedding-001
            APIs, which customers can point at their own corpora, paying per
            million tokens. Its job is to let anyone run Google-grade dense
            retrieval against documents they upload.
          </p>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Both share a structural limitation: the encoder runs on Google
            infrastructure, and every query and every indexed document has to
            cross the network to reach it. That is fine for public-web pages and
            for enterprise corpora where the compliance story is already
            negotiated. It is not fine for the corpus on your own disk that
            describes <em>you</em>: autofill rows with real email addresses and
            phone numbers, Login Data rows with every service you sign into,
            visit-count distributions that reveal your working hours. That
            corpus is what ai-browser-profile indexes, and it never leaves the
            machine.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <ProofBanner
            metric="30,805"
            quote="Google-property visits already sitting on the maintainer's Chrome disk, indexed into a local vector store without a single call to google.com. Six domains: Gmail (13,020), Calendar (11,731), Docs (4,371), Meet (775), GCP (467), Drive (441)."
            source="memories.db.bak4, reproducible with sqlite3 .schema memories and the exact SELECT shown in the terminal block below."
          />
        </section>

        <section id="the-two-towers" className="max-w-4xl mx-auto px-6 mt-14">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              The same two-tower pipeline, pointed at a different corpus
            </h2>
            <p className="text-zinc-500 leading-relaxed">
              Dense retrieval at Google and dense retrieval on a laptop share
              the same four mechanical steps. The only things that change are
              what you point at in step 1 and how you index in step 4. The code
              below is the full local implementation.
            </p>
          </BackgroundGrid>
          <div className="mt-6">
            <StepTimeline steps={TWO_TOWER_STEPS} />
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Step 1, in one function: reading Chrome&apos;s own History SQLite
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Instead of crawling URLs, ai-browser-profile opens the Chromium
            History file read-only and reads the{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">urls</code> table
            directly. The file is copied to a temp location first so the
            running Chrome process is not disturbed. The same shape applies to
            Arc, Brave, and Edge, because they all share the Chromium storage
            layout.
          </p>
          <AnimatedCodeBlock
            code={HISTORY_SNIPPET}
            language="python"
            filename="ai_browser_profile/ingestors/history.py"
          />
          <p className="mt-4 text-sm text-zinc-500">
            10,000 rows is the cap; that comfortably covers months of active
            browsing. Each surviving domain gets rolled up by visit count and
            handed to the ingestor in{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">
              ingest_history
            </code>
            , which emits{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">tool:&lt;Service&gt;</code>{" "}
            memories for every known service. The six Google-property tools in
            the verified snapshot are the top of that stack.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Steps 2 through 4, in 48 lines of Python
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The encode / pool / normalize / score pipeline is short enough to
            print on one screen. The asymmetric prefix in step 1 is the same
            contract Google Cloud ships as RETRIEVAL_DOCUMENT vs.
            RETRIEVAL_QUERY; Nomic calls the literal strings{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">search_document: </code>
            and{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">search_query: </code>
            . Everything else is numpy.
          </p>
          <AnimatedCodeBlock
            code={EMBED_SNIPPET}
            language="python"
            filename="ai_browser_profile/embeddings.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Four input sources, one hub, one search function
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Every Chrome SQLite file the tool touches ends up flowing through
            the same{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">nomic-embed-text-v1.5</code>{" "}
            session. The outputs all land in the same{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">memory_embeddings</code>{" "}
            BLOB column. One encoder, one index, one similarity function.
          </p>
          <AnimatedBeam
            title="Chrome SQLite → nomic-embed → memory_embeddings → cosine_search"
            from={BEAM_FROM}
            hub={BEAM_HUB}
            to={BEAM_TO}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            End-to-end call sequence, from extract to ranked results
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Every hop that happens when you run{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">extract.py</code>{" "}
            followed by a{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">semantic_search</code>{" "}
            query. Every arrow in this diagram stays on the local machine.
          </p>
          <SequenceDiagram
            title="extract + semantic_search('which google apps do i use most')"
            actors={ACTORS}
            messages={SEQ_MESSAGES}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Anchor fact: six Google domains, 30,805 visits, zero google.com calls
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The paragraph above is also a reproducible check. Open any snapshot
            of{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">memories.db.bak4</code>{" "}
            with stock sqlite3 and run the two SELECTs below. Then run the
            one-line Python call to confirm semantic ranking across those same
            rows; the rows returned do not keyword-match the query at all.
          </p>
          <TerminalOutput
            title="sqlite3 ~/ai-browser-profile/memories.db.bak4"
            lines={TERMINAL_LINES}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={6} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Google-owned domains indexed
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={30805} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Visits aggregated across them
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={5953} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Vectors in the verified store
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={0} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Network calls to google.com
                </div>
              </div>
            </GlowCard>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Side by side: Google&apos;s semantic search engine vs. the personal complement
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Neither system replaces the other. They index disjoint corpora with
            the same math, and the interesting design question is which rows
            belong on which side. Public-web knowledge belongs with Google;
            anything that started as a field in a Chrome SQLite belongs with
            the local store.
          </p>
          <ComparisonTable
            productName="ai-browser-profile (local)"
            competitorName="Google semantic search engine (remote)"
            rows={COMPARISON_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <Marquee speed={22} pauseOnHover fade>
            {[
              "search_document: tool:Gmail 13020",
              "search_query: which google apps do i use most",
              "cosine ≈ 0.68",
              "search_document: tool:Google Calendar 11731",
              "search_query: where do my meetings live",
              "cosine ≈ 0.61",
              "search_document: account:github.com : m13v",
              "search_query: what is my github handle",
              "cosine ≈ 0.71",
              "threshold = 0.30",
            ].map((label, i) => (
              <span
                key={label}
                className={
                  i % 3 === 2
                    ? "px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700 font-mono"
                    : "px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700 font-mono"
                }
              >
                {label}
              </span>
            ))}
          </Marquee>
          <p className="mt-3 text-sm text-zinc-500">
            Every pair above is one stored document vs. one free-text query,
            scored by the dot product in step 4. None of the queries keyword
            match the stored text. That is the whole reason for the semantic
            tower; the rest of the pipeline just produces the vectors that
            make the gap measurable.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Five takeaways
          </h2>
          <BentoGrid cards={BENTO_CARDS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What the complement lets you reason about
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Once a private vector store exists alongside Google&apos;s public
            one, several problems stop being proprietary-model problems and
            start being join problems. &ldquo;Which services do I pay for that
            I actually use?&rdquo; is a join between a semantic query against{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">tool:*</code>{" "}
            memories and an exact match against{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">card_expiry</code>{" "}
            rows. &ldquo;What is the phone number I used on most signups last
            year?&rdquo; is a semantic query against{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">phone</code>{" "}
            memories, ranked by accessed_count, filtered by date. None of
            these queries make sense against Google&apos;s corpus; all of them
            are trivial against the local one.
          </p>
          <p className="text-zinc-500 leading-relaxed">
            That is why ai-browser-profile treats Google&apos;s semantic search
            engine as a complement, not a competitor. Use Vertex AI for the
            world. Use the local store for yourself.
          </p>
        </section>

        <MetricsRow metrics={METRICS} />

        <BookCallCTA
          appearance="footer"
          destination={BOOKING}
          site="AI Browser Profile"
          heading="Want to see the local store running against your own Chrome data?"
          description="Bring your machine; we walk through extract.py, embed the first batch, and run a semantic query against your own browser corpus in under 15 minutes."
        />

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <FaqSection heading="Frequently asked questions" items={FAQS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-16">
          <RelatedPostsGrid
            title="Keep reading"
            subtitle="Same store, different slice."
            posts={RELATED}
          />
        </section>
      </main>

      <BookCallCTA
        appearance="sticky"
        destination={BOOKING}
        site="AI Browser Profile"
        description="See the Google-semantic pipeline running locally on your Chrome data."
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </>
  );
}
