---
name: ai-browser-profile-setup
description: "Set up ai-browser-profile for a new user. Installs via npm, creates Python venv, extracts browser data, and optionally enables semantic search. Use when: 'set up browser profile', 'install ai browser profile', 'configure browser profile'."
---

# AI Browser Profile Setup

Interactive setup wizard for ai-browser-profile. Walk the user through installation and first extraction.

## When to use

- First-time setup of ai-browser-profile
- Reinstalling after a fresh machine setup
- Troubleshooting a broken installation

## Prerequisites

- Node.js 16+ (for `npx`)
- Python 3.10+
- macOS (browser paths are macOS-specific)

---

## Setup Flow

Run each step sequentially. **After each step, print a progress status to the user** so they can follow along:

```
[1/7] Install ............ done (12s)
[2/7] Verify ............. done (1s)
[3/7] Extract ............ running...
```

### Step 1: Install via npm

Check if already installed:

```bash
ls ~/ai-browser-profile/extract.py 2>/dev/null && echo "FOUND" || echo "NOT_FOUND"
```

If NOT_FOUND, install:
```bash
npx ai-browser-profile init
```

This:
- Copies Python source + skills to `~/ai-browser-profile/`
- Creates a Python venv at `~/ai-browser-profile/.venv/`
- Installs core deps (`ccl_chromium_reader`, `numpy`)
- Symlinks skills into `~/.claude/skills/`

To update code later without touching data:
```bash
npx ai-browser-profile update
```

**Tell the user:** "Installed ai-browser-profile to ~/ai-browser-profile. Python venv created, core deps installed, skills symlinked."

### Step 2: Verify the installation

```bash
~/ai-browser-profile/.venv/bin/python -c "
import sys
sys.path.insert(0, '$HOME/ai-browser-profile')
from ai_browser_profile import MemoryDB
print('MemoryDB imported successfully')
"
```

Expected: `MemoryDB imported successfully`

If it fails, check:
- Python venv exists: `ls ~/ai-browser-profile/.venv/bin/python`
- Deps installed: `~/ai-browser-profile/.venv/bin/pip list | grep ccl`

**Tell the user:** "Python environment verified - MemoryDB loads correctly."

### Step 3: Run extraction

**IMPORTANT:** Run extraction in the background so you can report progress to the user. The extraction has 8 stages and logs timing for each.

```bash
cd ~/ai-browser-profile && source .venv/bin/activate && python extract.py 2>&1
```

This scans all detected browsers (Arc, Chrome, Brave, Edge, Safari, Firefox) and extracts:
- Autofill profiles (names, emails, phones, addresses)
- Login data (accounts per domain)
- Browser history (tools/services used)
- Bookmarks (interests, tool usage)
- IndexedDB (WhatsApp contacts)
- Local Storage (LinkedIn connections)
- Notion (workspace contacts, if configured)
- Embeddings (semantic vectors, backfilled at end)

**INTERIM PROFILE:** The extraction pipeline prints an interim profile after the fast steps (autofill, history, bookmarks, logins, Notion — ~1s total) but before the slow steps (WhatsApp ~10s, embeddings ~3min). **As soon as you see the "Interim profile ready" log line, show the profile to the user immediately.** Don't wait for WhatsApp or embeddings to finish — the profile already has all identity, email, address, payment, account, and tool data. WhatsApp only adds a contact count.

Look for this in the logs:
```
Interim profile ready (WhatsApp + embeddings still running):
## User Profile
**Name:** ...
```

**Show this to the user right away**, then let the extraction continue in the background. Tell them: "Here's your profile from browser data. WhatsApp contacts and semantic embeddings are still processing..."

**After extraction + cleanup finish, report a final summary to the user:**

```
Extraction complete:
  Browsers scanned: 8 profiles (Arc, Chrome, Safari, Firefox)
  Raw memories: 5,878
  After cleanup: 5,431
  Time: 54s

  Breakdown:
    Autofill:      0.1s  (forms, addresses, cards)
    History:       1.8s  (tools & services)
    Bookmarks:     0.4s  (interests & links)
    Logins:        2.1s  (saved accounts)
    LinkedIn:      8.7s  (connections)
    Notion:        0.1s  (contacts & pages)
    WhatsApp:     15.3s  (contacts)
    Embeddings:   22.4s  (semantic vectors)
```

### Step 4: Verify extraction

```bash
~/ai-browser-profile/.venv/bin/python -c "
import sys, os
sys.path.insert(0, os.path.expanduser('~/ai-browser-profile'))
from ai_browser_profile import MemoryDB
mem = MemoryDB(os.path.expanduser('~/ai-browser-profile/memories.db'))
stats = mem.stats()
print(f'Total memories: {stats[\"total_memories\"]}')
print()
print(mem.profile_text())
mem.close()
"
```

**Show the profile to the user.** Check that name, email, phone, address look reasonable. If the primary email is wrong (a contact's email ranked higher), note that the review pipeline will fix this.

### Step 5: Set up automation (optional)

Ask: "Do you want weekly automatic extraction + review? (y/n)"

If yes (macOS):
```bash
ln -sf ~/ai-browser-profile/launchd/com.m13v.memory-review.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.m13v.memory-review.plist
```

Schedule: extracts new browser data weekly, then runs Claude to review new entries.

### Step 6: Summary

Print a final status card:

```
Setup Complete

  Location:     ~/ai-browser-profile
  Database:     ~/ai-browser-profile/memories.db
  Python:       ~/ai-browser-profile/.venv/bin/python
  Skills:       ~/.claude/skills/ai-browser-profile (+ 4 more)

  Memories:     5,431
  Embeddings:   5,431 vectors (semantic search enabled)
  Automation:   launchd weekly / not set up

  Try it:       Tell Claude "what's my email address"
  Update:       npx ai-browser-profile update
  Review:       /memory-review (Claude-powered cleanup)
```
