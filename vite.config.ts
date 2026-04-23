import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = (env.DEV_ALLOWED_HOSTS || 'localhost')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    plugins: [react(), wasm(), topLevelAwait()],
    resolve: {
      dedupe: [
        '@midnight-ntwrk/compact-js',
        '@midnight-ntwrk/compact-runtime',
        '@midnight-ntwrk/ledger-v8',
        '@midnight-ntwrk/onchain-runtime-v3',
      ],
    },
    optimizeDeps: {
      include: [
        '@midnight-ntwrk/compact-js',
        '@midnight-ntwrk/compact-runtime',
        '@midnight-ntwrk/ledger-v8',
        '@midnight-ntwrk/onchain-runtime-v3',
        '@midnight-ntwrk/midnight-js-contracts',
        '@midnight-ntwrk/midnight-js-types',
      ],
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts,
    },
  };
});
