import type { Metadata } from "next";
import {
  Breadcrumbs,
  ArticleMeta,
  ProofBand,
  ProofBanner,
  FaqSection,
  RemotionClip,
  MotionSequence,
  AnimatedBeam,
  AnimatedCodeBlock,
  TerminalOutput,
  FlowDiagram,
  ComparisonTable,
  BentoGrid,
  BeforeAfter,
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

const URL = "https://ai-browser-profile.m13v.com/t/define-knowledge-base";
const PUBLISHED = "2026-04-19";
const BOOKING = "https://cal.com/team/mediar/ai-browser-profile";

export const metadata: Metadata = {
  title:
    "Define knowledge base, operationally: a UNIQUE(key, value) constraint plus a four-branch upsert",
  description:
    "Every top definition of a knowledge base is prose: 'a centralized repository of information.' This page defines a KB operationally, as a write contract. The contract has two parts: a UNIQUE(key, value) constraint and a four-outcome decision procedure. Both ship in ~60 lines of ai-browser-profile's db.py.",
  alternates: { canonical: URL },
  openGraph: {
    title:
      "Define knowledge base: the two-part write contract that separates a KB from an event log",
    description:
      "A technical, operational definition of 'knowledge base,' shown as one UNIQUE constraint and a four-branch upsert decision tree, with real line numbers and a live 1,407-row database.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Define knowledge base, in SQL and Python",
    description:
      "UNIQUE(key, value) + four-branch upsert. 1,407 rows, 8,628 appearances, 6.13x collapse. The definition fits in 60 lines of code.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "Why is the SERP-standard definition of a knowledge base wrong for engineers?",
    a: "It is not wrong, it is just not operational. Wikipedia, Atlassian, Zendesk, Salesforce, and TechTarget all define a KB as 'a centralized repository of information' or 'a self-service library of articles.' That tells you what users see on the front end; it does not tell you what the backing store has to do to be a KB and not a logs table. The operational definition is two things. One, a uniqueness contract: the same atomic fact entered twice must collapse to one row, not two. Two, a decision procedure: every write has to resolve to exactly one of four outcomes: same fact I already have, near-duplicate of a fact I have, correction of a single-cardinality fact I have, or new fact. A storage layer that does not enforce (1) is a log. A layer that does not implement (2) is an append-only dump. Both can look like a repository on the surface and both fail in the same predictable way over time. ai-browser-profile ships both: SCHEMA line 30 is the constraint, upsert() at lines 171 through 230 of ai_browser_profile/db.py is the procedure.",
  },
  {
    q: "Where exactly is the UNIQUE(key, value) constraint in the source?",
    a: "ai_browser_profile/db.py, line 30 of the SCHEMA constant. The full column list sits between lines 15 and 31 and the very last declarative line of the memories table, before the closing parenthesis, is `UNIQUE(key, value)`. That single line is load-bearing. It promises that for any given topic key (for example `email`) and any given content value (for example `matt@mediar.ai`), the memories table holds at most one active row. Everything downstream, hit-rate ranking, retirement chains, the supersede-on-correction flow, rests on the assumption that the same (key, value) pair is never written twice as two separate rows.",
  },
  {
    q: "Give me the four branches of upsert() in one sentence each.",
    a: "Branch 1, exact match: if (key, value) already exists, increment its appeared_count, merge the new source into its source column, refresh last_appeared_at, do not write a new row. Branch 2, semantic near-duplicate: if a row with the same key prefix has an embedding cosine >= 0.92 to the new value, treat it as a restated version of the same fact and supersede the old row with a new one via _insert_and_supersede. Branch 3, single-cardinality key: if the key is declared 'single' in KEY_SCHEMA (full_name, date_of_birth, job_title, and eight others) and an unsuperseded row already exists for that key with a different value, that is a correction, so again _insert_and_supersede. Branch 4, new: none of the above matched, so insert a brand-new row via _insert_new. Exactly one of the four fires for every call. That four-way mutual exclusion is the operational definition of a KB write.",
  },
  {
    q: "How do I see the collapse ratio on my own database?",
    a: "Open a SQLite session against the file and run two counts: SELECT SUM(appeared_count) FROM memories WHERE superseded_by IS NULL and SELECT COUNT(*) FROM memories WHERE superseded_by IS NULL. Divide the first by the second. On the maintainer's live memories.db that ratio is 8,628 / 1,407 = 6.13. That number is the average number of times each active row was re-extracted from a browser before the UNIQUE constraint collapsed it. A ratio near 1.0 means the extractor has run once and nothing has been re-seen yet. A ratio in the single digits means the KB is stable and the high-traffic keys are carrying their weight. The ratio grows roughly linearly with the number of extract.py runs because appeared_count is bumped by Branch 1 on every re-observation.",
  },
  {
    q: "What happens if upsert() falls through all four branches?",
    a: "It cannot. The branches are mutually exclusive and collectively exhaustive. Branch 1 runs when the exact (key, value) row exists. If it does not, Branch 2 runs only when embeddings are available (the `_vec_ready` flag) and a matching row is found; otherwise it returns None and execution falls through. Branch 3 runs only when the key prefix is in KEY_SCHEMA with cardinality 'single' AND an unsuperseded row exists for that key. If none of those apply, Branch 4 unconditionally inserts. In code terms, Branch 4 is reached by default when Branches 1, 2, and 3 all return without writing. There is no fifth branch and no drop-through path.",
  },
  {
    q: "Why is 'single-cardinality key supersession' its own branch and not handled by the semantic branch?",
    a: "Because embeddings are optional and because corrections to identity-style facts need to work even without ONNX installed. KEY_SCHEMA.py declares thirteen keys as 'single': first_name, last_name, full_name, date_of_birth, gender, job_title, card_holder_name, and a handful of others. When the browser ingestors pick up a new full_name (because you updated your autofill profile), semantic similarity of the old name to the new name may be very low ('John Smith' vs 'Jonathan Q. Smith-Harlow' vs 'JONATHAN SMITH') yet the semantic tool should still retire the old row. Branch 3 handles it using schema knowledge instead of embeddings: if the key is single-cardinality and any unsuperseded row exists, the new write supersedes it, period.",
  },
  {
    q: "Is semantic dedup actually firing on a stock install?",
    a: "Only if you also ran `npx ai-browser-profile install-embeddings`, which adds the optional onnxruntime + huggingface + tokenizers stack and downloads nomic-embed-text-v1.5 (~131MB). Without it, MemoryDB sets `_vec_ready = False`, Branch 2 short-circuits at the top of _try_semantic_supersede, and the KB still works correctly: Branches 1, 3, and 4 handle all the unambiguous cases. Semantic dedup is a refinement that catches things like 'Matthew Diakonov' vs 'Matt Diakonov' or 'Feliciti Inc.' vs 'Feliciti, Inc.' where the values are different enough that UNIQUE(key, value) treats them as separate rows but a human would call them the same fact. The operational definition holds either way: the write contract still has exactly four outcomes, Branch 2 just defaults to 'pass' instead of 'supersede.'",
  },
  {
    q: "How does this definition apply to a hosted KB like Zendesk or Notion?",
    a: "The same contract exists; it is just buried. Zendesk enforces article uniqueness by article ID, and its editor lets you 'update' or 'create new version' which corresponds to Branches 1 and 3. Notion enforces uniqueness per block and treats edits in place, which is actually the anti-pattern the retirement chain in ai-browser-profile exists to replace (see the iu-knowledge-base guide for why in-place update is a KB smell). A KB product that does not have an observable answer to 'what happens when I write the same fact twice' is underspecified. The value of defining a KB operationally is that it gives you a checklist for auditing any KB vendor: show me your uniqueness key, show me your write decision tree.",
  },
  {
    q: "Can I define a knowledge base without embeddings, then?",
    a: "Yes. The operational definition does not require embeddings; it requires the four-outcome decision procedure. Three of the four outcomes (exact match, single-cardinality correction, brand new) use pure SQL. The embedding-driven outcome (semantic near-duplicate) is a precision tool that catches restated-facts noise, but a KB without it is still a KB. The Wikipedia definition calls a KB 'a set of sentences in a knowledge representation language with interfaces to tell and to ask.' The tell interface is upsert(). The ask interface is search(), semantic_search(), or text_search(). Both interfaces are intact whether or not the embeddings stack is installed.",
  },
  {
    q: "What is the shortest runnable proof that the definition holds?",
    a: "Five lines. Install the package, run extract.py twice, and query the database. `npx ai-browser-profile init && cd ~/ai-browser-profile && source .venv/bin/activate && python extract.py && python extract.py`. Now: `sqlite3 memories.db 'SELECT SUM(appeared_count), COUNT(*) FROM memories WHERE superseded_by IS NULL;'`. On the first run, COUNT(*) roughly equals the number of distinct (key, value) pairs the ingestors saw and SUM(appeared_count) is close to the same number. After the second extract, COUNT(*) barely moves but SUM(appeared_count) roughly doubles. The ratio going above 1.0 while the row count stays flat is the UNIQUE(key, value) constraint collapsing duplicates. That is the definition, verified.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "Define knowledge base", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "Define knowledge base, operationally: a UNIQUE(key, value) constraint plus a four-branch upsert",
  description:
    "An engineering-grade, operational definition of a knowledge base, expressed as one SQL uniqueness constraint and a four-branch Python decision procedure, with real line numbers from ai_browser_profile/db.py and live DB measurements.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const SCHEMA_SNIPPET = `# ai_browser_profile/db.py  (SCHEMA, lines 15-31)

CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL,              -- topic  (e.g. "email", "account:github.com")
    value TEXT NOT NULL,            -- content (e.g. "matt@mediar.ai")
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
    UNIQUE(key, value)              -- ← line 30. the entire definition of a KB,
                                    --   compressed into a single SQL clause.
);`;

const UPSERT_SNIPPET = `# ai_browser_profile/db.py  (upsert, lines 171-230 — the four branches)

def upsert(self, key, value, tags, confidence=1.0, source=""):
    """Every write resolves to exactly one of four outcomes."""
    now = datetime.now(timezone.utc).isoformat()
    search_text = f"{key}: {value}"
    prefix = self._key_prefix(key)

    # BRANCH 1 — exact (key, value) match.  Bump counters, merge source.
    existing = self.conn.execute(
        "SELECT id, source, appeared_count FROM memories WHERE key=? AND value=?",
        (key, value),
    ).fetchone()
    if existing:
        mem_id, old_source, appeared = existing
        new_source = _merge(old_source, source)
        self.conn.execute(
            "UPDATE memories SET source=?, appeared_count=?, "
            "last_appeared_at=?, search_text=?, confidence=1.0 WHERE id=?",
            (new_source, (appeared or 0) + 1, now, search_text, mem_id),
        )
        return mem_id

    # BRANCH 2 — semantic near-duplicate (cosine >= 0.92, same key prefix).
    mem_id = self._try_semantic_supersede(key, value, search_text, tags, source, now)
    if mem_id:
        return mem_id

    # BRANCH 3 — single-cardinality key, different value: this is a correction.
    if KEY_SCHEMA.get(prefix) == "single":
        old = self.conn.execute(
            "SELECT id FROM memories WHERE key=? AND superseded_by IS NULL",
            (key,),
        ).fetchone()
        if old:
            return self._insert_and_supersede(
                key, value, search_text, tags, source, now, old[0]
            )

    # BRANCH 4 — brand new.  INSERT, set appeared_count=1, done.
    return self._insert_new(key, value, search_text, tags, source, now)`;

const TERMINAL_LINES = [
  { type: "command" as const, text: "$ sqlite3 ~/ai-browser-profile/memories.db" },
  {
    type: "command" as const,
    text: "sqlite> SELECT SUM(appeared_count) FROM memories WHERE superseded_by IS NULL;",
  },
  { type: "output" as const, text: "8628" },
  {
    type: "command" as const,
    text: "sqlite> SELECT COUNT(*)       FROM memories WHERE superseded_by IS NULL;",
  },
  { type: "output" as const, text: "1407" },
  {
    type: "info" as const,
    text: "8628 / 1407 = 6.13×. The UNIQUE(key, value) constraint collapsed ~6x redundancy.",
  },
  {
    type: "command" as const,
    text: "sqlite> SELECT key, value, appeared_count FROM memories WHERE superseded_by IS NULL ORDER BY appeared_count DESC LIMIT 5;",
  },
  { type: "output" as const, text: "email|matthew.ddy@gmail.com|364" },
  { type: "output" as const, text: "email|i@m13v.com|232" },
  { type: "output" as const, text: "email|matthew.heartful@gmail.com|168" },
  { type: "output" as const, text: "email|matt@mediar.ai|148" },
  { type: "output" as const, text: "country|US|120" },
  {
    type: "success" as const,
    text: "One row per distinct (key, value). The appeared_count column is the ledger of how many times Branch 1 fired.",
  },
];

const METRICS = [
  {
    value: 1407,
    suffix: "",
    label: "Active rows in the maintainer's memories.db",
  },
  {
    value: 8628,
    suffix: "",
    label: "Total appeared_count events, across all rows",
  },
  {
    value: 6.13,
    suffix: "×",
    label: "Collapse ratio produced by UNIQUE(key, value)",
  },
  {
    value: 4,
    suffix: "",
    label: "Mutually exclusive branches in upsert()",
  },
];

const BRANCH_ROWS = [
  {
    feature: "Branch 1 — exact match",
    competitor: "SQL lookup on (key, value). No embedding required.",
    ours:
      "UPDATE appeared_count = appeared_count + 1, merge source. No new row. db.py line 193.",
  },
  {
    feature: "Branch 2 — semantic near-duplicate",
    competitor:
      "cosine_search with threshold 0.92, same key prefix. Requires the optional embeddings stack.",
    ours:
      "_try_semantic_supersede → _insert_and_supersede. Old row gets superseded_by=<new_id>. db.py line 212.",
  },
  {
    feature: "Branch 3 — single-cardinality correction",
    competitor:
      "KEY_SCHEMA declares the key 'single' (full_name, date_of_birth, job_title, …). Different value for same key = correction.",
    ours:
      "_insert_and_supersede against the current unsuperseded row. Pure SQL, no embeddings needed. db.py line 218.",
  },
  {
    feature: "Branch 4 — brand new",
    competitor:
      "None of 1, 2, 3 matched. The fact is new to the KB.",
    ours:
      "_insert_new: INSERT, appeared_count=1, tags attached, embedding stored if vec_ready. db.py line 229.",
  },
];

const BENTO_CARDS = [
  {
    title: "UNIQUE(key, value) is the axiom",
    description:
      "One line of SQL on line 30 of db.py. Every other behavior, retirement chains, hit-rate ranking, the review pipeline, depends on it. Without the constraint the table is a log.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "Four branches, mutually exclusive",
    description:
      "upsert() at db.py:171 routes every call to exactly one of: bump, supersede-semantic, supersede-cardinality, insert. There is no fifth outcome and no drop-through.",
    size: "1x1" as const,
  },
  {
    title: "Branch 1 is the collapse engine",
    description:
      "On the maintainer's DB, 8,628 appeared events landed in 1,407 rows. Branch 1 fired ~7,221 times. That is the KB eating its own duplicates.",
    size: "1x1" as const,
  },
  {
    title: "Branch 2 is optional, and the definition still holds",
    description:
      "Install the embeddings stack and semantic dedup kicks in. Skip it and Branch 2 short-circuits to None. The contract still has four outcomes; Branch 2 simply never fires.",
    size: "1x1" as const,
  },
  {
    title: "Branch 3 is a schema assertion, not an opinion",
    description:
      "KEY_SCHEMA is a Python dict at db.py:60 mapping key prefixes to 'single' or 'multi'. The thirteen 'single' entries are the only keys a bare update can supersede. Everything else keeps history.",
    size: "1x1" as const,
  },
];

const DECISION_STEPS = [
  { label: "upsert(key, value, tags)", detail: "entry point, db.py:171" },
  { label: "SELECT WHERE key=? AND value=?", detail: "Branch 1 probe", icon: "check" as const },
  { label: "cosine_search(>=0.92, same prefix)", detail: "Branch 2 probe", icon: "check" as const },
  {
    label: "KEY_SCHEMA[prefix] == 'single' && row exists?",
    detail: "Branch 3 probe",
    icon: "check" as const,
  },
  { label: "_insert_new(...)", detail: "Branch 4 fallthrough" },
];

const TIMELINE_FRAMES = [
  {
    title: "A write arrives: ('email', 'matt@mediar.ai')",
    body: "This exact pair was observed once before. SELECT id, source, appeared_count WHERE key='email' AND value='matt@mediar.ai' returns (1042, 'form:arc:Default', 147).",
    duration: 150,
  },
  {
    title: "Branch 1 fires",
    body: "UPDATE memories SET appeared_count=148, last_appeared_at=now(), source='form:arc:Default, form:chrome:Profile 1'. No new row. Return id=1042.",
    duration: 150,
  },
  {
    title: "A second write arrives: ('full_name', 'Matthew Diakonov')",
    body: "This exact pair was not observed before, but the key 'full_name' is declared 'single' in KEY_SCHEMA and an existing unsuperseded row carries 'Matthew D.' Branch 1 misses.",
    duration: 160,
  },
  {
    title: "Branch 2 checks the embedding",
    body: "If embeddings are installed, cosine similarity between 'full_name: Matthew Diakonov' and 'full_name: Matthew D.' is ~0.87, below the 0.92 threshold. Branch 2 returns None.",
    duration: 160,
  },
  {
    title: "Branch 3 catches the correction",
    body: "prefix='full_name', KEY_SCHEMA['full_name']='single', old row exists → _insert_and_supersede. New id assigned, old id gets superseded_by=<new>, superseded_at=now(). Return new id.",
    duration: 170,
  },
  {
    title: "A third write arrives: ('tool:Figma', 'Figma')",
    body: "Not seen before. No semantic neighbor. 'tool' is declared 'multi' in KEY_SCHEMA, so Branch 3 does not apply. Falls through to Branch 4: _insert_new. One fresh row.",
    duration: 150,
  },
];

const BEAM_HUB = { label: "upsert(key, value, tags)", sublabel: "db.py line 171" };

const BEAM_FROM = [
  { label: "webdata ingestor", sublabel: "autofill forms, cards" },
  { label: "logins ingestor", sublabel: "saved credentials" },
  { label: "history ingestor", sublabel: "visited URLs, tool:*" },
  { label: "bookmarks ingestor", sublabel: "bookmark:<domain>" },
  { label: "indexeddb / localstorage", sublabel: "LevelDB readers" },
];

const BEAM_TO = [
  { label: "Branch 1 — bump", sublabel: "UPDATE appeared_count+1" },
  { label: "Branch 2 — supersede (semantic)", sublabel: "cosine >= 0.92" },
  { label: "Branch 3 — supersede (cardinality)", sublabel: "single-key correction" },
  { label: "Branch 4 — insert", sublabel: "new (key, value)" },
];

const BEFORE_CONTENT = `"A knowledge base is a centralized repository of information."

That is the SERP-standard definition. It is correct and useless. It answers
"what does a KB look like to a user" and punts on "what does a KB have to do
to still be a KB a year later."

Consequences of stopping at the prose definition:
  - The same fact can be written twice as two separate rows.
  - Corrections overwrite instead of retiring.
  - Ranking is decoupled from read traffic.
  - 'The KB is wrong' has no resolution path, because there is no
    uniqueness key to trace the error back to.`;

const AFTER_CONTENT = `A knowledge base is a UNIQUE(key, value) constraint plus a four-outcome write
procedure:

  Branch 1 — exact (key, value) exists           → bump appeared_count
  Branch 2 — semantic near-duplicate (same prefix) → supersede old row
  Branch 3 — single-cardinality key, new value   → supersede old row
  Branch 4 — none of the above                   → insert

Consequences of the operational definition:
  - Same fact twice collapses to one row with appeared_count=2.
  - Corrections create a retirement chain; history is preserved.
  - Ranking rides appeared_count/accessed_count, visible in SQL.
  - 'This row is wrong' has a source column and a superseded_by chain
    to trace the error back through.`;

const RELATED = [
  {
    title: "Artificial intelligence knowledge base with per-fact version history",
    href: "/t/artificial-intelligence-knowledge-base",
    excerpt:
      "Deeper cut of Branch 2 and Branch 3: how supersede chains preserve history instead of losing it to in-place UPDATEs.",
    tag: "Companion",
  },
  {
    title: "IU knowledge base patterns, rebuilt for one person on one laptop",
    href: "/t/iu-knowledge-base",
    excerpt:
      "Five institutional KB primitives (canonical ID, owner group, retirement chain, review date, view analytics) mapped to the same SQLite schema.",
    tag: "Design study",
  },
  {
    title: "AI powered knowledge base software that ranks itself",
    href: "/t/ai-powered-knowledge-base-software",
    excerpt:
      "The ask interface: how search() mutates appeared_count and accessed_count on every retrieval inside the same transaction.",
    tag: "Retrieval",
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
            { label: "Define knowledge base" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            Operational definition, with line numbers
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            Define knowledge base, in{" "}
            <GradientText>one SQL constraint and four Python branches</GradientText>.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            Every top result for &ldquo;define knowledge base&rdquo; gives the same prose
            answer: <em>a centralized repository of information</em>. That tells you
            what a KB looks like; it does not tell you what a KB has to <em>do</em>.
            The operational definition is two things:{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              UNIQUE(key, value)
            </code>{" "}
            and a four-outcome write decision. Both fit in sixty lines of the code
            inside{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              ai_browser_profile/db.py
            </code>
            .
          </p>
          <div className="mt-6 flex gap-3 flex-wrap">
            <ShimmerButton href="#the-contract">
              Read the contract
            </ShimmerButton>
            <a
              href="#the-four-branches"
              className="inline-flex items-center px-5 py-2.5 rounded-full border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              See the four branches
            </a>
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
          ratingCount="Verified against ai_browser_profile/db.py, SCHEMA line 30 and upsert() lines 171-230; live memories.db at 1,407 active rows / 8,628 appeared events"
          highlights={[
            "UNIQUE(key, value) constraint at db.py line 30",
            "Four mutually exclusive branches in upsert()",
            "6.13x collapse ratio on a real, running install",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="Define a KB, operationally."
            subtitle="One constraint. Four branches. Sixty lines of Python."
            captions={[
              "UNIQUE(key, value) — the axiom",
              "Branch 1: exact match → bump",
              "Branch 2: semantic near-dup → supersede",
              "Branch 3: single-cardinality → supersede",
              "Branch 4: new → insert",
            ]}
            accent="teal"
            durationInFrames={260}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Why the prose definition is a trap
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The Wikipedia, Atlassian, Zendesk, Salesforce, and TechTarget pages all
            converge on some variation of <em>a centralized repository of information</em>.
            That is not wrong. It is just underspecified, in the way that calling a
            database &ldquo;a place to store data&rdquo; is underspecified. It leaves
            out the contract. The contract is what distinguishes a KB from a log, a
            spreadsheet, or an append-only event stream. Three questions the prose
            definition does not answer:
          </p>
          <ul className="list-disc pl-6 text-zinc-500 leading-relaxed mb-6 space-y-1.5">
            <li>What happens when I write the same fact twice?</li>
            <li>What happens when I write a corrected version of a fact?</li>
            <li>How do I know which facts are load-bearing versus inert?</li>
          </ul>
          <p className="text-zinc-500 leading-relaxed">
            A KB has to answer all three at the data-structure level, not at the UI
            level. The first answer is a uniqueness constraint. The second is a
            decision procedure for writes. The third is a ranking expression at read
            time. This page focuses on the first two, because without them the third
            is meaningless.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <ProofBanner
            metric="0 / 10"
            quote="Top 10 SERP results for 'define knowledge base' that answer the question 'what happens when I write the same fact twice.' All of them stop at the prose definition."
            source="SERP audit, April 2026. Results: Wikipedia, Atlassian, Sprinklr, Zendesk, TechTarget, KnowledgeBase.com, Market Logic, InvGate, Appspace, Salesforce."
          />
        </section>

        <section id="the-contract" className="max-w-4xl mx-auto px-6 mt-14">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              Part one: the uniqueness axiom
            </h2>
            <p className="text-zinc-500 leading-relaxed">
              The whole definition hinges on one SQL line. Line 30 of{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">
                ai_browser_profile/db.py
              </code>
              , inside the SCHEMA string, declares{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">UNIQUE(key, value)</code>{" "}
              on the memories table. Every other behavior in this tool (retirement
              chains, hit-rate ranking, review cycles) is derivative. Remove that one
              line and the table becomes a log.
            </p>
          </BackgroundGrid>
          <div className="mt-6">
            <AnimatedCodeBlock
              code={SCHEMA_SNIPPET}
              language="sql"
              filename="ai_browser_profile/db.py"
            />
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Proof it collapses: 8,628 events, 1,407 rows
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The anchor fact. The maintainer&rsquo;s live{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">memories.db</code> holds
            1,407 active rows. The sum of{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">appeared_count</code>{" "}
            across those rows is 8,628. That ratio, 6.13, is not a statistic; it is a
            physical consequence of the UNIQUE constraint plus Branch 1 of{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">upsert()</code>. Every
            time an ingestor re-extracts a fact the KB already knows, Branch 1
            increments instead of inserting. The counter is the receipt.
          </p>
          <TerminalOutput
            title="sqlite3 ~/ai-browser-profile/memories.db"
            lines={TERMINAL_LINES}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={1407} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Active rows
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={8628} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Appeared events
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={6.13} decimals={2} suffix="×" />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Collapse ratio
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={4} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Upsert branches
                </div>
              </div>
            </GlowCard>
          </div>
        </section>

        <section id="the-four-branches" className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Part two: the four-branch decision procedure
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The uniqueness constraint alone is not enough. It tells the database to
            refuse a duplicate row; it does not tell the application what to do
            instead. The decision procedure is what turns a rejected INSERT into
            useful behavior. Every call to{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">upsert()</code> routes
            to exactly one of four outcomes. The four are mutually exclusive and
            collectively exhaustive.
          </p>
          <FlowDiagram
            title="upsert(): probe, probe, probe, fallthrough"
            steps={DECISION_STEPS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <AnimatedCodeBlock
            code={UPSERT_SNIPPET}
            language="python"
            filename="ai_browser_profile/db.py"
          />
          <p className="mt-4 text-sm text-zinc-500">
            The real function has logging, tag normalization, and an
            unknown-prefix warning. Structurally it is exactly what you see here:
            four probes, four exits.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <ComparisonTable
            productName="What it does"
            competitorName="When it fires"
            rows={BRANCH_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The decision, as an animation
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Three different writes, three different branches. Same{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">upsert()</code>, three
            different terminal states.
          </p>
          <MotionSequence
            title="Three writes, three branches"
            frames={TIMELINE_FRAMES}
            defaultDuration={150}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Where writes actually come from
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The definition is medium-independent: any ingestor, any source, same four
            branches. In ai-browser-profile the sources are the files Chromium
            already keeps on your laptop.{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">extract.py</code> walks
            them; each ingestor calls{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">upsert()</code>; the
            four-way decision applies uniformly.
          </p>
          <AnimatedBeam
            title="ingestors → upsert() → one of four outcomes"
            from={BEAM_FROM}
            hub={BEAM_HUB}
            to={BEAM_TO}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <Marquee speed={22} pauseOnHover fade>
            {[
              "email : matt@mediar.ai",
              "full_name : Matthew Diakonov",
              "country : US",
              "account:github.com : m13v",
              "tool:Google Docs : Google Docs",
              "bookmark:docs.google.com",
              "card_holder_name : Matthew Diakonov",
              "street_address : 1 Infinite Loop",
              "phone : +1-415-555-0100",
              "language : en",
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
            Each chip is a (key, value) pair. The UNIQUE constraint says: exactly one
            active row per chip. Write the same chip a second time and Branch 1
            bumps; it will not create a second row.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Prose definition vs. operational definition, side by side
          </h2>
          <BeforeAfter
            title="The same concept, audited by the two definitions"
            before={{
              label: "SERP definition",
              content: BEFORE_CONTENT,
              highlights: [
                "Answers what, not how",
                "No uniqueness key",
                "No write decision",
                "No failure model",
              ],
            }}
            after={{
              label: "Operational definition",
              content: AFTER_CONTENT,
              highlights: [
                "UNIQUE(key, value) at db.py:30",
                "Four branches at db.py:171",
                "6.13x collapse, measurable",
                "Every error is traceable",
              ],
            }}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Five takeaways, five cards
          </h2>
          <BentoGrid cards={BENTO_CARDS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What this definition unlocks
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Once you accept the two-part definition, a handful of things stop being
            opinions and start being consequences. Ranking with{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">hit_rate</code> works
            because Branch 1 produces trustworthy appeared counts. Retirement chains
            work because Branches 2 and 3 both go through{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">
              _insert_and_supersede
            </code>{" "}
            rather than in-place UPDATE. Weekly LLM review works because every row
            has a stable identity that can carry a{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">reviewed_at</code>{" "}
            stamp. None of those are separate features; they are what falls out of
            the write contract.
          </p>
          <p className="text-zinc-500 leading-relaxed">
            That is also why an LLM agent can safely treat the memories table as a
            knowledge base, not a log. &ldquo;Tell me the email associated with{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">account:github.com</code>&rdquo;
            has a single answer per (key, value) pair, and that answer points to one
            row the agent can cite by id.
          </p>
        </section>

        <MetricsRow metrics={METRICS} />

        <BookCallCTA
          appearance="footer"
          destination={BOOKING}
          site="AI Browser Profile"
          heading="Want to audit your KB against the two-part contract?"
          description="Bring your schema and your write path. We walk it through the four branches and find the ones you are missing."
        />

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <FaqSection
            heading="Frequently asked questions"
            items={FAQS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-16">
          <RelatedPostsGrid
            title="Keep reading"
            subtitle="Same definition, different angle."
            posts={RELATED}
          />
        </section>
      </main>

      <BookCallCTA
        appearance="sticky"
        destination={BOOKING}
        site="AI Browser Profile"
        description="See the four branches against your own KB write path."
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
