"""Ingest bookmark memories from browser bookmark files."""

import json
import plistlib
import shutil
import sqlite3
import logging
from pathlib import Path

from ai_browser_profile.db import MemoryDB
from ai_browser_profile.ingestors.browser_detect import BrowserProfile, copy_db, domain
from ai_browser_profile.ingestors.constants import SERVICE_NAMES

log = logging.getLogger(__name__)

# URLs to skip entirely
_SKIP_SCHEMES = ("chrome://", "chrome-extension://", "about:", "javascript:", "edge://", "brave://")

# Default bookmarks that are noise
_SKIP_DOMAINS = {"www.apple.com", "apple.com", "support.apple.com"}
_SKIP_URLS = {"https://www.google.com/", "http://www.google.com/", "https://google.com/", "http://google.com/"}

# Domain keywords for tag inference on unknown bookmarks
_TAG_KEYWORDS = {
    "tool": {"github", "gitlab", "stackoverflow", "stackexchange", "dev", "codepen",
             "codesandbox", "npm", "pypi", "crates", "packagist", "brew"},
    "knowledge": {"docs", "wiki", "learn", "tutorial", "guide", "course", "edu",
                  "arxiv", "scholar", "paper", "blog", "medium", "substack"},
    "social": {"twitter", "x.com", "linkedin", "facebook", "instagram", "reddit",
               "mastodon", "threads", "tiktok", "youtube"},
}


def _should_skip(url: str) -> bool:
    """Return True if this bookmark URL should be skipped."""
    if any(url.startswith(s) for s in _SKIP_SCHEMES):
        return True
    if url in _SKIP_URLS:
        return True
    d = domain(url)
    if d in _SKIP_DOMAINS:
        return True
    if not d:
        return True
    return False


def _infer_tags(d: str) -> list[str]:
    """Infer tags for an unknown bookmark domain."""
    tags = {"knowledge"}
    d_lower = d.lower()
    for tag, keywords in _TAG_KEYWORDS.items():
        for kw in keywords:
            if kw in d_lower:
                tags.add(tag)
                break
    return list(tags)


def _walk_chromium_bookmarks(node: dict, out: list[dict]):
    """Recursively walk a Chromium bookmark tree node."""
    if node.get("type") == "url":
        url = node.get("url", "")
        title = node.get("name", "")
        if url and not _should_skip(url):
            out.append({"url": url, "title": title})
    for child in node.get("children", []):
        _walk_chromium_bookmarks(child, out)


def _chromium_bookmarks(profile: BrowserProfile) -> list[dict]:
    """Read bookmarks from Chromium JSON file."""
    bm_path = profile.path / "Bookmarks"
    if not bm_path.exists():
        return []
    try:
        with open(bm_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        out: list[dict] = []
        roots = data.get("roots", {})
        for key in ("bookmark_bar", "other", "synced"):
            if key in roots:
                _walk_chromium_bookmarks(roots[key], out)
        return out
    except Exception as e:
        log.warning(f"Failed to read Bookmarks for {profile.browser}/{profile.name}: {e}")
        return []


def _walk_safari_bookmarks(node: dict, out: list[dict]):
    """Recursively walk a Safari bookmark plist node."""
    bm_type = node.get("WebBookmarkType", "")
    if bm_type == "WebBookmarkTypeLeaf":
        url = node.get("URLString", "")
        title = node.get("URIDictionary", {}).get("title", "")
        if url and not _should_skip(url):
            out.append({"url": url, "title": title})
    for child in node.get("Children", []):
        _walk_safari_bookmarks(child, out)


def _safari_bookmarks(profile: BrowserProfile) -> list[dict]:
    """Read bookmarks from Safari Bookmarks.plist."""
    bm_path = profile.path / "Bookmarks.plist"
    if not bm_path.exists():
        return []
    try:
        with open(bm_path, "rb") as f:
            data = plistlib.load(f)
        out: list[dict] = []
        _walk_safari_bookmarks(data, out)
        return out
    except Exception as e:
        log.warning(f"Failed to read Safari Bookmarks.plist: {e}")
        return []


def _firefox_bookmarks(profile: BrowserProfile) -> list[dict]:
    """Read bookmarks from Firefox places.sqlite."""
    tmp = copy_db(profile.path / "places.sqlite")
    if not tmp:
        return []
    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT b.title, p.url FROM moz_bookmarks b "
            "JOIN moz_places p ON b.fk = p.id "
            "WHERE b.type = 1"
        ).fetchall()
        conn.close()
        out: list[dict] = []
        for row in rows:
            url = row["url"] or ""
            title = row["title"] or ""
            if url and not _should_skip(url):
                out.append({"url": url, "title": title})
        return out
    except Exception as e:
        log.warning(f"Failed to read Firefox bookmarks: {e}")
        return []
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)


def ingest_bookmarks(mem: MemoryDB, profiles: list[BrowserProfile]):
    """Extract bookmark memories from all browser profiles."""
    # Collect all bookmarks across profiles
    all_bookmarks: list[dict] = []
    for profile in profiles:
        if profile.browser in ("arc", "chrome", "brave", "edge"):
            all_bookmarks.extend(_chromium_bookmarks(profile))
        elif profile.browser == "safari":
            all_bookmarks.extend(_safari_bookmarks(profile))
        elif profile.browser == "firefox":
            all_bookmarks.extend(_firefox_bookmarks(profile))

    # Deduplicate by URL (keep first title seen)
    seen_urls: dict[str, str] = {}
    for bm in all_bookmarks:
        url = bm["url"]
        if url not in seen_urls:
            seen_urls[url] = bm["title"]

    known_count = 0
    unknown_count = 0

    for url, title in seen_urls.items():
        d = domain(url)
        if not d:
            continue

        if d in SERVICE_NAMES:
            # Known service: boost the tool entry
            service = SERVICE_NAMES[d]
            tags = ["account", "tool"]
            mem.upsert(f"tool:{service}", title or service, tags, source=f"bookmark:{d}")
            known_count += 1
        else:
            # Unknown domain: create bookmark entry
            tags = _infer_tags(d)
            mem.upsert(f"bookmark:{d}", title or d, tags, confidence=0.6, source=f"bookmark:{url}")
            unknown_count += 1

    log.info(f"  Bookmarks: {len(seen_urls)} unique, {known_count} known services, {unknown_count} new domains")
