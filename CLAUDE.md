# user-memories

Standalone tool that extracts user knowledge (identity, contacts, accounts, addresses, payments) from browser data into a self-ranking SQLite database.

## Quick Start

```bash
cd /Users/matthewdi/user-memories
source .venv/bin/activate
python extract.py                                    # scan all browsers
python extract.py --browsers arc chrome              # specific browsers only
python extract.py --no-indexeddb --no-localstorage   # skip LevelDB (fast)
python extract.py --output /path/to/memories.db      # custom output path
```

## Structure

- `extract.py` — CLI entry point
- `user_memories/__init__.py` — exports MemoryDB, extract_memories
- `user_memories/db.py` — MemoryDB class (schema, upsert, search, supersession, staleness decay, entity linking, profile, review ops)
- `user_memories/extract.py` — extract_memories() orchestrator
- `user_memories/ingestors/browser_detect.py` — BrowserProfile, detect_browsers(), copy_db(), domain()
- `user_memories/ingestors/constants.py` — lookup maps + browser paths (self-contained)
- `user_memories/ingestors/webdata.py` — reads Web Data files directly (autofill, addresses, credit cards)
- `user_memories/ingestors/history.py` — reads browser History SQLite (tool/service usage)
- `user_memories/ingestors/logins.py` — reads Login Data SQLite (accounts, emails)
- `user_memories/ingestors/indexeddb.py` — reads WhatsApp IndexedDB via ccl_chromium_reader (contacts)
- `user_memories/ingestors/localstorage.py` — reads LinkedIn Local Storage via ccl_chromium_reader (connections)

## Review Pipeline

After extraction, ~50% of entries are noise (autofill duplicates, code identifiers in name fields, other people's data). The `memory-review` skill runs Claude to clean these up.

### Manual

```bash
# In Claude Code, run the skill:
/memory-review
```

### Automated (weekly via launchd)

The review pipeline runs weekly as a macOS launchd agent: extract browser data, then Claude reviews new entries.

**Files:**
- `.claude/skills/memory-review/run.sh` — extract + Claude review script
- `.claude/skills/memory-review/SKILL.md` — review criteria and workflow
- `launchd/com.m13v.memory-review.plist` — weekly schedule (604800s)

**Install:**

```bash
# Symlink plist into LaunchAgents
ln -sf "$(pwd)/launchd/com.m13v.memory-review.plist" ~/Library/LaunchAgents/

# Load the agent
launchctl load ~/Library/LaunchAgents/com.m13v.memory-review.plist

# Verify
launchctl list | grep memory-review
```

**Manual trigger:**

```bash
bash .claude/skills/memory-review/run.sh
```

**Logs:** `.claude/skills/memory-review/logs/` (auto-cleaned after 30 days)

### Review phases

1. **Fast pass** — bulk-delete `autofill:*`, `address_type_*`, superseded entries (~50% of noise)
2. **Supersession chain repair** — fix corrupted single-value key chains (first_name, last_name, etc.)
3. **Per-entry review** — classify remaining as KEEP/DELETE/MERGE/FIX in batches of 50
4. **Profile verification** — run `profile_text()` and check for residual issues

## Design

- **Reads browser files directly** — no intermediary scan.db needed
- **One pip dependency**: `ccl_chromium_reader` (for IndexedDB + Local Storage LevelDB files). Everything else is stdlib.
- **Ingestors pattern** — each data source is a separate module, easy to add new ones
- **Self-ranking** — hit_rate = accessed_count / appeared_count, no manual curation

## Git

Commit and push changes to current branch when done. Individual commits per file.
