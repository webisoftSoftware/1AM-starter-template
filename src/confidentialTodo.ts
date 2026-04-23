const ENVELOPE_PREFIX = 'enc:v1:';

type EnvelopeV1 = {
  v: 1;
  alg: 'AES-GCM-256';
  kdf: 'wallet-signature-v1';
  n: string;
  ct: string;
};

export type ConfidentialContext = {
  api: OneAmConnectedApi;
  networkId: string;
  contractAddress: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function makeSignatureMessage(networkId: string, contractAddress: string): string {
  return `1am-task-board-confidential-key|${networkId}|${contractAddress}`;
}

async function deriveContractKey(context: ConfidentialContext): Promise<CryptoKey> {
  if (!context.api.signData) {
    throw new Error('1AM signData is unavailable. Cannot derive confidential key.');
  }

  const signature = await context.api.signData(makeSignatureMessage(context.networkId, context.contractAddress), {
    encoding: 'text',
  });

  const keyMaterial = await crypto.subtle.importKey('raw', textEncoder.encode(signature), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: textEncoder.encode(`todo-confidential-salt|${context.networkId}`),
      info: textEncoder.encode(`todo-confidential-key|${context.contractAddress}`),
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

function makeAad(networkId: string, contractAddress: string): Uint8Array {
  return textEncoder.encode(`todo-confidential-aad|${networkId}|${contractAddress}`);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function isEncryptedTodoPayload(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

export async function encryptTodoPayload(plaintext: string, context: ConfidentialContext): Promise<string> {
  const key = await deriveContractKey(context);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(makeAad(context.networkId, context.contractAddress)),
      },
      key,
      toArrayBuffer(textEncoder.encode(plaintext)),
    ),
  );

  const envelope: EnvelopeV1 = {
    v: 1,
    alg: 'AES-GCM-256',
    kdf: 'wallet-signature-v1',
    n: toBase64Url(nonce),
    ct: toBase64Url(ciphertext),
  };

  return `${ENVELOPE_PREFIX}${toBase64Url(textEncoder.encode(JSON.stringify(envelope)))}`;
}

export async function decryptTodoPayload(value: string, context: ConfidentialContext): Promise<string> {
  if (!isEncryptedTodoPayload(value)) {
    return value;
  }

  let envelope: EnvelopeV1;
  try {
    const encoded = value.slice(ENVELOPE_PREFIX.length);
    const decoded = textDecoder.decode(fromBase64Url(encoded));
    envelope = JSON.parse(decoded) as EnvelopeV1;
  } catch {
    throw new Error('Encrypted TODO payload is malformed.');
  }

  if (envelope.v !== 1 || envelope.alg !== 'AES-GCM-256') {
    throw new Error('Encrypted TODO payload version is unsupported.');
  }

  const key = await deriveContractKey(context);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(fromBase64Url(envelope.n)),
        additionalData: toArrayBuffer(makeAad(context.networkId, context.contractAddress)),
      },
      key,
      toArrayBuffer(fromBase64Url(envelope.ct)),
    );
    return textDecoder.decode(plaintext);
  } catch {
    throw new Error('Unable to decrypt TODO payload with this wallet for this contract.');
  }
}
