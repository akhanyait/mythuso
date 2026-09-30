import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { capabilityOf, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The nurse's "Team", on both viewports.
 *
 * Wave 4 of the full Lovable design alignment. The export draws the nurse a team screen: her
 * colleagues, who is on shift, who is nearby and who she can reach. None of that is built, because
 * there is no workforce — `booking` is blocked on a nurse roster with real availability, and what
 * stands in for one is packages/catalog/roster.json, nine fictional nurses whose own `_note` says
 * nobody on it is real, no credential on it is valid anywhere and nobody on it has agreed to attend
 * anything. A directory that showed a colleague's position, her vetting standing or a way to write
 * to her would be presenting the simulated as the real, which is the one thing the 25 September
 * ruling forbids.
 *
 * So this proves the honest screen instead — StaffTeam.tsx, opened from the nurse's More tools the
 * way staff-messages.spec opens the Messages refusal. It reads the roster through lib/roster.ts and
 * shows it plainly as the fiction it is: every name below is roster.json's, read rather than typed,
 * and the one thing it refuses in the contract's own words is `booking`'s — that it will not commit a
 * real person to a time. It offers no way to type, to send, to assign or to book, so a directory of
 * people who do not exist cannot be mistaken for one a nurse could reach or staff from. The day a
 * real roster lands the notice and the refusal change in the contract and this spec follows them —
 * or fails loudly if the screen stops telling the truth first. */

const booking = capabilityOf('booking');
/* The screen is a refusal because booking is simulated, and the roster it reads is the simulation's.
   If the contract ever connects booking the notice disappears and there is a real workforce to
   directory, so this spec would be asserting against a screen that no longer exists: it must be
   rewritten against what booking became, not softened into passing. */
if (!booking.simulation) throw new Error('booking is no longer a simulated capability. The nurse Team screen is an honest refusal built on that simulation — a directory of the fictional roster — and so is this spec; rewrite both against what booking became rather than letting this pass on an empty refusal list.');
/* The one refusal the screen carries in the contract's own words, looked up rather than typed: it is
   `booking`'s "Commit a real person to a time.", which lib/roster.ts exposes as rosterRefusals.notAPerson. */
const notAPerson = booking.simulation.refuses.find(refusal => /commit a real person/i.test(refusal));
if (!notAPerson) throw new Error('booking no longer refuses to commit a real person to a time. The nurse Team screen leans on that exact refusal for its "Book or assign anybody" line; point this spec at whatever booking refuses now rather than deleting the assertion.');

/* Every name on the screen is roster.json's, read here rather than copied, so the spec proves the
   screen reads the whole contract roster and cannot drift into asserting a hand-typed list of nine. */
const roster = JSON.parse(readFileSync(new URL('../packages/catalog/roster.json', import.meta.url), 'utf8')) as {
 nurses: { id: string; name: string }[];
};

test(`the nurse's Team is a directory of the simulated roster and offers no way to reach, assign or book anybody`, async ({ page }) => {
 const errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await openWorkspace(page, 'Nurse');
 /* A More tool, not a section: the nurse's bar already carries six sections, and a directory of
    fictional colleagues is the last thing that should push the work she opened the app for off it.
    Team is on the nurse's bar alone — the roster is a list of nurses, so it reads as her colleagues
    and not a doctor's, which is why this journey opens one workspace rather than looping over two. */
 await page.locator('.tool-link').filter({ hasText: 'Team' }).click();
 const sheet = page.getByRole('dialog');

 /* The right screen opened: staffModalTitle leaves an unmapped name as its own title, so the modal is
    headed "Team" and nothing on the screen is a colleague's presence, standing or inbox. */
 await expect(sheet.getByRole('heading', { name: 'Team', exact: true })).toBeVisible();
 /* The notice at the top is the booking capability's own simulation notice — the same sentence the
    dispatch board and the visits screens show, because all three read it from the one place that knows. */
 await expect(sheet).toContainText(noticeFor('booking'));
 /* And the whole roster is on it, name by name, each one read out of the contract rather than typed
    here: this is the assertion that separates the honest screen from an invented one, because a
    directory that showed a tenth name, or a different nine, would not be reading roster.json. */
 for (const nurse of roster.nurses) await expect(sheet).toContainText(nurse.name);
 /* The one refusal it states in the contract's own words: it will not commit a real person to a time. */
 await expect(sheet).toContainText(notAPerson);

 /* The refusal is the feature. There is nothing to type into, and nothing that reaches, assigns or
    books anybody — a directory with no way to act on the people in it is the honest version of both
    this screen and the simulated Messages tool beside it, so the absence is proved rather than assumed. */
 await expect(sheet.getByRole('textbox')).toHaveCount(0);
 await expect(sheet.getByRole('button', { name: /send|assign|book/i })).toHaveCount(0);

 /* And it closes from the screen's own button, leaving no dialog behind. */
 await sheet.getByRole('button', { name: 'Close', exact: true }).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(errors).toEqual([]);
});
