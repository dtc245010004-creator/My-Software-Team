import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
 feature/ManhDung
        target: 'http://127.0.0.1:8000',

        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000',
 main
        changeOrigin: true,
      },
      '/ws': {
 feature/ManhDung
        target: 'ws://127.0.0.1:8000',

        target: (process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/^http/, 'ws'),
main
        ws: true,
      },
    },
  },
});
