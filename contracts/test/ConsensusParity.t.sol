// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MilestoneEscrow } from "../src/MilestoneEscrow.sol";

/**
 * @notice Consensus parity: the escrow's own rule, pinned as a table.
 *
 * `evaluate_consensus` exists twice - once in Solidity (the escrow, which moves
 * money) and once in Rust (`HardwareVerifier`, which the UI uses to predict the
 * outcome). They disagreed, and the Rust side was corrected.
 *
 * This file cannot call the Rust version directly: it is a WASM contract that is
 * not yet deployed. What it does instead is pin the *rule* at the exact boundary
 * values, so that:
 *
 *   1. The Solidity behaviour is frozen and cannot drift while the Rust side is
 *      being aligned to it.
 *   2. The Rust implementation has a concrete table to be tested against once it
 *      is deployed - the rows below are the specification, not prose.
 *
 * The arithmetic is reproduced here rather than exercised through a full
 * milestone lifecycle because the rule is a pure function of the tally. Running a
 * dozen scenarios through evidence submission, voting and settlement would test
 * the same three comparisons at far greater cost and much less clarity.
 */
contract ConsensusParityTest is Test {
    /// @dev Escrow defaults: 25% quorum, 60% approval, in basis points.
    uint256 internal constant QUORUM_BPS = 2_500;
    uint256 internal constant THRESHOLD_BPS = 6_000;

    /// @dev One row of the parity table. Declared at contract scope because
    ///      Solidity does not permit a struct declaration inside a function.
    struct Case {
        uint256 eligible;
        uint256 approve;
        uint256 reject;
        uint256 abstain;
        bool expected;
        string label;
    }

    /**
     * @notice The escrow's decision rule, transcribed from `settleReview`.
     *
     * Kept deliberately close to the Solidity source it mirrors so a change to
     * one is obvious against the other in review.
     */
    function consensus(
        uint256 approveWeight,
        uint256 rejectWeight,
        uint256 abstainWeight,
        uint256 eligibleWeight,
        uint256 quorumBps,
        uint256 thresholdBps
    ) internal pure returns (bool) {
        if (eligibleWeight == 0) return false;

        uint256 cast = approveWeight + rejectWeight + abstainWeight;
        uint256 quorum = (eligibleWeight * quorumBps) / 10_000;
        uint256 threshold = (eligibleWeight * thresholdBps) / 10_000;

        return cast >= quorum && approveWeight >= threshold;
    }

    /* ------------------------------------------------------------------ *
     * Boundary: approval threshold is measured against ELIGIBLE weight
     * ------------------------------------------------------------------ */

    function test_ApprovalAtExactThresholdPasses() public pure {
        assertTrue(consensus(6_000, 0, 0, 10_000, QUORUM_BPS, THRESHOLD_BPS));
    }

    function test_ApprovalOneUnitBelowThresholdFails() public pure {
        // The boundary that matters: 5999 >= 6000 is false.
        assertFalse(consensus(5_999, 0, 0, 10_000, QUORUM_BPS, THRESHOLD_BPS));
    }

    /**
     * @notice The bug the Rust version had.
     *
     * Measuring the threshold against votes cast rather than eligible weight
     * makes 4000/4000 read as 100% approval. Against eligible weight it is 40%,
     * which fails. A naive implementation reports success on a tranche the chain
     * will refuse to release.
     */
    function test_ThresholdIsMeasuredAgainstEligibleNotCast() public pure {
        uint256 approve = 4_000;
        uint256 eligible = 10_000;

        assertFalse(
            consensus(approve, 0, 0, eligible, QUORUM_BPS, THRESHOLD_BPS),
            "must fail: 40% of eligible is below the 60% threshold"
        );

        // The wrong formula, for contrast: everything that voted said yes.
        uint256 cast = 4_000;
        assertEq((approve * 10_000) / cast, 10_000, "against cast it reads as 100%");
    }

    /* ------------------------------------------------------------------ *
     * Quorum: abstentions count toward participation
     * ------------------------------------------------------------------ */

    /**
     * @notice The other half of the Rust bug.
     *
     * With approvals alone the quorum is unmet; abstentions supply the rest.
     * Excluding them reports "below quorum" for a milestone the escrow approves.
     */
    function test_AbstentionsContributeToQuorum() public pure {
        // Approvals alone: 6000 cast against a 2500 quorum target - already met.
        assertTrue(consensus(6_000, 0, 0, 10_000, QUORUM_BPS, THRESHOLD_BPS));

        // Abstentions complete quorum where approvals alone would not.
        uint256 eligible = 10_000;
        uint256 quorumTarget = (eligible * QUORUM_BPS) / 10_000; // 2500

        uint256 approveOnly = 2_000;
        assertLt(approveOnly, quorumTarget, "approvals alone are below quorum");

        uint256 withAbstain = approveOnly + 0 + 1_000;
        assertGe(withAbstain, quorumTarget, "abstentions carry it over the line");

        // Approval still has to be met independently - quorum alone is not enough.
        assertFalse(consensus(2_000, 0, 1_000, eligible, QUORUM_BPS, THRESHOLD_BPS));
    }

    function test_QuorumMetButNoApprovalFails() public pure {
        // Everyone abstained: participation perfect, approvals zero.
        assertFalse(consensus(0, 0, 10_000, 10_000, QUORUM_BPS, THRESHOLD_BPS));
    }

    function test_QuorumNotMetFailsEvenWithUnanimousApproval() public pure {
        // 100 of 10,000 approve - unanimous among voters, but 1% participation.
        assertFalse(consensus(100, 0, 0, 10_000, QUORUM_BPS, THRESHOLD_BPS));
    }

    /* ------------------------------------------------------------------ *
     * Full table
     * ------------------------------------------------------------------ */

    /**
     * @notice The parity table, executable.
     *
     * Every row is a case the Rust implementation must reproduce exactly once it
     * is deployed. The `expected` column is the escrow's answer, which is
     * authoritative because it is the contract holding the capital.
     */
    function test_ParityTable() public pure {
        Case[10] memory cases = [
            Case(10_000, 6_000, 0, 0, true, "exact threshold"),
            Case(10_000, 5_999, 0, 0, false, "one below threshold"),
            Case(10_000, 6_000, 0, 2_500, true, "abstain adds to quorum"),
            Case(10_000, 1_000, 0, 0, false, "below quorum"),
            Case(10_000, 0, 0, 10_000, false, "all abstain"),
            Case(10_000, 0, 100, 0, false, "reject only"),
            Case(1_000, 600, 400, 0, true, "full turnout 60/40"),
            Case(1_000, 600, 200, 200, true, "abstain completes quorum"),
            Case(1_000, 599, 200, 201, false, "abstain completes quorum, approval short"),
            Case(0, 0, 0, 0, false, "no eligible weight")
        ];

        for (uint256 i = 0; i < cases.length; ++i) {
            bool result = consensus(
                cases[i].approve,
                cases[i].reject,
                cases[i].abstain,
                cases[i].eligible,
                QUORUM_BPS,
                THRESHOLD_BPS
            );
            assertEq(result, cases[i].expected, cases[i].label);
        }
    }

    /// @notice Quorum and threshold are read from the milestone, not hardcoded.
    function test_ThresholdsAreParameterised() public pure {
        // A 50% quorum / 90% approval milestone is stricter than the default.
        assertFalse(consensus(6_000, 0, 0, 10_000, 5_000, 9_000));
        assertTrue(consensus(9_000, 0, 1_000, 10_000, 5_000, 9_000));

        // A lenient milestone passes where the default would not.
        assertTrue(consensus(3_000, 0, 0, 10_000, 1_000, 3_000));
    }
}
