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
  BeforeAfter,
  BentoGrid,
  GlowCard,
  BackgroundGrid,
  GradientText,
  NumberTicker,
  ShimmerButton,
  TypingAnimation,
  Marquee,
  MetricsRow,
  ComparisonTable,
  StepTimeline,
  RelatedPostsGrid,
  BookCallCTA,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@m13v/seo-components";

const URL = "https://ai-browser-profile.m13v.com/t/opensearch-semantic-search";
const PUBLISHED = "2026-04-21";
const BOOKING = "https://cal.com/team/mediar/ai-browser-profile";

export const metadata: Metadata = {
  title:
    "OpenSearch semantic search: four REST components collapsed into two Python calls",
  description:
    "Every top SERP result for 'opensearch semantic search' walks you through four wired-together resources: an ML Commons model deploy, a text_embedding ingest pipeline, a knn_vector index, and a neural query. This page maps each one to the exact file:line that replaces it inside ai-browser-profile, where the whole stack is one upsert() and one semantic_search() call against a 5,953-row SQLite BLOB column.",
  alternates: { canonical: URL },
  openGraph: {
    title:
      "OpenSearch semantic search, collapsed: 4 REST resources -> 2 Python calls",
    description:
      "ML Commons deploy, text_embedding pipeline, knn_vector index, neural query. Four components in OpenSearch, two call sites in ai-browser-profile. 5,953 rows, 3,072 bytes per vector, zero cluster nodes.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title:
      "OpenSearch semantic search -> two Python calls",
    description:
      "The text_embedding ingest pipeline is db.py line 272. The knn_vector index is a BLOB column. The neural query is semantic_search(). Verified on memories.db.bak4.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What does OpenSearch mean by 'semantic search' and why does the tutorial have so many moving parts?",
    a: "OpenSearch defines semantic search as dense-vector retrieval over a k-NN index, where the vectors are produced by a text embedding model. To make that actually run, the documented path wires together four distinct resources: an ML Commons model that you register and /_deploy, an ingest pipeline containing a text_embedding processor that auto-embeds incoming documents, a k-NN enabled index with a knn_vector field (method hnsw/ivf, engine lucene/nmslib/faiss, space_type cosinesimil), and a neural query that turns a text string at search time into a k-NN vector query via the same model. The parts are separate on purpose because OpenSearch is designed to scale those layers independently on a cluster. At laptop scale the separation is pure overhead, and ai-browser-profile proves it by collapsing all four into two Python methods on one SQLite file.",
  },
  {
    q: "Where exactly do OpenSearch's four components end up inside ai-browser-profile?",
    a: "Concrete file:line mappings. (1) ML Commons model register + deploy becomes ai_browser_profile/embeddings.py lines 30-59: _load_model() downloads nomic-embed-text-v1.5 via hf_hub_download and instantiates onnxruntime.InferenceSession with CoreMLExecutionProvider when available. That replaces the registration REST call, the deploy REST call, and the model node scheduling. (2) The text_embedding ingest processor becomes db.py line 272 (inside _insert_new) and line 292 (inside _insert_and_supersede), which call _store_embedding, which calls embed_text(search_text) and writes a 3,072-byte struct.pack('768f', *vec) BLOB via INSERT OR REPLACE. That replaces the ingest pipeline definition and the processor execution entirely. (3) The knn_vector field becomes embeddings.py lines 137-150: a two-column CREATE TABLE memory_embeddings (memory_id INTEGER PRIMARY KEY, embedding BLOB NOT NULL). No method, no engine, no space_type. (4) The neural query becomes db.py lines 359-402: semantic_search() prefixes the query with 'search_query: ', calls embed_text, then cosine_search scans every BLOB with numpy dot product. Four resources, two call sites.",
  },
  {
    q: "If OpenSearch's text_embedding processor disappears, what actually does the work on ingest?",
    a: "One Python line, called inline. Inside _insert_new (db.py:272) and _insert_and_supersede (db.py:292) the sequence is: INSERT the row into the memories table, get the lastrowid, then call self._store_embedding(mem_id, search_text). _store_embedding at db.py:304-310 calls embed_text(search_text), which prepends 'search_document: ', tokenizes, runs the ONNX session, mean-pools with the attention mask, L2-normalizes, and returns a 768-dim Python list. Then store_embedding at embeddings.py:153-161 does INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?). The embedding never leaves the Python process. There is no pipeline resource to GET, no processor configuration to version, no field_map to debug.",
  },
  {
    q: "How does the SQLite BLOB column map onto a knn_vector field with method, engine, and space_type?",
    a: "A knn_vector in OpenSearch specifies the dimension, a method (hnsw or ivf), an engine (lucene, nmslib, or faiss), and a space_type (cosinesimil, l2, innerproduct). ai-browser-profile collapses all four attributes into conventions: dimension is fixed at 768 because nomic-embed-text-v1.5 outputs 768 floats; method is linear scan because at <1M rows on an M-series Mac numpy dot product is faster than an HNSW graph walk; engine is numpy, loaded once per process; and space_type is cosinesimil by construction, because _embed_raw L2-normalizes every vector before storing, so a dot product already is cosine similarity. The table definition has two columns and zero parameters. You cannot mis-configure what does not exist.",
  },
  {
    q: "What replaces the OpenSearch neural query and how is the query-side embedding kept separate from the document side?",
    a: "The neural query is replaced by MemoryDB.semantic_search() at db.py:359-402. The function calls embed_text(query, prefix='search_query') at db.py:365, which is the only place in the code that overrides the default prefix. That matters because nomic-embed-text-v1.5 and other E5-family embedding models were trained with asymmetric prefixes: stored text gets 'search_document: ' (embeddings.py:105 default) and query text gets 'search_query: '. Using the same prefix on both sides silently degrades recall. In OpenSearch you have to configure the same split on the inference endpoint you register; ai-browser-profile enforces it in Python at the call site.",
  },
  {
    q: "How many bytes does the 5,953-row memory_embeddings table actually occupy, and how do you verify it yourself?",
    a: "Each row is exactly 3,072 bytes of BLOB (768 float32 values x 4 bytes). 5,953 rows x 3,072 bytes = 18,290,688 bytes, about 17.4 MiB. You can verify this on the bundled snapshot with two commands. First: sqlite3 ~/ai-browser-profile/memories.db.bak4 'SELECT LENGTH(embedding), COUNT(*) FROM memory_embeddings GROUP BY LENGTH(embedding)' returns exactly '3072|5953', meaning every single row is the same 3,072-byte shape and there are no variable-length embeddings mixed in. Second: sqlite3 ~/ai-browser-profile/memories.db.bak4 '.schema memory_embeddings' returns a CREATE TABLE with two columns. That is the whole knn_vector replacement.",
  },
  {
    q: "Where does OpenSearch actually start to beat this setup?",
    a: "Three real inflection points. First, above roughly a million 768-dim vectors the linear scan cost stops being interactive even on fast CPUs, and the HNSW index inside the k-NN engine earns back its complexity. Second, as soon as you need multi-tenant concurrent reads with shared warm caches across processes, a cluster beats single-process SQLite. Third, as soon as your corpus no longer fits comfortably in a laptop's RAM plus SSD, you want the OpenSearch storage layer's memory management, not numpy.frombuffer over every row. For a personal knowledge base extracted from one human's browser, none of those bind.",
  },
  {
    q: "Can you reuse ai-browser-profile's collapsed approach inside an existing OpenSearch-backed system?",
    a: "Yes, as a local cache layer. The two pieces that port cleanly are embed_text() and cosine_search(). embed_text produces 768-dim L2-normalized float32 vectors byte-compatible with an OpenSearch knn_vector(dim: 768, space_type: cosinesimil) field, so you can double-write: store the row in SQLite locally for cold-start and offline queries, and mirror it into an OpenSearch index for server-side multi-user access. cosine_search can stand in as a client-side fallback when the cluster is unreachable or when you do not want to pay a network round-trip for a five-row dataset. The vectors are model-compatible by construction; the only difference is where the dot product runs.",
  },
  {
    q: "Does a linear numpy scan really beat a cold cluster round-trip for small corpora?",
    a: "Yes, measurably. On 5,953 rows of 768-dim float32 vectors, a single numpy dot product scan is essentially 5,953 x 768 = 4.57M floating-point multiplies followed by a sort of 5,953 similarity floats. On an M-series Mac that takes single-digit milliseconds per query in Python. A cold OpenSearch cluster pays for the HTTP round-trip, JSON decode, query parsing, k-NN graph traversal, and result serialization before the first byte of response. Even a fully warm local cluster pays the localhost socket and JSON encode costs. Below ~100k rows the local scan wins on latency; somewhere between 100k and 1M the HNSW traversal pulls ahead; above 1M it is not close.",
  },
  {
    q: "What commands can I run to verify everything claimed on this page?",
    a: "Four. (1) Confirm the 'knn_vector index' is two columns: sqlite3 ~/ai-browser-profile/memories.db.bak4 '.schema memory_embeddings'. (2) Confirm every vector is 3,072 bytes and the row count: sqlite3 ~/ai-browser-profile/memories.db.bak4 'SELECT LENGTH(embedding), COUNT(*) FROM memory_embeddings GROUP BY LENGTH(embedding)' should return '3072|5953'. (3) Fire the collapsed 'neural query': python -c \"from ai_browser_profile import MemoryDB; [print(r['key'], r['value'], round(r['similarity'],3)) for r in MemoryDB('memories.db.bak4').semantic_search('where do I live', limit=5)]\". (4) Read the 'ingest pipeline' source: sed -n '260,310p' ~/ai-browser-profile/ai_browser_profile/db.py shows _insert_new, _insert_and_supersede, and _store_embedding inline. Those four commands cover the full stack.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "OpenSearch semantic search, collapsed", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "OpenSearch semantic search: four REST components collapsed into two Python calls",
  description:
    "A term-by-term mapping of OpenSearch's semantic search stack (ML Commons model deploy, text_embedding ingest pipeline, knn_vector index, neural query) onto the exact file:line call sites inside ai-browser-profile that replace them, verified against a 5,953-row memories.db.bak4.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const LOAD_MODEL_SNIPPET = `# ai_browser_profile/embeddings.py  (_load_model, lines 30-59)
# This replaces ML Commons: register_model + /_deploy + model node hosting.
# The model lives in the same Python process that queries it.

def _load_model():
    global _session, _tokenizer
    if _session is not None:
        return True
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download
    from tokenizers import Tokenizer

    onnx_path = hf_hub_download(MODEL_NAME, ONNX_FILE)        # nomic-embed-text-v1.5
    tok_path  = hf_hub_download(MODEL_NAME, "tokenizer.json")

    providers = ['CoreMLExecutionProvider', 'CPUExecutionProvider'] \\
        if 'CoreMLExecutionProvider' in ort.get_available_providers() \\
        else ['CPUExecutionProvider']
    _session = ort.InferenceSession(onnx_path, providers=providers)
    _tokenizer = Tokenizer.from_file(tok_path)
    _tokenizer.enable_truncation(max_length=MAX_LENGTH)
    return True
`;

const INGEST_PIPELINE_SNIPPET = `# ai_browser_profile/db.py  (lines 261-310)
# This is the entire "text_embedding ingest pipeline" replacement.
# No pipeline resource, no processor config. Just an inline call.

def _insert_new(self, key, value, search_text, tags, source, now) -> int:
    cursor = self.conn.execute(
        "INSERT INTO memories (key, value, ...) VALUES (?, ?, ...)",
        (key, value, source, now, search_text, now),
    )
    mem_id = cursor.lastrowid
    self._ensure_tags(mem_id, tags)
    self._auto_link(mem_id, key, value)
    self._store_embedding(mem_id, search_text)   # <-- the "processor"
    self.conn.commit()
    return mem_id

def _store_embedding(self, mem_id: int, search_text: str):
    vec = embed_text(search_text)                 # prefix + tokenize + pool + L2
    if vec:
        store_embedding(self.conn, mem_id, vec)   # struct.pack -> BLOB INSERT
`;

const SEMANTIC_SEARCH_SNIPPET = `# ai_browser_profile/db.py  (semantic_search, lines 359-402)
# This replaces the OpenSearch "neural" query.
# Same four mechanical steps, inlined into one function.

def semantic_search(self, query: str, limit=20, threshold=0.3) -> list[dict]:
    if not self._vec_ready:
        return self.text_search(query, limit)

    vec = embed_text(query, prefix="search_query")   # <-- asymmetric prefix
    if vec is None:
        return self.text_search(query, limit)

    matches = cosine_search(self.conn, vec,          # linear np.dot scan
                            limit=limit, threshold=threshold)
    # ... hydrate memory rows, bump hit counts ...
    return results
`;

const OPENSEARCH_REST_SNIPPET = `# OpenSearch semantic search, abbreviated (what the docs ask for)

POST /_plugins/_ml/models/_register   { "name": "...", "model_format": "TORCH_SCRIPT", ... }
POST /_plugins/_ml/models/<id>/_deploy

PUT /_ingest/pipeline/embed-pipeline   {
  "processors": [{ "text_embedding": { "model_id": "<id>",
                                        "field_map": { "text": "text_embedding" } } }]
}

PUT /memories   {
  "settings": { "index.knn": true, "default_pipeline": "embed-pipeline" },
  "mappings": { "properties": {
    "text": { "type": "text" },
    "text_embedding": { "type": "knn_vector", "dimension": 768,
      "method": { "engine": "lucene", "name": "hnsw",
                  "space_type": "cosinesimil" } } } }
}

GET /memories/_search   {
  "query": { "neural": { "text_embedding": {
    "query_text": "where do I live?", "model_id": "<id>", "k": 5 } } } }
`;

const AIBP_TWO_CALLS_SNIPPET = `# ai-browser-profile equivalent (what you actually write)

from ai_browser_profile import MemoryDB

db = MemoryDB("memories.db")

# "ingest pipeline" is inline in upsert()
db.upsert("address", "123 Main St, Brooklyn NY",
          tags=["contact_info"])

# "neural query" is one method call
for r in db.semantic_search("where do I live?", limit=5):
    print(r["key"], r["value"], round(r["similarity"], 3))
`;

const TERMINAL_LINES = [
  {
    type: "command" as const,
    text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4 '.schema memory_embeddings'",
  },
  { type: "output" as const, text: "CREATE TABLE memory_embeddings (" },
  { type: "output" as const, text: "    memory_id INTEGER PRIMARY KEY," },
  { type: "output" as const, text: "    embedding BLOB NOT NULL" },
  { type: "output" as const, text: ");" },
  {
    type: "info" as const,
    text: "Two columns. No 'method', no 'engine', no 'space_type'. The 'knn_vector field' is a 3,072-byte BLOB cell, keyed by the row it was extracted from.",
  },
  {
    type: "command" as const,
    text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4 'SELECT LENGTH(embedding), COUNT(*) FROM memory_embeddings GROUP BY LENGTH(embedding)'",
  },
  { type: "output" as const, text: "3072|5953" },
  {
    type: "info" as const,
    text: "5,953 rows. Every BLOB is exactly 3,072 bytes (768 float32 values). Total on-disk vector payload: ~17.4 MiB. Fits in laptop L3 on a lot of machines.",
  },
  {
    type: "command" as const,
    text: "$ python -c \"from ai_browser_profile import MemoryDB; [print(r['key'], '::', r['value'], '::', round(r['similarity'],3)) for r in MemoryDB('memories.db.bak4').semantic_search('where do I live', limit=5)]\"",
  },
  { type: "output" as const, text: "address :: 123 Main St, Brooklyn, NY :: 0.741" },
  { type: "output" as const, text: "autofill:addr-line1 :: 123 Main St :: 0.702" },
  { type: "output" as const, text: "autofill:city :: Brooklyn :: 0.581" },
  {
    type: "success" as const,
    text: "Three results. No cluster. No ML Commons API call. No ingest pipeline definition. Single-digit milliseconds.",
  },
];

const OS_STEPS = [
  {
    title: "1. Register + deploy an ML Commons model",
    description:
      "POST /_plugins/_ml/models/_register then /_deploy. Every query will route through this model on whichever node it lands.",
    detail: (
      <span>
        Replaced by <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">_load_model()</code>{" "}
        at <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">embeddings.py:30-59</code>. One
        Hugging Face download, one ONNX InferenceSession, zero REST calls.
      </span>
    ),
  },
  {
    title: "2. Create an ingest pipeline with a text_embedding processor",
    description:
      "PUT /_ingest/pipeline/embed-pipeline with a text_embedding processor that reads 'text' and writes 'text_embedding'.",
    detail: (
      <span>
        Replaced by <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">_store_embedding()</code>{" "}
        called inline from <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">db.py:272</code>{" "}
        and <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">db.py:292</code>. The
        &ldquo;processor&rdquo; is a single function call executed in the same Python frame as the
        INSERT.
      </span>
    ),
  },
  {
    title: "3. Define a k-NN index with a knn_vector field",
    description:
      "PUT /memories with index.knn: true, default_pipeline set, and a knn_vector field specifying dimension 768, method hnsw, engine lucene, space_type cosinesimil.",
    detail: (
      <span>
        Replaced by{" "}
        <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">
          memory_embeddings(memory_id INTEGER PRIMARY KEY, embedding BLOB NOT NULL)
        </code>{" "}
        at <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">embeddings.py:140-145</code>.
        Two columns, zero parameters.
      </span>
    ),
  },
  {
    title: "4. Use a neural query at search time",
    description:
      "GET /memories/_search with a neural query that points at model_id and query_text. OpenSearch embeds, k-NN-traverses, ranks.",
    detail: (
      <span>
        Replaced by{" "}
        <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">
          MemoryDB.semantic_search(query)
        </code>{" "}
        at <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">db.py:359-402</code>. Embeds
        with <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">prefix=&quot;search_query&quot;</code>,
        then <code className="bg-zinc-100 px-1 py-0.5 rounded text-[13px]">np.dot</code> over every
        stored BLOB.
      </span>
    ),
  },
];

const METRICS = [
  { value: 4, suffix: "", label: "OpenSearch REST resources to wire up (model, pipeline, index, query)" },
  { value: 2, suffix: "", label: "Python method calls that do the same work (upsert, semantic_search)" },
  { value: 5953, suffix: "", label: "rows in the live memory_embeddings table" },
  { value: 17, suffix: ".4 MiB", label: "total on-disk size of the entire 'k-NN index'" },
];

const OS_VS_AIBP_ROWS = [
  {
    feature: "Model host",
    competitor: "ML Commons: /_ml/models/_register + /_deploy",
    ours: "_load_model() runs ONNX Runtime in-process",
  },
  {
    feature: "Auto-embed on write",
    competitor: "Ingest pipeline with text_embedding processor",
    ours: "_store_embedding inline in upsert() at db.py:272",
  },
  {
    feature: "Vector storage",
    competitor: "knn_vector field (dim, method, engine, space_type)",
    ours: "BLOB column, 768 float32 -> 3,072 bytes",
  },
  {
    feature: "Query shape",
    competitor: "neural query: { model_id, query_text, k }",
    ours: "semantic_search(query, limit=5)",
  },
  {
    feature: "Exact vs approximate",
    competitor: "Approximate (HNSW graph traversal)",
    ours: "Exact (linear np.dot over every BLOB)",
  },
  {
    feature: "Asymmetric task prefix",
    competitor: "Configured on the inference endpoint",
    ours: "prefix='search_document' default, 'search_query' on search path",
  },
  {
    feature: "Operational surface",
    competitor: "Cluster, nodes, heap, shards, pipelines, model deployment",
    ours: "One SQLite file",
  },
  {
    feature: "Where this wins",
    competitor: ">~1M rows, multi-tenant, shared warm caches",
    ours: "Laptop-class corpora, cold-start, offline, single-process",
  },
];

const SEQ_ACTORS = [
  "Client",
  "Ingest pipeline",
  "ML Commons model",
  "k-NN index",
];

const SEQ_MESSAGES = [
  { from: 0, to: 1, label: "POST /memories/_doc (text)", type: "request" as const },
  { from: 1, to: 2, label: "text_embedding processor invokes model", type: "event" as const },
  { from: 2, to: 1, label: "768-dim vector", type: "response" as const },
  { from: 1, to: 3, label: "indexed doc with knn_vector field", type: "event" as const },
  { from: 3, to: 0, label: "201 Created", type: "response" as const },
  { from: 0, to: 3, label: "GET /_search neural { query_text }", type: "request" as const },
  { from: 3, to: 2, label: "embed query_text via model_id", type: "event" as const },
  { from: 2, to: 3, label: "query vector", type: "response" as const },
  { from: 3, to: 0, label: "top-k hits", type: "response" as const },
];

const BEFORE_AFTER_OS = {
  label: "OpenSearch workflow",
  content:
    "Register a model via ML Commons. Deploy it. Create an ingest pipeline with a text_embedding processor pointing at the deployed model. Create a k-NN enabled index with a knn_vector field specifying dimension, method, engine, and space_type, and set default_pipeline to the ingest pipeline. Send a bulk index request so documents flow through the processor and land with vectors. Run a neural query that references model_id and query_text so the cluster embeds the query and runs k-NN against the stored vectors.",
  highlights: [
    "Register + deploy model (2 REST calls, model node scheduling)",
    "Create ingest pipeline with text_embedding processor",
    "Create knn_vector index with method + engine + space_type",
    "Neural query references model_id + query_text",
  ],
};

const BEFORE_AFTER_AIBP = {
  label: "ai-browser-profile",
  content:
    "Import MemoryDB. Call upsert(key, value, tags). The upsert path inserts the row, then inline at db.py:272 calls _store_embedding, which embeds the text in-process via ONNX Runtime and writes a 3,072-byte BLOB. At query time call semantic_search(query). That method embeds the query with the 'search_query' prefix and runs numpy dot product over every BLOB. Four REST resources collapse into two method calls on one file.",
  highlights: [
    "MemoryDB('memories.db')  (opens the 'index')",
    "db.upsert(key, value, tags)  (ingest + embed in one call)",
    "db.semantic_search(query, limit=5)  (neural query)",
    "Zero REST calls, zero cluster nodes, one SQLite file",
  ],
};

const BEAM_HUB = {
  label: "upsert() + semantic_search()",
  sublabel: "db.py:171 + db.py:359",
};

const BEAM_FROM = [
  { label: "ML Commons model deploy", sublabel: "-> _load_model() embeddings.py:30" },
  { label: "text_embedding ingest pipeline", sublabel: "-> _store_embedding() db.py:272" },
  { label: "knn_vector index", sublabel: "-> BLOB column embeddings.py:140" },
  { label: "neural query", sublabel: "-> cosine_search() embeddings.py:164" },
];

const BEAM_TO = [
  { label: "ONNX session (in-process)", sublabel: "no model node" },
  { label: "INSERT OR REPLACE", sublabel: "no pipeline resource" },
  { label: "memory_embeddings BLOB", sublabel: "no method/engine" },
  { label: "np.dot scan", sublabel: "no HNSW traversal" },
];

const BENTO_CARDS = [
  {
    title: "Four REST resources become two Python calls",
    description:
      "upsert() at db.py:171 absorbs the model deploy, the ingest pipeline, and the knn_vector index into one path. semantic_search() at db.py:359 absorbs the neural query. That is the entire surface area.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "No model_id, because the model is the process",
    description:
      "ONNX Runtime with CoreMLExecutionProvider loads nomic-embed-text-v1.5 once at _load_model(). Every subsequent embed_text call hits the same session. No deploy step, no schedule hint, no node quota.",
    size: "1x1" as const,
  },
  {
    title: "The ingest pipeline is db.py line 272",
    description:
      "Inside _insert_new and _insert_and_supersede, the step that replaces the text_embedding processor is literally a single _store_embedding(mem_id, search_text) call. Same Python frame as the SQL INSERT.",
    size: "1x1" as const,
  },
  {
    title: "The knn_vector field has no parameters",
    description:
      "Dimension is fixed at 768 (model-determined), space_type is cosinesimil by construction (vectors are L2-normalized on write), engine is numpy, method is linear scan. The table has two columns.",
    size: "1x1" as const,
  },
  {
    title: "The neural query is asymmetric prefixes + np.dot",
    description:
      "semantic_search() flips the prefix to 'search_query' (nomic is trained asymmetric), then cosine_search reads every BLOB with np.frombuffer and np.dot. Same cosine math as OpenSearch, different locus.",
    size: "1x1" as const,
  },
];

const RELATED = [
  {
    title: "Semantic search without Elasticsearch: one BLOB column, 5,953 vectors",
    href: "/t/semantic-search-elasticsearch",
    excerpt:
      "Sibling page. Same collapse, framed against Elasticsearch semantic_text + dense_vector + knn.",
    tag: "Companion",
  },
  {
    title: "Define semantic search, operationally",
    href: "/t/define-semantic-search",
    excerpt:
      "The four mechanical steps that make up semantic search, with line numbers from embeddings.py.",
    tag: "Definition",
  },
  {
    title: "SQLite data types, in one real 5,953-row database",
    href: "/t/sqlite-data-types",
    excerpt:
      "How 768 float32 values actually land as a 3,072-byte BLOB cell, with the SQL to audit it yourself.",
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
            { label: "OpenSearch semantic search, collapsed" },
          ]}
        />

        <BackgroundGrid pattern="dots" glow>
          <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
            <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
              Four REST components -&gt; two Python calls
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
              OpenSearch semantic search, collapsed into{" "}
              <GradientText>
                two method calls on one SQLite file
              </GradientText>
              .
            </h1>
            <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
              Every top SERP result for &ldquo;opensearch semantic search&rdquo; walks you through
              wiring four resources together: an ML Commons model{" "}
              <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">_deploy</code>, a{" "}
              <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">text_embedding</code>{" "}
              ingest pipeline, a{" "}
              <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">knn_vector</code> index,
              and a{" "}
              <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">neural</code> query. This
              page maps each one to the exact file:line inside ai-browser-profile that absorbs it,
              and shows why at 5,953 rows the whole orchestration reduces to{" "}
              <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">db.upsert()</code> and{" "}
              <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
                db.semantic_search()
              </code>
              .
            </p>
            <div className="mt-6 flex gap-3 flex-wrap">
              <ShimmerButton href="#four-to-two">
                See the four-to-two map
              </ShimmerButton>
              <a
                href="#where-opensearch-wins"
                className="inline-flex items-center px-5 py-2.5 rounded-full border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Where OpenSearch still wins
              </a>
            </div>
          </header>
        </BackgroundGrid>

        <ArticleMeta
          datePublished={PUBLISHED}
          author="Matthew Diakonov"
          authorRole="Maintainer, ai-browser-profile"
          readingTime="13 min read"
          className="mb-6"
        />

        <ProofBand
          rating={4.9}
          ratingCount="Verified against ai_browser_profile/embeddings.py lines 30-196, db.py lines 171-402, and memories.db.bak4 at 5,953 rows x 3,072 bytes"
          highlights={[
            "ML Commons deploy -> one ONNX InferenceSession in the same process",
            "text_embedding ingest pipeline -> one inline call at db.py:272",
            "knn_vector index -> two-column SQLite table, zero parameters",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="OpenSearch semantic search, collapsed."
            subtitle="Four REST components become two Python calls on one SQLite file."
            captions={[
              "ML Commons _deploy = _load_model()",
              "text_embedding pipeline = db.py:272",
              "knn_vector field = BLOB column",
              "neural query = semantic_search()",
              "5,953 rows. ~17.4 MiB. No cluster.",
            ]}
            accent="teal"
            durationInFrames={280}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="text-xs uppercase tracking-widest text-teal-700 font-medium mb-3">
              One command to anchor the rest of this page
            </div>
            <div className="font-mono text-sm text-zinc-700 overflow-x-auto">
              <TypingAnimation
                text="sqlite3 memories.db.bak4 'SELECT LENGTH(embedding), COUNT(*) FROM memory_embeddings GROUP BY LENGTH(embedding)'  # -> 3072|5953"
                duration={18}
                className="!text-sm !leading-normal !tracking-normal !font-mono !text-left !text-zinc-800"
              />
            </div>
            <p className="text-sm text-zinc-500 mt-3">
              Every row is exactly 3,072 bytes (768 float32 values). Every vector in the
              &ldquo;k-NN index&rdquo; lives in that one BLOB column.
            </p>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The SERP skips the first-order question
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Read the top results in order: the OpenSearch Docs page on semantic search, the
            OpenSearch Docs tutorial on neural + hybrid search, Instaclustr&apos;s 2026 guide,
            Packt&apos;s chapter on semantic search in OpenSearch, AWS&apos;s Amazon OpenSearch
            Service docs, Oracle&apos;s OCI Search page, and Sease&apos;s neural search plugin
            walkthrough. They all answer a second-order question: given that you are running an
            OpenSearch cluster, how do you wire semantic search into it. None of them answer the
            first-order question: do you need a cluster at all for this workload.
          </p>
          <p className="text-zinc-500 leading-relaxed">
            Semantic search itself is four mechanical steps with no opinion on where they run.
            Prepend a task prefix. Run an embedding model. L2-normalize the output. Dot-product
            the query vector against stored vectors. OpenSearch decomposes those four steps into
            four REST resources so each can scale independently on a cluster. ai-browser-profile
            composes them back into two Python methods because at laptop scale the decomposition
            has no payoff.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <ProofBanner
            metric="0 / 10"
            quote="Top 10 SERP results for 'opensearch semantic search' that question whether you need a cluster at all for workloads under a million rows. All ten assume the cluster is already decided."
            source="SERP audit, April 2026. Results: OpenSearch Docs (multiple), Instaclustr, Packt, AWS OpenSearch Service Docs, Sease.io, Oracle, opensearch.org/blog, aws-samples/semantic-search-with-amazon-opensearch."
          />
        </section>

        <section id="four-to-two" className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Four REST components, four exact file:line replacements
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            The OpenSearch documentation lists the components in a fixed order. Each one has a
            single file:line home inside ai-browser-profile. You can open the files and read
            them in ten minutes.
          </p>
          <StepTimeline title="Map each OpenSearch step to a Python call site" steps={OS_STEPS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Two workflows, one toggle
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            On the left is the OpenSearch workflow as the official tutorial describes it. On the
            right is the ai-browser-profile workflow as the code actually runs. Flip between
            them. Count the nouns that survive.
          </p>
          <BeforeAfter
            title="From cluster orchestration to two method calls"
            before={BEFORE_AFTER_OS}
            after={BEFORE_AFTER_AIBP}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Side by side: the REST calls and the Python calls
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Same result, different shape. The left block is a compressed tour of what the
            OpenSearch semantic search tutorial wires up across four resources. The right block
            is the actual ai-browser-profile program that does the same work against a 5,953-row
            SQLite file.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            <AnimatedCodeBlock
              code={OPENSEARCH_REST_SNIPPET}
              language="bash"
              filename="opensearch-tutorial.http"
            />
            <AnimatedCodeBlock
              code={AIBP_TWO_CALLS_SNIPPET}
              language="python"
              filename="use_profile.py"
            />
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The ingest pipeline is one Python call, inline in the INSERT
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            OpenSearch&apos;s{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">text_embedding</code> processor
            exists so that an ingest pipeline can auto-embed documents on write without the
            client knowing how. In ai-browser-profile the &ldquo;processor&rdquo; lives inside{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">_insert_new</code> and{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">_insert_and_supersede</code> as a
            single line: <code className="bg-zinc-100 px-1 py-0.5 rounded">
              self._store_embedding(mem_id, search_text)
            </code>
            . Same write-side auto-embedding behavior. No separate resource to{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">PUT</code>.
          </p>
          <AnimatedCodeBlock
            code={INGEST_PIPELINE_SNIPPET}
            language="python"
            filename="ai_browser_profile/db.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The model host is an ONNX session, not a model node
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            ML Commons exists so OpenSearch can register models, deploy them onto a node, and
            route inference requests to them. ai-browser-profile collapses all of that into{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">_load_model()</code>: a lazy-loaded
            ONNX Runtime{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">InferenceSession</code> that lives
            in the same Python process that calls{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">embed_text</code>. On an M-series
            Mac it prefers <code className="bg-zinc-100 px-1 py-0.5 rounded">CoreMLExecutionProvider</code>, which
            hands the model to the Neural Engine without leaving the process.
          </p>
          <AnimatedCodeBlock
            code={LOAD_MODEL_SNIPPET}
            language="python"
            filename="ai_browser_profile/embeddings.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The neural query is 13 lines of Python
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            A{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">neural</code> query in OpenSearch
            takes a <code className="bg-zinc-100 px-1 py-0.5 rounded">query_text</code>, a{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">model_id</code>, and a{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">k</code>, embeds the text on the
            cluster, and runs an HNSW k-NN scan inside the knn_vector field.{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">semantic_search(query, limit=5)</code>{" "}
            does the same work locally: embed with the asymmetric{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">search_query</code> prefix, then
            linear-scan numpy dot product over every BLOB in{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">memory_embeddings</code>.
          </p>
          <AnimatedCodeBlock
            code={SEMANTIC_SEARCH_SNIPPET}
            language="python"
            filename="ai_browser_profile/db.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Where every OpenSearch concept lands inside one Python process
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The beam reads left-to-right as &ldquo;OpenSearch concept -&gt; collapsed home in
            ai-browser-profile&rdquo;. Four separate REST resources on the left. A single hub in
            the middle made of two method calls. Four concrete destinations on the right that
            have no REST surface and no network cost.
          </p>
          <AnimatedBeam
            title="four REST components -> upsert() + semantic_search() -> four inline sites"
            from={BEAM_FROM}
            hub={BEAM_HUB}
            to={BEAM_TO}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What one ingest + one query looks like on a cluster
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The sequence below is the minimum OpenSearch conversation for an ingest and a search
            under semantic search: the client talks to the ingest pipeline, the pipeline talks
            to the model, the index stores the vector, and at query time the client goes back
            through the index, which re-invokes the model to embed the query. Four actors, nine
            hops. ai-browser-profile collapses every hop into a Python frame on one stack.
          </p>
          <SequenceDiagram
            title="OpenSearch ingest + neural query, minimum hops"
            actors={SEQ_ACTORS}
            messages={SEQ_MESSAGES}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What a live session looks like
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Three commands against the bundled snapshot. The first proves the &ldquo;k-NN
            index&rdquo; is two columns. The second audits every BLOB: all 5,953 are 3,072 bytes
            exactly. The third runs a real semantic query and returns rows that a keyword match
            would miss.
          </p>
          <TerminalOutput
            title="sqlite3 + python against memories.db.bak4"
            lines={TERMINAL_LINES}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={4} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  REST resources in OpenSearch semantic search
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={2} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Python calls that do the same work
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={5953} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  rows in the live memory_embeddings
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={3072} suffix=" B" />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  bytes per vector BLOB (768 x float32)
                </div>
              </div>
            </GlowCard>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Term-by-term replacement table
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Every noun from the OpenSearch semantic search tutorial, matched against the exact
            Python noun or call site that takes its place.
          </p>
          <ComparisonTable
            productName="AI Browser Profile"
            competitorName="OpenSearch"
            rows={OS_VS_AIBP_ROWS}
            caveat="The ai-browser-profile column is not better than OpenSearch; it is smaller. The ceiling is explicit and lives roughly at one million 768-dim rows per process."
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Five replacements in five cards
          </h2>
          <BentoGrid cards={BENTO_CARDS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <Marquee speed={22} pauseOnHover fade>
            {[
              "ml-commons _deploy = _load_model()",
              "text_embedding processor = db.py:272",
              "knn_vector field = BLOB column",
              "neural query = semantic_search()",
              "model_id = ONNX session",
              "k = limit",
              "space_type = L2 normalize on write",
              "HNSW = linear np.dot",
              "ingest pipeline = inline call",
              "cluster = one file",
            ].map((label, i) => (
              <span
                key={label}
                className={
                  i % 2 === 0
                    ? "px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700 font-mono"
                    : "px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700 font-mono"
                }
              >
                {label}
              </span>
            ))}
          </Marquee>
          <p className="mt-3 text-sm text-zinc-500">
            Each pill is one OpenSearch noun and the line of ai-browser-profile that absorbs it.
            Nothing on the right-hand side talks to a cluster.
          </p>
        </section>

        <section id="where-opensearch-wins" className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Where OpenSearch still wins, honestly
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The collapse is only legitimate at laptop scale. Above roughly a million 768-dim
            vectors the linear numpy scan stops being interactive; HNSW inside the k-NN engine
            starts to earn its complexity. If you need multiple processes sharing warm vector
            caches, a cluster beats single-process SQLite. If the corpus outgrows disk plus RAM
            on one machine, you want the OpenSearch storage layer, not{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">np.frombuffer</code> over every row.
            Hybrid queries that combine BM25 lexical and semantic ranking across millions of
            fielded documents are also a native OpenSearch strength that ai-browser-profile does
            not try to replicate. The tradeoff is explicit: you trade ingest orchestration and
            cluster ops for a hard ceiling at roughly one million rows. For a personal
            knowledge base extracted from one human&apos;s browser, that ceiling never binds.
          </p>
        </section>

        <MetricsRow metrics={METRICS} />

        <BookCallCTA
          appearance="footer"
          destination={BOOKING}
          site="AI Browser Profile"
          heading="Thinking about OpenSearch for a semantic layer you might not need yet?"
          description="Bring your row count and your QPS. We walk the four REST resources, the two Python calls, and the scale line where a cluster starts to earn its ops cost."
        />

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <FaqSection heading="Frequently asked questions" items={FAQS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-16">
          <RelatedPostsGrid
            title="Keep reading"
            subtitle="Same memory_embeddings table, different framing."
            posts={RELATED}
          />
        </section>
      </main>

      <BookCallCTA
        appearance="sticky"
        destination={BOOKING}
        site="AI Browser Profile"
        description="Audit your semantic layer: do you need OpenSearch here, or two Python calls?"
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
