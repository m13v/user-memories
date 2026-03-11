# user-memories

Standalone tool that extracts user knowledge (identity, contacts, accounts, addresses, payments) from browser data into a self-ranking SQLite database. Distributed as an npm package.

## Install

```bash
npx user-memories init                    # first-time setup
npx user-memories install-embeddings      # optional: semantic search (~180MB)
npx user-memories update                  # update code, preserve data
```

## Quick Start

```bash
cd ~/user-memories
source .venv/bin/activate
python extract.py                                    # scan all browsers
python extract.py --browsers arc chrome              # specific browsers only
python extract.py --no-indexeddb --no-localstorage   # skip LevelDB (fast)
python extract.py --output /path/to/memories.db      # custom output path
```

## Structure

### Python module
- `extract.py` — CLI entry point
- `clean.py` — rule-based cleanup (no LLM needed)
- `user_memories/__init__.py` — exports MemoryDB, extract_memories
- `user_memories/db.py` — MemoryDB class (schema, upsert, search, semantic_search, profile, review ops)
- `user_memories/embeddings.py` — lazy-loading ONNX Runtime + nomic-embed-text-v1.5
- `user_memories/extract.py` — extract_memories() orchestrator
- `user_memories/ingestors/` — one module per data source (webdata, history, logins, indexeddb, localstorage, bookmarks, notion)

### npm package
- `package.json` — npm metadata, `bin: user-memories`
- `bin/cli.js` — `npx user-memories init/update/install-embeddings`
- `.npmignore` — excludes .venv, *.db, scripts/, etc.

### Skills (symlinked to ~/.claude/skills/ by npm init)
- `skill/SKILL.md` → `~/.claude/skills/user-memories` — query memories
- `setup/SKILL.md` → `~/.claude/skills/user-memories-setup` — setup wizard
- `review/SKILL.md` → `~/.claude/skills/memory-review` — LLM-powered review
- `review/run.sh` — weekly extract + review automation
- `autofill/SKILL.md` → `~/.claude/skills/autofill-profiles` — browser autofill reference
- `whatsapp/SKILL.md` → `~/.claude/skills/whatsapp-analysis` — WhatsApp data analysis

## Review Pipeline

After extraction, ~50% of entries are noise. Two cleanup options:

### Rule-based (fast, no LLM)
```bash
cd ~/user-memories && source .venv/bin/activate && python clean.py
```

### LLM-powered (thorough)
```bash
# In Claude Code:
/memory-review
```

### Automated (weekly via launchd)
```bash
ln -sf ~/user-memories/launchd/com.m13v.memory-review.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.m13v.memory-review.plist
```

Logs: `~/user-memories/review/logs/` (auto-cleaned after 30 days)

## Dependencies

**Core** (installed by `npx user-memories init`):
- `ccl_chromium_reader` — IndexedDB + Local Storage LevelDB
- `numpy` — vector math

**Embeddings** (optional, `npx user-memories install-embeddings`):
- `onnxruntime` — ONNX model inference
- `huggingface_hub` + `tokenizers` — model download + tokenization
- Model: nomic-embed-text-v1.5 (~131MB, downloads on first use)

## Design

- **Reads browser files directly** — no intermediary scan.db needed
- **Two-tier deps** — core install is fast (~20MB), embeddings are optional (~180MB)
- **Ingestors pattern** — each data source is a separate module, easy to add new ones
- **Self-ranking** — hit_rate = accessed_count / appeared_count, no manual curation
- **Graceful degradation** — semantic search falls back to text search if embeddings unavailable

## Git

Commit and push changes to current branch when done. Individual commits per file.
