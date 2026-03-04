---
name: user-memories
description: "Query accumulated user memories (identity, contacts, accounts, addresses, payment, preferences) extracted from browser data. Use when you need context about the user to help with any task: form filling, emailing, booking, payments, or any task where knowing the user's info helps."
---

# User Memories

A self-ranking database of everything learned about the user from browser data. Memories are ranked by how often they're accessed vs how often they appear in search results — frequently useful memories rise, noise sinks.

## Quick Reference

| Item | Value |
|------|-------|
| Database | `/Users/matthewdi/user-memories/memories.db` |
| Module | `/Users/matthewdi/user-memories/user_memories/` |
| Rebuild | `cd /Users/matthewdi/user-memories && python extract.py` |

## How to Use

### Search by tags

```python
import sys
sys.path.insert(0, "/Users/matthewdi/user-memories")
from user_memories import MemoryDB

mem = MemoryDB("/Users/matthewdi/user-memories/memories.db")

# Search returns results ranked by hit_rate (accessed/appeared), then counts
results = mem.search(["identity", "contact_info"], limit=10)
for r in results:
    print(f'{r["key"]}: {r["value"]}')

# When you actually USE a memory, mark it accessed — this trains the ranking
mem.mark_accessed(results[0]["id"])

mem.close()
```

### Semantic search (natural language)

```python
# Find memories by meaning, not just keywords
results = mem.semantic_search("what products does Matthew build")
for r in results[:5]:
    print(f'{r["key"]}: {r["value"][:80]} (sim={r["similarity"]:.3f})')

# Falls back to text_search() if sentence-transformers not installed
```

### Quick SQL queries

```bash
sqlite3 /Users/matthewdi/user-memories/memories.db
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

Every `search()` call increments `appeared_count` for all returned memories. When the agent actually uses a memory (fills a form, includes in an email, etc.), call `mark_accessed(id)` to increment `accessed_count`.

**hit_rate** = `accessed_count / appeared_count`

Memories that appear in results but never get used naturally sink in ranking. Memories that get used every time they appear rise to the top. No manual curation needed.

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
cd /Users/matthewdi/user-memories
source .venv/bin/activate
python extract.py                                    # full scan
python extract.py --browsers arc chrome              # specific browsers
python extract.py --no-indexeddb --no-localstorage   # fast, skip LevelDB
```

### Backfill embeddings (after first install or rebuild)

```python
from user_memories import MemoryDB
mem = MemoryDB("/Users/matthewdi/user-memories/memories.db")
n = mem.backfill_embeddings()
print(f"Embedded {n} memories")
mem.close()
```

This reads browser files directly (History, Login Data, Web Data, IndexedDB, Local Storage). The memory database preserves `appeared_count` and `accessed_count` across rebuilds via UPSERT logic — rankings are never lost.

## Dependencies

- `ccl_chromium_reader` — IndexedDB + Local Storage LevelDB files
- `sentence-transformers` — semantic embeddings (all-MiniLM-L6-v2, ~90MB)
- `sqlite-vec` — vector similarity search in SQLite
