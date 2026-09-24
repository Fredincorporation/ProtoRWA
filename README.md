# ProtoRWA (Tokenized Physical Hardware with Milestone Escrow)

[![Live on Robinhood Chain Testnet](https://img.shields.io/badge/Live-Robinhood%20Chain%20Testnet%20(46630)-emerald?style=for-the-badge)](https://explorer.testnet.chain.robinhood.com)
[![Settled in USDG](https://img.shields.io/badge/Settlement-USDG%20(USD%2C%206%20dp)-blue?style=for-the-badge)](https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F)
[![Stylus Verifier](https://img.shields.io/badge/Stylus-WASM%20Verifier-cyan?style=for-the-badge&logo=rust)](https://docs.arbitrum.io/stylus)

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
│  - Per-role mission-control dashboards (Investor /     │
│    Founder / Admin), 3-column social layout            │
│  - Founder network: profiles, update composer, follow  │
│    feed (FounderActivity + IPFS)                       │
│  - Milestone Voting Terminal                            │
│  - Founder Evidence Submission Studio                  │
│  - Asset Claim Secondary Trading Terminal              │
│  - Notifications engine (derived from live escrow)     │
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
│  - FounderActivity.sol      │   │                             │
│  (money settled in USDG)    │   │                             │
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
| **ProjectRegistry** | `0x5ceFdd224435BCd5D15C168a8d49d1640bC2FA2d` | [View](https://explorer.testnet.chain.robinhood.com/address/0x5ceFdd224435BCd5D15C168a8d49d1640bC2FA2d) |
| **ClaimToken (ERC-1155)** | `0xDf349ff9E061A5A97a2CB1A35ba76A687f3648f3` | [View](https://explorer.testnet.chain.robinhood.com/address/0xDf349ff9E061A5A97a2CB1A35ba76A687f3648f3) |
| **MilestoneEscrow** | `0x7e433fd9fD65B6dD3Fd085361EC39BAb8ce37E70` | [View](https://explorer.testnet.chain.robinhood.com/address/0x7e433fd9fD65B6dD3Fd085361EC39BAb8ce37E70) |
| **SecondaryMarket** | `0x762D4A7d5dfa6287a729FC2B64C75b754A980705` | [View](https://explorer.testnet.chain.robinhood.com/address/0x762D4A7d5dfa6287a729FC2B64C75b754A980705) |
| **HardwareVerifier (Stylus WASM)** | `0x774a47d68c0148ffa14a154beb740154f0e4c129` | [View](https://explorer.testnet.chain.robinhood.com/address/0x774a47d68c0148ffa14a154beb740154f0e4c129) |
| **FounderActivity (social)** | `0x540AA4B3225bC2f6d038Bd84c18Ff1bb1Cd6DE31` | [View](https://explorer.testnet.chain.robinhood.com/address/0x540AA4B3225bC2f6d038Bd84c18Ff1bb1Cd6DE31) |
| **USDG (settlement token)** | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | [View](https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F) |

These are the addresses the frontend resolves via `NEXT_PUBLIC_ROBINHOOD_TESTNET_*` in `frontend/.env.local` and `shared/src/contracts/addresses.ts` (chain `46630`). Role wiring, USDG settlement, the market fee skim, bid/list escrow round-trips and holder refunds are exercised against this deployment by the shell E2Es in `contracts/` (`e2e-robinhood.sh`, `e2e-market-refund.sh`). `FounderActivity` is a standalone social contract (register / profile / post / follow) deployed against the same live registry — the money contracts are untouched by it, and its write path (`registerFounder` → `setProfile` → `postUpdate`) is verified live on `46630`.

### 🟢 Seeded Showcase Hardware Project — HelioFrost Pro (Project #1)
The flagship project is created on the live registry above (founder = the deployer wallet) and is
presented in the product as a **showcase / demo** build — its secondary-market surface is labelled
`demo`, not real liquidity, so the honest demo/live distinction stays visible:
- **Project ID**: `1`
- **Claims**: 1,000 claim units @ 5 USDG each
- **On-chain Milestone Count**: `4 tranches`
- Seeded via `contracts/script/SeedLiveProject.sol`; founder social activity (register / profile / a posted update) is live on `FounderActivity` for this project.

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
4. **Per-role Mission Control Dashboards**:
   - Route: `/dashboard/[role]` — `investor` · `founder` · `admin`
   - A persona-aware, 3-column shell: identity + persona switcher + social rails on the left, the social feed and actionable queues in the center, network/escrow activity on the right. Tabs embed the same self-contained action components the standalone routes mount (invest / vote / trade / refund / evidence / oversight), and only the active tab is mounted so chain reads stay scoped. The admin persona is gated on the connected wallet holding `ORACLE_ROLE` on-chain.
5. **Founder Network & Social Layer** (FounderActivity + IPFS):
   - Routes: `/founders` (directory), `/founders/[handle]` (profile), `/studio/updates` (composer)
   - Founders register against a project they own, pin a profile doc + update docs to IPFS, and post build updates; investors follow registered founders and get those updates in a personalized feed. Only addresses that own a project are followable.
6. **Notifications Engine**:
   - Route: `/notifications`
   - Derived from real escrow/vote/funding state (not authored copy) — a server-side pass over the merged live + showcase project catalogue.

> Every social surface carries an explicit `demo` vs `live` provenance label: until a wallet connects (or where data is curated showcase content), the UI honestly says so rather than presenting fixtures as on-chain state.

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

