#!/usr/bin/env bash
# Shoot chapters with a clean slate.
#
# A `vite preview` left running from an earlier pass keeps its own port and serves the OLD dist,
# so shots look like they came from code that was never built. Kill every preview server first,
# then build, then shoot. Usage: scripts/shoot.sh 3,4
set -euo pipefail
cd "$(dirname "$0")/.."
export LD_LIBRARY_PATH=/workspace/libs/usr/lib/x86_64-linux-gnu:/workspace/libs/lib/x86_64-linux-gnu:/workspace/libs/usr/lib
export PLAYWRIGHT_BROWSERS_PATH=/workspace/.pw-browsers
export TMPDIR=/workspace/tmp
python3 - <<'PY'
import os, signal
for pid in os.listdir('/proc'):
    if not pid.isdigit():
        continue
    try:
        cmd = open(f'/proc/{pid}/cmdline', 'rb').read().decode(errors='ignore').replace('\x00', ' ')
    except Exception:
        continue
    if 'vite preview' in cmd and str(os.getpid()) != pid:
        try:
            os.kill(int(pid), signal.SIGKILL)
            print('killed stale preview', pid)
        except Exception:
            pass
PY
sleep 1
npm run build >/tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }
SHOT_ONLY="${1:-}" node scripts/shots.mjs
