import { defineConfig } from '@playwright/test';
/* The port is configurable so that a second checkout — a git worktree, a parallel agent, a review
   of one branch while another is running — tests its own tree rather than silently reusing the dev
   server somebody else already has on 5173. Default unchanged. */
const port = process.env.MYTHUSO_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({ testDir: './tests', fullyParallel: true, use: { baseURL, trace: 'retain-on-failure' }, webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI }, projects: [{ name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1100 } } }, { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }] });
