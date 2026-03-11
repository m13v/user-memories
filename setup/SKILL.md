---
name: user-memories-setup
description: "Set up user-memories for a new user. Installs via npm, creates Python venv, extracts browser data, and optionally enables semantic search. Use when: 'set up user memories', 'install user memories', 'configure user memories'."
---

# User Memories Setup

Interactive setup wizard for user-memories. Walk the user through installation and first extraction.

## When to use

- First-time setup of user-memories
- Reinstalling after a fresh machine setup
- Troubleshooting a broken installation

## Prerequisites

- Node.js 16+ (for `npx`)
- Python 3.9+
- macOS (browser paths are macOS-specific)

---

## Setup Flow

### Step 1: Install via npm

Check if already installed:

```bash
ls ~/user-memories/extract.py 2>/dev/null && echo "FOUND" || echo "NOT_FOUND"
```

If NOT_FOUND, install:
```bash
npx user-memories init
```

This:
- Copies Python source + skills to `~/user-memories/`
- Creates a Python venv at `~/user-memories/.venv/`
- Installs core deps (`ccl_chromium_reader`, `numpy`)
- Symlinks skills into `~/.claude/skills/`

To update code later without touching data:
```bash
npx user-memories update
```

### Step 2: Verify the installation

```bash
~/user-memories/.venv/bin/python -c "
import sys
sys.path.insert(0, '$HOME/user-memories')
from user_memories import MemoryDB
print('MemoryDB imported successfully')
"
```

Expected: `MemoryDB imported successfully`

If it fails, check:
- Python venv exists: `ls ~/user-memories/.venv/bin/python`
- Deps installed: `~/user-memories/.venv/bin/pip list | grep ccl`

### Step 3: Run first extraction

```bash
cd ~/user-memories && source .venv/bin/activate && python extract.py
```

This scans all detected browsers (Arc, Chrome, Brave, Edge, Safari, Firefox) and extracts:
- Autofill profiles (names, emails, phones, addresses)
- Login data (accounts per domain)
- Browser history (tools/services used)
- IndexedDB (WhatsApp contacts)
- Local Storage (LinkedIn connections)

Expected output: `Done — N memories in memories.db` where N is typically 200-2000.

### Step 4: Verify extraction

```bash
~/user-memories/.venv/bin/python -c "
import sys, os
sys.path.insert(0, os.path.expanduser('~/user-memories'))
from user_memories import MemoryDB
mem = MemoryDB(os.path.expanduser('~/user-memories/memories.db'))
stats = mem.stats()
print(f'Total memories: {stats[\"total_memories\"]}')
print()
print(mem.profile_text())
mem.close()
"
```

Check that the profile looks reasonable — should show the user's name, email, phone, address.

### Step 5: Run cleanup (recommended)

The first extraction produces ~50% noise (autofill duplicates, other people's data). Run the rule-based cleanup:

```bash
cd ~/user-memories && source .venv/bin/activate && python clean.py
```

This deletes known noise patterns and deduplicates entries. For deeper LLM-powered review, use the `memory-review` skill later.

### Step 6: Install embeddings (optional)

Semantic search lets Claude find memories by meaning ("what's the user's shipping address") instead of just tags. It adds ~180MB of downloads.

Ask: "Do you want semantic search? (adds ~180MB download) (y/n)"

If yes:
```bash
npx user-memories install-embeddings
```

Then backfill embeddings for existing memories:
```bash
~/user-memories/.venv/bin/python -c "
import sys, os
sys.path.insert(0, os.path.expanduser('~/user-memories'))
from user_memories import MemoryDB
mem = MemoryDB(os.path.expanduser('~/user-memories/memories.db'))
n = mem.backfill_embeddings()
print(f'Embedded {n} memories')
mem.close()
"
```

### Step 7: Set up automation (optional)

Ask: "Do you want weekly automatic extraction + review? (y/n)"

If yes (macOS):
```bash
ln -sf ~/user-memories/launchd/com.m13v.memory-review.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.m13v.memory-review.plist
```

Schedule: extracts new browser data weekly, then runs Claude to review new entries.

### Step 8: Summary

Print:
```
User Memories Setup Complete

  Installed:    ~/user-memories
  Database:     ~/user-memories/memories.db
  Python:       ~/user-memories/.venv/bin/python
  Skills:       ~/.claude/skills/user-memories (+ 4 more)

  Memories:     N total
  Embeddings:   enabled / disabled

  Automation:   launchd weekly / not set up

  Try it:       Tell Claude "what's my email address"
  Update:       npx user-memories update
  Embeddings:   npx user-memories install-embeddings
```
