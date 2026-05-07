import { Buffer } from 'buffer';
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';

function bufferToBytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function decodeShieldedCoinPublicKey(value: string, networkId: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Shielded coin public key is empty.');
  }

  try {
    const parsed = MidnightBech32m.parse(trimmed);
    if (parsed.type === ShieldedCoinPublicKey.codec.type) {
      return bufferToBytes(ShieldedCoinPublicKey.codec.decode(networkId, parsed).data);
    }
    if (parsed.type === ShieldedAddress.codec.type) {
      const address = ShieldedAddress.codec.decode(networkId, parsed);
      return bufferToBytes(address.coinPublicKey.data);
    }
  } catch {
    // fall through to hex decoding
  }

  return bufferToBytes(ShieldedCoinPublicKey.fromHexString(trimmed).data);
}
