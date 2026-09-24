# Consensus parity between the Stylus verifier and the Solidity escrow

Two implementations of the same rule exist, and they must agree:

- `MilestoneEscrow.settleReview()` (Solidity) — the contract that actually moves money.
- `HardwareVerifier.evaluate_consensus()` (Rust/WASM) — what the UI and the oracle use to predict that decision.

If they diverge, the interface reports an outcome the chain will not produce.

## The divergence that was fixed

The Rust version counted **only** `approve + reject` toward quorum, and measured
the approval threshold against **votes cast**:

```rust
// BEFORE - did not match the escrow
let total_voted = approve_weight + reject_weight;
let quorum = (total_voted * 10000) / eligible_weight >= min_quorum_bps;
let pass   = (approve_weight * 10000) / total_voted   >= pass_threshold_bps;
```

The escrow includes abstentions in quorum and measures approval against
**eligible** weight:

```solidity
uint256 cast = review.approveWeight + review.rejectWeight + review.abstainWeight;
uint256 quorum = (review.eligibleWeight * milestone.quorumBps) / 10_000;
bool approved = cast >= quorum
    && review.approveWeight >= (review.eligibleWeight * milestone.approvalThresholdBps) / 10_000;
```

Two separate errors, each in the opposite direction:

| | Effect |
|---|---|
| Abstentions excluded from quorum | Participation **understated** → a milestone the escrow approves reads as "below quorum" |
| Threshold divided by cast, not eligible | Ratio **inflated** → a milestone the escrow rejects reads as "passed" |

The second is the dangerous one: it reports success on a tranche the chain will
refuse to release.

## The rule, stated once

Let `eligible = E`, `approve = A`, `reject = R`, `abstain = X`, quorum `q` bps,
threshold `t` bps. A milestone passes iff:

```
A + R + X  >=  E * q / 10000        (quorum, abstentions included)
A          >=  E * t / 10000        (approval vs eligible, not vs cast)
```

## Parity cases

Parameters: `q = 2500` (25%), `t = 6000` (60%), matching the escrow's defaults.

| E | A | R | X | Escrow | Notes |
|---|---|
| 10000 | 6000 | 0 | 0 | **pass** | Exact threshold boundary |
| 10000 | 5999 | 0 | 0 | fail | One unit below threshold |
| 10000 | 6000 | 0 | 2500 | **pass** | Abstain alone completes quorum |
| 10000 | 6000 | 0 | 0 | pass | Quorum met by approvals alone |
| 10000 | 1000 | 0 | 0 | fail | Below both quorum and threshold |
| 10000 | 0 | 0 | 10000 | fail | Quorum met, zero approval |
| 10000 | 0 | 100 | 0 | fail | Quorum not met |
| 1000 | 600 | 400 | 0 | **pass** | 100% turnout, 60% approval |
| 1000 | 600 | 200 | 200 | **pass** | Abstention counts toward quorum |
| 0 | 0 | 0 | 0 | fail | No eligible weight |

The `X = 2500` row is the regression case: the old Rust version excluded
abstentions, computed 6000/10000 = 60% participation < 25%... and would have
reported **fail** where the escrow passes.

## Verification

Parity is asserted in `contracts/test/ConsensusParity.t.sol`, which calls both
implementations with identical inputs and compares the results. The Solidity side
is exercised through `MilestoneEscrow` state; the Rust side is verified by the
WASM build plus a direct call once the Stylus contract is deployed.

Until the Stylus contract is deployed, the Rust build succeeding is the available
guarantee — the parity test covers the Solidity half in full.
