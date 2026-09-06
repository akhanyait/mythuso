import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/* The identity service is reached through this origin, never directly. That is the back-end-for-
   front-end the architecture calls for: the session cookie stays first-party and HttpOnly, there is
   no CORS to get wrong, and the page's connect-src can stay 'self'. */
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  /* Two entries: the public landing page, and the app itself. Someone reading about MyThuso should
     not have to download the whole application to do it. */
  build: { rollupOptions: { input: { app: resolve(import.meta.dirname, 'index.html'), landing: resolve(import.meta.dirname, 'landing.html') } } },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': { target: process.env.MYTHUSO_API ?? 'http://127.0.0.1:8787', changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } }
  }
});
