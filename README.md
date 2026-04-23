# 1AM Example dApp (Midnight TODO)

Minimal example dApp showing how to integrate the 1AM browser extension with a Midnight contract.

## Requirements

- 1AM Chrome extension (or Chromium-based browser with 1AM installed)
- Compact compiler (install guide: https://docs.midnight.network/getting-started/installation) - only required if you modify/recompile contracts
- Node.js 20+ and npm
- Docker + Docker Compose (optional, only for the containerized run)

## What this project demonstrates

- Detect and connect `window.midnight['1am']`
- Build/prove/balance/submit deploy and call transactions through 1AM
- Read task state from indexer-backed public data provider
- Support unshielded and shielded task workflows
- Optional payload encryption using a wallet-signature-derived key

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment

Copy `.env.example` to `.env` and adjust values for your setup.

- `VITE_1AM_NETWORK`: wallet network for 1AM (`preview` or `preprod`)
- `VITE_ZK_TODO_ASSET_BASE_PATH`: unshielded contract zk assets path
- `VITE_ZK_SHIELDED_TODO_ASSET_BASE_PATH`: shielded contract zk assets path
- `DEV_ALLOWED_HOSTS`: comma-separated hostnames allowed by Vite dev server

`docker compose build` uses the same `VITE_*` values as build args.

## Contract flow

1. Connect wallet on your configured `VITE_1AM_NETWORK`
2. Deploy task contract
3. Refresh indexed state
4. Edit tasks locally
5. Save local edits on-chain

## Code layout

- `src/midnight.ts`: 1AM session/provider wiring and indexer patch behavior
- `src/confidentialTodo.ts`: optional payload encryption/decryption
- `src/features/tasks/hooks/useTaskBoard.ts`: app functionality and state orchestration
- `src/features/tasks/domain/*`: pure task serialization/parsing logic
- `src/features/tasks/data/*`: storage helpers
- `src/features/tasks/ui/*`: frontend rendering components

The frontend exists to exercise the integration flow; this repo is primarily a reference for 1AM + Midnight functionality.

## Build

```bash
npm run build
```
