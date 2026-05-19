"""Read IndexedDB from a Chromium browser profile and inject into another.

Sibling to cookies.py / localstorage.py. Many modern web apps (Linear, Figma,
Notion's offline mode, Slack web) store their auth/session state in
IndexedDB rather than cookies or localStorage, so syncing cookies alone is
not enough to "log in" the destination Chrome. This module fills that gap:
it reads structured records from the source profile's IndexedDB LevelDB
store (via ccl_chromium_reader), then re-creates them in the destination
Chrome via CDP Runtime.evaluate using the standard IndexedDB JS API.

Public API:
    read_indexeddb(profile, origins=None)            -> dict[origin, list[DbDump]]
    inject_indexeddb_via_cdp(data, cdp_url, ...)     -> (injected, total)

CLI:
    python -m ai_browser_profile.indexeddb copy \\
        --from arc:Default \\
        --to cdp://127.0.0.1:9655 \\
        --origins linear.app,figma.com

Like cookies.py / localstorage.py, this module is NOT wired into
extract_memories() — IndexedDB values frequently contain auth secrets and
must never land in memories.db.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

from ai_browser_profile.ingestors.browser_detect import BrowserProfile, detect_browsers

log = logging.getLogger(__name__)


# --- IDB record reading from on-disk LevelDB ---------------------------------


@dataclass
class IdbRecord:
    key: Any   # JSON-safe Python value (str/int/float/None/list/dict)
    value: Any # JSON-safe Python value


@dataclass
class IdbDbDump:
    name: str          # e.g. "linear-schema"
    origin: str        # e.g. "https://linear.app"
    stores: dict[str, list[IdbRecord]]  # store_name -> records


def _serialize_value(val: Any, depth: int = 0) -> Any:
    """Convert a ccl IndexedDB value to a JSON-safe Python structure.

    Mirrors the helper in ingestors/indexeddb.py but is duplicated here to
    keep this module self-contained (it ships independently of the ingestor
    pipeline).
    """
    if depth > 30:
        return None
    if val is None:
        return None
    if isinstance(val, (bool, int, float, str)):
        return val
    if isinstance(val, bytes):
        # Best-effort decode; binary auth blobs are rare in IDB but possible.
        try:
            return val.decode("utf-8")
        except UnicodeDecodeError:
            return None
    if isinstance(val, dict):
        return {str(k): _serialize_value(v, depth + 1) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [_serialize_value(v, depth + 1) for v in val]
    if hasattr(val, "value"):
        return _serialize_value(val.value, depth + 1)
    # Fallback: stringify unknown custom types (Date, Blob refs, etc.).
    return str(val)


def _extract_idb_key(key: Any) -> Any:
    """Extract a JSON-safe key from a ccl IdbKey.

    ccl's IdbKey instances render their value via repr like
    "<IdbKey linear_9bb29732457ddb5aa4b71132af9e8b43>". We unwrap that. For
    proper structured key access we use the documented attrs when present.
    """
    # ccl IdbKey commonly exposes .value or .raw_value. Probe both.
    for attr in ("raw_value", "value", "_value"):
        if hasattr(key, attr):
            v = getattr(key, attr)
            return _serialize_value(v)
    s = str(key)
    if s.startswith("<IdbKey ") and s.endswith(">"):
        s = s[len("<IdbKey "):-1]
    # Try numeric first (UUID and string keys remain str)
    try:
        if "." in s:
            return float(s)
        return int(s)
    except (TypeError, ValueError):
        return s


def _copy_dir(src: Path) -> Path:
    """Snapshot a LevelDB directory into a temp location.

    LevelDB doesn't tolerate concurrent readers when the owning Chrome has
    an exclusive lock on it, and we want a stable snapshot even if Chrome
    later writes. Copy first, read second.
    """
    tmp = Path(tempfile.mkdtemp(prefix="ai_browser_profile_idb_"))
    dst = tmp / src.name
    shutil.copytree(src, dst)
    return dst


def _idb_dir_to_origin(name: str) -> Optional[str]:
    """Map a Chromium IndexedDB directory name back to an origin string.

    Chrome encodes the origin in the dir name, e.g.
    'https_linear.app_0.indexeddb.leveldb' -> 'https://linear.app' (port omitted
    when default for the scheme).
    """
    base = name
    for suffix in (".indexeddb.leveldb", ".indexeddb.blob"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    # Format: <scheme>_<host>_<port>
    parts = base.rsplit("_", 1)
    if len(parts) != 2 or not parts[1].isdigit():
        return None
    head, port = parts
    scheme_parts = head.split("_", 1)
    if len(scheme_parts) != 2:
        return None
    scheme, host = scheme_parts
    if (scheme == "https" and port == "0") or (scheme == "http" and port == "0"):
        return f"{scheme}://{host}"
    return f"{scheme}://{host}:{port}"


def read_indexeddb(
    profile: BrowserProfile,
    origins: Optional[Iterable[str]] = None,
) -> dict[str, list[IdbDbDump]]:
    """Read IndexedDB databases from a Chromium profile.

    Args:
        profile: source BrowserProfile (must be Chromium-family)
        origins: optional list of host substrings to keep (e.g. "linear.app").
                 Matched against the host portion of the encoded origin.

    Returns:
        Mapping of origin URL -> list of IdbDbDump.
    """
    from ccl_chromium_reader import ccl_chromium_indexeddb

    if profile.browser in ("safari", "firefox"):
        log.warning("IndexedDB sync only supports Chromium browsers; got %s", profile.browser)
        return {}

    idb_root = profile.path / "IndexedDB"
    if not idb_root.exists():
        log.warning("No IndexedDB dir at %s", idb_root)
        return {}

    origin_filter: Optional[list[str]] = (
        [o.strip() for o in origins if o and o.strip()] if origins else None
    )

    def _host_matches(origin: str) -> bool:
        # Domain-suffix match: filter 'x.com' matches 'x.com' and
        # 'api.x.com' but NOT 'fedex.com' / 'swiftpackageindex.com'.
        h = origin or ""
        if "://" in h:
            h = h.split("://", 1)[1]
        h = h.split("/", 1)[0].split(":", 1)[0].lstrip(".").lower()
        for f in (origin_filter or []):
            ff = (f or "").strip().lstrip(".").lower()
            if not ff:
                continue
            if h == ff or h.endswith("." + ff):
                return True
        return False

    # Defaults to skip even when no explicit filter is given:
    #   chrome-extension://  — extensions, not portable across browsers
    #   localhost / 127.*    — dev servers, irrelevant across machines
    #   file://              — local file URLs
    SKIP_PREFIXES = (
        "chrome-extension://",
        "http://localhost",
        "https://localhost",
        "http://127.",
        "https://127.",
        "file://",
    )
    # Skip pathologically large origins by default (e.g. kapwing video editor
    # which stores 2 GB of project blobs). Caller can still ask for them
    # explicitly via origin_filter.
    MAX_LEVELDB_BYTES = 200 * 1024 * 1024  # 200 MB

    def _dir_size(p) -> int:
        try:
            return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
        except Exception:
            return 0

    out: dict[str, list[IdbDbDump]] = {}
    skipped_dbs = 0
    skipped_origins = 0

    for leveldb_dir in sorted(idb_root.glob("*.indexeddb.leveldb")):
        origin = _idb_dir_to_origin(leveldb_dir.name)
        if origin is None:
            continue
        if origin_filter:
            if not _host_matches(origin):
                continue
        else:
            # No explicit filter — apply default safety skips.
            if any(origin.startswith(p) for p in SKIP_PREFIXES):
                skipped_origins += 1
                continue
            size = _dir_size(leveldb_dir)
            if size > MAX_LEVELDB_BYTES:
                log.info("skipping oversized IndexedDB %s (%.1f MB)", origin, size/1024/1024)
                skipped_origins += 1
                continue

        blob_dir = leveldb_dir.parent / leveldb_dir.name.replace(".leveldb", ".blob")

        tmp_db = _copy_dir(leveldb_dir)
        tmp_blob = _copy_dir(blob_dir) if blob_dir.exists() else None

        try:
            wrapper = ccl_chromium_indexeddb.WrappedIndexDB(
                str(tmp_db),
                str(tmp_blob) if tmp_blob else None,
            )

            origin_dumps: list[IdbDbDump] = []
            for db_id in wrapper.database_ids:
                try:
                    db = wrapper[db_id.name, db_id.origin]
                except Exception as e:
                    log.debug("Skipping db %r (%s): %s", db_id.name, db_id.origin, e)
                    skipped_dbs += 1
                    continue

                stores: dict[str, list[IdbRecord]] = {}
                store_names = list(db.object_store_names)
                for sn in store_names:
                    try:
                        store = db.get_object_store_by_name(sn)
                    except Exception:
                        continue
                    recs: list[IdbRecord] = []
                    try:
                        for rec in store.iterate_records():
                            try:
                                val = _serialize_value(getattr(rec, "value", None))
                                if val is None:
                                    # Tombstones (deletions) — skip
                                    continue
                                key = _extract_idb_key(getattr(rec, "key", None))
                                recs.append(IdbRecord(key=key, value=val))
                            except Exception:
                                continue
                    except Exception as e:
                        # Some stores have ccl-unsupported value formats;
                        # log and continue rather than aborting the whole DB.
                        log.debug("Store %r/%r read failed: %s", db_id.name, sn, e)
                        continue
                    if recs:
                        stores[sn] = recs

                if stores:
                    origin_dumps.append(IdbDbDump(name=db_id.name, origin=origin, stores=stores))

            if origin_dumps:
                out.setdefault(origin, []).extend(origin_dumps)
        except Exception as e:
            log.warning("Failed to open %s: %s", leveldb_dir, e)
        finally:
            shutil.rmtree(tmp_db.parent, ignore_errors=True)
            if tmp_blob:
                shutil.rmtree(tmp_blob.parent, ignore_errors=True)

    total_dbs = sum(len(v) for v in out.values())
    total_records = sum(
        sum(len(recs) for recs in db.stores.values())
        for dbs in out.values() for db in dbs
    )
    log.info(
        "Read %d IndexedDB records across %d databases / %d origins from %s/%s (skipped %d undecryptable dbs)",
        total_records, total_dbs, len(out), profile.browser, profile.name, skipped_dbs,
    )
    return out


# --- CDP injection -----------------------------------------------------------


# JS that runs inside the destination Chrome's page context (same-origin tab)
# and replays the records into IndexedDB via the standard JS API. Returns a
# JSON-able report with per-db success/error counts.
_INJECT_JS = r"""
(async () => {
  const payload = __PAYLOAD__;  // { dbs: [ { name, stores: { storeName: [ {key, value}, ... ] } } ] }
  const summary = [];

  for (const dbDump of payload.dbs) {
    const storeNames = Object.keys(dbDump.stores);
    let opened, openErr = null;

    // Step 1: open (creating stores if missing). We force a version bump only
    // when stores are missing — otherwise we open the current version.
    try {
      opened = await new Promise((resolve, reject) => {
        const tryOpen = (forceVersion) => {
          const req = forceVersion
            ? indexedDB.open(dbDump.name, forceVersion)
            : indexedDB.open(dbDump.name);
          let didUpgrade = false;
          req.onupgradeneeded = (e) => {
            didUpgrade = true;
            const d = e.target.result;
            for (const sn of storeNames) {
              if (!d.objectStoreNames.contains(sn)) {
                // We don't know the original keyPath/autoIncrement reliably
                // from ccl; use out-of-line keys (no keyPath) so we can always
                // pass an explicit key on store.put(). Apps that auto-resolve
                // by `id` field still work because the value object usually
                // contains an `id` matching the key.
                try { d.createObjectStore(sn); } catch (err) { /* ignore */ }
              }
            }
          };
          req.onsuccess = (e) => {
            const d = e.target.result;
            // If all our stores already exist, we're done.
            let missing = storeNames.filter(n => !d.objectStoreNames.contains(n));
            if (missing.length === 0 || forceVersion) {
              resolve(d);
            } else {
              const next = (d.version || 1) + 1;
              d.close();
              tryOpen(next);
            }
          };
          req.onerror = () => reject(req.error || new Error("open failed"));
          req.onblocked = () => reject(new Error("open blocked"));
        };
        tryOpen(undefined);
      });
    } catch (e) {
      openErr = String(e && e.message ? e.message : e);
      summary.push({ db: dbDump.name, opened: false, error: openErr, written: 0, errored: 0 });
      continue;
    }

    // Step 2: write records into each existing store. We use a separate
    // transaction per store so a failure in one doesn't abort the rest.
    let totalWritten = 0, totalErrored = 0;
    for (const sn of storeNames) {
      if (!opened.objectStoreNames.contains(sn)) {
        totalErrored += dbDump.stores[sn].length;
        continue;
      }
      const recs = dbDump.stores[sn];
      if (!recs.length) continue;
      const txResult = await new Promise((resolve) => {
        let tx;
        try { tx = opened.transaction(sn, "readwrite"); }
        catch (e) { resolve({ written: 0, errored: recs.length, fatal: String(e) }); return; }
        const store = tx.objectStore(sn);
        let written = 0, errored = 0;
        tx.oncomplete = () => resolve({ written, errored });
        tx.onerror = () => resolve({ written, errored: errored + (recs.length - written) });
        tx.onabort = () => resolve({ written, errored: errored + (recs.length - written) });
        for (const rec of recs) {
          try {
            // Try out-of-line put first (we created the store without keyPath).
            // If the *existing* store has a keyPath, this throws DataError,
            // and we fall back to an in-line put (key embedded in value).
            try {
              if (rec.key !== null && rec.key !== undefined) {
                store.put(rec.value, rec.key);
              } else {
                store.put(rec.value);
              }
            } catch (eOut) {
              // keyPath store — try without explicit key
              try { store.put(rec.value); }
              catch (eIn) { errored += 1; continue; }
            }
            written += 1;
          } catch (e) {
            errored += 1;
          }
        }
      });
      totalWritten += txResult.written;
      totalErrored += txResult.errored;
    }
    opened.close();
    summary.push({ db: dbDump.name, opened: true, written: totalWritten, errored: totalErrored });
  }

  return JSON.stringify({ summary });
})()
"""


def _ws_from_cdp_url(cdp_url: str) -> str:
    """Resolve a CDP HTTP base URL (or cdp:// shorthand) to the browser-target WebSocket URL."""
    import urllib.request

    if cdp_url.startswith("cdp://"):
        cdp_url = "http://" + cdp_url[len("cdp://"):]
    base = cdp_url.rstrip("/")
    info = json.loads(urllib.request.urlopen(f"{base}/json/version", timeout=5).read())
    return info["webSocketDebuggerUrl"]


def _cdp_send(ws, msg_id: int, method: str,
              params: Optional[dict] = None,
              session_id: Optional[str] = None) -> dict:
    msg: dict = {"id": msg_id, "method": method}
    if params:
        msg["params"] = params
    if session_id:
        msg["sessionId"] = session_id
    ws.send(json.dumps(msg))
    deadline = time.time() + 30
    while time.time() < deadline:
        resp = json.loads(ws.recv())
        if resp.get("id") == msg_id:
            return resp
    raise TimeoutError(f"CDP {method} timed out")


def inject_indexeddb_via_cdp(
    data: dict[str, list[IdbDbDump]],
    cdp_url: str = "http://127.0.0.1:9655",
    load_wait_sec: float = 4.0,
) -> tuple[int, int]:
    """Inject IndexedDB records into a running Chrome via a single reused tab.

    Returns (written, total). Opens ONE tab at the start, hides it off-screen,
    then navigates that same tab through each origin in sequence. For each
    origin: navigate, wait for bootstrap, run a single Runtime.evaluate that
    replays the IDB records via the standard JS API. Closes the tab at end.

    This replaces the previous pattern of opening one visible tab per origin
    (which produced a flood of tab open/close churn when many domains were in
    the import list).
    """
    from websocket import create_connection

    ws_url = _ws_from_cdp_url(cdp_url)
    ws = create_connection(ws_url, timeout=20, suppress_origin=True)
    msg_id = 0
    total_records = 0
    total_written = 0
    target_id: Optional[str] = None
    session_id: Optional[str] = None

    try:
        # Open ONE reusable tab. We start at about:blank and navigate it
        # per origin below; reusing the tab is what eliminates the visible
        # "open a tab per origin" UX issue when many domains are in scope.
        msg_id += 1
        r = _cdp_send(ws, msg_id, "Target.createTarget", {"url": "about:blank"})
        target_id = r.get("result", {}).get("targetId")
        if not target_id:
            log.warning("createTarget(about:blank) failed: %s", r.get("error"))
            return 0, 0

        msg_id += 1
        r = _cdp_send(ws, msg_id, "Target.attachToTarget",
                      {"targetId": target_id, "flatten": True})
        session_id = r.get("result", {}).get("sessionId")
        if not session_id:
            log.warning("attachToTarget(about:blank) failed: %s", r.get("error"))
            return 0, 0

        # Minimize the tab's window so the user doesn't see it bounce through
        # every origin. Off-screen positioning gets clamped to the nearest
        # display on macOS, so minimize is the only reliable hide.
        try:
            msg_id += 1
            w = _cdp_send(ws, msg_id, "Browser.getWindowForTarget",
                          {"targetId": target_id})
            window_id = w.get("result", {}).get("windowId")
            if window_id:
                msg_id += 1
                _cdp_send(ws, msg_id, "Browser.setWindowBounds", {
                    "windowId": window_id,
                    "bounds": {"windowState": "minimized"},
                })
        except Exception as e:
            log.debug("Could not minimize import window: %s", e)

        for origin, dumps in data.items():
            if not dumps:
                continue
            if not origin.startswith("http"):
                log.warning("Skipping non-http origin %r", origin)
                continue
            if "^" in origin:
                log.info("Skipping partitioned origin %r", origin)
                continue

            origin_total = sum(
                sum(len(recs) for recs in db.stores.values()) for db in dumps
            )
            total_records += origin_total

            url = origin.rstrip("/") + "/"

            # Navigate the SAME tab to this origin. No new tab is created.
            msg_id += 1
            nav = _cdp_send(ws, msg_id, "Page.navigate", {"url": url},
                            session_id=session_id)
            err = nav.get("result", {}).get("errorText") or nav.get("error")
            if err:
                log.warning("  %s: navigate failed (%s)", origin, err)
                continue

            # Let the destination site finish its initial bootstrap (it may
            # create its own IDB schema with the canonical keyPath/version;
            # we then add to it).
            time.sleep(load_wait_sec)

            # Serialize the data to JSON and inline into the JS expression.
            # Records can be large; CDP accepts multi-MB expressions.
            payload = {
                "dbs": [
                    {
                        "name": db.name,
                        "stores": {
                            sn: [{"key": r.key, "value": r.value} for r in recs]
                            for sn, recs in db.stores.items()
                        },
                    }
                    for db in dumps
                ]
            }
            expression = _INJECT_JS.replace("__PAYLOAD__", json.dumps(payload))

            msg_id += 1
            r = _cdp_send(
                ws, msg_id, "Runtime.evaluate",
                {
                    "expression": expression,
                    "awaitPromise": True,
                    "returnByValue": True,
                    "timeout": 60000,
                },
                session_id=session_id,
            )
            result = r.get("result", {}).get("result", {})
            exc = r.get("result", {}).get("exceptionDetails")
            if exc:
                log.warning("  %s: JS error %s", origin, exc.get("text") or exc)
                continue
            value = result.get("value")
            try:
                summary = json.loads(value).get("summary", []) if isinstance(value, str) else []
            except Exception:
                summary = []
            origin_written = 0
            for s in summary:
                if s.get("opened"):
                    origin_written += s.get("written", 0)
                    if s.get("errored"):
                        log.warning("  %s/%s: %d errored", origin, s.get("db"), s.get("errored"))
                else:
                    log.warning("  %s/%s: open failed (%s)", origin, s.get("db"), s.get("error"))
            total_written += origin_written
            log.info("  %s: wrote %d/%d records", origin, origin_written, origin_total)
    finally:
        if target_id:
            try:
                msg_id += 1
                _cdp_send(ws, msg_id, "Target.closeTarget", {"targetId": target_id})
            except Exception:
                pass
        ws.close()

    log.info("Injected %d/%d IndexedDB records total", total_written, total_records)
    return total_written, total_records


# --- CLI ---------------------------------------------------------------------


def _find_profile(spec: str) -> BrowserProfile:
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
    parser = argparse.ArgumentParser(prog="python -m ai_browser_profile.indexeddb")
    sub = parser.add_subparsers(dest="cmd", required=True)

    cp = sub.add_parser("copy", help="copy IndexedDB databases from a local profile into a running browser via CDP")
    cp.add_argument("--from", dest="src", required=True,
                    help="source profile, e.g. arc:Default or 'chrome:Profile 1'")
    cp.add_argument("--to", dest="dst", required=True,
                    help="target CDP endpoint, e.g. cdp://127.0.0.1:9655 or http://127.0.0.1:9655")
    cp.add_argument("--origins", default=None,
                    help="comma-separated host substrings (e.g. 'linear.app,figma.com')")
    cp.add_argument("--load-wait", type=float, default=4.0,
                    help="seconds to wait after opening each tab before injecting (default 4)")
    cp.add_argument("-v", "--verbose", action="store_true")

    ls = sub.add_parser("list", help="list IndexedDB databases in a local profile (counts only)")
    ls.add_argument("--from", dest="src", required=True)
    ls.add_argument("--origins", default=None)

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if getattr(args, "verbose", False) else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    profile = _find_profile(args.src)
    origin_filters = [o.strip() for o in args.origins.split(",")] if args.origins else None

    data = read_indexeddb(profile, origins=origin_filters)

    if args.cmd == "list":
        for origin, dumps in sorted(data.items()):
            total = sum(sum(len(r) for r in d.stores.values()) for d in dumps)
            print(f"  {total:5}  {origin}  ({len(dumps)} db)")
            for d in dumps:
                store_summaries = ", ".join(
                    f"{sn}={len(recs)}" for sn, recs in d.stores.items()
                )
                print(f"           db={d.name!r}  stores: {store_summaries}")
        total_all = sum(
            sum(sum(len(r) for r in d.stores.values()) for d in dumps)
            for dumps in data.values()
        )
        print(f"Total: {total_all} records across {sum(len(v) for v in data.values())} databases / {len(data)} origins")
        return 0

    if args.cmd == "copy":
        written, total = inject_indexeddb_via_cdp(data, args.dst, load_wait_sec=args.load_wait)
        print(f"Injected {written}/{total} IndexedDB records into {args.dst}")
        return 0 if written > 0 else 2

    return 1


if __name__ == "__main__":
    sys.exit(_cli())
