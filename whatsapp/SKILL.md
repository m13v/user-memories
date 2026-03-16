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

        const origImportKey = crypto.subtle.importKey.bind(crypto.subtle);
        crypto.subtle.importKey = function(format, keyData, algorithm, extractable, keyUsages) {
            return origImportKey(format, keyData, algorithm, true, keyUsages);
        };

        const origGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
        crypto.subtle.generateKey = function(algorithm, extractable, keyUsages) {
            return origGenerateKey(algorithm, true, keyUsages);
        };

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

            if (result.byteLength > 0 && result.byteLength < 500000) {
                const slice = new Uint8Array(result.slice(0, Math.min(1500, result.byteLength)));
                entry.outB64 = btoa(String.fromCharCode(...slice));
            }
            scope.__waCaptured.decrypt.push(entry);
            return result;
        };
    });

    await page.reload({ waitUntil: 'networkidle' });
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

### Step 6: Store messages in memories.db

```python
import sys, os
sys.path.insert(0, os.path.expanduser("~/ai-browser-profile"))
from ai_browser_profile import MemoryDB
from ai_browser_profile.ingestors.messages import ingest_messages, message_stats

mem = MemoryDB(os.path.expanduser("~/ai-browser-profile/memories.db"))

# messages = the parsed messages list from Step 4
inserted = ingest_messages(mem, messages)
print(f"Inserted {inserted} new messages")

stats = message_stats(mem)
print(f"Total stored: {stats['total_messages']}")

mem.close()
```

### Step 7: Analyze messages and write relationship memories

```python
from ai_browser_profile.ingestors.messages import get_messages

mem = MemoryDB(os.path.expanduser("~/ai-browser-profile/memories.db"))

all_msgs = get_messages(mem, limit=1000)

# After analyzing, write relationship/interest memories:
mem.upsert("relationship:ContactName", "description of relationship",
           ["contact", "relationship"], 0.8, "whatsapp:messages")

mem.conn.commit()
mem.close()
```

---

## Part 2: Metadata Analysis (Offline from IndexedDB)

### Prerequisites

Run the memory extraction first to populate contacts in `memories.db`:

```bash
cd ~/ai-browser-profile
source .venv/bin/activate
python extract.py
```

For deeper metadata analysis, read IndexedDB directly:

```python
import shutil, tempfile, json
from pathlib import Path
from ccl_chromium_reader import ccl_chromium_indexeddb

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

WhatsApp Web stores 51 IndexedDB object stores. Message bodies are encrypted (Signal protocol), but all metadata is plaintext:

| Store | Records | What's in it |
|-------|---------|-------------|
| contact | 1000 | Phone numbers, names, isAddressBook, isBusiness |
| chat | 1000 | Chat IDs, last message timestamps, unread counts |
| group-metadata | 400+ | Group subjects, creation dates, owner phone |
| participant | 400+ | Group member phone lists |
| message | 1000 | Message type, from/to/author, timestamps (NOT body) |
| reactions | 900+ | Emoji reactions with sender, timestamp |

### Inner Circle Analysis

Count shared group membership to find closest contacts:

```python
your_groups = set()
person_groups = {}

for participant_record in participants:
    gid = record['groupId']
    for p in record['participants']:
        phone = p.split('@')[0]
        resolved = lid_to_phone.get(phone, phone)
        if resolved == YOUR_NUMBER:
            your_groups.add(gid)
        person_groups.setdefault(resolved, set()).add(gid)

shared = {p: len(gs & your_groups) for p, gs in person_groups.items() if p != YOUR_NUMBER}
top_connections = sorted(shared.items(), key=lambda x: -x[1])
```

## Known Limitations

- **Session-specific keys**: HKDF-derived keys change per browser session
- **Offline decryption**: Does not work across sessions
- **Record cap**: 1000 per IndexedDB store
- **Contact names**: Only available for address book contacts
- **Timestamps**: Unix epoch seconds — convert with `datetime.fromtimestamp(t, tz=timezone.utc)`
