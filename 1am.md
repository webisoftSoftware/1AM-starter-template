# 1AM Wallet Integration Notes

This file is the implementation reference for using 1AM from this starter template. It documents the boundary between the dApp, Midnight SDK, and 1AM wallet.

## Core Model

- The dApp still builds deploy/call transactions with Midnight SDK packages.
- 1AM supplies wallet keys, proving, balancing, dust sponsorship, and submission.
- The dApp must host its own compiled contract ZK assets.
- The dApp must not require Midnight system keys, zswap keys, dust trusted setup files, or `MIDNIGHT_SYSTEM_KEYS_DIR`.

## Detect And Connect

```ts
const wallet = window.midnight?.['1am'];
if (!wallet) throw new Error('Install the 1AM wallet extension.');

const api = await wallet.connect('preview'); // or 'preprod'
const config = await api.getConfiguration();
```

Notes:

- Extension injection can be delayed, so UI code should poll briefly before showing "not found".
- `connect(networkId)` asks the wallet for approval and must match the wallet/network the user is using.
- Use `api.getConfiguration()` instead of hardcoding indexer/node/proof URLs. `proverServerUri` is optional and not needed when using `getProvingProvider`.

## Connected API Shape

Use these from the connected `api`:

```ts
type OneAmConnectedApi = {
  getConfiguration(): Promise<{
    networkId: string;
    indexerUri: string;
    indexerWsUri: string;
    proverServerUri?: string;
    substrateNodeUri: string;
  }>;

  getShieldedAddresses(): Promise<{
    shieldedAddress: string;
    shieldedCoinPublicKey: string;
    shieldedEncryptionPublicKey: string;
  }>;

  getUnshieldedAddress(): Promise<{ unshieldedAddress: string }>;

  getProvingProvider(keyMaterialProvider: KeyMaterialProvider): Promise<ProvingProvider>;

  balanceUnsealedTransaction(txHex: string, options?: { payFees?: boolean }): Promise<{ tx: string }>;
  submitTransaction(txHex: string): Promise<void>;

  signData(
    data: string,
    options: { encoding: 'hex' | 'base64' | 'text'; keyType: 'unshielded' },
  ): Promise<{ data: string; signature: string; verifyingKey: string }>;
};
```

Important details:

- `submitTransaction` returns `void`. If the dApp needs a transaction id, derive it from the finalized `Transaction.identifiers()` value before calling 1AM.
- `signData` returns an object. For local key derivation, use `result.signature`, not the entire result object.
- `getProvingProvider` expects a key-material provider. With Midnight's fetch provider, pass `zkConfigProvider.asKeyMaterialProvider()`.

## Provider Wiring

The provider flow in `src/midnight.ts` is the canonical shape:

```ts
const config = await api.getConfiguration();
setNetworkId(config.networkId);

const zkConfigProvider = new FetchZkConfigProvider<'storeTodo'>(
  new URL('/zk/todo', window.location.origin).toString(),
  window.fetch.bind(window),
);

const provingProvider = await api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());
const proofProvider = createProofProvider(provingProvider);
```

Build the remaining Midnight providers around 1AM:

- `publicDataProvider`: use the wallet's `config.indexerUri` and `config.indexerWsUri`.
- `walletProvider.getCoinPublicKey`: use `getShieldedAddresses().shieldedCoinPublicKey`.
- `walletProvider.getEncryptionPublicKey`: use `getShieldedAddresses().shieldedEncryptionPublicKey`.
- `walletProvider.balanceTx`: serialize the proved unsealed transaction to hex, call `api.balanceUnsealedTransaction(txHex)`, then deserialize the returned finalized transaction.
- `midnightProvider.submitTx`: derive a transaction id locally, call `api.submitTransaction(txHex)`, then return the local id.

## Transaction Flow

Use this sequence for deploys and circuit calls:

1. Build an unproven transaction with `createUnprovenDeployTx` or `createUnprovenCallTx`.
2. Prove it through `proofProvider`, which delegates to `api.getProvingProvider(...)`.
3. Balance it through `api.balanceUnsealedTransaction(...)`.
4. Submit it through `api.submitTransaction(...)`.
5. Refresh state from the indexer after submission.

This is where dust-free execution happens: the dApp does not source dust itself.

## ZK Asset Hosting

Each compiled contract circuit must be fetchable from the dApp origin or CDN:

```text
{baseURL}/
  keys/
    {circuitId}.prover
    {circuitId}.verifier
  zkir/
    {circuitId}.bzkir
```

For this starter:

- Unshielded TODO base path: `/zk/todo`
- Shielded TODO base path: `/zk/shieldedTodo`
- Circuit id: `storeTodo`

The app keeps separate provider sets for unshielded and shielded modes so each contract resolves assets from its own base path.

For hosted deployments, make sure these files are served with CORS enabled for the dApp origin. `application/octet-stream` is a good content type for the binary files.

## Contract Artifacts

The repo checks in compiled artifacts under:

- `contracts/managed/todo/`
- `contracts/managed/shieldedTodo/`
- `public/zk/todo/`
- `public/zk/shieldedTodo/`

If you edit a Compact contract, run:

```bash
npm run prepare:todo
```

That compiles both contracts and copies generated `keys/` and `zkir/` assets into `public/zk/...`.

Changing a contract or verifier key means old deployed contract addresses should be discarded.

## Optional Payload Encryption

The encrypted payload mode derives a local AES-GCM key from a wallet signature:

```ts
const signed = await api.signData(message, {
  encoding: 'text',
  keyType: 'unshielded',
});

const signatureBytes = fromHex(signed.signature);
```

This protects the TODO payload before it is stored in the public ledger field, but it is still an application-level convention. The wallet only signs the derivation message; the dApp does the encryption and decryption in the browser.

## Common Mistakes

- Do not pass the `ZKConfigProvider` object directly to `getProvingProvider`; pass `zkConfigProvider.asKeyMaterialProvider()`.
- Do not expect `submitTransaction` to return a tx id.
- Do not treat the `signData` response as a string.
- Do not add `MIDNIGHT_SYSTEM_KEYS_DIR` or copy system proving keys into this dApp.
- Do not use one ZK asset base path for multiple contracts unless their circuits and artifacts are intentionally identical.
- Do not reuse saved contract addresses after recompiling contracts.
