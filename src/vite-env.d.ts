/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_1AM_NETWORK?: 'preview' | 'preprod';
  readonly VITE_ZK_MINT_ASSET_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
