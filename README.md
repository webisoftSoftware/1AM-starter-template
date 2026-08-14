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

- `VITE_1AM_NETWORK`: 1AM wallet network preference (`auto`, `preview`, or `preprod`; defaults to `auto`)
- `VITE_ZK_TODO_ASSET_BASE_PATH`: unshielded TODO contract ZK asset path
- `VITE_ZK_SHIELDED_TODO_ASSET_BASE_PATH`: shielded TODO contract ZK asset path
- `VITE_ZK_PROOF_SIMULATOR_ASSET_BASE_PATH`: proof simulator asset path or absolute R2 URL
- `DEV_ALLOWED_HOSTS`: comma-separated hostnames allowed by Vite dev server

`docker compose build` uses the same `VITE_*` values as build args.

## 1AM Integration Notes

The dApp should use 1AM as the wallet/relayer boundary, not as a replacement for the Midnight SDK.

1. Detect `window.midnight?.['1am']` and connect to the detected preview/preprod wallet network.
2. Read `api.getConfiguration()` and pass the returned indexer URLs to Midnight providers.
3. Host the compiled contract assets under `public/zk/...`.
4. Create a `FetchZkConfigProvider` for each contract asset base path.
5. Pass `zkConfigProvider.asKeyMaterialProvider()` to `api.getProvingProvider(...)`.
6. Route `walletProvider.balanceTx(...)` through `api.balanceUnsealedTransaction(txHex)`.
7. Route `midnightProvider.submitTx(...)` through `api.submitTransaction(txHex)`.

Important API details:

- `submitTransaction(txHex)` resolves when the wallet has accepted/submitted the finalized transaction; it does not return a transaction id. Derive the id from the finalized `Transaction.identifiers()` value before submitting.
- `signData(data, { encoding, keyType: 'unshielded' })` returns `{ data, signature, verifyingKey }`. Use the `signature` field, not the whole response, when deriving local encryption keys.
- The dApp hosts its contract ZK artifacts: `keys/{circuit}.prover`, `keys/{circuit}.verifier`, and `zkir/{circuit}.bzkir`.
- Shielded flows also need Midnight's `zswap` system keys served from the dApp origin. The wallet requests `midnight/zswap/{spend,output}` through the key-material callback rather than resolving them internally, so `public/zk/shieldedMint/{keys,zkir}/midnight/` is required for any transaction that moves shielded coins. `SystemAwareZkConfigProvider` in `src/midnight.ts` routes `midnight/`-prefixed circuit ids there. Verified against a successful mint on 2026-08-12; recheck before removing, since this is wallet behavior rather than a protocol requirement.
- `midnight/dust/*` is resolved by the wallet internally and has never been requested from the page. Dust sponsorship stays entirely on the 1AM side.

See `1am.md` for a more detailed integration reference.

## Contract flow

1. Connect wallet; the app detects whether 1AM is on preview or preprod
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

## Proof simulator

The **Proof Simulator** workspace tab deploys one diagnostic contract, then creates genuine
Compact call proofs through the connected 1AM wallet without balancing or broadcasting the
test calls. The bundled circuits cover `k=6` through `k=20`; Midnight supports parameters up
to `k=25`, but the larger tiers must be generated explicitly and require substantially more
disk, memory, and proving time.

The generated prover keys are stored with Git LFS. Install and initialize it before generating
or checking out the artifact bundle:

```sh
brew install git-lfs
git lfs install
npm run generate:proof-simulator
npm run validate:proof-simulator
```

Use `npm run calibrate:proof-simulator` to validate circuit sizing without generating proving
keys. The generator accepts `--min-k` and `--max-k` bounds between 6 and 25. Local development
and Docker can copy the managed artifacts into `public/zk/proofSimulator`; the production Pages
build uses R2 as described below.

### Cloudflare Pages and R2

Cloudflare Pages rejects individual static files larger than 25 MiB, while the bundled high-k
prover keys exceed that limit. Store the simulator bundle in a public R2 bucket instead. The
other, smaller contract assets remain part of the Pages deployment.

For this project, upload artifacts to the existing production bucket after authenticating
Wrangler:

```sh
npm exec wrangler login
npm run upload:proof-simulator:r2 -- --bucket 1am-prover-assets
```

For a new Cloudflare account, create a bucket and apply the included read-only browser CORS
policy during the first upload:

```sh
npm run upload:proof-simulator:r2 -- \
  --bucket 1am-proof-simulator-assets \
  --create-bucket \
  --apply-cors
```

For production, connect a custom domain in the R2 bucket settings (recommended) or pass
`--domain assets.example.com --zone-id <zone-id>` to the upload command. The optional
`--enable-dev-url` flag exposes Cloudflare's rate-limited `r2.dev` URL for testing.

The checked-in `.env.production` points Vite at the existing `prover.1am.xyz` R2 custom domain.
Keep the Cloudflare Pages build command as `npm run build` and output directory as `dist`. If
deploying a fork, override this build-time environment variable in Pages or edit the production
env file:

```text
VITE_ZK_PROOF_SIMULATOR_ASSET_BASE_PATH=https://prover.1am.xyz/proofSimulator
```

When this value is an absolute HTTP(S) URL, `prebuild` intentionally removes/skips the local
proof-simulator copy. This keeps the large prover keys out of the Pages upload. Re-run the R2
upload command whenever the generated manifest or proof artifacts change.
