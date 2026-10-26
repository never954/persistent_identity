import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the Ravenswood detective game.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // The suspects live in the Python backend (backend/, `npm run server`).
    // Proxying /api keeps the browser on one origin — no CORS.
    proxy: {
      '/api': {
        // RAVENSWOOD_API points a second copy of the game at another backend (testing).
        target: process.env.RAVENSWOOD_API ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
