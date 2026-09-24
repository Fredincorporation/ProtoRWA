#!/usr/bin/env bash
# Exercises the write path of the deployed Stylus verifier: a real transaction
# that computes a keccak Merkle root and writes it to storage.
#
# Reads alone do not prove a contract is functional. This is the only test that
# shows the WASM actually executes host functions (keccak) and mutates state -
# and it is the difference between "the address responds" and "the contract
# works".
set -uo pipefail

export PATH="$PATH:/home/fred/.foundry/bin:/usr/local/bin:/usr/bin:/bin"

RPC=https://rpc.testnet.chain.robinhood.com
V=0x774a47d68c0148ffa14a154beb740154f0e4c129

# The signing key comes from the gitignored contracts/.env, never from this
# script. (The file is untracked, so there is no git-history exposure, but a
# funded key must not sit in plaintext in a committed-style helper.)
if [ -z "${KEY:-}" ]; then
  SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    . "$SCRIPT_DIR/.env"
    set +a
  fi
  KEY="${PRIVATE_KEY:-}"
fi
: "${KEY:?set KEY (or PRIVATE_KEY in contracts/.env)}"

# A single-leaf tree: with an empty proof the computed root equals the leaf, so
# this exercises the keccak host function and the storage write without having to
# build a multi-level tree off-chain.
LEAF=$(printf '0x%064x' 0xabcd)
PROJECT=$(printf '0x%064x' 0x1234)

echo "== before =="
echo "   isTelemetryVerified(leaf): $(cast call "$V" 'isTelemetryVerified(bytes32)(bool)' "$LEAF" --rpc-url "$RPC")"

echo
echo "== init(address) =="
cast send "$V" 'init(address)' 0x8CC75Cc2e910DE973315465b8c2B5aECE716A346 \
  --private-key "$KEY" --rpc-url "$RPC" --json 2>&1 \
  | python3 -c 'import json,sys
d=json.load(sys.stdin)
tx = d.get("data") or d
print("   status:", tx.get("status"), "tx:", tx.get("transactionHash"))' 2>/dev/null \
  || echo "   (init already called - see note)"

echo
echo "== verifyHardwareBatch(projectHash, milestoneId, batchRoot, proof[], leaf) =="
cast send "$V" \
  'verifyHardwareBatch(bytes32,uint256,bytes32,bytes32[],bytes32)' \
  "$PROJECT" 0 "$LEAF" "[]" "$LEAF" \
  --private-key "$KEY" --rpc-url "$RPC" --json 2>&1 \
  | python3 -c 'import json,sys
d=json.load(sys.stdin)
tx = d.get("data") or d
print("   status:", tx.get("status"))
print("   tx:    ", tx.get("transactionHash"))' 2>/dev/null \
  || echo "   (call failed - see raw output above)"

echo
echo "== after =="
echo "   isTelemetryVerified(leaf): $(cast call "$V" 'isTelemetryVerified(bytes32)(bool)' "$LEAF" --rpc-url "$RPC")"
