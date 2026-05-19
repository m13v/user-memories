"""Read cookies from a Chromium browser profile and inject into another.

Sibling to the ingestors in ai_browser_profile.ingestors. Lives in the
package but is NOT wired into extract_memories() — cookies are auth
secrets and must never land in memories.db.

Public API:
    read_cookies(profile, domains=None)   -> list[Cookie]
    inject_via_cdp(cookies, cdp_url, ...) -> int

CLI:
    python -m ai_browser_profile.cookies copy \\
        --from chrome:Default \\
        --to cdp://127.0.0.1:9555 \\
        --domains github.com,linear.app
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import shutil
import sqlite3
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

from ai_browser_profile.ingestors.browser_detect import (
    BrowserProfile,
    copy_db,
    detect_browsers,
)

log = logging.getLogger(__name__)

KEYCHAIN_SERVICE = {
    "chrome": "Chrome Safe Storage",
    "arc": "Arc Safe Storage",
    "brave": "Brave Safe Storage",
    "edge": "Microsoft Edge Safe Storage",
    "chromium": "Chromium Safe Storage",
}

PBKDF2_SALT = b"saltysalt"
PBKDF2_ITERATIONS = 1003
AES_KEY_LENGTH = 16
AES_IV = b" " * 16

SAMESITE_MAP = {-1: "Unspecified", 0: "None", 1: "Lax", 2: "Strict"}


@dataclass
class Cookie:
    name: str
    value: str
    domain: str
    path: str
    expires: float
    secure: bool
    http_only: bool
    same_site: str


def _keychain_password(browser: str) -> bytes:
    service = KEYCHAIN_SERVICE.get(browser)
    if not service:
        raise ValueError(f"No keychain service mapped for browser {browser!r}")
    res = subprocess.run(
        ["security", "find-generic-password", "-w", "-s", service],
        capture_output=True, text=True, check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(
            f"Could not read {service!r} from Keychain: {res.stderr.strip() or 'access denied'}"
        )
    return res.stdout.strip().encode()


def _derive_key(password: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha1", password, PBKDF2_SALT, PBKDF2_ITERATIONS, AES_KEY_LENGTH
    )


def _decrypt(encrypted: bytes, key: bytes, host_key: str) -> Optional[str]:
    """Decrypt a Chromium cookie value. Returns None on failure."""
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    if not encrypted:
        return None
    prefix = encrypted[:3]
    if prefix in (b"v10", b"v11"):
        payload = encrypted[3:]
    else:
        payload = encrypted
    if len(payload) % 16 != 0:
        return None
    cipher = Cipher(algorithms.AES(key), modes.CBC(AES_IV))
    dec = cipher.decryptor()
    plain = dec.update(payload) + dec.finalize()
    if not plain:
        return None
    pad = plain[-1]
    if 1 <= pad <= 16 and plain.endswith(bytes([pad]) * pad):
        plain = plain[:-pad]
    # Chrome 80+ prepends SHA256(host_key) (32 bytes) to bind cookie to its host.
    expected = hashlib.sha256(host_key.encode()).digest()
    if plain.startswith(expected):
        plain = plain[32:]
    try:
        return plain.decode("utf-8")
    except UnicodeDecodeError:
        return plain.decode("utf-8", errors="replace")


def read_cookies(
    profile: BrowserProfile,
    domains: Optional[Iterable[str]] = None,
) -> list[Cookie]:
    """Read and decrypt cookies from a Chromium browser profile.

    Args:
        profile: A Chromium profile from detect_browsers().
        domains: Optional iterable of substrings; a cookie is kept if its
                 host_key contains any of them. None means all cookies.
    """
    if profile.browser in ("safari", "firefox"):
        raise NotImplementedError(f"Cookie read not supported for {profile.browser}")

    cookies_path = profile.path / "Cookies"
    if not cookies_path.exists():
        raise FileNotFoundError(f"No Cookies file at {cookies_path}")

    tmp = copy_db(cookies_path)
    if tmp is None:
        raise RuntimeError(
            f"Could not copy {cookies_path}. Grant Full Disk Access to your terminal and retry."
        )

    domain_filters = list(domains) if domains else None

    def _host_matches(host: str) -> bool:
        # Domain-suffix match: 'x.com' matches 'x.com' / 'api.x.com' but not 'fedex.com'.
        # Cookie host_keys often start with '.' for "all subdomains" — strip that.
        h = host or ""
        if "://" in h:
            h = h.split("://", 1)[1]
        h = h.split("/", 1)[0].split(":", 1)[0].lstrip(".").lower()
        for f in (domain_filters or []):
            ff = (f or "").strip().lstrip(".").lower()
            if not ff:
                continue
            if h == ff or h.endswith("." + ff):
                return True
        return False

    key = _derive_key(_keychain_password(profile.browser))
    cookies: list[Cookie] = []
    skipped = 0
    def _txt(b) -> str:
        if b is None:
            return ""
        if isinstance(b, bytes):
            return b.decode("utf-8", errors="replace")
        return str(b)

    try:
        conn = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True)
        # Arc and some Chrome forks declare encrypted_value as TEXT, not BLOB,
        # which makes sqlite3 try to UTF-8-decode the AES ciphertext and crash
        # mid-iteration. Force everything to bytes and decode TEXT columns
        # ourselves.
        conn.text_factory = bytes
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT host_key, name, value, encrypted_value, path, expires_utc, "
            "is_secure, is_httponly, samesite FROM cookies"
        )
        for row in rows:
            host = _txt(row["host_key"])
            if domain_filters and not _host_matches(host):
                continue
            value = _txt(row["value"])
            if not value and row["encrypted_value"]:
                value = _decrypt(row["encrypted_value"], key, host) or ""
                if not value:
                    skipped += 1
                    continue
            expires = 0.0
            if row["expires_utc"]:
                # Chromium epoch is 1601-01-01 in microseconds.
                expires = (row["expires_utc"] / 1_000_000) - 11644473600
            cookies.append(Cookie(
                name=_txt(row["name"]),
                value=value,
                domain=host,
                path=_txt(row["path"]) or "/",
                expires=expires,
                secure=bool(row["is_secure"]),
                http_only=bool(row["is_httponly"]),
                same_site=SAMESITE_MAP.get(row["samesite"], "Unspecified"),
            ))
        conn.close()
    finally:
        shutil.rmtree(tmp.parent, ignore_errors=True)

    log.info(
        "Read %d cookies from %s/%s (skipped %d undecryptable)",
        len(cookies), profile.browser, profile.name, skipped,
    )
    return cookies


def _ws_from_cdp_url(cdp_url: str) -> str:
    if cdp_url.startswith("ws://") or cdp_url.startswith("wss://"):
        return cdp_url
    if cdp_url.startswith("cdp://"):
        cdp_url = "http://" + cdp_url[len("cdp://"):]
    base = cdp_url.rstrip("/")
    with urllib.request.urlopen(f"{base}/json/version", timeout=5) as r:
        return json.loads(r.read())["webSocketDebuggerUrl"]


def inject_via_cdp(
    cookies: Iterable[Cookie],
    cdp_url: str = "http://127.0.0.1:9222",
) -> int:
    """Inject cookies into a running Chrome via CDP.

    Tries Storage.setCookies at the browser root first. If the browser has
    zero Page targets that command fails with "Browser context management is
    not supported" — in that case we fall back to opening a stub about:blank
    tab, attaching to it, and using Network.setCookies on that session.

    Args:
        cookies: iterable of Cookie objects.
        cdp_url: base http(s) URL of the Chrome DevTools endpoint, or a
                 cdp://host:port shorthand, or a raw ws:// URL.

    Returns: number of cookies actually accepted by Chrome.
    """
    from websocket import create_connection

    ws_url = _ws_from_cdp_url(cdp_url)
    # Chrome 111+ enforces CDP origin checking and rejects any Origin header
    # unless the target was launched with --remote-allow-origins. Suppressing
    # the header bypasses the check; localhost CDP is already privileged.
    ws = create_connection(ws_url, timeout=10, suppress_origin=True)
    msg_id = 0

    def _send(method, params=None, session_id=None):
        nonlocal msg_id
        msg_id += 1
        msg = {"id": msg_id, "method": method}
        if params:
            msg["params"] = params
        if session_id:
            msg["sessionId"] = session_id
        ws.send(json.dumps(msg))
        while True:
            resp = json.loads(ws.recv())
            if resp.get("id") == msg_id:
                return resp

    try:
        batch = []
        for c in cookies:
            param = {
                "name": c.name,
                "value": c.value,
                "domain": c.domain,
                "path": c.path or "/",
                "secure": c.secure,
                "httpOnly": c.http_only,
            }
            if c.same_site in ("Strict", "Lax", "None"):
                param["sameSite"] = c.same_site
            if c.expires > 0:
                param["expires"] = c.expires
            batch.append(param)
        if not batch:
            return 0

        # First: try Storage.setCookies at the browser root. Works when at
        # least one Page target exists (i.e. any tab is open).
        resp = _send("Storage.setCookies", {"cookies": batch})
        err = resp.get("error", {})
        if not err:
            log.info("Injected %d cookies via Storage.setCookies", len(batch))
            return len(batch)

        # Fallback: open a stub tab so the browser context is materialised,
        # then use Network.setCookies on its session.
        msg = err.get("message", "")
        if "Browser context management is not supported" not in msg:
            log.warning("Storage.setCookies failed: %s", err)
            return 0

        log.info("Storage.setCookies unavailable (no tabs); opening stub tab and retrying via Network.setCookies")
        target_id = None
        try:
            r = _send("Target.createTarget", {"url": "about:blank"})
            target_id = r.get("result", {}).get("targetId")
            if not target_id:
                log.warning("Couldn't create stub tab: %s", r)
                return 0
            r = _send("Target.attachToTarget", {"targetId": target_id, "flatten": True})
            session_id = r.get("result", {}).get("sessionId")
            if not session_id:
                log.warning("Couldn't attach to stub tab: %s", r)
                return 0
            r = _send("Network.setCookies", {"cookies": batch}, session_id=session_id)
            if r.get("error"):
                log.warning("Network.setCookies failed: %s", r["error"])
                return 0
            log.info("Injected %d cookies via Network.setCookies (per-tab fallback)", len(batch))
            return len(batch)
        finally:
            if target_id:
                try:
                    _send("Target.closeTarget", {"targetId": target_id})
                except Exception:
                    pass
    finally:
        ws.close()


# --- helpers used by CLI and external callers ---

def find_profile(spec: str) -> BrowserProfile:
    """Resolve a 'browser:profile-name' spec (e.g. 'chrome:Default') to a BrowserProfile."""
    if ":" in spec:
        browser, name = spec.split(":", 1)
    else:
        browser, name = spec, "Default"
    matches = [p for p in detect_browsers({browser}) if p.name == name]
    if not matches:
        available = [(p.browser, p.name) for p in detect_browsers({browser})]
        raise SystemExit(
            f"No profile {spec!r}. Available {browser} profiles: {available}"
        )
    return matches[0]


def _cli(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_browser_profile.cookies")
    sub = parser.add_subparsers(dest="cmd", required=True)

    cp = sub.add_parser("copy", help="copy cookies from a local profile into a running browser via CDP")
    cp.add_argument("--from", dest="src", required=True,
                    help="source profile, e.g. chrome:Default or arc:'Profile 1'")
    cp.add_argument("--to", dest="dst", required=True,
                    help="target CDP endpoint, e.g. cdp://127.0.0.1:9555 or http://127.0.0.1:9555")
    cp.add_argument("--domains", default=None,
                    help="comma-separated list of host_key substrings to include")
    cp.add_argument("-v", "--verbose", action="store_true")

    ls = sub.add_parser("list", help="list cookies in a local profile (counts only — no values printed)")
    ls.add_argument("--from", dest="src", required=True)
    ls.add_argument("--domains", default=None)

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if getattr(args, "verbose", False) else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    profile = find_profile(args.src)
    domain_filters = [d.strip() for d in args.domains.split(",")] if args.domains else None

    cookies = read_cookies(profile, domains=domain_filters)

    if args.cmd == "list":
        by_host: dict[str, int] = {}
        for c in cookies:
            by_host[c.domain] = by_host.get(c.domain, 0) + 1
        for host, n in sorted(by_host.items(), key=lambda kv: -kv[1]):
            print(f"  {n:4}  {host}")
        print(f"Total: {len(cookies)} cookies across {len(by_host)} hosts")
        return 0

    if args.cmd == "copy":
        n = inject_via_cdp(cookies, args.dst)
        print(f"Injected {n}/{len(cookies)} cookies into {args.dst}")
        return 0 if n > 0 else 2

    return 1


if __name__ == "__main__":
    sys.exit(_cli())
