"""Ingest tool/service memories from browser history."""

import shutil
import sqlite3
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ai_browser_profile.db import MemoryDB
from ai_browser_profile.ingestors.browser_detect import BrowserProfile, copy_db, domain
from ai_browser_profile.ingestors.constants import SERVICE_NAMES

log = logging.getLogger(__name__)

CHROME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)
MACOS_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)


def _chromium_history(profile: BrowserProfile) -> dict[str, int]:
    """Read domain visit counts from Chromium History SQLite."""
    counts: dict[str, int] = {}
    tmp = copy_db(profile.path / "History")
    if not tmp:
        return counts
    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        for row in conn.execute(
            "SELECT url, visit_count FROM urls ORDER BY last_visit_time DESC LIMIT 10000"
        ):
            d = domain(row["url"])
            if d:
                counts[d] = counts.get(d, 0) + (row["visit_count"] or 1)
        conn.close()
    except Exception as e:
        log.warning(f"Failed to read History for {profile.browser}/{profile.name}: {e}")
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)
    return counts


def _safari_history(profile: BrowserProfile) -> dict[str, int]:
    """Read domain visit counts from Safari History.db."""
    counts: dict[str, int] = {}
    tmp = copy_db(profile.path / "History.db")
    if not tmp:
        return counts
    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        for row in conn.execute(
            "SELECT url, visit_count FROM history_items ORDER BY visit_count DESC LIMIT 10000"
        ):
            d = domain(row["url"])
            if d:
                counts[d] = counts.get(d, 0) + (row["visit_count"] or 1)
        conn.close()
    except Exception as e:
        log.warning(f"Failed to read Safari History: {e}")
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)
    return counts


def _firefox_history(profile: BrowserProfile) -> dict[str, int]:
    """Read domain visit counts from Firefox places.sqlite."""
    counts: dict[str, int] = {}
    tmp = copy_db(profile.path / "places.sqlite")
    if not tmp:
        return counts
    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        for row in conn.execute(
            "SELECT url, visit_count FROM moz_places WHERE visit_count > 0 ORDER BY visit_count DESC LIMIT 10000"
        ):
            d = domain(row["url"])
            if d:
                counts[d] = counts.get(d, 0) + (row["visit_count"] or 1)
        conn.close()
    except Exception as e:
        log.warning(f"Failed to read Firefox places.sqlite: {e}")
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)
    return counts


def ingest_history(mem: MemoryDB, profiles: list[BrowserProfile]):
    """Extract tool/service memories from browser history across all profiles."""
    # Aggregate domain counts across all profiles
    totals: dict[str, int] = {}
    for profile in profiles:
        if profile.browser in ("arc", "chrome", "brave", "edge"):
            counts = _chromium_history(profile)
        elif profile.browser == "safari":
            counts = _safari_history(profile)
        elif profile.browser == "firefox":
            counts = _firefox_history(profile)
        else:
            continue
        for d, c in counts.items():
            totals[d] = totals.get(d, 0) + c

    # Convert to tool/service memories
    for d, total in sorted(totals.items(), key=lambda x: -x[1])[:200]:
        if d not in SERVICE_NAMES:
            continue
        service = SERVICE_NAMES[d]
        tags = ["account", "tool"]
        if service in ("GitHub", "GitLab", "Vercel", "Netlify", "Supabase", "Firebase", "CodeSandbox"):
            tags.append("work")
            tags.append("dev")
        elif service in ("Gmail", "Slack", "WhatsApp", "Discord", "Microsoft Teams", "Missive", "OpenPhone"):
            tags.append("communication")
        elif service in ("LinkedIn", "X/Twitter", "Instagram", "Facebook", "Reddit", "YouTube", "Product Hunt"):
            tags.append("social")
        elif service in ("Stripe", "QuickBooks", "Coinbase", "Gusto", "Polymarket"):
            tags.append("finance")
        elif service in ("ChatGPT", "Claude", "Anthropic Console"):
            tags.append("ai")
        mem.upsert(f"tool:{service}", str(total), tags, source=f"history:{d}")

    log.info(f"  History: {len(totals)} domains, {sum(1 for d in totals if d in SERVICE_NAMES)} known services")
