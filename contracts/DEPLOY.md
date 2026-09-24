# Deploying ProtoRWA to Robinhood Chain

The contracts settle in **USDG** (Paxos Global Dollar), so a deployment needs an
ERC-20 payment token address rather than native ETH.

## Prerequisites

| Requirement | Why |
|---|---|
| `forge` on PATH | `~/.foundry/bin` is not on PATH by default on this machine |
| A funded key | Deployment costs gas. Gas is paid in the chain's **native ETH**, even on a testnet |
| USDG on the target chain | Set as `PAYMENT_TOKEN` |

### On "a funded key"

A testnet deployment still costs gas. The gas token on Robinhood Chain is ETH
(18 decimals) regardless of the fact that the *escrow* denominates in USDG
(6 decimals) — those are two separate things:

- **Gas** → native ETH, paid by the deployer to the chain.
- **Escrow settlement** → USDG, transferred between users and the protocol.

So you need a wallet holding a small amount of Robinhood Chain testnet ETH. Any
wallet works; export its private key and pass it as `PRIVATE_KEY`. If you would
rather not handle a raw key, `forge script --ledger` or `--trezor` will use a
hardware wallet instead, and `--account <name>` uses a Foundry keystore created
with `cast wallet import`.

Never commit the key. `contracts/.env` is gitignored for this purpose.

## Verified USDG addresses

Each was confirmed by reading `symbol()`, `name()` and `decimals()` over RPC —
they are not copied from documentation on trust.

| Chain | ID | USDG | Verified |
|---|---|
| Robinhood testnet | 46630 | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | `USDG` / `Global Dollar` / 6 |
| Robinhood mainnet | 4663 | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `USDG` / `Global Dollar` / 6 |
| Arbitrum Sepolia | 421614 | `0xFFC95faa3d63Cde504a05B567C600B78C0b41892` | `USDG` / `Global Dollar` / 6 |

## Deploy

From `contracts/`:

```bash
export PATH="$HOME/.foundry/bin:$PATH"

export PRIVATE_KEY=0x...                          # funded with testnet ETH
export PAYMENT_TOKEN=0x7E955252E15c84f5768B83c41a71F9eba181802F   # USDG
export FEE_RECIPIENT=0x...                        # optional; defaults to deployer
export HARDWARE_VERIFIER=0x774a47d68c0148ffa14a154beb740154f0e4c129  # optional; see below

# 1. Simulate first. Confirms the addresses and the gas cost, broadcasts nothing.
forge script "script/Deploy.sol:Deploy" \
  --rpc-url https://rpc.testnet.chain.robinhood.com

# 2. Broadcast for real.
forge script "script/Deploy.sol:Deploy" \
  --rpc-url https://rpc.testnet.chain.robinhood.com \
  --broadcast
```

The script prints a ready-to-paste `.env` block when it finishes.

> The `path/File.sol:ContractName` form is required. Foundry 1.8 rejects a bare
> `forge script/Deploy.sol` with "the path ... is not valid", because it parses
> the positional argument as a path rather than a script identifier.

## Wire the addresses into the app

The printed output maps onto `frontend/.env.local`. For the **testnet**, use the
testnet-prefixed names:

```bash
NEXT_PUBLIC_ROBINHOOD_TESTNET_CHAIN_ID=46630
NEXT_PUBLIC_ROBINHOOD_TESTNET_PROJECT_REGISTRY=0x...
NEXT_PUBLIC_ROBINHOOD_TESTNET_CLAIM_TOKEN=0x...
NEXT_PUBLIC_ROBINHOOD_TESTNET_MILESTONE_ESCROW=0x...
NEXT_PUBLIC_ROBINHOOD_TESTNET_SECONDARY_MARKET=0x...
NEXT_PUBLIC_ROBINHOOD_TESTNET_USDG=0x7E955252E15c84f5768B83c41a71F9eba181802F
```

No code change is needed: `shared/src/contracts/addresses.ts` already registers
both Robinhood chain ids, and a missing value renders as "not deployed" rather
than silently resolving to a stale address.

## Hardware attestation (escrow → Stylus)

When `HARDWARE_VERIFIER` is set, `MilestoneEscrow` is constructed with that
address as an immutable `verifier`, and hardware milestones are gated on a real
on-chain call into the Stylus contract:

1. The founder calls `setCommitment(projectId, milestoneIndex, root)` to commit a
   Merkle root **before** the review opens. It is one-shot: a second call reverts
   `CommitmentLocked`, so the root cannot be tailored to evidence already known.
2. The founder calls `submitEvidence(projectId, milestoneIndex, cid, leaf, proof)`.
   If a root is committed, the escrow calls
   `verifier.verifyHardwareBatch(projectHash, compositeId, root, proof, leaf)` and
   reverts `AttestationFailed` unless the Stylus recomputes `root` from `leaf` +
   `proof`. Only then does it snapshot eligible weight and open the vote.

Milestones with **no** committed root skip the verifier entirely, so a deployment
with `HARDWARE_VERIFIER=address(0)` (or a project that never opts in) behaves
exactly as before this feature — attestation is per-milestone opt-in.

The proof is a sorted-pair keccak Merkle branch (`keccak(min(a,b) ‖ max(a,b))`),
the same scheme the client builds in `frontend/src/lib/studio/merkle.ts` and the
Rust verifier in `stylus/hardware-verifier/src/lib.rs`.

Proven live on 46630 by `contracts/e2e-robinhood.sh` (step 7): `isTelemetryVerified(root)`
is `false` before `submitEvidence` and `true` immediately after — the `true` can
only come from the escrow's call, attesting that the review opened via the Stylus.

## Stylus HardwareVerifier
`script/Deploy.sol` deploys the four Solidity contracts. The `HardwareVerifier`
is a **separate Stylus (Rust/WASM) deployment** and is not covered by that
script.

### The WASM builds and is deployment-ready
```
target/wasm32-unknown-unknown/release/hardware_verifier.wasm
  45,172 bytes   magic 0x0061736d   (valid WASM)
```

That is inside Arbitrum's 128 KB contract limit. It is above the 24 KB
"activate without a paid cache manager" threshold, so `activate` on a public
chain will need `--use-cache-manager` (Arbitrum's bid mechanism for the shared
cache slot). Deploy with `--no-verify` first to see the real activation cost.

### DEPLOYED AND WORKING on Robinhood Chain testnet
```
HardwareVerifier  0x774a47d68c0148ffa14a154beb740154f0e4c129
```

Proven by exercising the interface, not by inspecting bytecode:

```
isTelemetryVerified(leaf)   false        before
verifyHardwareBatch(...)    status 0x1   keccak + Styus storage write
isTelemetryVerified(leaf)   true         after
```

All 12 consensus parity cases also return their expected values on-chain,
including the two the pre-fix Rust got wrong.

### The ABI is camelCase, not snake_case
This is the single most important operational detail here, and the cause of a
long detour:

```solidity
function init(address initial_admin)                  // snake_case
function verifyHardwareBatch(bytes32, uint256, ...)   // camelCase
function evaluateConsensus(uint256, ...)              // camelCase
function isTelemetryVerified(bytes32)                 // camelCase
```

The Rust methods are `verify_hardware_batch`, `evaluate_consensus` and
`is_telemetry_verified`; the SDK exports them camelCased. **Calling the Rust
spelling hits an unknown selector and reverts with empty data** (`data: "0x"`).

An unknown selector is indistinguishable from a dead contract on the client
side - both revert with no return data. That ambiguity produced several wrong
theories about this deployment (VM version mismatch, a stub artifact, an
unactivated program) when the contract had been working the entire time.

Confirm the interface before concluding a Stylus contract is broken:

```bash
cargo stylus export-abi --rust-features export-abi
```

### The `[[bin]]` target and why it is required
`cargo-stylus` does not read the ABI from the compiled wasm. It **runs the crate
natively** and reads reflection output from stdout:

```
cargo run --target <host> --features export-abi -- <command>
```

(see `stylus-tools/src/core/reflection/mod.rs`). Three configurations, only the
third of which works:

| `[[bin]]` | Result |
|---|---|
| absent | Deploy aborts: `a bin target must be available for cargo run` |
| present, empty `main()` | Deploy **succeeds**, but the contract exposes an empty ABI - no discoverable methods, so every call reverts |
| present, delegating to `print_abi()` | Deploy succeeds **and** the contract works |

The middle row is the dangerous one: valid bytecode, normal receipt, real
activation record, and every call reverting. Nothing looks wrong until something
calls the contract.

`src/main.rs` therefore calls `hardware_verifier::print_abi()`, which invokes the
SDK's `print_from_args::<HardwareVerifier>()`. It is gated behind the
`export-abi` feature because the SDK only derives `GenerateAbi` when that feature
is enabled.

At ~14.4 KB compressed the contract sits under the 24 KB threshold, so **no cache
manager is needed** - the plain deploy activates it for the base fee.

### Windows cannot run `cargo-stylus` — use WSL
**0.10.9 is the latest published release** and its `debug_hook` module
hard-imports Unix sockets:

```
error[E0433]: cannot find `unix` in `os`
  --> cargo-stylus-0.10.9/src/commands/debug_hook.rs:12:9
   |     os::unix::net::{UnixListener, UnixStream},
```

No newer version and no feature flag, so the CLI only builds on Linux or macOS.
**WSL is the fix** — a real Linux kernel, so the Unix-socket import resolves:

```bash
# One-time setup inside WSL
curl -L https://foundry.paradigm.xyz | bash   # installs foundryup
~/.foundry/bin/foundryup                      # installs forge, cast, anvil
cargo install cargo-stylus                    # builds natively on Linux
```

Then, from the repo root on the Windows side:

```bash
wsl -e bash -lc "
  export PATH=\$HOME/.cargo/bin:\$HOME/.foundry/bin:\$PATH
  cd /mnt/c/Users/<you>/Documents/GitHub/ProtoRWA/contracts/stylus/hardware-verifier
  cargo stylus deploy --private-key \$PRIVATE_KEY \
    --endpoint https://rpc.testnet.chain.robinhood.com
"
```

Two non-obvious requirements:

1. **`cargo stylus deploy` needs a `[[bin]]` target.** The crate is
   `crate-type = ["lib", "cdylib"]` for the Stylus runtime, but the deployer
   `cargo run`s the crate for its constructor check and fails at the final step
   with *"a bin target must be available for cargo run"*. `src/main.rs` exists
   solely to satisfy that resolution.
2. **`--no-verify` is needed without Docker.** The default `deploy` shells out to
   a reproducible Docker build that is not present here. `--no-verify` deploys
   the locally-built WASM instead.

### Rust toolchain note
`stylus-sdk 0.10.9` pulls in a `trybuild` that requires Rust >= 1.88. This
machine has 1.87, which fails with a `rustc 1.87.0 is not supported` error. The
conflicting crate is pinned in `Cargo.lock` to a compatible version; a newer
Rust toolchain removes the need for that pin.

## Post-deploy checklist

1. `cast call <escrow> "totalAccounted()(uint256)" --rpc-url ...` → should be `0`.
2. Create a project and commit USDG.
3. `cast call <escrow> "escrowBalance(uint256)(uint256)" <projectId>` → must equal
   the committed amount. **This is the check that matters**: before the ERC-20
   accounting fix it returned `0` while the tokens sat in the contract, and every
   release and refund then failed.
