# 1AM Direct Transfer dApp

This repository is a minimal React + TypeScript + Vite example that connects to the 1AM browser extension and sends unshielded native NIGHT transfers from the connected wallet.

## What It Does

- Detects and connects `window.midnight['1am']`
- Reads network and node configuration from the connected wallet
- Shows the connected unshielded address
- Sends unshielded native NIGHT with `api.makeTransfer(...)`
- Exposes a debug tab with connector and transfer logs

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` with the 1AM extension installed and connected to the same network configured by `VITE_1AM_NETWORK`.

## Environment

Copy `.env.example` to `.env` and adjust the values for your setup.

- `VITE_1AM_NETWORK`: `preview` or `preprod`
- `DEV_ALLOWED_HOSTS`: comma-separated hostnames allowed by the Vite dev server

`VITE_1AM_NETWORK` is the only required app-specific environment variable.

## 1AM Wallet Integration

The dApp uses the injected connector at `window.midnight['1am']`.

Important API details:

- `wallet.connect('preview' | 'preprod')` returns the connected 1AM API.
- `api.getConfiguration()` is the source of truth for network and node details.
- `api.getUnshieldedAddress()` returns the wallet address used as the sender.
- `api.makeTransfer([{ kind: 'unshielded', recipient, type: nativeToken().raw, value }])` requests a native NIGHT transfer.
- `one-am-wallet` submits inside `makeTransfer(...)` and returns `{ tx_id }`.

User-entered NIGHT amounts support up to 6 decimal places. Address and network validation are delegated to 1AM.

## Project Layout

- `src/features/transfer/hooks/useTransfer.ts`: connection, validation, and transfer flow
- `src/features/transfer/ui/*`: transfer screen and debug tab
- `src/midnight.ts`: 1AM session helper, native token selection, and transfer submission handling
- `src/1am.d.ts`: local connector types
- `1am.md`: integration reference for using the 1AM connector

## Build

```bash
npm run build
```

## Docker

The repo includes `docker-compose.yml`, `Dockerfile`, and `nginx.conf` for production-style local serving. Run `docker compose up --build` from the repo root, then open `http://localhost:5173`.
