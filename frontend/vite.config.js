import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from your phone / tunnels (ngrok, cloudflared)
    allowedHosts: true,
  },
});
