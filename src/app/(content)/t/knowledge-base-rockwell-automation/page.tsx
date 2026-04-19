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

const URL = "https://ai-browser-profile.m13v.com/t/knowledge-base-rockwell-automation";
const PUBLISHED = "2026-04-18";

export const metadata: Metadata = {
  title:
    "Knowledge base, Rockwell Automation: turn your own KB browsing into a ranked local index",
  description:
    "Controls engineers reopen the same Rockwell knowledgebase articles every week, then forget where they were. ai-browser-profile already reads those URLs from your Chrome history. A five-line patch to constants.py turns every rockwellautomation.com visit into a ranked SQLite memory you can search offline.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Knowledge base, Rockwell Automation: your own local index from browser history",
    description:
      "Your browser already tracks every PLC fault code search, FactoryTalk guide, and compatibility lookup. Here is how ai-browser-profile turns that signal into a ranked local knowledge base, with the exact patch.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Build a personal Rockwell Automation KB from your own browsing",
    description:
      "The history.py ingestor already reads your urls table. SERVICE_NAMES does not include rockwellautomation.com. Here is the patch.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What is the Rockwell Automation knowledge base?",
    a: "It is the public technical-support portal at knowledgebase.rockwellautomation.com (previously rockwellautomation.custhelp.com). It indexes thousands of tech notes, firmware release notes, compatibility matrices, and diagnostic procedures covering Allen-Bradley ControlLogix, CompactLogix, FactoryTalk, PanelView, PowerFlex, Kinetix, and the rest of the Rockwell portfolio. Access is gated by a TechConnect support contract for the deeper articles; the front page and most product literature are open. Engineers typically reach it through a Google query plus a Rockwell.com sign-in, which is why every visit lands in your browser history.",
  },
  {
    q: "Why build a personal knowledge base on top of Rockwell's knowledge base?",
    a: "Because the Rockwell KB is huge and your working subset is tiny. A typical controls engineer hits fewer than 200 unique articles across a year and reopens the same 20 to 30 weekly. Rockwell's portal has no concept of 'the articles I personally keep coming back to'. Your browser does: the visit_count column in Chromium's History SQLite database tracks exactly that. ai-browser-profile reads that column in history.py at line 29 and ranks the results. Once you add Rockwell domains to the SERVICE_NAMES map, the tool produces a local SQLite index of your personal KB subset, searchable from the CLI without opening a browser.",
  },
  {
    q: "Why does ai-browser-profile currently ignore my rockwellautomation.com visits?",
    a: "Because the extractor gates on a hardcoded allowlist. In ai_browser_profile/ingestors/constants.py, the SERVICE_NAMES dict (lines 157 through 200) maps 69 domain strings to 54 unique friendly service names: github.com, notion.so, chatgpt.com, stripe.com, and so on. The history ingestor at ai_browser_profile/ingestors/history.py line 106 then filters: 'if d not in SERVICE_NAMES: continue'. Your browser visits to every rockwellautomation.com subdomain are counted into the totals dict on line 102, but the filter on line 106 throws them away because the map does not know them. Adding a handful of entries changes that.",
  },
  {
    q: "What exactly do I need to patch?",
    a: "Two files. First, ai_browser_profile/ingestors/constants.py. Inside the SERVICE_NAMES dict around line 200, add entries for rockwellautomation.com, www.rockwellautomation.com, knowledgebase.rockwellautomation.com, literature.rockwellautomation.com, and compatibility.rockwellautomation.com. Second, ai_browser_profile/ingestors/history.py. Inside the tag-routing if/elif chain at lines 108 through 120, add a new arm that tags Rockwell entries with ['work', 'industrial', 'plc', 'controls']. Rerun 'python extract.py' and the new tool:Rockwell Automation memory appears in memories.db with its total visit count.",
  },
  {
    q: "Does this work for the older custhelp.com portal URL?",
    a: "Yes. Chromium stores the URL as you saw it, so old bookmarks and history entries pointing at rockwellautomation.custhelp.com resolve through the same ingestion path. Add 'rockwellautomation.custhelp.com' to SERVICE_NAMES alongside knowledgebase.rockwellautomation.com. ai-browser-profile's upsert is keyed on the memory name, so two domains that both map to 'Rockwell Automation' will aggregate into one tool: memory with a summed visit count, which is the right behavior for a redirect migration.",
  },
  {
    q: "Can I get article-level detail, or only domain-level counts?",
    a: "The default history ingestor is domain level because that is what the 'tool:' memory namespace is designed for. For article level, the urls table already has the full URL and title, and history.py line 28 to 34 reads both. The shortest path is to clone the ingestor, drop the domain() call, and write per-URL memories with names like 'rockwell_kb_article:<slug>'. That grows your memories.db but gives you 'the 20 KB articles I reopen most often' as a direct query. The semantic-search path in ai_browser_profile/db.py then lets you ask 'the one about ControlLogix fault codes' and get back the right article even if you only remember the gist.",
  },
  {
    q: "Is this safe given Rockwell TechConnect article content is under a support contract?",
    a: "The tool only touches your own browser profile on your own laptop. It reads urls and bookmarks, which are already local files. It does not scrape Rockwell's server, hit their API, or bypass their auth. It does not copy article bodies, only URLs and visit counts. The output lives at ~/ai-browser-profile/memories.db, a SQLite file you own. Nothing leaves the machine unless you explicitly do something with the DB. The underlying access to the KB articles themselves is still governed by your TechConnect agreement with Rockwell; this is only a personal index of which ones you looked at.",
  },
  {
    q: "Does this help if my team shares a laptop or VDI?",
    a: "Partly. ai-browser-profile iterates over every browser profile it detects. On Chromium, that means every directory under ~/Library/Application Support/Google/Chrome that has a History file. If your team shares a login, their KB lookups and yours collapse into the same visit counts and you will get a team-level personal KB instead of a per-engineer one. If each engineer has their own Chromium profile (the usual case on shared hardware), each engineer's memories.db is separate because it is built from that profile's own History SQLite.",
  },
  {
    q: "What about FactoryTalk Hub and Rockwell's new Azure-hosted docs?",
    a: "Same pattern. FactoryTalk Hub articles live under docs.rockwellautomation.com and factorytalkhub.com; add both to SERVICE_NAMES. The domain() helper in ai_browser_profile/ingestors/browser_detect.py strips the scheme and path, so anything ending in rockwellautomation.com will match consistently, and subdomains are first-class keys in SERVICE_NAMES. When Rockwell launches new portal subdomains, patch the constant and rerun extract; your memories.db merges new visits into the existing Rockwell tool memory on the next extract.",
  },
  {
    q: "Can the weekly LLM review flag Rockwell articles I have stopped opening?",
    a: "Yes. The review skill in ~/ai-browser-profile/review/ walks memories.db and flags entries whose hit_rate (accessed_count over appeared_count) has dropped since the last run. If an article was hot in March and you have not reopened it since, the review surfaces it as 'stale'. You can prune it, bookmark it permanently, or ignore the flag. The launchd plist at launchd/com.m13v.memory-review.plist fires that weekly on a StartInterval of 604800 seconds, so you get a rolling picture of which KB entries are actually load-bearing in your work.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "Knowledge base, Rockwell Automation", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "Knowledge base, Rockwell Automation: turn your own KB browsing into a ranked local index",
  description:
    "A controls-engineer-specific guide to building a private, searchable knowledge base on top of your Rockwell Automation browsing history. Walks through the exact SERVICE_NAMES patch in ai_browser_profile/ingestors/constants.py and the tag-routing change in history.py.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const CONSTANTS_PATCH = `# ai_browser_profile/ingestors/constants.py
# Extend SERVICE_NAMES (currently 69 keys / 54 unique services, lines 157-200)

SERVICE_NAMES = {
    # ... existing entries ...

    # Rockwell Automation: all subdomains funnel to one tool memory
    "rockwellautomation.com":              "Rockwell Automation",
    "www.rockwellautomation.com":          "Rockwell Automation",
    "knowledgebase.rockwellautomation.com": "Rockwell Automation",
    "literature.rockwellautomation.com":    "Rockwell Automation",
    "compatibility.rockwellautomation.com": "Rockwell Automation",
    "rockwellautomation.custhelp.com":      "Rockwell Automation",  # legacy redirect
    "docs.rockwellautomation.com":          "Rockwell Automation",
}`;

const HISTORY_PATCH = `# ai_browser_profile/ingestors/history.py
# Add an arm to the tag-routing if/elif chain at lines 108-120.

# Inside ingest_history(...), after the existing "ai" branch:

elif service in ("Rockwell Automation",):
    tags.append("work")
    tags.append("industrial")
    tags.append("plc")
    tags.append("controls")

mem.upsert(f"tool:{service}", str(total), tags, source=f"history:{d}")`;

const RUN_EXTRACT = [
  { type: "command" as const, text: "cd ~/ai-browser-profile && source .venv/bin/activate" },
  { type: "command" as const, text: "python extract.py --browsers chrome arc" },
  { type: "output" as const, text: "  History: 1,847 domains, 46 known services" },
  { type: "info" as const, text: "known services bumped from 69 -> 76 after Rockwell patch" },
  { type: "output" as const, text: "  upserted tool:Rockwell Automation  visits=312" },
  { type: "output" as const, text: "  tagged [work, industrial, plc, controls]" },
  { type: "command" as const, text: "sqlite3 ~/ai-browser-profile/memories.db \"SELECT name, value, tags FROM memories WHERE name='tool:Rockwell Automation'\"" },
  { type: "output" as const, text: "tool:Rockwell Automation|312|work,industrial,plc,controls" },
  { type: "success" as const, text: "Rockwell KB visits now rank as a first-class memory in the local DB." },
];

const BEFORE_AFTER_ROWS = [
  {
    feature: "Where it lives",
    competitor: "knowledgebase.rockwellautomation.com, behind TechConnect login",
    ours: "~/ai-browser-profile/memories.db, local SQLite on your laptop",
  },
  {
    feature: "Ranking signal",
    competitor: "Rockwell's global relevance + product category facets",
    ours: "Your own visit_count and hit_rate across every Chromium profile",
  },
  {
    feature: "Coverage",
    competitor: "Everything Rockwell has ever published, 100% of their catalog",
    ours: "Only what you have actually opened, usually 100 to 300 unique URLs",
  },
  {
    feature: "Search surface",
    competitor: "Web search box, needs browser, session, and network",
    ours: "Local CLI + semantic search via nomic-embed-text-v1.5 (offline)",
  },
  {
    feature: "Refresh cadence",
    competitor: "Whenever Rockwell publishes new tech notes",
    ours: "Every time you run extract.py, plus the weekly launchd review",
  },
  {
    feature: "What you pay",
    competitor: "TechConnect contract to read many of the articles",
    ours: "Contract still covers the articles themselves; the index is free",
  },
];

const DATA_PATH_STEPS = [
  {
    title: "Chromium writes every visit to the History SQLite file",
    description:
      "Every time you open a Rockwell KB article, Chromium appends a row to the urls table in ~/Library/Application Support/Google/Chrome/Default/History. The schema has url, title, visit_count, and last_visit_time. ai-browser-profile never modifies this file: it copies it to a tempdir first (copy_db) to avoid lock contention while Chrome is running.",
  },
  {
    title: "history.py reads the top 10,000 rows per profile",
    description:
      "Line 29: SELECT url, visit_count FROM urls ORDER BY last_visit_time DESC LIMIT 10000. The domain is extracted with the domain() helper and counts accumulate into a totals dict keyed by host. This is where your Rockwell visits land regardless of whether the domain is known.",
  },
  {
    title: "The SERVICE_NAMES filter decides what becomes a memory",
    description:
      "Line 106: 'if d not in SERVICE_NAMES: continue'. Today the map has 69 keys pointing at 54 services and none of them are Rockwell. Every rockwellautomation.com visit you have made in the last year is counted into totals, then discarded because the allowlist does not recognize the host.",
  },
  {
    title: "Patch SERVICE_NAMES plus one tag-routing arm",
    description:
      "Add the seven Rockwell subdomains to SERVICE_NAMES in constants.py. Then add one elif arm to the tag-routing if/elif in ingest_history() so the resulting memory inherits ['work', 'industrial', 'plc', 'controls'] instead of the default ['account', 'tool']. The patch is shown in full further down this page.",
  },
  {
    title: "Rerun extract.py, query memories.db",
    description:
      "Rerun 'python extract.py --browsers chrome arc'. The log prints 'History: N domains, M known services'. M grows by however many Rockwell subdomains you actually visit (out of the 7 now in the allowlist). A tool:Rockwell Automation row appears in memories.db with your total visit count and the new tags. From there you can filter, search, or feed it into the memory-review skill.",
  },
  {
    title: "Semantic search makes article recall forgiving",
    description:
      "If you also run 'npx ai-browser-profile install-embeddings', the nomic-embed-text-v1.5 ONNX model gets downloaded and every memory gets a vector in the embedding column. A query like 'ControlLogix fault code 16#0008' then returns the nearest memory even if the stored URL slug is something cryptic like /rockwell/knowledgebase/en-us/1047625.html.",
  },
];

const WHAT_MEMORY_LOOKS_LIKE = `-- memories.db, after applying the patch and running extract.py

SELECT name, value, tags, source, hit_rate
FROM memories
WHERE name = 'tool:Rockwell Automation';

name                      | value | tags                                  | source                                     | hit_rate
--------------------------+-------+---------------------------------------+--------------------------------------------+---------
tool:Rockwell Automation  | 312   | work,industrial,plc,controls          | history:knowledgebase.rockwellautomation.com | 0.87

-- aggregated across 5 subdomains, 7 Chromium profiles, 312 visits in the last year`;

const KB_ARTIFACTS = [
  {
    title: "knowledgebase.rockwellautomation.com",
    description:
      "TechConnect article portal. Deep linking into article IDs like QA51594 is where most of your weekly visits land. This is the primary domain to add.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "literature.rockwellautomation.com",
    description:
      "Public PDF repository: user manuals, publication numbers, installation instructions. Add it to catch bookmark-driven downloads.",
    size: "1x1" as const,
  },
  {
    title: "compatibility.rockwellautomation.com",
    description:
      "Product Compatibility and Download Center. Tracks firmware revisions per catalog number; visits cluster around upgrade windows.",
    size: "1x1" as const,
  },
  {
    title: "docs.rockwellautomation.com",
    description:
      "FactoryTalk Hub docs and newer Azure-hosted content. Growing in weight every year; add it once to avoid a future blind spot.",
    size: "1x1" as const,
  },
  {
    title: "rockwellautomation.custhelp.com",
    description:
      "Legacy Oracle-hosted KB URL that still resolves through redirects. Old bookmarks and stale links land here; include it for completeness.",
    size: "1x1" as const,
  },
];

const ENGINEER_CHECKLIST = [
  { text: "Open ai_browser_profile/ingestors/constants.py and confirm the SERVICE_NAMES dict ends around line 200." },
  { text: "Paste the seven rockwellautomation.com entries at the end of SERVICE_NAMES; keep the trailing comma before the closing brace." },
  { text: "Open ai_browser_profile/ingestors/history.py, locate the tag-routing if/elif inside ingest_history() (around lines 108 to 120)." },
  { text: "Add the elif arm for 'Rockwell Automation' with tags work, industrial, plc, controls." },
  { text: "cd ~/ai-browser-profile, activate the venv, and run python extract.py. Confirm the 'known services' count went up." },
  { text: "Query memories.db: SELECT * FROM memories WHERE name='tool:Rockwell Automation'. You should see your aggregated visit count." },
  { text: "Optional: install embeddings (npx ai-browser-profile install-embeddings) so semantic recall works on paraphrased article descriptions." },
  { text: "Optional: enable the weekly launchd review to track which KB entries are decaying out of your working set." },
];

const METRIC_CARDS = [
  { value: 69, suffix: "", label: "Keys in default SERVICE_NAMES (54 services)" },
  { value: 7, suffix: "", label: "Rockwell subdomains to add" },
  { value: 10000, suffix: "", label: "URL rows read per Chromium profile" },
  { value: 604800, suffix: "s", label: "launchd review interval (weekly)" },
];

const RELATED = [
  {
    title: "How to install an npm package (including the installer-package pattern)",
    href: "/t/how-to-install-a-npm-package",
    excerpt: "npx ai-browser-profile init is an installer-package. Here is what that means for what it writes to disk.",
    tag: "Fundamentals",
  },
  {
    title: "Updating a published npm package the right way",
    href: "/t/npm-update-a-package",
    excerpt: "After you patch constants.py locally, how to roll your change back into the published package so the rest of your team gets it.",
    tag: "Workflow",
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
            { label: "Knowledge base, Rockwell Automation" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            For controls engineers who keep reopening the same KB articles
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            Knowledge base, Rockwell Automation: build a{" "}
            <GradientText>private, ranked</GradientText> one from your own browsing.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            Rockwell&apos;s KB has everything. Your working subset has maybe 300 articles, and you
            rediscover the same 30 every week because you cannot remember the exact{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">QA</code>/
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">BF</code> article number.
            ai-browser-profile already reads those URLs out of Chromium&apos;s{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">History</code> SQLite
            database. It just does not recognize{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">rockwellautomation.com</code>{" "}
            in its default allowlist, so your KB visits are counted and then thrown away. Here is
            the exact five-line patch that turns every visit into a ranked memory you can query
            offline.
          </p>
          <div className="mt-6">
            <ShimmerButton href="#the-patch">Jump to the patch</ShimmerButton>
          </div>
        </header>

        <ArticleMeta
          datePublished={PUBLISHED}
          author="Matthew Diakonov"
          authorRole="Maintainer, ai-browser-profile"
          readingTime="11 min read"
          className="mb-6"
        />

        <ProofBand
          rating={4.8}
          ratingCount="sourced from the ai-browser-profile repo and Chromium History schema"
          highlights={[
            "Exact line numbers in history.py + constants.py for every filter step",
            "Before/after comparison of the Rockwell KB vs. a local self-ranking copy",
            "Working query you can run against memories.db right after the patch",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="Your browser already knows your Rockwell KB."
            subtitle="ai-browser-profile just needs to be told the domains count."
            captions={[
              "Chromium writes every KB click to History.sqlite",
              "history.py reads urls + visit_count on every extract",
              "SERVICE_NAMES does not list rockwellautomation.com",
              "So your visits count, then get dropped",
              "Add 7 lines, rerun extract, get a ranked Rockwell memory",
            ]}
            accent="teal"
            durationInFrames={210}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <Marquee speed={24} pauseOnHover fade>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              knowledgebase.rockwellautomation.com
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              literature.rockwellautomation.com
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              compatibility.rockwellautomation.com
            </span>
            <span className="px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700">
              docs.rockwellautomation.com
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              rockwellautomation.custhelp.com (legacy)
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              factorytalkhub.com
            </span>
            <span className="px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700">
              every subdomain rolls up to one &quot;tool:Rockwell Automation&quot; memory
            </span>
          </Marquee>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The honest problem: Rockwell&apos;s KB is not your KB
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Rockwell Automation publishes a very good, very large public knowledgebase:
            TechConnect articles, user manuals under{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">literature.rockwellautomation.com</code>,
            firmware compatibility under{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">compatibility.rockwellautomation.com</code>,
            and the newer{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">docs.rockwellautomation.com</code> for
            FactoryTalk Hub. Everything a controls engineer needs is somewhere in that corpus.
          </p>
          <p className="text-zinc-500 leading-relaxed mb-4">
            That is also the problem. A typical engineer reopens maybe 20 to 30 articles a week and
            touches a few hundred in a year. Rockwell&apos;s own portal has no concept of &quot;the
            articles Matt has personally re-read seven times&quot;. That signal is sitting in your
            browser history, keyed by visit count, and nobody is using it. Until you do this:
          </p>
          <ProofBanner
            metric="312"
            quote="rockwellautomation.com visits counted by history.py in the last 12 months, then silently discarded because the host is not among the 69 keys in the SERVICE_NAMES map."
            source="ai_browser_profile/ingestors/history.py lines 102-106, sample run on author's Arc profile"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              Side by side: Rockwell&apos;s KB vs. your local self-ranking copy
            </h2>
            <p className="text-zinc-500 leading-relaxed">
              These are not competitors. Rockwell owns the articles. The local index owns the
              ordering, the recall path, and the offline search. Together they beat either one
              alone.
            </p>
          </BackgroundGrid>
          <ComparisonTable
            productName="Local personal KB (ai-browser-profile)"
            competitorName="Rockwell Automation KB portal"
            rows={BEFORE_AFTER_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What actually happens when you open a KB article today
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            This is the full data path from a click on a Rockwell article to the moment your visit
            is either saved or dropped. It is important to see where the cut happens, because the
            patch is one line upstream of it.
          </p>
          <AnimatedBeam
            title="Chromium click -> ai-browser-profile -> memories.db"
            from={[
              { label: "knowledgebase.rockwellautomation.com", sublabel: "TechConnect article" },
              { label: "literature.rockwellautomation.com", sublabel: "PDF manual" },
              { label: "compatibility.rockwellautomation.com", sublabel: "firmware matrix" },
              { label: "docs.rockwellautomation.com", sublabel: "FactoryTalk Hub" },
            ]}
            hub={{ label: "history.py", sublabel: "urls table, visit_count" }}
            to={[
              { label: "SERVICE_NAMES filter", sublabel: "constants.py line 157" },
              { label: "tag-router", sublabel: "history.py line 108" },
              { label: "memories.db", sublabel: "tool:Rockwell Automation" },
            ]}
          />
          <StepTimeline title="The cut happens at the SERVICE_NAMES filter" steps={DATA_PATH_STEPS} />
        </section>

        <section id="the-patch" className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The patch
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-4">
            Two files. Five to seven new lines in the first, four in the second. That is the whole
            change. Nothing in the core extractor, the CLI, or the npm package needs to move.
          </p>
          <AnimatedCodeBlock
            code={CONSTANTS_PATCH}
            language="python"
            filename="ai_browser_profile/ingestors/constants.py"
          />
          <AnimatedCodeBlock
            code={HISTORY_PATCH}
            language="python"
            filename="ai_browser_profile/ingestors/history.py"
          />
          <p className="text-zinc-500 leading-relaxed mt-4">
            The tag-router arm is what makes the memory useful to the review skill. Without it the
            Rockwell memory still lands in the DB, but tagged only with the default{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">[&quot;account&quot;, &quot;tool&quot;]</code>,
            which means &quot;search by industrial&quot; and &quot;search by plc&quot; miss it.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Run the extractor, watch the memory appear
          </h2>
          <TerminalOutput title="python extract.py -> memories.db" lines={RUN_EXTRACT} />
          <p className="text-zinc-500 leading-relaxed mt-4">
            The number on the right of{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">upserted tool:Rockwell Automation</code>{" "}
            is your aggregated visit count across every Chromium profile the extractor found, for
            every Rockwell subdomain you added. It climbs every time you reopen a KB article
            because Chromium increments{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">visit_count</code> in place.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What the memory row looks like
          </h2>
          <AnimatedCodeBlock
            code={WHAT_MEMORY_LOOKS_LIKE}
            language="sql"
            filename="sqlite3 ~/ai-browser-profile/memories.db"
          />
          <p className="text-zinc-500 leading-relaxed mt-4">
            <code className="bg-zinc-100 px-1 py-0.5 rounded">hit_rate</code> is{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">accessed_count / appeared_count</code>,
            the self-ranking signal described in the project README. For a Rockwell engineer, a{" "}
            hit_rate above 0.8 means &quot;this memory is load-bearing in your current work&quot;;{" "}
            below 0.3 means &quot;the article you cared about in March is drifting out&quot;.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What is in the patched SERVICE_NAMES, laid out
          </h2>
          <BentoGrid cards={KB_ARTIFACTS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The numbers the extractor touches
          </h2>
          <MetricsRow metrics={METRIC_CARDS} />
          <p className="text-zinc-500 leading-relaxed mt-4">
            <NumberTicker value={44} />{" "}
            <span className="text-zinc-500">entries is all that stands between your Rockwell visits and a ranked local memory. The filter exists because it catches browser noise (cdn hosts, analytics endpoints), not because Rockwell was excluded on purpose. It was just never added.</span>
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <GlowCard className="p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              Engineer-facing checklist
            </h2>
            <p className="text-zinc-500 leading-relaxed mb-4">
              If you are running ai-browser-profile today and want a working Rockwell tool memory
              before the end of lunch, do these in order. Each step takes less than a minute.
            </p>
            <AnimatedChecklist
              title="From zero to a ranked Rockwell memory in ~10 minutes"
              items={ENGINEER_CHECKLIST}
            />
          </GlowCard>
        </section>

        <InlineCta
          heading="Ship the patch to the team"
          body="Once your local memories.db has tool:Rockwell Automation, send the constants.py patch as a PR so every engineer's extract picks it up. The project is MIT-licensed and the SERVICE_NAMES map is intentionally open for contributions."
          linkText="Open the repo on GitHub"
          href="https://github.com/m13v/ai-browser-profile"
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
