#!/usr/bin/env bash
#
# Live secondary-market + refund lifecycle on Robinhood Chain testnet (46630),
# against the SAME deployment the product talks to (the .env.local addresses,
# where HelioFrost is seeded and the frontend trades).
#
# This closes the two write paths e2e-robinhood.sh never touched:
#   - SecondaryMarket: list -> buy -> placeBid -> cancelBid -> cancel, i.e. the
#     USDG fee/proceeds settlement and the claim escrow round-trips.
#   - MilestoneEscrow.claimRefund: a CANCELLED raise returning escrow pro-rata to
#     a claim holder and burning their balance.
#
# Every step is a signed transaction with the funded wallet; nothing is mocked.
# USDG is the only settlement asset (6 decimals); native ETH is gas only.
#
# Usage:
#   PRIVATE_KEY=0x... bash e2e-market-refund.sh      # or source contracts/.env
# Requires: cast, python3.

set -uo pipefail

export PATH="$PATH:/c/Users/fred/.foundry/bin"

# Source the funded key from the sibling .env if not already in the environment.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${PRIVATE_KEY:-}" ] && [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; . "$SCRIPT_DIR/.env"; set +a
fi
: "${PRIVATE_KEY:?set PRIVATE_KEY (or put it in contracts/.env)}"

RPC="${RPC:-https://rpc.testnet.chain.robinhood.com}"

# Derive the target deployment from frontend/.env.local (the single source of
# truth the app itself reads for chain 46630). This keeps the e2e pointed at the
# live contracts after a redeploy instead of a hardcoded set that silently goes
# stale and tests a superseded deployment. An explicit *_LIVE override still wins.
ENV_LOCAL="$SCRIPT_DIR/../frontend/.env.local"
env_local() { # env_local <KEY> -> value from .env.local, or empty
  [ -f "$ENV_LOCAL" ] && sed -n "s/^$1=//p" "$ENV_LOCAL" | tr -d '\r' | tail -1
}

USDG="${USDG_LIVE:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_USDG)}"
REGISTRY="${REGISTRY_LIVE:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_PROJECT_REGISTRY)}"
CLAIM_TOKEN="${CLAIM_LIVE:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_CLAIM_TOKEN)}"
ESCROW="${ESCROW_LIVE:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_MILESTONE_ESCROW)}"
MARKET="${MARKET_LIVE:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_SECONDARY_MARKET)}"

for _v in USDG REGISTRY CLAIM_TOKEN ESCROW MARKET; do
  if [ -z "${!_v}" ]; then
    echo "FATAL: $_v unresolved - set ${_v}_LIVE or populate $ENV_LOCAL" >&2
    exit 1
  fi
done

DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
FOUNDER="$DEPLOYER"
BUYER="$DEPLOYER"   # single funded account: it is seller and buyer, so the
                    # self-trade still exercises the real transfer + fee skim.

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok()  { printf '   \033[0;32m%s\033[0m\n' "$*"; }
bad() { printf '   \033[0;31m%s\033[0m\n' "$*"; }

FAILED=0
check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1: $2 (expect $3)"; else bad "$1: $2 != $3"; FAILED=1; fi
}

send() {
  local out
  out=$(cast send --private-key "$PRIVATE_KEY" --rpc-url "$RPC" "$@" --json 2>&1) || { :; }
  local verdict
  verdict=$(printf '%s' "$out" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("unparseable"); raise SystemExit
tx = (d.get("data") or {}) if d.get("success") is not None else d
if d.get("success") is False and d.get("errors"):
    print("error: " + d["errors"][0].get("message", "?")); raise SystemExit
status = tx.get("status")
if status in ("0x1", 1, "1"): print("ok " + str(tx.get("transactionHash", "?")))
elif status is not None: print("reverted " + str(tx.get("transactionHash", "?")))
else: print("unknown")
' 2>/dev/null || echo "unparseable")
  case "$verdict" in
    ok\ *)      printf '   tx %s\n' "${verdict#ok }"; return 0 ;;
    error:\ *) bad "ERROR: $*"; bad "   ${verdict#error: }"; FAILED=1; return 1 ;;
    reverted\ *) bad "REVERTED: $*"; return 1 ;;
    *) bad "FAILED (unreadable receipt): $*"; printf '%s\n' "$out" | head -c 500 >&2; echo >&2; FAILED=1; return 1 ;;
  esac
}
call() { cast call --rpc-url "$RPC" "$@" 2>/dev/null | awk '{print $1}'; }
usdg_bal() { call "$USDG" 'balanceOf(address)(uint256)' "$1"; }
claim_bal() { call "$CLAIM_TOKEN" 'balanceOf(address,uint256)(uint256)' "$1" "$2"; }

# ---------------------------------------------------------------------------
say "0. Context"
echo "   chainId   $(cast chain-id --rpc-url "$RPC")"
echo "   account   $DEPLOYER"
echo "   ETH(gas)  $(cast balance "$DEPLOYER" --rpc-url "$RPC")"
echo "   USDG      $(usdg_bal "$DEPLOYER")"
echo "   market    $MARKET  feeBps=$(call "$MARKET" 'feeBps()(uint16)')"
[ "$(echo "$(call "$MARKET" 'paymentToken()(address)')" | tr 'A-F' 'a-f')" = "$(echo "$USDG" | tr 'A-F' 'a-f')" ] \
  && ok "market.paymentToken == USDG" || { bad "market paymentToken is NOT USDG"; FAILED=1; }

# ===========================================================================
say "A. Fund a fresh project to IN_PRODUCTION (so the wallet holds tradeable claims)"
# Sized to the funded wallet's balance (~60 USDG): a 20-claim raise leaves
# enough headroom for the self-buy gross and the bid escrow that follow.
CLAIM_PRICE=1000000                 # 1 USDG / claim (6 decimals)
TOTAL_CLAIMS=20
TARGET=$((CLAIM_PRICE * TOTAL_CLAIMS))   # 100 USDG
DEADLINE=$(( $(date +%s) + 3600 ))

PID=$(call "$REGISTRY" 'nextProjectId()(uint256)')
send "$REGISTRY" 'createProject((string,string,string,string,uint256,uint256,uint256,uint64))' \
  "(\"Mkt E2E $(date +%s)\",\"secondary market + refund e2e\",\"ipfs://meta\",\"ipfs://cover\",$TARGET,$CLAIM_PRICE,$TOTAL_CLAIMS,$DEADLINE)" || exit 1
T1=$((TARGET * 60 / 100)); T2=$((TARGET * 40 / 100))
DUE1=$(( $(date +%s) + 86400 )); DUE2=$(( $(date +%s) + 172800 ))
send "$REGISTRY" 'setMilestones(uint256,(string,string,uint256,uint64,uint32,uint16,uint16,uint8)[])' \
  "$PID" "[(\"m1\",\"e1\",$T1,$DUE1,120,6000,2500,0),(\"m2\",\"e2\",$T2,$DUE2,120,6000,2500,0)]" || exit 1
send "$REGISTRY" 'openFunding(uint256)' "$PID" || exit 1
send "$USDG" 'approve(address,uint256)' "$REGISTRY" "$TARGET" || exit 1
send "$REGISTRY" 'commit(uint256,uint256)' "$PID" "$TOTAL_CLAIMS" || exit 1
send "$REGISTRY" 'settleFunding(uint256)' "$PID" || exit 1   # sell-out -> IN_PRODUCTION

check "holder claims" "$(claim_bal "$BUYER" "$PID")" "$TOTAL_CLAIMS"
USDG_START=$(usdg_bal "$BUYER"); FEE_START=$(call "$MARKET" 'accruedFees()(uint256)')

# ===========================================================================
say "B. list -> buy (self-take): USDG settlement + protocol fee skim"
send "$CLAIM_TOKEN" 'setApprovalForAll(address,bool)' "$MARKET" true || exit 1
LID=$(call "$MARKET" 'nextListingId()(uint256)')
QTY=10; PRICE=2000000; GROSS=$((QTY * PRICE))     # 10 claims @ 2 USDG = 20 USDG
send "$MARKET" 'list(uint256,uint256,uint256,uint64)' "$PID" "$QTY" "$PRICE" 0 || exit 1
check "list escrows claims (holder 100->90)" "$(claim_bal "$BUYER" "$PID")" "$((TOTAL_CLAIMS - QTY))"
send "$USDG" 'approve(address,uint256)' "$MARKET" "$GROSS" || exit 1
send "$MARKET" 'buy(uint256,uint256)' "$LID" "$QTY" || exit 1   # USDG path (no native value)
check "buy returns claims to holder" "$(claim_bal "$BUYER" "$PID")" "$TOTAL_CLAIMS"
FEE=$(call "$MARKET" 'accruedFees()(uint256)')
EXP_FEE=$((GROSS * 100 / 10000))                 # feeBps 100 -> 1% skimmed
check "accruedFees +1% of gross" "$((FEE - FEE_START))" "$EXP_FEE"
check "holder net USDG = -fee (seller got gross-fee, paid gross)" \
  "$(($(usdg_bal "$BUYER") - USDG_START))" "-$EXP_FEE"

# ===========================================================================
say "C. placeBid -> cancelBid: USDG escrow then full refund"
BID_QTY=5; BID_PRICE=1000000; BID_GROSS=$((BID_QTY * BID_PRICE))
BID_BEFORE=$(usdg_bal "$BUYER")
BID_ID=$(call "$MARKET" 'nextBidId()(uint256)')
# Ensure a big enough USDG allowance for the bid escrow.
send "$USDG" 'approve(address,uint256)' "$MARKET" "$BID_GROSS" || exit 1
send "$MARKET" 'placeBid(uint256,uint256,uint256,uint64)' "$PID" "$BID_QTY" "$BID_PRICE" 0 || exit 1
check "bid escrows full gross" "$((BID_BEFORE - $(usdg_bal "$BUYER")))" "$BID_GROSS"
send "$MARKET" 'cancelBid(uint256)' "$BID_ID" || exit 1
check "cancelBid refunds the escrow exactly" "$(usdg_bal "$BUYER")" "$BID_BEFORE"

# ===========================================================================
say "D. list -> cancel: claims escrowed then returned"
CANCEL_QTY=4
send "$MARKET" 'list(uint256,uint256,uint256,uint64)' "$PID" "$CANCEL_QTY" 3000000 0 || exit 1
check "listing escrows claims" "$(claim_bal "$BUYER" "$PID")" "$((TOTAL_CLAIMS - CANCEL_QTY))"
LID2=$(($(call "$MARKET" 'nextListingId()(uint256)') - 1))
send "$MARKET" 'cancel(uint256)' "$LID2" || exit 1
check "cancel returns the escrowed claims" "$(claim_bal "$BUYER" "$PID")" "$TOTAL_CLAIMS"

# ===========================================================================
say "E. claimRefund: CANCELLED raise pays escrow pro-rata and burns claims"
# CANCELLED == 4 in the registry ProjectStatus enum.
send "$REGISTRY" 'setProjectStatus(uint256,uint8)' "$PID" 4 || exit 1
POOL=$(call "$ESCROW" 'escrowBalance(uint256)(uint256)' "$PID")
SUPPLY=$(call "$CLAIM_TOKEN" 'totalSupply(uint256)(uint256)' "$PID")
HELD=$(claim_bal "$BUYER" "$PID")
EXP_PAYOUT=$((POOL * HELD / SUPPLY))
ok "pool=$POOL held=$HELD supply=$SUPPLY  expected payout=$EXP_PAYOUT"
REFUND_BEFORE=$(usdg_bal "$BUYER")
send "$ESCROW" 'claimRefund(uint256)' "$PID" || exit 1
check "holder USDG credited by payout" "$(($(usdg_bal "$BUYER") - REFUND_BEFORE))" "$EXP_PAYOUT"
check "claims burned" "$(claim_bal "$BUYER" "$PID")" "0"

# ===========================================================================
say "DONE"
if [ "$FAILED" = "0" ]; then
  ok "ALL MARKET + REFUND INVARIANTS HELD ON $DEPLOYER's project $PID"
  exit 0
else
  bad "ONE OR MORE CHECKS FAILED"
  exit 1
fi
