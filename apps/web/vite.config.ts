import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/* The identity service is reached through this origin, never directly. That is the back-end-for-
   front-end the architecture calls for: the session cookie stays first-party and HttpOnly, there is
   no CORS to get wrong, and the page's connect-src can stay 'self'. */
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  /* Four entries, one per audience, because they are four applications rather than one wearing four
     sets of navigation.
       index    — patients and families
       staff    — nurse, doctor, pharmacy partner, Control Tower
       admin    — the back office
       landing  — the public page
     The split is what a person reading about MyThuso, or a patient opening their own visits on a
     mid-range phone on metered data, does not have to pay for: neither of them downloads a dispatch
     board, a vetting queue or an operations console. Rollup shares whatever the entries genuinely
     have in common — React, the design system, the contracts — into common chunks, so the cost of a
     fourth entry is the code only that entry uses. */
  build: { rollupOptions: { input: {
    app: resolve(import.meta.dirname, 'index.html'),
    staff: resolve(import.meta.dirname, 'staff.html'),
    admin: resolve(import.meta.dirname, 'admin.html'),
    landing: resolve(import.meta.dirname, 'landing.html')
  } } },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': { target: process.env.MYTHUSO_API ?? 'http://127.0.0.1:8787', changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } }
  }
});
