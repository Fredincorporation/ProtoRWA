# ProtoRWA (Tokenized Physical Hardware with Milestone Escrow)

[![Live on Robinhood Chain Testnet](https://img.shields.io/badge/Live-Robinhood%20Chain%20Testnet%20(46630)-emerald?style=for-the-badge)](https://explorer.testnet.chain.robinhood.com)
[![Settled in USDG](https://img.shields.io/badge/Settlement-USDG%20(USD%2C%206%20dp)-blue?style=for-the-badge)](https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F)
[![Arbitrum Stylus](https://img.shields.io/badge/Stylus-WASM%20Verifier-cyan?style=for-the-badge&logo=rust)](https://docs.arbitrum.io/stylus)

> **ProtoRWA** transforms physical hardware manufacturing into transparent, tokenized on-chain assets. Capital is held in cryptographic escrow and released tranche-by-tranche based on backer quorum and native WASM Merkle verification of sensor telemetry.

---

## 🏗️ The Problem ProtoRWA Solves

1. **Hardware Kickstarter Risk**: Backers commit funds upfront with zero visibility or recourse; founders can default or fail to deliver without releasing funds back to backers.
2. **Opaque Physical Progress**: Supply chain bills of materials (BOM), lab thermal cycling, and factory certifications are traditionally stored in disconnected PDF silos.
3. **Illiquid Pre-Order Commitments**: Backers who purchase pre-production claims are locked in until delivery (months to years later) with no secondary liquidity.

---

## ⚡ Architecture & Stack

ProtoRWA combines **Solidity protocol contracts**, high-performance **Stylus (Rust WASM)** verification, and a modern **Next.js 15 App Router** frontend. All value settles in **USDG** (a USD-pegged, 6-decimal stablecoin); native **ETH is used only for gas**.

```
┌────────────────────────────────────────────────────────┐
│              ProtoRWA Frontend (Next.js 15)           │
│  - Milestone Voting Terminal (Screen 06)               │
│  - Founder Evidence Submission Studio (Screen 27)      │
│  - Asset Claim Secondary Trading Terminal (Screen 23)  │
│  - Demo Mode Switcher (Backer / Founder / Trade)       │
└──────────────────────────┬─────────────────────────────┘
                           │
                 EVM RPC / Wagmi / Viem
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  Robinhood Chain Solidity   │   │   Stylus Verifier (Rust)    │
│  - ProjectRegistry.sol      │   │   HardwareVerifier (WASM)   │
│  - ClaimToken.sol (ERC1155) │   │   - Merkle proof validation │
│  - MilestoneEscrow.sol      │   │   - Telemetry attestation   │
│  - SecondaryMarket.sol      │   │   - Token-weighted quorum   │
│  (all settled in USDG)      │   │                             │
└─────────────────────────────┘   └─────────────────────────────┘
```

### Why a Stylus (Rust WASM) verifier?
Hardware telemetry verification (Merkle trees of sensor data, BOM hashes, and environmental test logs) requires heavy cryptographic computation (`keccak256` hashing across tree siblings).
Running this inside EVM bytecode would be prohibitive in gas and execution limits. By leveraging **Stylus**, `HardwareVerifier.wasm` executes at near-native speed with fractional gas costs.

---

## 📜 Verified On-Chain Deployment (Robinhood Chain Testnet — Chain ID: `46630`)

All protocol contracts are deployed on Robinhood Chain testnet with wired and verified roles. Settlement is **USDG** throughout; native ETH is gas only.

| Contract | Address | Explorer |
| :--- | :--- | :--- |
| **ProjectRegistry** | `0xb1432dCD392eD0296E2d72c000850Fb3b2f68DFF` | [View](https://explorer.testnet.chain.robinhood.com/address/0xb1432dCD392eD0296E2d72c000850Fb3b2f68DFF) |
| **ClaimToken (ERC-1155)** | `0x691f490F01cf808987540F34724253eA54B221D8` | [View](https://explorer.testnet.chain.robinhood.com/address/0x691f490F01cf808987540F34724253eA54B221D8) |
| **MilestoneEscrow** | `0x2d57cc0e20e742E9E451aC4d340A0013b3b3Cd00` | [View](https://explorer.testnet.chain.robinhood.com/address/0x2d57cc0e20e742E9E451aC4d340A0013b3b3Cd00) |
| **SecondaryMarket** | `0x232FBC0085cd182Afe7838864C26824a48F3B504` | [View](https://explorer.testnet.chain.robinhood.com/address/0x232FBC0085cd182Afe7838864C26824a48F3B504) |
| **HardwareVerifier (Stylus WASM)** | `0x774a47d68c0148ffa14a154beb740154f0e4c129` | [View](https://explorer.testnet.chain.robinhood.com/address/0x774a47d68c0148ffa14a154beb740154f0e4c129) |
| **USDG (settlement token)** | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | [View](https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F) |

Role wiring, USDG settlement, the market fee skim, bid/list escrow round-trips and holder refunds are exercised against this deployment by the shell E2Es in `contracts/` (`e2e-robinhood.sh`, `e2e-market-refund.sh`), which read their target addresses from `frontend/.env.local`.

### 🟢 Live Seeded Hardware Project — HelioFrost Pro (Project #1)
The showcase project is created on the live registry above:
- **Project ID**: `1`
- **Status**: `FUNDING`
- **Target**: `5,000 USDG` (1,000 claim units @ 5 USDG each)
- **On-chain Milestone Count**: `4 tranches`
- Seeded via `contracts/script/SeedLiveProject.sol`.

---

## 🚀 Key User Journeys & Screen Implementations

1. **Backer Voting & Escrow Consensus Terminal (Screen 06)**:
   - Route: `/projects/[slug]/milestones/[milestoneIndex]/vote`
   - Real-time `QuorumMeter`, IPFS evidence inspector, Stylus Oracle attestation badge, and permissionless settlement triggers.
2. **Founder Milestone Evidence Studio (Screen 27)**:
   - Route: `/studio/[slug]/milestones/[milestoneIndex]/submit`
   - Form for uploading factory BOM receipts, QA reports, and trigger for `HardwareVerifier` WASM Merkle evaluation.
3. **Claim Trading Terminal (Screen 23)**:
   - Route: `/market/p/[id]`
   - Live two-column orderbook ladder with bid/ask depth, recent fills ledger, order slip with 1% protocol fee calculation, and physical unit redemption card.
4. **Demo Mode Switcher**:
   - Header pill component allowing reviewers to immediately jump between:
     - 🗳️ **Backer Vote**
     - 🏭 **Founder Submit**
     - 📈 **Trade Claim**

---

## 🛠️ Local Development

### Prerequisites
- Node.js >= 18
- pnpm >= 9
- Rust & Cargo (`wasm32-unknown-unknown` target installed)
- Foundry (`forge` and `cast`)

### Setup & Run
```bash
# Install dependencies
pnpm install

# Build all packages (contracts, shared, frontend)
pnpm build

# Start Next.js development server
pnpm --filter @protorwa/frontend dev
```

Visit `http://localhost:3000`.

