import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseRole, goSection, openAdminConsole, openWorkspace } from './nav';
import { changeTiming, fill, openConfiguration, type TimingRow } from './safety-settings';

/* The Control Tower's concerns on the escalation rota, on both viewports.
 *
 * The journeys check what makes the rota a setting rather than what makes the board look finished: a
 * concern opened after an admin changes the minutes at a rung moves up on the new minutes, in the preview's
 * own clock; a concern opened under the defaults waits its full minutes at the desk; and a concern that ran
 * out of people says so, first, with the post nobody holds written down rather than skipped in silence.
 *
 * Every sentence, post, role and minute is read from the contracts — packages/catalog/closed-loop.json's
 * screen, settings and preview, and the vetting register — and time is Playwright's clock, so a changed
 * default or a changed post moves these journeys with it instead of breaking them. */
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const closedLoop = json('../packages/catalog/closed-loop.json');
const scheduling = json('../packages/catalog/scheduling.json');
const roles = json('../packages/catalog/vetting.json').roles as { id: string; name: string }[];
const screen = closedLoop.screen as Record<string, string>;
type Post = { id: string; label: string; role: string | null };
type Concern = { loopRef: string; spanMinutes: number; openedMinutesAgo: number };
const rota = closedLoop.settings.items.find((s: { key: string }) => s.key === closedLoop.escalation.rotaSetting) as { posts: Post[] };
const minutes = closedLoop.settings.items.find((s: { key: string }) => s.key === closedLoop.escalation.minutesSetting) as TimingRow;
const roleName = (id: string) => roles.find(role => role.id === id)!.name;
const [desk, lead] = rota.posts as [Post, Post];
const rungs = String(rota.posts.length);
const concerns = closedLoop.preview.concerns as Concern[];
/* The concern whose fallback's time runs out as the board is first opened, so it reaches the first post then;
   and the one opened long enough ago to have run out of people. */
const reachingTheDesk = concerns.find(c => c.openedMinutesAgo === 2 * c.spanMinutes)!;
const longAgo = concerns.find(c => c !== reachingTheDesk)!;

const MINUTE = 60_000;
/* A Tuesday morning, when the desk is on. */
const START = new Date('2026-09-15T08:00:00+02:00');
const clock = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: scheduling.timezone });
/* Whether a post is on duty at a moment, by the default rota's own windows, read on the day and at the time
   where the rota is kept — the question the engine asks before a concern is handed to a post. */
type Window = { post: string; days: string[]; from: string; to: string };
const windows = (closedLoop.settings.items.find((s: { key: string }) => s.key === closedLoop.escalation.rotaSetting).default.value) as Window[];
const onDutyAt = (post: string, at: number) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: scheduling.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(at)).map(part => [part.type, part.value]));
  const day = String(parts.weekday).slice(0, 3).toLowerCase();
  const time = `${parts.hour}:${parts.minute}`;
  return windows.some(w => w.post === post && w.days.includes(day) && w.from <= time && time < w.to);
};

/* The workspace arrives on a dynamic import, whether it is opened by its link or chosen in the same tab, so
   the navigation is waited for before a section is chosen from it. */
async function openBoard(page: Page): Promise<Locator> {
  await expect(page.getByRole('navigation', { name: 'Primary' }).or(page.getByRole('navigation', { name: 'Main navigation' })).first()).toBeVisible();
  await goSection(page, 'Incidents');
  const board = page.getByRole('region', { name: screen.heading });
  await expect(board).toBeVisible();
  return board;
}
const rowOf = (board: Locator, loopRef: string) => board.locator('.cl-row').filter({ hasText: loopRef });
const noOverflow = (page: Page) => page.evaluate(() =>
  [document.documentElement, document.querySelector('main')].filter((el): el is HTMLElement => Boolean(el)).every(el => el.scrollWidth <= el.clientWidth + 1));

test('an admin shortens rung one to a minute, and a concern the Control Tower opens after it moves up after one minute', async ({ page }) => {
  await page.clock.install({ time: START });
  await openAdminConsole(page);
  await openConfiguration(page);
  const from = minutes.default.value as number[];
  const to = [1, ...from.slice(1)];
  await changeTiming(page.getByRole('region', { name: closedLoop.settings.heading }), minutes, from, to, 'The desk answers inside a minute on this shift.');

  await chooseRole(page, 'Control Tower');
  const board = await openBoard(page);
  const row = rowOf(board, reachingTheDesk.loopRef);
  await expect(row).toContainText(fill(screen.onRung, { rung: '1', rungs }));
  await expect(row).toContainText(fill(screen.holds, { holder: desk.label, role: roleName(desk.role!) }));
  await expect(row).toContainText(fill(screen.movesUp, { at: clock(START.getTime() + MINUTE) }));
  await expect(row).toContainText(fill(screen.rotaVersion, { version: '2' }));

  await page.clock.fastForward(MINUTE);
  await expect(row).toContainText(fill(screen.onRung, { rung: '2', rungs }));
  await expect(row).toContainText(fill(screen.holds, { holder: lead.label, role: roleName(lead.role!) }));
});

test('under the defaults the same concern waits its full minutes at the desk, and a concern with nobody left is first and says why', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Control Tower');
  const board = await openBoard(page);
  await expect(board).toContainText(screen.intro);
  await expect(board).toContainText(screen.preview);

  /* Where the older concern ran out, worked out from the contract the same way the board does: its owner's
     time, its fallback's, then each post a role holds and that is on duty when the concern reaches it, for its
     minutes, the last for the concern's own span. A post off duty then is skipped at that moment. */
  let reached = START.getTime() + (2 * longAgo.spanMinutes - longAgo.openedMinutesAgo) * MINUTE;
  const offDuty: { post: Post; at: number }[] = [];
  rota.posts.forEach((post, index) => {
    if (post.role === null) return;
    if (!onDutyAt(post.id, reached)) { offDuty.push({ post, at: reached }); return; }
    reached += ((minutes.default.value as number[])[index] ?? longAgo.spanMinutes) * MINUTE;
  });
  const first = board.locator('.cl-row').first();
  await expect(first).toContainText(longAgo.loopRef);
  await expect(first).toContainText(fill(screen.exhausted, { at: clock(reached) }));
  for (const post of rota.posts.filter(p => p.role === null)) await expect(first).toContainText(fill(screen.skippedNoRole, { post: post.label }));
  for (const skip of offDuty) await expect(first).toContainText(fill(screen.skippedOffDuty, { post: skip.post.label, at: clock(skip.at) }));

  const row = rowOf(board, reachingTheDesk.loopRef);
  const atTheDesk = (minutes.default.value as number[])[0]!;
  await expect(row).toContainText(fill(screen.movesUp, { at: clock(START.getTime() + atTheDesk * MINUTE) }));
  await page.clock.fastForward(MINUTE);
  await expect(row).toContainText(fill(screen.onRung, { rung: '1', rungs }), { timeout: 2_000 });
  await page.clock.fastForward((atTheDesk - 1) * MINUTE);
  await expect(row).toContainText(fill(screen.onRung, { rung: '2', rungs }));
  expect(await noOverflow(page), 'the concerns board scrolls the page sideways').toBe(true);
});

/* Who holds each post, and closing a concern with its outcome. The Head of Operations post is held by the
   Head of Operations since the role joined the register, and the Control Tower says so for every post of the
   rota in force. The operator closes a concern only with one of the outcomes the closed loop lists: pressing
   close with nothing chosen is refused in the close route's own sentence, and nothing changes. */
const closeRoute = json('../packages/catalog/apis/core.json').routes.find((r: { path: string; withdrawn?: unknown }) => r.path === '/v1/core/loops/{loopRef}/close' && !r.withdrawn) as { refusals: { id: string; statement: string }[] };
const closeRefusal = (id: string) => closeRoute.refusals.find(r => r.id === id)!.statement;
const outcomes = closedLoop.outcomes.value as { id: string; label: string }[];

test('the Control Tower shows who holds each post, the Head of Operations included, and an operator closes a concern only with an outcome', async ({ page }) => {
  await page.clock.install({ time: START });
  await openWorkspace(page, 'Control Tower');
  const board = await openBoard(page);
  const posts = board.getByRole('list', { name: screen.postsHeading });
  expect(rota.posts.every(post => post.role !== null), 'every post of the rota is held by a role on the register').toBe(true);
  for (const post of rota.posts) await expect(posts).toContainText(fill(screen.postHeld, { post: post.label, role: roleName(post.role!) }));

  const row = rowOf(board, longAgo.loopRef);
  await row.getByRole('button', { name: screen.close }).click();
  const choices = row.getByRole('group', { name: fill(screen.closeLegend, { loopRef: longAgo.loopRef }) });
  await row.getByRole('button', { name: screen.confirmClose }).click();
  await expect(row.getByRole('alert')).toHaveText(closeRefusal('no-outcome'));
  await expect(rowOf(board, longAgo.loopRef)).toHaveCount(1);

  const outcome = outcomes[0]!;
  await choices.getByLabel(outcome.label, { exact: true }).check();
  await row.getByRole('button', { name: screen.confirmClose }).click();
  await expect(rowOf(board, longAgo.loopRef)).toHaveCount(0);
  await expect(board.getByRole('status').filter({ hasText: longAgo.loopRef })).toHaveText(fill(screen.closed, { loopRef: longAgo.loopRef, at: clock(START.getTime()), outcome: outcome.label }));
  await expect(rowOf(board, reachingTheDesk.loopRef)).toHaveCount(1);
  expect(await noOverflow(page), 'closing a concern scrolls the page sideways').toBe(true);
});
