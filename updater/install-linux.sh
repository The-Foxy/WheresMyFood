#!/bin/sh
set -e
cd "$(dirname "$0")"
SCRIPT="updater/install.py"
[ -f "$SCRIPT" ] || SCRIPT="install.py"

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
  echo "Python 3.10+ is required. Install python3 from your package manager and run again." >&2
  exit 1
fi

exec python3 "$SCRIPT" "$@"
