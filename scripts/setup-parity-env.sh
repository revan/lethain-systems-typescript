#!/usr/bin/env bash
# Create .parity-venv/ with the Python `systems` package installed, for the
# parity gate (`npm run parity`). Requires python3 with the venv module
# (on Debian/Ubuntu: `sudo apt install python3-venv python3-pip`).
#
# Override what gets installed with SYSTEMS_PIP_SPEC, e.g.
#   SYSTEMS_PIP_SPEC=https://github.com/lethain/systems/archive/refs/heads/master.tar.gz
set -euo pipefail

cd "$(dirname "$0")/.."
VENV=.parity-venv
SPEC="${SYSTEMS_PIP_SPEC:-systems}"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade "$SPEC"
"$VENV/bin/pip" show systems | grep -E '^(Name|Version):'
echo "Python systems CLIs installed in $VENV/bin"
