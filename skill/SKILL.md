---
name: ai-browser-profile
description: "Query the user's AI browser profile: identity, accounts, tools, contacts, addresses, payments extracted from browser data. Use when you need context about the user to help with any task: form filling, emailing, booking, payments, or any task where knowing the user's info helps."
---

# AI Browser Profile

A self-ranking database of everything learned about the user from browser data. Memories are ranked by how often they're accessed vs how often they appear in search results — frequently useful memories rise, noise sinks.

## Quick Reference

| Item | Value |
|------|-------|
| Database | `~/ai-browser-profile/memories.db` |
| Module | `~/ai-browser-profile/ai_browser_profile/` |
| Python | `~/ai-browser-profile/.venv/bin/python` |
| Rebuild | `~/ai-browser-profile/.venv/bin/python ~/ai-browser-profile/extract.py` |

## How to Use

### User profile (start here)

Get a compact overview of the user — name, emails, addresses, accounts, tools, contacts. This is deterministic (no LLM) and computed from the database. Use it as baseline context before doing any task.

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/ai-browser-profile"))
from ai_browser_profile import MemoryDB

mem = MemoryDB(os.path.expanduser("~/ai-browser-profile/memories.db"))
print(mem.profile_text())  # markdown formatted, ~1.5KB
mem.close()
```

The profile shows: name, all known emails, phone numbers, handles, addresses, payment info, companies, top tools/services, accounts grouped by email, Notion projects, and contact count. Values are ranked by frequency across browser profiles — higher frequency = more likely to be the user's own data.

### Search by tags

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/ai-browser-profile"))
from ai_browser_profile import MemoryDB

mem = MemoryDB(os.path.expanduser("~/ai-browser-profile/memories.db"))

# Search returns results ranked by hit_rate (accessed/appeared), then counts
# accessed_count and appeared_count are auto-incremented on every search call
results = mem.search(["identity", "contact_info"], limit=10)
for r in results:
    print(f'{r["key"]}: {r["value"]}')

mem.close()
```

### Semantic search (natural language)

```python
# Find memories by meaning, not just keywords
results = mem.semantic_search("what products does the user build")
for r in results[:5]:
    print(f'{r["key"]}: {r["value"][:80]} (sim={r["similarity"]:.3f})')

# Falls back to text_search() if embeddings not installed
# Install with: npx ai-browser-profile install-embeddings
```

### Quick SQL queries

```bash
sqlite3 ~/ai-browser-profile/memories.db
```

```sql
-- All identity info
SELECT m.key, m.value FROM memories m
JOIN memory_tags t ON m.id = t.memory_id WHERE t.tag = 'identity'
AND m.superseded_by IS NULL;

-- All contact info (emails, phones)
SELECT m.key, m.value, m.source FROM memories m
JOIN memory_tags t ON m.id = t.memory_id WHERE t.tag = 'contact_info'
AND m.superseded_by IS NULL;

-- All contacts
SELECT m.key, m.value FROM memories m
JOIN memory_tags t ON m.id = t.memory_id WHERE t.tag = 'contact'
AND m.superseded_by IS NULL
ORDER BY m.accessed_count DESC;

-- Most accessed memories (the ones that proved useful)
SELECT key, value, accessed_count, appeared_count,
       CAST(accessed_count AS REAL) / MAX(appeared_count, 1) AS hit_rate
FROM memories WHERE accessed_count > 0
ORDER BY hit_rate DESC;

-- Search by key pattern
SELECT key, value FROM memories WHERE key LIKE 'account:%'
AND superseded_by IS NULL;
```

## Canonical Tags

| Tag | What it covers | Example keys |
|-----|---------------|-------------|
| `identity` | Name, DOB, gender, job title, language | `first_name`, `last_name`, `full_name`, `date_of_birth` |
| `contact_info` | Email addresses, phone numbers | `email`, `phone` |
| `address` | Physical addresses | `street_address`, `city`, `state`, `zip`, `country` |
| `payment` | Card holder names, expiry | `card_holder_name`, `card_expiry`, `card_nickname` |
| `account` | Service accounts, login credentials | `account:{domain}` |
| `tool` | Tools/services used (from history) | `tool:GitHub`, `tool:Slack`, `tool:Stripe` |
| `contact` | People the user knows | `contact:{Name}`, `linkedin:{Name}` |
| `work` | Work-related (company, LinkedIn) | `company`, `linkedin:*` |
| `knowledge` | Interests, skills, projects, products | `product:*`, `project:*`, `interest:*` |
| `communication` | Messaging platforms | `tool:Slack`, `tool:WhatsApp` |
| `social` | Social platforms | `tool:LinkedIn`, `tool:X/Twitter` |
| `finance` | Financial tools | `tool:Stripe`, `tool:QuickBooks` |

## Ranking System

Every `search()`, `semantic_search()`, and `text_search()` call automatically increments both `appeared_count` and `accessed_count` for all returned results. No manual `mark_accessed()` calls needed.

**hit_rate** = `accessed_count / appeared_count`

Memories that are frequently returned by searches rise in ranking. The system is fully automatic — no manual curation or agent instrumentation needed.

## Semantic Dedup

On `upsert()`, near-duplicate memories (cosine similarity >= 0.92 with same key prefix) are automatically superseded. This prevents storing "Screen recording tool for compliance" and "Screen recording tool launched on Product Hunt for compliance use cases" as separate entries.

## Task-Specific Tag Queries

| Task | Tags to search |
|------|---------------|
| Fill out a form | `["identity", "contact_info", "address"]` |
| Send an email | `["contact_info", "communication"]` + search contact by name |
| Book a flight/hotel | `["identity", "address", "payment"]` |
| Log into a service | `["account"]` |
| Invoice a client | `["identity", "work", "address", "payment"]` |
| Find a contact | `["contact"]` + filter by key pattern |
| Dev/deploy task | `["account", "tool"]` |
| Social media post | `["account", "social"]` |
| Research question | `mem.semantic_search("your question here")` |

## Rebuilding Memories

To refresh from latest browser data:

```bash
cd ~/ai-browser-profile
source .venv/bin/activate
python extract.py                                    # full scan
python extract.py --browsers arc chrome              # specific browsers
python extract.py --no-indexeddb --no-localstorage   # fast, skip LevelDB
```

### Backfill embeddings (after install-embeddings)

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/ai-browser-profile"))
from ai_browser_profile import MemoryDB
mem = MemoryDB(os.path.expanduser("~/ai-browser-profile/memories.db"))
n = mem.backfill_embeddings()
print(f"Embedded {n} memories")
mem.close()
```

This reads browser files directly (History, Login Data, Web Data, IndexedDB, Local Storage). The memory database preserves `appeared_count` and `accessed_count` across rebuilds via UPSERT logic — rankings are never lost.

## Dependencies

**Core** (installed by `npx ai-browser-profile init`):
- `ccl_chromium_reader` — IndexedDB + Local Storage LevelDB files
- `numpy` — vector math for cosine similarity

**Embeddings** (optional, installed by `npx ai-browser-profile install-embeddings`):
- `onnxruntime` — ONNX model inference
- `huggingface_hub` — model downloading
- `tokenizers` — text tokenization
- Model: nomic-embed-text-v1.5 (~131MB, downloads on first use)
