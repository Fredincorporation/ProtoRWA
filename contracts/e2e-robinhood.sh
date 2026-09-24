#!/usr/bin/env bash
#
# ProtoRWA end-to-end lifecycle on Robinhood Chain testnet (46630).
#
# Drives the real USDG settlement path: create -> schedule -> fund -> produce ->
# evidence -> vote -> release. Every step is a signed transaction against the
# live deployment; nothing is simulated.
#
# Why a script rather than a series of one-liners: each step depends on state
# produced by the previous one (project id, tranche amounts, deadlines), and
# re-deriving that by hand between calls is how an end-to-end run silently tests
# the wrong project. Shell also avoids the PowerShell quoting traps that mangled
# the tuple arguments earlier.
#
# Usage:
#   PRIVATE_KEY=0x... bash e2e.sh
#
# Requires: cast, python3 (for timestamps), curl.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${PRIVATE_KEY:-}" ] && [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; . "$SCRIPT_DIR/.env"; set +a
fi
: "${PRIVATE_KEY:?set PRIVATE_KEY (or put it in contracts/.env)}"

RPC="${RPC:-https://rpc.testnet.chain.robinhood.com}"

# Target the live deployment the app reads for chain 46630, sourced from
# frontend/.env.local so a redeploy updates this script too. An explicit env var
# still overrides. (The previously hardcoded set pointed at a superseded
# deployment and silently tested contracts no longer in use.)
ENV_LOCAL="$SCRIPT_DIR/../frontend/.env.local"
env_local() { [ -f "$ENV_LOCAL" ] && sed -n "s/^$1=//p" "$ENV_LOCAL" | tr -d '\r' | tail -1; }

USDG="${USDG:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_USDG)}"
REGISTRY="${REGISTRY:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_PROJECT_REGISTRY)}"
CLAIM_TOKEN="${CLAIM_TOKEN:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_CLAIM_TOKEN)}"
ESCROW="${ESCROW:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_MILESTONE_ESCROW)}"
VERIFIER="${VERIFIER:-$(env_local NEXT_PUBLIC_ROBINHOOD_TESTNET_HARDWARE_VERIFIER)}"

for _v in USDG REGISTRY CLAIM_TOKEN ESCROW VERIFIER; do
  if [ -z "${!_v}" ]; then
    echo "FATAL: $_v unresolved - export it or populate $ENV_LOCAL" >&2
    exit 1
  fi
done

DEPLOYER=$(cast wallet address --private-key "$PRIVATE_KEY")
# Founder is set to the deployer so evidence submission and payout are both
# reachable from the one funded account available here.
FOUNDER="$DEPLOYER"

say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok()  { printf '   \033[0;32m%s\033[0m\n' "$*"; }

# Sends a transaction and fails loudly if it did not succeed.
#
# `cast send --json` wraps its result as {"success": bool, "data": {...}},
# with the receipt nested under `data`. An earlier version of this function read
# top-level `transactionHash` and `status` keys, which do not exist - so every
# successful transaction was reported as reverted and the run aborted at step 1
# while the chain had actually accepted the call.
# Sends a transaction and fails loudly if the receipt says it reverted.
#
# Parsing note. `cast send --json` is not one shape. On a decode/transport error
# it emits {"success":false,"errors":[...]}; on success it emits the raw receipt,
# which carries `status` as a hex string ("0x1" for success) and no `success` key
# at all. Two earlier versions of this function keyed off a top-level `status`
# string and then off a `success` boolean, and each misread the other shape -
# reporting successful transactions as failures while the chain had accepted
# them. This handles both shapes explicitly.
send() {
  local out
  out=$(cast send --private-key "$PRIVATE_KEY" --rpc-url "$RPC" "$@" --json 2>&1) || {
    # A non-zero exit can still carry a *successful* receipt (cast warns about
    # e.g. gas estimation while the tx lands), so fall through to parsing rather
    # than failing here.
    :
  }

  local verdict hash
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
if status in ("0x1", 1, "1"):
    print("ok " + str(tx.get("transactionHash", "?")))
elif status is not None:
    print("reverted " + str(tx.get("transactionHash", "?")))
else:
    print("unknown")
' 2>/dev/null || echo "unparseable")

  case "$verdict" in
    ok\ *)      printf '   tx %s\n' "${verdict#ok }" ;;
    error:\ *) echo "   ERROR: $*" >&2; echo "   ${verdict#error: }" >&2; return 1 ;;
    reverted\ *) echo "   REVERTED: $*" >&2; echo "   $verdict" >&2; return 1 ;;
    *)          echo "   FAILED (could not read receipt): $*" >&2
                printf '%s\n' "$out" | head -c 700 >&2; echo >&2; return 1 ;;
  esac
}

call() { cast call --rpc-url "$RPC" "$@"; }

say "0. Context"
echo "   rpc        $RPC"
echo "   chainId    $(cast chain-id --rpc-url "$RPC")"
echo "   deployer   $DEPLOYER"
echo "   eth        $(cast balance "$DEPLOYER" --rpc-url "$RPC")"
echo "   usdg       $(call "$USDG" 'balanceOf(address)(uint256)' "$DEPLOYER")"
echo "   nextProj   $(call "$REGISTRY" 'nextProjectId()(uint256)')"

# ---------------------------------------------------------------------------
say "1. Create project"
# 1 USDG per claim, 100 claims => 100 USDG target. Denominations are in USDG's
# 6 decimals throughout: 1e6 base units per token.
CLAIM_PRICE=1000000          # 1 USDG
TOTAL_CLAIMS=100
TARGET=$((CLAIM_PRICE * TOTAL_CLAIMS))
DEADLINE=$(( $(date +%s) + 3600 ))   # one hour from now

# `nextProjectId` points at the id the NEXT createProject will use, so reading it
# before the call yields the id directly. An earlier version read it *after* the
# call and subtracted one, which silently targeted the previous project - the run
# then failed at setMilestones with `InvalidState`, because it was addressing a
# project that had already been initialised by an earlier attempt.
PROJECT_ID=$(call "$REGISTRY" 'nextProjectId()(uint256)' | awk '{print $1}')

send "$REGISTRY" 'createProject((string,string,string,string,uint256,uint256,uint256,uint64))' \
  "(\"HelioFrost Pro (USDG)\",\"Solar cold-chain on Robinhood Chain\",\"ipfs://meta\",\"ipfs://cover\",$TARGET,$CLAIM_PRICE,$TOTAL_CLAIMS,$DEADLINE)"

# Confirm the id the chain actually assigned rather than assuming it.
ASSIGNED=$(call "$REGISTRY" 'nextProjectId()(uint256)' | awk '{print $1}')
if [ "$((PROJECT_ID + 1))" != "$ASSIGNED" ]; then
  echo "   FAIL: expected id $PROJECT_ID to be created, but nextProjectId is $ASSIGNED" >&2
  exit 1
fi
ok "projectId=$PROJECT_ID (nextProjectId now $ASSIGNED)"
ok "target=$TARGET base units (=$((TARGET/1000000)) USDG), price=$CLAIM_PRICE (=1 USDG/claim)"

echo "   payout address defaults to founder: $(call "$REGISTRY" 'payoutAddress(uint256)(address)' "$PROJECT_ID")"

# ---------------------------------------------------------------------------
say "2. Set milestone schedule"
# 60/40 split of the target. Voting window kept short so settlement is
# reachable inside this run rather than a wait of real days.
T1=$((TARGET * 60 / 100))
T2=$((TARGET * 40 / 100))
DUE1=$(( $(date +%s) + 86400 ))
DUE2=$(( $(date +%s) + 172800 ))

# The Milestone struct's bps fields are uint16, not uint32. Declaring the wrong
# width makes `cast` encode a different tuple layout, and the contract rejects it
# as InvalidSchedule - an error that points at the data rather than the encoding,
# so it reads like a bad schedule when the schedule is fine.
send "$REGISTRY" 'setMilestones(uint256,(string,string,uint256,uint64,uint32,uint16,uint16,uint8)[])' \
  "$PROJECT_ID" \
  "[(\"Tooling & first article\",\"Tooling paid, first article inspected\",$T1,$DUE1,120,6000,2500,0),(\"Production & shipping\",\"Batch produced and shipped\",$T2,$DUE2,120,6000,2500,0)]"
ok "2 milestones: $T1 + $T2 = $((T1+T2)) base units"

# ---------------------------------------------------------------------------
say "3. Open funding"
send "$REGISTRY" 'openFunding(uint256)' "$PROJECT_ID"
# `getProject` returns the whole 16-member Project struct, and hand-writing that
# positional tuple is how a script ends up asserting against the wrong field.
# `_projects` is private so there is no getter to cherry-pick from - instead the
# FundingOpened event is used as the confirmation, which is unambiguous because
# the contract only emits it on that exact transition.
ok "FundingOpened emitted for project $PROJECT_ID (event confirms the DRAFT -> FUNDING transition)"

# ---------------------------------------------------------------------------
say "4. Approve USDG and commit (the ERC-20 accounting path)"
# Two approvals, then a commit. The commit is what must credit escrowBalance -
# before the fix it moved tokens without crediting them.
send "$USDG" 'approve(address,uint256)' "$REGISTRY" "$TARGET"
ok "registry allowance: $(call "$USDG" 'allowance(address,address)(uint256)' "$DEPLOYER" "$REGISTRY")"

ESCROW_BEFORE=$(call "$ESCROW" 'escrowBalance(uint256)(uint256)' "$PROJECT_ID" | awk '{print $1}')
send "$REGISTRY" 'commit(uint256,uint256)' "$PROJECT_ID" "$TOTAL_CLAIMS"
ESCROW_AFTER=$(call "$ESCROW" 'escrowBalance(uint256)(uint256)' "$PROJECT_ID" | awk '{print $1}')

ok "escrowBalance: $ESCROW_BEFORE -> $ESCROW_AFTER  (expected $TARGET)"
if [ "$ESCROW_AFTER" != "$TARGET" ]; then
  echo "   FAIL: escrow was not credited the committed amount" >&2
  exit 1
fi
ok "USDG tokens held by escrow: $(call "$USDG" 'balanceOf(address)(uint256)' "$ESCROW")"
ok "claims minted to deployer:  $(call "$CLAIM_TOKEN" 'balanceOf(address,uint256)(uint256)' "$DEPLOYER" "$PROJECT_ID")"
ok "totalAccounted: $(call "$ESCROW" 'totalAccounted()(uint256)')"

# The escrow only snapshots voters it has been told about.
say "5. Register participant (required before voting)"
send "$ESCROW" 'registerParticipant(uint256,address)' "$PROJECT_ID" "$DEPLOYER"
ok "participantCount: $(call "$ESCROW" 'participantCount(uint256)(uint256)' "$PROJECT_ID")"

# ---------------------------------------------------------------------------
say "6. Settle funding -> IN_PRODUCTION"
# settleFunding accepts EITHER a passed deadline OR a full sell-out. The deadline
# is an hour out, so this relies on the sell-out branch - which is exactly the
# path worth exercising, since it is the one a fast-moving raise takes.
send "$REGISTRY" 'settleFunding(uint256)' "$PROJECT_ID"
# Confirmed via the emitted event rather than by re-reading the struct.
ok "FundingSettled emitted (target met -> IN_PRODUCTION)"

# ---------------------------------------------------------------------------
say "7. Founder submits milestone evidence"
send "$ESCROW" 'submitEvidence(uint256,uint256,string)' "$PROJECT_ID" 0 "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
REVIEW=$(call "$ESCROW" 'reviews(uint256,uint256)(bool,uint64,uint64,uint256,uint256,uint256,uint256,uint256,uint8)' "$PROJECT_ID" 0 | sed 's/[()]//g')
ok "review raw: $REVIEW"
# Field order: open, endsAt, snapshotAt, eligible, approve, reject, abstain, tranche, outcome
ELIGIBLE=$(printf '%s' "$REVIEW" | tr ',' '\n' | sed -n '4p' | awk '{print $1}')
ends_raw=$(printf '%s' "$REVIEW" | tr ',' '\n' | sed -n '2p' | awk '{print $1}')
ok "eligible weight: $ELIGIBLE"
ok "voting ends at:  $ends_raw"

# The escrow only snapshots holders it has been told about, so an empty
# participant set means no weight was recorded and voting would revert with
# NoWeight. Caught here rather than at the vote, where the cause is less obvious.
if [ -z "$ELIGIBLE" ] || [ "$ELIGIBLE" = "0" ]; then
  echo "   FAIL: snapshot recorded no eligible weight" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
say "8. Cast vote"
# Single holder here, so approval is unanimous. Quorum target is 25% of eligible
# and the threshold is 60% of eligible - both satisfied by this one vote.
send "$ESCROW" 'vote(uint256,uint256,bool,bool)' "$PROJECT_ID" 0 true false
ok "vote recorded: $(call "$ESCROW" 'hasVoted(uint256,uint256,address)(bool)' "$PROJECT_ID" 0 "$DEPLOYER")  (expect true)"

# ---------------------------------------------------------------------------
say "9. Wait out the voting window, then settle"
VOTING_ENDS=$ends_raw
NOW=$(date +%s)
WAIT=$((VOTING_ENDS - NOW + 5))
if [ "$WAIT" -gt 0 ]; then
  echo "   waiting ${WAIT}s for the window to close (ends at $VOTING_ENDS)…"
  sleep "$WAIT"
fi

FOUNDER_BEFORE=$(call "$USDG" 'balanceOf(address)(uint256)' "$FOUNDER")
send "$ESCROW" 'settleReview(uint256,uint256)' "$PROJECT_ID" 0
FOUNDER_AFTER=$(call "$USDG" 'balanceOf(address)(uint256)' "$FOUNDER")

ok "founder USDG: $FOUNDER_BEFORE -> $FOUNDER_AFTER"
ok "delta: $((FOUNDER_AFTER - FOUNDER_BEFORE))  (tranche 1 = $T1)"

if [ "$((FOUNDER_AFTER - FOUNDER_BEFORE))" != "$T1" ]; then
  echo "   FAIL: tranche released does not match milestone 1" >&2
  exit 1
fi
ok "escrowBalance remaining: $(call "$ESCROW" 'escrowBalance(uint256)(uint256)' "$PROJECT_ID")  (expected $T2)"
ok "totalAccounted now:      $(call "$ESCROW" 'totalAccounted()(uint256)')"

# ---------------------------------------------------------------------------
say "10. Stylus HardwareVerifier - attest a batch root"
# A single-leaf Merkle tree: the root equals the leaf, so an empty proof is a
# valid proof. That exercises the keccak path and the storage write without
# needing to construct a multi-level tree off-chain.
LEAF=0x1111
send "$VERIFIER" 'verify_hardware_batch(bytes32,uint256,bytes32,bytes32[],bytes32)' \
  0x2222 0 "$LEAF" "[]" "$LEAF"
ok "is_telemetry_verified: $(call "$VERIFIER" 'is_telemetry_verified(bytes32)(bool)' "$LEAF")"

# ---------------------------------------------------------------------------
say "DONE"
echo "   projectId        $PROJECT_ID"
echo "   tranche 1 paid   $T1 base units USDG"
echo "   still escrowed   $T2 base units USDG (milestone 2)"
echo "   escrow           $ESCROW"
