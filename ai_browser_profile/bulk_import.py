"""Zero-tab bulk import: cookies via CDP, localStorage + IndexedDB via file copy.

The CDP-injection paths in cookies.py / localstorage.py / indexeddb.py require
opening at least one tab and (for LS / IDB) navigating it through every origin.
That's slow with hundreds of origins and produces a visible window in the dock.

This module sidesteps that by:
  1. Injecting cookies via CDP while the destination Chrome is running
     (cookies don't need a page context).
  2. Stopping the destination Chrome.
  3. Copying source profile's `Local Storage/leveldb/` directory over the
     destination profile's (replace, not merge — destination's LS is owned by
     the agent's own browsing so far and isn't precious).
  4. Copying each origin's `IndexedDB/<host>.indexeddb.leveldb/` (+ matching
     `.blob/`) directory from source to destination (per-origin replace,
     skipping chrome-extension://, localhost, partitioned ^ origins, and
     anything over MAX_LEVELDB_BYTES).
  5. Restarting destination Chrome.

CLI:
    python -m ai_browser_profile.bulk_import \\
        --from arc:Default \\
        --bh-python /path/to/browser-harness/.venv/bin/python3 \\
        --bh-server /path/to/browser-harness/server.py
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

from ai_browser_profile.cookies import find_profile, read_cookies, inject_via_cdp

log = logging.getLogger(__name__)


# Default safety filters for whole-profile copy.
SKIP_PREFIXES = (
    "chrome-extension_",
    "http_localhost",
    "https_localhost",
    "http_127.",
    "https_127.",
    "file_",
)
MAX_LEVELDB_BYTES = 200 * 1024 * 1024  # 200 MB — skip kapwing-style 2 GB blobs


def _dir_size(p: Path) -> int:
    try:
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
    except Exception:
        return 0


def _run_bh(bh_python: str, bh_server: str, fn_name: str) -> dict:
    """Call a top-level function in the browser-harness server.py (ensure_chrome /
    stop_chrome) via subprocess and return its JSON return value."""
    py_code = (
        "import importlib.util, json, sys\n"
        f"spec = importlib.util.spec_from_file_location('bh_server', r'{bh_server}')\n"
        "mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)\n"
        f"print(json.dumps(mod.{fn_name}()))\n"
    )
    proc = subprocess.run(
        [bh_python, "-c", py_code],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode != 0:
        log.warning("bh %s failed rc=%d stderr=%s", fn_name, proc.returncode, proc.stderr[:500])
        return {"status": "error", "stderr": proc.stderr[:500]}
    out = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "{}"
    try:
        return json.loads(out)
    except Exception:
        return {"status": "parse_error", "raw": out[:500]}


def _dest_profile_dir(bh_python: str, bh_server: str) -> Path:
    """Resolve the destination Chrome's user-data-dir from the bundled server.py."""
    py_code = (
        "import importlib.util\n"
        f"spec = importlib.util.spec_from_file_location('bh_server', r'{bh_server}')\n"
        "mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)\n"
        "print(str(mod.PROFILE_DIR))\n"
    )
    proc = subprocess.run(
        [bh_python, "-c", py_code],
        capture_output=True, text=True, timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"could not resolve PROFILE_DIR: {proc.stderr[:500]}")
    return Path(proc.stdout.strip().splitlines()[-1])


def _copy_localstorage(src_profile: Path, dst_profile: Path) -> tuple[int, int]:
    """Replace destination's Local Storage/leveldb with source's. Returns
    (files_copied, bytes_copied). Chrome MUST be stopped first."""
    src_ls = src_profile / "Local Storage" / "leveldb"
    if not src_ls.exists():
        log.warning("source has no Local Storage/leveldb")
        return 0, 0
    dst_ls = dst_profile / "Local Storage" / "leveldb"
    if dst_ls.exists():
        shutil.rmtree(dst_ls)
    dst_ls.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_ls, dst_ls)
    files = sum(1 for _ in dst_ls.rglob("*") if _.is_file())
    nbytes = _dir_size(dst_ls)
    log.info("localStorage: copied %d files (%.1f MB) %s -> %s",
             files, nbytes / 1024 / 1024, src_ls, dst_ls)
    return files, nbytes


def _copy_indexeddb(src_profile: Path, dst_profile: Path) -> tuple[int, int, int]:
    """Copy per-origin IndexedDB dirs from source to destination, skipping
    extension / localhost / partitioned / oversized. Returns
    (origins_copied, origins_skipped, total_bytes). Chrome MUST be stopped."""
    src_idb = src_profile / "IndexedDB"
    if not src_idb.exists():
        log.warning("source has no IndexedDB dir")
        return 0, 0, 0
    dst_idb = dst_profile / "IndexedDB"
    dst_idb.mkdir(parents=True, exist_ok=True)

    copied = skipped = total_bytes = 0
    for leveldb_dir in sorted(src_idb.glob("*.indexeddb.leveldb")):
        name = leveldb_dir.name
        if any(name.startswith(p) for p in SKIP_PREFIXES):
            skipped += 1
            continue
        # Partitioned-storage marker (third-party storage). Dir name contains '^'.
        if "^" in name:
            skipped += 1
            continue
        size = _dir_size(leveldb_dir)
        if size > MAX_LEVELDB_BYTES:
            log.info("idb: skipping oversized %s (%.1f MB)", name, size / 1024 / 1024)
            skipped += 1
            continue

        dst_leveldb = dst_idb / name
        if dst_leveldb.exists():
            shutil.rmtree(dst_leveldb)
        shutil.copytree(leveldb_dir, dst_leveldb)

        blob_name = name.replace(".leveldb", ".blob")
        src_blob = src_idb / blob_name
        if src_blob.exists():
            dst_blob = dst_idb / blob_name
            if dst_blob.exists():
                shutil.rmtree(dst_blob)
            shutil.copytree(src_blob, dst_blob)
            total_bytes += _dir_size(dst_blob)

        total_bytes += size
        copied += 1

    log.info("IndexedDB: copied %d origins, skipped %d, %.1f MB total",
             copied, skipped, total_bytes / 1024 / 1024)
    return copied, skipped, total_bytes


def bulk_import(
    source_spec: str,
    bh_python: str,
    bh_server: str,
    cdp_url: str = "http://127.0.0.1:9655",
) -> dict:
    """End-to-end zero-tab import. Returns summary dict."""
    summary: dict = {
        "source": source_spec,
        "cookies": {},
        "localstorage": {},
        "indexeddb": {},
        "errors": [],
    }

    # Resolve source profile
    src_profile = find_profile(source_spec)
    log.info("source profile: %s/%s at %s",
             src_profile.browser, src_profile.name, src_profile.path)

    # Resolve destination profile dir from bundled server.py
    dst_profile = _dest_profile_dir(bh_python, bh_server)
    log.info("destination profile: %s", dst_profile)

    # Step 1: ensure dest Chrome is running, then inject cookies via CDP
    log.info("step 1/5: ensure destination Chrome running (for cookie CDP)")
    started = _run_bh(bh_python, bh_server, "ensure_chrome")
    log.info("  ensure_chrome -> %s", started.get("status"))
    if started.get("status") in ("error", "launch_timeout", "parse_error"):
        summary["errors"].append(f"ensure_chrome: {started}")

    log.info("step 2/5: inject cookies via CDP")
    try:
        cookies = read_cookies(src_profile)  # all domains
        n_cookies = inject_via_cdp(cookies, cdp_url)
        summary["cookies"] = {"injected": n_cookies, "read": len(cookies)}
    except Exception as e:
        log.warning("cookies failed: %s", e)
        summary["errors"].append(f"cookies: {e}")

    # Step 3: stop dest Chrome (must be stopped before LevelDB file copy)
    log.info("step 3/5: stop destination Chrome")
    stopped = _run_bh(bh_python, bh_server, "stop_chrome")
    log.info("  stop_chrome -> %s", stopped.get("status"))
    time.sleep(1.0)  # give the OS a moment to release file locks

    # Step 4: file-copy LocalStorage + IndexedDB
    log.info("step 4/5: file-copy localStorage + IndexedDB")
    try:
        ls_files, ls_bytes = _copy_localstorage(src_profile.path, dst_profile)
        summary["localstorage"] = {"files": ls_files, "bytes": ls_bytes}
    except Exception as e:
        log.warning("localStorage copy failed: %s", e)
        summary["errors"].append(f"localStorage: {e}")
    try:
        idb_copied, idb_skipped, idb_bytes = _copy_indexeddb(src_profile.path, dst_profile)
        summary["indexeddb"] = {
            "origins_copied": idb_copied,
            "origins_skipped": idb_skipped,
            "bytes": idb_bytes,
        }
    except Exception as e:
        log.warning("IndexedDB copy failed: %s", e)
        summary["errors"].append(f"indexeddb: {e}")

    # Step 5: restart dest Chrome
    log.info("step 5/5: restart destination Chrome")
    restarted = _run_bh(bh_python, bh_server, "ensure_chrome")
    log.info("  ensure_chrome -> %s", restarted.get("status"))
    if restarted.get("status") in ("error", "launch_timeout", "parse_error"):
        summary["errors"].append(f"restart: {restarted}")

    return summary


def _cli(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(prog="python -m ai_browser_profile.bulk_import")
    p.add_argument("--from", dest="src", required=True,
                   help="source profile, e.g. arc:Default")
    p.add_argument("--bh-python", required=True,
                   help="path to browser-harness venv python3")
    p.add_argument("--bh-server", required=True,
                   help="path to browser-harness server.py")
    p.add_argument("--cdp-url", default="http://127.0.0.1:9655")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    t0 = time.time()
    summary = bulk_import(args.src, args.bh_python, args.bh_server, args.cdp_url)
    dt = time.time() - t0

    print(json.dumps(summary, indent=2))
    print(f"\nElapsed: {dt:.1f}s")
    print(
        f"Cookies: {summary['cookies'].get('injected', 0)}/"
        f"{summary['cookies'].get('read', 0)}. "
        f"localStorage: {summary['localstorage'].get('files', 0)} files. "
        f"IndexedDB: {summary['indexeddb'].get('origins_copied', 0)} origins "
        f"({summary['indexeddb'].get('bytes', 0) // (1024*1024)} MB)."
    )
    return 0 if not summary["errors"] else 2


if __name__ == "__main__":
    sys.exit(_cli())
