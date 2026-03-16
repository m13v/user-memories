---
name: memory-review
description: "Review and clean unreviewed memories in the database. Removes junk, merges duplicates, fixes miskeyed data, and marks good entries as reviewed. Run periodically after extraction."
---

# Memory Review

LLM-powered post-ingestion review of the user memories database. Processes unreviewed memories in phases — bulk cleanup first, then per-entry review.

## Setup

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/ai-browser-profile"))
from ai_browser_profile import MemoryDB

mem = MemoryDB(os.path.expanduser("~/ai-browser-profile/memories.db"))
```

## Workflow

### Phase 0: Fast Pass (bulk cleanup)

Before reviewing individual entries, bulk-delete entire categories of known noise. This typically removes ~50% of entries instantly.

```python
# 1. Delete ALL autofill:* entries — these are raw form field duplicates of real data
autofill_ids = [r[0] for r in mem.conn.execute(
    "SELECT id FROM memories WHERE key LIKE 'autofill:%' AND reviewed_at IS NULL"
).fetchall()]
for mid in autofill_ids:
    mem.delete(mid)

# 2. Delete ALL address_type_* entries — always noise (last names, numbers in address fields)
addr_type_ids = [r[0] for r in mem.conn.execute(
    "SELECT id FROM memories WHERE key LIKE 'address_type_%' AND reviewed_at IS NULL"
).fetchall()]
for mid in addr_type_ids:
    mem.delete(mid)

# 3. Delete ALL superseded entries
superseded_ids = [r[0] for r in mem.conn.execute(
    "SELECT id FROM memories WHERE superseded_by IS NOT NULL AND reviewed_at IS NULL"
).fetchall()]
for mid in superseded_ids:
    mem.delete(mid)
```

**Check for leaked secrets before bulk-deleting autofill.** Grep for `client_secret`, `api_key`, `token`, `password` in autofill values and flag them to the user before deleting.

### Phase 1: Supersession Chain Repair

After the fast pass, single-value key chains (`first_name`, `last_name`, `full_name`, `card_holder_name`, `email`) are often corrupted. The extraction supersedes the real value with garbage because each new autofill entry blindly replaces the old one.

Common pattern: `first_name` chain goes Matthew → Marina → mediar → ... leaving "mediar" as the active value.

```python
# For each single-value key, check the active (non-superseded) value
SINGLE_VALUE_KEYS = ["first_name", "last_name", "full_name", "card_holder_name", "email", "phone"]
for key in SINGLE_VALUE_KEYS:
    rows = mem.conn.execute(
        "SELECT id, value, confidence, superseded_by FROM memories WHERE key=? ORDER BY id",
        (key,)
    ).fetchall()
    print(f"\n{key}:")
    for r in rows:
        status = "ACTIVE" if r[3] is None else f"superseded by {r[3]}"
        print(f"  id={r[0]} val='{r[1]}' conf={r[2]} [{status}]")
```

Fix by:
1. Deleting garbage entries (code identifiers, other people's names, company names in name fields)
2. Unsuperseding the real value: `UPDATE memories SET superseded_by=NULL, superseded_at=NULL WHERE id=?`
3. Boosting confidence on the real value if needed

### Phase 2: Per-Entry Review

Now process remaining unreviewed entries in batches:

1. Call `mem.get_unreviewed(limit=50)` to get a batch
2. Print the batch as a numbered table
3. Classify each as KEEP, DELETE, MERGE, or FIX
4. Execute actions via `mem.delete()`, `mem.update_memory()`, etc.
5. Call `mem.mark_reviewed([...ids...])` on all processed IDs (including kept ones)
6. Print summary per batch
7. Repeat until no unreviewed remain

### Phase 3: Profile Verification

After all entries are reviewed, verify the profile output catches any residual issues:

```python
print(mem.profile_text())
```

Check for:
- Wrong name showing (garbage superseded the real one)
- Mixed cities/states (e.g. "San Francisco, New York" in the same address)
- Garbage card holder names
- Missing fields that should be populated

Fix any issues, then `mem.close()`.

## Classification Criteria

### DELETE — remove entirely

- **Gibberish/test data**: `"wegs sdg"`, `"asdf"`, `"test123"`, `"technical placeholder just to pay"`, single characters
- **Code identifiers in name fields**: values containing underscores (`investor_role`, `handle_new_workflow_analysis`, `on_low_level_event_insert`), or known non-names (`os`, `type`, `use-case`)
- **Leaked secrets**: values containing `client_secret`, `GOCSPX-`, full API keys, OAuth tokens, private keys — **flag to user before deleting**
- **Other people's data**: names/emails/phones that belong to someone else — UNLESS stored as `contact:*` or `linkedin:*` keys
- **Company names in name fields**: `first_name="mediar"`, `last_name="inc"`, `full_name="Mediar, inc."` — these are autofill bugs
- **Truncated names**: `last_name="Di"`, `full_name="Matthew Di"`, `full_name="Matt"` (incomplete)
- **Noise locations**: cities/states from insurance quoting, comparison shopping, or form testing
- **Expired card data**: card expiry dates in the past
- **Meaningless amounts**: `"100.00"`, `"199.00"`, `"1.00"`, `"$ 245.80"` — these are form values, not useful data
- **Duplicate phone formats**: keep only one format per phone number (prefer international format with `+1`)

### MERGE — combine duplicates

- **Same phone, different formats**: `"+1 650-796-1489"`, `"(650) 796-1489"`, `"6507961489"` — keep the international format with highest confidence, delete all others
- **Same email, different casing**: keep lowercase
- **Duplicate DOB entries**: identify the real one (consistent across sources) vs noise
- **Same contact, multiple entries**: merge into highest-confidence one

When merging: keep highest confidence. If tied, keep highest `accessed_count`. Delete the rest.

### FIX — correct bad data

- **Wrong key assignment**: `company="Dmitrii Diakonov"` → delete (person name in company field)
- **Wrong confidence**: real DOB at 0.4 while fake one at 0.6 → boost real one
- **Missing tags**: `phone` key without `phone` tag, `email` without `email` tag
- **Broken supersession**: use `UPDATE memories SET superseded_by=NULL, superseded_at=NULL WHERE id=?`
- Use `mem.update_memory(id, key=..., value=..., confidence=..., tags=[...])` for fixes

### KEEP — mark as reviewed

- Genuine user data
- Correctly keyed and tagged entries
- Legitimate contacts, accounts, tools
- Just call `mem.mark_reviewed([id])` — no changes needed

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

At the end, print the profile and final stats:

```
## Final Profile
[output of mem.profile_text()]

## Stats
Total: X memories (was Y before review)
Deleted: Z, Kept: W, Fixed: V, Merged: U
Secrets found and removed: N
```
