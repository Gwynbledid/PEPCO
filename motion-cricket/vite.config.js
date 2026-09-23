import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `base: './'` keeps every URL relative so the same build works when it is
// served from a web host and when it is packaged inside the Android app.
// `--mode phone` serves over https, which phones on the LAN need for camera access.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'phone' ? [basicSsl()] : [],
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
}));
