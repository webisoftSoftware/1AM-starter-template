# 1AM Example dApp (Midnight TODO)

Minimal example dApp showing how to integrate the 1AM browser extension with a Midnight contract on the `preview` network.

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

## Contract flow

1. Connect wallet on `preview`
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
