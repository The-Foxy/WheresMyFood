#!/bin/sh
set -e
cd "$(dirname "$0")"
SCRIPT="updater/install.py"
[ -f "$SCRIPT" ] || SCRIPT="install.py"

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
  echo "پایتون ۳.۱۰ یا جدیدتر پیدا نشد. لطفاً از python.org نسخهٔ جدید Python 3 را نصب کن و دوباره اجرا کن."
  open "https://www.python.org/downloads/" 2>/dev/null || true
  printf "Press Enter to close..."
  read -r _
  exit 1
fi

python3 "$SCRIPT" "$@"
echo ""
printf "برای بستن این پنجره Enter را بزن..."
read -r _
