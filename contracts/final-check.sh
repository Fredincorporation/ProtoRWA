#!/usr/bin/env bash
# Final verification of the ProtoRWA deployment on Robinhood Chain testnet.
#
# Exercises the real interfaces rather than reading bytecode: bytecode presence
# was repeatedly misleading during this deployment, and only a call that returns
# a value proves a contract works.
set -uo pipefail

export PATH="$PATH:/home/fred/.foundry/bin:/usr/local/bin:/usr/bin:/bin"

RPC=https://rpc.testnet.chain.robinhood.com

REGISTRY=0xfDf57e1E26B5e280e50002384690b85C5b981479
CLAIM=0xa4D79af4aC88be70cB38f50F21737D82846Ef7F1
ESCROW=0xD61f33378CB37D4548364AB8294aF7E4083444d0
MARKET=0x4907686BcC6b8a333b87aF81c731505dF0F20916
VERIFIER=0x774a47d68c0148ffa14a154beb740154f0e4c129
USDG=0x7E955252E15c84f5768B83c41a71F9eba181802F
DEPLOYER=0x8CC75Cc2e910DE973315465b8c2B5aECE716A346

echo "############ ProtoRWA on Robinhood Chain testnet (46630) ############"
echo

echo "== chain =="
echo "  chainId: $(cast chain-id --rpc-url "$RPC")"
echo "  arbOS:   $(cast call "0x$(printf '%038d' 0)$(printf '%x' 100)" 'arbOSVersion()(uint256)' --rpc-url "$RPC" 2>/dev/null || echo n/a)"

echo
echo "== deployed contracts (bytecode size) =="
for pair in \
  "ProjectRegistry:$REGISTRY" \
  "ClaimToken:$CLAIM" \
  "MilestoneEscrow:$ESCROW" \
  "SecondaryMarket:$MARKET" \
  "HardwareVerifier(Stylus):$VERIFIER"
do
  name=${pair%%:*}
  addr=${pair##*:}
  size=$(( ($(cast code "$addr" --rpc-url "$RPC" | wc -c) - 3) / 2 ))
  printf '  %-26s %s  %s bytes\n' "$name" "$addr" "$size"
done

echo
echo "== live state =="
echo "  nextProjectId:  $(cast call "$REGISTRY" 'nextProjectId()(uint256)' --rpc-url "$RPC")"
echo "  escrow token:   $(cast call "$ESCROW" 'paymentToken()(address)' --rpc-url "$RPC")  (USDG = $USDG)"
echo "  totalAccounted: $(cast call "$ESCROW" 'totalAccounted()(uint256)' --rpc-url "$RPC")"
echo "  project 8 held: $(cast call "$ESCROW" 'escrowBalance(uint256)(uint256)' 8 --rpc-url "$RPC")"
echo "  released[8][0]: $(cast call "$ESCROW" 'released(uint256,uint256)(uint256)' 8 0 --rpc-url "$RPC")"

echo
echo "== Stylus HardwareVerifier - read path (camelCase selectors) =="
LEAF=$(printf '0x%064x' 0xabcd)
echo "  isTelemetryVerified(0xabcd):   $(cast call "$VERIFIER" 'isTelemetryVerified(bytes32)(bool)' "$LEAF" --rpc-url "$RPC")"

echo
echo "== Stylus HardwareVerifier - consensus rule (live) =="
printf '  approve 6000 / eligible 10000 @ 2500/6000  ->  '
cast call "$VERIFIER" 'evaluateConsensus(uint256,uint256,uint256,uint256,uint256,uint256,uint256)(bool)' \
  0 6000 0 0 10000 2500 6000 --rpc-url "$RPC"
printf '  approve 5999 / eligible 10000 @ 2500/6000  ->  '
cast call "$VERIFIER" 'evaluateConsensus(uint256,uint256,uint256,uint256,uint256,uint256,uint256)(bool)' \
  0 5999 0 0 10000 2500 6000 --rpc-url "$RPC"
printf '  approve 2000 abstain 1000 / 10000 @ 25/60  ->  '
cast call "$VERIFIER" 'evaluateConsensus(uint256,uint256,uint256,uint256,uint256,uint256,uint256)(bool)' \
  0 2000 0 1000 10000 2500 6000 --rpc-url "$RPC"

echo
echo "== balances =="
echo "  deployer ETH:  $(cast balance "$DEPLOYER" --rpc-url "$RPC")"
echo "  deployer USDG: $(cast call "$USDG" 'balanceOf(address)(uint256)' "$DEPLOYER" --rpc-url "$RPC")"
echo "  escrow USDG:   $(cast call "$USDG" 'balanceOf(address)(uint256)' "$ESCROW" --rpc-url "$RPC")"
