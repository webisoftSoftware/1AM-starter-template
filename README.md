# 1AM Shielded Mint dApp

This repository is a minimal React + TypeScript + Vite example that connects to the 1AM browser extension, deploys a Midnight Compact contract, and mints a contract-defined shielded token to the connected wallet.

## What It Does

- Detects and connects `window.midnight['1am']`
- Reads network/indexer/node configuration from the connected wallet
- Deploys the `shieldedMint` Compact contract
- Waits for the deployed contract state to appear in the indexer
- Mints shielded tokens to the wallet's shielded coin public key
- Refreshes indexed ledger state so the UI can show `totalMinted` and `mintCount`
- Exposes a debug tab with connector, proving, submission, and indexer logs

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` with the 1AM extension installed and connected to the same network configured by `VITE_1AM_NETWORK`.

## Environment

Copy `.env.example` to `.env` and adjust the values for your setup.

- `VITE_1AM_NETWORK`: `preview` or `preprod`
- `VITE_ZK_MINT_ASSET_BASE_PATH`: public base path for the mint ZK assets
- `DEV_ALLOWED_HOSTS`: comma-separated hostnames allowed by the Vite dev server

The app defaults `VITE_ZK_MINT_ASSET_BASE_PATH` to `/zk/shieldedMint`.

`MIDNIGHT_SYSTEM_KEYS_DIR` is optional. It is only used by `npm run sync:system-keys` when you intentionally replace the bundled Midnight system ZK assets. Normal `npm run dev` and `npm run build` do not require a local system-keys directory.

## 1AM Wallet Integration

The dApp uses the injected connector at `window.midnight['1am']`.

Important API details:

- `wallet.connect('preview' | 'preprod')` returns the connected 1AM API.
- `api.getConfiguration()` is the source of truth for indexer and node URLs.
- `api.getProvingProvider(...)` expects a key material provider. This app passes `zkConfigProvider.asKeyMaterialProvider()`.
- `api.balanceUnsealedTransaction(txHex)` returns the balanced transaction hex.
- `api.submitTransaction(txHex)` resolves when submission is accepted and does not return a transaction id.
- The dApp derives the transaction id locally from the finalized `Transaction.identifiers()` before calling `submitTransaction`.
- `api.signData(data, { encoding, keyType: 'unshielded' })` returns `{ data, signature, verifyingKey }`. This shielded mint flow does not need message signing, but the local types match the real connector for reuse.

The submit path is:

1. Build an unproven deploy or call transaction with Midnight SDK helpers.
2. Prove it through the 1AM proving provider.
3. Balance it through `api.balanceUnsealedTransaction(...)`.
4. Derive the local transaction identifier.
5. Submit the finalized transaction through `api.submitTransaction(...)`.

Users do not need to hold dust for this dApp flow. 1AM handles transaction balancing and sponsorship through its wallet services.

## ZK Assets

The app serves ZK assets from `public/zk/shieldedMint/`.

Contract circuit assets:

- `public/zk/shieldedMint/zkir/mintShielded.bzkir`
- `public/zk/shieldedMint/keys/mintShielded.prover`
- `public/zk/shieldedMint/keys/mintShielded.verifier`

Shielded-output transactions can also request Midnight system circuit assets. This branch includes bundled copies under:

- `public/zk/shieldedMint/zkir/midnight/zswap/`
- `public/zk/shieldedMint/keys/midnight/zswap/`
- `public/zk/shieldedMint/zkir/midnight/dust/`
- `public/zk/shieldedMint/keys/midnight/dust/`

`npm run sync:mint-assets` refreshes only the `mintShielded` contract artifacts and preserves the bundled system assets. If you need to replace the system assets, set `MIDNIGHT_SYSTEM_KEYS_DIR` and run `npm run sync:system-keys` manually.

## Contract Flow

The Compact contract in `contracts/shieldedMint.compact` stores two ledger values:

- `totalMinted`
- `mintCount`

The `mintShielded` circuit mints the contract-defined shielded token and sends it to the connected wallet's shielded recipient key. The generated contract binding lives in `contracts/managed/shieldedMint/`, with matching served assets in `public/zk/shieldedMint/`.

After changing the Compact contract shape or verifier keys, deploy a fresh contract and clear any saved contract address.

## Project Layout

- `src/features/mint/hooks/useMint.ts`: connection, deploy, mint, and refresh flow
- `src/features/mint/ui/*`: mint screen and debug tab
- `src/features/mint/domain/shieldedAddress.ts`: shielded recipient key decoding
- `src/midnight.ts`: 1AM session and provider wiring
- `src/mintContract.ts`: generated Compact contract binding
- `contracts/shieldedMint.compact`: Compact source
- `contracts/managed/shieldedMint/`: generated contract artifacts
- `public/zk/shieldedMint/`: served ZK assets
- `1am.md`: integration reference for using the 1AM connector

## Build

```bash
npm run build
```

## Docker

The repo includes `docker-compose.yml`, `Dockerfile`, and `nginx.conf` for production-style local serving. Run `docker compose up --build` from the repo root, then open `http://localhost:5173`.
