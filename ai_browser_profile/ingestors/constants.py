"""Lookup maps and browser paths for memory extraction. Self-contained, no external imports."""

import re

from pathlib import Path

APP_SUPPORT = Path.home() / "Library" / "Application Support"

# Chromium address_type_tokens type codes -> (key_name, tags)
ADDRESS_TYPE_MAP = {
    3: ("first_name", ["identity"]),
    5: ("last_name", ["identity"]),
    7: ("full_name", ["identity"]),
    9: ("email", ["identity", "email", "communication"]),
    14: ("phone", ["identity", "phone", "communication"]),
    33: ("city", ["address", "location"]),
    34: ("state", ["address", "location"]),
    35: ("zip", ["address", "location"]),
    36: ("country", ["address", "location"]),
    60: ("company", ["identity", "company", "work"]),
    77: ("street_address", ["address", "location"]),
    79: ("address_line_2", ["address", "location"]),
}

# Autofill form field names -> (normalized key, tags)
# Used for normalization — unmapped fields are still ingested under cleaned names
AUTOFILL_FIELD_MAP = {
    "email": ("email", ["identity", "email", "communication"]),
    "e-mail": ("email", ["identity", "email", "communication"]),
    "email_address": ("email", ["identity", "email", "communication"]),
    "emailaddress": ("email", ["identity", "email", "communication"]),
    "email-form-field": ("email", ["identity", "email", "communication"]),
    "name": ("full_name", ["identity"]),
    "fullname": ("full_name", ["identity"]),
    "full_name": ("full_name", ["identity"]),
    "full-name": ("full_name", ["identity"]),
    "firstname": ("first_name", ["identity"]),
    "first_name": ("first_name", ["identity"]),
    "first-name": ("first_name", ["identity"]),
    "given-name": ("first_name", ["identity"]),
    "lastname": ("last_name", ["identity"]),
    "last_name": ("last_name", ["identity"]),
    "last-name": ("last_name", ["identity"]),
    "family-name": ("last_name", ["identity"]),
    "phone": ("phone", ["identity", "phone", "communication"]),
    "tel": ("phone", ["identity", "phone", "communication"]),
    "telephone": ("phone", ["identity", "phone", "communication"]),
    "mobile": ("phone", ["identity", "phone", "communication"]),
    "phonenumber": ("phone", ["identity", "phone", "communication"]),
    "phone_number": ("phone", ["identity", "phone", "communication"]),
    "mobilenumber": ("phone", ["identity", "phone", "communication"]),
    "city": ("city", ["address", "location"]),
    "state": ("state", ["address", "location"]),
    "zip": ("zip", ["address", "location"]),
    "zipcode": ("zip", ["address", "location"]),
    "postal": ("zip", ["address", "location"]),
    "postalcode": ("zip", ["address", "location"]),
    "postal_code": ("zip", ["address", "location"]),
    "country": ("country", ["address", "location"]),
    "address": ("street_address", ["address", "location"]),
    "street": ("street_address", ["address", "location"]),
    "address1": ("street_address", ["address", "location"]),
    "company": ("company", ["identity", "company", "work"]),
    "companyname": ("company", ["identity", "company", "work"]),
    "company_name": ("company", ["identity", "company", "work"]),
    "organization": ("company", ["identity", "company", "work"]),
    "username": ("username", ["identity", "account", "credential"]),
    "login": ("username", ["identity", "account", "credential"]),
    "identifier": ("username", ["identity", "account", "credential"]),
    "dob": ("date_of_birth", ["identity"]),
    "dateofbirth": ("date_of_birth", ["identity"]),
    "date_of_birth": ("date_of_birth", ["identity"]),
    "date-of-birth": ("date_of_birth", ["identity"]),
    "birth-date": ("date_of_birth", ["identity"]),
    "birthdate": ("date_of_birth", ["identity"]),
    "birthday": ("date_of_birth", ["identity"]),
    "gender": ("gender", ["identity"]),
    "sex": ("gender", ["identity"]),
}

# Keywords in field names → tags (for unmapped fields)
TAG_KEYWORDS = {
    "identity": ["birth", "dob", "gender", "sex", "name", "first", "last", "middle", "suffix",
                  "passport", "nationality", "citizen", "ssn"],
    "travel": ["travel", "flyer", "frequent", "airline", "seat", "meal", "tsa",
               "known_traveler", "traveler", "passenger", "boarding", "flight", "loyalty"],
    "address": ["address", "street", "city", "state", "zip", "postal", "country", "apt"],
    "payment": ["card", "payment", "billing", "cvv", "expir"],
    "communication": ["email", "phone", "tel", "mobile", "fax"],
    "account": ["username", "login", "password", "account"],
    "work": ["company", "organization", "employer", "job", "title", "occupation"],
}

# Regex for noise detection in field names
_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-')
_PURE_DIGITS_RE = re.compile(r'^\d+$')
_TIMESTAMP_RE = re.compile(r'^\d{10,}$')
_SELECTOR_RE = re.compile(r'^(selectors\.|role:|#\d)')
_CELL_RE = re.compile(r'^cell[-_]\d+[-_]\d+', re.IGNORECASE)
_INTERNAL_RE = re.compile(r'^(react_aria|emoji_popover|_\drif_|docs_findandreplace|input\d+_\d+|single_line_text_form_component|single_typeahead_entity_form_component)')
_MONTH_YEAR_RE = re.compile(r'^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$', re.IGNORECASE)


def clean_field_name(raw: str) -> str:
    """Normalize a raw autofill field name to a clean key.

    Examples:
        'rtiTraveler.travelers[0].firstName' → 'firstname'
        'dateofbirth-mercury-utils-id-304' → 'dateofbirth'
        '1-date_of_birth' → 'date_of_birth'
        'BirthDayM' → 'birthdaym'
    """
    field = raw.strip()
    # Extract last segment of dotted paths
    if "." in field:
        field = field.rsplit(".", 1)[-1]
    # Strip array indices
    field = re.sub(r'\[\d+\]', '', field)
    # Strip leading numeric prefixes like "1-" or "0-1/"
    field = re.sub(r'^[\d]+-', '', field)
    field = re.sub(r'^[\d]+-[\d]+/', '', field)
    # Strip trailing ID suffixes like "-mercury-utils-id-304"
    field = re.sub(r'-[a-z]+-[a-z]+-[a-z]+-\d+$', '', field)
    # Lowercase
    field = field.lower().strip()
    # Replace separators with underscore for lookup
    normalized = re.sub(r'[-/]', '_', field)
    return normalized


def is_noise_field(raw: str) -> bool:
    """Return True if the field name is noise (UUIDs, timestamps, selectors, spreadsheet cells)."""
    return bool(
        _UUID_RE.match(raw)
        or _PURE_DIGITS_RE.match(raw)
        or _TIMESTAMP_RE.match(raw)
        or _SELECTOR_RE.match(raw)
        or _CELL_RE.match(raw)
        or _INTERNAL_RE.match(raw)
        or _MONTH_YEAR_RE.match(raw)
    )


def infer_tags(field: str) -> list[str]:
    """Infer tags from a cleaned field name using keyword matching."""
    tags = set()
    for tag, keywords in TAG_KEYWORDS.items():
        for kw in keywords:
            if kw in field:
                tags.add(tag)
                break
    if not tags:
        tags.add("autofill")
    return list(tags)

# Domains -> friendly service names for tool/account detection
SERVICE_NAMES = {
    "github.com": "GitHub", "gitlab.com": "GitLab", "stackoverflow.com": "Stack Overflow",
    "figma.com": "Figma", "notion.so": "Notion", "trello.com": "Trello",
    "slack.com": "Slack", "app.slack.com": "Slack",
    "linear.app": "Linear", "vercel.com": "Vercel", "netlify.com": "Netlify",
    "aws.amazon.com": "AWS", "console.cloud.google.com": "GCP",
    "portal.azure.com": "Azure", "chatgpt.com": "ChatGPT", "chat.openai.com": "ChatGPT",
    "claude.ai": "Claude", "console.anthropic.com": "Anthropic Console",
    "docs.google.com": "Google Docs", "sheets.google.com": "Google Sheets",
    "drive.google.com": "Google Drive", "mail.google.com": "Gmail",
    "calendar.google.com": "Google Calendar", "meet.google.com": "Google Meet",
    "twitter.com": "X/Twitter", "x.com": "X/Twitter",
    "linkedin.com": "LinkedIn", "www.linkedin.com": "LinkedIn",
    "instagram.com": "Instagram", "www.instagram.com": "Instagram",
    "facebook.com": "Facebook", "www.facebook.com": "Facebook",
    "reddit.com": "Reddit", "www.reddit.com": "Reddit",
    "youtube.com": "YouTube", "www.youtube.com": "YouTube",
    "open.spotify.com": "Spotify",
    "dashboard.stripe.com": "Stripe", "stripe.com": "Stripe",
    "supabase.com": "Supabase",
    "firebase.google.com": "Firebase",
    "sentry.io": "Sentry",
    "posthog.com": "PostHog", "us.posthog.com": "PostHog",
    "mixpanel.com": "Mixpanel",
    "app.apollo.io": "Apollo",
    "quickbooks.intuit.com": "QuickBooks",
    "web.whatsapp.com": "WhatsApp",
    "discord.com": "Discord",
    "teams.microsoft.com": "Microsoft Teams",
    "canva.com": "Canva", "www.canva.com": "Canva",
    "excalidraw.com": "Excalidraw",
    "codesandbox.io": "CodeSandbox",
    "codepen.io": "CodePen",
    "app.cal.com": "Cal.com",
    "calendly.com": "Calendly",
    "my.openphone.com": "OpenPhone",
    "mail.missiveapp.com": "Missive",
    "app.gusto.com": "Gusto",
    "coinbase.com": "Coinbase", "www.coinbase.com": "Coinbase",
    "polymarket.com": "Polymarket",
    "producthunt.com": "Product Hunt", "www.producthunt.com": "Product Hunt",
    "upwork.com": "Upwork", "www.upwork.com": "Upwork",
    "fiverr.com": "Fiverr", "www.fiverr.com": "Fiverr",
}

# Chromium browser data directories
BROWSER_PATHS = {
    "arc": APP_SUPPORT / "Arc" / "User Data",
    "chrome": APP_SUPPORT / "Google" / "Chrome",
    "brave": APP_SUPPORT / "BraveSoftware" / "Brave-Browser",
    "edge": APP_SUPPORT / "Microsoft Edge",
}
