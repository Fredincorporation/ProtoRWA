// Arbitrum Stylus Hardware & Milestone Verifier
// High-performance WASM execution for physical hardware RWA verification and quorum calculation.

#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

use alloc::vec::Vec;
use stylus_sdk::{
    alloy_primitives::{Address, B256, U256},
    crypto::keccak,
    prelude::*,
};


sol_storage! {
    #[entrypoint]
    pub struct HardwareVerifier {
        address admin;
        mapping(bytes32 => bool) verified_telemetry_roots;
        mapping(uint256 => bool) milestone_passed;
    }
}

#[public]
impl HardwareVerifier {
    /// Initialize verifier with admin address.
    pub fn init(&mut self, initial_admin: Address) -> Result<(), Vec<u8>> {
        let current_admin = self.admin.get();
        if current_admin != Address::ZERO {
            return Err("Already initialized".into());
        }
        self.admin.set(initial_admin);
        Ok(())
    }

    /// Verifies hardware sensor telemetry and BOM components Merkle proof on Arbitrum Stylus.
    /// Executes at native speed with fractional gas cost compared to standard EVM.
    pub fn verify_hardware_batch(
        &mut self,
        _project_hash: B256,
        milestone_id: U256,
        batch_root: B256,
        proof: Vec<B256>,
        leaf: B256,
    ) -> Result<bool, Vec<u8>> {
        // Verify Merkle branch
        let mut computed = leaf;
        for sibling in proof {
            let combined = if computed <= sibling {
                [computed.as_slice(), sibling.as_slice()].concat()
            } else {
                [sibling.as_slice(), computed.as_slice()].concat()
            };
            computed = keccak(&combined);
        }

        let is_valid = computed == batch_root;
        if is_valid {
            self.verified_telemetry_roots.setter(batch_root).set(true);
            self.milestone_passed.setter(milestone_id).set(true);
        }

        Ok(is_valid)
    }

    /// High-precision token-weighted quorum consensus calculator.
    ///
    /// Mirrors `MilestoneEscrow.settleReview()` exactly. The two MUST agree: the
    /// escrow is the contract that actually moves money, and this function is
    /// what the UI and the oracle use to predict its decision. A divergence here
    /// means the interface reports an outcome the chain will not produce.
    ///
    /// Two details are easy to get wrong and are the reason this takes explicit
    /// abstain weight:
    ///
    ///   1. Abstentions count toward QUORUM but not toward the approval
    ///      threshold. Omitting them understates participation, so a milestone
    ///      that the escrow would approve reads as "below quorum" here.
    ///   2. The threshold is measured against ELIGIBLE weight, not against the
    ///      weight that voted. Dividing by `total_voted` inflates the ratio and
    ///      would pass a proposal the escrow rejects.
    #[allow(clippy::too_many_arguments)]
    pub fn evaluate_consensus(
        &self,
        _milestone_id: U256,
        approve_weight: U256,
        reject_weight: U256,
        abstain_weight: U256,
        eligible_weight: U256,
        min_quorum_bps: U256,    // e.g. 2500 = 25%
        pass_threshold_bps: U256 // e.g. 6000 = 60%
    ) -> Result<bool, Vec<u8>> {
        if eligible_weight.is_zero() {
            return Ok(false);
        }

        let bps = U256::from(10_000);

        // Participation includes abstentions, matching the escrow's `cast`.
        let total_cast = approve_weight + reject_weight + abstain_weight;
        let quorum_target = (eligible_weight * min_quorum_bps) / bps;
        let quorum_achieved = total_cast >= quorum_target;

        // Approval is measured against eligible weight, not against votes cast.
        let approval_target = (eligible_weight * pass_threshold_bps) / bps;
        let pass_achieved = approve_weight >= approval_target;

        Ok(quorum_achieved && pass_achieved)
    }

    /// Check if a given telemetry root has been attested
    pub fn is_telemetry_verified(&self, root: B256) -> Result<bool, Vec<u8>> {
        Ok(self.verified_telemetry_roots.get(root))
    }
}

/// Prints this contract's Solidity interface to stdout.
///
/// Called by the binary target in `src/main.rs` so that `cargo stylus` can read
/// the interface via `cargo run --features export-abi -- <command>`. Without it
/// the reflection call produces no output, the deployer records an empty ABI,
/// and the resulting contract reverts on every selector because it has no
/// discoverable methods.
///
/// Gated behind the feature because the SDK only derives `GenerateAbi` when
/// `export-abi` is enabled - an unconditional call would not compile under a
/// plain `cargo build`.
#[cfg(feature = "export-abi")]
pub fn print_abi() {
    use stylus_sdk::abi::export::print_from_args;
    print_from_args::<HardwareVerifier>();
}
