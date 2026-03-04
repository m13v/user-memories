"""Detect installed browsers and their profiles."""

import shutil
import sqlite3
import tempfile
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Set
from urllib.parse import urlparse

log = logging.getLogger(__name__)

APP_SUPPORT = Path.home() / "Library" / "Application Support"


@dataclass
class BrowserProfile:
    browser: str  # "arc", "chrome", "safari", "firefox", "brave", "edge"
    name: str  # "Default", "Profile 1", etc.
    path: Path  # Full path to the profile directory


def _chromium_profiles(browser: str, base: Path) -> list[BrowserProfile]:
    """Find Chromium-based browser profiles (Default, Profile 1, etc.)."""
    profiles = []
    if not base.exists():
        return profiles

    for d in sorted(base.iterdir()):
        if d.is_dir() and (d.name == "Default" or d.name.startswith("Profile ")):
            if (d / "History").exists() or (d / "IndexedDB").exists():
                profiles.append(BrowserProfile(browser=browser, name=d.name, path=d))

    if not profiles:
        default = base / "Default"
        if default.exists():
            profiles.append(BrowserProfile(browser=browser, name="Default", path=default))

    return profiles


def detect_browsers(allowed: Optional[Set[str]] = None) -> list[BrowserProfile]:
    """Return all detected browser profiles. Optionally filter by browser name."""
    profiles: list[BrowserProfile] = []

    browsers = {
        "arc": APP_SUPPORT / "Arc" / "User Data",
        "chrome": APP_SUPPORT / "Google" / "Chrome",
        "brave": APP_SUPPORT / "BraveSoftware" / "Brave-Browser",
        "edge": APP_SUPPORT / "Microsoft Edge",
    }

    for name, base in browsers.items():
        if allowed and name not in allowed:
            continue
        profiles.extend(_chromium_profiles(name, base))

    # Safari
    if not allowed or "safari" in allowed:
        safari_dir = Path.home() / "Library" / "Safari"
        if safari_dir.exists():
            profiles.append(BrowserProfile(browser="safari", name="Default", path=safari_dir))

    # Firefox
    if not allowed or "firefox" in allowed:
        firefox_base = APP_SUPPORT / "Firefox" / "Profiles"
        if firefox_base.exists():
            for d in sorted(firefox_base.iterdir()):
                if d.is_dir() and (d / "places.sqlite").exists():
                    profiles.append(BrowserProfile(browser="firefox", name=d.name, path=d))

    log.info(f"Detected {len(profiles)} browser profiles: {[(p.browser, p.name) for p in profiles]}")
    return profiles


def copy_db(src: Path) -> Optional[Path]:
    """Copy a SQLite DB to temp dir to avoid browser locks."""
    if not src.exists():
        return None
    tmp = Path(tempfile.mkdtemp(prefix="user_memories_"))
    dst = tmp / src.name
    shutil.copy2(src, dst)
    for suffix in ["-wal", "-shm"]:
        wal = src.parent / (src.name + suffix)
        if wal.exists():
            shutil.copy2(wal, tmp / (src.name + suffix))
    return dst


def domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        return urlparse(url).netloc
    except Exception:
        return ""
