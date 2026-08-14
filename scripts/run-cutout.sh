#!/usr/bin/env bash
# Run the cutout step with the pipeline's venv python if it exists, else system python3.
# Passes through args (id/kind filter) and env (FORCE, REMBG_MODEL, ALPHA_MATTING).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
py="$here/.cache/venv/bin/python"
[ -x "$py" ] || py="python3"
exec "$py" "$here/scripts/cutout.py" "$@"
