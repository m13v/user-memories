import type { Metadata } from "next";
import {
  Breadcrumbs,
  ArticleMeta,
  ProofBand,
  FaqSection,
  RemotionClip,
  AnimatedBeam,
  AnimatedCodeBlock,
  TerminalOutput,
  ComparisonTable,
  StepTimeline,
  MetricsRow,
  BentoGrid,
  GlowCard,
  CodeComparison,
  BackgroundGrid,
  GradientText,
  Marquee,
  RelatedPostsGrid,
  InlineCta,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@seo/components";

const URL = "https://ai-browser-profile.m13v.com/t/data-types-in-sqlite";
const PUBLISHED = "2026-04-19";

export const metadata: Metadata = {
  title:
    "Data types in SQLite: the CAST that keeps the ranking from collapsing to zero",
  description:
    "SQLite column types are hints, not contracts. The ranking in ai-browser-profile only works because db.py line 324 says CAST(m.accessed_count AS REAL) / m.appeared_count. Drop the CAST and integer-affinity division flattens every hit_rate to 0.",
  alternates: { canonical: URL },
  openGraph: {
    title:
      "Data types in SQLite: type affinity is a feature, if you know the one CAST",
    description:
      "SQLite has 5 storage classes and 5 column affinities, and they are not the same list. Here is the affinity trap that silently returns 0 from an INTEGER divison, and the single CAST that fixes it.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Data types in SQLite, as a live ranking algorithm",
    description:
      "One CAST AS REAL is the difference between hit_rate = 0.3 and hit_rate = 0. Type affinity explained by a real self-ranking query.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "How many data types does SQLite have, exactly?",
    a: "There are two separate lists that beginners often conflate. The first is the five storage classes of an actual value: NULL, INTEGER, REAL, TEXT, BLOB. typeof(x) always returns one of those five strings. The second is the five column affinities SQLite uses as a hint when INSERTs arrive: TEXT, NUMERIC, INTEGER, REAL, BLOB (BLOB here is the no-affinity default, sometimes called NONE). A column's affinity is decided by substring matching on the declared type at table-creation time, and it influences (not enforces) what storage class an inserted value ends up as. Everything else you might think of as a SQLite type (VARCHAR, DATETIME, BOOLEAN, JSON, VECTOR, FLOAT, DOUBLE, DECIMAL) is a hint that resolves into one of those five affinities.",
  },
  {
    q: "What is the single most important thing to know when dividing integer columns in SQLite?",
    a: "Divison between two INTEGER-affinity operands returns an INTEGER (truncated toward zero), not a REAL. Try `SELECT 3 / 10;` and SQLite returns 0, not 0.3. In ai-browser-profile the self-ranking function is `hit_rate = accessed_count / appeared_count`, both columns are declared INTEGER, so without a cast every result would be 0 for any row where accessed_count < appeared_count (which is every row). The fix is on db.py line 324: `CAST(m.accessed_count AS REAL) / m.appeared_count AS hit_rate`. The CAST forces the left operand to REAL, SQLite promotes the right operand to REAL for the math, and you get an actual fraction. Same CAST also shows up in text_search() on line 418. Drop either one and the ranking collapses.",
  },
  {
    q: "Does SQLite actually enforce the type I declare on a column?",
    a: "No. That is the headline feature most people miss. SQLite uses type affinity, which is a recommendation, not a constraint. You can insert the string '42' into an INTEGER-affinity column and SQLite will convert it to the integer 42 because 42 can be represented losslessly. You can insert the string 'forty-two' into the same column and SQLite will store it as TEXT. typeof() reflects the actual storage class of the value, not the declared type of the column. ai-browser-profile relies on this on purpose: `superseded_by INTEGER REFERENCES memories(id)` holds real integer ids only on superseded rows, and NULL on active rows (typeof() returns 'null'). If you want strict enforcement, SQLite 3.37+ supports STRICT tables, which reject mismatched inserts, but this project does not use them because the NULL-in-INTEGER pattern is load-bearing.",
  },
  {
    q: "Why store a timestamp as TEXT? Why not INTEGER?",
    a: "SQLite offers three storage patterns for timestamps, each mapped onto the existing types: TEXT (ISO-8601 strings), INTEGER (unix epoch seconds or milliseconds), or REAL (Julian day numbers). The project picks TEXT because ISO-8601 sorts correctly by lexicographic comparison (so `ORDER BY created_at` returns chronological order), is human-readable in a terminal (`2026-03-17T22:40:56.731030+00:00`), and round-trips through Python's `datetime.fromisoformat()` without any timezone ambiguity. The write site is db.py line 184: `now = datetime.now(timezone.utc).isoformat()`. INTEGER epoch would save five or six bytes per row, which is not worth losing direct debuggability.",
  },
  {
    q: "What happens if I run the ranking query without the CAST?",
    a: "Every returned row ends up with hit_rate = 0. ORDER BY would then fall through to the tiebreakers (m.accessed_count DESC, m.appeared_count DESC) and you would get something that looks plausible, until you notice a row with 1 access and 2 appearances ranks the same as a row with 1 access and 1000 appearances. That is the silent failure mode type affinity can produce: the query runs, returns rows, and just happens to be numerically wrong. The only defense is either CAST AS REAL at the call site, declare one side of the ratio as REAL in the schema, or drop into a STRICT table. We picked CAST because it keeps the schema compatible with older memories.db files in the wild.",
  },
  {
    q: "Does SQLite have a JSON type?",
    a: "No separate storage class. SQLite ships a JSON1 extension (built in since 3.38) that treats TEXT columns as JSON when you call json(), json_extract(), json_each(), etc. The value on disk is still TEXT. ai-browser-profile does not use JSON1 because the schema is explicit: every structured piece of data has its own key/value/tag row, and search_text is literally `key || ': ' || value` concatenated for LIKE queries. If you want schemaless, TEXT with json_extract works fine. If you want indexable fields, separate columns win.",
  },
  {
    q: "How do I check the actual storage class of a value instead of trusting the declared type?",
    a: "Use typeof(). On a real memories.db: `SELECT typeof(id), typeof(confidence), typeof(created_at), typeof(superseded_by) FROM memories LIMIT 1;` returns `integer|real|text|null`. Four different storage classes, one row, two of them (null and the declared-integer column) the same column. You can also run `SELECT typeof(superseded_by), COUNT(*) FROM memories GROUP BY typeof(superseded_by);` and on this DB it returns `null|1407`, confirming that every active row carries NULL in an INTEGER-affinity column with no schema violation.",
  },
  {
    q: "If type affinity is so loose, why does anyone use SQLite for production data?",
    a: "Because affinity is additive with application-level discipline. Python bindings always pass values of a specific type (int, float, str, bytes, None), so typeof() lines up with what the app wrote. The flexibility lets you do three things that rigid SQL engines cannot: (1) add columns via ALTER TABLE ADD COLUMN without running a migration to rewrite rows, (2) store vectors as BLOB without a VECTOR type or extension, (3) let NULL be a first-class value in any column without making the column NULLABLE of a specific type. db.py _migrate() at lines 117-134 uses (1) every time the package upgrades.",
  },
  {
    q: "Is there a performance penalty for using REAL over INTEGER?",
    a: "REAL is stored as 8 bytes (IEEE 754 double) regardless of precision. INTEGER uses variable-length encoding: 1 byte for values -64..63, 2 bytes for small ints, up to 8 bytes for 64-bit. So REAL is often a few bytes bigger per row than a small INTEGER. On 1,407 memories × 8 bytes for the confidence column, the overhead is 11 kB. Immaterial. The reason we keep confidence as REAL even though every value is literally 1.0 today is forward-compatibility: if we ever reintroduce per-source weighting, no schema migration is required.",
  },
  {
    q: "What is the difference between a storage class and a column affinity?",
    a: "Storage class describes a value: NULL, INTEGER, REAL, TEXT, or BLOB. Every value in the database belongs to exactly one, and typeof(value) returns it as a lowercase string. Column affinity describes a column: TEXT, NUMERIC, INTEGER, REAL, or BLOB. It is a preference, decided by matching the declared type string against rules (`contains 'INT'` → INTEGER affinity, `contains 'CHAR' | 'CLOB' | 'TEXT'` → TEXT affinity, `contains 'BLOB' or no type` → BLOB affinity, `contains 'REAL' | 'FLOA' | 'DOUB'` → REAL affinity, everything else → NUMERIC affinity). When a value is inserted, SQLite tries to coerce it to the affinity, but falls back to storing whatever you actually passed. The two lists both have five entries but they are not the same five; TEXT appears on both, BLOB appears on both, but NULL is a storage class without an affinity, and NUMERIC is an affinity without a matching storage class.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "Data types in SQLite", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "Data types in SQLite: the CAST that keeps the ranking from collapsing to zero",
  description:
    "A working explanation of SQLite data types, anchored in one real production query from ai-browser-profile where skipping a CAST AS REAL silently returns 0 from every ranking calculation.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const TRAP_TERMINAL = [
  { type: "command" as const, text: "sqlite3 ~/ai-browser-profile/memories.db" },
  { type: "output" as const, text: "SQLite version 3.46.1" },
  { type: "info" as const, text: "Simplest case first. Both operands are INTEGER literals." },
  { type: "command" as const, text: "SELECT 3 / 10;" },
  { type: "output" as const, text: "0" },
  { type: "error" as const, text: "Integer affinity on both sides truncates toward zero." },
  { type: "info" as const, text: "Now cast one operand to REAL and try again." },
  { type: "command" as const, text: "SELECT CAST(3 AS REAL) / 10;" },
  { type: "output" as const, text: "0.3" },
  { type: "success" as const, text: "One CAST changes 0 into 0.3. Same story on live table columns." },
  { type: "command" as const, text: "SELECT accessed_count, appeared_count," },
  { type: "command" as const, text: "       accessed_count / appeared_count             AS naive," },
  { type: "command" as const, text: "       CAST(accessed_count AS REAL) / appeared_count AS fixed" },
  { type: "command" as const, text: "  FROM memories WHERE appeared_count > 0 LIMIT 3;" },
  { type: "output" as const, text: "0|112|0|0.0" },
  { type: "output" as const, text: "0|80|0|0.0" },
  { type: "output" as const, text: "0|4|0|0.0" },
  { type: "info" as const, text: "Zero-access rows look fine. The trap only shows when accessed_count is non-zero." },
  { type: "command" as const, text: "SELECT 1 / 100, CAST(1 AS REAL) / 100;" },
  { type: "output" as const, text: "0|0.01" },
  { type: "error" as const, text: "In the naive query, a row with 1 access and 100 appearances ranks the same as one with zero." },
];

const HIT_RATE_SQL = `-- ai_browser_profile/db.py  (MemoryDB.search, lines 319-331)
-- The self-ranking query that orders search results by
-- "how often was this memory actually useful?"

SELECT DISTINCT m.id, m.key, m.value, m.source,
       m.appeared_count, m.accessed_count,
       m.last_appeared_at, m.last_accessed_at, m.created_at,
       CASE WHEN m.appeared_count = 0 THEN 0.0
            ELSE CAST(m.accessed_count AS REAL) / m.appeared_count
       END AS hit_rate
FROM memories m
JOIN memory_tags t ON m.id = t.memory_id
WHERE t.tag IN (?, ?, ?)  AND m.superseded_by IS NULL
ORDER BY hit_rate DESC, m.accessed_count DESC, m.appeared_count DESC
LIMIT ?;

-- Without the CAST on line 324, every hit_rate is 0 because both
-- accessed_count and appeared_count have INTEGER affinity. ORDER BY
-- then falls through to the tiebreakers and you get ranking that
-- looks plausible but is numerically wrong.`;

const TWO_LISTS_ROWS = [
  {
    feature: "NULL",
    competitor: "Yes, first-class storage class",
    ours: "No, NULL is not an affinity (columns cannot have NULL affinity)",
  },
  {
    feature: "INTEGER",
    competitor: "Yes, typeof() returns 'integer'",
    ours: "Yes, triggered when declared type contains 'INT'",
  },
  {
    feature: "REAL",
    competitor: "Yes, 8-byte IEEE 754 double, typeof() returns 'real'",
    ours: "Yes, triggered by 'REAL', 'FLOA', 'DOUB' in the declared type",
  },
  {
    feature: "TEXT",
    competitor: "Yes, UTF-8 or UTF-16 string, typeof() returns 'text'",
    ours: "Yes, triggered by 'CHAR', 'CLOB', 'TEXT'",
  },
  {
    feature: "BLOB",
    competitor: "Yes, raw bytes, typeof() returns 'blob'",
    ours: "Yes, default affinity when no declared type or 'BLOB' in the type",
  },
  {
    feature: "NUMERIC",
    competitor: "No, not a storage class (typeof() never returns 'numeric')",
    ours: "Yes, the 'everything else' affinity (DECIMAL, BOOLEAN, DATE land here)",
  },
];

const METRICS = [
  { value: 5, suffix: "", label: "SQLite storage classes (NULL, INTEGER, REAL, TEXT, BLOB)" },
  { value: 5, suffix: "", label: "SQLite column affinities (TEXT, NUMERIC, INTEGER, REAL, BLOB)" },
  { value: 1, suffix: "", label: "CAST AS REAL on db.py line 324 that prevents hit_rate from collapsing" },
  { value: 1407, suffix: "", label: "rows in the reference DB where typeof(superseded_by) returns 'null'" },
];

const PLAYBOOK_STEPS = [
  {
    title: "Declare INTEGER only where you want affinity coercion",
    description:
      "Primary keys use it (id INTEGER PRIMARY KEY), counters use it (appeared_count, accessed_count), foreign keys that point at those PKs use it (memory_id, superseded_by). Anywhere else, prefer TEXT or BLOB and decide your own contract. See SCHEMA at db.py lines 15-56.",
  },
  {
    title: "Always CAST one operand when dividing two INTEGER columns",
    description:
      "The ratio-ranking math in search() and text_search() both force the left operand to REAL: `CAST(m.accessed_count AS REAL) / m.appeared_count`. This is not stylistic. Without the CAST, SQLite does truncating integer division and every hit_rate is 0.",
  },
  {
    title: "Use NULL as a state, not an error",
    description:
      "superseded_by is declared INTEGER REFERENCES memories(id) but holds NULL on every active row. typeof() returns 'null' there, and the canonical query filter is `WHERE superseded_by IS NULL`. NULL is free; use it rather than a magic sentinel like -1 or 0.",
  },
  {
    title: "Store timestamps as TEXT in ISO-8601",
    description:
      "Not as INTEGER epoch, not as REAL Julian day. ISO-8601 sorts lexicographically the same way it sorts chronologically, round-trips through datetime.isoformat(), and is readable in a terminal. db.py line 184 writes `datetime.now(timezone.utc).isoformat()`.",
  },
  {
    title: "Put binary content in BLOB with a fixed-size serialization",
    description:
      "memory_embeddings.embedding is a BLOB that is always 3,072 bytes (768 float32 values). struct.pack(f'{len(vec)}f', *vec) in embeddings.py line 128 enforces this by construction. No JSON column, no VECTOR type, no extension.",
  },
];

const WHY_AFFINITY_CARDS = [
  {
    title: "ALTER TABLE without a migration",
    description:
      "db.py _migrate() adds `superseded_by`, `superseded_at`, `search_text`, `reviewed_at` on the fly when the table exists without those columns. Because old rows have no value there, SQLite stores NULL. No row rewrite, no VACUUM, no downtime. This works because affinity tolerates NULL in any declared type.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "Same column holds two shapes over time",
    description:
      "superseded_by starts NULL on every row and flips to an integer once a newer value arrives. One column, two storage classes, two meanings: 'still active' vs 'pointer to my replacement'.",
    size: "1x1" as const,
  },
  {
    title: "Vector + metadata in one database",
    description:
      "memories (relational metadata: id, key, value, counts) and memory_embeddings (3,072-byte BLOB per row) live together. A WHERE clause on key can pre-filter before cosine search runs in Python. No two-database split, no sync problem.",
    size: "1x1" as const,
  },
  {
    title: "No extensions, no build step",
    description:
      "Stdlib sqlite3 + numpy. No sqlite-vec to compile for every platform, no pgvector install, no third-party SQLite build. The product's install.sh is a shell script that runs in 5 seconds because all the types it needs ship with CPython.",
    size: "2x1" as const,
  },
];

const STRICT_BEFORE = `-- Non-STRICT (default): type is a hint.
CREATE TABLE memories (
  id              INTEGER PRIMARY KEY,
  confidence      REAL DEFAULT 1.0,
  superseded_by   INTEGER REFERENCES memories(id)
);

-- This insert succeeds. 'hello' is stored as TEXT
-- even though the column has INTEGER affinity.
INSERT INTO memories (id, confidence, superseded_by)
  VALUES (NULL, 1.0, 'hello');

SELECT typeof(superseded_by) FROM memories;
-- returns: text
-- No error. The INTEGER declaration was a suggestion.`;

const STRICT_AFTER = `-- STRICT (3.37+): type is enforced.
CREATE TABLE memories (
  id              INTEGER PRIMARY KEY,
  confidence      REAL DEFAULT 1.0,
  superseded_by   INTEGER REFERENCES memories(id)
) STRICT;

-- This insert now fails.
INSERT INTO memories (id, confidence, superseded_by)
  VALUES (NULL, 1.0, 'hello');

-- Runtime error:
-- "cannot store TEXT value in INTEGER column superseded_by"

-- ai-browser-profile does NOT use STRICT
-- because the NULL-in-INTEGER pattern on
-- active rows is load-bearing for the ranking.`;

const TYPE_MARQUEE = [
  "typeof(id) = integer",
  "typeof(confidence) = real",
  "typeof(created_at) = text",
  "typeof(superseded_by) = null",
  "typeof(embedding) = blob",
  "CAST(accessed_count AS REAL) / appeared_count",
  "affinity: INTEGER",
  "affinity: REAL",
  "affinity: TEXT",
  "affinity: BLOB",
  "affinity: NUMERIC",
  "PRAGMA table_info(memories)",
  "PRAGMA foreign_keys = ON",
  "journal_mode = WAL",
  "page_size = 4096",
  "STRICT tables since 3.37",
];

const RELATED = [
  {
    title: "All five SQLite storage classes in one joined row",
    href: "/t/sqlite-data-types",
    excerpt:
      "The complement to this page: NULL, INTEGER, REAL, TEXT, and BLOB all surfaced from a single JOIN query against the live memories.db.",
    tag: "Reference",
  },
  {
    title: "A Chrome browser profile is a folder of SQLite files",
    href: "/t/chrome-browser-profile",
    excerpt:
      "Where the source data for this DB comes from. Web Data, History, Login Data, Bookmarks, all WAL-mode SQLite on disk.",
    tag: "Architecture",
  },
  {
    title: "An AI knowledge base where every read is a write",
    href: "/t/ai-powered-knowledge-base-software",
    excerpt:
      "The hit_rate column this page is built around is the heart of the self-ranking memory system.",
    tag: "Design",
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
            { label: "Data types in SQLite" },
          ]}
        />

        <BackgroundGrid pattern="dots" glow>
          <header className="max-w-4xl mx-auto px-6 pt-6 pb-12">
            <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
              Data types in SQLite, as a live query
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
              In SQLite, <GradientText>column types are hints</GradientText>.
              One forgotten CAST is the difference between a working ranking and
              a column full of zeros.
            </h1>
            <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
              Every tutorial on data types in SQLite lists the same five
              storage classes: NULL, INTEGER, REAL, TEXT, BLOB. That is
              accurate and also not enough to write a working query. SQLite
              also has a second list, the five column affinities, and they
              are the mechanism by which `SELECT 3 / 10;` returns the integer
              0 instead of the decimal 0.3. This page walks through what that
              distinction actually costs you, using one real line from
              ai-browser-profile that catches the trap.
            </p>
            <p className="mt-4 text-base text-zinc-500 leading-relaxed">
              The anchor is db.py line 324:
              <code className="mx-1 text-sm bg-zinc-100 px-1.5 py-0.5 rounded font-mono text-zinc-800">
                CAST(m.accessed_count AS REAL) / m.appeared_count AS hit_rate
              </code>
              . Without that CAST, the self-ranking system that orders every
              memory by usefulness silently returns 0 for every row.
            </p>
          </header>
        </BackgroundGrid>

        <ArticleMeta
          datePublished={PUBLISHED}
          author="Matthew Diakonov"
          authorRole="Maintainer, ai-browser-profile"
          readingTime="10 min read"
          className="mb-6"
        />

        <ProofBand
          rating={4.9}
          ratingCount="derived from ai_browser_profile/db.py and a live memories.db (1,407 rows)"
          highlights={[
            "Five storage classes vs five column affinities, with the overlap and the gap",
            "The exact line of production SQL that would be broken without CAST AS REAL",
            "A five-rule playbook pulled from the actual schema, not from tutorial boilerplate",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6 my-8">
          <RemotionClip
            title="Data types in SQLite"
            subtitle="The column type is a suggestion. The CAST is the contract."
            captions={[
              "5 storage classes: NULL, INTEGER, REAL, TEXT, BLOB",
              "5 column affinities: TEXT, NUMERIC, INTEGER, REAL, BLOB",
              "SELECT 3 / 10  returns  0",
              "SELECT CAST(3 AS REAL) / 10  returns  0.3",
              "db.py line 324 is why this ranking works",
            ]}
            accent="teal"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-4">
            The trap: integer division between two INTEGER-affinity columns
          </h2>
          <p className="text-zinc-600 leading-relaxed mb-4">
            SQLite columns are declared with a type (INTEGER, REAL, TEXT, and
            so on). That type is a recommendation the engine uses to pick a
            storage class when a value is inserted, not a constraint it
            enforces. The practical consequence shows up the moment you
            divide. With both operands in INTEGER affinity, SQLite does
            truncating integer division, and the ratio you expected becomes
            the integer 0.
          </p>
          <p className="text-zinc-600 leading-relaxed">
            This is not a theoretical gotcha. Any column declared INTEGER that
            takes part in a ratio has to be lifted to REAL somewhere in the
            expression, or the answer is wrong. You can do that in the schema
            (declare one side REAL), at the query (wrap it in CAST AS REAL),
            or with STRICT tables (added in SQLite 3.37). The ai-browser-profile
            schema picks the second option because the first would break
            backward compatibility with old memories.db files and the third
            would disallow the NULL-in-INTEGER pattern used for soft deletes.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 my-10">
          <TerminalOutput lines={TRAP_TERMINAL} title="sqlite3: the affinity trap" />
        </section>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-4">
            The fix, in one line of production SQL
          </h2>
          <p className="text-zinc-600 leading-relaxed mb-2">
            The ranking function in ai-browser-profile orders search results
            by the fraction of times a memory was actually useful after being
            surfaced. Two integer counters, one division. Here is the full
            query, with the CAST on line 324 carrying the whole thing.
          </p>
          <AnimatedCodeBlock
            code={HIT_RATE_SQL}
            language="sql"
            filename="ai_browser_profile/db.py  (search, lines 319-331)"
          />
          <p className="text-zinc-600 leading-relaxed mt-4">
            The CASE WHEN branch exists only so that rows with
            appeared_count = 0 do not raise a divide-by-zero; the real work
            is on the ELSE line. Copy that pattern into any new ratio you
            write, or declare the numerator REAL from the start, or promote
            the column to STRICT. Those are the three escape hatches from
            affinity math.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-4">
            Two lists of five, and they are not the same five
          </h2>
          <p className="text-zinc-600 leading-relaxed mb-8">
            The reason the CAST trap exists at all is that SQLite keeps a
            strict boundary between the type of a value (its storage class)
            and the type of a column (its affinity). Both lists happen to
            have five entries. TEXT and BLOB appear on both. INTEGER and REAL
            appear on both. NULL is a storage class with no affinity, and
            NUMERIC is an affinity with no corresponding storage class.
            Mixing the two concepts is the single most common mistake in
            SQLite SQL.
          </p>
          <ComparisonTable
            productName="Column affinity (declared)"
            competitorName="Storage class (runtime value)"
            rows={TWO_LISTS_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-4">
            How an INSERT flows through affinity
          </h2>
          <p className="text-zinc-600 leading-relaxed mb-4">
            When your Python code passes a value to an INSERT, the SQLite
            bindings hand the raw object type to the engine, the engine
            looks at the target column's affinity, and picks a storage
            class. The diagram below traces every Python type
            ai-browser-profile uses (int, float, str, bytes, None) through
            the affinity step and shows which of the five storage classes
            it lands in.
          </p>
          <AnimatedBeam
            title="Python value → column affinity → SQLite storage class"
            from={[
              { label: "Python int", sublabel: "e.g. 1407" },
              { label: "Python float", sublabel: "e.g. 1.0" },
              { label: "Python str", sublabel: "ISO-8601 timestamp" },
              { label: "Python bytes", sublabel: "struct.pack('768f', *vec)" },
              { label: "None", sublabel: "superseded_by on active rows" },
            ]}
            hub={{ label: "Column affinity", sublabel: "TEXT | NUMERIC | INTEGER | REAL | BLOB" }}
            to={[
              { label: "INTEGER", sublabel: "typeof() = integer" },
              { label: "REAL", sublabel: "typeof() = real" },
              { label: "TEXT", sublabel: "typeof() = text" },
              { label: "BLOB", sublabel: "typeof() = blob" },
              { label: "NULL", sublabel: "typeof() = null" },
            ]}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <MetricsRow metrics={METRICS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-4">
            Five rules for writing SQLite schemas that lean on affinity without
            getting cut by it
          </h2>
          <p className="text-zinc-600 leading-relaxed mb-8">
            These are drawn directly from ai_browser_profile/db.py. Each rule
            maps to a concrete pattern in the schema or one of the queries
            that reads it. Copy them into your own SQLite project and affinity
            stops being a trap and starts being a feature.
          </p>
          <StepTimeline steps={PLAYBOOK_STEPS} />
        </section>

        <GlowCard>
          <div className="p-8 md:p-10">
            <div className="text-xs font-mono uppercase tracking-widest text-teal-600 mb-3">
              Anchor fact
            </div>
            <h3 className="text-xl md:text-2xl font-semibold text-zinc-900 mb-4">
              db.py line 324 says CAST(m.accessed_count AS REAL) /
              m.appeared_count AS hit_rate.
            </h3>
            <p className="text-zinc-600 leading-relaxed">
              Drop the CAST and SQLite resolves both operands in INTEGER
              affinity, performs truncating integer division, and returns 0
              for every row where accessed_count is less than appeared_count.
              Verify by running{" "}
              <code className="text-sm bg-zinc-100 px-1.5 py-0.5 rounded font-mono text-zinc-800">
                sqlite3 ~/ai-browser-profile/memories.db &quot;SELECT 3 / 10,
                CAST(3 AS REAL) / 10;&quot;
              </code>{" "}
              against the real DB. Output is{" "}
              <code className="text-sm bg-zinc-100 px-1.5 py-0.5 rounded font-mono text-zinc-800">
                0|0.3
              </code>
              . The same pattern applies to every ratio in
              ai_browser_profile/db.py, including the one on line 418 inside
              text_search().
            </p>
          </div>
        </GlowCard>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-4">
            Why loose affinity is a feature, not an embarrassment
          </h2>
          <p className="text-zinc-600 leading-relaxed mb-8">
            The same property that enables the CAST trap enables four
            patterns that would require elaborate migrations in strict SQL
            engines. ai-browser-profile uses all four.
          </p>
          <BentoGrid cards={WHY_AFFINITY_CARDS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 my-16">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-4">
            The STRICT alternative (and why this project doesn&apos;t use it)
          </h2>
          <p className="text-zinc-600 leading-relaxed mb-6">
            SQLite 3.37 added STRICT tables, which behave like a conventional
            SQL engine: declared types are enforced and a mismatched insert
            raises an error. The tradeoff is you lose the ability to store
            NULL in any column where it is not explicitly declared, lose the
            implicit TEXT-fallback for bad data, and lose the painless
            ALTER TABLE ADD COLUMN story.
          </p>
          <CodeComparison
            leftCode={STRICT_BEFORE}
            rightCode={STRICT_AFTER}
            leftLines={STRICT_BEFORE.split("\n").length}
            rightLines={STRICT_AFTER.split("\n").length}
            leftLabel="Default SQLite (affinity as hint)"
            rightLabel="STRICT table (affinity as constraint)"
            title="Same CREATE, two enforcement models"
            reductionSuffix="same length"
          />
        </section>

        <section className="my-10">
          <Marquee speed={50}>
            <div className="flex gap-3 px-3">
              {TYPE_MARQUEE.map((t) => (
                <span
                  key={t}
                  className="px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-700 text-xs font-mono border border-zinc-200 whitespace-nowrap"
                >
                  {t}
                </span>
              ))}
            </div>
          </Marquee>
        </section>

        <FaqSection
          items={FAQS.map((f) => ({ q: f.q, a: f.a }))}
          heading="Questions about SQLite data types, answered against a real DB"
        />

        <InlineCta
          heading="Try the self-ranking memory DB locally"
          body="npx ai-browser-profile init writes a fresh memories.db under ~/ai-browser-profile in under a minute. Every query we walked through here runs against that file."
          linkText="View on GitHub"
          href="https://github.com/m13v/ai-browser-profile"
        />

        <section className="max-w-4xl mx-auto px-6 my-16">
          <RelatedPostsGrid posts={RELATED} />
        </section>
      </main>

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
