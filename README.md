# ai-browser-profile

Extract what your browser knows about you into a self-ranking SQLite database. Reads autofill, login data, browsing history, bookmarks, WhatsApp contacts, LinkedIn connections, and Notion workspaces — directly from local browser files.

## What it extracts

| Source | Data | Browser files |
|--------|------|---------------|
| **Web Data** | Autofill, addresses, credit cards | `Web Data` SQLite |
| **Login Data** | Accounts, emails, usernames | `Login Data` SQLite |
| **History** | Tool/service usage frequency | `History` SQLite |
| **Bookmarks** | Interests, saved tools | `Bookmarks` JSON |
| **IndexedDB** | WhatsApp contacts | LevelDB via `ccl_chromium_reader` |
| **Local Storage** | LinkedIn connections | LevelDB via `ccl_chromium_reader` |
| **Notion** | Workspace users, pages | IndexedDB |

Supported browsers: Arc, Chrome, Brave, Edge, Safari, Firefox.

## Install

```bash
npx ai-browser-profile init                               # sets up ~/ai-browser-profile, Python venv, core deps
npx ai-browser-profile install-embeddings                  # optional: semantic search (~180MB)
```

Requires Python 3.10+ and Node.js 16+. macOS only (reads from `~/Library/Application Support/`).

This creates `~/ai-browser-profile/` with a Python venv, installs dependencies, and symlinks Claude Code skills to `~/.claude/skills/`.

## Usage

```bash
cd ~/ai-browser-profile && source .venv/bin/activate
python extract.py                                    # scan all browsers
python extract.py --browsers arc chrome              # specific browsers
python extract.py --no-indexeddb --no-localstorage   # skip LevelDB (faster)
python extract.py --output /path/to/memories.db      # custom output path
```

To update after a new release:

```bash
npx ai-browser-profile update                             # updates code, preserves memories.db
```

## Python API

```python
from ai_browser_profile import MemoryDB, extract_memories

# Extract from browsers
mem = extract_memories("memories.db")

# Query
mem.search(tags=["identity", "contact_info"])
mem.text_search("github")
mem.semantic_search("what tools do I use most")

# Profile summary
print(mem.profile_text())

# History + supersession chain
mem.history("email")
```

## How it works

**Self-ranking** — each memory tracks `appeared_count` (how often it was seen during extraction) and `accessed_count` (how often it was queried). The ratio `accessed_count / appeared_count` is the `hit_rate`, used to surface the most relevant memories.

**Semantic dedup** — new entries are compared against existing ones using [nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) embeddings (768-dim, ONNX Runtime). If cosine similarity >= 0.92 with the same key prefix, the old entry is superseded rather than duplicated.

**Key schema** — memories use structured keys with cardinality rules:
- **Single-value** (`first_name`, `last_name`, `full_name`, ...): new values automatically supersede old ones
- **Multi-value** (`email`, `phone`, `account:github.com`, `tool:vscode`, ...): multiple values coexist

**Entity linking** — accounts sharing the same username/email are automatically linked via `same_identity` relations.

## Schema

```sql
memories (id, key, value, confidence, source, appeared_count, accessed_count,
          created_at, last_appeared_at, last_accessed_at, superseded_by,
          superseded_at, search_text, reviewed_at)

memory_tags (memory_id, tag)     -- identity, contact_info, address, payment,
                                 -- account, tool, contact, work, knowledge,
                                 -- communication, social, finance

memory_links (source_id, target_id, relation, created_at)

memory_embeddings (memory_id, embedding)  -- 768-dim BLOB
```

## Project structure

```
extract.py                          # CLI entry point
ai_browser_profile/
  __init__.py                       # exports MemoryDB, extract_memories
  db.py                             # MemoryDB: schema, upsert, search, profile
  embeddings.py                     # ONNX Runtime embeddings + cosine search
  extract.py                        # extraction orchestrator
  ingestors/
    browser_detect.py               # find browser profiles
    constants.py                    # lookup maps, browser paths
    webdata.py                      # autofill, addresses, credit cards
    history.py                      # browsing history → tool usage
    logins.py                       # saved logins → accounts
    bookmarks.py                    # bookmarks → interests
    indexeddb.py                    # WhatsApp contacts
    localstorage.py                 # LinkedIn connections
    notion.py                       # Notion workspace data
    messages.py                     # message extraction
```

## License

MIT
