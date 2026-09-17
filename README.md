# ProtoRWA (Tokenized Physical Hardware with Milestone Escrow)

[![Arbitrum Open House](https://img.shields.io/badge/Arbitrum-Buildathon%20Singapore-blue?style=for-the-badge&logo=arbitrum)](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon)
[![Arbitrum Stylus](https://img.shields.io/badge/Arbitrum-Stylus%20WASM-cyan?style=for-the-badge&logo=rust)](https://docs.arbitrum.io/stylus)
[![Arbitrum Sepolia](https://img.shields.io/badge/Deployed-Arbitrum%20Sepolia-emerald?style=for-the-badge)](https://sepolia.arbiscan.io)

> **ProtoRWA** transforms physical hardware manufacturing into transparent, tokenized on-chain assets. Capital is held in cryptographic escrow and released tranche-by-tranche based on backer quorum and native WASM Merkle verification of sensor telemetry.

---

## 🏗️ The Problem ProtoRWA Solves

1. **Hardware Kickstarter Risk**: Backers commit funds upfront with zero visibility or recourse; founders can default or fail to deliver without releasing funds back to backers.
2. **Opaque Physical Progress**: Supply chain bills of materials (BOM), lab thermal cycling, and factory certifications are traditionally stored in disconnected PDF silos.
3. **Illiquid Pre-Order Commitments**: Backers who purchase pre-production claims are locked in until delivery (months to years later) with no secondary liquidity.

---

## ⚡ Architecture & Arbitrum Stack

ProtoRWA combines **Solidity protocol contracts**, high-performance **Arbitrum Stylus (Rust WASM)** verification, and a modern **Next.js 15 App Router** frontend:

```
┌────────────────────────────────────────────────────────┐
│              ProtoRWA Frontend (Next.js 15)           │
│  - Milestone Voting Terminal (Screen 06)               │
│  - Founder Evidence Submission Studio (Screen 27)      │
│  - Asset Claim Secondary Trading Terminal (Screen 23)  │
│  - Judge Demo Mode Switcher (Backer / Founder / Trade) │
└──────────────────────────┬─────────────────────────────┘
                           │
                 EVM RPC / Wagmi / Viem
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  Arbitrum Sepolia Solidity  │   │   Arbitrum Stylus (Rust)    │
│  - ProjectRegistry.sol      │   │   HardwareVerifier (WASM)   │
│  - ClaimToken.sol (ERC1155) │   │   - Merkle proof validation │
│  - MilestoneEscrow.sol      │   │   - Telemetry attestation   │
│  - SecondaryMarket.sol      │   │   - Token-weighted quorum   │
└─────────────────────────────┘   └─────────────────────────────┘
```

### Why Arbitrum Stylus?
Hardware telemetry verification (Merkle trees of sensor data, BOM hashes, and environmental test logs) requires heavy cryptographic computation (`keccak256` hashing across tree siblings).
Running this inside EVM bytecode would be prohibitive in gas and execution limits. By leveraging **Arbitrum Stylus**, `HardwareVerifier.wasm` executes at near-native speed with fractional gas costs.

---

## 📜 Verified On-Chain Deployments (Arbitrum Sepolia - Chain ID: `421614`)

All protocol contracts have been deployed on Arbitrum Sepolia with wired and verified roles:

| Contract | Address | Explorer |
| :--- | :--- | :--- |
| **ProjectRegistry** | `0xE9Aaa276502C691f824E2484eecF46C71Cb99eC3` | [View on Arbiscan](https://sepolia.arbiscan.io/address/0xE9Aaa276502C691f824E2484eecF46C71Cb99eC3) |
| **ClaimToken (ERC-1155)** | `0x5540b1b1049614F304368B17cd8eaBb80BE92dAD` | [View on Arbiscan](https://sepolia.arbiscan.io/address/0x5540b1b1049614F304368B17cd8eaBb80BE92dAD) |
| **MilestoneEscrow** | `0x19f2190C1c50B2E4403ff4bd78c05598aBabbD16` | [View on Arbiscan](https://sepolia.arbiscan.io/address/0x19f2190C1c50B2E4403ff4bd78c05598aBabbD16) |
| **SecondaryMarket** | `0x2Ad4fCb52E9B41eBd11b49Ac9c6838ad27B20086` | [View on Arbiscan](https://sepolia.arbiscan.io/address/0x2Ad4fCb52E9B41eBd11b49Ac9c6838ad27B20086) |
| **HardwareVerifier (Stylus WASM)** | `0x510f4d65e9f7778b09ad52a4ec19c590a934f913` | [View on Arbiscan](https://sepolia.arbiscan.io/address/0x510f4d65e9f7778b09ad52a4ec19c590a934f913) |

### 🟢 Live Seeded Hardware Project (Project #1)
The primary showcase project **HelioFrost Pro** is registered and active on Arbitrum Sepolia:
- **Project ID**: `1`
- **Status**: `FUNDING`
- **Target**: `0.05 ETH` (1,000 claim units @ 0.00005 ETH)
- **On-chain Milestone Count**: `4 tranches`
- **Creation Tx**: [`0xf811da25...`](https://sepolia.arbiscan.io/tx/0xf811da25e79f0569c17373fe6e057596058212b0f14a861668dfb005bf42c8ff)
- **Milestones Schedule Tx**: [`0xf0cc0aed...`](https://sepolia.arbiscan.io/tx/0xf0cc0aedc25c85bfe59234b8ea15478b01a47b0a168094cb8cb46493e1cf515b)
- **Funding Opened Tx**: [`0xff23db08...`](https://sepolia.arbiscan.io/tx/0xff23db08fdb46777b95c17ffe1bf494fede7ec14aef399a844a055fb969747e5)

---

## 🚀 Key User Journeys & Screen Implementations

1. **Backer Voting & Escrow Consensus Terminal (Screen 06)**:
   - Route: `/projects/[slug]/milestones/[id]/vote`
   - Real-time `QuorumMeter`, IPFS evidence inspector, Stylus Oracle attestation badge, and permissionless settlement triggers.
2. **Founder Milestone Evidence Studio (Screen 27)**:
   - Route: `/studio/[slug]/milestones/[id]/submit`
   - Form for uploading factory BOM receipts, QA reports, and trigger for `HardwareVerifier` WASM Merkle evaluation.
3. **Claim Trading Terminal (Screen 23)**:
   - Route: `/market/[ticker]`
   - Live two-column orderbook ladder with bid/ask depth, recent fills ledger, order slip with 1% protocol fee calculation, and physical unit redemption card.
4. **Judge Demo Mode Switcher**:
   - Header pill component allowing hackathon reviewers to immediately jump between:
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

