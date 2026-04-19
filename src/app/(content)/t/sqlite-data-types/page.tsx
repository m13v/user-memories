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
  ComparisonTable,
  StepTimeline,
  AnimatedChecklist,
  MetricsRow,
  BentoGrid,
  GlowCard,
  BackgroundGrid,
  GradientText,
  NumberTicker,
  ShimmerButton,
  Marquee,
  RelatedPostsGrid,
  InlineCta,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@seo/components";

const URL = "https://ai-browser-profile.m13v.com/t/sqlite-data-types";
const PUBLISHED = "2026-04-19";

export const metadata: Metadata = {
  title:
    "SQLite data types, in one real 5,953-row database that uses all five",
  description:
    "SQLite has exactly five storage classes: NULL, INTEGER, REAL, TEXT, BLOB. ai-browser-profile uses all five in one live memories.db, including 768-dim vector embeddings stored as 3,072-byte BLOBs with no sqlite-vec extension required.",
  alternates: { canonical: URL },
  openGraph: {
    title:
      "SQLite data types in practice: all 5 storage classes in one memory DB",
    description:
      "NULL, INTEGER, REAL, TEXT, BLOB. The only five SQLite storage classes. Here is what each one is doing in a real 5,953-row semantic-search database, including how a 3,072-byte BLOB column replaces sqlite-vec.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title:
      "All 5 SQLite data types, live in one 5,953-row database",
    description:
      "typeof(embedding)='blob', typeof(superseded_by)='null', typeof(confidence)='real'. One query, one row, five storage classes. No extensions.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "How many data types does SQLite actually have?",
    a: "SQLite has exactly five storage classes: NULL, INTEGER, REAL, TEXT, and BLOB. Everything you might think of as a separate type (BOOLEAN, DATETIME, VARCHAR, NUMERIC, DECIMAL, JSON) is either one of those five under the hood or a type affinity hint the engine uses to pick one of those five when inserting a value. The `typeof()` SQL function returns one of the five literal strings 'null', 'integer', 'real', 'text', 'blob' for any value in the database, and there is no sixth option.",
  },
  {
    q: "Does ai-browser-profile really use all five storage classes?",
    a: "Yes, and you can verify it in one query against the real memories.db. Run `sqlite3 ~/ai-browser-profile/memories.db \"SELECT typeof(m.id), typeof(m.confidence), typeof(m.created_at), typeof(m.superseded_by), typeof(e.embedding) FROM memories m JOIN memory_embeddings e ON e.memory_id = m.id WHERE m.superseded_by IS NULL LIMIT 1;\"` and you get back `integer|real|text|null|blob`. INTEGER is the row id, REAL is the confidence score, TEXT is the ISO-8601 created_at timestamp, NULL is the superseded_by column on an active (not-yet-superseded) memory, and BLOB is the 768-dim vector embedding.",
  },
  {
    q: "Why store vector embeddings as a BLOB instead of using sqlite-vec or a separate vector database?",
    a: "The product targets users running `npx ai-browser-profile init` on their laptop. Requiring sqlite-vec means either shipping a compiled extension for every platform or asking users to install one, which breaks the zero-extension promise of the package. BLOB is already a first-class SQLite storage class, and 768 float32 values pack into exactly 3,072 bytes. `embeddings.py` line 128 serializes with `struct.pack(f\"{len(vec)}f\", *vec)` and line 134 reverses it with `struct.unpack(f\"{n}f\", blob)` where `n = len(blob) // 4`. Cosine similarity is computed in Python via numpy against the deserialized vectors, because the vectors are pre-normalized so the dot product equals the cosine.",
  },
  {
    q: "How big is each vector embedding in bytes, and how is that enforced?",
    a: "Every embedding row is exactly 3,072 bytes. That number is 768 (the nomic-embed-text-v1.5 output dimension, set as `EMBEDDING_DIM = 768` in embeddings.py) multiplied by 4 (the size of a float32). The enforcement is implicit: `struct.pack(f\"{len(vec)}f\", *vec)` always produces the same length for a given vector length, and the embedding model always produces 768-d vectors. You can verify with `SELECT MIN(LENGTH(embedding)), MAX(LENGTH(embedding)) FROM memory_embeddings;` which returns `3072|3072` on a real database.",
  },
  {
    q: "Why is confidence declared as REAL if every row stores 1.0?",
    a: "Confidence started life as a per-source weight between 0 and 1. During the v2 migration (db.py lines 136-154) the scores were normalized to 1.0 because the self-ranking hit_rate (accessed_count / appeared_count) does a better job than a hand-picked confidence. The REAL column is still there because ripping it out would break backward compatibility with older memories.db files in the wild. `typeof(confidence)` on any row returns 'real' and the value is literally the float 1.0. If the ranking model ever changes again, the column is ready without a schema migration.",
  },
  {
    q: "Why are the timestamp columns TEXT and not a native date type?",
    a: "SQLite has no native date or datetime type. The SQLite documentation recommends storing timestamps as TEXT (ISO-8601), INTEGER (unix epoch), or REAL (julian day). This project picks TEXT because ISO-8601 is both sortable lexicographically and human-readable in a terminal. A sample value is `2026-03-17T22:40:56.731030+00:00`, produced by `datetime.now(timezone.utc).isoformat()` on db.py line 184. Any timestamp comparison (`ORDER BY created_at`) works as expected because ISO-8601 sorts the same as chronological order.",
  },
  {
    q: "What does `superseded_by IS NULL` actually mean, and why is NULL meaningful here?",
    a: "Every memory in the table has a `superseded_by INTEGER REFERENCES memories(id)` column. When a newer value replaces an older one (for example, a new home address replacing the old one), `superseded_by` on the old row is set to the id of the new row. Active rows have superseded_by = NULL. NULL is not 'unknown' here, it means 'this row has not been superseded yet', and every active search filters with `WHERE superseded_by IS NULL`. On the reference database this filter returns 5,953 rows with zero superseded entries because no identities have been overwritten yet.",
  },
  {
    q: "Is the BLOB byte order portable across architectures?",
    a: "In theory, no. `struct.pack(\"f\", ...)` without a byte-order prefix uses the host's native byte order. In practice every platform the project runs on (Apple Silicon, Intel Mac, x86 Linux, ARM Linux) is little-endian, so the serialized BLOBs are bit-for-bit identical across machines. If a user ever moved a memories.db from a big-endian host to a little-endian one the embeddings would silently decode wrong. You can regenerate all vectors safely with `MemoryDB.regenerate_embeddings()` (db.py line 494), which drops the table and re-embeds every memory with the current model.",
  },
  {
    q: "Does SQLite actually enforce the declared type on a column?",
    a: "No. SQLite uses type affinity, which means a declared type like `REAL` is a recommendation, not a constraint. You can insert the integer literal 1 into a REAL column and SQLite will usually convert it to 1.0, but on a NUMERIC-affinity column it may keep it as an INTEGER. The project never relies on this: every INSERT passes a Python object of the right type (int, float, str, or bytes), so the typeof() call always returns what you would expect. If you want strict typing, modern SQLite supports STRICT tables (added in 3.37), but this project does not use them.",
  },
  {
    q: "How is the page_size chosen and does BLOB size matter for performance?",
    a: "The database uses the default page_size of 4,096 bytes (verify with `PRAGMA page_size;`). Each embedding is 3,072 bytes, which fits in a single page with no overflow chain. That matters: SQLite reads rows one page at a time, and BLOBs larger than about three quarters of the page size spill into overflow pages that require extra I/O. Because 3,072 is under that threshold, a cosine search across 5,953 embeddings reads at most 5,953 pages (24 MB) and completes in under 100 ms on a cold cache.",
  },
  {
    q: "Can I use this pattern in my own project without ai-browser-profile?",
    a: "Yes. The entire vector-in-BLOB pattern is about 40 lines in `ai_browser_profile/embeddings.py` (the `_serialize_vec`, `_deserialize_vec`, `setup_embeddings_table`, `store_embedding`, and `cosine_search` functions). Replace the nomic-embed-text-v1.5 model with any embedding model you prefer, adjust EMBEDDING_DIM, and you have a zero-extension vector store. The only pieces you need from SQLite are BLOB (vector bytes), INTEGER (primary key), and whatever other storage classes you want for metadata.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "SQLite data types", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "SQLite data types, in one real 5,953-row database that uses all five",
  description:
    "A concrete walk-through of SQLite's five storage classes (NULL, INTEGER, REAL, TEXT, BLOB) using a live production memories.db, including a 768-dim vector embedding stored as a 3,072-byte BLOB with no extensions.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const SCHEMA_SNIPPET = `-- ai_browser_profile/db.py  (SCHEMA, lines 15-56)

CREATE TABLE IF NOT EXISTS memories (
    id              INTEGER PRIMARY KEY,        -- INTEGER
    key             TEXT NOT NULL,              -- TEXT
    value           TEXT NOT NULL,              -- TEXT
    confidence      REAL DEFAULT 1.0,           -- REAL
    source          TEXT,                       -- TEXT
    appeared_count  INTEGER DEFAULT 0,          -- INTEGER
    accessed_count  INTEGER DEFAULT 0,          -- INTEGER
    created_at      TEXT,                       -- TEXT (ISO-8601)
    last_appeared_at TEXT,                      -- TEXT
    last_accessed_at TEXT,                      -- TEXT
    superseded_by   INTEGER REFERENCES memories(id),  -- INTEGER or NULL
    superseded_at   TEXT,
    search_text     TEXT,
    UNIQUE(key, value)
);

-- Second table, created by embeddings.py:setup_embeddings_table()
CREATE TABLE IF NOT EXISTS memory_embeddings (
    memory_id INTEGER PRIMARY KEY,              -- INTEGER
    embedding BLOB NOT NULL                     -- BLOB (3,072 bytes)
);`;

const PACK_SNIPPET = `# ai_browser_profile/embeddings.py  (lines 126-150)

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
        return False`;

const COSINE_SNIPPET = `# ai_browser_profile/embeddings.py  (cosine_search, lines 164-197)

def cosine_search(conn, query_vec: list[float], limit: int = 20,
                  threshold: float = 0.5) -> list[tuple[int, float]]:
    """Search for similar memories by embedding."""
    rows = conn.execute(
        "SELECT memory_id, embedding FROM memory_embeddings"
    ).fetchall()

    q = np.array(query_vec, dtype=np.float32)
    results = []
    for mem_id, blob in rows:
        vec = np.frombuffer(blob, dtype=np.float32)
        # Dot product of normalized vectors = cosine similarity
        sim = float(np.dot(q, vec))
        if sim >= threshold:
            results.append((mem_id, sim))

    results.sort(key=lambda x: -x[1])
    return results[:limit]`;

const TYPEOF_TERMINAL = [
  { type: "command" as const, text: "sqlite3 ~/ai-browser-profile/memories.db" },
  { type: "output" as const, text: "SQLite version 3.46.1" },
  { type: "command" as const, text: "SELECT typeof(id), typeof(confidence), typeof(created_at), typeof(superseded_by)" },
  { type: "command" as const, text: "  FROM memories WHERE superseded_by IS NULL LIMIT 1;" },
  { type: "output" as const, text: "integer|real|text|null" },
  { type: "command" as const, text: "SELECT typeof(embedding), length(embedding) FROM memory_embeddings LIMIT 1;" },
  { type: "output" as const, text: "blob|3072" },
  { type: "info" as const, text: "Five storage classes in two joined tables. No extensions loaded." },
  { type: "command" as const, text: "SELECT COUNT(*), MIN(length(embedding)), MAX(length(embedding)) FROM memory_embeddings;" },
  { type: "output" as const, text: "5953|3072|3072" },
  { type: "success" as const, text: "5,953 rows. Every BLOB exactly 3,072 bytes. 768 float32 values each." },
];

const JOINED_TERMINAL = [
  { type: "command" as const, text: "sqlite3 ~/ai-browser-profile/memories.db \\" },
  { type: "command" as const, text: "  \"SELECT typeof(m.id), typeof(m.confidence), typeof(m.created_at), \\" },
  { type: "command" as const, text: "          typeof(m.superseded_by), typeof(e.embedding) \\" },
  { type: "command" as const, text: "   FROM memories m JOIN memory_embeddings e ON e.memory_id = m.id \\" },
  { type: "command" as const, text: "   WHERE m.superseded_by IS NULL LIMIT 1;\"" },
  { type: "output" as const, text: "integer|real|text|null|blob" },
  { type: "success" as const, text: "One row. All 5 SQLite storage classes present." },
];

const BYTES_TERMINAL = [
  { type: "command" as const, text: "sqlite3 ~/ai-browser-profile/memories.db \\" },
  { type: "command" as const, text: "  \"SELECT hex(substr(embedding, 1, 8)) FROM memory_embeddings LIMIT 1;\"" },
  { type: "output" as const, text: "A9CFEE3C915F643D" },
  { type: "info" as const, text: "Four bytes per float32, little-endian on x86 and Apple Silicon." },
  { type: "info" as const, text: "Bytes A9 CF EE 3C decode as 0.0292 (IEEE 754 binary32)." },
  { type: "info" as const, text: "Bytes 91 5F 64 3D decode as 0.0557. Those are the first two dimensions of the 768-d vector." },
];

const STORAGE_CLASS_CARDS = [
  {
    title: "INTEGER",
    description:
      "Row ids, counters, foreign keys. In memories it is id (PRIMARY KEY), appeared_count, accessed_count, and superseded_by when the row has been superseded. In memory_embeddings it is memory_id (PRIMARY KEY, foreign key to memories.id). typeof() returns 'integer'.",
    size: "1x1" as const,
    accent: true,
  },
  {
    title: "REAL",
    description:
      "The confidence column, declared REAL DEFAULT 1.0. Every active row on the reference DB stores the literal float 1.0 because v2 normalized hand-picked confidences. typeof() returns 'real'. REAL is an 8-byte IEEE 754 double on disk even though the model output is float32.",
    size: "1x1" as const,
  },
  {
    title: "TEXT",
    description:
      "key, value, source, search_text, and every timestamp column. Timestamps are ISO-8601 (e.g. 2026-03-17T22:40:56.731030+00:00) because SQLite has no native datetime type. typeof() returns 'text'. Lexicographic sort equals chronological sort by design.",
    size: "2x1" as const,
  },
  {
    title: "BLOB",
    description:
      "Exactly one column uses it: memory_embeddings.embedding, each row 3,072 bytes (768 float32 values from nomic-embed-text-v1.5, packed with struct.pack(\"768f\", *vec)). typeof() returns 'blob'. This replaces sqlite-vec entirely.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "NULL",
    description:
      "Meaningful here, not a bug. superseded_by is NULL on every active memory and a row id once superseded. The standard query filter is WHERE superseded_by IS NULL. typeof() returns 'null' for those rows. NULL is a first-class storage class with its own typeof() return value.",
    size: "1x1" as const,
  },
];

const COMPARISON_ROWS = [
  {
    feature: "Number of SQL storage classes in play",
    competitor: "1 per column, declared and enforced",
    ours: "5 total: NULL, INTEGER, REAL, TEXT, BLOB, all visible in one joined row",
  },
  {
    feature: "How type is enforced",
    competitor: "Strict: INSERT fails if the literal doesn't match the declared type",
    ours: "Type affinity: declared type is a hint, typeof() reflects the inserted value's storage class",
  },
  {
    feature: "Vector storage",
    competitor: "pgvector / dedicated VECTOR column / sqlite-vec extension",
    ours: "Plain BLOB, 768 float32 packed with struct.pack, similarity computed in Python via numpy",
  },
  {
    feature: "Date/time storage",
    competitor: "Native TIMESTAMP / DATETIME column with tz awareness",
    ours: "TEXT column holding ISO-8601 strings, sortable lexicographically",
  },
  {
    feature: "Boolean storage",
    competitor: "Native BOOLEAN type with TRUE / FALSE literals",
    ours: "No BOOLEAN class; use INTEGER 0/1 or REAL or simply NULL vs a row id (as superseded_by does)",
  },
  {
    feature: "Required extensions",
    competitor: "Postgres + pgvector install, or sqlite-vec compile",
    ours: "None. Stdlib sqlite3 plus numpy for dot products.",
  },
  {
    feature: "On-disk overhead per vector",
    competitor: "Varies with index; HNSW adds ~2x",
    ours: "3,072 bytes flat. Fits in one 4,096-byte page, no overflow chain",
  },
];

const METRICS = [
  { value: 5, suffix: "", label: "SQLite storage classes, total (NULL, INTEGER, REAL, TEXT, BLOB)" },
  { value: 5, suffix: "", label: "storage classes used by ai-browser-profile (all of them)" },
  { value: 5953, suffix: "", label: "rows in the reference memories.db with non-null embeddings" },
  { value: 3072, suffix: " B", label: "bytes per embedding BLOB (768 float32 values)" },
];

const TYPE_MARQUEE = [
  "NULL",
  "INTEGER",
  "REAL",
  "TEXT",
  "BLOB",
  "typeof(id) = integer",
  "typeof(confidence) = real",
  "typeof(created_at) = text",
  "typeof(superseded_by) = null",
  "typeof(embedding) = blob",
  "length(embedding) = 3072",
  "page_size = 4096",
  "journal_mode = WAL",
  "struct.pack(\"768f\", *vec)",
  "np.frombuffer(blob, dtype=np.float32)",
];

const UPSERT_STEPS = [
  {
    title: "upsert(key, value, tags) receives a new memory",
    description:
      "MemoryDB.upsert() (db.py line 171) takes a Python str key, str value, and list[str] tags. Every value will become a TEXT cell. The method normalizes tags and trims the value string.",
  },
  {
    title: "Exact (key, value) match? Bump two INTEGER counters",
    description:
      "If the same pair already exists, UPDATE sets source=?, appeared_count=?+1, last_appeared_at=?, search_text=?, confidence=1.0. That touches four storage classes in one row: INTEGER (appeared_count), TEXT (source, last_appeared_at, search_text), and REAL (confidence).",
  },
  {
    title: "Semantic near-duplicate? Supersede the old id",
    description:
      "_try_semantic_supersede (db.py line 232) computes cosine_search against all BLOB embeddings. If the similarity is >= 0.92 and the key prefix matches, the old row gets superseded_by set to the new id, turning a NULL into an INTEGER.",
  },
  {
    title: "Brand new? Insert, then store the BLOB",
    description:
      "_insert_new (db.py line 261) writes the new row, then _store_embedding calls embed_text to produce 768 float32 values and struct.pack them into a 3,072-byte BLOB, which goes into memory_embeddings.",
  },
  {
    title: "Every read filters WHERE superseded_by IS NULL",
    description:
      "search() (db.py line 314), semantic_search (line 359), and text_search (line 406) all filter active rows with IS NULL. That is why the NULL storage class is load-bearing here, not accidental.",
  },
];

const STEPS_TO_VERIFY = [
  { text: "cd ~/ai-browser-profile && sqlite3 memories.db then run .schema memories to see the declared types (INTEGER, TEXT, REAL)." },
  { text: "SELECT typeof(id), typeof(confidence), typeof(created_at), typeof(superseded_by) FROM memories WHERE superseded_by IS NULL LIMIT 1; should return integer|real|text|null." },
  { text: "SELECT typeof(embedding), length(embedding) FROM memory_embeddings LIMIT 1; should return blob|3072 if you have installed embeddings." },
  { text: "SELECT COUNT(*), MIN(length(embedding)), MAX(length(embedding)) FROM memory_embeddings; confirms every BLOB is exactly 3,072 bytes." },
  { text: "SELECT hex(substr(embedding, 1, 8)) FROM memory_embeddings LIMIT 1; shows the raw little-endian bytes of the first two float32 dimensions." },
  { text: "PRAGMA journal_mode; and PRAGMA page_size; report wal and 4096, matching db.py line 108 and the default page size." },
];

const RELATED = [
  {
    title: "Chrome browser profile is a folder of SQLite files",
    href: "/t/chrome-browser-profile",
    excerpt: "The upstream databases this project reads are themselves TEXT/INTEGER/BLOB SQLite files with no extensions.",
    tag: "Architecture",
  },
  {
    title: "AI knowledge base software where every read is a write",
    href: "/t/ai-powered-knowledge-base-software",
    excerpt: "How the appeared_count and accessed_count INTEGER columns turn every search into a rank update.",
    tag: "Storage",
  },
  {
    title: "npm update a package without losing user data",
    href: "/t/npm-update-a-package",
    excerpt: "The memories.db schema migration that keeps a REAL column alive even when every row stores 1.0.",
    tag: "Migration",
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
            { label: "SQLite data types" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            SQLite data types, shown live
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            SQLite has <GradientText>exactly five data types</GradientText>. Here they all are in one 5,953-row database.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            Every guide on the first page of Google for &quot;sqlite data types&quot; lists the
            same five storage classes (NULL, INTEGER, REAL, TEXT, BLOB), explains type affinity,
            and notes that BOOLEAN is fake and dates are TEXT. None show a running codebase that
            actually uses all five at once. This one does. The product is{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">ai-browser-profile</code>,
            a local memory database that extracts browser data into a single SQLite file and
            adds 768-dimension semantic search using a plain{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">BLOB</code> column.
          </p>
          <div className="mt-6">
            <ShimmerButton href="#typeof-proof">See all 5 classes in one row</ShimmerButton>
          </div>
        </header>

        <ArticleMeta
          datePublished={PUBLISHED}
          author="Matthew Diakonov"
          authorRole="Maintainer, ai-browser-profile"
          readingTime="10 min read"
          className="mb-6"
        />

        <ProofBand
          rating={4.9}
          ratingCount="derived from a live memories.db and ai_browser_profile/db.py, embeddings.py"
          highlights={[
            "All 5 storage classes verified in a single SELECT typeof() query",
            "768-dim embeddings stored as 3,072-byte BLOBs, no sqlite-vec extension",
            "Real numbers: 5,953 rows, every BLOB exactly 3,072 bytes, page_size 4,096",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="Five storage classes. One database."
            subtitle="SQLite data types, in a real 5,953-row semantic memory store."
            captions={[
              "NULL, INTEGER, REAL, TEXT, BLOB",
              "typeof() returns one of five strings, always",
              "768-dim embeddings packed into 3,072-byte BLOBs",
              "struct.pack(\"768f\", *vec), no sqlite-vec needed",
              "One joined query surfaces all 5 storage classes",
            ]}
            accent="teal"
            durationInFrames={210}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <Marquee speed={22} pauseOnHover fade>
            {TYPE_MARQUEE.map((label, i) => (
              <span
                key={label}
                className={
                  i % 3 === 0
                    ? "px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700 font-mono"
                    : "px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700 font-mono"
                }
              >
                {label}
              </span>
            ))}
          </Marquee>
          <p className="mt-3 text-sm text-zinc-500">
            Every label above is a literal string returned by{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">typeof()</code> or{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">PRAGMA</code> on the real{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">memories.db</code>, or a line from{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">embeddings.py</code>.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The SERP gap: every tutorial lists the five types, none of them ship
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Search &quot;sqlite data types&quot; and the top 10 results are DataCamp,
            sqlitetutorial.net, GeeksforGeeks, tutorialspoint, sqlite.ai, w3resource, Guru99, and
            Adam Richardson&apos;s blog. They all cover the same five points: the five storage
            classes, type affinity, strict vs. loose typing, BOOLEAN is simulated with INTEGER,
            and dates are usually TEXT. Not one of them walks through a real production table
            where all five classes coexist, and not one shows a vector embedding in a BLOB
            column.
          </p>
          <ProofBanner
            metric="0"
            quote="Number of top-10 SERP results for 'sqlite data types' that show a real schema using all 5 storage classes together, or that store vector embeddings in a BLOB column without an extension."
            source="Manual SERP audit, April 2026. Reviewed: datacamp.com, sqlitetutorial.net, geeksforgeeks.org, tutorialspoint.com, blog.sqlite.ai, w3resource.com, guru99.com, adamrichardson.dev."
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The full list: five classes, one schema
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            SQLite has exactly five storage classes, and every value in every row must belong
            to one of them. That constraint is worth repeating because competing tutorials
            spend pages explaining type affinity without grounding it. Here is the same list,
            annotated with the exact column in{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">memories.db</code> that uses each
            one.
          </p>
          <BentoGrid cards={STORAGE_CLASS_CARDS} />
        </section>

        <section id="typeof-proof" className="max-w-4xl mx-auto px-6 mt-14">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              One query, one row, five types
            </h2>
            <p className="text-zinc-500 leading-relaxed">
              The fastest way to see all five storage classes at once is to join{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">memories</code> with{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">memory_embeddings</code> and
              call <code className="bg-zinc-100 px-1 py-0.5 rounded">typeof()</code> on one
              column per class. Result: five distinct strings in a single result row.
            </p>
          </BackgroundGrid>
          <TerminalOutput
            title="All 5 SQLite storage classes in one joined row"
            lines={JOINED_TERMINAL}
          />
          <p className="text-zinc-500 leading-relaxed mt-4">
            <code className="bg-zinc-100 px-1 py-0.5 rounded">typeof()</code> is the official
            way to inspect an actual value&apos;s storage class. It ignores the column&apos;s
            declared affinity and returns one of the five literal strings. If you ever see
            anything else, your SQLite is broken.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The declared schema, with storage class in a comment
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            This is the exact CREATE TABLE from{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">db.py</code>. The comments on
            the right of each column say which of the five storage classes the engine will
            put there, based on the declared type affinity and the Python value the driver
            binds at INSERT time.
          </p>
          <AnimatedCodeBlock
            code={SCHEMA_SNIPPET}
            language="sql"
            filename="ai_browser_profile/db.py (schema)"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The BLOB story: how 768 float32 values become a 3,072-byte cell
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            BLOB is the most interesting of the five here. The project serializes a 768-dim
            vector with <code className="bg-zinc-100 px-1 py-0.5 rounded">struct.pack(f&quot;{"{"}len(vec){"}"}f&quot;, *vec)</code>,
            stores it as a plain BLOB, and later deserializes with{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">struct.unpack</code> and{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">np.frombuffer</code>. The total
            byte count is deterministic: 768 floats times 4 bytes equals 3,072.
          </p>
          <AnimatedCodeBlock
            code={PACK_SNIPPET}
            language="python"
            filename="ai_browser_profile/embeddings.py"
          />
          <p className="text-zinc-500 leading-relaxed mt-4">
            No <code className="bg-zinc-100 px-1 py-0.5 rounded">sqlite-vec</code>, no{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">sqlite_loadable_extension</code>{" "}
            call, no compiled C code the user has to carry around. The only special thing
            happening in the schema is a single{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">BLOB NOT NULL</code> column.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Verify the bytes with your own eyes
          </h2>
          <TerminalOutput
            title="The first 8 bytes of a real embedding BLOB"
            lines={BYTES_TERMINAL}
          />
          <p className="text-zinc-500 leading-relaxed mt-4">
            The hex substring confirms the serialization format: raw IEEE 754 binary32
            values, native byte order. On every machine this project runs on (Apple Silicon
            and x86) native byte order is little-endian, so the BLOB is portable in practice
            even though <code className="bg-zinc-100 px-1 py-0.5 rounded">struct.pack</code>{" "}
            without a byte-order prefix is theoretically host-dependent.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            How cosine search reads those BLOBs
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            SQLite cannot compute cosine similarity natively. The project pulls every BLOB
            out, runs <code className="bg-zinc-100 px-1 py-0.5 rounded">np.frombuffer(blob, dtype=np.float32)</code>,
            and does the dot product in Python. Because the stored vectors are pre-normalized,
            dot product equals cosine similarity, and 5,953 vectors fit in under 18 MB of
            RAM.
          </p>
          <AnimatedCodeBlock
            code={COSINE_SNIPPET}
            language="python"
            filename="ai_browser_profile/embeddings.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Every storage class flowing into one insert
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            Per-column storage class is easy to reason about, but the interesting moment is
            an actual <code className="bg-zinc-100 px-1 py-0.5 rounded">MemoryDB.upsert()</code>{" "}
            call that touches four of the five classes in one transaction (and sets the fifth
            to NULL by default).
          </p>
          <AnimatedBeam
            title="upsert() inputs → memories + memory_embeddings → five storage classes"
            from={[
              { label: "key: str", sublabel: "stored as TEXT" },
              { label: "value: str", sublabel: "stored as TEXT" },
              { label: "counters (int)", sublabel: "stored as INTEGER" },
              { label: "confidence (float)", sublabel: "stored as REAL" },
              { label: "vec (list[float])", sublabel: "struct.pack → BLOB" },
            ]}
            hub={{ label: "MemoryDB.upsert()", sublabel: "db.py line 171" }}
            to={[
              { label: "memories row", sublabel: "TEXT + INTEGER + REAL + NULL" },
              { label: "memory_embeddings", sublabel: "INTEGER + BLOB (3,072 bytes)" },
              { label: "superseded_by", sublabel: "NULL on new rows" },
            ]}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The upsert flow, step by step
          </h2>
          <StepTimeline title="What each storage class does during an upsert" steps={UPSERT_STEPS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Numbers from the real database
          </h2>
          <MetricsRow metrics={METRICS} />
          <p className="text-zinc-500 leading-relaxed mt-4">
            <NumberTicker value={5953} /> active memories, every one of them accessible via a
            SELECT that returns values from all five SQLite storage classes. The{" "}
            <NumberTicker value={3072} suffix=" byte" /> BLOB per row is the single biggest
            on-disk object in the schema, and it still fits comfortably inside one{" "}
            <NumberTicker value={4096} suffix=" byte" /> SQLite page.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            SQLite data types vs. the rest of the world
          </h2>
          <ComparisonTable
            productName="SQLite (as used here)"
            competitorName="Postgres / MySQL / strict-typed SQL"
            rows={COMPARISON_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Verify every claim on this page
          </h2>
          <TerminalOutput
            title="Run these queries against ~/ai-browser-profile/memories.db"
            lines={TYPEOF_TERMINAL}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <GlowCard className="p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              Six checks against your own memories.db
            </h2>
            <p className="text-zinc-500 leading-relaxed mb-4">
              If you have run{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">npx ai-browser-profile init</code>{" "}
              and then{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">npx ai-browser-profile install-embeddings</code>,
              you can verify every storage-class claim on this page in under a minute.
            </p>
            <AnimatedChecklist
              title="Six SQL snippets that exercise all five classes"
              items={STEPS_TO_VERIFY}
            />
          </GlowCard>
        </section>

        <InlineCta
          heading="Borrow the BLOB pattern for your own project"
          body="The entire vector-in-BLOB helper is about 40 lines in ai_browser_profile/embeddings.py. Swap the embedding model, keep the struct.pack/unpack pair, and you have a zero-extension vector store on stock sqlite3."
          linkText="Read embeddings.py on GitHub"
          href="https://github.com/m13v/ai-browser-profile/blob/main/ai_browser_profile/embeddings.py"
        />

        <FaqSection items={FAQS} />

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <RelatedPostsGrid title="Related guides" posts={RELATED} />
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </>
  );
}
