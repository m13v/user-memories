#!/bin/bash
# Memory Review — weekly extract + LLM review
# 1. Run extract.py to ingest new browser data
# 2. Run Claude to review/clean new entries
# Called by launchd weekly (604800s)

set -euo pipefail

REPO="$HOME/user-memories"
SKILL_FILE="$REPO/review/SKILL.md"
LOG_DIR="$REPO/review/logs"
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

# Phase 1: Rule-based cleanup
echo "--- Running rule-based cleanup ---" | tee -a "$LOG_FILE"
(
  cd "$REPO"
  source "$VENV"
  python clean.py 2>&1
) | tee -a "$LOG_FILE"

# Re-check unreviewed after cleanup
UNREVIEWED=$(cd "$REPO" && source "$VENV" && python -c "
import sys; sys.path.insert(0, '.')
from user_memories import MemoryDB
m = MemoryDB('memories.db')
print(len(m.get_unreviewed(limit=10000)))
m.close()
" 2>/dev/null)

if [ "$UNREVIEWED" = "0" ]; then
  echo "All entries handled by cleanup. Done." | tee -a "$LOG_FILE"
  exit 0
fi

# Phase 2: Claude reviews remaining entries
echo "--- Starting Claude review ($UNREVIEWED entries) ---" | tee -a "$LOG_FILE"
claude -p "You are the Memory Review agent. You clean up the user memories database after extraction.

Read $SKILL_FILE for full classification criteria and workflow.

DB path: $DB
Module path: $REPO

Run Phases 1-3 from the skill file (Phase 0 fast pass already done by clean.py).
Process remaining unreviewed entries in batches of 50.
Print a summary at the end." --max-turns 80 2>&1 | tee -a "$LOG_FILE"

echo "=== Run complete: $(date) ===" | tee -a "$LOG_FILE"

# Clean up old logs (keep last 30 days)
find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true
