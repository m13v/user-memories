---
name: autofill-profiles
description: "Extract structured autofill data (names, emails, phones, addresses, companies) from Chromium browser 'Web Data' SQLite files. Use when: 'autofill data', 'browser addresses', 'saved addresses', 'autofill profiles', 'who is this person', 'extract contact info from browser', 'browser PII', 'form data'."
---

# Autofill Profile Extraction

Extract structured personal data (names, emails, phones, addresses, companies) from Chromium-based browsers' `Web Data` SQLite files. Works with Arc, Chrome, Brave, and Edge.

## Where the Data Lives

Every Chromium browser profile has a `Web Data` SQLite file:

| Browser | Path |
|---------|------|
| Arc | `~/Library/Application Support/Arc/User Data/{Profile}/Web Data` |
| Chrome | `~/Library/Application Support/Google/Chrome/{Profile}/Web Data` |
| Brave | `~/Library/Application Support/BraveSoftware/Brave-Browser/{Profile}/Web Data` |
| Edge | `~/Library/Application Support/Microsoft Edge/{Profile}/Web Data` |

Where `{Profile}` is `Default`, `Profile 1`, `Profile 2`, etc.

## Schema

### Structured Address Profiles

The modern Chromium schema stores address profiles across two tables:

**`addresses`** — profile metadata:
```sql
CREATE TABLE addresses (
    guid VARCHAR PRIMARY KEY,
    use_count INTEGER NOT NULL DEFAULT 0,
    use_date INTEGER NOT NULL DEFAULT 0,    -- Unix timestamp
    date_modified INTEGER NOT NULL DEFAULT 0,
    language_code VARCHAR,
    label VARCHAR,
    initial_creator_id INTEGER DEFAULT 0,
    last_modifier_id INTEGER DEFAULT 0,
    record_type INTEGER  -- 0=local, 1=synced from Google account
);
```

**`address_type_tokens`** — the actual field values:
```sql
CREATE TABLE address_type_tokens (
    guid VARCHAR,       -- FK to addresses.guid
    type INTEGER,       -- field type code (see mapping below)
    value VARCHAR,      -- the actual data
    verification_status INTEGER DEFAULT 0,
    observations BLOB,
    PRIMARY KEY (guid, type)
);
```

### Type Code Mapping

| Type | Field | Example |
|------|-------|---------|
| 3 | First name | Matthew |
| 4 | Middle name | |
| 5 | Last name | Diakonov |
| 7 | Full name | Matthew Diakonov |
| 9 | Email | i@m13v.com |
| 14 | Phone | +1 650-796-1489 |
| 33 | City | San Francisco |
| 34 | State | California |
| 35 | ZIP | 94117 |
| 36 | Country | US |
| 60 | Company | Mediar, Inc. |
| 77 | Street address | 546 Fillmore st. |
| 79 | Address line 2 | Apt 4B |
| 103 | Street name | Marina Boulevard |
| 104 | House number | 2 |
| 109 | Family name (alt) | Diakonov |
| 142 | Full street (alt) | Marina Boulevard 2 |

Types not listed (32, 81, 105, 107, 108, 110, 116, 135, 136, 140, 141, 143, 144, 151-153, 156-157, 166-167) are usually empty — they hold name affixes, honorifics, and address subcomponents for i18n.

### Form Autofill Entries

The **`autofill`** table stores raw form field values the user has typed:

```sql
CREATE TABLE autofill (
    name VARCHAR,           -- HTML field name or id
    value VARCHAR,          -- what the user typed
    value_lower VARCHAR,    -- lowercased for lookup
    date_created INTEGER,
    date_last_used INTEGER,
    count INTEGER DEFAULT 1,
    PRIMARY KEY (name, value)
);
```

Common field names: `email`, `firstName`, `lastName`, `name`, `phone`, `city`, `state`, `zip`, `company`, `username`, `address`, `identifier`.

### Credit Cards (encrypted)

```sql
CREATE TABLE credit_cards (
    guid VARCHAR PRIMARY KEY,
    name_on_card VARCHAR,
    expiration_month INTEGER,
    expiration_year INTEGER,
    card_number_encrypted BLOB,  -- AES-encrypted, requires OS keychain
    date_modified INTEGER,
    origin VARCHAR,
    use_count INTEGER,
    use_date INTEGER,
    billing_address_id VARCHAR,
    nickname VARCHAR
);
```

Card numbers are AES-encrypted and require macOS Keychain access to decrypt. `name_on_card`, `expiration_month`, `expiration_year`, and `nickname` are plaintext.

## Extraction Workflow

### Step 1: Copy the database (avoid browser locks)

```bash
cp "~/Library/Application Support/Arc/User Data/Default/Web Data" /tmp/webdata.db
```

### Step 2: Extract structured address profiles

```sql
-- All address profiles with non-empty fields
SELECT a.guid, a.use_count, a.record_type, t.type, t.value
FROM addresses a
JOIN address_type_tokens t ON a.guid = t.guid
WHERE t.value != ''
ORDER BY a.use_count DESC, a.guid, t.type;
```

### Step 3: Build structured profiles (Python)

```python
import sqlite3, shutil, tempfile
from pathlib import Path

TYPE_MAP = {
    3: "first_name", 4: "middle_name", 5: "last_name", 7: "full_name",
    9: "email", 14: "phone",
    33: "city", 34: "state", 35: "zip", 36: "country",
    60: "company", 77: "street_address", 79: "address_line_2",
    103: "street_name", 104: "house_number", 109: "family_name",
    142: "full_street",
}

def extract_address_profiles(webdata_path: Path) -> list[dict]:
    """Extract structured address profiles from a Chromium Web Data file."""
    tmp = Path(tempfile.mkdtemp())
    dst = tmp / "Web Data"
    shutil.copy2(webdata_path, dst)
    for suffix in ["-wal", "-shm"]:
        wal = webdata_path.parent / (webdata_path.name + suffix)
        if wal.exists():
            shutil.copy2(wal, tmp / (webdata_path.name + suffix))

    profiles = []
    try:
        conn = sqlite3.connect(f"file:{dst}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        addresses = {}
        for row in conn.execute("SELECT guid, use_count, use_date, record_type FROM addresses"):
            addresses[row["guid"]] = {
                "guid": row["guid"],
                "use_count": row["use_count"],
                "use_date": row["use_date"],
                "record_type": "synced" if row["record_type"] == 1 else "local",
            }

        for row in conn.execute("SELECT guid, type, value FROM address_type_tokens WHERE value != ''"):
            guid = row["guid"]
            if guid not in addresses:
                continue
            field = TYPE_MAP.get(row["type"])
            if field:
                addresses[guid][field] = row["value"]

        conn.close()
        profiles = sorted(addresses.values(), key=lambda x: x["use_count"], reverse=True)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    return profiles
```

### Step 4: Extract form autofill entries

```sql
-- Top autofill entries by usage
SELECT name, value, count FROM autofill ORDER BY count DESC LIMIT 50;

-- Emails
SELECT value, count FROM autofill WHERE lower(name) IN ('email', 'e-mail', 'email_address', 'emailaddress') ORDER BY count DESC;

-- Names
SELECT name, value, count FROM autofill WHERE lower(name) IN ('name', 'firstname', 'first_name', 'first-name', 'given-name', 'lastname', 'last_name', 'last-name', 'family-name', 'fullname', 'full_name', 'full-name') ORDER BY count DESC;

-- Phones
SELECT value, count FROM autofill WHERE lower(name) IN ('phone', 'tel', 'telephone', 'mobile', 'cell', 'phonenumber', 'phone_number') ORDER BY count DESC;
```

### Step 5: Extract credit card metadata (no card numbers)

```sql
SELECT name_on_card, expiration_month, expiration_year, nickname, use_count
FROM credit_cards
ORDER BY use_count DESC;
```

## All Browsers at Once

```python
from pathlib import Path

APP_SUPPORT = Path.home() / "Library" / "Application Support"

BROWSER_PATHS = {
    "arc": APP_SUPPORT / "Arc" / "User Data",
    "chrome": APP_SUPPORT / "Google" / "Chrome",
    "brave": APP_SUPPORT / "BraveSoftware" / "Brave-Browser",
    "edge": APP_SUPPORT / "Microsoft Edge",
}

def find_all_webdata() -> list[tuple[str, str, Path]]:
    """Find all Web Data files across browsers and profiles."""
    results = []
    for browser, base in BROWSER_PATHS.items():
        if not base.exists():
            continue
        for d in sorted(base.iterdir()):
            if d.is_dir() and (d.name == "Default" or d.name.startswith("Profile ")):
                webdata = d / "Web Data"
                if webdata.exists():
                    results.append((browser, d.name, webdata))
    return results
```

## Notes

- **Safari** does not use `Web Data` — its autofill is in `~/Library/Safari/Form Values` (binary plist, requires Full Disk Access)
- **Firefox** stores autofill in `formhistory.sqlite` in the profile directory, not `Web Data`
- Data persists even after clearing browser history — autofill is separate
- Google account sync means the same profiles appear across Chrome and Arc if logged into the same account
- `record_type=1` (synced) profiles came from Google account and are the most reliable identity data
