#!/bin/bash
# Memory Review — weekly extract + LLM review
# 1. Run extract.py to ingest new browser data
# 2. Run Claude to review/clean new entries
# Called by launchd weekly (604800s)

set -euo pipefail

REPO="$HOME/user-memories"
SKILL_FILE="$REPO/.claude/skills/memory-review/SKILL.md"
LOG_DIR="$REPO/.claude/skills/memory-review/logs"
VENV="$REPO/.venv/bin/activate"
DB="$REPO/memories.db"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d_%H%M%S).log"

echo "=== Memory Review Run: $(date) ===" | tee "$LOG_FILE"

# Phase 0: Extract new browser data
echo "--- Extracting browser data ---" | tee -a "$LOG_FILE"
(
  cd "$REPO"
  source "$VENV"
  python extract.py 2>&1
) | tee -a "$LOG_FILE"

# Check if there are unreviewed entries
UNREVIEWED=$(cd "$REPO" && source "$VENV" && python -c "
import sys; sys.path.insert(0, '.')
from user_memories import MemoryDB
m = MemoryDB('memories.db')
print(len(m.get_unreviewed(limit=10000)))
m.close()
" 2>/dev/null)

echo "Unreviewed entries: $UNREVIEWED" | tee -a "$LOG_FILE"

if [ "$UNREVIEWED" = "0" ]; then
  echo "No new entries to review. Done." | tee -a "$LOG_FILE"
  exit 0
fi

# Phase 1-3: Claude reviews new entries
echo "--- Starting Claude review ---" | tee -a "$LOG_FILE"
claude -p "You are the Memory Review agent. You clean up the user memories database after extraction.

Read $SKILL_FILE for full classification criteria and workflow.

DB path: $DB
Module path: $REPO

## Your task

Run all 4 phases from the skill file:

### Phase 0: Fast Pass
Run this Python to bulk-delete known noise categories:
\`\`\`python
import sys
sys.path.insert(0, '$REPO')
from user_memories import MemoryDB
mem = MemoryDB('$DB')

# Check for leaked secrets first
secrets = mem.conn.execute(
    \"SELECT id, key, value FROM memories WHERE key LIKE 'autofill:%' AND reviewed_at IS NULL AND (LOWER(value) LIKE '%secret%' OR LOWER(value) LIKE '%api_key%' OR LOWER(key) LIKE '%secret%' OR LOWER(key) LIKE '%password%' OR LOWER(key) LIKE '%token%')\"
).fetchall()
for s in secrets:
    print(f'SECRET FOUND AND DELETED: id={s[0]} key={s[1]} value={s[2][:30]}...')
    mem.delete(s[0])

# Bulk delete autofill:*, address_type_*, superseded
for pattern in ['autofill:%', 'address_type_%']:
    ids = [r[0] for r in mem.conn.execute(f\"SELECT id FROM memories WHERE key LIKE ? AND reviewed_at IS NULL\", (pattern,)).fetchall()]
    for mid in ids:
        mem.delete(mid)
    print(f'Deleted {len(ids)} entries matching {pattern}')

sup_ids = [r[0] for r in mem.conn.execute(\"SELECT id FROM memories WHERE superseded_by IS NOT NULL AND reviewed_at IS NULL\").fetchall()]
for mid in sup_ids:
    mem.delete(mid)
print(f'Deleted {len(sup_ids)} superseded entries')

remaining = len(mem.get_unreviewed(limit=10000))
print(f'Remaining after fast pass: {remaining}')
mem.close()
\`\`\`

### Phase 1: Supersession Chain Repair
Check single-value keys (first_name, last_name, full_name, card_holder_name, email, phone) for corrupted chains. Delete garbage, unsupersede real values.

### Phase 2: Per-Entry Review
Process remaining unreviewed entries in batches of 50. Classify each as KEEP/DELETE/MERGE/FIX per the criteria in the skill file. Execute actions, mark reviewed.

### Phase 3: Profile Verification
Print mem.profile_text() and verify the output looks correct. Fix any remaining issues.

## Rules
- Be efficient. Process in bulk where possible.
- Print a summary at the end: total before, total after, deleted, kept, fixed, merged.
- The user is Matthew Diakonov (also Matt, Dmitrii). Email: i@m13v.com." --max-turns 80 2>&1 | tee -a "$LOG_FILE"

echo "=== Run complete: $(date) ===" | tee -a "$LOG_FILE"

# Clean up old logs (keep last 30 days)
find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
