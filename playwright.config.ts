import { defineConfig } from '@playwright/test';
/* The port is configurable so that a second checkout — a git worktree, a parallel agent, a review
   of one branch while another is running — tests its own tree rather than silently reusing the dev
   server somebody else already has on 5173. Default unchanged. */
const port = process.env.MYTHUSO_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;
/* Fully parallel, and the flake it was serialised for is fixed rather than hidden.

   The suite lost a request a run under five workers — a different test each time, always something
   that hung rather than something that was wrong. That was capped to one worker, which made the
   red mean something and cost three minutes. It was a workaround: a dev server dropping requests
   would have been a bug in how the tests are served, not a reason to stop testing in parallel.

   It was not the dev server. The hero carousel was animating nine SVG bubbles and three currents
   on an infinite loop behind a screen that had stopped rendering them, and Playwright's stability
   check waits for an element's box to hold still across two animation frames. Deleting the dead
   decoration removed the animation, and eight consecutive runs at five workers passed 222 in about
   1.2 minutes each. At the roughly one-in-two failure rate before, eight clean runs is a one-in-256
   coincidence. */
export default defineConfig({ testDir: './tests', fullyParallel: true, use: { baseURL, trace: 'retain-on-failure' }, webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI }, projects: [{ name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1100 } } }, { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }] });
