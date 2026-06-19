const ADJECTIVES = [
  'Crimson',
  'Shadow',
  'Silver',
  'Crystal',
  'Golden',
  'Ember',
  'Frost',
  'Storm',
  'Iron',
  'Cobalt',
  'Jade',
  'Onyx',
  'Scarlet',
  'Azure',
  'Violet',
  'Neon',
  'Phantom',
  'Rogue',
  'Cosmic',
  'Lunar',
  'Solar',
  'Arctic',
  'Mystic',
  'Nova',
  'Stealth',
  'Prism',
  'Cipher',
  'Echo',
  'Apex',
  'Dusk',
  'Blaze',
  'Volt',
];

const HANDLES = [
  'Pulse',
  'Vector',
  'Cipher',
  'Signal',
  'Orbit',
  'Vertex',
  'Matrix',
  'Relay',
  'Beacon',
  'Circuit',
  'Nexus',
  'Delta',
  'Quasar',
  'Nova',
  'Summit',
  'Apex',
  'Vertex',
  'Prism',
  'Spark',
  'Comet',
  'Glitch',
  'Drift',
  'Flux',
  'Trace',
  'Pulse',
  'Shard',
  'Vector',
  'Signal',
  'Echo',
  'Vault',
  'Grid',
  'Node',
];

export function decodeDisplayName(bytes: Uint8Array, entryId: number, score: number): string {
  const decoded = new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
  if (decoded.length > 0 && decoded.split('').every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) < 127)) {
    return decoded;
  }

  const hash =
    (((bytes[0] ?? 0) << 24) |
      ((bytes[1] ?? 0) << 16) |
      ((bytes[2] ?? 0) << 8) |
      (bytes[3] ?? 0)) >>>
    0;
  const seed = (hash ^ (entryId * 2654435761) ^ (score * 1597334677)) >>> 0;
  return `${ADJECTIVES[seed % ADJECTIVES.length]} ${HANDLES[(seed >>> 16) % HANDLES.length]}`;
}
