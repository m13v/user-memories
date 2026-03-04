---
name: whatsapp-analysis
description: "Analyze WhatsApp Web data — contacts, groups, social graph, AND decrypt actual message content via live browser interception. Use when: 'WhatsApp contacts', 'WhatsApp groups', 'WhatsApp analysis', 'who do I talk to', 'WhatsApp messages', 'decrypt WhatsApp', 'read WhatsApp messages', 'WhatsApp network', 'social graph', 'inner circle'."
---

# WhatsApp Analysis

Two capabilities:
1. **Live message decryption** — intercept `crypto.subtle.decrypt` via Playwright to read actual message text (requires open browser session)
2. **Metadata analysis** — contacts, groups, social graph from IndexedDB (offline, fast)

## Part 1: Live Message Decryption (Playwright)

### How It Works

WhatsApp Web encrypts messages in IndexedDB (`msgRowOpaqueData`) using **AES-CBC-128** with keys derived via **HKDF-SHA256**. The crypto happens on the **main thread** (not Web Workers). By intercepting `crypto.subtle` before page JS loads, we capture plaintext output and extractable keys.

### Prerequisites

- MCP Playwright browser available
- WhatsApp Web logged in (or QR code scan needed)

### Step 1: Navigate to WhatsApp Web

```
Use browser_navigate to go to https://web.whatsapp.com
Wait for the page to load. If QR code appears, user must scan it.
Use browser_snapshot to verify the chat list is visible.
```

### Step 2: Install the crypto interceptor

Use `browser_run_code` with this **exact** code to install the interceptor via `addInitScript` (runs before any page JS on reload):

```javascript
async (page) => {
    await page.addInitScript(() => {
        const scope = (typeof globalThis !== 'undefined') ? globalThis : self;
        scope.__waCaptured = { decrypt: [], deriveKey: [], importKey: [] };

        // Force all imported/generated keys to be extractable
        const origImportKey = crypto.subtle.importKey.bind(crypto.subtle);
        crypto.subtle.importKey = function(format, keyData, algorithm, extractable, keyUsages) {
            return origImportKey(format, keyData, algorithm, true, keyUsages);
        };

        const origGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
        crypto.subtle.generateKey = function(algorithm, extractable, keyUsages) {
            return origGenerateKey(algorithm, true, keyUsages);
        };

        // Capture HKDF key derivations with extractable output
        const origDeriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);
        crypto.subtle.deriveKey = async function(algorithm, baseKey, derivedKeyType, extractable, keyUsages) {
            const result = await origDeriveKey(algorithm, baseKey, derivedKeyType, true, keyUsages);
            try {
                const raw = await crypto.subtle.exportKey('raw', result);
                const b64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
                scope.__waCaptured.deriveKey.push({
                    ts: Date.now(),
                    alg: algorithm.name,
                    saltLen: algorithm.salt ? algorithm.salt.byteLength : 0,
                    derivedAlg: derivedKeyType.name,
                    derivedLen: derivedKeyType.length,
                    keyB64: b64,
                    usages: keyUsages
                });
            } catch(e) {}
            return result;
        };

        // Capture all decrypt operations with plaintext output
        const origDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
        crypto.subtle.decrypt = async function(algorithm, key, data) {
            const result = await origDecrypt(algorithm, key, data);
            let keyB64 = null;
            try {
                const raw = await crypto.subtle.exportKey('raw', key);
                keyB64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
            } catch(e) { keyB64 = 'export-failed'; }

            const entry = {
                ts: Date.now(),
                alg: algorithm.name,
                key: keyB64,
                inSize: data.byteLength,
                outSize: result.byteLength
            };

            // Capture decrypted output (up to 1500 bytes) for text extraction
            if (result.byteLength > 0 && result.byteLength < 500000) {
                const slice = new Uint8Array(result.slice(0, Math.min(1500, result.byteLength)));
                entry.outB64 = btoa(String.fromCharCode(...slice));
            }
            scope.__waCaptured.decrypt.push(entry);
            return result;
        };
    });

    // Reload to trigger fresh decryption of all cached messages
    await page.reload({ waitUntil: 'networkidle' });
    // Wait for WhatsApp to load and decrypt messages
    await page.waitForTimeout(8000);
    return 'Interceptor installed and page reloaded. Decryptions are being captured.';
}
```

### Step 3: Collect captured decryptions

Wait 10-15 seconds after reload, then extract with `browser_run_code`:

```javascript
async (page) => {
    const data = await page.evaluate(() => {
        const c = (globalThis || self).__waCaptured;
        if (!c) return JSON.stringify({error: 'no captures'});
        return JSON.stringify({
            decryptCount: c.decrypt.length,
            deriveKeyCount: c.deriveKey.length,
            derivedKeys: c.deriveKey,
            // Get text messages from AES-CBC decrypts
            sample: c.decrypt.slice(0, 5)
        });
    });
    return data;
}
```

### Step 4: Extract and parse message text

Decrypted output is **protobuf**. Extract text with `browser_run_code`:

```javascript
async (page) => {
    const result = await page.evaluate(() => {
        const c = (globalThis || self).__waCaptured;
        if (!c) return JSON.stringify({error: 'no captures'});

        function readVarint(bytes, pos) {
            let result = 0, shift = 0;
            while (pos < bytes.length) {
                const byte = bytes[pos];
                result |= (byte & 0x7f) << shift;
                shift += 7; pos++;
                if (!(byte & 0x80)) return [result, pos];
            }
            return [null, pos];
        }

        function parseProtobufText(bytes) {
            // Structure: field 1 (0x0a) -> varint len -> field 1 (0x0a) -> varint textlen -> utf8 text
            if (!bytes || bytes[0] !== 0x0a) return null;
            let pos = 1;
            let [outerLen, p1] = readVarint(bytes, pos);
            if (outerLen === null || p1 >= bytes.length) return null;
            pos = p1;
            if (bytes[pos] !== 0x0a) return null;
            pos++;
            let [textLen, p2] = readVarint(bytes, pos);
            if (textLen === null || textLen <= 0 || p2 + textLen > bytes.length) return null;
            pos = p2;
            try {
                return new TextDecoder('utf-8').decode(bytes.slice(pos, pos + textLen));
            } catch(e) { return null; }
        }

        function extractSender(bytes) {
            try {
                const str = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
                const match = str.match(/(\d+@(?:s\.whatsapp\.net|lid|g\.us))/);
                return match ? match[1] : null;
            } catch(e) { return null; }
        }

        const messages = [];
        for (const d of c.decrypt) {
            if (!d.outB64 || d.alg !== 'AES-CBC') continue;
            try {
                const bytes = Uint8Array.from(atob(d.outB64), c => c.charCodeAt(0));
                const text = parseProtobufText(bytes);
                if (text && text.length > 0) {
                    messages.push({
                        text: text,
                        sender: extractSender(bytes),
                        ts: d.ts
                    });
                }
            } catch(e) {}
        }

        return JSON.stringify({
            totalDecrypts: c.decrypt.length,
            textMessages: messages.length,
            messages: messages
        });
    });
    return result;
}
```

### Step 5: Navigate to more chats for additional messages

WhatsApp only decrypts messages for loaded chats. To capture more:

```
Use browser_snapshot to see the chat list.
Click on different chats using browser_click with the ref for each chat.
Wait 3-5 seconds between clicks for decryption to complete.
Re-run Step 4 to collect newly decrypted messages.
```

**Important**: After the initial page reload (Step 2), WhatsApp decrypts all cached/visible messages (~700-1000+). Clicking individual chats adds more but the bulk comes from the reload.

### Step 6: Store messages in memories.db

Save the extracted messages to the `messages` table in memories.db. This deduplicates automatically and resolves sender JIDs to contact names.

```python
import sys, json
sys.path.insert(0, "/Users/matthewdi/user-memories")
from user_memories import MemoryDB
from user_memories.ingestors.messages import ingest_messages, message_stats

mem = MemoryDB("/Users/matthewdi/user-memories/memories.db")

# messages = the parsed messages list from Step 4
inserted = ingest_messages(mem, messages)
print(f"Inserted {inserted} new messages")

stats = message_stats(mem)
print(f"Total stored: {stats['total_messages']}")

mem.close()
```

### Step 7: Analyze messages and write relationship memories

Read the stored messages, analyze patterns, and write structured memories:

```python
from user_memories.ingestors.messages import get_messages

mem = MemoryDB("/Users/matthewdi/user-memories/memories.db")

# Read all messages (or filter by sender/search)
all_msgs = get_messages(mem, limit=1000)
# get_messages(mem, sender="79850775077")  # filter by sender
# get_messages(mem, search="SAP")          # search text

# After analyzing, write relationship/interest memories:
mem.upsert("relationship:ContactName", "description of relationship and topics discussed",
           ["contact", "relationship"], 0.8, "whatsapp:messages")

mem.conn.commit()
mem.close()
```

The `messages` table accumulates across sessions. Each time you run "update WhatsApp messages", new messages are appended (deduped). Any Claude session can then query them for analysis without re-intercepting.

### Captured Keys (for reference)

The interceptor also captures HKDF-derived keys. These are **session-specific** (change per browser session):
- **Primary AES-CBC-128**: Used for `msgRowOpaqueData` (message content)
- **Secondary AES-CBC-128**: Used for secondary encryption
- **HMAC-SHA256**: Used for full-text search indexing

Keys are derived via HKDF-SHA256 from a master key in `wawc_db_enc/keys` with a 128-byte session-specific salt stored as base92 in `auth-security_rand_salt_`.

### Key Technical Details

- Crypto happens on the **main thread**, not Web Workers (3 workers exist but don't do message crypto)
- `page.addInitScript()` is critical — must run BEFORE page JS to force `extractable: true` on all key imports
- Decrypted output is protobuf: field 1 (wire type 2) -> field 1 (wire type 2) = message text
- Field 21 (`0xaa 0x01`) contains message signature/hash
- Sender JID appears as string like `15551234567@s.whatsapp.net` or `123456@lid`
- AES-GCM operations are noise protocol frames (not message content)
- AES-CTR operations are rare (only ~2 seen)

---

## Part 2: Metadata Analysis (Offline from IndexedDB)

### Prerequisites

Run the memory extraction first to populate contacts in `memories.db`:

```bash
cd /Users/matthewdi/user-memories
source .venv/bin/activate
python extract.py
```

For deeper metadata analysis beyond contacts, read IndexedDB directly using Python:

```python
import shutil, tempfile, json
from pathlib import Path
from ccl_chromium_reader import ccl_chromium_indexeddb

# Find WhatsApp IndexedDB
APP_SUPPORT = Path.home() / "Library" / "Application Support"
arc_idb = APP_SUPPORT / "Arc" / "User Data" / "Default" / "IndexedDB"

for db_dir in arc_idb.glob("*whatsapp*_0.indexeddb.leveldb"):
    tmp = Path(tempfile.mkdtemp())
    shutil.copytree(db_dir, tmp / db_dir.name)
    blob_dir = db_dir.parent / db_dir.name.replace(".leveldb", ".blob")
    tmp_blob = None
    if blob_dir.exists():
        tmp_blob = Path(tempfile.mkdtemp())
        shutil.copytree(blob_dir, tmp_blob / blob_dir.name)

    wrapper = ccl_chromium_indexeddb.WrappedIndexDB(
        str(tmp / db_dir.name),
        str(tmp_blob / blob_dir.name) if tmp_blob else None,
    )
    # Now iterate stores...
```

### Data Available

WhatsApp Web stores 51 IndexedDB object stores. Message **bodies are encrypted** (Signal protocol), but all **metadata is plaintext**:

| Store | Records | What's in it |
|-------|---------|-------------|
| contact | 1000 | Phone numbers, names, isAddressBook, isBusiness |
| chat | 1000 | Chat IDs, last message timestamps, unread counts, mute/archive state |
| group-metadata | 400+ | Group subjects, creation dates, owner phone number |
| participant | 400+ | Group member phone lists |
| message | 1000 | Message type, from/to/author, timestamps, media metadata (NOT body text) |
| reactions | 900+ | Emoji reactions with sender, timestamp |
| profile-pic-thumb | 400+ | Profile picture CDN URLs |
| verified-business-name | 700+ | Business names linked to phone numbers |
| blocklist | ~20 | Blocked phone numbers |
| device-list | 1000 | Linked devices per user |
| business-profile | ~60 | Business profile metadata |

### Step 1: Build the contact name lookup

WhatsApp uses two ID formats. Build a unified phone-to-name map by reading the `contact` store:

```python
contacts = {}  # phone -> name
lid_to_phone = {}  # lid -> phone
for record in db["contact"].iterate_records():
    val = record.value  # already a dict from ccl_chromium_reader
    cid = val.get('id', '')
    name = val.get('name', '')
    pnum = cid.split('@')[0]
    phone_field = val.get('phoneNumber', '')

    if phone_field:
        phone = phone_field.split('@')[0]
        lid_to_phone[pnum] = phone
        if name:
            contacts[phone] = name

    if name and '@c.us' in cid:
        contacts[pnum] = name
```

### Step 2: Most recent chats (who's active)

Read the `chat` store. Sort by `t` (timestamp) descending. Fields: `id` (phone@c.us or group@g.us), `t` (unix epoch), `unreadCount`, `archive`, `muteExpiration`.

### Step 3: Group analysis

Read `group-metadata` and `participant` stores.

Group metadata fields: `id`, `subject` (group name), `creation` (unix epoch), `owner` (phone@c.us), `restrict`, `announce`.

Participant fields: `groupId`, `participants` (list of phone@c.us strings).

### Step 4: Inner circle (shared group membership)

The most powerful signal. Count how many groups each person shares with the account owner:

```python
# Find your own number (owner of most groups)
# Then count shared groups per contact
your_groups = set()  # groups you're in
person_groups = {}   # phone -> set of groups

for participant_record in participants:
    gid = record['groupId']
    for p in record['participants']:
        phone = p.split('@')[0]
        # resolve lid -> phone if needed
        resolved = lid_to_phone.get(phone, phone)
        if resolved == YOUR_NUMBER:
            your_groups.add(gid)
        person_groups.setdefault(resolved, set()).add(gid)

# Rank by overlap
shared = {p: len(gs & your_groups) for p, gs in person_groups.items() if p != YOUR_NUMBER}
top_connections = sorted(shared.items(), key=lambda x: -x[1])
```

### Step 5: Group categorization

Classify groups by subject keywords:

```python
categories = {
    'Real Estate': ['аренд', 'квартир', 'объект', 'собственн', 'продаж', 'недвиж'],
    'Business': ['ооо', 'холдинг', 'инвест', 'юрид', 'бухгалтер', 'платеж'],
    'Team': ['рабоч', 'команд', 'комитет', 'текущ'],
    'Events': ['вечеринк', 'new year', 'выпускн', 'конф', 'др '],
    'Tech': ['ai', 'hackathon', 'tech', 'программ'],
    'Family': ['родн', 'семь', 'мам', 'пап'],
}
```

Adapt keywords to the user's language/context.

### Step 6: Contact geography

Parse phone number prefixes to determine countries:

| Prefix | Country |
|--------|---------|
| +7 (9xx, 8xx, etc.) | Russia |
| +1 (10+ digits) | US/Canada |
| +44 | UK |
| +33 | France |
| +49 | Germany |
| +971 | UAE |
| +91 (10+ digits) | India |
| +34 | Spain |
| +995 | Georgia |
| +372 | Estonia |

### Step 7: Message patterns

Read the `message` store. Message fields (metadata only, body is encrypted):
- `type`: chat, image, video, ptt (voice), document, sticker, location, vcard, revoked, album
- `t`: unix timestamp
- `from`: sender (phone@c.us or group@g.us)
- `to`: recipient dict with `user` and `server`
- `author`: in group messages, the actual sender
- `ack`: delivery status (0=sent, 1=delivered, 2=read)
- `isForwarded`, `forwardingScore`: forwarding chain info
- `hasReaction`: whether message has reactions

Analyze: message types distribution, top senders by count, activity by month, group vs DM ratio.

### Step 8: Reactions analysis

Read the `reactions` store. Fields: `reactionText` (emoji), `senderUserJid` (who reacted), `parentMsgKey` (which message), `timestamp`.

### Step 9: Profile inference summary

Combine all signals into a narrative:
- **Identity**: account phone number (owner of most groups)
- **Inner circle**: top 5-10 by shared group count, with names
- **Social context**: group categories reveal profession/interests
- **Geography**: phone prefix distribution shows life trajectory
- **Activity timeline**: chat timestamps show engagement periods
- **Communication style**: message types (text-heavy vs media-heavy), reaction emoji preferences

## Output Format

Present findings as:
1. **Account summary** — phone number, browser, total contacts/groups/messages
2. **Inner circle** — table of top connections with shared group count and names
3. **Group landscape** — categorized groups with activity dates and member counts
4. **Contact geography** — country breakdown with percentages
5. **Activity timeline** — most recent chats, busiest periods
6. **Message patterns** — type distribution, top senders, emoji reactions
7. **Decrypted messages** — if live interception was performed, include message content analysis by category (work, personal, automated alerts, etc.)
8. **Profile narrative** — 2-3 paragraph synthesis of who this person is based on all data

## Scripts Reference

All scripts live in `scripts/` (gitignored):

| File | Purpose |
|------|---------|
| `intercept_whatsapp_crypto.py` | CDP-based interceptor (standalone, needs Chrome with `--remote-debugging-port`) |
| `decrypt_messages.py` | Offline decryption brute-force (10+ HKDF strategies, limited success) |
| `decrypt_messages_v2.py` | Offline decryption with captured session keys |
| `decrypted_messages_all.json` | 774 decrypted messages from live interception |
| `whatsapp_decryption_keys.json` | Captured HKDF key derivation data |
| `WHATSAPP_DECRYPTION_README.md` | Technical documentation |

## Known Limitations

- **Session-specific keys**: HKDF-derived keys change per browser session (128-byte salt). Captured keys only work for the session they were captured in.
- **Offline decryption**: Does not work across sessions. IndexedDB from Arc and Playwright interception are different sessions with different HKDF salts.
- **Record cap**: 1000 per IndexedDB store (may miss older data in metadata queries)
- **Contact names**: Only available for address book contacts (many contacts are phone-only)
- **lid-to-phone mapping**: Incomplete — some contacts only have lid identifiers
- **Timestamps**: Unix epoch (seconds, not milliseconds) — convert with `datetime.fromtimestamp(t, tz=timezone.utc)`
- **Mojibake**: Russian/Cyrillic text in JSON may appear as mojibake. Fix with `text.encode('latin-1').decode('utf-8')`
