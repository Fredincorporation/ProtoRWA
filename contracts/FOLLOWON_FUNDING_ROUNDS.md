# Follow-on Funding Rounds — Design Spec

> **Status: design only.** This document specifies the contract changes a
> follow-on round would require. It is *not* implemented, and nothing here has
> been compiled or deployed. Money everywhere below is USDG (6 decimals, ≈ $1);
> native ETH is gas only.

## 1. The question

A hardware project raises its first round, hits target, settles into
production, and ships a batch. Demand is real and it wants to scale: **a second
production run needs more capital.** How does a project that is past its
`FUNDING` state open another round without breaking the claims already issued,
the escrow that already released tranches, or the secondary market that already
trades those claims?

Today the answer is: it can't. This is a deliberate scope boundary, not a bug in
the demo — but it is the most obvious gap a real founder would hit, so it is
worth designing now.

## 2. Why the current contracts block a follow-on

`ProjectRegistry.sol` models funding as a **one-way state machine over a single
round**, and the round's parameters are write-once.

| Barrier | Where | What it forbids |
|---|---|---|
| `fundingDeadline` is set in `createProject` and has **no setter** | `ProjectRegistry.sol:239` | Extending/ reopening a window |
| `openFunding` is **DRAFT-only** | `ProjectRegistry.sol:302-316` | Re-entering `FUNDING` from `IN_PRODUCTION`/`COMPLETED` |
| `openFunding` requires `block.timestamp < fundingDeadline` | `ProjectRegistry.sol:308` | Opening after the original deadline |
| `commit` is **FUNDING-only** and pre-deadline | `ProjectRegistry.sol:335-345` | Minting claims once a round is closed |
| Supply is capped: `remaining = totalClaims - claimsCommitted` | `ProjectRegistry.sol:348`, `claimsAvailable` `:457-461` | Minting beyond the original `totalClaims` |
| `milestonesInitialised` is a **one-shot** flag | `ProjectRegistry.sol:268,295` | Re-scheduling milestones for new capital |
| `settleFunding` only ever leaves `FUNDING` | `ProjectRegistry.sol:402-423` | A funded→funding transition |

`ClaimToken` is a single shared ERC-1155 where **token id == project id** and
`totalClaims` is the hard supply ceiling for that id. Minting a follow-on on the
same id would silently dilute existing holders with no accounting for the new
capital or its terms.

So a follow-on needs three things the current design lacks: a **per-round**
model, a way to **mint new supply** under a round's terms, and a way to **extend
escrow/milestones** against that new capital.

## 3. Design options considered

### Option A — Re-open the same project state machine
Add an admin/founder call that flips `IN_PRODUCTION → FUNDING` again and raises
`totalClaims`.
*Rejected:* destroys the single-round invariant the whole lifecycle assumes,
conflates round-1 and round-2 backers in one `claimsCommitted` number, and makes
`settleFunding` ambiguous (which round just settled?). Existing secondary
listings would have no idea the supply just changed.

### Option B — A *separate* ERC-1155 token id per round ("Series B claims")
Mint follow-on claims under a new token id (`projectId * 1000 + round`).
*Rejected as default:* fragments custody — a holder now has N token ids for one
project, the order book must key on `(project, round)`, and the "one project, one
tradable claim" story the terminal shows (`TokenProvenance`) breaks. Keep as a
fallback only if rounds must have radically different seniority.

### Option C — Rounds as first-class sub-objects on the same project, same claim token ✅
**Recommended.** A project keeps one claim token id (one tradable asset), gains a
list of `FundingRound` structs, and each round that succeeds mints more units of
the *same* token to its backers. Existing holders are diluted by the same
mechanism a real follow-on dilutes them — more shares issued at a set price —
and that is exactly the economically honest behaviour. The secondary market is
untouched because the asset is still one token id.

Option C is the basis for the rest of this spec.

## 4. Recommended design (Option C)

### 4.1 Data model

```solidity
struct FundingRound {
    uint32  id;              // 1-based; round 1 == the original createProject round
    uint64  opensAt;
    uint64  closesAt;        // this round's deadline
    uint256 claimPrice;      // USDG base units per claim for THIS round
    uint256 maxNewClaims;    // supply this round may mint (<= remaining headroom)
    uint256 claimsCommitted; // minted so far in this round
    uint256 target;          // USDG this round is trying to raise
    uint256 totalCommitted;  // USDG raised so far in this round
    bytes32 useOfFundsCid;   // what the new capital buys; IPFS of the round memo
    RoundStatus status;      // OPEN | SETTLED_FUNDED | SETTLED_FAILED | CANCELLED
    uint32  escrowTrancheStart; // index into milestones[] funded by this round
}
```

Project gains:

```solidity
FundingRound[] rounds;   // rounds[0] is always the original round
uint256  totalClaimsMax; // absolute ceiling across all rounds (set at createProject)
uint256  globalSupply;   // == ClaimToken.balanceOf-ish total minted across rounds
```

`totalClaims` is renamed/kept as `rounds[0].maxNewClaims` for back-compat, and the
**project-level ceiling becomes `totalClaimsMax`** so a follow-on can mint up to
that ceiling but never past it.

### 4.2 Lifecycle of a follow-on

```
IN_PRODUCTION (round 1 settled, producing)
        │  founder: proposeRound(price, maxNewClaims, target, closesAt, useOfFundsCid, newMilestones[])
        ▼
  RoundProposal (state stays IN_PRODUCTION; secondary market keeps trading)
        │  existing claim holders vote to approve the dilution  (see 4.4)
        ▼
  round APPROVED → RoundStatus.OPEN, opensAt <= now < closesAt
        │  backers: commit(roundId, claims)  → transfers USDG, mints same-token claims
        ▼
  round settled: settleRound(roundId)
        ├─ raised >= target → SETTLED_FUNDED  → append newMilestones to escrow
        └─ raised <  target → SETTLED_FAILED  → refund that round's committers (burn their round claims)
```

Crucially, opening a round **does not** take the project out of
`IN_PRODUCTION`/`COMPLETED`, so the secondary market stays correct: the asset is
still tradeable, now at a price that reflects the (possibly larger) supply.

### 4.3 Function signatures (new on `ProjectRegistry`)

```solidity
function proposeRound(uint256 projectId, RoundParams calldata p) external; // onlyFounder
function approveRound(uint256 projectId, uint32 roundId) external;         // governance (4.4)
function openRound(uint256 projectId, uint32 roundId) external;             // after approval, pre-closesAt
function commitToRound(uint256 projectId, uint32 roundId, uint256 claimAmount) external; // -> mints
function settleRound(uint256 projectId, uint32 roundId) external;           // onlyAfter closesAt/soldOut
function refundRound(uint256 projectId, uint32 roundId) external;           // per-committer claim on FAILED
```

`commitToRound` mirrors the existing `commit` guards but scoped to a round:
require `round.status == OPEN`, `opensAt <= now < closesAt`, and
`round.claimsCommitted + globalSupply + claimAmount <= totalClaimsMax`. It
transfers `claimAmount * round.claimPrice` USDG from the backer into
`MilestoneEscrow`, tags the inflow with `roundId`, and mints `claimAmount` of the
**existing** `projectId` token to the backer.

### 4.4 Who approves a dilutive round (the hard governance question)

A follow-on **dilutes** existing holders only if it mints at a price *below*
their effective basis. If it prices *above* prior rounds, existing holders are
not diluted in value terms — they gain a public mark-to-market reference.

Recommended default to keep this safe and simple:

- `proposeRound` may only set `claimPrice >= lastSettledRound.claimPrice` (a
  "no-down-round-without-consent" rule). This means **every follow-on is
  accretive or neutral to existing holders by construction, so it needs no
  separate vote** — the founder can open it directly.
- If a **down round** is ever needed, gate it behind the same claim-holder
  governance that releases milestones: an `approveRound` vote weighted by
  `globalSupply` at snapshot time, quorum `PROTOCOL.DEFAULT_QUORUM_BPS`,
  threshold `PROTOCOL.DEFAULT_APPROVAL_THRESHOLD_BPS`. Reuse the existing
  milestone-vote machinery rather than inventing a second one.

This is a deliberate simplification: it makes the common case (scaling a winning
product with a higher-priced round) trustless and vote-free, and reserves
holder-consent for the one case where holders are genuinely harmed.

### 4.5 Milestones & escrow

New capital must map to new work. `proposeRound` carries
`newMilestones[]` whose tranche sum equals `round.target`. On
`settleRound → SETTLED_FUNDED`, append them to `_milestones[projectId]` with
indices starting at `round.escrowTrancheStart`, and release tranches against
them exactly as round-1 milestones release today. Because
`milestonesInitialised` currently blocks a second schedule, the one-shot guard
becomes **"at least one schedule exists before openFunding"** plus a new rule:
milestones may only be *appended*, never mutated, and only via a settled round.

`MilestoneEscrow` needs no change to its release/refund maths — it already keys
on `(projectId, milestoneIndex)`. It only needs to know that new indices exist.

### 4.6 Secondary market — explicitly unchanged

`SecondaryMarket.sol` has no supply awareness: listings rest against the
`(projectId, seller)` ERC-1155 balance, and a follow-on mint only increases a
holder's balance. So:

- No listing invalidation is needed on a mint.
- The per-asset terminal must surface `globalSupply` and the active
  `rounds[]` so a buyer sees "this project is in a live follow-on round at
  X USDG/claim, supply may grow by N" — that is material information and its
  omission would be misleading. See §5.

### 4.7 Failed / cancelled follow-on

`SETTLED_FAILED` (round didn't hit its own target by `closesAt`) refunds only
that round's committers and burns **exactly the units that round minted** —
never round-1 claims. Because `globalSupply` and each round's
`claimsCommitted` are tracked independently, the burn amount is unambiguous.
Existing holders and the secondary market are unaffected by a failed round
except that supply does not grow.

## 5. Frontend impact (what the terminal must show)

- A "Funding history" panel on the project page and terminal: rounds with
  price, raised/target, status, and whether one is `OPEN` now.
- Supply line in the stats ribbon: `globalSupply / totalClaimsMax`, so dilution
  headroom is visible.
- When `OPEN_ROUND`: a live "participate in this round" commitment path (analogous
  to the existing first-round commit flow) — **but** note the current product rule
  that a `FUNDING` asset is hidden from the *secondary market* (`isTradable` in
  `market-overview.tsx`, `tradingOpen` in `claim-trading-terminal.tsx`). A
  follow-on is `IN_PRODUCTION` *with* an open primary round; that combination is
  new and the gating rule must be re-read: primary round participation and
  secondary trading can legitimately coexist here. Keep them distinct surfaces.

## 6. Storage layout / upgrade path

If the protocol is deployed as-is (it is, on testnet 46630) these structs are an
**incompatible schema change**, so either:
(a) redeploy fresh (acceptable on testnet; the seeded HelioFrost round-1 is just
data), or
(b) make `ProjectRegistry` upgradeable and migrate each existing project by
synthesising `rounds[0]` from its current `claimPrice/totalClaims/target/
fundingDeadline` fields. (b) is the production-correct path but needs a UUPS
proxy and a migration script.

## 7. Test plan (Foundry)

- `proposeRound` rejects price < last settled round unless a governance vote
  approves (down-round path).
- `commitToRound` reverts when round not OPEN / after `closesAt` / when mint
  would exceed `totalClaimsMax`.
- `settleRound` funds → appends milestones, releases tranche 1 of the new
  schedule on vote; fails → refunds that round only, existing claims intact.
- Invariant: `globalSupply == sum(round.claimsCommitted for settled rounds)`
  and never `> totalClaimsMax`.
- Secondary market: an existing `IN_PRODUCTION` listing stays fillable across a
  follow-on mint/settle (no revert from supply change).

## 8. Risks & open questions

1. **Down-round consent** — 4.4 forbids them without a vote; is a vote weighted
   on *current* supply fair when a large single holder can block? Consider a
   coin-selection / snapshot rule.
2. **Round-1 vs round-2 seniority** — Option C treats all claims as equal
   (fully diluted, same claim on the hardware). If a follow-on should have
   *preference* on delivery, Option C is wrong and Option B (separate token id)
   is required. Product decision, not a technical one.
3. **Oracle/milestone reuse** — appending milestones shifts vote quorum bases;
   the quorum denominator must become `globalSupply`, not round-1 supply.
4. **Deadline extension ≠ new round** — sometimes a project just needs more time,
   not more money. That is a smaller feature (`extendFundingDeadline`, founder +
   holder vote) and should be specced separately so it doesn't get conflated with
   a capital raise.

## 9. One-line summary

Model funding as a **list of rounds under one tradable claim token**, priced no
lower than the prior round by default so scaling needs no vote, with new capital
bound to appended milestones and a failed round refunding only its own committers
— leaving the secondary market and existing holders untouched.
