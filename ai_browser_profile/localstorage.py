"""Read localStorage from a Chromium browser profile and inject into another.

Sibling to cookies.py. Like cookies.py, this is NOT wired into
extract_memories() — localStorage values can include auth tokens and
must not land in memories.db.

Public API:
    read_localstorage(profile, origins=None)            -> dict[origin, dict[key, value]]
    inject_localstorage_via_cdp(data, cdp_url, ...)     -> int

CLI:
    python -m ai_browser_profile.localstorage copy \\
        --from chrome:Profile\\ 1 \\
        --to cdp://127.0.0.1:9555 \\
        --origins chatgpt.com,notion.so
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Iterable, Optional

from ai_browser_profile.ingestors.browser_detect import BrowserProfile
from ai_browser_profile.cookies import _ws_from_cdp_url, find_profile

log = logging.getLogger(__name__)


def read_localstorage(
    profile: BrowserProfile,
    origins: Optional[Iterable[str]] = None,
) -> dict[str, dict[str, str]]:
    """Read localStorage from a Chromium profile's LevelDB.

    Args:
        profile: Chromium profile from detect_browsers().
        origins: Optional iterable of substrings; an origin is kept if any
                 substring matches its storage_key (e.g. 'chatgpt.com'
                 matches 'https://chatgpt.com'). None = all origins.

    Returns: dict mapping origin (e.g. 'https://chatgpt.com') to dict of key/value.
    """
    if profile.browser in ("safari", "firefox"):
        raise NotImplementedError(f"localStorage read not supported for {profile.browser}")

    ls_dir = profile.path / "Local Storage" / "leveldb"
    if not ls_dir.exists():
        raise FileNotFoundError(f"No Local Storage/leveldb at {ls_dir}")

    tmp = Path(tempfile.mkdtemp(prefix="ai_browser_profile_ls_"))
    tmp_ls = tmp / "leveldb"
    try:
        shutil.copytree(ls_dir, tmp_ls)
    except Exception as e:
        shutil.rmtree(tmp, ignore_errors=True)
        raise RuntimeError(f"Could not copy {ls_dir}: {e}") from e

    origin_filters = list(origins) if origins else None
    out: dict[str, dict[str, str]] = {}
    skipped = 0

    try:
        from ccl_chromium_reader import ccl_chromium_localstorage

        ldb = ccl_chromium_localstorage.LocalStoreDb(tmp_ls)
        for record in ldb.iter_all_records():
            try:
                origin = record.storage_key or ""
                key = record.script_key or ""
                value = record.value
                if not origin or not key or value is None:
                    continue
                if origin_filters and not any(f in origin for f in origin_filters):
                    continue
                if isinstance(value, bytes):
                    try:
                        value = value.decode("utf-8")
                    except UnicodeDecodeError:
                        skipped += 1
                        continue
                elif not isinstance(value, str):
                    value = str(value)
                out.setdefault(origin, {})[key] = value
            except Exception:
                skipped += 1
                continue
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    total = sum(len(v) for v in out.values())
    log.info(
        "Read %d localStorage items across %d origins from %s/%s (skipped %d)",
        total, len(out), profile.browser, profile.name, skipped,
    )
    return out


def _cdp_send(ws, msg_id: int, method: str,
              params: Optional[dict] = None,
              session_id: Optional[str] = None) -> dict:
    """Send a CDP message and drain events until the matching reply arrives."""
    msg: dict = {"id": msg_id, "method": method}
    if params:
        msg["params"] = params
    if session_id:
        msg["sessionId"] = session_id
    ws.send(json.dumps(msg))
    deadline = time.time() + 20
    while time.time() < deadline:
        resp = json.loads(ws.recv())
        if resp.get("id") == msg_id:
            return resp
    raise TimeoutError(f"CDP {method} timed out")


def inject_localstorage_via_cdp(
    data: dict[str, dict[str, str]],
    cdp_url: str = "http://127.0.0.1:9222",
    load_wait_sec: float = 4.0,
) -> int:
    """Inject localStorage into a running Chrome via per-origin tabs.

    For each origin: opens a new tab to that origin (so the JS context is
    same-origin), waits for load, evaluates a localStorage.setItem batch via
    Runtime.evaluate, then closes the tab. Returns total items written.

    Args:
        data: dict of {origin -> {key: value}}. Origin must be http(s)://...
        cdp_url: base http(s) URL of the Chrome DevTools endpoint or a
                 cdp://host:port shorthand.
        load_wait_sec: how long to wait between tab open and the JS eval to
                       let the page initialize (no Page.loadEventFired listener
                       yet — keep simple, race-tolerant via the JS try/catch).
    """
    from websocket import create_connection

    ws_url = _ws_from_cdp_url(cdp_url)
    ws = create_connection(ws_url, timeout=15, suppress_origin=True)
    msg_id = 0
    total_set = 0

    try:
        for origin, items in data.items():
            if not items:
                continue
            if not origin.startswith("http"):
                log.warning("Skipping non-http origin %r", origin)
                continue
            url = origin.rstrip("/") + "/"

            target_id = None
            try:
                msg_id += 1
                r = _cdp_send(ws, msg_id, "Target.createTarget", {"url": url})
                target_id = r.get("result", {}).get("targetId")
                if not target_id:
                    log.warning("createTarget failed for %s: %s", origin, r.get("error"))
                    continue

                msg_id += 1
                r = _cdp_send(ws, msg_id, "Target.attachToTarget",
                              {"targetId": target_id, "flatten": True})
                session_id = r.get("result", {}).get("sessionId")
                if not session_id:
                    log.warning("attachToTarget failed for %s", origin)
                    continue

                time.sleep(load_wait_sec)

                # Inline the items as a JS object literal; localStorage rejects
                # non-string values implicitly by coercion (we already string-
                # coerced in read_localstorage).
                expr = (
                    "(function(){try{var items=" + json.dumps(items) + ";"
                    "var n=0;for(var k in items){try{localStorage.setItem(k,items[k]);n++;}catch(e){}}"
                    "return n;}catch(e){return 'ERROR:'+e.toString();}})()"
                )
                msg_id += 1
                r = _cdp_send(
                    ws, msg_id, "Runtime.evaluate",
                    {"expression": expr, "returnByValue": True},
                    session_id=session_id,
                )
                value = r.get("result", {}).get("result", {}).get("value")
                if isinstance(value, int):
                    total_set += value
                    log.info("  %s: set %d/%d items", origin, value, len(items))
                else:
                    log.warning("  %s: %s", origin, value)
            finally:
                if target_id:
                    try:
                        msg_id += 1
                        _cdp_send(ws, msg_id, "Target.closeTarget", {"targetId": target_id})
                    except Exception:
                        pass
    finally:
        ws.close()

    log.info("Injected %d localStorage items total", total_set)
    return total_set


def _cli(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_browser_profile.localstorage")
    sub = parser.add_subparsers(dest="cmd", required=True)

    cp = sub.add_parser("copy", help="copy localStorage from a local profile into a running browser via CDP")
    cp.add_argument("--from", dest="src", required=True,
                    help="source profile, e.g. chrome:Default or 'chrome:Profile 1'")
    cp.add_argument("--to", dest="dst", required=True,
                    help="target CDP endpoint, e.g. cdp://127.0.0.1:9555")
    cp.add_argument("--origins", default=None,
                    help="comma-separated host substrings (e.g. 'chatgpt.com,notion.so')")
    cp.add_argument("--load-wait", type=float, default=4.0,
                    help="seconds to wait after opening each tab before injecting (default 4)")
    cp.add_argument("-v", "--verbose", action="store_true")

    ls = sub.add_parser("list", help="list localStorage origins (counts only — no values printed)")
    ls.add_argument("--from", dest="src", required=True)
    ls.add_argument("--origins", default=None)

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if getattr(args, "verbose", False) else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    profile = find_profile(args.src)
    origin_filters = [o.strip() for o in args.origins.split(",")] if args.origins else None

    data = read_localstorage(profile, origins=origin_filters)

    if args.cmd == "list":
        for origin, items in sorted(data.items(), key=lambda kv: -len(kv[1])):
            print(f"  {len(items):4}  {origin}")
        total = sum(len(v) for v in data.values())
        print(f"Total: {total} items across {len(data)} origins")
        return 0

    if args.cmd == "copy":
        n = inject_localstorage_via_cdp(data, args.dst, load_wait_sec=args.load_wait)
        total = sum(len(v) for v in data.values())
        print(f"Injected {n}/{total} localStorage items into {args.dst}")
        return 0 if n > 0 else 2

    return 1


if __name__ == "__main__":
    sys.exit(_cli())
