//! Binary target that `cargo stylus` runs to reflect on the contract.
//!
//! Why this file must exist
//! ------------------------
//! `cargo-stylus` does not read the ABI from the compiled wasm. It *runs the
//! crate natively* and reads the contract's reflection output from stdout:
//!
//! ```text
//! cargo run --target <host> --features export-abi -- <command>
//! ```
//!
//! (see `stylus-tools/src/core/reflection/mod.rs`). A crate that declares only
//! `crate-type = ["lib", "cdylib"]` therefore fails at the last step of a deploy
//! with:
//!
//!   error: a bin target must be available for `cargo run`
//!   failed to run contract
//!
//! Why an empty main is not enough
//! -------------------------------
//! A previous version of this file had an empty `fn main() {}`. That satisfied
//! `cargo run` and made the deploy *appear* to succeed, but printed nothing on
//! stdout, so every reflection call returned empty data and the ABI was empty.
//! The deploy then wrote a contract with no discoverable interface - which is
//! indistinguishable from a working deploy until something calls it, and then
//! reverts with empty data.
//!
//! What this does instead
//! ----------------------
//! Delegates to the SDK's own generated entrypoint, which only exists when the
//! `export-abi` feature is enabled. `stylus_sdk::abi::export` parses the CLI
//! arguments (`abi`, `constructor`) and prints the corresponding interface.
//!
//! The `#[cfg]` guard matters: the SDK derives that entrypoint only behind the
//! feature, so calling it unconditionally would fail to compile under a plain
//! `cargo build`.

fn main() {
    #[cfg(feature = "export-abi")]
    {
        // Prints the Solidity interface, or the constructor signature when run
        // as `... -- constructor`, matching what `cargo-stylus` expects.
        hardware_verifier::print_abi();

        // The reflection protocol is line-oriented and the parent process reads
        // stdout to completion. Without an explicit flush the output can be lost
        // when the process exits during a pipe read, which reproduces the
        // "ran fine but reported nothing" failure this file exists to fix.
        use std::io::Write;
        let _ = std::io::stdout().flush();
    }

    #[cfg(not(feature = "export-abi"))]
    {
        // Without the feature there is no reflection to export. Kept as an
        // explicit, loud failure rather than a silent no-op: an empty main is
        // exactly the bug described above, and it is invisible at the call site.
        eprintln!(
            "hardware-verifier: built without the `export-abi` feature.\n\
             This binary exists so `cargo stylus` can reflect on the contract, \
             which requires that feature. Run via `cargo stylus export-abi` or \
             `cargo stylus deploy`, both of which enable it automatically."
        );
        std::process::exit(1);
    }
}
