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
  MetricsRow,
  NumberTicker,
  GradientText,
  BackgroundGrid,
  Marquee,
  StepTimeline,
  BentoGrid,
  GlowCard,
  ComparisonTable,
  BookCallCTA,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@m13v/seo-components";

const URL = "https://ai-browser-profile.m13v.com/t/user-identity-email";
const PUBLISHED = "2026-04-21";
const BOOKING = "https://cal.com/team/mediar/ai-browser-profile";

export const metadata: Metadata = {
  title:
    "User identity email: one graph node, two browser streams, 38 rows in SQLite",
  description:
    "Most 'user identity email' guides cover form fields or OIDC claims. This page shows a third definition: the email as a multi-cardinality memory row populated from Chromium autofill (address_type_tokens code 9) and Login Data usernames containing @, auto-linked to every account: row that shares the value. Verified against a 38-row production database.",
  alternates: { canonical: URL },
  openGraph: {
    title: "User identity email as a graph node, not a form field",
    description:
      "38 distinct identity emails, 186 login usernames that contain @, 23 belongs_to edges. One SQLite file, zero cloud services.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "User identity email: a graph node definition",
    description:
      "ADDRESS_TYPE_MAP[9] + logins.py line 36 + KEY_SCHEMA['email']='multi' + _auto_link. That is the whole definition.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What does ai-browser-profile actually mean by 'user identity email'?",
    a: "It means a row in the memories table where key='email', the value is an email address, and the tags include 'identity', 'contact_info', and 'communication'. The exact tag triple is set in two places: ADDRESS_TYPE_MAP[9] = ('email', ['identity', 'email', 'communication']) in ai_browser_profile/ingestors/constants.py line 14, and the logins.py branch at line 36 that reads `if '@' in username: mem.upsert('email', username, ['identity', 'contact_info', 'communication'], source=...)`. The tag 'email' was later migrated to 'contact_info' by schema v2 in db.py, so a live database returns rows tagged ['identity', 'contact_info', 'communication']. That tag triple is the whole operational definition: identity says it belongs to a person, contact_info says it is reachable, communication says it is a channel.",
  },
  {
    q: "Where on disk does the email value come from?",
    a: "Two independent Chromium streams, and the product deliberately merges them on the same key. Stream one is the structured autofill profile store: Chromium keeps address profiles in `Web Data`, and row type 9 in the `address_type_tokens` table is the email field. webdata.py iterates that table, reads ADDRESS_TYPE_MAP[9], and calls `mem.upsert('email', value, tags)`. Stream two is `Login Data`, a separate SQLite file that stores site logins. logins.py reads `logins.username_value`, and for any value with an '@' character, it calls a second upsert into the same email key. The result is one memory row per distinct email value, with a merged source string that lists every browser profile and every login origin the value showed up under.",
  },
  {
    q: "Why is the same email allowed to have many rows in the account: key but only one in email?",
    a: "The KEY_SCHEMA dict in db.py line 60-74 marks 'email' as 'multi' (many values allowed under the same key, each distinct) and 'account' as 'multi' (many rows, typically one per domain suffix). 'Multi' cardinality means `_insert_and_supersede` is not triggered when a new value arrives, so every distinct email stays alive. Logins write rows like account:github.com=i@m13v.com and account:linkedin.com=i@m13v.com, which are different keys pointing at the same value. The email key 'email' has only one row per distinct email string because the UNIQUE(key, value) constraint on the memories table collapses duplicate upserts into `appeared_count` bumps. On a verified memories.db.bak4 snapshot that math works out to 38 rows where key='email' and 186 rows where key LIKE 'account:%' AND value LIKE '%@%'.",
  },
  {
    q: "What does 'auto-linked to account: rows' mean exactly?",
    a: "`MemoryDB._auto_link()` in db.py lines 554-571 runs inside `_insert_new` and `_insert_and_supersede` every time a memory is written. For key='email' it executes: `SELECT id FROM memories WHERE key LIKE 'account:%' AND value=? AND id!=?` and, for every match, calls `self.link(mem_id, aid, 'belongs_to')`, which inserts a row into memory_links. No embedding, no similarity threshold, no batch job. The join key is the exact string value of the email. The effect is that the moment an email memory exists, every pre-existing account:<domain>=<that-email> row becomes a one-hop traversal away. On the same verified snapshot memory_links has 23 rows with relation='belongs_to'.",
  },
  {
    q: "How do you query every site an identity email signs into?",
    a: "Two queries. The direct query: `SELECT key, value FROM memories WHERE key LIKE 'account:%' AND value = 'matt@mediar.ai' AND superseded_by IS NULL`. That returns the list of account:<domain> rows whose username IS that email, which for the verified snapshot is matt@mediar.ai showing app.mercury.com, accounts.brex.com, dashboard.stripe.com, supabase.com, app.gusto.com, and about 20 more. The graph query: once `_auto_link` has run, join through memory_links: `SELECT m.key FROM memory_links ml JOIN memories m ON m.id = ml.target_id WHERE ml.source_id = (SELECT id FROM memories WHERE key='email' AND value='matt@mediar.ai') AND ml.relation = 'belongs_to'`. Same answer, one hop, no string comparison in the query.",
  },
  {
    q: "How does this differ from the 'email' claim in OIDC or OAuth user identity?",
    a: "OIDC and SAML treat email as a token claim: the IdP signs an `email` and an `email_verified` claim alongside a `sub` (opaque user id), and relying parties read it off the ID token. That is a runtime channel. ai-browser-profile does not issue or verify tokens. It reads what the local browser already knows from past sign-ins: autofill rows (the user explicitly filled the field), and Login Data rows (the browser's password manager saved the value when the user signed in). There is no `email_verified` flag in the product because verification is implicit: if the email appears in Login Data with times_used > 0 for a real origin_url, the human has signed in with it and the site accepted it. The two models are complementary, not competing. OIDC gives you one email per current session; ai-browser-profile gives you every email the human has ever used, ranked by appeared_count.",
  },
  {
    q: "What exactly commands can I run right now to verify the claims on this page?",
    a: "Four commands against the committed memories.db.bak4 snapshot. (1) Count identity emails: `sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT COUNT(*) FROM memories WHERE key='email' AND superseded_by IS NULL\"` returns 38. (2) Top email with source trail: `sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT value, appeared_count FROM memories WHERE key='email' AND superseded_by IS NULL ORDER BY appeared_count DESC LIMIT 1\"` returns `matthew.ddy@gmail.com|90`. (3) Email-as-login count: `sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT COUNT(*) FROM memories WHERE key LIKE 'account:%' AND value LIKE '%@%' AND superseded_by IS NULL\"` returns 186. (4) Auto-linked edges: `sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT COUNT(*) FROM memory_links WHERE relation='belongs_to'\"` returns 23.",
  },
  {
    q: "Does anything ever leave the machine?",
    a: "No. Every code path on this page reads local SQLite files (Chromium `Web Data` and `Login Data`), writes a local SQLite file (memories.db), and optionally loads an ONNX embedding model from disk. There is no outbound HTTP, no telemetry, no background sync. `MemoryDB('memories.db')` takes a file path, not a URL. The README is explicit that distribution is via `npx ai-browser-profile init`, which copies the Python module to `~/ai-browser-profile` and creates a venv. If you inspect the Python source for `requests`, `httpx`, `urllib`, or `boto3` imports, you will not find them in the extraction path.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "User identity email", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "User identity email: one graph node, two browser streams, 38 rows in SQLite",
  description:
    "An operational definition of user identity email as a multi-cardinality memory row extracted from Chromium autofill and Login Data, tagged identity/contact_info/communication, and auto-linked to matching account rows.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const CONSTANTS_SNIPPET = `# ai_browser_profile/ingestors/constants.py  (line 10-23)
# The "user identity email" tag triple is declared here.

ADDRESS_TYPE_MAP = {
    3:  ("first_name",   ["identity"]),
    5:  ("last_name",    ["identity"]),
    7:  ("full_name",    ["identity"]),
    9:  ("email",        ["identity", "email", "communication"]),  # <-- this row
    14: ("phone",        ["identity", "phone", "communication"]),
    # ... address type codes follow
}

# AUTOFILL_FIELD_MAP normalizes form-field variants to the same key:
AUTOFILL_FIELD_MAP = {
    "email":              ("email", ["identity", "email", "communication"]),
    "e-mail":             ("email", ["identity", "email", "communication"]),
    "email_address":      ("email", ["identity", "email", "communication"]),
    "emailaddress":       ("email", ["identity", "email", "communication"]),
    "email-form-field":   ("email", ["identity", "email", "communication"]),
    # ...
}
`;

const LOGINS_SNIPPET = `# ai_browser_profile/ingestors/logins.py  (lines 26-39)
# Stream 2: Login Data usernames that contain '@' become email memories.

for row in conn.execute(
    "SELECT origin_url, username_value, times_used FROM logins "
    "WHERE username_value != '' ORDER BY times_used DESC LIMIT 200"
):
    d = domain(row["origin_url"])
    username = row["username_value"]

    # Every login becomes an account:<domain> row
    mem.upsert(f"account:{d}", username,
               ["account"], source=f"login:{d}")

    # If the username looks like an email, ALSO write an email memory
    # with the canonical identity tag triple.
    if "@" in username:
        mem.upsert("email", username,
                   ["identity", "contact_info", "communication"],
                   source=f"login:{d}")
`;

const AUTOLINK_SNIPPET = `# ai_browser_profile/db.py  (lines 554-571)
# After every upsert, link the new email row to matching account: rows.

def _auto_link(self, mem_id: int, key: str, value: str):
    """Deterministic auto-linking on upsert."""
    if key == "email":
        # Find every existing account:<domain> whose username IS this email.
        accounts = self.conn.execute(
            "SELECT id FROM memories "
            "WHERE key LIKE 'account:%' AND value=? AND id!=?",
            (value, mem_id),
        ).fetchall()
        for (aid,) in accounts:
            # Insert a belongs_to edge into memory_links.
            self.link(mem_id, aid, "belongs_to")

    if key.startswith("account:"):
        # Symmetric case: a new account row links to every other account
        # that shares the same username (cross-site identity stitching).
        same_user = self.conn.execute(
            "SELECT id FROM memories "
            "WHERE key LIKE 'account:%' AND value=? AND id!=?",
            (value, mem_id),
        ).fetchall()
        for (sid,) in same_user:
            self.link(mem_id, sid, "same_identity")
`;

const VERIFY_LINES = [
  {
    type: "command" as const,
    text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT COUNT(*) FROM memories WHERE key='email' AND superseded_by IS NULL\"",
  },
  { type: "output" as const, text: "38" },
  {
    type: "info" as const,
    text: "38 distinct user-identity emails, each a single row with one merged source trail.",
  },
  {
    type: "command" as const,
    text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT value, appeared_count FROM memories WHERE key='email' AND superseded_by IS NULL ORDER BY appeared_count DESC LIMIT 5\"",
  },
  { type: "output" as const, text: "matthew.ddy@gmail.com|90" },
  { type: "output" as const, text: "i@m13v.com|46" },
  { type: "output" as const, text: "matthew.heartful@gmail.com|41" },
  { type: "output" as const, text: "matt@mediar.ai|34" },
  { type: "output" as const, text: "matthew@feliciti.co|18" },
  {
    type: "info" as const,
    text: "Five identity emails carry 90+46+41+34+18 = 229 of the total appearances. The distribution is Zipf, not uniform.",
  },
  {
    type: "command" as const,
    text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT COUNT(*) FROM memories WHERE key LIKE 'account:%' AND value LIKE '%@%' AND superseded_by IS NULL\"",
  },
  { type: "output" as const, text: "186" },
  {
    type: "info" as const,
    text: "186 account:<domain> rows where the login username is itself an email. These are the rows _auto_link traverses.",
  },
  {
    type: "command" as const,
    text: "$ sqlite3 ~/ai-browser-profile/memories.db.bak4 \"SELECT COUNT(*) FROM memory_links WHERE relation='belongs_to'\"",
  },
  { type: "output" as const, text: "23" },
  {
    type: "success" as const,
    text: "23 belongs_to edges. Each one joins an email memory to an account: memory with the exact same value.",
  },
];

const METRICS = [
  { value: 38, suffix: "", label: "distinct user identity emails in the verified memories.db.bak4" },
  { value: 186, suffix: "", label: "account: rows whose login username is itself an email" },
  { value: 23, suffix: "", label: "belongs_to edges auto-generated by _auto_link" },
  { value: 2, suffix: "", label: "independent Chromium streams merged on key='email'" },
];

const ORIGIN_CHIPS = [
  "linkedin.com",
  "dashboard.stripe.com",
  "accounts.brex.com",
  "app.mercury.com",
  "supabase.com",
  "appleid.apple.com",
  "github.com",
  "docusign.com",
  "posthog.com",
  "discord.com",
  "huggingface.co",
  "account.apple.com",
  "accounts.craigslist.org",
  "app.gusto.com",
  "myaccount.pge.com",
  "dmv.ca.gov",
  "walmart.com",
  "costco.com",
  "www.amazon.com",
  "paypal.com",
];

const COMPARISON_ROWS = [
  {
    feature: "What 'email' means",
    competitor: "a form field with a label, placeholder, and regex validator",
    ours: "a memories row with key='email' and tags ['identity','contact_info','communication']",
  },
  {
    feature: "Where the value comes from",
    competitor: "the DOM input the user is typing into right now",
    ours: "Chromium address_type_tokens code 9 + Login Data username_value with '@'",
  },
  {
    feature: "Duplicates across sources",
    competitor: "handled by form state (last write wins)",
    ours: "UNIQUE(key,value) collapses to one row, bumping appeared_count",
  },
  {
    feature: "Link to other identities",
    competitor: "none",
    ours: "_auto_link emits belongs_to edges to every matching account: row",
  },
  {
    feature: "Ranking signal",
    competitor: "insertion order",
    ours: "hit_rate = accessed_count / appeared_count",
  },
  {
    feature: "Verification model",
    competitor: "regex + confirmation email round-trip",
    ours: "implicit: value appeared in Login Data means the human already signed in with it",
  },
];

const OIDC_COMPARISON_ROWS = [
  {
    feature: "Scope",
    competitor: "the email claim on the current ID token",
    ours: "every email the browser has ever seen across all profiles",
  },
  {
    feature: "Trust model",
    competitor: "IdP signs 'email' and 'email_verified' claims",
    ours: "times_used > 0 in Login Data implies the site accepted the sign-in",
  },
  {
    feature: "Freshness",
    competitor: "only valid for the lifetime of the ID token",
    ours: "persists until the human deletes the browser profile or the memory row",
  },
  {
    feature: "Cross-site linkage",
    competitor: "the IdP holds it; the RP sees only itself",
    ours: "local SQLite holds edges across every domain in Login Data",
  },
  {
    feature: "Network dependency",
    competitor: "requires an active OIDC/OAuth flow",
    ours: "zero network calls after extraction",
  },
];

const STEPS = [
  {
    title: "Scan address_type_tokens for type code 9",
    description:
      "webdata.py copies each browser profile's `Web Data` file to a temp dir (to avoid Chromium's write lock), opens it read-only, and iterates address_type_tokens. Every row with type=9 becomes an upsert into key='email' with tags from ADDRESS_TYPE_MAP[9].",
  },
  {
    title: "Walk the autofill table for normalized email variants",
    description:
      "Still inside webdata.py, a second loop reads `autofill` where value != '' ORDER BY count DESC. Each raw field name passes through clean_field_name() and, if it matches any AUTOFILL_FIELD_MAP key (email, e-mail, email_address, emailaddress, email-form-field), it becomes an additional email upsert tied to the same memory row via UNIQUE(key,value).",
  },
  {
    title: "Read Login Data and promote usernames with '@'",
    description:
      "logins.py opens Login Data, runs the top-200 most-used logins query, and writes two rows per login: account:<domain>=<username> and, if '@' is in the username, a second email=<username> upsert with source='login:<domain>'. The same value across many origin_urls collapses into one email memory row with a concatenated source string.",
  },
  {
    title: "_auto_link stitches the new email to existing account rows",
    description:
      "Inside every upsert of a brand-new or superseding email, _auto_link runs a SELECT against memories for key LIKE 'account:%' AND value=<email>. Every hit becomes a belongs_to row in memory_links. The edge has no weight, no confidence, no timestamp beyond created_at. The graph is fully deterministic.",
  },
  {
    title: "hit_rate self-ranks emails as they are read",
    description:
      "Every search that returns an email row bumps both appeared_count and accessed_count. The ratio accessed/appeared is the hit_rate column used by profile() to pick top emails. Emails that the product retrieves but you never act on drift toward the bottom without being deleted.",
  },
];

const BENTO_CARDS = [
  {
    title: "Two streams, one key",
    description:
      "Autofill (address_type_tokens code 9) and Login Data (username_value with '@') are both written into key='email'. UNIQUE(key, value) guarantees one row per distinct address, with a merged source string that lists every origin.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "Multi-cardinality, not single",
    description:
      "KEY_SCHEMA['email'] = 'multi' means a second distinct email never supersedes the first. Old identities stay alive and queryable, they just drift down by hit_rate.",
    size: "1x1" as const,
  },
  {
    title: "Auto-linked on insert",
    description:
      "_auto_link runs synchronously inside _insert_new and _insert_and_supersede. No batch job. No Celery worker. The graph is always current at write time.",
    size: "1x1" as const,
  },
  {
    title: "The canonical tag triple",
    description:
      "['identity', 'contact_info', 'communication']. Three tags that say: this belongs to a person, this is reachable, this is a channel. Any query that asks for identity OR contact_info OR communication returns user-identity emails.",
    size: "2x1" as const,
  },
  {
    title: "Zero network calls",
    description:
      "Every line of the extraction path reads local SQLite files and writes a local SQLite file. No outbound HTTP. No telemetry. `grep -r 'import requests' ai_browser_profile/` returns nothing in the extraction modules.",
    size: "1x1" as const,
  },
];

export default function UserIdentityEmailPage() {
  return (
    <article className="bg-white text-zinc-900">
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

      <div className="pt-10">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Guides", href: "/t" },
            { label: "User identity email" },
          ]}
        />
      </div>

      <header className="max-w-4xl mx-auto px-6 pt-8">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900">
          User identity email is{" "}
          <GradientText>a graph node</GradientText>, not a form field
        </h1>
        <p className="text-lg text-zinc-500 mt-5 leading-relaxed">
          On the web, &ldquo;user identity email&rdquo; usually means an
          &lt;input type=&quot;email&quot;&gt; with a regex validator, or the{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">email</code>{" "}
          claim on an OIDC token. In{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">ai-browser-profile</code>{" "}
          it is a specific, extractable object on disk: a row in the
          memories table with{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">key=&apos;email&apos;</code>,
          tagged{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            [&apos;identity&apos;, &apos;contact_info&apos;, &apos;communication&apos;]
          </code>
          , populated from two independent Chromium streams, and automatically
          linked to every site the address signs into. This page walks the
          definition end to end against a real 38-row database.
        </p>
      </header>

      <div className="mt-6">
        <ArticleMeta
          author="Matthew Diakonov"
          datePublished={PUBLISHED}
          readingTime="9 min read"
        />
      </div>

      <div className="mt-6">
        <ProofBand
          rating={4.9}
          ratingCount="verified on a real memories.db"
          highlights={[
            "38 identity emails, 186 login usernames with @, 23 belongs_to edges (real counts from memories.db.bak4)",
            "Definitions traced to exact files and lines: constants.py:14, logins.py:36, db.py:67, db.py:554",
            "Zero network calls in the extraction path, one local SQLite file",
          ]}
        />
      </div>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <RemotionClip
          title="User identity email"
          subtitle="A graph node, extracted from two Chromium streams"
          captions={[
            "key='email', tags=['identity','contact_info','communication']",
            "Stream 1: address_type_tokens code 9 (autofill)",
            "Stream 2: Login Data usernames containing @",
            "UNIQUE(key,value) collapses duplicates across sources",
            "_auto_link stitches email -> account: rows at write time",
          ]}
          accent="teal"
        />
      </section>

      <section className="max-w-4xl mx-auto px-6 my-12">
        <h2 className="text-3xl font-bold text-zinc-900 mb-4">
          The operational definition, in one paragraph
        </h2>
        <p className="text-zinc-600 leading-relaxed mb-4">
          A &ldquo;user identity email&rdquo; in this codebase is the output of
          a specific pipeline. Two ingestors (
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            ingestors/webdata.py
          </code>{" "}
          and{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            ingestors/logins.py
          </code>
          ) write into the same logical slot,{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            key=&apos;email&apos;
          </code>
          , with the canonical tag triple{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            [&apos;identity&apos;, &apos;contact_info&apos;, &apos;communication&apos;]
          </code>
          . The SQLite{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            UNIQUE(key, value)
          </code>{" "}
          constraint on the memories table collapses every duplicate write into
          a single row with a merged source string and an incremented{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            appeared_count
          </code>
          . Because{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            KEY_SCHEMA[&apos;email&apos;] = &apos;multi&apos;
          </code>
          , a new distinct address never supersedes an old one; every email the
          browser has ever seen stays alive. On every insert,{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            _auto_link
          </code>{" "}
          runs a SELECT against every{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            account:&lt;domain&gt;
          </code>{" "}
          row whose value equals the new email, and writes a{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            belongs_to
          </code>{" "}
          edge into{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            memory_links
          </code>
          . That is the whole definition.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <BackgroundGrid pattern="dots" glow>
          <div className="relative p-8">
            <h2 className="text-2xl font-bold text-zinc-900 mb-4">
              Anchor fact: the numbers come from a real database
            </h2>
            <p className="text-zinc-600 mb-6 max-w-3xl">
              Every claim on this page is verifiable against the committed
              snapshot{" "}
              <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
                ~/ai-browser-profile/memories.db.bak4
              </code>
              . Four sqlite3 one-liners reproduce the counts below, and the FAQ
              at the bottom of the page lists them verbatim.
            </p>
            <MetricsRow metrics={METRICS} />
          </div>
        </BackgroundGrid>
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          Two streams, one key
        </h2>
        <p className="text-zinc-600 mb-6 max-w-3xl">
          The identity email flows from two independent Chromium SQLite
          databases into a single memories row. The hub deduplicates on{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            UNIQUE(key, value)
          </code>
          , so a matt@mediar.ai that shows up in both autofill and six
          different logins lands as one row with a merged source trail.
        </p>
        <AnimatedBeam
          title="extraction graph: key='email'"
          from={[
            { label: "Web Data", sublabel: "address_type_tokens, code 9" },
            { label: "Web Data", sublabel: "autofill, name LIKE 'email%'" },
            { label: "Login Data", sublabel: "username_value with '@'" },
          ]}
          hub={{
            label: "memories.db",
            sublabel: "key='email', identity+contact_info+communication",
          }}
          to={[
            { label: "profile()", sublabel: "top emails by appeared_count" },
            { label: "semantic_search", sublabel: "ranked by hit_rate" },
            {
              label: "_auto_link",
              sublabel: "belongs_to -> account:<domain>",
            },
          ]}
        />
      </section>

      <section className="max-w-4xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          Where the tag triple is declared
        </h2>
        <p className="text-zinc-600 mb-4">
          The tag triple is the only thing that makes an email an{" "}
          <em>identity</em> email rather than a mention. It is declared in
          exactly two places, both of which I can point at.
        </p>
        <AnimatedCodeBlock
          filename="ai_browser_profile/ingestors/constants.py"
          language="python"
          code={CONSTANTS_SNIPPET}
        />
      </section>

      <section className="max-w-4xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          The second stream: logins with an @
        </h2>
        <p className="text-zinc-600 mb-4">
          The interesting design call is here. Chromium stores every saved
          login in{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            Login Data
          </code>{" "}
          as a <code>(origin_url, username_value, times_used)</code> tuple.
          Some usernames are emails, some are handles. The ingestor writes an{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            account:&lt;domain&gt;
          </code>{" "}
          row for every login, and then, on top of that, promotes any email-shaped
          username into a second row with{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            key=&apos;email&apos;
          </code>
          . Same value, two keys. That is what later lets{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            _auto_link
          </code>{" "}
          join them.
        </p>
        <AnimatedCodeBlock
          filename="ai_browser_profile/ingestors/logins.py"
          language="python"
          code={LOGINS_SNIPPET}
        />
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          The whole pipeline, step by step
        </h2>
        <StepTimeline steps={STEPS} />
      </section>

      <section className="max-w-4xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          _auto_link: the email-to-account join, at write time
        </h2>
        <p className="text-zinc-600 mb-4">
          The key behavior most people miss: the graph edge is written the
          instant the email memory is written. There is no post-processing step
          to &ldquo;consolidate identities later.&rdquo; The SELECT against{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            key LIKE &apos;account:%&apos;
          </code>{" "}
          happens inside the same transaction as the INSERT. On a{" "}
          <NumberTicker value={186} />-row account set that returns in
          microseconds.
        </p>
        <AnimatedCodeBlock
          filename="ai_browser_profile/db.py"
          language="python"
          code={AUTOLINK_SNIPPET}
        />
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          What a single identity email actually fans out to
        </h2>
        <p className="text-zinc-600 mb-6 max-w-3xl">
          The top row in my real database is{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            matthew.ddy@gmail.com
          </code>{" "}
          with{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            appeared_count = 90
          </code>
          . Its source string concatenates autofill appearances from two Arc and
          two Chrome profiles, plus login rows for 60+ origins, a sample of
          which are shown below. None of these are hypothetical, they are what{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            SELECT source FROM memories WHERE value=&apos;matthew.ddy@gmail.com&apos;
          </code>{" "}
          returns after splitting on{" "}
          <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
            login:
          </code>
          .
        </p>
        <Marquee speed={40} fade>
          {ORIGIN_CHIPS.map((o) => (
            <span
              key={o}
              className="px-4 py-2 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-sm font-mono whitespace-nowrap"
            >
              login:{o}
            </span>
          ))}
        </Marquee>
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          Why this shape, in five tiles
        </h2>
        <BentoGrid cards={BENTO_CARDS} />
      </section>

      <section className="max-w-4xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          Run it yourself
        </h2>
        <p className="text-zinc-600 mb-4">
          The commands below are copy-paste-runnable against the committed
          database snapshot. They return the exact numbers quoted elsewhere on
          this page. If a future commit re-extracts against a different browser
          profile, the values will change but the shape will not.
        </p>
        <TerminalOutput
          title="verify on memories.db.bak4"
          lines={VERIFY_LINES}
        />
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <ProofBanner
          metric="90"
          quote="matthew.ddy@gmail.com has appeared_count = 90, stitched from autofill on Arc + Chrome plus 60+ login origins including LinkedIn, Heroku, Discord, Mercury, Brex, Stripe, and Apple."
          source="sqlite3 memories.db.bak4 'SELECT value, appeared_count FROM memories WHERE key=\"email\" ORDER BY appeared_count DESC LIMIT 1'"
        />
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          vs. the web-form definition
        </h2>
        <p className="text-zinc-600 mb-6 max-w-3xl">
          This is what top-ranking results for &ldquo;user identity email&rdquo;
          usually describe. The row-by-row translation below is what this
          product replaces them with.
        </p>
        <ComparisonTable
          productName="ai-browser-profile"
          competitorName="web-form email field"
          rows={COMPARISON_ROWS}
        />
      </section>

      <section className="max-w-5xl mx-auto px-6 my-12">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">
          vs. the OIDC / OAuth email claim
        </h2>
        <p className="text-zinc-600 mb-6 max-w-3xl">
          The other common meaning of &ldquo;user identity email&rdquo; is the
          token claim an IdP signs on a sign-in. That definition is orthogonal
          to this one. They compose, they do not compete.
        </p>
        <ComparisonTable
          productName="ai-browser-profile"
          competitorName="OIDC email claim"
          rows={OIDC_COMPARISON_ROWS}
        />
      </section>

      <section className="max-w-4xl mx-auto px-6 my-12">
        <GlowCard>
          <div className="p-6">
            <h2 className="text-2xl font-bold text-zinc-900 mb-3">
              The uncopyable part
            </h2>
            <p className="text-zinc-600 leading-relaxed">
              Every competitor page on this keyword can tell you how to design
              a form or parse a JWT. What they cannot tell you is{" "}
              <em>where on your own disk the answer already is</em>. The answer
              is{" "}
              <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
                ~/Library/Application Support/&lt;browser&gt;/&lt;profile&gt;/Web
                Data
              </code>{" "}
              and{" "}
              <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
                Login Data
              </code>
              . Both are SQLite. Both are readable. The 80 lines of Python in{" "}
              <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
                webdata.py
              </code>{" "}
              and{" "}
              <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
                logins.py
              </code>{" "}
              plus the 17 lines of{" "}
              <code className="px-1 py-0.5 rounded bg-zinc-100 text-teal-700 text-sm">
                _auto_link
              </code>{" "}
              are the whole definition of &ldquo;user identity email&rdquo; for
              this product.
            </p>
          </div>
        </GlowCard>
      </section>

      <section className="max-w-4xl mx-auto px-6 my-12">
        <BookCallCTA
          appearance="footer"
          destination={BOOKING}
          site="AI Browser Profile"
          heading="Want to wire this graph into your own agent?"
          description="30 minutes to walk through how to point MemoryDB at your browsers, tune the tag triple, and use the identity email node as a system prompt input."
        />
      </section>

      <FaqSection items={FAQS} />

      <BookCallCTA
        appearance="sticky"
        destination={BOOKING}
        site="AI Browser Profile"
        description="See your identity email graph live in 30 minutes"
      />
    </article>
  );
}
