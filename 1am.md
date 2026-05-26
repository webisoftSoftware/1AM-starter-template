# 1AM Wallet Integration Notes

These notes describe how this direct transfer starter uses the 1AM dApp connector.

## Detect And Connect

1AM is injected at:

```ts
const wallet = window.midnight?.['1am'];
const api = await wallet.connect('preview'); // or 'preprod'
```

Detection can be delayed while the extension injects the provider, so the app polls briefly before showing the not-found state.

After connecting, call `api.getConfiguration()` and use the returned wallet network id for display.

## Connector API Shape

The local `src/1am.d.ts` file should type only the connector shape used by this app:

```ts
type TransferRequest = {
  kind: 'unshielded';
  recipient: string;
  type: RawTokenType;
  value: bigint;
};

type MakeTransferResult = { tx_id: string };
```

Important method details:

- `getConfiguration()` returns the wallet-reported network id.
- `getUnshieldedAddress()` returns `{ unshieldedAddress }`.
- `makeTransfer(transfers)` requests wallet approval for one or more transfers.

## Native NIGHT Transfer Flow

The user flow is:

1. Connect 1AM on the configured network.
2. Read the connected unshielded sender address.
3. Parse the user-entered NIGHT amount into atomic units with 6 decimal places.
4. Call:

```ts
await api.makeTransfer([
  {
    kind: 'unshielded',
    recipient,
    type: nativeToken().raw,
    value,
  },
]);
```

`one-am-wallet` submits internally and returns `{ tx_id }`.

## Validation

The dApp blocks transfer submission for:

- Empty recipient
- Invalid amount
- Zero or negative amount
- More than 6 decimal places

Recipient address and network validation are delegated to 1AM so wallet-reported errors are surfaced directly.

## Common Mistakes

- Comparing the user amount before converting it to native NIGHT atomic units.
- Using a hard-coded token type instead of `nativeToken().raw`.
