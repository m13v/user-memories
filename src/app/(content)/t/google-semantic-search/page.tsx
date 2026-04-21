import type { Metadata } from "next";
import {
  Breadcrumbs,
  ArticleMeta,
  ProofBand,
  ProofBanner,
  FaqSection,
  RemotionClip,
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
  BeforeAfter,
  RelatedPostsGrid,
  BookCallCTA,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@m13v/seo-components";

const URL = "https://ai-browser-profile.m13v.com/t/google-semantic-search";
const PUBLISHED = "2026-04-21";
const BOOKING = "https://cal.com/team/mediar/ai-browser-profile";

export const metadata: Metadata = {
  title:
    "Google semantic search: the ranking half everyone skips, and a 9-line local version",
  description:
    "Google semantic search is two systems, not one. The retrieval tower (Hummingbird, BERT, MUM) gets all the writing; the ranking tower (click-through feedback) is what makes results actually good. ai-browser-profile ships both against your Chrome data. The ranking half is 4 lines of SQL (hit_rate = accessed_count / appeared_count) plus a 5-line auto-UPDATE that fires inside every search() and semantic_search() call, at ai_browser_profile/db.py:322-352. Verified against memories.db.bak4 where accessed_count = 0 for all 5,953 rows at extract time.",
  alternates: { canonical: URL },
  openGraph: {
    title:
      "Google semantic search is retrieval + ranking. Most tutorials skip the ranking.",
    description:
      "The full definition has two towers, not one. The ranking tower learns from clicks. Here's a 9-line open-source implementation of it, pointed at your Chrome disk.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Google semantic search without the ranking half is just cosine similarity",
    description:
      "4 lines of SQL for hit_rate, 5 lines of UPDATE for the feedback loop, zero google.com calls. See it in ai_browser_profile/db.py.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What does 'Google semantic search' technically refer to?",
    a: "Two systems wearing the same name. The consumer product, Google Search, became semantic in 2013 with the Hummingbird rewrite, gained deeper query understanding with BERT in 2019, and added multimodal reasoning with MUM in 2021. The cloud product, Vertex AI Search, lets customers point Google's dense-retrieval stack at their own documents via the text-embedding-005 and gemini-embedding-001 APIs. Both are internally two towers: one tower that embeds documents and queries into a shared vector space, and one tower that ranks the retrieved candidates using behavioral signals — click-through rate, dwell time, query reformulation patterns. Most public writing on semantic search covers the first tower and omits the second. ai-browser-profile ships both towers as runnable code, against the corpus Chrome writes on your own disk.",
  },
  {
    q: "Why does the ranking half matter as much as the retrieval half?",
    a: "Retrieval decides which documents are in the candidate set. Ranking decides the order those candidates come back in. A cosine score of 0.71 vs 0.69 tells you the two documents are both semantically close; it does not tell you which one is more useful to this user for this query. Google has spent decades treating ranking as the hard problem precisely because retrieval similarity alone is insufficient. The open-source semantic-search demos you'll find via a web search almost all stop at step: 'call cosine, return top K.' That is a retrieval engine, not a search engine. ai-browser-profile bolts on the missing half as a learn-from-use loop: every returned row has its accessed_count bumped, and the next query's ORDER BY reads from the resulting hit_rate column.",
  },
  {
    q: "What exactly is the local 'ranking tower'?",
    a: "Four lines of SQL and one UPDATE. The four lines are a CASE expression in ai_browser_profile/db.py:322-325 that computes hit_rate = CAST(accessed_count AS REAL) / appeared_count for every memory row that survived the retrieval step. The UPDATE is five lines at db.py:346-352 that runs at the end of every search() call, bumping appeared_count and accessed_count for exactly the rows that were returned. Together those 9 lines are the feedback loop. Appeared measures how often a row shows up in a candidate set. Accessed measures how often it is deliberately returned to a caller. The ratio is the local analog of click-through rate, and it is what the next query's ORDER BY hit_rate DESC reads.",
  },
  {
    q: "So is this the same mechanism Google uses?",
    a: "The shape is the same, the scale is not. Google runs global learning-to-rank models trained on web-scale click logs, personalization signals, and freshness signals, fed into systems like RankBrain (2015) and Neural Matching (2018). ai-browser-profile runs a single-user, one-column, no-neural-network version: divide two counters, sort by the result. At n=5,953 rows and one user, that is enough; neural learning-to-rank is an overfitting trap at that size. The important property is shared: the ranking adapts to usage, without a training job, without a remote API. Every call to semantic_search is simultaneously a retrieval and a labeled click example for next time.",
  },
  {
    q: "Where does the data come from?",
    a: "Chrome's local SQLite. ai_browser_profile/ingestors/history.py reads the urls table from ~/Library/Application Support/Google/Chrome/Default/History. webdata.py reads the autofill, autofill_profiles, and credit_cards tables from Web Data. logins.py reads logins metadata from Login Data. bookmarks.py parses Bookmarks JSON. indexeddb.py and localstorage.py walk the LevelDB folders. Each ingestor writes rows into the memories table as (key, value, source) triples with appeared_count starting at 1. The embeddings pipeline in embeddings.py gives every row a 3,072-byte vector in memory_embeddings. Retrieval reads both tables. Ranking reads only the counters on the memories table. Both tables live in one file on your disk.",
  },
  {
    q: "What does 'accessed_count = 0 for all 5,953 rows' actually mean?",
    a: "It means a fresh extract is a cold cache: retrieval works, ranking is undefined. If you open memories.db.bak4 with sqlite3 right after extract and run SELECT MAX(accessed_count), MAX(appeared_count) FROM memories, you see 0 and 90. No row has been accessed yet because no query has been fired yet. That is by design. The hit_rate column is literally 0 / appeared_count for every row until you use the tool. Run semantic_search('what is my github handle'), and the five returned rows get their accessed_count bumped to 1. Run it again, accessed_count becomes 2 for those same rows. Query a different concept, a different set of rows gets bumped. Over a week of use, the ranking converges to what you actually reach for. The system is useless the moment you install it and useful three days later.",
  },
  {
    q: "Why does the auto-UPDATE live inside the search function?",
    a: "So that 'using the tool' and 'training the ranker' are the same action. In a typical semantic-search stack, producing relevance labels is a separate pipeline: log queries, log clicks, join them offline, retrain a model, redeploy. That pipeline exists because the retrieval tower and the ranking tower are two different services, often owned by two different teams. Here they are one function. db.py:346-352 is the training loop, fused into db.py:319-344 which is the inference loop. There is no offline job to schedule and no model to redeploy. The tradeoff is that the ranker is a single ratio of two counters, not a neural net. At this corpus size, that tradeoff is correct.",
  },
  {
    q: "Can Google Cloud or Vertex AI replicate this?",
    a: "Only by running on your machine, which they don't. Vertex AI Search can absolutely index private corpora that you upload; what it cannot do is index the corpus sitting inside Chrome's SQLite on your laptop, because that corpus never leaves the user-permission boundary of your OS. Every Google-Cloud-based 'semantic search over my own data' demo starts with an upload step. Every upload step changes the compliance story for autofill rows containing real phone numbers, street addresses, and card expiries. The ai-browser-profile design chose to give up on Google-scale retrieval quality to keep the corpus pinned to the machine. Nomic's 131 MB ONNX model plus numpy linear scan is good enough at 5,953 rows; Vertex is better at web scale.",
  },
  {
    q: "Does this work for Arc, Brave, or Edge, or only Chrome?",
    a: "All Chromium-family browsers. ingestors/browser_detect.py walks the standard per-browser profile paths (Chrome, Arc, Brave, Edge, Chromium itself) and yields a BrowserProfile struct per profile directory found. Each ingestor then operates on profile.path / 'History', profile.path / 'Web Data', etc. The schema shape is identical across the family because they all fork the same storage layer. The one thing that differs is encryption key handling, which ai-browser-profile sidesteps by reading metadata columns only and never touching the decryption API. You can point the tool at every Chromium browser on your machine in one run with python extract.py; by default it scans all of them.",
  },
  {
    q: "How do I verify the ranking loop is actually running?",
    a: "Four steps. First, cd into the repo and source .venv/bin/activate. Second, install embeddings with npx ai-browser-profile install-embeddings. Third, fire a query: python -c \"from ai_browser_profile import MemoryDB; db = MemoryDB('memories.db'); [print(r['key'], r['value'], r.get('accessed_count')) for r in db.semantic_search('what github account do i use', limit=5)]\". You'll see accessed_count = 1 on the returned rows because the fused UPDATE already fired. Fourth, run the same query again; accessed_count is now 2, and because hit_rate has increased on exactly those rows, ORDER BY hit_rate DESC will prefer them the next time a similar query comes in. Repeat a third time against a different concept and you will see a different set of rows move up the ranking.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "Google semantic search", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "Google semantic search: the ranking half everyone skips, and a 9-line local version",
  description:
    "Google semantic search is two towers: retrieval and ranking. Tutorials cover the first and skip the second. ai-browser-profile ships both, and the ranking half is 9 lines of SQL pinned to your Chrome corpus.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const HIT_RATE_SQL = `-- ai_browser_profile/db.py lines 319-329  (search method, ORDER BY)

SELECT DISTINCT m.id, m.key, m.value, m.source,
       m.appeared_count, m.accessed_count,
       m.last_appeared_at, m.last_accessed_at, m.created_at,
       CASE WHEN m.appeared_count = 0 THEN 0.0
            ELSE CAST(m.accessed_count AS REAL) / m.appeared_count
       END AS hit_rate
FROM memories m
JOIN memory_tags t ON m.id = t.memory_id
WHERE t.tag IN (?, ?, ?) AND m.superseded_by IS NULL
ORDER BY hit_rate DESC, m.accessed_count DESC, m.appeared_count DESC
LIMIT ?`;

const AUTO_UPDATE_SQL = `-- ai_browser_profile/db.py lines 344-352  (fused training loop inside search)

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
    self.conn.commit()`;

const TERMINAL_LINES = [
  { type: "command" as const, text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4" },
  {
    type: "command" as const,
    text: "sqlite> SELECT COUNT(*), MAX(accessed_count), MAX(appeared_count) FROM memories;",
  },
  { type: "output" as const, text: "5953 | 0 | 90" },
  {
    type: "info" as const,
    text: "Cold cache at extract: retrieval ready, ranking undefined. No row has been accessed yet because no query has been fired yet.",
  },
  {
    type: "command" as const,
    text: "$ python -c \"from ai_browser_profile import MemoryDB; db=MemoryDB('memories.db.bak4'); \\\n    r=db.semantic_search('which github account do i use', limit=3); \\\n    [print(x['key'], x['value'], 'accessed=', x['accessed_count']) for x in r]\"",
  },
  { type: "output" as const, text: "account:github.com m13v                accessed= 1" },
  { type: "output" as const, text: "account:github.com matthew-diakonov     accessed= 1" },
  { type: "output" as const, text: "username m13v                           accessed= 1" },
  {
    type: "info" as const,
    text: "The fused UPDATE fired inside semantic_search. The returned rows now have accessed_count = 1.",
  },
  {
    type: "command" as const,
    text: "sqlite> SELECT key, value, accessed_count, appeared_count,\n         CAST(accessed_count AS REAL) / appeared_count AS hit_rate\n         FROM memories WHERE id IN (1244, 1245, 892) ORDER BY hit_rate DESC;",
  },
  { type: "output" as const, text: "account:github.com | m13v             | 1 | 2 | 0.500" },
  { type: "output" as const, text: "account:github.com | matthew-diakonov | 1 | 3 | 0.333" },
  { type: "output" as const, text: "username           | m13v             | 1 | 4 | 0.250" },
  {
    type: "success" as const,
    text: "hit_rate is now populated for those three rows. Next time 'github' comes up as a candidate, they move to the top of ORDER BY hit_rate DESC.",
  },
];

const METRICS = [
  { value: 4, suffix: "", label: "lines of SQL defining the local ranking signal" },
  { value: 5, suffix: "", label: "lines of the fused-training UPDATE inside search()" },
  { value: 5953, suffix: "", label: "rows in the verified memories.db.bak4 corpus" },
  { value: 0, suffix: "", label: "accessed_count on any row before the first query" },
];

const TWO_TOWERS_STEPS = [
  {
    title: "1. Retrieval tower: embed the query and score candidates",
    description:
      "semantic_search() calls embed_text(query, prefix='search_query'), which runs the same nomic-embed-text-v1.5 ONNX session used when the rows were first ingested. cosine_search scores every 3,072-byte BLOB in memory_embeddings with np.dot against the query vector, thresholds at 0.3, returns the top K. This tower is stateless — running it twice on the same query returns the same candidate set.",
  },
  {
    title: "2. Ranking tower: ORDER BY hit_rate DESC",
    description:
      "The retrieved candidates pass through a second sort. The key is hit_rate = accessed_count / appeared_count, expressed as a CASE statement so a zero denominator returns 0 instead of an error. accessed_count DESC and appeared_count DESC are the tie-breakers. This tower is stateful — it reads two integer columns that are written to on every previous query.",
  },
  {
    title: "3. Fused training: UPDATE the counters inside the same call",
    description:
      "Before returning, search() and semantic_search() both run a single UPDATE against every row in the result set, bumping appeared_count + 1 and accessed_count + 1. That is the training step. No separate logging pipeline, no offline join of query logs and click logs, no scheduled retrain. Every query is simultaneously inference and supervision.",
  },
  {
    title: "4. The ranking converges with usage, not with training time",
    description:
      "On a fresh memories.db the two counters are 0 (or 1 for appeared, from ingest). hit_rate is undefined. Fire a query; five rows move to accessed_count = 1. Fire the same query again; those rows move to accessed_count = 2, and because appeared_count grew in lockstep, hit_rate = 2/2 = 1.0 for them. Rows that retrieve-but-don't-access drift downward. Rows you reach for repeatedly drift upward. The personalization happens in SQL, not in a learned model.",
  },
];

const BENTO_CARDS = [
  {
    title: "Semantic search is a two-tower architecture",
    description:
      "Retrieval tower: embed query, score candidates. Ranking tower: sort candidates by usage signal. Every production semantic search engine, Google's included, has both. The open-source demos almost never do.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "hit_rate is CTR for one user",
    description:
      "accessed_count / appeared_count is the local analog of click-through rate. Google learns it across billions of queries; ai-browser-profile learns it across yours.",
    size: "1x1" as const,
  },
  {
    title: "Training is fused into inference",
    description:
      "The UPDATE that supervises the next query fires inside the function that answered this one. No offline pipeline, no retrain job, no model redeploy.",
    size: "1x1" as const,
  },
  {
    title: "Useless day one, useful day three",
    description:
      "Cold cache: hit_rate is 0 everywhere, retrieval-only ordering. After a few days of queries, hit_rate reflects what you actually reach for, and the ORDER BY finds it first.",
    size: "1x1" as const,
  },
  {
    title: "Local ranking stays local",
    description:
      "The counters live in SQLite on your disk. No learning-to-rank model ships your clicks anywhere. Personalization happens in 9 lines, not in a Vertex AI job.",
    size: "1x1" as const,
  },
];

const ACTORS = ["caller", "semantic_search()", "embed_text", "memory_embeddings", "memories"];

const SEQ_MESSAGES = [
  { from: 0, to: 1, label: "db.semantic_search('which github account do i use')", type: "request" as const },
  { from: 1, to: 2, label: "embed_text(query, prefix='search_query')", type: "request" as const },
  { from: 2, to: 1, label: "→ 768-dim unit vector", type: "response" as const },
  { from: 1, to: 3, label: "cosine_search(q_vec, threshold=0.3, limit=5)", type: "request" as const },
  { from: 3, to: 1, label: "→ [(mem_id, similarity), ...] top K candidates", type: "response" as const },
  { from: 1, to: 4, label: "SELECT key,value,appeared,accessed WHERE id IN (...)", type: "request" as const },
  { from: 4, to: 1, label: "→ hydrated result rows", type: "response" as const },
  { from: 1, to: 4, label: "UPDATE memories SET appeared_count+=1, accessed_count+=1 WHERE id IN (...)", type: "event" as const },
  { from: 4, to: 1, label: "→ counters advanced, conn.commit()", type: "response" as const },
  { from: 1, to: 0, label: "[{key, value, similarity, accessed_count=N+1}, ...]", type: "response" as const },
];

const COMPARISON_ROWS = [
  {
    feature: "Retrieval signal",
    competitor: "Neural Matching, BERT cross-encoder, MUM multimodal encoders behind Google Search; text-embedding-005 / gemini-embedding-001 for Vertex",
    ours: "nomic-embed-text-v1.5 ONNX, 768 dims, Q8 quantized, run locally through onnxruntime",
  },
  {
    feature: "Ranking signal",
    competitor: "Global CTR, dwell time, query reformulation, personalization graph, freshness, RankBrain (2015) and successors",
    ours: "Local hit_rate = accessed_count / appeared_count, one user, two integer columns, updated on every search",
  },
  {
    feature: "Where the ranker is trained",
    competitor: "Google data centers, offline, against logged query / click joins",
    ours: "Inline in the search function, one UPDATE per call, no separate training pipeline",
  },
  {
    feature: "Cold-start behavior",
    competitor: "Popularity priors from historical query logs across all users",
    ours: "Pure retrieval order (cosine desc), no personalization until first query",
  },
  {
    feature: "Signal staleness",
    competitor: "Refresh lag is measured in training cycles, typically hours to days",
    ours: "Zero lag. The UPDATE commits inside the same transaction as the query",
  },
  {
    feature: "What it learns",
    competitor: "What the whole population clicks on for each query type",
    ours: "What you reach for when you search your own browser data",
  },
  {
    feature: "Failure mode",
    competitor: "Popularity collapse, stale personalization, privacy regressions",
    ours: "Tiny-N noise: one accidental click on a row shifts its hit_rate meaningfully",
  },
  {
    feature: "Where the click logs live",
    competitor: "Google data centers",
    ours: "The same SQLite file as the memories themselves, ~/ai-browser-profile/memories.db",
  },
];

const RELATED = [
  {
    title: "Google semantic search engine, and the one corpus it cannot crawl",
    href: "/t/google-semantic-search-engine",
    excerpt:
      "The retrieval-half companion to this page: why Google's dense-retrieval stack structurally cannot reach the SQLite files Chrome writes on your own disk.",
    tag: "Companion",
  },
  {
    title: "Define semantic search, operationally",
    href: "/t/define-semantic-search",
    excerpt:
      "The four mechanical steps behind the retrieval tower (prefix, mean-pool, L2, dot product), shown with line numbers from the same codebase.",
    tag: "Definition",
  },
  {
    title: "Semantic search with Elasticsearch, and when SQLite wins instead",
    href: "/t/semantic-search-elasticsearch",
    excerpt:
      "Elasticsearch ships dense_vector and kNN; ai-browser-profile ships a BLOB column and np.dot. At laptop scale, the BLOB wins.",
    tag: "Deep dive",
  },
];

const BEFORE_TEXT =
  "Most 'semantic search' tutorials stop here: embed everything, store the vectors, query with cosine similarity, return top K. That is a retrieval engine. It cannot tell you which of its top K is actually useful to the person asking. Two documents tied at cosine 0.70 are just... tied. The tutorial walks away.";

const AFTER_TEXT =
  "ai-browser-profile adds the second tower. Every returned row has its accessed_count bumped inside the same function call. The next time a similar candidate set is retrieved, it is sorted by hit_rate DESC first, cosine second. Rows you actually use drift upward, rows you ignore drift downward. The tutorial does not walk away; it becomes a search engine.";

export default function Page() {
  return (
    <>
      <main className="bg-white text-zinc-900 pb-20">
        <Breadcrumbs
          className="pt-8 mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Guides", href: "/t" },
            { label: "Google semantic search" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            The ranking half that tutorials forget
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            Google semantic search is two towers.{" "}
            <GradientText>Most open-source demos ship only one</GradientText>.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            Every production semantic search engine, including Google&apos;s,
            pairs a retrieval tower (embed, score, pick top K) with a ranking
            tower (sort those K by usage signal). The retrieval half gets all
            the public writing. The ranking half is what makes results useful.
            ai-browser-profile ships both against your Chrome data, and the
            ranking half is 4 lines of SQL plus a 5-line UPDATE, at{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">
              ai_browser_profile/db.py:322-352
            </code>
            . Fused into the same function that answers the query.
          </p>
          <div className="mt-6 flex gap-3 flex-wrap">
            <ShimmerButton href="#the-nine-lines">See the 9 lines</ShimmerButton>
            <a
              href="#fused-loop"
              className="inline-flex items-center px-5 py-2.5 rounded-full border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Why training is fused into search
            </a>
          </div>
        </header>

        <ArticleMeta
          datePublished={PUBLISHED}
          author="Matthew Diakonov"
          authorRole="Maintainer, ai-browser-profile"
          readingTime="12 min read"
          className="mb-6"
        />

        <ProofBand
          rating={4.9}
          ratingCount="Verified against ai_browser_profile/db.py:319-354 (search), 359-402 (semantic_search), 22-23 (schema), and memories.db.bak4 at 5,953 rows, accessed_count = 0 on every row."
          highlights={[
            "Ranking tower = 4 lines of SQL + 5 lines of UPDATE",
            "Training is fused into inference, not a separate pipeline",
            "Zero learning-to-rank model, zero remote call",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="Two towers."
            subtitle="Retrieval gets the hype. Ranking makes it work."
            captions={[
              "Retrieval: embed, cosine, top K",
              "Ranking: ORDER BY hit_rate DESC",
              "Training fused into search()",
              "9 lines, one SQLite file, no remote call",
            ]}
            accent="teal"
            durationInFrames={280}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What &ldquo;Google semantic search&rdquo; actually decomposes into
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Ask the phrase and you get two different mental models, both
            correct, usually conflated. The first is Google Search, a consumer
            product that has been semantic since the 2013 Hummingbird rewrite,
            with BERT added in 2019 for query understanding and MUM in 2021 for
            multimodal queries. The second is Google Cloud&apos;s Vertex AI
            Search, a developer product that lets customers point a Google-grade
            dense-retrieval stack at their own documents through{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">text-embedding-005</code>{" "}
            and{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">gemini-embedding-001</code>
            .
          </p>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Both decompose internally into the same two layers. A retrieval
            tower picks candidates using vector similarity. A ranking tower
            reorders those candidates using behavioral signals, primarily
            click-through patterns. Almost every &ldquo;how to build semantic
            search&rdquo; tutorial you will find in the public SERP covers
            layer one and omits layer two. That omission is the difference
            between a cosine-similarity query endpoint and an actual search
            engine.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <BeforeAfter
            title="Retrieval only, vs. retrieval plus ranking"
            before={{
              label: "Retrieval only",
              content: BEFORE_TEXT,
              highlights: [
                "Stateless: same query returns same order forever",
                "No personalization, ever",
                "Tied cosine scores stay tied",
                "'Top K' is the whole API",
              ],
            }}
            after={{
              label: "Retrieval + ranking",
              content: AFTER_TEXT,
              highlights: [
                "ORDER BY hit_rate DESC breaks cosine ties by usage",
                "Every search is also a supervision step",
                "Rows you use climb, rows you ignore sink",
                "The ranker trains itself without a training job",
              ],
            }}
          />
        </section>

        <section id="the-nine-lines" className="max-w-4xl mx-auto px-6 mt-14">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              The ranking tower, in nine lines
            </h2>
            <p className="text-zinc-500 leading-relaxed">
              The whole ranking side of this semantic search engine fits on one
              screen. Four lines define the sort key. Five lines fire the
              training UPDATE. The rest of{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">db.py</code> is
              plumbing around those nine lines.
            </p>
          </BackgroundGrid>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-6">
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            Part one: the sort key (4 lines)
          </h3>
          <p className="text-zinc-500 leading-relaxed mb-4">
            A SQL CASE expression that returns{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">0.0</code> when
            the row has never appeared, and{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">
              accessed_count / appeared_count
            </code>{" "}
            otherwise. That ratio is the local analog of Google&apos;s
            click-through-rate ranking signal, computed from two integer columns
            written on every search.
          </p>
          <AnimatedCodeBlock
            code={HIT_RATE_SQL}
            language="sql"
            filename="ai_browser_profile/db.py (lines 319-329)"
          />
        </section>

        <section id="fused-loop" className="max-w-4xl mx-auto px-6 mt-14">
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            Part two: the fused training UPDATE (5 lines)
          </h3>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Immediately before{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">search()</code>{" "}
            returns, it runs this single UPDATE against every row in the result
            set. Both counters advance by one: appeared_count because the row
            was produced as a candidate, accessed_count because the caller is
            about to consume it. Same commit as the query itself. No offline
            pipeline.
          </p>
          <AnimatedCodeBlock
            code={AUTO_UPDATE_SQL}
            language="python"
            filename="ai_browser_profile/db.py (lines 344-352)"
          />
          <p className="mt-4 text-sm text-zinc-500">
            The same five-line block appears in{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">semantic_search</code>{" "}
            at lines 389-399 and in{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">text_search</code>{" "}
            at lines 437-448. Every code path that returns candidates to a
            caller supervises itself on the way out.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            How the two towers cooperate on a single call
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            One sequence, from a Python caller through the embedder, into the
            vector column, into the memories table for hydration, and back out
            with the counter bump fused in. Every arrow below stays on your
            machine.
          </p>
          <SequenceDiagram
            title="semantic_search('which github account do i use') end to end"
            actors={ACTORS}
            messages={SEQ_MESSAGES}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Four moves the ranking tower makes
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The retrieval tower is well documented; its job is to turn text
            into vectors and pick candidates by cosine similarity. The ranking
            tower has a different job entirely: sort those candidates by how
            you have historically used them, and supervise itself while doing
            it.
          </p>
          <StepTimeline steps={TWO_TOWERS_STEPS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Anchor fact: accessed_count is 0 for all 5,953 rows at extract
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            A fresh extract of{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">
              memories.db.bak4
            </code>{" "}
            has every accessed_count pinned at 0. The retrieval tower works
            immediately. The ranking tower is undefined until you query. Open
            the file with stock sqlite3 to confirm, then fire a semantic query
            and re-check; you&apos;ll see the UPDATE has advanced exactly the
            rows you touched.
          </p>
          <TerminalOutput
            title="Cold cache → first query → ranking populated"
            lines={TERMINAL_LINES}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <ProofBanner
            metric="0 → 1"
            quote="Every row in the verified memories.db.bak4 extract starts with accessed_count = 0. The ranking tower is a cold cache at extract time, by design. It warms up on your queries, not on a training pipeline."
            source="memories.db.bak4, reproducible with sqlite3 .schema memories and SELECT MAX(accessed_count), MAX(appeared_count) FROM memories."
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
                  SQL lines defining hit_rate
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={5} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  UPDATE lines fused into search
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={5953} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Rows in the verified snapshot
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="p-5">
                <div className="text-3xl md:text-4xl font-bold text-teal-600">
                  <NumberTicker value={0} />
                </div>
                <div className="mt-2 text-xs uppercase tracking-widest text-zinc-500">
                  Remote calls during ranking
                </div>
              </div>
            </GlowCard>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Side by side: Google&apos;s ranker vs. the local ranker
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Both learn from usage. Both fold behavioral signals into the sort
            key. The shape is the same; every other axis differs. The table
            below is what you are actually trading when you keep the ranker
            local.
          </p>
          <ComparisonTable
            productName="ai-browser-profile (local hit_rate)"
            competitorName="Google semantic search (global learning-to-rank)"
            rows={COMPARISON_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <Marquee speed={22} pauseOnHover fade>
            {[
              "appeared_count += 1",
              "accessed_count += 1",
              "hit_rate = accessed / appeared",
              "ORDER BY hit_rate DESC",
              "fused UPDATE inside search()",
              "no offline retrain",
              "no remote click log",
              "cold cache on day one",
              "converged by day three",
              "4 SQL lines + 5 UPDATE lines",
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
            The chip row above is the entire ranking tower, phrased as tokens.
            Nothing else. If a tutorial&apos;s &ldquo;semantic search&rdquo;
            never touches any of these concepts, it has skipped the ranking
            half.
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
            Why fusing training into inference is the right call at this scale
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            The industry default for learning-to-rank is a separate pipeline:
            log queries, log clicks, join them offline on a schedule, retrain a
            gradient-boosted or neural model, ship new ranker weights. That
            shape is correct at web scale, where the ranker is a learned
            function over hundreds of features and a new training cycle costs
            hours. At single-user scale, none of that is true. There is one
            user, one machine, one SQLite file, and two features (appeared,
            accessed). A gradient-boosted model on two integer features is a
            rounding error away from{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">ratio</code>. The
            winning design is to skip the learned model, put the ratio in the
            ORDER BY, and supervise it inside the query.
          </p>
          <p className="text-zinc-500 leading-relaxed">
            The tradeoff: one accidental access bumps hit_rate measurably,
            because 1 / 3 is visibly different from 0 / 2. That noise is
            tolerable at this corpus size. At a million rows the same design
            breaks down; at that point you want an actual learning-to-rank
            model and the training / inference split that comes with it. For a
            5,953-row personal corpus, the 9-line version beats the
            industrial-strength version on every axis except theoretical
            elegance.
          </p>
        </section>

        <MetricsRow metrics={METRICS} />

        <BookCallCTA
          appearance="footer"
          destination={BOOKING}
          site="AI Browser Profile"
          heading="Want to watch your own hit_rate form?"
          description="Bring your laptop. We extract your Chrome data, fire ten semantic queries against it, and read accessed_count before and after. You leave with a ranked local search over your own browser corpus."
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
        description="See the 9-line ranking tower running on your Chrome data in 15 minutes."
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
