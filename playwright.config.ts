import { defineConfig } from '@playwright/test';
/* The port is configurable so that a second checkout — a git worktree, a parallel agent, a review
   of one branch while another is running — tests its own tree rather than silently reusing the dev
   server somebody else already has on 5173. Default unchanged.

   That comment was true and it was not enough, which is the third way a green run here has turned
   out to be a lie. Setting the variable was left to whoever remembered, and `reuseExistingServer`
   was on, so a run that forgot it attached to whatever was listening on 5173 and tested that tree
   instead. It happened: an agent working in its own worktree got "333 passed" and "346 passed"
   against a tree it had not written a line of, and only noticed because the numbers moved while its
   own changes could not have moved them. Nothing was wrong with the tests. They were run against
   somebody else's application and reported as this one's.

   So reuse is off. Every run now starts a server it owns, and if the port is busy it fails loudly
   rather than borrowing. A parallel checkout sets MYTHUSO_PORT, as the paragraph above always
   said — the difference is that forgetting is now a failure instead of a false pass. */
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
   coincidence.

   Two workers, and I checked before writing this down.

   That analysis was done against 222 tests. The suite is 376 now. At the default worker count — half
   the cores, five here — a full run loses fifteen to twenty tests, a different set every time, each
   one a timeout waiting for a control that is present and passes on its own.

   I assumed four would be enough and wrote a comment saying it passed twice, before running it.
   It does not: twenty failed. Two passes, and has passed every time it has been asked to. So two is
   what this declares.

   This is not the flake above and it is not the same cause — nothing here is animating. It is
   contention: browsers, a Vite dev server and a ten-core machine. The honest reading is that the
   suite has outgrown the parallelism its own comment was written for, and the number should be
   measured again when the box is quiet rather than inferred from the core count. What must not
   happen is leaving it to the default and calling the result flaky when it varies. */
/* Johannesburg, whatever the machine running the suite says. The sample visit takes the next slot by the
   browser's own clock while the arrival screen reads the day and the window in Africa/Johannesburg, so
   on a runner set to UTC the pinned eight o'clock was six, the first slot was the one starting now,
   and the nurse had already arrived before the journey looked for her. Every person this is built for
   is in that timezone; a suite that passes only on a machine that happens to be is not a suite. */
const timezoneId = 'Africa/Johannesburg';
/* The artifacts directory is port-suffixed for the same reason the port is configurable, and the
   reason is a failure that looks like a broken test and is not. Playwright clears outputDir when a
   run starts. Two runs in one checkout — a second agent session, a review of one branch while
   another is being tested — therefore share `test-results/`, and the second run's startup deletes
   the first run's artifacts while it is still writing them. What the first run reports is

     browserContext.close: ENOENT: no such file or directory, open
       'test-results/.playwright-artifacts-0/<hash>/trace...'

   after the test itself has finished, so the red names a test that passed and the trace that would
   have shown why is gone. Measured on 6 October 2026: three mobile failures in a full baseline, two
   of them `dispensing.spec.ts`, all three passing on their own; the one that did not pass on its own
   was run while a second suite was live in the same checkout, and its error was this ENOENT and not
   an assertion. A red that is somebody else's deletion cannot be debugged, because there is nothing
   in it about the code.

   So the directory follows MYTHUSO_PORT exactly as baseURL does: unset keeps the default name and
   the default behaviour, and a run that sets its port gets its own artifacts too. .gitignore already
   covers the suffix — its own line is the glob for that folder with a trailing star, commented "the
   default and the per-agent ones" — and scripts/check-boundaries.mjs skips the prefix when it walks
   for manifests.

   Written without the literal glob in this comment on purpose. It ends in the two characters that
   close a block comment, and spelling it out here closed this one early and left the remainder of
   the sentence to be parsed as code: "Missing semicolon" three lines below the line that broke. */
const outputDir = process.env.MYTHUSO_PORT ? `test-results-${process.env.MYTHUSO_PORT}` : 'test-results';

export default defineConfig({ testDir: './tests', fullyParallel: true, workers: 2, outputDir, use: { baseURL, timezoneId, trace: 'retain-on-failure' }, webServer: { command: `VITE_MYTHUSO_STAFF_PREVIEW=true npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: false }, projects: [{ name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1100 } } }, { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }] });
