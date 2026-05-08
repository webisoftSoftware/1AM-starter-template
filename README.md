# 1AM Shielded Mint dApp

This repository is a minimal React + TypeScript + Vite example that shows how to connect the 1AM browser extension to a Midnight contract and mint a contract-defined shielded token to the connected wallet.

## What It Does

- Detects and connects `window.midnight['1am']`
- Deploys the `shieldedMint` Compact contract on the configured 1AM network
- Waits for the deployed contract state to appear in the indexer
- Mints the contract's shielded token to the wallet's shielded address
- Refreshes indexed ledger state so you can see the updated counters
- Exposes a debug tab with the raw connector and transaction logs

## User Flow

1. Connect 1AM on `preview` or `preprod`
2. Deploy the shielded mint contract
3. Wait for the indexer to expose the new contract state
4. Enter an amount and mint shielded tokens to the connected wallet
5. Refresh to read the latest on-chain ledger values

The UI shows:

- wallet connection status
- unshielded and shielded recipient addresses
- deployed contract address
- `totalMinted` and `mintCount`
- the last submitted transaction id
- a debug log for connector and indexer issues

## Requirements

- 1AM browser extension
- Node.js 20+ and npm
- Compact compiler, only if you change or recompile the contract
- Docker + Docker Compose, optional

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment

Copy `.env.example` to `.env` and adjust the values for your setup.

- `VITE_1AM_NETWORK`: `preview` or `preprod`
- `VITE_ZK_MINT_ASSET_BASE_PATH`: zk asset base path for the mint contract
- `DEV_ALLOWED_HOSTS`: comma-separated hostnames allowed by the Vite dev server

The app defaults `VITE_ZK_MINT_ASSET_BASE_PATH` to `/zk/shieldedMint`.

## Contract Flow

The Compact contract in `contracts/shieldedMint.compact` stores two ledger values:

- `totalMinted`
- `mintCount`

The `mintShielded` circuit mints the contract-defined shielded token and sends it to the connected wallet's shielded address. The contract also keeps the compiled zk assets in `contracts/managed/shieldedMint/`, with matching copies served from `public/zk/shieldedMint/`.

## Project Layout

- `src/App.tsx`: app entry point
- `src/features/mint/hooks/useMint.ts`: connection, deploy, mint, and refresh flow
- `src/features/mint/ui/*`: mint screen and debug tab
- `src/midnight.ts`: 1AM session and provider wiring
- `src/mintContract.ts`: generated Compact contract binding
- `contracts/shieldedMint.compact`: Compact source
- `contracts/managed/shieldedMint/`: generated contract artifacts

## Build

```bash
npm run build
```

## Docker

The repo also includes `docker-compose.yml`, `Dockerfile`, and `nginx.conf` for production-style local serving. Run `docker compose up --build` from the repo root, then open `http://localhost:5173`.
