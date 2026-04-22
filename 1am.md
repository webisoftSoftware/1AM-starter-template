## 1AM Wallet essentials
- 1AM is a **self-custodial wallet for Midnight Network**.
- **Users do not need gas/dust tokens**: transaction fees are sponsored server-side by **ProofStation**.
- Wallet is injected at:
  - `window.midnight['1am']`

## Detect + connect
```ts
const wallet = window.midnight?.['1am'];
const api = await wallet.connect('preview'); // or 'preprod'
```
- Retry detection if needed because injection may be delayed.
- `connect(networkId)` returns the connected API.

## Main wallet API methods
Use these from the connected `api`:

### Addresses / balances
- `getShieldedAddresses()` → `{ shieldedAddress, shieldedCoinPublicKey, shieldedEncryptionPublicKey }`
- `getUnshieldedAddress()` → `{ unshieldedAddress }`
- `getDustAddress()` → `{ dustAddress }`
- `getShieldedBalances()` → `Record<string, bigint>`
- `getUnshieldedBalances()` → `Record<string, bigint>`
- `getDustBalance()` → `{ balance, cap }`

### Network config
- `getConfiguration()` →  
  `{ networkId, indexerUri, indexerWsUri, proverServerUri, substrateNodeUri }`

### Tx/proving
- `getProvingProvider(zkConfigProvider)` → proving provider
- `balanceUnsealedTransaction(txHex)` → `{ tx }`
- `submitTransaction(txHex)` → submits tx
- `makeTransfer(outputs)` → `{ tx }`
- `signData(data, options)` → signature

## Required Midnight provider setup
Typical flow:
1. `setNetworkId(config.networkId)`
2. Build:
   - `zkConfigProvider` via `FetchZkConfigProvider`
   - `publicDataProvider` via `indexerPublicDataProvider`
   - `provingProvider` via `api.getProvingProvider(zkConfigProvider)`
3. Wrap into providers:
   - `proofProvider.proveTx(unprovenTx)` → `unprovenTx.prove(...)`
   - `walletProvider.balanceTx(tx)` → serialize to hex, call `api.balanceUnsealedTransaction(hex)`, deserialize returned tx
   - `midnightProvider.submitTx(tx)` → serialize to hex, call `api.submitTransaction(hex)`

## Important dust-free transaction flow
The DApp should follow this exact pattern:
1. Build unproven tx with Midnight SDK / compiled contract
2. Prove tx using wallet proving provider
3. Balance proved tx via `balanceUnsealedTransaction()`  
   - this is where server-side dust sponsorship happens
4. Submit via `submitTransaction()`

**Result: user pays 0 dust / 0 NIGHT**

## Contract deployment / circuit calls
Use Midnight SDK packages:
- `@midnight-ntwrk/compact-js`
- `@midnight-ntwrk/midnight-js-contracts`
- related provider packages

Main operations:
- `deployContract(providers, { compiledContract })`
- `submitCallTx(providers, { compiledContract, contractAddress, circuitId, args })`

## ZK key hosting requirement
Your compiled contract assets must be hosted on a CDN/server with CORS enabled.

Expected files:
- `keys/{circuitId}.prover`
- `keys/{circuitId}.verifier`
- `zkir/{circuitId}.bzkir`

`FetchZkConfigProvider(baseURL, fetch)` will load from that base path.

## Networks
Supported now:
- `preview`
- `preprod`

Mainnet info is not ready/TBD.

## Important package deps
- `@midnight-ntwrk/compact-js`
- `@midnight-ntwrk/midnight-js-contracts`
- `@midnight-ntwrk/midnight-js-types`
- `@midnight-ntwrk/midnight-js-fetch-zk-config-provider`
- `@midnight-ntwrk/midnight-js-indexer-public-data-provider`
- `@midnight-ntwrk/midnight-js-network-id`
- `@midnight-ntwrk/ledger-v8`

## What matters most for implementation
- Detect wallet at `window.midnight['1am']`
- Connect with `await wallet.connect('preview' | 'preprod')`
- Always use `api.getConfiguration()` to configure providers dynamically
- Use `api.getProvingProvider(...)` instead of trying to talk to ProofStation directly
- Always run balancing through `api.balanceUnsealedTransaction(...)`
- Submit through `api.submitTransaction(...)`
- Host compiled contract proving/verifier/ZKIR assets correctly
