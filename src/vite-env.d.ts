/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_1AM_NETWORK?: 'preview' | 'preprod';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
