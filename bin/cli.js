#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const DEST = path.join(os.homedir(), 'user-memories');
const PKG_ROOT = path.join(__dirname, '..');
const HOME = os.homedir();

// Files/dirs to copy from npm package to ~/user-memories
const COPY_TARGETS = [
  'user_memories',
  'extract.py',
  'clean.py',
  'skill',
  'review',
  'setup',
  'autofill',
  'whatsapp',
];

// Never overwrite these during update
const NEVER_OVERWRITE = new Set(['memories.db', '.venv', 'scripts', 'config.json']);

// Core Python deps (tier 1) — enough for tag search, SQL, extraction
const CORE_DEPS = ['ccl_chromium_reader', 'numpy'];

// Embedding deps (tier 2) — optional, for semantic search
const EMBEDDING_DEPS = ['onnxruntime', 'huggingface_hub', 'tokenizers'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === '__pycache__') continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function linkOrRelink(target, linkPath) {
  try { fs.rmSync(linkPath, { recursive: true, force: true }); } catch {}
  fs.symlinkSync(target, linkPath);
}

function findPython() {
  for (const cmd of ['python3', 'python']) {
    const result = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
    if (result.status === 0) return cmd;
  }
  return null;
}

function pipPath() {
  return path.join(DEST, '.venv', 'bin', 'pip');
}

function pythonPath() {
  return path.join(DEST, '.venv', 'bin', 'python');
}

function generatePlists() {
  const plists = [
    {
      file: 'com.m13v.memory-review.plist',
      label: 'com.m13v.memory-review',
      script: `${DEST}/review/run.sh`,
      interval: 604800, // weekly
      runAtLoad: false,
      stdoutLog: `${DEST}/review/logs/launchd-stdout.log`,
      stderrLog: `${DEST}/review/logs/launchd-stderr.log`,
    },
  ];

  const launchdDir = path.join(DEST, 'launchd');
  fs.mkdirSync(launchdDir, { recursive: true });

  for (const p of plists) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${p.label}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>/bin/bash</string>
\t\t<string>${p.script}</string>
\t</array>
\t<key>StartInterval</key>
\t<integer>${p.interval}</integer>
\t<key>StandardOutPath</key>
\t<string>${p.stdoutLog}</string>
\t<key>StandardErrorPath</key>
\t<string>${p.stderrLog}</string>
\t<key>EnvironmentVariables</key>
\t<dict>
\t\t<key>PATH</key>
\t\t<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
\t\t<key>HOME</key>
\t\t<string>${HOME}</string>
\t</dict>
\t<key>RunAtLoad</key>
\t<${p.runAtLoad}/>
</dict>
</plist>
`;
    fs.writeFileSync(path.join(launchdDir, p.file), xml);
  }
  console.log('  generated launchd plists');
}

function init() {
  console.log('Setting up user-memories in', DEST);
  fs.mkdirSync(DEST, { recursive: true });

  // Copy all package files
  for (const f of COPY_TARGETS) {
    const src = path.join(PKG_ROOT, f);
    const dest = path.join(DEST, f);
    if (!fs.existsSync(src)) continue;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDir(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
    console.log('  copied', f);
  }

  // Generate launchd plists
  generatePlists();

  // Create Python venv
  const python = findPython();
  if (!python) {
    console.error('ERROR: python3 not found. Install Python 3.9+ and try again.');
    process.exit(1);
  }

  const venvPath = path.join(DEST, '.venv');
  if (!fs.existsSync(venvPath)) {
    console.log('  creating Python venv...');
    const venvResult = spawnSync(python, ['-m', 'venv', venvPath], { stdio: 'inherit' });
    if (venvResult.status !== 0) {
      console.error('ERROR: Failed to create Python venv');
      process.exit(1);
    }
  } else {
    console.log('  .venv exists — skipping creation');
  }

  // Install core deps
  console.log('  installing core dependencies...');
  const pipResult = spawnSync(pipPath(), ['install', ...CORE_DEPS, '-q'], { stdio: 'inherit' });
  if (pipResult.status !== 0) {
    console.warn('  WARNING: Some dependencies failed to install. You may need to install manually:');
    console.warn(`    ${pipPath()} install ${CORE_DEPS.join(' ')}`);
  } else {
    console.log('  core dependencies installed');
  }

  // Create logs dir for review
  fs.mkdirSync(path.join(DEST, 'review', 'logs'), { recursive: true });

  // Skill symlinks
  const skillsDir = path.join(HOME, '.claude', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });

  const links = [
    ['user-memories', 'skill'],
    ['user-memories-setup', 'setup'],
    ['memory-review', 'review'],
    ['autofill-profiles', 'autofill'],
    ['whatsapp-analysis', 'whatsapp'],
  ];

  for (const [name, dir] of links) {
    const target = path.join(DEST, dir);
    const link = path.join(skillsDir, name);
    linkOrRelink(target, link);
    console.log(`  ~/.claude/skills/${name} -> ~/${path.relative(HOME, target)}`);
  }

  console.log('');
  console.log('Done! Next steps:');
  console.log(`  1. Extract browser data:  ${pythonPath()} ${path.join(DEST, 'extract.py')}`);
  console.log('  2. Tell Claude: "search my memories for my email"');
  console.log('');
  console.log('Optional — add semantic search (~180MB download):');
  console.log('  npx user-memories install-embeddings');
}

function update() {
  if (!fs.existsSync(DEST)) {
    console.error('Not installed. Run: npx user-memories init');
    process.exit(1);
  }

  console.log('Updating user-memories...');

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
  }

  // Regenerate launchd plists
  generatePlists();

  // Re-symlink skills
  const skillsDir = path.join(HOME, '.claude', 'skills');
  const links = [
    ['user-memories', 'skill'],
    ['user-memories-setup', 'setup'],
    ['memory-review', 'review'],
    ['autofill-profiles', 'autofill'],
    ['whatsapp-analysis', 'whatsapp'],
  ];

  for (const [name, dir] of links) {
    try {
      linkOrRelink(path.join(DEST, dir), path.join(skillsDir, name));
      console.log(`  re-linked ~/.claude/skills/${name}`);
    } catch {}
  }

  // Upgrade core deps
  console.log('  upgrading core dependencies...');
  spawnSync(pipPath(), ['install', '--upgrade', ...CORE_DEPS, '-q'], { stdio: 'inherit' });

  console.log('');
  console.log('Update complete. memories.db and .venv preserved.');
}

function installEmbeddings() {
  const venvPath = path.join(DEST, '.venv');
  if (!fs.existsSync(venvPath)) {
    console.error('Not installed. Run: npx user-memories init');
    process.exit(1);
  }

  console.log('Installing embedding dependencies...');
  const result = spawnSync(pipPath(), ['install', ...EMBEDDING_DEPS, '-q'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('Failed to install embedding dependencies. Try manually:');
    console.error(`  ${pipPath()} install ${EMBEDDING_DEPS.join(' ')}`);
    process.exit(1);
  }

  console.log('');
  console.log('Embedding dependencies installed.');
  console.log('The model (~131MB) will download automatically on first semantic search.');
  console.log('');
  console.log('To backfill embeddings for existing memories:');
  console.log(`  ${pythonPath()} -c "from user_memories import MemoryDB; m = MemoryDB('${path.join(DEST, 'memories.db')}'); print(f'Embedded {m.backfill_embeddings()} memories'); m.close()"`);
}

const cmd = process.argv[2];
if (cmd === 'init') {
  init();
} else if (cmd === 'update') {
  update();
} else if (cmd === 'install-embeddings') {
  installEmbeddings();
} else {
  console.log('user-memories — extract user knowledge from browser data');
  console.log('');
  console.log('Usage:');
  console.log('  npx user-memories init                first-time setup');
  console.log('  npx user-memories update              update code, preserve data');
  console.log('  npx user-memories install-embeddings  add semantic search (~180MB)');
}
