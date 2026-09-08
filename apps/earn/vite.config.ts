import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@privy-io')) return 'privy';
          if (id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/react')) return 'react';
        },
      },
    },
  },
});
