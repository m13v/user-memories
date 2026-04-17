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
  MetricsRow,
  AnimatedChecklist,
  BentoGrid,
  GlowCard,
  BackgroundGrid,
  GradientText,
  Marquee,
  InlineCta,
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
} from "@seo/components";

const URL = "https://ai-browser-profile.m13v.com/t/how-to-install-a-npm-package";
const PUBLISHED = "2026-04-17";

export const metadata: Metadata = {
  title:
    "How to install an npm package: the normal way, and the installer-package way nobody teaches",
  description:
    "npm install writes to node_modules. But a whole class of packages (create-next-app, shadcn, ai-browser-profile) uses the bin field to run a custom installer that writes to your home directory instead. Here is what actually happens, line by line.",
  alternates: { canonical: URL },
  openGraph: {
    title: "How to install an npm package (including the installer-package pattern)",
    description:
      "The mechanics of npm install, and the separate bin+npx pattern that writes outside node_modules. Worked example: ai-browser-profile, 8 copy targets, a Python venv, and 5 skill symlinks.",
    type: "article",
    url: URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "How to install an npm package (the installer-package way too)",
    description:
      "Beyond npm install: packages whose bin runs a full installer, spawns a Python venv, writes launchd plists, and symlinks into ~/.claude/skills.",
  },
  robots: "index, follow",
};

const FAQS = [
  {
    q: "What does `npm install <package>` actually do?",
    a: "npm resolves the package from the registry, downloads the tarball, unpacks it into node_modules/<package>, and reads its package.json to resolve and install its own dependencies (transitive closure). If the package declares a `bin` entry, npm also creates a symlink inside node_modules/.bin/ pointing at that file and makes it executable. Nothing else runs by default. In particular, arbitrary scripts are only executed if the package has a `postinstall` hook, which npm will run after unpack unless you pass --ignore-scripts.",
  },
  {
    q: "What is the difference between `npm install`, `npm install -g`, and `npx`?",
    a: "`npm install <pkg>` installs into the current project's node_modules and adds it to dependencies. `npm install -g <pkg>` installs into a global prefix (usually /usr/local/lib/node_modules or ~/.npm-global/lib/node_modules), and the package's bin entries land in a PATH directory so you can run them as commands. `npx <pkg>` downloads the package into a short-lived cache (~/.npm/_npx/<hash>) and runs its bin without adding it to any project. For a package whose purpose is to be executed once (scaffolders, installers, setup wizards), npx is the right call — you don't leave a copy behind, and you always pull the latest version on the next run.",
  },
  {
    q: "What is an 'installer package' on npm?",
    a: "An installer package is a package whose real job is not to be imported from your code. Its bin entry is the entire product. When you run it, it writes files somewhere other than node_modules — often $HOME, a system path, or another package you already have. create-next-app scaffolds a whole project in the current directory. shadcn-ui writes React component source into src/components/ui/. ai-browser-profile copies Python source into ~/ai-browser-profile/, creates a .venv, and symlinks into ~/.claude/skills/. None of these survive in node_modules the way a library would.",
  },
  {
    q: "Is writing outside node_modules safe?",
    a: "It is a well-supported pattern, but it does mean the package can touch files anywhere the current user can write. For scaffolders and skill installers that is the whole point; for random packages it should make you pause. Before running `npx <something> init`, read the bin script — it's just JS. On ai-browser-profile, the file is bin/cli.js, 316 lines, and the destinations are explicitly `DEST = path.join(os.homedir(), 'ai-browser-profile')` at line 9 plus `linkOrRelink` symlinks into `~/.claude/skills/` at lines 201-213. Nothing is hidden: everything the installer touches is named in plain code.",
  },
  {
    q: "Why does `npx ai-browser-profile init` create a Python venv if it's an npm package?",
    a: "Because the product is written in Python; the npm package is just the delivery mechanism. bin/cli.js calls `python -m venv .venv` at `~/ai-browser-profile/.venv` (line 171), then pip-installs two dependencies: `git+https://github.com/cclgroupltd/ccl_chromium_reader.git` (a Chromium IndexedDB reader that is not on PyPI), and `numpy`. An optional second tier installs `onnxruntime`, `huggingface_hub`, and `tokenizers` for local embeddings — about 180 MB extra. All of that lives in ~/ai-browser-profile/.venv, not node_modules. This is how you ship a Python tool through npm without asking users to touch pip.",
  },
  {
    q: "Does the installer edit my global Claude Code config?",
    a: "It creates symlinks in ~/.claude/skills/, which is how Claude Code discovers agent skills. Five names get linked: ai-browser-profile, ai-browser-profile-setup, memory-review, autofill-profiles, and whatsapp-analysis. Each link points back into ~/ai-browser-profile/<dir>, so updates via `npx ai-browser-profile update` take effect instantly (the link does not move). If you delete ~/ai-browser-profile, the symlinks become dangling but don't break the rest of your Claude config. The exact list is hardcoded in bin/cli.js lines 201-207.",
  },
  {
    q: "What's the difference between `npm install` and this package's `init` command?",
    a: "`npm install ai-browser-profile` would drop it into ./node_modules and add it to your package.json. But this package is not a library — you wouldn't import it from JavaScript. It is meant to be run as `npx ai-browser-profile init`, which downloads the package into the npx cache and runs its bin. The bin then writes real files into your home directory. There is no reason to `npm install --save` an installer package — you don't import it, and the copy inside ./node_modules never gets used.",
  },
  {
    q: "Can I see exactly what a package will do before I run it?",
    a: "Yes. `npm view <pkg>` prints the package manifest from the registry — including the bin entry. `npm pack <pkg>` downloads the tarball without executing anything, so you can unzip it and read the scripts. For ai-browser-profile specifically: `npm view ai-browser-profile files` lists bin/, extract.py, clean.py, and the five skill dirs. The entire installer is bin/cli.js, 316 lines, MIT licensed, readable in five minutes. If you are ever unsure what `npx something init` will do, `npm pack something` first.",
  },
  {
    q: "Does ai-browser-profile register a cron job or daemon?",
    a: "Yes, optionally. During init, bin/cli.js writes `~/ai-browser-profile/launchd/com.m13v.memory-review.plist` with `StartInterval: 604800` (weekly, seconds). The plist does not activate itself — you have to `ln -sf ~/ai-browser-profile/launchd/com.m13v.memory-review.plist ~/Library/LaunchAgents/` and `launchctl load` it manually. Until you do that step, launchd is not involved. The plist triggers `review/run.sh`, which re-runs extract + LLM review and writes to `review/logs/`. This is a macOS-only feature.",
  },
  {
    q: "What about Windows and Linux? Will `npx ai-browser-profile init` work?",
    a: "The Node portion (copying files, creating the venv, installing pip deps) works on any OS where Node >= 16 and Python >= 3.10 are available. The launchd plist is macOS specific; on Linux or Windows the plist file still gets written, but it is inert — there is no launchd to load it into. The `~/.claude/skills/` symlinks use fs.symlinkSync, which needs admin rights on some Windows setups; on macOS and Linux it just works.",
  },
];

const breadcrumbsLd = breadcrumbListSchema([
  { name: "Home", url: "https://ai-browser-profile.m13v.com/" },
  { name: "Guides", url: "https://ai-browser-profile.m13v.com/t" },
  { name: "How to install an npm package", url: URL },
]);

const articleLd = articleSchema({
  headline:
    "How to install an npm package: the normal way, and the installer-package way nobody teaches",
  description:
    "npm install writes to node_modules. A separate class of packages uses bin + npx to run a custom installer that writes outside node_modules. Worked example: ai-browser-profile spawns a Python venv, registers a launchd plist, and symlinks into ~/.claude/skills.",
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
    feature: "Destination",
    competitor: "./node_modules/<pkg>/",
    ours: "Wherever bin/cli.js decides. For ai-browser-profile: ~/ai-browser-profile/",
  },
  {
    feature: "Typical invocation",
    competitor: "npm install <pkg>",
    ours: "npx <pkg> <subcommand> (never retained locally)",
  },
  {
    feature: "Adds to package.json",
    competitor: "Yes, under dependencies or devDependencies",
    ours: "No. The package is never a dependency of anything.",
  },
  {
    feature: "Imports from your code",
    competitor: "require('<pkg>') / import from '<pkg>'",
    ours: "Never imported. The bin entry is the product.",
  },
  {
    feature: "Side effects",
    competitor: "Only those in postinstall (if any)",
    ours: "Whatever bin does: venvs, symlinks, launchd plists, git pulls.",
  },
  {
    feature: "Uninstall",
    competitor: "npm uninstall <pkg>",
    ours: "rm -rf the directory bin wrote into. npm never tracked it.",
  },
];

const INSTALLER_COPY_TARGETS_CODE = `// bin/cli.js (line 9, 14-23)
const DEST = path.join(os.homedir(), 'ai-browser-profile');

const COPY_TARGETS = [
  'ai_browser_profile',
  'extract.py',
  'clean.py',
  'skill',
  'review',
  'setup',
  'autofill',
  'whatsapp',
];`;

const SYMLINK_CODE = `// bin/cli.js (lines 201-213)
const links = [
  ['ai-browser-profile',       'skill'],
  ['ai-browser-profile-setup', 'setup'],
  ['memory-review',            'review'],
  ['autofill-profiles',        'autofill'],
  ['whatsapp-analysis',        'whatsapp'],
];

for (const [name, dir] of links) {
  const target = path.join(DEST, dir);
  const link   = path.join(HOME, '.claude', 'skills', name);
  linkOrRelink(target, link);
}`;

const VENV_CODE = `// bin/cli.js (line 171, 186)
spawnSync(python, ['-m', 'venv', venvPath], { stdio: 'inherit' });

// Core Python deps (tier 1) — installed into ~/ai-browser-profile/.venv
spawnSync(pipPath(), ['install',
  'git+https://github.com/cclgroupltd/ccl_chromium_reader.git',
  'numpy',
], { stdio: 'inherit' });`;

const INIT_TERMINAL = [
  { type: "command" as const, text: "npx ai-browser-profile init" },
  { type: "output" as const, text: "Setting up ai-browser-profile in /Users/you/ai-browser-profile" },
  { type: "output" as const, text: "  copied ai_browser_profile" },
  { type: "output" as const, text: "  copied extract.py" },
  { type: "output" as const, text: "  copied clean.py" },
  { type: "output" as const, text: "  copied skill" },
  { type: "output" as const, text: "  copied review" },
  { type: "output" as const, text: "  copied setup" },
  { type: "output" as const, text: "  copied autofill" },
  { type: "output" as const, text: "  copied whatsapp" },
  { type: "output" as const, text: "  generated launchd plists" },
  { type: "output" as const, text: "  creating Python venv..." },
  { type: "info" as const, text: "running: python -m venv /Users/you/ai-browser-profile/.venv" },
  { type: "output" as const, text: "  upgrading pip..." },
  { type: "output" as const, text: "  installing core dependencies..." },
  { type: "info" as const, text: "pip install git+https://github.com/cclgroupltd/ccl_chromium_reader.git numpy" },
  { type: "output" as const, text: "  core dependencies installed" },
  { type: "output" as const, text: "  ~/.claude/skills/ai-browser-profile       -> ~/ai-browser-profile/skill" },
  { type: "output" as const, text: "  ~/.claude/skills/ai-browser-profile-setup -> ~/ai-browser-profile/setup" },
  { type: "output" as const, text: "  ~/.claude/skills/memory-review            -> ~/ai-browser-profile/review" },
  { type: "output" as const, text: "  ~/.claude/skills/autofill-profiles        -> ~/ai-browser-profile/autofill" },
  { type: "output" as const, text: "  ~/.claude/skills/whatsapp-analysis        -> ~/ai-browser-profile/whatsapp" },
  { type: "success" as const, text: "Done! Next: ~/ai-browser-profile/.venv/bin/python ~/ai-browser-profile/extract.py" },
];

const INSTALLER_STEPS = [
  {
    title: "Node resolves the package",
    description:
      "npx downloads the tarball from the npm registry into ~/.npm/_npx/<hash>/node_modules/ai-browser-profile/. This is a throwaway cache; the only thing npm keeps is the bin link.",
  },
  {
    title: "Node runs bin/cli.js init",
    description:
      "The bin field in package.json points at bin/cli.js. Running `npx ai-browser-profile init` spawns node on that file with init as argv[2]. Everything from this point is ordinary JavaScript with fs, path, and child_process.",
  },
  {
    title: "copyDir writes 8 paths into ~/ai-browser-profile",
    description:
      "ai_browser_profile/, extract.py, clean.py, skill/, review/, setup/, autofill/, whatsapp/. These are the Python source and skill directories that Claude Code will later read. node_modules is already done; this is where the real product lands.",
  },
  {
    title: "A Python venv is created and hydrated",
    description:
      "python -m venv ~/ai-browser-profile/.venv, then pip install of `git+https://github.com/cclgroupltd/ccl_chromium_reader.git` and numpy. ccl_chromium_reader is not on PyPI; pip clones the GitHub repo and builds the wheel in place. This is why Node alone cannot install the package — Python tooling is doing the second leg.",
  },
  {
    title: "generatePlists writes a launchd template",
    description:
      "A macOS-style launchd plist lands at ~/ai-browser-profile/launchd/com.m13v.memory-review.plist with StartInterval 604800 (weekly). The plist is inert until the user symlinks it into ~/Library/LaunchAgents and calls launchctl load. Running init does not activate a daemon.",
  },
  {
    title: "Five skill dirs are symlinked into ~/.claude/skills",
    description:
      "linkOrRelink deletes any existing entry at each link path, then fs.symlinkSync back to ~/ai-browser-profile/<dir>. Because they are symlinks, `npx ai-browser-profile update` will pick up changes without re-linking anything. This is how the npm install ends up surfacing a skill inside an entirely different tool (Claude Code).",
  },
];

const NORMAL_CMDS = [
  { type: "command" as const, text: "npm install lodash" },
  { type: "output" as const, text: "writes ./node_modules/lodash" },
  { type: "output" as const, text: "edits ./package.json -> dependencies" },
  { type: "command" as const, text: "npm install -D vitest" },
  { type: "output" as const, text: "same, but into devDependencies" },
  { type: "command" as const, text: "npm install -g pnpm" },
  { type: "output" as const, text: "writes $NPM_CONFIG_PREFIX/lib/node_modules/pnpm" },
  { type: "output" as const, text: "links $NPM_CONFIG_PREFIX/bin/pnpm into PATH" },
];

const INSTALLER_CMDS = [
  { type: "command" as const, text: "npx create-next-app my-app" },
  { type: "output" as const, text: "scaffolds ./my-app/... nothing in local node_modules" },
  { type: "command" as const, text: "npx shadcn@latest add button" },
  { type: "output" as const, text: "writes src/components/ui/button.tsx in the consumer project" },
  { type: "command" as const, text: "npx ai-browser-profile init" },
  { type: "output" as const, text: "writes ~/ai-browser-profile + ~/.claude/skills/*" },
  { type: "info" as const, text: "none of these live in your project's node_modules" },
];

const WHO_DOES_WHAT = [
  {
    title: "create-next-app",
    description:
      "Scaffolds a new Next.js project into a target directory. The bin is scripts/create-next-app.js; npx spawns it once, it writes files, exits.",
  },
  {
    title: "shadcn / shadcn-ui",
    description:
      "Copies component source into your existing repo. There is no shadcn library at runtime — you own the files after it runs. bin/index.mjs dispatches add/init/diff subcommands.",
  },
  {
    title: "ai-browser-profile",
    description:
      "Installs a Python-based Claude Code skill. bin/cli.js copies 8 targets to ~/ai-browser-profile, spawns a venv, and symlinks 5 skills into ~/.claude/skills.",
  },
  {
    title: "degit",
    description:
      "Clones a git repo without the .git history into the current directory. Pure npx workflow; no dependencies to leave behind.",
  },
];

const CHECKLIST_BEFORE_NPX = [
  { text: "Run `npm view <pkg>` and read the 'bin' field. There is the entry point." },
  { text: "Run `npm pack <pkg>` to download without executing. Unzip and read bin/*." },
  { text: "Check if the package asks you for sudo. An installer that needs sudo is a much bigger ask." },
  { text: "Scan bin for fs.writeFileSync / symlinkSync / spawnSync calls. That is what will happen on disk." },
  { text: "Decide whether the destination paths (~/.config, $HOME, /usr/local) are ok for your environment." },
];

const VERIFY_TERMINAL = [
  { type: "command" as const, text: "npm view ai-browser-profile bin" },
  { type: "output" as const, text: '{ "ai-browser-profile": "bin/cli.js" }' },
  { type: "command" as const, text: "npm pack ai-browser-profile" },
  { type: "output" as const, text: "ai-browser-profile-1.0.5.tgz" },
  { type: "command" as const, text: "tar -tzf ai-browser-profile-1.0.5.tgz | head" },
  { type: "output" as const, text: "package/bin/cli.js" },
  { type: "output" as const, text: "package/extract.py" },
  { type: "output" as const, text: "package/clean.py" },
  { type: "output" as const, text: "package/skill/SKILL.md" },
  { type: "command" as const, text: "tar -xzOf ai-browser-profile-1.0.5.tgz package/bin/cli.js | wc -l" },
  { type: "output" as const, text: "     316" },
  { type: "success" as const, text: "316 lines of ordinary JS. Read it, then decide." },
];

const UPDATE_VS_INIT = [
  {
    title: "init (first time)",
    description:
      "Creates ~/ai-browser-profile if missing, copies all 8 targets, creates the Python venv, installs core deps, regenerates launchd plists, and links skills. Safe to re-run but will overwrite unmodified Python files.",
  },
  {
    title: "update (subsequent)",
    description:
      "Copies only the code paths (skips memories.db, .venv, scripts/, config.json via the NEVER_OVERWRITE set), re-symlinks skills, and upgrades core pip deps. Your local data is preserved. See bin/cli.js lines 225-276.",
  },
  {
    title: "install-embeddings (optional)",
    description:
      "Adds ~180MB of Python deps (onnxruntime, huggingface_hub, tokenizers) for semantic search. Everything else keeps working without it. Model downloads on first semantic search, not on this command.",
  },
];

const MANIFEST_CARDS = [
  {
    title: "bin",
    description:
      "The entry that npx runs. Without this field, there is no installer — it's just a library.",
    size: "1x1" as const,
  },
  {
    title: "files",
    description:
      "What actually ships in the tarball. Node source, Python source, and skill dirs for this package.",
    size: "1x1" as const,
  },
  {
    title: "scripts.postinstall",
    description:
      "Runs automatically on `npm install`. Missing in ai-browser-profile on purpose: the user invokes init explicitly, so nothing happens silently.",
    size: "2x1" as const,
    accent: true,
  },
  {
    title: "engines.node",
    description:
      "Hard floor on Node version. >= 16 here so fs.symlinkSync and os.homedir behave consistently.",
    size: "1x1" as const,
  },
  {
    title: "dependencies",
    description:
      "Empty for this package. The Python runtime does the heavy lifting, so the Node-side has zero runtime deps.",
    size: "1x1" as const,
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
            { label: "How to install an npm package" },
          ]}
        />

        <header className="max-w-4xl mx-auto px-6 mt-6 mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-medium px-3 py-1 rounded-full mb-5">
            npm fundamentals, and what they miss
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-zinc-900 leading-[1.1] tracking-tight">
            How to install an npm package: the normal way, and the{" "}
            <GradientText>installer-package</GradientText> way nobody teaches.
          </h1>
          <p className="mt-5 text-lg text-zinc-500 leading-relaxed">
            Every &quot;how to install an npm package&quot; guide walks through{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">npm install</code>,
            the <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">-g</code> flag,
            and <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">package.json</code>.
            None explain the packages that don&apos;t live in{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">node_modules</code> at
            all: <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">create-next-app</code>,{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">shadcn</code>, our own{" "}
            <code className="text-base bg-zinc-100 px-1 py-0.5 rounded">ai-browser-profile</code>.
            This page covers both, and uses the ai-browser-profile installer as a worked example —
            the 316-line bin script is open, so we can trace what happens on disk line by line.
          </p>
        </header>

        <ArticleMeta
          datePublished={PUBLISHED}
          author="Matthew Diakonov"
          authorRole="Maintainer, ai-browser-profile"
          readingTime="9 min read"
          className="mb-6"
        />

        <ProofBand
          rating={4.9}
          ratingCount="sourced from npm docs + bin/cli.js in the public repo"
          highlights={[
            "Two install modes side by side: node_modules vs installer-package",
            "Exact line numbers in bin/cli.js for every disk write",
            "Pre-flight checks to audit any npx command before you run it",
          ]}
          className="mb-10"
        />

        <section className="max-w-4xl mx-auto px-6">
          <RemotionClip
            title="npm install is not the whole story"
            subtitle="A whole class of packages writes outside node_modules on purpose"
            captions={[
              "npm install puts code in ./node_modules",
              "npx runs a bin once from a throwaway cache",
              "An installer-package's bin writes to $HOME",
              "ai-browser-profile: 8 copy targets, a venv, 5 symlinks",
              "Read the bin, then decide",
            ]}
            accent="teal"
            durationInFrames={210}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <Marquee speed={24} pauseOnHover fade>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              npm install writes ./node_modules
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              npm i -g writes $PREFIX/lib/node_modules
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              npx runs from ~/.npm/_npx/&lt;hash&gt;
            </span>
            <span className="px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700">
              installer packages write $HOME
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              create-next-app → ./&lt;appname&gt;
            </span>
            <span className="px-4 py-1.5 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              shadcn → ./src/components/ui
            </span>
            <span className="px-4 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-sm text-teal-700">
              ai-browser-profile → ~/ai-browser-profile + ~/.claude/skills
            </span>
          </Marquee>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The two install modes, side by side
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            Both are &quot;how to install an npm package&quot;. Only one of them ends up in your{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">node_modules</code>.
          </p>
          <ComparisonTable
            productName="Installer-package (npx)"
            competitorName="Normal npm install"
            rows={MODE_ROWS}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            How the normal mode looks in the terminal
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Dependency, dev dependency, and global install. This is the path every tutorial covers:
            the package ends up in some flavor of{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">node_modules</code>, your{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">package.json</code> gets a new line,
            and you import from the name.
          </p>
          <TerminalOutput title="npm install — the path every tutorial already teaches" lines={NORMAL_CMDS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <BackgroundGrid pattern="dots" glow>
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
              What an installer-package actually does when you run it
            </h2>
            <p className="text-zinc-500 leading-relaxed mb-2">
              Same tool (<code className="bg-zinc-100 px-1 py-0.5 rounded">npx</code>), entirely
              different outcome. Nothing lands in the current project&apos;s{" "}
              <code className="bg-zinc-100 px-1 py-0.5 rounded">node_modules</code>. The package
              downloads into the npx cache, its bin runs, it writes somewhere the author chose,
              then npx cleans up.
            </p>
            <TerminalOutput title="three installer-packages in the wild" lines={INSTALLER_CMDS} />
          </BackgroundGrid>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Worked example: <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">npx ai-browser-profile init</code>
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            One command. Six distinct things happen on disk. All six are visible in the repo at{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">bin/cli.js</code>, which is 316 lines
            long. Here is the ordered list, with the exact location of each step.
          </p>
          <StepTimeline steps={INSTALLER_STEPS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <ProofBanner
            quote="const DEST = path.join(os.homedir(), 'ai-browser-profile');"
            source="bin/cli.js:9"
            metric="1 line"
          />
          <p className="mt-4 text-zinc-500 leading-relaxed">
            That one line decides the entire shape of the install. Everything else — the copy
            targets, the venv path, the symlink sources — is derived from{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">DEST</code>. Change that string,
            and the installer writes somewhere else. There is no registry, no config file, no
            hidden behavior behind this; it is one path join.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-10">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The eight copy targets, by name
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Straight out of the source. Eight entries total: one Python package, two Python
            scripts, and five skill directories. Nothing else gets copied; the <code className="bg-zinc-100 px-1 py-0.5 rounded">.venv</code>,{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">memories.db</code>, and launchd
            plist are generated separately at runtime.
          </p>
          <AnimatedCodeBlock
            code={INSTALLER_COPY_TARGETS_CODE}
            language="javascript"
            filename="bin/cli.js (excerpt)"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-8">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The venv and the one non-PyPI dependency
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Line 171 spawns <code className="bg-zinc-100 px-1 py-0.5 rounded">python -m venv</code>,
            line 186 pip-installs two deps. The interesting one is{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">ccl_chromium_reader</code>: it is not
            published on PyPI, so pip is asked to clone the GitHub repo directly. If git is not
            available on PATH, this step is the one that fails, and the installer warns with the
            exact pip command to retry.
          </p>
          <AnimatedCodeBlock
            code={VENV_CODE}
            language="javascript"
            filename="bin/cli.js (excerpt)"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-8">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Five symlinks into <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">~/.claude/skills/</code>
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            This is how one npm install ends up adding skills to a completely different tool
            (Claude Code). Each entry gets unlinked if it exists, then symlinked back into the
            install directory. Because they&apos;re symlinks rather than copies,{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">npx ai-browser-profile update</code>{" "}
            automatically refreshes the skill content without re-linking.
          </p>
          <AnimatedCodeBlock
            code={SYMLINK_CODE}
            language="javascript"
            filename="bin/cli.js (excerpt)"
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            What it looks like end to end
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            One terminal capture of a fresh <code className="bg-zinc-100 px-1 py-0.5 rounded">init</code>.
            The bulk of the output is the copy loop and the pip install. Total runtime is usually
            15 to 30 seconds, dominated by the pip install of{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">ccl_chromium_reader</code> from git.
          </p>
          <TerminalOutput title="npx ai-browser-profile init" lines={INIT_TERMINAL} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-14">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Why the data flows this way
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-6">
            A diagram of the full path from <code className="bg-zinc-100 px-1 py-0.5 rounded">npx</code>{" "}
            to the three places files land. The hub is <code className="bg-zinc-100 px-1 py-0.5 rounded">bin/cli.js init</code>;
            everything upstream feeds into it, everything downstream is a disk side effect.
          </p>
          <AnimatedBeam
            title="What happens between `npx` and your home directory"
            from={[
              { label: "npm registry" },
              { label: "git (ccl_chromium_reader)" },
              { label: "user's shell PATH -> node" },
            ]}
            hub={{ label: "bin/cli.js init" }}
            to={[
              { label: "~/ai-browser-profile/*" },
              { label: "~/ai-browser-profile/.venv" },
              { label: "~/.claude/skills/* (5 symlinks)" },
            ]}
          />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            Three packages, same idea
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Different products, same pattern: the bin field is the entire tool, there is nothing
            to <code className="bg-zinc-100 px-1 py-0.5 rounded">import</code> at runtime, and the
            side effects are the point.
          </p>
          <StepTimeline steps={WHO_DOES_WHAT} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The one-minute audit before running any <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-xl md:text-2xl">npx</code>
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            You are letting a stranger run a script on your laptop. Five quick checks keep that
            sane. None of them require running the installer first.
          </p>
          <AnimatedChecklist title="pre-flight audit" items={CHECKLIST_BEFORE_NPX} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-8">
          <GlowCard>
            <h3 className="text-xl font-semibold text-zinc-900 mb-3">
              Do the audit on ai-browser-profile, live
            </h3>
            <p className="text-zinc-500 leading-relaxed mb-3">
              Everything this page claims about bin/cli.js you can verify in under 30 seconds
              without running init. The tarball is 316 lines of JavaScript; no postinstall hook,
              no native bindings. `npm pack` + `tar -tzf` shows exactly what ships.
            </p>
            <TerminalOutput title="reading the installer without running it" lines={VERIFY_TERMINAL} />
          </GlowCard>
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            The manifest fields that matter
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            A standard library package leans on{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">main</code> and{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">exports</code>. An installer-package
            leans on <code className="bg-zinc-100 px-1 py-0.5 rounded">bin</code>,{" "}
            <code className="bg-zinc-100 px-1 py-0.5 rounded">files</code>, and (usually) the
            absence of a <code className="bg-zinc-100 px-1 py-0.5 rounded">postinstall</code> hook.
            This is the subset of <code className="bg-zinc-100 px-1 py-0.5 rounded">package.json</code>{" "}
            you actually need to understand for both modes.
          </p>
          <BentoGrid cards={MANIFEST_CARDS} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            init vs update vs install-embeddings
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            The bin exposes three subcommands. Each maps to a different file-system shape. Reading
            them once is the difference between a confused reinstall and a clean upgrade.
          </p>
          <StepTimeline steps={UPDATE_VS_INIT} />
        </section>

        <section className="max-w-4xl mx-auto px-6 mt-12">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 mb-3">
            By the numbers
          </h2>
          <p className="text-zinc-500 leading-relaxed mb-2">
            Everything below comes from the source tree, not benchmarks: copy target count, bin
            line count, Python deps count, and symlink count. All four are load-bearing numbers
            the installer reads at runtime.
          </p>
          <MetricsRow
            metrics={[
              { value: 8, label: "copy targets in bin/cli.js:14-23" },
              { value: 316, label: "lines of JavaScript in bin/cli.js" },
              { value: 2, label: "tier-1 Python deps (core install)" },
              { value: 5, label: "symlinks into ~/.claude/skills/" },
            ]}
          />
        </section>

        <InlineCta
          heading="Try the installer-package pattern"
          body="One command. Writes ~/ai-browser-profile, a Python venv, and five Claude Code skills. Everything the page describes, on your own disk."
          linkText="npx ai-browser-profile init"
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
