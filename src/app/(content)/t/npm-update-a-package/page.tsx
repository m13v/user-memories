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
  CodeComparison,
  ComparisonTable,
  StepTimeline,
  MetricsRow,
  AnimatedChecklist,
  BentoGrid,
  GlowCard,
  BackgroundGrid,
  GradientText,
  Marquee,
  NumberTicker,
  InlineCta,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@seo/components";

const URL = "https://ai-browser-profile.m13v.com/t/npm-update-a-package";
const PUBLISHED = "2026-04-17";

export const metadata: Metadata = {
  title:
    "npm update a package: the three different meanings, and the one your tutorial skipped",
  description:
    "`npm update pkg` bumps inside a semver range. `npm i pkg@latest` force-jumps past it. `npx pkg@latest` has no version at all — it runs a fresh copy every time. And installer-packages ship their own `update` subcommand with a NEVER_OVERWRITE allowlist. Here is how all three actually behave on disk.",
  alternates: { canonical: URL },
  openGraph: {
    title: "npm update a package: three meanings, one worked example",
    description:
      "Semver-range bump, force-to-latest, npx re-fetch, and the installer-package update pattern — side by side. Worked case: npx ai-browser-profile update, which skips 4 paths to preserve user state.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "npm update a package: three meanings, one worked example",
    description:
      "npm update, npm i @latest, npx @latest, and installer-package update — what each one actually writes to disk.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What does `npm update <pkg>` actually do to my project?",
    a: "It walks your dependency tree, looks at the semver range you wrote in package.json (e.g. `^1.2.0` or `~1.2.0`), and installs the newest version that still satisfies that range. It rewrites `node_modules/<pkg>` and updates `package-lock.json`. By default it does NOT rewrite the range in package.json — so `^1.2.0` stays `^1.2.0` even after you've jumped from 1.2.0 to 1.9.3. Pass `--save` (npm 7+) if you also want the range in package.json re-anchored to the installed version.",
  },
  {
    q: "What is the difference between `npm update` and `npm install pkg@latest`?",
    a: "`npm update` respects the semver range. `npm install pkg@latest` ignores it. If your package.json says `\"react\": \"^18.0.0\"` and React 19 is out, `npm update react` will do nothing (it cannot cross a major). `npm install react@latest` will upgrade to 19, overwrite the range in package.json, and update the lockfile. The first is safe, the second crosses major versions by design.",
  },
  {
    q: "Does `npx pkg@latest` 'update' anything?",
    a: "Not in the lockfile sense. npx downloads the latest published version into a cache under `~/.npm/_npx/<hash>/` and runs its bin. Nothing is tracked in package.json. Nothing survives in node_modules (the cache can be pruned). So `npx something@latest` is not really an update — it's a fresh fetch every time, identical in effect to running it from scratch. This is why installer-packages (create-next-app, shadcn, ai-browser-profile) are almost always invoked through npx: there is no version to pin, because the copy on disk is not the product.",
  },
  {
    q: "Why do some packages have their own `update` subcommand?",
    a: "Because their real state does not live in node_modules. When `npx ai-browser-profile init` runs, it writes Python source into `~/ai-browser-profile/`, a SQLite database into `~/ai-browser-profile/memories.db`, and a Python virtualenv into `~/ai-browser-profile/.venv`. An npm-level `update` cannot see any of that. So the package ships its own `update` that knows which files are product code (safe to overwrite) and which are user state (must be preserved). In bin/cli.js that distinction is a literal Set: `NEVER_OVERWRITE = new Set(['memories.db', '.venv', 'scripts', 'config.json']);` at line 26. Four paths, hardcoded, read by the update function at lines 233-248.",
  },
  {
    q: "What exactly happens when I run `npx ai-browser-profile update`?",
    a: "bin/cli.js checks that `~/ai-browser-profile` already exists (line 226), then loops through the 8 COPY_TARGETS (lines 14-23) and skips any name in NEVER_OVERWRITE. Directories like `ai_browser_profile/`, `extract.py`, `clean.py`, and the skill dirs all get refreshed with the new source. `memories.db` (your data), `.venv` (your Python deps, which can take minutes to reinstall), `scripts/` (your own throwaway code), and `config.json` are all left alone. Then it regenerates launchd plists, re-links the five `~/.claude/skills/*` symlinks, and finally runs `pip install --upgrade` on the two core deps. Total runtime: a few seconds on the Node side, plus however long pip takes to diff.",
  },
  {
    q: "If updates skip `.venv`, how do I upgrade Python dependencies?",
    a: "The update function passes `--upgrade` to pip for the CORE_DEPS list (line 272 of bin/cli.js). Those two entries — `git+https://github.com/cclgroupltd/ccl_chromium_reader.git` and `numpy` — get re-resolved against PyPI and git. The rest of the venv is left untouched. If you need to upgrade optional deps (onnxruntime, huggingface_hub, tokenizers), run `npx ai-browser-profile install-embeddings` again; it passes the same package list to pip and the resolver handles the diff.",
  },
  {
    q: "Is `npm update` safe by default?",
    a: "Within the semver range you wrote, yes. A caret range (`^1.2.0`) allows any 1.x.y >= 1.2.0. A tilde range (`~1.2.0`) allows any 1.2.y >= 1.2.0. An exact pin (`1.2.0`) allows nothing. `npm update` stays inside whatever you wrote. The danger is not `npm update` itself — it's the original range you committed to package.json. If you write `*` or `latest`, update can pull in a breaking release. This is also why `package-lock.json` is important: it records the exact version installed, so CI and other devs don't silently get a different patch than you.",
  },
  {
    q: "Why doesn't `npm update` rewrite package.json by default?",
    a: "Because the range you wrote is an intent statement. `^1.2.0` means 'I trust any 1.x.y ≥ 1.2.0 to not break me.' If npm silently rewrote that to `^1.9.3` after an update, the intent gets narrower each time and you stop accepting patches from teammates with the same range. npm 7+ added `--save` for people who prefer the opposite semantics; pnpm does this by default, which is the biggest behavior gap between the two tools.",
  },
  {
    q: "How do I update ALL packages including across major versions?",
    a: "npm itself cannot do this cleanly — `npm update` is range-bound. The common tool is `npm-check-updates` (`npx npm-check-updates -u` followed by `npm install`), which rewrites every range in package.json to the latest available, then you install. It's a two-step process on purpose: you're about to cross major boundaries, and the pause between steps is where you read a changelog.",
  },
  {
    q: "How do I know an update to ai-browser-profile is available?",
    a: "Check the installed version against the registry: `npm view ai-browser-profile version` vs the version you have (cached in `~/.npm/_npx/<hash>/node_modules/ai-browser-profile/package.json`). Or just run `npx ai-browser-profile@latest update` — the `@latest` tag forces npx to re-resolve and, if a newer version was published, it'll use that bin for this run.",
  },
  {
    q: "Can `npx ai-browser-profile update` delete my memories database?",
    a: "No. `memories.db` is the first entry in NEVER_OVERWRITE at bin/cli.js:26, so the update loop (line 234) explicitly logs `skipping memories.db (user data)` and never touches it. The file is kept through every update and uninstall, which is the correct default for a local-first tool. If you genuinely want to wipe it, you can `rm ~/ai-browser-profile/memories.db` — nothing else references it by path beyond MemoryDB's constructor.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "npm update a package", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "npm update a package: the three different meanings, and the one your tutorial skipped",
  description:
    "`npm update pkg` bumps inside a semver range. `npm i pkg@latest` force-jumps past it. `npx pkg@latest` has no version at all. Installer-packages ship their own `update` subcommand with a NEVER_OVERWRITE allowlist. Here is how all three behave on disk.",
  url: URL,
  datePublished: PUBLISHED,
  author: "Matthew Diakonov",
  publisherName: "AI Browser Profile",
  publisherUrl: "https://ai-browser-profile.m13v.com",
  articleType: "TechArticle",
});

const faqLd = faqPageSchema(FAQS);

const MODE_ROWS = [
  {
    feature: "Where does the command look?",
    competitor: "package.json + node_modules",
    ours: "~/ai-browser-profile (the install directory)",
  },
  {
    feature: "What does it respect?",
    competitor: "The semver range you wrote (`^`, `~`, `>=`, exact)",
    ours: "A hardcoded NEVER_OVERWRITE allowlist inside bin/cli.js",
  },
  {
    feature: "What gets rewritten?",
    competitor: "node_modules/<pkg> and package-lock.json",
    ours: "All COPY_TARGETS not in NEVER_OVERWRITE, plus 5 symlinks",
  },
  {
    feature: "What is preserved?",
    competitor: "package.json range (unless you pass --save)",
    ours: "memories.db, .venv, scripts/, config.json (user state)",
  },
  {
    feature: "Can it cross a major?",
    competitor: "Only if the range allows it",
    ours: "Yes — npx fetches the latest published version regardless",
  },
  {
    feature: "Rollback story",
    competitor: "Restore package-lock.json and `npm ci`",
    ours: "`npx ai-browser-profile@1.0.4 update` — previous version, fresh run",
  },
];

const NEVER_OVERWRITE_CODE = `// bin/cli.js (line 26)
// Never overwrite these during update
const NEVER_OVERWRITE = new Set(['memories.db', '.venv', 'scripts', 'config.json']);

// bin/cli.js (lines 233-248) — the update loop
for (const f of COPY_TARGETS) {
  if (NEVER_OVERWRITE.has(f)) {
    console.log('  skipping', f, '(user data)');
    continue;
  }
  const src = path.join(PKG_ROOT, f);
  const dest = path.join(DEST, f);
  if (!fs.existsSync(src)) continue;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log('  updated', f);
}`;

const UPDATE_TERMINAL = [
  { type: "command" as const, text: "npx ai-browser-profile update" },
  { type: "output" as const, text: "Updating ai-browser-profile..." },
  { type: "output" as const, text: "  updated ai_browser_profile" },
  { type: "output" as const, text: "  updated extract.py" },
  { type: "output" as const, text: "  updated clean.py" },
  { type: "output" as const, text: "  updated skill" },
  { type: "output" as const, text: "  updated review" },
  { type: "output" as const, text: "  updated setup" },
  { type: "output" as const, text: "  updated autofill" },
  { type: "output" as const, text: "  updated whatsapp" },
  { type: "info" as const, text: "(no line for memories.db — it's in NEVER_OVERWRITE)" },
  { type: "info" as const, text: "(no line for .venv — preserved, pip upgrade handles core deps)" },
  { type: "output" as const, text: "  generated launchd plists" },
  { type: "output" as const, text: "  re-linked ~/.claude/skills/ai-browser-profile" },
  { type: "output" as const, text: "  re-linked ~/.claude/skills/ai-browser-profile-setup" },
  { type: "output" as const, text: "  re-linked ~/.claude/skills/memory-review" },
  { type: "output" as const, text: "  re-linked ~/.claude/skills/autofill-profiles" },
  { type: "output" as const, text: "  re-linked ~/.claude/skills/whatsapp-analysis" },
  { type: "output" as const, text: "  upgrading core dependencies..." },
  { type: "info" as const, text: "pip install --upgrade git+...ccl_chromium_reader.git numpy" },
  { type: "success" as const, text: "Update complete. memories.db and .venv preserved." },
];

const NPM_UPDATE_TERMINAL = [
  { type: "command" as const, text: "cat package.json | grep react" },
  { type: "output" as const, text: '  "react": "^18.2.0",' },
  { type: "command" as const, text: "npm outdated" },
  { type: "output" as const, text: "Package  Current  Wanted  Latest" },
  { type: "output" as const, text: "react    18.2.0   18.3.1  19.1.0" },
  { type: "command" as const, text: "npm update react" },
  { type: "output" as const, text: "+ react@18.3.1  (wanted version, inside the ^18 range)" },
  { type: "info" as const, text: "package.json range (^18.2.0) is NOT rewritten by default" },
  { type: "command" as const, text: "npm install react@latest" },
  { type: "output" as const, text: "+ react@19.1.0  (crosses the major, rewrites range to ^19.1.0)" },
];

const NPX_TERMINAL = [
  { type: "command" as const, text: "npx create-next-app@latest my-app" },
  { type: "output" as const, text: "fetched create-next-app@15.x into ~/.npm/_npx/<hash>" },
  { type: "output" as const, text: "ran bin, scaffolded ./my-app, exited" },
  { type: "info" as const, text: "nothing in your package.json. nothing to 'update'." },
  { type: "command" as const, text: "npx create-next-app@latest my-next-app   # tomorrow" },
  { type: "output" as const, text: "re-resolves create-next-app@latest, fresh run" },
  { type: "info" as const, text: "@latest here is not an update — there is no prior version to compare against" },
];

const UPDATE_STEPS = [
  {
    title: "Guard: refuse to run on a missing install",
    description:
      "bin/cli.js:226 checks `fs.existsSync(DEST)`. If ~/ai-browser-profile is not there, update exits with 'Not installed. Run: npx ai-browser-profile init'. This prevents accidentally running update before init and creating a half-initialized directory.",
  },
  {
    title: "Loop COPY_TARGETS, skip NEVER_OVERWRITE",
    description:
      "Lines 233-248. For each of the 8 copy targets, check `NEVER_OVERWRITE.has(f)`. If yes, log a skip line. Otherwise, `copyDir(src, dest)` for directories or `fs.copyFileSync(src, dest)` for files. This is where fresh source replaces old source, and where your data is deliberately untouched.",
  },
  {
    title: "Regenerate launchd plists",
    description:
      "generatePlists() runs unconditionally. If we change the plist template between releases (paths, intervals, env vars), every update picks up the new template. Existing loaded agents in ~/Library/LaunchAgents keep pointing at the plist file, so they pick up the new version on next launch.",
  },
  {
    title: "Re-symlink ~/.claude/skills",
    description:
      "linkOrRelink for each of the 5 names at lines 263-268, wrapped in try/catch so a bad symlink doesn't fail the whole update. Because they're symlinks, updating the skill directory in ~/ai-browser-profile updates what Claude Code sees instantly — nothing else is linked or unlinked downstream.",
  },
  {
    title: "pip install --upgrade on CORE_DEPS",
    description:
      "Line 272: `spawnSync(pipPath(), ['install', '--upgrade', ...CORE_DEPS, '-q'])`. Only the two tier-1 dependencies are upgraded (the git-installed ccl_chromium_reader and numpy). Optional embeddings are not touched — you re-run install-embeddings if you want those upgraded too.",
  },
];

const NPM_COMMANDS_THAT_SOUND_SIMILAR = [
  {
    title: "npm update",
    description:
      "Bumps every top-level dep to the highest version inside its semver range. Does NOT rewrite package.json ranges by default.",
    size: "1x1" as const,
  },
  {
    title: "npm update pkg",
    description:
      "Same, for one package. Works only within the range you committed. Will stall at major boundaries.",
    size: "1x1" as const,
  },
  {
    title: "npm install pkg@latest",
    description:
      "Force-install the newest published version, even if it crosses a major. Rewrites the range in package.json.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "npm install pkg@X.Y.Z",
    description:
      "Pin to an exact version. Ignores ranges, overwrites package.json entry to a pinned `X.Y.Z`.",
    size: "1x1" as const,
  },
  {
    title: "npx pkg@latest",
    description:
      "Not an update. Re-fetches from the registry into the npx cache and runs bin. No state is written to package.json or node_modules.",
    size: "1x1" as const,
  },
  {
    title: "npx pkg update",
    description:
      "Runs the package's own `update` subcommand. Whatever the bin decides it means — usually: rewrite code in $HOME, preserve user state, migrate config.",
    size: "2x1" as const,
    accent: true,
  },
];

const SAFE_UPDATE_CHECKLIST = [
  { text: "Before any update: commit package-lock.json (it's your rollback point)." },
  { text: "Run `npm outdated` first. See the gap between Current, Wanted, and Latest." },
  { text: "Use `npm update` when you trust your semver range. Use `npm i pkg@latest` when you do not and want to cross a major." },
  { text: "For installer-packages (create-next-app, shadcn, ai-browser-profile): `npx pkg@latest update` is the idiom. There is no lockfile entry to bump." },
  { text: "After update, look for a NEVER_OVERWRITE-style allowlist in the bin script if user data lives outside node_modules. No allowlist means the package can clobber your state." },
  { text: "Run tests. `npm update` is range-safe, not test-safe." },
];

const UPDATE_MANIFESTS = [
  {
    title: "COPY_TARGETS",
    description:
      "The 8-entry list of paths the update function walks. Defined at bin/cli.js:14-23. Change this list, change what the update rewrites.",
  },
  {
    title: "NEVER_OVERWRITE",
    description:
      "The 4-entry Set the update function checks before each copy. Defined at bin/cli.js:26. Names in here survive every update.",
  },
  {
    title: "CORE_DEPS",
    description:
      "The 2-entry pip list passed to `pip install --upgrade` on every update. Defined at bin/cli.js:30-33. Change this list, change which Python libs get refreshed.",
  },
  {
    title: "links",
    description:
      "The 5-entry array of ~/.claude/skills symlinks re-linked on every update. Defined inline at bin/cli.js:255-261. Changing it here surfaces new skill dirs without a reinstall.",
  },
];

const BEFORE_AFTER_CODE_LEFT = `// Generic "npm update" assumptions:
// 1. State lives in ./node_modules
// 2. Versions are tracked in package.json + lockfile
// 3. Upgrading = re-resolve semver range

npm update pkg
// -> node_modules/pkg is rewritten
// -> package-lock.json is rewritten
// -> package.json range is untouched
// -> nothing outside the project changed`;

const BEFORE_AFTER_CODE_RIGHT = `// Installer-package update assumptions:
// 1. State lives in $HOME (not node_modules)
// 2. There is NO versioning in the consumer project
// 3. Upgrading = re-copy source, preserve user data

npx ai-browser-profile update
// -> ~/ai-browser-profile/<code paths> rewritten
// -> ~/ai-browser-profile/memories.db PRESERVED (NEVER_OVERWRITE)
// -> ~/ai-browser-profile/.venv PRESERVED (NEVER_OVERWRITE)
// -> ~/.claude/skills/* re-symlinked
// -> pip install --upgrade on core Python deps`;

export default function Page() {
  return (
    <>
      <main className="bg-white text-zinc-900 pb-20">
        <Breadcrumbs
          className="pt-8 mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Guides", href: "/t" },
            { label: "npm update a package" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            npm semantics, read carefully
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            npm update a package: <GradientText>three meanings</GradientText>, and the one your tutorial skipped.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            &ldquo;Update a package&rdquo; reads like one thing. It is at least three. Inside{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">npm update pkg</code>,
            updates stay inside the semver range you wrote in{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">package.json</code>.{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">npm i pkg@latest</code>{" "}
            jumps past that range. And a whole class of packages (create-next-app, shadcn,
            our own ai-browser-profile) has no{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">node_modules</code>{" "}
            entry to update in the first place, because the product lives in $HOME. Those
            ship their own{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">update</code>{" "}
            subcommand, with an explicit allowlist of paths to leave alone. This page walks
            all three, using ai-browser-profile&apos;s 316-line bin script as the worked
            example.
          </p>
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
          ratingCount="sourced from npm docs + bin/cli.js in the public repo"
          highlights={[
            "Three distinct update semantics, side by side",
            "The NEVER_OVERWRITE allowlist pattern, with exact line numbers",
            "Pre-flight checklist for safe updates across all three modes",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="npm update is three different things"
            subtitle="Semver bump, force-latest, npx re-fetch, and the update subcommand"
            captions={[
              "npm update pkg: bumps inside your semver range",
              "npm i pkg@latest: jumps past the range on purpose",
              "npx pkg@latest: no prior version, always fresh",
              "installer-package update: re-copy source, preserve user data",
              "Four paths in NEVER_OVERWRITE keep your state safe",
            ]}
            accent="teal"
            durationInFrames={210}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <Marquee speed={24} pauseOnHover fade>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              npm update = semver-range bump
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              npm i pkg@latest = cross the major
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              npx pkg@latest = no version in your project
            </span>
            <span className="px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700">
              installer-package update = preserve user state
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              NEVER_OVERWRITE keeps memories.db safe
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              pip --upgrade on CORE_DEPS only
            </span>
            <span className="px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700">
              5 skills re-symlinked every update
            </span>
          </Marquee>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Mode 1: <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">npm update pkg</code> — the range-bound upgrade
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            This is the command every tutorial teaches. The rule is simple and almost
            always glossed over: it respects your semver range, and it does NOT rewrite{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">package.json</code> ranges by
            default. So if you wrote <code className="bg-zinc-100 px-1 py-0.5 rounded">^18.2.0</code>, an update
            will happily jump you from 18.2.0 to 18.3.1, but it will stop cold at 19.0.0.
          </p>
          <TerminalOutput title="npm update vs npm install pkg@latest" lines={NPM_UPDATE_TERMINAL} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Mode 2: <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">npx pkg@latest</code> — not really an update
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            npx has no concept of an installed version. It downloads the package into a
            throwaway cache (<code className="bg-zinc-100 px-1 py-0.5 rounded">~/.npm/_npx/&lt;hash&gt;</code>),
            runs its bin, and walks away. So{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">@latest</code> is not telling
            npm to upgrade anything — it is just a tag saying &ldquo;ignore any cached
            resolution, re-resolve to latest right now.&rdquo;
          </p>
          <TerminalOutput title="npx pkg@latest — always fresh, never 'updated'" lines={NPX_TERMINAL} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              Mode 3: the installer-package <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">update</code> subcommand
            </h2>
            <p className="text-zinc-500 leading-relaxed mb-2">
              When the real product lives outside <code className="bg-zinc-100 px-1 py-0.5 rounded">node_modules</code> — in{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">~/ai-browser-profile/</code>,
              or <code className="bg-zinc-100 px-1 py-0.5 rounded">src/components/ui/</code>,
              or <code className="bg-zinc-100 px-1 py-0.5 rounded">./your-new-app/</code> — an
              npm-level update has no surface to act on. The package ships its own{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">update</code> command and makes
              the rewrite rules explicit in its bin script.
            </p>
            <TerminalOutput title="npx ai-browser-profile update" lines={UPDATE_TERMINAL} />
          </BackgroundGrid>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The three modes, side by side
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            A direct comparison. The left column is the story most tutorials tell about{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">npm update</code>. The right
            column is what <code className="bg-zinc-100 px-1 py-0.5 rounded">npx ai-browser-profile update</code>{" "}
            actually does, driven by the rules in bin/cli.js. Same verb, different disk
            model.
          </p>
          <ComparisonTable
            productName="Installer-package update (npx)"
            competitorName="Classic npm update"
            rows={MODE_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <ProofBanner
            quote="const NEVER_OVERWRITE = new Set(['memories.db', '.venv', 'scripts', 'config.json']);"
            source="bin/cli.js:26"
            metric="4 paths"
          />
          <p className="mt-4 text-zinc-500 leading-relaxed">
            This is the entire safety net. Four string entries in a{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">Set</code>. Every time{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">npx ai-browser-profile update</code>{" "}
            runs, it iterates the 8 COPY_TARGETS and checks{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">NEVER_OVERWRITE.has(f)</code>{" "}
            before each copy. Four names pass the check. Four files survive. Your memories
            database, your Python virtualenv, your personal{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">scripts/</code> directory, and
            your <code className="bg-zinc-100 px-1 py-0.5 rounded">config.json</code> never
            get touched by an update. No registry, no versioning, no clever logic — just one
            Set and a check.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The NEVER_OVERWRITE allowlist, in source
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Here is the entire guard. The{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">Set</code> definition plus the
            loop that reads it. You can copy this pattern into any installer-package you
            ship; the rule &ldquo;explicit allowlist of preserved paths, not a blacklist of
            ignored paths&rdquo; keeps updates honest.
          </p>
          <AnimatedCodeBlock
            code={NEVER_OVERWRITE_CODE}
            language="javascript"
            filename="bin/cli.js (update())"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Two update mental models, side by side
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            What the word &ldquo;update&rdquo; assumes in each world. Reading both at once
            is the fastest way to stop conflating them.
          </p>
          <CodeComparison
            title="Classic npm update vs installer-package update"
            leftLabel="npm update pkg"
            rightLabel="npx ai-browser-profile update"
            leftCode={BEFORE_AFTER_CODE_LEFT}
            rightCode={BEFORE_AFTER_CODE_RIGHT}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">npx ai-browser-profile update</code> does, in order
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Five steps, every one visible in bin/cli.js. Total wall-clock time is dominated
            by the final pip upgrade; the Node-side copy loop finishes in under a second on
            a typical SSD.
          </p>
          <StepTimeline steps={UPDATE_STEPS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Where each piece of data ends up
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            One update run. Three input sources on the left, the{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">bin/cli.js update</code>{" "}
            function in the middle, and four disk destinations on the right. The user-data
            ones (memories.db, .venv) are listed as preserved, not destinations — they are
            what the function refuses to touch.
          </p>
          <AnimatedBeam
            title="Data flow during `npx ai-browser-profile update`"
            from={[
              { label: "npm registry (new package tarball)" },
              { label: "PyPI + git (ccl_chromium_reader)" },
              { label: "existing ~/ai-browser-profile state" },
            ]}
            hub={{ label: "bin/cli.js update()" }}
            to={[
              { label: "rewritten: code paths (ai_browser_profile/, *.py, skill/, ...)" },
              { label: "regenerated: launchd plists" },
              { label: "re-linked: 5 symlinks in ~/.claude/skills/" },
              { label: "preserved: memories.db, .venv, scripts/, config.json" },
            ]}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            By the numbers
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Load-bearing integers. All four are constants in bin/cli.js; the update
            function reads each one to decide what to do.
          </p>
          <MetricsRow
            metrics={[
              { value: 4, label: "entries in NEVER_OVERWRITE (bin/cli.js:26)" },
              { value: 8, label: "COPY_TARGETS the update loop walks" },
              { value: 5, label: "symlinks re-linked into ~/.claude/skills" },
              { value: 2, label: "core Python deps upgraded via pip --upgrade" },
            ]}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <GlowCard>
            <h3 className="text-xl font-semibold text-zinc-900 mb-3">
              One integer deserves its own number: <NumberTicker value={316} /> lines
            </h3>
            <p className="text-zinc-500 leading-relaxed">
              That is the full length of{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">bin/cli.js</code>. It holds
              all three subcommands (<code className="bg-zinc-100 px-1 py-0.5 rounded">init</code>,{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">update</code>,{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">install-embeddings</code>),
              the COPY_TARGETS list, the NEVER_OVERWRITE set, the CORE_DEPS list, the
              symlink array, the Python resolver, and the launchd plist generator. If you
              are ever unsure what an <code className="bg-zinc-100 px-1 py-0.5 rounded">npx ai-browser-profile update</code>{" "}
              will do, <code className="bg-zinc-100 px-1 py-0.5 rounded">npm pack</code>, then
              read those 316 lines end-to-end in five minutes.
            </p>
          </GlowCard>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Six commands that all look like &ldquo;update a package&rdquo;
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            They sound similar, they do very different things. Knowing which one you
            actually want is the whole game.
          </p>
          <BentoGrid cards={NPM_COMMANDS_THAT_SOUND_SIMILAR} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The four constants that drive <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">update()</code>
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            Everything else in the function is plumbing. These four lists decide what gets
            rewritten, what gets preserved, what gets refreshed on PyPI, and what shows up
            under <code className="bg-zinc-100 px-1 py-0.5 rounded">~/.claude/skills</code>.
            Change any of them, change the whole update behavior.
          </p>
          <StepTimeline steps={UPDATE_MANIFESTS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Before you run any update: the pre-flight list
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Six checks that apply regardless of which of the three modes you are in. Each
            takes under a minute.
          </p>
          <AnimatedChecklist title="pre-flight — safe updates across npm, npx, and installer-packages" items={SAFE_UPDATE_CHECKLIST} />
        </section>

        <InlineCta
          heading="Try the update subcommand yourself"
          body="If ai-browser-profile is already installed, one command refreshes every code path, regenerates the plists, re-links the 5 skills, and upgrades the core Python deps — without touching your memories database or Python venv."
          linkText="npx ai-browser-profile update"
          href="https://github.com/m13v/ai-browser-profile"
        />

        <FaqSection items={FAQS} />

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
      </main>
    </>
  );
}
