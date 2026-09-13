import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/* The identity service is reached through this origin, never directly. That is the back-end-for-
   front-end the architecture calls for: the session cookie stays first-party and HttpOnly, there is
   no CORS to get wrong, and the page's connect-src can stay 'self'. */
import { resolve } from 'node:path';
export default defineConfig({
  /* Three entries, one per audience that genuinely is one.
       app      — the product: patients and families, and behind a role, the clinical workspaces
                  and the back office
       landing  — the public page
       status   — what is connected and what is not, for anyone deciding whether to trust it

     There were five. `staff.html` and `admin.html` were separate entries with separate sign-in
     screens, and the founder's instruction closed both: "create auto logins for all the user roles
     instead of creating different entry points". They are not gone, they are lazily-imported chunks
     of `app` now — see src/Doorway.tsx — because the argument the five-entry split was made for is
     about bytes and survives the merge intact. A patient opening her own visits on a mid-range phone
     on metered data still does not download a dispatch board, a vetting queue or an operations
     console: they are behind a dynamic import, and the entry's first load measured 287.2 kB gzipped
     before the merge and 286.6 kB after it. A lazy route is what keeps that true, and it is the one
     thing here that would be easy to undo by accident — a static import of either shell from any
     module this entry already reaches puts all of it back into the first load, silently.

     Status is the smallest of the three and is meant to stay that way. It is the page somebody opens
     when they suspect nothing works, which is as likely to be on a metered connection in a car park
     as at a desk, so it imports the design system's core and the capability contract and stops
     there — no shell, no feature modules, no app.css. If this entry ever starts pulling a screen in
     behind it, that is the regression, not the size. */
  build: { rollupOptions: { input: {
    app: resolve(import.meta.dirname, 'index.html'),
    landing: resolve(import.meta.dirname, 'landing.html'),
    status: resolve(import.meta.dirname, 'status.html'),
    /* The shop is its own entry for the same reason status is: a different audience, on a
       different errand. A patient checking her visit on metered data must not download a product
       catalogue, and a person browsing a blood pressure monitor does not need the dispatch board.
       It is also the entry most likely to grow — images, a basket, a checkout — and keeping that
       growth outside index.html is what protects the 286.6 kB the patient entry is held to. */
    shop: resolve(import.meta.dirname, 'shop.html')
  } } },
  /* The paths nginx serves, served here too — including `/`, which is the one that was not.
   *
   * `deploy/nginx/mythuso.conf` maps / to landing.html, /app/ to index.html and /status/ to its own
   * entry. The dev server knew none of that, so every one of those paths fell through to index.html
   * and a person testing locally got the patient app — and, since sign-in landed, the sign-in wall —
   * wherever they went. /status/ was the worst of them: it is the page a funder is sent to, it
   * deliberately carries no framework at all, and locally it was serving the application it exists
   * to be independent of.
   *
   * `/` was left diverging as a debt: ninety-one `page.goto('/')` calls across twenty specs assumed
   * the patient app was at the root, so closing it was a change to the suite rather than to this
   * file. It is closed — the specs open `/app/`, which is where production has always served the
   * patient application from, and no journey in this repository is walked at a path that serves the
   * marketing page in production any more.
   *
   * /staff and /admin are 301s rather than entries. They were two applications with two sign-in
   * screens; they are two roles on one door now, so the old addresses send a reader to that door
   * rather than 404ing a bookmark. nginx does the same, which is the whole point of this block: a
   * local environment that answers differently from the deployed one does not fail, it misleads.
   *
   * A boundary check holds the entry list above to the nginx site file, and this map to both, so the
   * three cannot drift apart without the build saying so. */
  plugins: [react(), {
    name: 'mythuso-pretty-paths',
    configureServer(server) {
      const served: Record<string, string> = { '/': '/landing.html', '/app': '/index.html', '/status': '/status.html', '/shop': '/shop.html' };
      const moved: Record<string, string> = { '/staff': '/app/', '/admin': '/app/' };
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/';
        const [path, query] = url.split('?');
        const key = path.replace(/\/$/, '') || '/';
        const gone = moved[key];
        if (gone) { res.writeHead(301, { Location: query === undefined ? gone : `${gone}?${query}` }); return res.end(); }
        const entry = served[key];
        if (entry) req.url = query === undefined ? entry : `${entry}?${query}`;
        next();
      });
    }
  }],
  server: {
    host: '0.0.0.0',
    proxy: { '/api': { target: process.env.MYTHUSO_API ?? 'http://127.0.0.1:8787', changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } }
  }
});
