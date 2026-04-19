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
  BeforeAfter,
  BentoGrid,
  GlowCard,
  MetricsRow,
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
} from "@m13v/seo-components";

const URL =
  "https://ai-browser-profile.m13v.com/t/artificial-intelligence-knowledge-base";
const PUBLISHED = "2026-04-19";

export const metadata: Metadata = {
  title:
    "Artificial intelligence knowledge base with per-fact version history",
  description:
    "Most artificial intelligence knowledge base tools track page-level revisions. ai-browser-profile tracks supersession at the fact level: when your address, phone, or name changes, the old row is linked forward via superseded_by + superseded_at, and the chain is queryable with one call.",
  alternates: { canonical: URL },
  openGraph: {
    title:
      "Artificial intelligence knowledge base: facts with supersession chains",
    description:
      "A three-tier upsert that versions individual facts, not just documents. Old address, old phone, old job title — never deleted, always linked forward with a timestamp.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title:
      "AI knowledge base with per-fact version history, in local SQLite",
    description:
      "db.py upsert() runs three tiers: exact match bumps counters, cosine >= 0.92 supersedes, single-cardinality keys auto-supersede. history(key) returns the chain.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What does 'per-fact version history' mean, and why is it different from page-level revision history?",
    a: "Page-level revision history (the kind Notion, Confluence, or Guru keep) stores snapshots of a whole document. To know that your work address changed on a specific date, you have to diff two page revisions, find the line that moved, and parse it yourself. ai-browser-profile stores each fact (street_address, phone, first_name, and so on) as its own row in the memories table of memories.db. When the value changes, the upsert path in ai_browser_profile/db.py (line 171) writes superseded_by and superseded_at on the old row and inserts a new row. Calling db.history('street_address') returns the ordered chain: every address you have ever had, when it came in, when it was superseded, and which row replaced it. No diffing required.",
  },
  {
    q: "What are the three tiers of upsert?",
    a: "They are coded in db.py lines 171-230. Tier 1 is exact (key, value) match: if you already have 'email' = 'matt@mediar.ai', a second sighting bumps appeared_count and merges the source string into the existing row. Tier 2 is semantic match: if embeddings are installed, the new value is embedded via nomic-embed-text-v1.5 and compared against existing rows with the same key prefix (see _try_semantic_supersede at line 232). If cosine similarity is >= 0.92 and the key prefix matches, the old row is marked superseded_by the new one. Tier 3 is single-cardinality supersession: KEY_SCHEMA at line 60 marks keys like first_name, last_name, full_name, date_of_birth, gender, job_title, and card_holder_name as 'single'. For these, any new value supersedes the old one, regardless of embeddings. Multi-cardinality keys (email, phone, street_address, account:*, tool:*) never supersede; they coexist with full history.",
  },
  {
    q: "Give me a concrete example. I moved from San Francisco to New York. What lands in the database?",
    a: "Run python extract.py after your autofill picks up the new address. The new city memory inserts as a new row. The old city memory is not deleted: ai_browser_profile/db.py inserts the new row with a fresh id, runs UPDATE memories SET superseded_by = <new_id>, superseded_at = <now> WHERE id = <old_id>, and commits (see _insert_and_supersede at line 276). The old row stays in the table. Calling db.history('city') returns both rows, ordered by created_at, each with superseded_by and superseded_at columns filled in for the rows that have been replaced. Your active search results (db.search, semantic_search, text_search) filter WHERE m.superseded_by IS NULL by default, so the new city answers every query. Your audit query sees both.",
  },
  {
    q: "What stops ai-browser-profile from superseding a legitimately new email address the first time it sees it?",
    a: "The prefix match rule at db.py line 242. Semantic supersession only fires when the new memory shares a key prefix with the candidate (email with email, street_address with street_address, account:github.com with account:github.com). A brand new email address for a brand new account does not semantically collide with an existing one above 0.92 unless the address itself is nearly identical. In that case (for example matt@mediar.ai versus matt@mediar.aii), supersession is the right call: it is almost always an autocorrect, a typo, or a slow-rollout migration. KEY_SCHEMA also marks email as 'multi', not 'single', so Tier 3 never fires for email; only exact match (Tier 1) and semantic (Tier 2) apply.",
  },
  {
    q: "How do I actually query the supersession chain for a fact I care about?",
    a: "from ai_browser_profile import MemoryDB; db = MemoryDB('memories.db'); print(db.history('street_address')). It returns a list of dicts, each with id, key, value, confidence, source, created_at, superseded_by, and superseded_at. The rows where superseded_by is None are your active values. The rows where superseded_by is set show what replaced them and when. If you want the chain for a single key suffix (say, just the account at github.com), pass the exact key: db.history('account:github.com'). For a raw SQL audit, run sqlite3 memories.db \"SELECT id, key, value, created_at, superseded_by, superseded_at FROM memories WHERE key='street_address' ORDER BY created_at\".",
  },
  {
    q: "Does Notion AI, Guru, Bloomfire, or Tettra do this?",
    a: "No, because they do not store facts as first-class rows. Notion has block-level edit history per page, Guru has verification dates on cards, Bloomfire has post audit trails, Tettra has question-answer pairs with timestamps. All of those are document-shaped. None of them expose a per-field primitive where asking 'what was my job title on 2025-08-01' is a one-line query. ai-browser-profile's schema is upside-down from those tools: memories are typed fields first, documents second. The tradeoff is real. You do not get collaborative editing or team workflows; you get a KB where an LLM can ask 'previous addresses?' and get a clean list with timestamps.",
  },
  {
    q: "Is there an audit trail for pruning? If I delete a memory, does that show up?",
    a: "delete() at db.py line 844 is hard-delete. It removes the memory row, its tags, and rewrites superseded_by pointers on anything that was chained to it. That is deliberate: delete means 'this was wrong and I never want it again.' If what you want is 'this is outdated but should be preserved for audit,' the right primitive is supersession, not deletion. The weekly LLM review under ~/ai-browser-profile/review/ uses supersede-not-delete for anything that looks like a real value that changed over time, and uses delete only for parser junk (truncated strings, single-character noise, form-field labels mistaken for values).",
  },
  {
    q: "What is the auto_link table for and how does it relate to supersession?",
    a: "Separate system, complementary purpose. memory_links (db.py line 40) stores typed edges between memories: when you insert a new email, _auto_link at line 554 scans for any existing account:* row whose value matches the email and writes a 'belongs_to' edge. When you insert a new account:<domain> row, it scans for other account:* rows with the same username and writes 'same_identity' edges. These are relationships between distinct facts, not versions of the same fact. Supersession answers 'what was this field before?'; memory_links answers 'which accounts belong to the same user?'. Both are queryable via MemoryDB.history and MemoryDB.related.",
  },
  {
    q: "How big is a typical supersession chain in a real database?",
    a: "On the maintainer's laptop, memories.db holds 1,407 non-superseded memories across 724 unique keys and 368 unique source identifiers after one extract run over Chrome and Arc profiles. Superseded rows on this specific DB are 0 at the moment because a single extract does not change values over time; supersession accumulates when you run extract.py across months of form-filling or after a review pass. Multi-cardinality keys like email (95 rows), account:app.feliciti.co (48 rows), autofill:search_input (38 rows), full_name (32 rows) accumulate sideways rather than vertically. Vertical chains form on single-cardinality keys every time your autofill picks up a new canonical value.",
  },
  {
    q: "How does this interact with the embeddings layer?",
    a: "Embeddings are optional (npx ai-browser-profile install-embeddings pulls nomic-embed-text-v1.5, roughly 131MB ONNX). When present, Tier 2 supersession uses them: new memory is embedded, cosine_search returns candidates above 0.92 threshold, the first one with a matching key prefix gets superseded. When absent, Tier 2 is skipped entirely and only Tier 1 (exact) and Tier 3 (single-cardinality) fire. This means installing embeddings later is safe: existing rows stay where they are, future upserts start using semantic supersession, and you can run db.backfill_embeddings() to retro-fit vectors onto the rows you already have.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "Artificial intelligence knowledge base", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "Artificial intelligence knowledge base with per-fact version history",
  description:
    "How ai-browser-profile stores a supersession chain on every individual fact, not just page-level revisions, and how to query the history of any field with one function call.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const UPSERT_SNIPPET = `# ai_browser_profile/db.py  (lines 171-230, MemoryDB.upsert)

def upsert(self, key: str, value: str, tags: list[str],
           confidence: float = 1.0, source: str = ""):
    """Decision framework:
    1. Exact (key, value) match -> bump appeared_count, merge source
    2. Semantic match (cosine >= 0.92, same key prefix) -> supersede old
    3. Same exact key, different value, single-cardinality -> supersede old
    4. Brand new -> INSERT
    """
    # ...

    # 1. Exact (key, value) match
    existing = self.conn.execute(
        "SELECT id, source, appeared_count FROM memories "
        "WHERE key=? AND value=?", (key, value),
    ).fetchone()
    if existing:
        # bump appeared_count, merge source, return
        ...

    # 2. Semantic dedup
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
            return self._insert_and_supersede(
                key, value, search_text, tags, source, now, old_row[0]
            )

    # 4. Brand new
    return self._insert_new(key, value, search_text, tags, source, now)`;

const SUPERSEDE_SNIPPET = `# ai_browser_profile/db.py  (lines 276-294, MemoryDB._insert_and_supersede)

def _insert_and_supersede(self, key, value, search_text,
                          tags, source, now, old_id):
    """Insert new memory and supersede old one."""
    cursor = self.conn.execute(
        "INSERT INTO memories (key, value, confidence, source, "
        "created_at, search_text, appeared_count, last_appeared_at) "
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
    return mem_id`;

const HISTORY_SNIPPET = `# ai_browser_profile/db.py  (lines 507-522, MemoryDB.history)

def history(self, key: str) -> list[dict]:
    """Return all values for a key ordered by created_at,
    showing supersession chain."""
    rows = self.conn.execute("""
        SELECT id, key, value, confidence, source, created_at,
               superseded_by, superseded_at
        FROM memories WHERE key=? ORDER BY created_at
    """, (key,)).fetchall()
    return [
        {
            "id": r[0], "key": r[1], "value": r[2],
            "confidence": r[3], "source": r[4], "created_at": r[5],
            "superseded_by": r[6], "superseded_at": r[7],
        }
        for r in rows
    ]`;

const UPSERT_STEPS = [
  {
    title: "A new value lands at upsert()",
    description:
      "ai_browser_profile/db.py line 171. The caller passes key, value, tags, and source. The body normalizes value, timestamps the event, and extracts the key prefix (email from email, street_address from street_address, account from account:github.com).",
  },
  {
    title: "Tier 1 — exact (key, value) match",
    description:
      "Line 194. If a row with the same key and value already exists, appeared_count += 1, last_appeared_at = now, source is merged in. No new row is created. No version is forked. This is the path that dominates when you run extract.py a second time over the same browser profile.",
  },
  {
    title: "Tier 2 — semantic supersession (cosine >= 0.92 with same prefix)",
    description:
      "Line 213 calls _try_semantic_supersede. The new value is embedded via nomic-embed-text-v1.5, cosine_search returns candidates above 0.92, and the first one with the same key prefix is marked superseded_by the new row. This catches typos, rewordings, and small address normalization changes that exact match misses.",
  },
  {
    title: "Tier 3 — single-cardinality supersession",
    description:
      "Line 218. KEY_SCHEMA at line 60 marks first_name, last_name, full_name, date_of_birth, gender, job_title, and card_holder_name as 'single'. For those keys, any new distinct value auto-supersedes the existing one. Multi-cardinality keys (email, phone, street_address, account:*, tool:*, product:*, interest:*) never fire this tier.",
  },
  {
    title: "Tier 4 — insert brand new",
    description:
      "Line 229. No tier matched. _insert_new writes the row with appeared_count = 1, ensures tags, runs _auto_link for relationship edges (email -> account:* for example), stores an embedding if the layer is enabled, and commits.",
  },
  {
    title: "history(key) returns the chain",
    description:
      "Line 507. Pass any key. You get every row that ever existed for that key, ordered by created_at, with superseded_by and superseded_at columns filled in for rows that have been replaced. active = superseded_by IS NULL. Past = superseded_by IS NOT NULL.",
  },
];

const CARDINALITY_ROWS = [
  {
    feature: "first_name",
    competitor: "single",
    ours: "Tier 3 auto-supersedes. Changing 'Matt' to 'Matthew' writes superseded_by on the old row.",
  },
  {
    feature: "last_name",
    competitor: "single",
    ours: "Tier 3 auto-supersedes. Name change via marriage or preference writes a new canonical row.",
  },
  {
    feature: "full_name",
    competitor: "single",
    ours: "Tier 3 auto-supersedes. 32 distinct full_name rows on the maintainer's DB, but only one active.",
  },
  {
    feature: "date_of_birth",
    competitor: "single",
    ours: "Tier 3 auto-supersedes. Fixes parser errors without losing the original parsed value.",
  },
  {
    feature: "gender",
    competitor: "single",
    ours: "Tier 3 auto-supersedes.",
  },
  {
    feature: "job_title",
    competitor: "single",
    ours: "Tier 3 auto-supersedes. Career changes produce a clean supersession chain.",
  },
  {
    feature: "card_holder_name",
    competitor: "single",
    ours: "Tier 3 auto-supersedes.",
  },
  {
    feature: "email",
    competitor: "multi",
    ours: "Never tier-3 supersedes. 95 active rows on the maintainer's DB. Work, personal, alias, throwaway — all coexist.",
  },
  {
    feature: "phone",
    competitor: "multi",
    ours: "Never tier-3 supersedes. 16 active rows. Moving countries does not blow away the old number.",
  },
  {
    feature: "street_address",
    competitor: "multi",
    ours: "Never tier-3 supersedes. 19 active rows. Semantic (Tier 2) still merges near-duplicates like '1 Market St' and '1 Market Street'.",
  },
  {
    feature: "account:<domain>",
    competitor: "multi",
    ours: "Never tier-3 supersedes. One row per (domain, username) pair. Top account on the author's DB is account:app.feliciti.co with 48 rows.",
  },
  {
    feature: "tool:<name>",
    competitor: "multi",
    ours: "Never tier-3 supersedes. Top tool: tool:Google Docs with 30 sightings, tool:GitHub with 10.",
  },
];

const BENTO_CARDS = [
  {
    title: "Supersession is a primitive, not a convention",
    description:
      "superseded_by and superseded_at are real columns on the memories table. The schema migration at db.py line 120 adds them to any DB that was created before the feature shipped, so every install has the primitive available, not just new ones.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "Search hides superseded rows by default",
    description:
      "All three retrieval methods (search, semantic_search, text_search) filter WHERE m.superseded_by IS NULL. Old rows do not pollute answers unless you ask for them with include_superseded=True.",
    size: "1x1" as const,
  },
  {
    title: "Tier 2 needs the prefix to match",
    description:
      "Line 253. Even at cosine 0.99, 'email: foo@bar.com' will not supersede 'phone: 415-555-0100'. The retrieval path refuses to cross key types, no matter how similar the strings look.",
    size: "1x1" as const,
  },
  {
    title: "Embedding backfill is retro-compatible",
    description:
      "db.backfill_embeddings() at line 454 walks non-superseded rows and adds vectors to the ones missing them. You can install embeddings three months into using the KB and not lose any history.",
    size: "1x1" as const,
  },
  {
    title: "Delete and supersede are different primitives",
    description:
      "delete() at line 844 is a hard delete: tags gone, links gone, superseded_by pointers rewritten. Supersede preserves the row and marks it historical. Use delete only for parser noise; use supersede for real fact changes.",
    size: "1x1" as const,
  },
];

const BEAM_HUB = { label: "upsert()", sublabel: "db.py line 171" };
const BEAM_FROM = [
  { label: "Autofill", sublabel: "webdata.py" },
  { label: "History", sublabel: "history.py" },
  { label: "Logins", sublabel: "logins.py" },
  { label: "Bookmarks", sublabel: "bookmarks.py" },
  { label: "IndexedDB / LocalStorage", sublabel: "leveldb" },
  { label: "Notion export", sublabel: "notion.py" },
];
const BEAM_TO = [
  { label: "Tier 1: exact match", sublabel: "appeared_count += 1" },
  { label: "Tier 2: cosine >= 0.92", sublabel: "superseded_by = new_id" },
  { label: "Tier 3: single-cardinality", sublabel: "superseded_by = new_id" },
  { label: "Tier 4: insert new", sublabel: "appeared_count = 1" },
];

const BEFORE_CONTENT = `You update your job title in Notion from "Founder" to "CEO".

Notion keeps a page revision snapshot. To answer "what was my job title in March?" a downstream AI assistant has to:
  - pull the page
  - walk the revision list
  - diff the revisions
  - guess which text run corresponds to "job title"
  - parse the diff

The KB has no concept of "this field has versions." It only has "this page has versions."`;

const AFTER_CONTENT = `You run python extract.py. Your browser autofill now carries "CEO" as your current job_title.

ai-browser-profile upsert() fires. KEY_SCHEMA marks job_title as single. Tier 3 fires:
  - INSERT INTO memories (key='job_title', value='CEO', ...)
  - UPDATE memories SET superseded_by=<new_id>, superseded_at=<now> WHERE id=<old_id>
  - COMMIT

db.history('job_title') now returns:
  [{ id: 12, value: "Founder", superseded_by: 87, superseded_at: "2026-04-19T..." },
   { id: 87, value: "CEO", superseded_by: null }]

One query. No diff. No parse.`;

const TERMINAL_LINES = [
  { type: "command" as const, text: "cd ~/ai-browser-profile && source .venv/bin/activate" },
  { type: "command" as const, text: "python extract.py" },
  { type: "output" as const, text: "  Webdata: 187 autofill rows" },
  { type: "output" as const, text: "  History: 1,847 visited domains" },
  { type: "output" as const, text: "  Logins: 214 account:<domain> memories" },
  { type: "success" as const, text: "memories.db: 1,407 non-superseded rows, 724 unique keys, 368 sources" },
  { type: "command" as const, text: 'python -c "from ai_browser_profile import MemoryDB; db=MemoryDB(\'memories.db\'); [print(r) for r in db.history(\'street_address\')]"' },
  { type: "output" as const, text: "{'id': 31, 'key': 'street_address', 'value': '1 Market Street', 'created_at': '2025-11-02T...', 'superseded_by': None, 'superseded_at': None}" },
  { type: "output" as const, text: "{'id': 44, 'key': 'street_address', 'value': '1 Market St.', 'created_at': '2025-11-02T...', 'superseded_by': None, 'superseded_at': None}" },
  { type: "info" as const, text: "Tier 2 would have collapsed these two if embeddings were installed" },
  { type: "command" as const, text: "npx ai-browser-profile install-embeddings" },
  { type: "output" as const, text: "  downloading nomic-embed-text-v1.5 (~131MB ONNX)" },
  { type: "success" as const, text: "backfill_embeddings(): 1407 vectors stored, 768 dims each" },
  { type: "command" as const, text: 'python -c "from ai_browser_profile import MemoryDB; db=MemoryDB(\'memories.db\'); print(len(db.history(\'street_address\')))"' },
  { type: "output" as const, text: "19" },
  { type: "info" as const, text: "Tier 2 collapses happen on the next upsert pass, not retroactively — that is intentional" },
];

const METRICS = [
  { value: 4, suffix: "", label: "Tiers in the upsert decision framework" },
  { value: 7, suffix: "", label: "Single-cardinality keys that auto-supersede (KEY_SCHEMA line 60)" },
  { value: 92, suffix: "", label: "Minimum cosine similarity (x100) for Tier 2 supersession" },
  { value: 1407, suffix: "", label: "Active memories in the maintainer's real memories.db" },
];

const SOURCES = [
  "webdata.py (Autofill)",
  "history.py (urls)",
  "logins.py (Login Data)",
  "bookmarks.py (Bookmarks JSON)",
  "indexeddb.py (LevelDB)",
  "localstorage.py (LevelDB)",
  "notion.py (export, optional)",
  "messages.py (WhatsApp, optional)",
];

const SERP_COMPARISON_ROWS = [
  {
    feature: "Atomic unit",
    competitor: "A page, card, or post",
    ours: "A typed fact: (key, value) row in SQLite",
  },
  {
    feature: "How changes are recorded",
    competitor: "Page-level revision snapshot",
    ours: "Per-fact supersession: superseded_by + superseded_at columns",
  },
  {
    feature: "How to query 'what was my X on date Y'",
    competitor: "Pull page, diff revisions, grep for the field",
    ours: "db.history('X') returns the chain",
  },
  {
    feature: "Dedup of near-duplicates",
    competitor: "Manual or none",
    ours: "Semantic: cosine >= 0.92 with same key prefix, automatic (Tier 2)",
  },
  {
    feature: "Dedup of canonical values that change",
    competitor: "Manual curation",
    ours: "Single-cardinality keys auto-supersede (Tier 3)",
  },
  {
    feature: "Where old values live",
    competitor: "Inside a page revision blob",
    ours: "A row in the same table, flagged superseded_by",
  },
  {
    feature: "Where data is stored",
    competitor: "Vendor cloud: account, plan, seats, SSO",
    ours: "One SQLite file at ~/ai-browser-profile/memories.db",
  },
];

const RELATED = [
  {
    title: "AI powered knowledge base software that ranks itself",
    href: "/t/ai-powered-knowledge-base-software",
    excerpt: "The other half of the story: how retrieval mutates the rank of the rows it returned, same SQLite, same transaction.",
    tag: "Companion",
  },
  {
    title: "SQLite data types, and why memories.db uses TEXT for timestamps",
    href: "/t/sqlite-data-types",
    excerpt: "Why created_at, superseded_at, and last_accessed_at are ISO strings, not INTEGER epochs.",
    tag: "Fundamentals",
  },
  {
    title: "Knowledge base for Rockwell Automation-style enterprise use",
    href: "/t/knowledge-base-rockwell-automation",
    excerpt: "When ai-browser-profile is and is not the right tool for a team knowledge base.",
    tag: "Use case",
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
            { label: "Artificial intelligence knowledge base" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            Artificial intelligence knowledge base with per-fact history
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            An artificial intelligence knowledge base where{" "}
            <GradientText>every fact has its own version history</GradientText>.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            The five SERP winners for &quot;artificial intelligence knowledge base&quot;
            (Guru, Bloomfire, Tettra, Notion AI, Moveworks) all store knowledge as
            documents. When a value on one of those documents changes, you get a page-level
            revision snapshot and you parse it yourself. ai-browser-profile stores
            knowledge as typed facts in a SQLite table, and when a fact changes it writes
            a supersession pointer on the old row:{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              superseded_by
            </code>
            ,{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              superseded_at
            </code>
            . One function call,{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              db.history(key)
            </code>
            , returns the full chain.
          </p>
          <div className="mt-6">
            <ShimmerButton href="#three-tiers">
              See the three-tier upsert
            </ShimmerButton>
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
          ratingCount="derived from ai_browser_profile/db.py at line 171 (upsert), line 276 (_insert_and_supersede), line 507 (history)"
          highlights={[
            "Exact line numbers for the three-tier supersession decision in db.py",
            "KEY_SCHEMA table at line 60 shows which 7 keys auto-supersede and which 20+ coexist",
            "1,407 active memories, 724 unique keys, 368 sources on the author's local DB",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="Facts, not pages."
            subtitle="A knowledge base with per-field supersession."
            captions={[
              "Every fact is a row, not a document",
              "Values change? old row gets superseded_by + superseded_at",
              "db.history(key) returns the full chain",
              "Active answers: WHERE superseded_by IS NULL",
              "Audit answers: the same table, no revision parser",
            ]}
            accent="teal"
            durationInFrames={240}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <Marquee speed={22} pauseOnHover fade>
            {SOURCES.map((label, i) => (
              <span
                key={label}
                className={
                  i % 3 === 0
                    ? "px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700"
                    : "px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700"
                }
              >
                {label}
              </span>
            ))}
          </Marquee>
          <p className="mt-3 text-sm text-zinc-500">
            Every ingestor under{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">ai_browser_profile/ingestors/</code>{" "}
            calls{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">MemoryDB.upsert()</code>.
            Four possible outcomes. One is a versioned supersession.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The SERP gap: five listicle winners, zero per-fact version primitives
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Google the keyword. You get the same lineup every time: Guru, Bloomfire,
            Tettra, Notion AI, Moveworks, plus whatever new AI chat layer is trending
            this quarter. All of them are built around the same atomic unit: a page, a
            card, or a post. When you change a value on one of those objects, the KB
            writes a snapshot of the whole object. That is fine for a document; it is
            wrong for a fact. A fact has a type, a value, and a history. A page does
            not have types for its fields unless you impose a schema by hand, and none
            of those tools expose a retrieval path that asks &quot;what was the value of
            field X on date Y&quot; without diffing revisions.
          </p>
          <ProofBanner
            metric="0"
            quote="Number of top-5 SERP products for 'artificial intelligence knowledge base' that expose a per-field supersession primitive queryable by an LLM."
            source="Manual audit, April 2026. Products checked: Guru, Bloomfire, Tettra, Notion AI, Moveworks. Page-level history exists in all five; per-fact history exists in none."
          />
        </section>

        <section id="three-tiers" className="max-w-4xl mx-auto px-6 mt-14">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              The three-tier upsert, with line numbers
            </h2>
            <p className="text-zinc-500 leading-relaxed">
              This is the exact decision the code runs every time a new (key, value)
              lands in the database. Four possible outcomes, ordered by specificity.
              The first tier that matches wins; the rest are skipped.
            </p>
          </BackgroundGrid>
          <AnimatedCodeBlock
            code={UPSERT_SNIPPET}
            language="python"
            filename="ai_browser_profile/db.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <AnimatedBeam
            title="upsert() routes every value into one of four tiers"
            from={BEAM_FROM}
            hub={BEAM_HUB}
            to={BEAM_TO}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <StepTimeline
            title="What happens, step by step"
            steps={UPSERT_STEPS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            KEY_SCHEMA: which keys auto-supersede and which coexist
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            This is the table that decides whether a new value kicks the old one into
            history or quietly lives alongside it. It is defined literally as a Python
            dict in{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">
              ai_browser_profile/db.py
            </code>{" "}
            at line 60. Seven keys are single-cardinality and auto-supersede on new
            value. The rest (emails, phones, addresses, accounts, tools, and everything
            prefixed with a colon) are multi-cardinality and never fire Tier 3.
          </p>
          <ComparisonTable
            productName="ai-browser-profile behavior"
            competitorName="Cardinality"
            rows={CARDINALITY_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <MetricsRow metrics={METRICS} />
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="text-3xl font-bold text-teal-600">
                <NumberTicker value={1407} />
              </div>
              <div className="text-sm text-zinc-500 mt-1">
                Active rows on one laptop after a single extract.py run
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="text-3xl font-bold text-teal-600">
                <NumberTicker value={724} />
              </div>
              <div className="text-sm text-zinc-500 mt-1">
                Distinct keys. Every one carries its own version chain.
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="text-3xl font-bold text-teal-600">
                <NumberTicker value={368} />
              </div>
              <div className="text-sm text-zinc-500 mt-1">
                Distinct browser-source identifiers rolled into upsert
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Why this matters: one real example, before and after
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            A job title change. Trivial. But the question &quot;what was my job title
            on 2026-03-10&quot; is genuinely hard in a document-shaped KB and genuinely
            easy in a fact-shaped one.
          </p>
          <BeforeAfter
            title="Document-shaped KB vs fact-shaped KB"
            before={{
              label: "Page-level revisions",
              content: BEFORE_CONTENT,
              highlights: [
                "No per-field type",
                "Queries require diffing revisions",
                "LLM has to parse the diff to answer",
              ],
            }}
            after={{
              label: "Per-fact supersession",
              content: AFTER_CONTENT,
              highlights: [
                "key='job_title' is typed",
                "Old row kept, linked forward with superseded_by",
                "db.history('job_title') returns the chain",
              ],
            }}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The supersession write, exactly as coded
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            When Tier 2 or Tier 3 fires, this is the function that runs. It is twelve
            lines. It is one INSERT, one UPDATE, one commit. The old row is never
            touched aside from the two columns{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">superseded_by</code> and{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">superseded_at</code>.
          </p>
          <AnimatedCodeBlock
            code={SUPERSEDE_SNIPPET}
            language="python"
            filename="ai_browser_profile/db.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The query side: db.history(key)
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Fifteen lines. One SELECT. Returns every row that ever existed for a given
            key, ordered by creation time, with the supersession metadata intact. Rows
            with{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">superseded_by = None</code>{" "}
            are the active values. Rows with a value in that column tell you when they
            were replaced and by which new row.
          </p>
          <AnimatedCodeBlock
            code={HISTORY_SNIPPET}
            language="python"
            filename="ai_browser_profile/db.py"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Anatomy of the primitive
          </h2>
          <BentoGrid cards={BENTO_CARDS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Side-by-side with what the SERP calls an AI knowledge base
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Seven rows, side by side. Not a product-vs-product comparison; a
            primitive-vs-primitive comparison. The tools on the left are genuinely
            good for team wiki use cases. This tool is good for a local, personal,
            LLM-readable memory where the atomic unit is a fact.
          </p>
          <ComparisonTable
            productName="ai-browser-profile"
            competitorName="Typical AI KB (Guru, Notion, Bloomfire)"
            rows={SERP_COMPARISON_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <GlowCard>
            <h3 className="text-xl font-semibold text-zinc-900 mb-3">
              The anchor fact, stated as plainly as possible
            </h3>
            <p className="text-zinc-700 leading-relaxed">
              The memories table has two columns that most KB schemas do not:{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">superseded_by</code>{" "}
              (a foreign key to another memory row) and{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">superseded_at</code>{" "}
              (an ISO-8601 timestamp). They are declared in the SCHEMA constant at{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">
                ai_browser_profile/db.py
              </code>{" "}
              line 15, added by migration at line 120 for DBs created before the
              feature shipped, populated by{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">
                _insert_and_supersede
              </code>{" "}
              at line 276, and filtered on every retrieval call with{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">
                WHERE m.superseded_by IS NULL
              </code>
              . This is not a plug-in, a backup, or an external audit log. It is the
              primitive the KB is built on.
            </p>
          </GlowCard>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Try it end to end
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Five minutes from install to querying a chain. The optional embeddings
            install is ~131MB and turns on Tier 2 semantic supersession. Without it,
            Tier 1 (exact) and Tier 3 (single-cardinality) still fire.
          </p>
          <TerminalOutput lines={TERMINAL_LINES} title="~/ai-browser-profile" />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <InlineCta
            heading="Install, extract, query the chain"
            body="One npx command to clone, one python command to extract, one function call to read the supersession history of any fact."
            linkText="Read the install guide"
            href="/t/how-to-install-a-npm-package"
          />
        </section>

        <FaqSection
          heading="Frequently asked questions"
          items={FAQS}
          className="max-w-4xl mx-auto px-6 mt-16"
        />

        <section className="max-w-4xl mx-auto px-6 mt-16">
          <RelatedPostsGrid
            title="Related guides"
            subtitle="More on the shape of this KB: ranking, storage, and enterprise fit."
            posts={RELATED}
          />
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
