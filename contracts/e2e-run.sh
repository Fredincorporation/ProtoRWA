#!/usr/bin/env bash
# Runner for the end-to-end lifecycle, invoked from Windows via wsl:
#
#   wsl -e bash contracts/e2e-run.sh
#
# Exists as a file rather than an inline `-lc` string because PowerShell strips
# `$HOME` and backslash-escapes inside the quoted command, so paths silently
# collapse to empty and `cast` is then reported as missing.
set -uo pipefail

# APPEND to the existing PATH rather than replacing it. A hardcoded list that
# omits /usr/bin leaves `python3` unresolvable, and the script then reads an
# empty status from every transaction and reports successful broadcasts as
# failures.
export PATH="$PATH:/home/fred/.cargo/bin:/home/fred/.foundry/bin:/usr/local/bin:/usr/bin:/bin"

# PRIVATE_KEY lives in the gitignored contracts/.env, never in this committed
# script. Ejecting it here would bake a funded key into the repo history and any
# clone; the .env is the single source, and e2e-robinhood.sh fails loudly if it
# is missing.
cd /mnt/c/Users/fred/Documents/GitHub/ProtoRWA/contracts || exit 1

if [ -z "${PRIVATE_KEY:-}" ] && [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

echo "cast: $(command -v cast)"
exec bash e2e-robinhood.sh
