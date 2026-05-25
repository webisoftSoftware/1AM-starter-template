# Project Overview

This repo is a minimal Midnight shielded mint dApp built with React, TypeScript, and Vite. It connects to the 1AM browser extension and lets a user deploy a Compact contract that mints a contract-defined shielded token to the connected wallet.

## User Flow

1. Detect and connect the 1AM extension.
2. Deploy the `shieldedMint` contract.
3. Wait for indexed contract state to load.
4. Mint shielded tokens to the connected wallet's shielded recipient key.
5. Refresh to read the latest `totalMinted` and `mintCount` values.

## Important Files

- `src/features/mint/hooks/useMint.ts`: connection, deploy, mint, and refresh flow.
- `src/features/mint/ui/*`: mint UI and debug tab.
- `src/features/mint/domain/shieldedAddress.ts`: shielded recipient key parsing.
- `src/midnight.ts`: 1AM-backed provider wiring, patched public data reads, and debug logging.
- `src/mintContract.ts`: compiled contract binding used by the app.
- `contracts/shieldedMint.compact`: Compact source for the mint contract.
- `contracts/managed/shieldedMint/`: generated contract artifacts.
- `public/zk/shieldedMint/`: proving assets served by Vite.
- `scripts/sync-system-keys.sh`: optional replacement script for bundled Midnight system ZK assets.
- `1am.md`: local reference for the intended 1AM integration flow.

## 1AM Integration

The app follows the 1AM wallet flow:

- `window.midnight['1am']`
- `wallet.connect('preview' | 'preprod')`
- `api.getConfiguration()`
- `api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider())`
- `api.balanceUnsealedTransaction(...)`
- `api.submitTransaction(...)`

The frontend still uses Midnight SDK transaction builders and providers. 1AM is responsible for proving, transaction balancing, and submission.

Important connector details:

- `submitTransaction(...)` returns `Promise<void>`, so `src/midnight.ts` derives the transaction id locally from the finalized transaction.
- `signData(...)` returns `{ data, signature, verifyingKey }` and requires `keyType: 'unshielded'`. This app does not use signing in the mint flow, but the local types must stay accurate for reuse.
- `getProvingProvider(...)` expects a key material provider shape. Passing the SDK provider directly works only by accident when the method names happen to line up.

## ZK Assets

The contract assets are served from `public/zk/shieldedMint/`:

- `zkir/mintShielded.bzkir`
- `keys/mintShielded.prover`
- `keys/mintShielded.verifier`

Because the app creates shielded outputs, proving may also request Midnight system circuit assets under:

- `zkir/midnight/zswap/`
- `keys/midnight/zswap/`
- `zkir/midnight/dust/`
- `keys/midnight/dust/`

Normal `npm run dev` and `npm run build` should not require `MIDNIGHT_SYSTEM_KEYS_DIR`; bundled system assets are already tracked in `public/zk/shieldedMint`. Use `npm run sync:system-keys` only when intentionally replacing those bundled files.

## Indexer Note

The preview indexer can have GraphQL issues around some latest-state queries using `offset: null`. Because of that, this app patches some public data provider reads and avoids default blocking SDK helpers that wait for finalization through the broken path.

In practice this means:

- deploy uses manual async submission
- the app polls for the indexed contract snapshot after deploy
- mint uses the SDK call builder with the patched public data provider

## Developer Notes

- After any contract shape change, deploy a fresh contract.
- Do not rely on old saved contract addresses after verifier key changes.
- If mint fails, inspect the on-page debug log first.
- If proving fails, check the requested key location and whether the matching asset exists under `public/zk/shieldedMint`.
- If refresh fails, inspect `src/midnight.ts` first because that is where the patched indexer behavior lives.

## Docker Setup

- The project includes `docker-compose.yml`, `Dockerfile`, and `nginx.conf` for production-style local serving.
- Run `docker compose up --build` from the repo root, then open `http://localhost:5173`.
- Nginx serves the Vite build output and listens on port `5173` to match local dev port expectations.
