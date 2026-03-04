---
name: memory-review
description: "Review and clean unreviewed memories in the database. Removes junk, merges duplicates, fixes miskeyed data, and marks good entries as reviewed. Run periodically after extraction."
---

# Memory Review

LLM-powered post-ingestion review of the user memories database. Processes unreviewed memories in batches, classifying each as KEEP, DELETE, MERGE, or FIX.

## Setup

```python
import sys
sys.path.insert(0, "/Users/matthewdi/user-memories")
from user_memories import MemoryDB

mem = MemoryDB("/Users/matthewdi/user-memories/memories.db")
```

## Workflow

1. Call `mem.get_unreviewed(limit=50)` to get a batch
2. Print the batch as a numbered table for review
3. Classify each memory using the criteria below
4. Execute actions via `mem.delete()`, `mem.update_memory()`, etc.
5. Call `mem.mark_reviewed([...ids...])` on all processed IDs (including kept ones)
6. Print summary: X kept, Y deleted, Z fixed, W merged
7. Check `len(mem.get_unreviewed(limit=1))` — if more remain, process next batch
8. When done, `mem.close()`

## Classification Criteria

### DELETE — remove entirely

- **Gibberish/test data**: values like `"wegs sdg"`, `"asdf"`, `"test123"`, single characters, random strings
- **Code identifiers in name fields**: `full_name="investor_role"`, `first_name="mediar"`, `last_name="undefined"`
- **Leaked secrets**: values containing `client_secret`, full API keys, OAuth tokens, private keys
- **Other people's data**: names/emails/phones that clearly belong to someone else (not the user Matthew Diakonov) unless they're legitimate contacts stored under `contact:*` keys
- **Meaningless autofill noise**: random dollar amounts, `app_price` numbers, placeholder values like `"N/A"`, `"null"`, `"undefined"`
- **Superseded entries**: memories with `superseded_by` set (already replaced by a better value)
- **Empty/whitespace values**: values that are just spaces or empty after strip

### MERGE — combine duplicates

- **Same phone, different formats**: e.g. `"+14155551234"`, `"(415) 555-1234"`, `"415-555-1234"` — keep the one with highest confidence, delete the rest
- **Same email, different casing**: `"user@gmail.com"` vs `"User@Gmail.com"` — keep lowercase, delete others
- **Duplicate DOB entries**: identify the real one (consistent across sources) vs noise from insurance quoting forms
- **Same contact, multiple entries**: merge into the highest-confidence one

When merging: keep the entry with the highest confidence. If tied, keep the one with more `accessed_count`. Delete the others.

### FIX — correct bad data

- **Wrong key assignment**: `first_name="mediar"` should be deleted (not a name), `company="Matthew"` should be moved to `first_name`
- **Wrong confidence**: if a clearly real DOB has 0.4 confidence while a fake one has 0.6, update the real one to higher confidence
- **Missing tags**: a `phone` key without a `phone` tag, an `email` key without an `email` tag
- **Wrong tags**: an `account:github.com` entry tagged `payment` instead of `account`
- Use `mem.update_memory(id, key=..., value=..., confidence=..., tags=[...])` to fix

### KEEP — mark as reviewed

- Genuine user data (Matthew Diakonov's real info)
- Correctly keyed and tagged entries
- Legitimate contacts, accounts, tools
- Just call `mem.mark_reviewed([id])` — no changes needed

## Important Notes

- The user is **Matthew Diakonov** (also Matt Diakonov). Email: i@m13v.com. Keep his real data.
- Contacts stored as `contact:{Name}` or `linkedin:{Name}` are legitimate — keep them unless they're clearly garbage
- Account entries like `account:github.com` with real usernames are valuable — keep them
- Tool entries like `tool:Slack` are valuable — keep them
- When in doubt about whether data is real or junk, check if the source field gives context
- Process methodically — don't rush. Print each decision so the user can audit.

## Output Format

For each batch, print a table like:

```
Batch 1/N (50 memories)
───────────────────────────────────────
ID  | Key              | Value              | Conf | Action
----|------------------|--------------------|------|--------
1   | first_name       | Matthew            | 0.8  | KEEP
2   | full_name        | investor_role      | 0.5  | DELETE (code identifier)
3   | phone            | +14155551234       | 0.7  | KEEP
4   | phone            | (415) 555-1234     | 0.5  | MERGE → #3
...

Summary: 30 kept, 12 deleted, 5 fixed, 3 merged
```
