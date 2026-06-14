import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://backend:8000',
        changeOrigin: true
      },
      '/docs': {
        target: 'http://backend:8000',
        changeOrigin: true
      },
      '/health': {
        target: 'http://backend:8000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});
