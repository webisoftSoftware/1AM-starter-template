# Project Overview

This repo is a minimal Midnight TODO dApp built with React, TypeScript, and Vite. It connects to the 1AM browser extension on `preview` or `preprod` and lets a user deploy unshielded or shielded task-board contracts.

## User Flow

1. Detect and connect the 1AM extension.
2. Deploy the TODO contract.
3. Wait for indexed contract state to load.
4. Edit tasks locally.
5. Save the serialized task payload on-chain.
6. Refresh to read the latest state.

## Important Files

- `src/features/tasks/hooks/useTaskBoard.ts`: main deploy/submit/refresh flow.
- `src/midnight.ts`: 1AM-backed provider wiring, patched public data reads, and debug logging.
- `src/todoContract.ts`: unshielded compiled contract binding used by the app.
- `src/shieldedTodoContract.ts`: shielded compiled contract binding used by the app.
- `contracts/todo.compact`: Compact source for the TODO contract.
- `contracts/managed/todo/`: compiled contract artifacts.
- `public/zk/todo/`: proving assets served by Vite.
- `public/zk/shieldedTodo/`: shielded proving assets served by Vite.
- `1am.md`: local notes on the intended 1AM integration flow.

## 1AM Integration

The app follows the 1AM wallet flow:

- `window.midnight['1am']`
- `wallet.connect('preview')`
- `api.getConfiguration()`
- `api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider())`
- `api.balanceUnsealedTransaction(...)`
- `api.submitTransaction(...)`

The frontend still uses Midnight SDK transaction builders and providers. 1AM is responsible for proving, transaction balancing, dust sponsorship, and submission.

Important API details:

- `submitTransaction` returns `void`; derive any tx id from `Transaction.identifiers()` before calling it.
- `signData` returns `{ data, signature, verifyingKey }` and requires `keyType: 'unshielded'`.
- The dApp hosts only contract ZK assets under `public/zk/...`; do not add Midnight system keys or `MIDNIGHT_SYSTEM_KEYS_DIR`.

## Indexer Note

The preview indexer currently has a GraphQL issue around some latest-state queries using `offset: null`. Because of that, this app patches some public data provider reads and avoids the default blocking SDK helpers that wait for finalization through the broken path.

In practice this means:

- deploy uses manual async submission
- the app polls for the indexed contract snapshot after deploy
- submit uses the SDK call builder with the patched public data provider

## Why The Contract Is Bigger Than It Looks

The product behavior is intentionally simple: one public TODO string that gets overwritten.

However, the original tiny `storeTodo` circuit failed during proving with ProofStation on preview with:

`prove: no SRS params for k=6`

To make proving succeed, the contract was intentionally padded with additional mirrored ledger fields (`todoMirrorA` through `todoMirrorF`). These mirrors are not product features. They exist only to increase circuit size so the preview prover accepts the proof request.

Only the main `todo` field matters to the UI. The mirror fields are internal padding for prover compatibility.

## Developer Notes

- After any contract shape change, deploy a fresh contract.
- Do not rely on old saved contract addresses after verifier key changes.
- If submit fails, inspect the on-page debug log first.
- If proving fails, check ProofStation health and the returned prover error text.
- If refresh fails, inspect `src/midnight.ts` first because that is where the patched indexer behavior lives.

## Docker Setup

- The project includes `docker-compose.yml`, `Dockerfile`, and `nginx.conf` for production-style local serving.
- Run `docker compose up --build` from the repo root, then open `http://localhost:5173`.
- Nginx serves the Vite build output and listens on port `5173` to match local dev port expectations.
