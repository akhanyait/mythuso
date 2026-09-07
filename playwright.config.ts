import { defineConfig } from '@playwright/test';
/* The port is configurable so that a second checkout — a git worktree, a parallel agent, a review
   of one branch while another is running — tests its own tree rather than silently reusing the dev
   server somebody else already has on 5173. Default unchanged. */
const port = process.env.MYTHUSO_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;
/* One worker. Not a performance decision — a correctness one.
   Every worker is served by the same Vite dev server, and in parallel it loses requests under
   load: a click resolves its element, the click begins, and what should follow never arrives, so
   whichever spec was running times out. The failure moved between runs — a different test each
   time, always something that hung rather than something that was wrong — which is the signature
   of contention and not of a defect. Three workers still lost one. Serially the suite is 222 green
   in six and a half minutes; in parallel it is three and a half with a red that means nothing.
   A suite you have to re-run to believe is worse than a slow one, so this is one worker until the
   contention itself is fixed rather than raced against. */
export default defineConfig({ testDir: './tests', fullyParallel: true, workers: 1, use: { baseURL, trace: 'retain-on-failure' }, webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI }, projects: [{ name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1100 } } }, { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }] });
