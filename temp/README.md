# Midnight Leaderboard

This is a standalone leaderboard dApp project built from the three Midnight tutorial steps:

- Smart contract: https://docs.midnight.network/tutorials/leaderboard/smart-contract
- API layer: https://docs.midnight.network/tutorials/leaderboard/api-layer
- Browser dApp: https://docs.midnight.network/tutorials/leaderboard/browser-dapp

The contract step is kept in the tutorial shape. The browser wallet bridge is adapted to 1AM instead of Lace:

- detects `window.midnight['1am']`
- calls `wallet.connect(VITE_NETWORK_ID)`
- reads `api.getConfiguration()`
- requests `api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider())`
- balances with `api.balanceUnsealedTransaction(...)`
- submits with `api.submitTransaction(...)`

## Commands

```bash
npm install
npm run compile
npm run build
cd leaderboard-ui
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:3000/` in a browser profile where the 1AM extension is installed.

Copy `leaderboard-ui/.env.example` to `leaderboard-ui/.env` and set `VITE_DEFAULT_CONTRACT` after deploying a leaderboard contract.

The default network is `preview`. Change `VITE_NETWORK_ID`, `VITE_INDEXER_URL`, and `VITE_INDEXER_WS_URL` if you want to target `preprod`.
