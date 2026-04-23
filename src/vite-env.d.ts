/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_1AM_NETWORK?: 'preview' | 'preprod';
  readonly VITE_ZK_TODO_ASSET_BASE_PATH?: string;
  readonly VITE_ZK_SHIELDED_TODO_ASSET_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
