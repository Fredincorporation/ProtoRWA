#!/usr/bin/env bash
# Verifies the Rust consensus fix on the LIVE contract, using the real ABI
# selectors.
#
# The cases below are the same ones pinned in contracts/test/ConsensusParity.t.sol.
# Running them against the deployed contract closes the gap between "the Solidity
# behaves correctly" and "the Rust the UI reads from behaves identically" - which
# was the actual defect: the two implementations disagreed on whether a milestone
# passes.
set -uo pipefail

export PATH="$PATH:/home/fred/.foundry/bin:/usr/local/bin:/usr/bin:/bin"

RPC=https://rpc.testnet.chain.robinhood.com
V=0x774a47d68c0148ffa14a154beb740154f0e4c129

# Defaults the escrow uses: 25% quorum, 60% approval.
Q=2500
T=6000

ask() {
  # ask <label> <expected> <approve> <reject> <abstain> <eligible> [quorum] [threshold]
  local label="$1" expected="$2" approve="$3" reject="$4" abstain="$5" eligible="$6"
  local quorum="${7:-$Q}" threshold="${8:-$T}"

  local got
  got=$(cast call "$V" \
    'evaluateConsensus(uint256,uint256,uint256,uint256,uint256,uint256,uint256)(bool)' \
    0 "$approve" "$reject" "$abstain" "$eligible" "$quorum" "$threshold" --rpc-url "$RPC")

  if [ "$got" = "$expected" ]; then
    printf '  PASS  %-56s got %s\n' "$label" "$got"
  else
    printf '  FAIL  %-56s expected %s, got %s\n' "$label" "$expected" "$got"
  fi
}

echo "===== consensus parity, live on Robinhood Chain testnet ====="
echo

echo "-- approval threshold is measured against ELIGIBLE, not votes cast --"
ask "6000/0/0/10000 - exactly at the 60% threshold"      true   6000 0 0 10000
ask "5999/0/0/10000 - one unit below threshold"           false  5999 0 0 10000
ask "4000/0/0/10000 - 100% of voters but 40% of eligible" false  4000 0 0 10000

echo
echo "-- abstentions count toward quorum (the other half of the fix) --"
ask "6000/0/2500/10000 - approval carries quorum too"     true   6000 0 2500 10000
ask "2000/0/1000/10000 - quorum met, approval short"      false  2000 0 1000 10000
ask "0/0/10000/10000 - everyone abstained"                false  0    0 10000 10000

echo
echo "-- quorum floor --"
ask "100/0/0/10000 - unanimous but 1% participation"       false  100  0 0 10000
ask "0/100/0/10000 - rejections only"                      false  0    100 0 10000

echo
echo "-- parameterised thresholds --"
ask "6000/0/0/10000 @ 50%/90% - stricter than default"     false  6000 0 0 10000 5000 9000
ask "9000/0/1000/10000 @ 50%/90%"                          true   9000 0 1000 10000 5000 9000
ask "3000/0/0/10000 @ 10%/30% - lenient"                   true   3000 0 0 10000 1000 3000

echo
echo "-- edge: no eligible weight --"
ask "0/0/0/0 - empty voter set"                            false  0    0 0 0

echo
echo "===== keccak / merkle path ====="
LEAF=$(printf '0x%064x' 0xabcd)
echo "  before: isTelemetryVerified(leaf) = $(cast call "$V" 'isTelemetryVerified(bytes32)(bool)' "$LEAF" --rpc-url "$RPC")"
