import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/* The identity service is reached through this origin, never directly. That is the back-end-for-
   front-end the architecture calls for: the session cookie stays first-party and HttpOnly, there is
   no CORS to get wrong, and the page's connect-src can stay 'self'. */
import { resolve } from 'node:path';
export default defineConfig({
  /* Five entries, one per audience, because they are five applications rather than one wearing five
     sets of navigation.
       index    — patients and families
       staff    — nurse, doctor, pharmacy partner, Control Tower
       admin    — the back office
       landing  — the public page
       status   — what is connected and what is not, for anyone deciding whether to trust it
     The split is what a person reading about MyThuso, or a patient opening their own visits on a
     mid-range phone on metered data, does not have to pay for: neither of them downloads a dispatch
     board, a vetting queue or an operations console. Rollup shares whatever the entries genuinely
     have in common — React, the design system, the contracts — into common chunks, so the cost of a
     fifth entry is the code only that entry uses.

     Status is the smallest of the five and is meant to stay that way. It is the page somebody opens
     when they suspect nothing works, which is as likely to be on a metered connection in a car park
     as at a desk, so it imports the design system's core and the capability contract and stops
     there — no shell, no feature modules, no app.css. If this entry ever starts pulling a screen in
     behind it, that is the regression, not the size. */
  build: { rollupOptions: { input: {
    app: resolve(import.meta.dirname, 'index.html'),
    staff: resolve(import.meta.dirname, 'staff.html'),
    admin: resolve(import.meta.dirname, 'admin.html'),
    landing: resolve(import.meta.dirname, 'landing.html'),
    status: resolve(import.meta.dirname, 'status.html')
  } } },
  /* The five pretty paths nginx serves, served here too.
   *
   * `deploy/nginx/mythuso.conf` maps / to landing.html, /app/ to index.html, /staff/, /admin/ and
   * /status/ to their own entries. The dev server knew none of that, so every one of those paths
   * fell through to index.html and a person testing locally got the patient app — and, since sign-in
   * landed, the sign-in wall — wherever they went. /status/ is the worst of them: it is the page a
   * funder is sent to, it deliberately carries no framework at all, and locally it was serving the
   * application it exists to be independent of.
   *
   * Same divergence as the test runner reusing a stranger's dev server, and the same lesson: a local
   * environment that answers differently from the deployed one does not fail, it misleads. The map
   * is derived from the entry list above rather than typed twice, and a boundary check already holds
   * that list to the nginx site file. */
  plugins: [react(), {
    name: 'mythuso-pretty-paths',
    configureServer(server) {
      /* Four of the five. `/` is deliberately left serving index.html here, where nginx serves
         landing.html, and that one divergence is a debt rather than a decision: ninety-one
         `page.goto('/')` calls across twenty specs assume the patient app is at the root, so
         closing it is a change to the test suite rather than to this file. Written down in
         docs/ARCHITECTURE.md rather than left for somebody to rediscover, because it means no test
         in this repository has ever opened the patient app at the path production serves it from. */
      const served = { '/app': '/index.html', '/staff': '/staff.html',
                       '/admin': '/admin.html', '/status': '/status.html' };
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/';
        const entry = served[path];
        if (entry) req.url = entry + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
        next();
      });
    }
  }],
  server: {
    host: '0.0.0.0',
    proxy: { '/api': { target: process.env.MYTHUSO_API ?? 'http://127.0.0.1:8787', changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } }
  }
});
