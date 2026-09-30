import { test, expect } from '@playwright/test';
import { capabilityOf, openDestination, openWorkspace } from './nav';
import { noticeFor } from './notices';

/* The nurse's and the doctor's "Messages", on both viewports.
 *
 * Wave 4 of the full Lovable design alignment. The export draws both clinical roles a messages
 * inbox: a thread list with invented bodies — a doctor's reads "TH-2048 is ready for review. Two
 * blood-pressure readings are above the documented range." — and a reply box that appends whatever
 * you type to the thread. None of that is built, because `messaging` is a simulated capability with
 * no supplier behind it, and a reply box that appears to send is the one control this product must
 * not draw: the 25 September ruling is that nothing simulated is presented as real and no clinical
 * number is invented, and a made-up blood-pressure message somebody can "reply" to is both at once.
 *
 * So this proves the honest screen instead — StaffMessages.tsx, a destination in both roles' Practice
 * group since 30 September (a More tool opening a dialog until then), reached the way claims.spec
 * reaches the doctor's Claim draft. It says what the contract says about a
 * simulated channel, it lists the contract's own three refusals, and it offers no way to type or to
 * send. Every sentence asserted here is packages/catalog/capabilities.json's, read rather than
 * typed, so the day a supplier is signed the notice and the refusals change in the contract and
 * this spec follows them — or fails loudly if the screen stops telling the truth first. */

const messaging = capabilityOf('messaging');
/* The screen is a refusal because messaging is simulated, and it reads the simulation's own three
   refusals. If the contract ever connects messaging the notice disappears and there is nothing left
   to refuse, so this spec would be asserting against a screen that no longer exists: it must be
   rewritten against whatever messaging became, not softened into passing. */
if (!messaging.simulation) throw new Error('messaging is no longer a simulated capability. The staff Messages screen is an honest refusal built on that simulation, and so is this spec; rewrite both against what messaging became rather than letting this pass on an empty refusal list.');
const refuses = messaging.simulation.refuses;

for (const role of ['Nurse', 'Doctor'] as const) {
 test(`the ${role.toLowerCase()}'s Messages tells the truth about a simulated channel and offers no way to send`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openWorkspace(page, role);
  /* A destination in the grouped navigation, behind More on a phone: a simulated inbox is the last
     thing that should push the work she opened the app for off the tab bar. openDestination waits for
     the page headed "Messages", so the right screen opened and nothing on it is a thread. */
  const sheet = await openDestination(page, 'Messages');
  /* The notice at the top is the messaging capability's own simulation notice — the same sentence
     the patient's Notifications screen shows, because both read it from the one place that knows. */
  await expect(sheet).toContainText(noticeFor('messaging'));
  /* And the three things a simulated channel refuses, in the contract's own words rather than a
     paraphrase of them — the same arrangement the locum register and the Academy hold theirs in. */
  for (const refusal of refuses) await expect(sheet).toContainText(refusal);

  /* The refusal is the feature. There is nothing to type into and nothing that sends, which is the
     assertion that separates this screen from the export's: a working reply box is exactly what must
     not be here, so its absence is proved rather than assumed. */
  await expect(sheet.getByRole('textbox')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /send/i })).toHaveCount(0);

  /* And it closes from the screen's own button, back to the screen the role opens on, with no dialog anywhere. */
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Messages', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
 });
}
