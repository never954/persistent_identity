import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the Ravenswood detective game.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // Proxy the suspect LLM to the local Ollama server so the browser has no
    // CORS to fight. The memory service calls /ollama/api/chat.
    proxy: {
      '/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ollama/, ''),
      },
    },
  },
});
