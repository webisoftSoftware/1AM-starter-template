# 1AM Example dApp (Midnight TODO)

Minimal React/Vite dApp showing how to integrate the 1AM browser extension with Midnight contracts.

## Requirements

- 1AM Chrome extension (or Chromium-based browser with 1AM installed)
- Node.js 20+ and npm
- Compact compiler (install guide: https://docs.midnight.network/getting-started/installation) - only required if you modify/recompile contracts
- Docker + Docker Compose (optional, only for the containerized run)

## What this project demonstrates

- Detect and connect `window.midnight['1am']`
- Build Midnight deploy/call transactions in the dApp
- Prove, balance, and submit those transactions through 1AM
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
- `VITE_ZK_TODO_ASSET_BASE_PATH`: unshielded TODO contract ZK asset path
- `VITE_ZK_SHIELDED_TODO_ASSET_BASE_PATH`: shielded TODO contract ZK asset path
- `DEV_ALLOWED_HOSTS`: comma-separated hostnames allowed by Vite dev server

`docker compose build` uses the same `VITE_*` values as build args.

## 1AM Integration Notes

The dApp should use 1AM as the wallet/relayer boundary, not as a replacement for the Midnight SDK.

1. Detect `window.midnight?.['1am']` and connect with the configured network.
2. Read `api.getConfiguration()` and pass the returned indexer URLs to Midnight providers.
3. Host the compiled contract assets under `public/zk/...`.
4. Create a `FetchZkConfigProvider` for each contract asset base path.
5. Pass `zkConfigProvider.asKeyMaterialProvider()` to `api.getProvingProvider(...)`.
6. Route `walletProvider.balanceTx(...)` through `api.balanceUnsealedTransaction(txHex)`.
7. Route `midnightProvider.submitTx(...)` through `api.submitTransaction(txHex)`.

Important API details:

- `submitTransaction(txHex)` resolves when the wallet has accepted/submitted the finalized transaction; it does not return a transaction id. Derive the id from the finalized `Transaction.identifiers()` value before submitting.
- `signData(data, { encoding, keyType: 'unshielded' })` returns `{ data, signature, verifyingKey }`. Use the `signature` field, not the whole response, when deriving local encryption keys.
- The dApp hosts only its contract ZK artifacts: `keys/{circuit}.prover`, `keys/{circuit}.verifier`, and `zkir/{circuit}.bzkir`. It should not copy Midnight system keys or require `MIDNIGHT_SYSTEM_KEYS_DIR`; 1AM/ProofStation handles system proving and dust sponsorship.

See `1am.md` for a more detailed integration reference.

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

## Recompiling Contracts

The checked-in contracts already include compiled artifacts. If you change a Compact contract, run:

```bash
npm run prepare:todo
```

This recompiles both TODO contracts and syncs the generated `keys/` and `zkir/` directories into `public/zk/...` so the browser can fetch them.
