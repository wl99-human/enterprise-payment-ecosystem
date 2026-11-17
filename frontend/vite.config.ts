import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api/v1/payments': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/api/v1/playground': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/api/v1/ledger/stream': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/ledger': {
        target: 'http://localhost:8081',
        changeOrigin: true
      },
      '/api/v1/accounts': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/analytics': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/metrics': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/chaos': {
        target: 'http://localhost:8083',
        changeOrigin: true
      },
      '/api/v1/notifications': {
        target: 'http://localhost:8082',
        changeOrigin: true
      }
    }
  }
});
