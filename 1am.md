# 1AM Wallet Integration Notes

These notes describe how this shielded mint starter uses the 1AM dApp connector.

## Detect And Connect

1AM is injected at:

```ts
const wallet = window.midnight?.['1am'];
const api = await wallet.connect('preview'); // or 'preprod'
```

Detection can be delayed while the extension injects the provider, so the app polls briefly before showing the not-found state.

After connecting, call `api.getConfiguration()` and use the returned network/indexer/node URLs. Do not hard-code indexer or node endpoints in the dApp.

## Connector API Shape

The local `src/1am.d.ts` file should match the real connector shape:

```ts
type SignDataOptions = {
  encoding: 'hex' | 'base64' | 'text';
  keyType: 'unshielded';
};

type Signature = {
  data: string;
  signature: string;
  verifyingKey: string;
};

type KeyMaterialProvider = {
  getZKIR(circuitKeyLocation: string): Promise<Uint8Array>;
  getProverKey(circuitKeyLocation: string): Promise<Uint8Array>;
  getVerifierKey(circuitKeyLocation: string): Promise<Uint8Array>;
};
```

Important method details:

- `getConfiguration()` returns `{ networkId, indexerUri, indexerWsUri, proverServerUri?, substrateNodeUri }`.
- `getProvingProvider(keyMaterialProvider)` takes a key material provider, not the full SDK `ZKConfigProvider` object.
- `signData(data, options)` returns `{ data, signature, verifyingKey }`, not a raw signature string.
- `submitTransaction(txHex)` returns `Promise<void>`, not a transaction id.

## Provider Wiring

The app builds Midnight SDK providers in `src/midnight.ts`.

Required setup:

1. `setNetworkId(config.networkId)`.
2. Create `FetchZkConfigProvider<'mintShielded'>(zkBaseUrl, fetch)`.
3. Wrap it with the nonce-stripping provider used by this app's proving request dedup workaround.
4. Pass `dedupSafeZkConfigProvider.asKeyMaterialProvider()` to `api.getProvingProvider(...)`.
5. Wrap the returned proving provider with `createProofProvider(...)`.
6. Use `api.balanceUnsealedTransaction(...)` from `walletProvider.balanceTx`.
7. Use `api.submitTransaction(...)` from `midnightProvider.submitTx`.

The dApp still uses Midnight SDK transaction builders. 1AM supplies proving, balancing, and submission through the connector.

## Transaction Submission

Do not depend on a transaction id returned by 1AM submission. The wallet connector resolves `submitTransaction(txHex)` with no value.

The dApp should derive the transaction id from the finalized `Transaction`:

```ts
const txId = tx.identifiers()[0];
await api.submitTransaction(toHex(tx.serialize()));
return txId;
```

This is why `src/midnight.ts` computes the transaction identifier before submission and returns that local id to `submitTxAsync(...)`.

## Shielded Mint Flow

The user flow is:

1. Connect 1AM on the configured network.
2. Deploy `shieldedMint`.
3. Wait until the indexer exposes the deployed contract state.
4. Decode the connected wallet's shielded coin public key.
5. Build a `mintShielded` call with amount, random nonce, and recipient key.
6. Prove, balance, and submit the transaction through 1AM.
7. Refresh indexed state to display `totalMinted` and `mintCount`.

The circuit sends the newly minted contract-defined token to the connected wallet's shielded recipient key.

## ZK Assets

The base URL is controlled by `VITE_ZK_MINT_ASSET_BASE_PATH` and defaults to `/zk/shieldedMint`.

Contract assets expected by `mintShielded`:

- `/zk/shieldedMint/zkir/mintShielded.bzkir`
- `/zk/shieldedMint/keys/mintShielded.prover`
- `/zk/shieldedMint/keys/mintShielded.verifier`

Because this branch creates shielded outputs, proving can also ask for Midnight system circuit material:

- `/zk/shieldedMint/zkir/midnight/zswap/output.bzkir`
- `/zk/shieldedMint/keys/midnight/zswap/output.prover`
- `/zk/shieldedMint/keys/midnight/zswap/output.verifier`
- `/zk/shieldedMint/zkir/midnight/zswap/sign.bzkir`
- `/zk/shieldedMint/keys/midnight/zswap/sign.prover`
- `/zk/shieldedMint/keys/midnight/zswap/sign.verifier`
- `/zk/shieldedMint/zkir/midnight/zswap/spend.bzkir`
- `/zk/shieldedMint/keys/midnight/zswap/spend.prover`
- `/zk/shieldedMint/keys/midnight/zswap/spend.verifier`
- `/zk/shieldedMint/zkir/midnight/dust/spend.bzkir`
- `/zk/shieldedMint/keys/midnight/dust/spend.prover`
- `/zk/shieldedMint/keys/midnight/dust/spend.verifier`

These files are served to the wallet as key material. The dApp does not talk to ProofStation directly.

## System Keys

Normal development does not require setting `MIDNIGHT_SYSTEM_KEYS_DIR`. The repo already has bundled system assets under `public/zk/shieldedMint/{keys,zkir}/midnight`, and `npm run dev` / `npm run build` preserve them.

Use `npm run sync:system-keys` only when replacing those bundled assets. In that case, set `MIDNIGHT_SYSTEM_KEYS_DIR` to a directory containing:

- `zswap/output.{bzkir,prover,verifier}`
- `zswap/sign.{bzkir,prover,verifier}`
- `zswap/spend.{bzkir,prover,verifier}`
- optionally `dust/spend.{bzkir,prover,verifier}`

## Common Mistakes

- Passing the SDK `ZKConfigProvider` directly to `getProvingProvider(...)` instead of `asKeyMaterialProvider()`.
- Treating `submitTransaction(...)` as if it returned a transaction id.
- Treating `signData(...)` as if it returned a string.
- Omitting `keyType: 'unshielded'` when using `signData(...)`.
- Running asset sync scripts that delete `public/zk/shieldedMint/{keys,zkir}/midnight`.
- Reusing saved contract addresses after changing the Compact contract or verifier keys.
- Hard-coding network URLs instead of using `api.getConfiguration()`.
