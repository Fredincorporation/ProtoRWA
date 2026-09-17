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
    /// Determines whether an escrow milestone passes quorum and threshold.
    pub fn evaluate_consensus(
        &self,
        _milestone_id: U256,
        approve_weight: U256,
        reject_weight: U256,
        eligible_weight: U256,
        min_quorum_bps: U256,   // e.g. 3000 = 30%
        pass_threshold_bps: U256 // e.g. 6000 = 60%
    ) -> Result<bool, Vec<u8>> {
        if eligible_weight.is_zero() {
            return Ok(false);
        }

        let total_voted = approve_weight + reject_weight;
        let quorum_achieved = (total_voted * U256::from(10000)) / eligible_weight >= min_quorum_bps;

        let pass_achieved = if !total_voted.is_zero() {
            (approve_weight * U256::from(10000)) / total_voted >= pass_threshold_bps
        } else {
            false
        };

        Ok(quorum_achieved && pass_achieved)
    }

    /// Check if a given telemetry root has been attested
    pub fn is_telemetry_verified(&self, root: B256) -> Result<bool, Vec<u8>> {
        Ok(self.verified_telemetry_roots.get(root))
    }
}
