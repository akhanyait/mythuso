import { expect, test, type Page } from '@playwright/test';
import { openAdminConsole, openWorkspace } from './nav';

/* Every navigation destination in every application, walked, and asked one question.
 *
 * WHY THIS FILE EXISTS. docs/FLOW-COMPLETENESS.md records all 96 journeys — where each starts,
 * where it stops and how badly. It was true on the day it was walked and several of its rows were
 * stale a day later, because it is prose and nothing verifies prose. Six of the defects it found
 * were one kind: a name in a navigation with no screen behind it. Two of the partner's four entries
 * rendered the Orders screen verbatim, H1 included. The Control Tower's *Vetting queue* rendered
 * the nurse's own application form, so an operator opened a queue and was shown a blank SANC field.
 * *Quality* and *Protocols* were sections whose only control opened a dialog saying the workflow is
 * not drawn. That class of defect is mechanically detectable, and this is the detector.
 *
 * WHAT IS AND IS NOT A GAP. The line the audit drew is the line kept here, and it matters more than
 * the assertions. `packages/catalog/capabilities.json` declares fifteen capabilities and not one is
 * connected — deliberately. A screen that completes and says plainly that nothing was dispatched,
 * charged or sent is **finished**. So nothing here looks at capability notices, at "This does not
 * book a visit", or at any of the sentences that make this preview honest; a spec that failed on
 * those would be a spec arguing that the product should overstate itself.
 *
 * What is asked of every destination is four things, and all four are about the screen existing:
 *
 *   1. It draws something. A destination with no heading and no content is a dead link.
 *   2. It does not open a dialog by arriving. A nav entry whose screen is a modal saying the
 *      workflow is not drawn is a name on a list, not a screen.
 *   3. It is not the shell's own workflow-door fallback — the panel StaffShell draws when a section
 *      genuinely has nothing behind it.
 *   4. It is its own screen. Two tests: no destination renders text identical to another
 *      destination's in the same application, and no destination's <h1> is a *different*
 *      destination's name. The first catches Collections rendering Orders verbatim; the second
 *      catches a screen that borrowed one heading and grew its own body underneath.
 *
 * What this spec does NOT hold is everything in the audit that needs a person to read a screen:
 * whether a journey's next step is the right one, whether five outcomes should lead to five
 * different places, whether a control the audit calls "blocking" matters more than one it calls
 * "rough". Those rows stay prose, and FLOW-COMPLETENESS.md says which is which. */

type Destination = { name: string; open: (page: Page) => Promise<void> };
type Application = { app: string; enter: (page: Page) => Promise<void>; destinations: Destination[] };

/* The patient's sections are a sidebar above 1000px and a tab bar with a More menu below it, and a
   journey has to reach the same screen either way. tests/nav.ts's goSection matches a row by its
   exact accessible name, which is right for the clinical tabs and wrong here: "My visits" carries a
   visit count inside the button, so its accessible name is "My visits 4" and an exact match waits
   thirty seconds for a row that is on the screen. Matched by contained text instead. */
/* Four of the ten are tabs on a phone, under a shorter label than their section name — a tab strip
   at 390px cannot carry "Health Passport". The other six are rows in the More hub. */
const patientTabLabel: Record<string, string> = {
  'Overview': 'Home', 'Book a nurse': 'Book care', 'My visits': 'Visits', 'Health Passport': 'Passport'
};
async function goPatient(page: Page, name: string) {
  const sidebar = page.locator('.sidebar');
  if (await sidebar.isVisible()) {
    const row = sidebar.locator('nav[aria-label="Main navigation"] button, button.settings-link').filter({ hasText: name });
    await row.first().click();
    return;
  }
  const short = patientTabLabel[name];
  if (short) { await page.locator('.tabbar button').filter({ hasText: short }).first().click(); return; }
  await page.locator('.tabbar button').last().click();
  await page.locator('.menu-row').filter({ hasText: name }).first().click();
}

/* The clinical shell draws its sections as a sidebar and as a tab bar whose visible label is short
   and whose accessible name is the whole section, so both are addressed by accessible name. */
async function goStaff(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name, exact: true }).click(); return; }
  await page.locator('.tabbar').getByRole('button', { name, exact: true }).click();
}

/* The console is one page with a tab strip rather than a routed shell, so a section is a panel
   rather than a screen — and the strip is in the sidebar above 1000px and inside the console below
   it. Both carry the same eight names. */
async function goAdmin(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Console sections' });
  const strip = (await sidebar.isVisible()) ? sidebar : page.locator('.console-tabs');
  await strip.getByRole('button', { name, exact: true }).first().click();
}

const patientSections = ['Overview', 'Book a nurse', 'My visits', 'Health Passport', 'My family',
                         'Care plans', 'Thuso Wallet', 'Explore MyThuso', 'Language & access', 'Privacy & settings'];
const staffSections: Record<string, string[]> = {
  Nurse: ['Schedule', 'Assessments', 'Thuso Kit', 'Earnings & payouts', 'Vetting'],
  Doctor: ['Review queue', 'Teleconsultation', 'Patient context', 'Consultation records', 'Protocols'],
  Partner: ['Orders', 'Substitution & repeats', 'Collections', 'Results'],
  'Control Tower': ['Dispatch', 'Incidents', 'Vetting queue', 'Quality']
};
const adminSections = ['Overview', 'Vetting', 'Operations', 'Clinical', 'Catalogue', 'Growth', 'Finance', 'Compliance'];

const applications: Application[] = [
  { app: 'Patient', enter: async page => { await page.goto('/'); },
    destinations: patientSections.map(name => ({ name, open: (page: Page) => goPatient(page, name) })) },
  ...Object.entries(staffSections).map(([role, sections]) => ({
    app: role,
    enter: async (page: Page) => { await openWorkspace(page, role); },
    destinations: sections.map(name => ({ name, open: (page: Page) => goStaff(page, name) }))
  })),
  { app: 'Admin', enter: openAdminConsole,
    destinations: adminSections.map(name => ({ name, open: (page: Page) => goAdmin(page, name) })) }
];

/* The shell's own "nothing behind this name" shapes. `.workflow-door` is the panel StaffShell draws
   for a section it has no screen for; `.staff-blank` is the body of the not-drawn dialog. Both are
   quoted here by class rather than by their sentences, because the sentences are the honest part
   and are meant to be edited. */
const NOT_DRAWN = '.workflow-door, .staff-blank';

/* The trailing list of secondary links every clinical section carries. It is chrome, not the
   screen, and two sections that differ only in what is on it are still two screens. Stripped before
   the texts are compared so that "these two are the same screen" means what it says. */
function screenText(raw: string) {
  return raw.split('More tools')[0].replace(/\s+/g, ' ').trim();
}

for (const { app, enter, destinations } of applications) {
  test(`${app}: every navigation destination has a screen of its own`, async ({ page }) => {
    await enter(page);
    const main = page.locator('#main');
    const seen = new Map<string, { text: string; heading: string }>();
    const names = new Set(destinations.map(d => d.name));

    for (const { name, open } of destinations) {
      await open(page);
      await expect(main).toBeVisible();

      /* 2. Arriving somewhere must not be the same act as opening a dialog. */
      await expect(page.getByRole('dialog'), `${app} → ${name} opens a dialog rather than a screen`).toHaveCount(0);
      /* 3. And the destination must not be the shell's placeholder for a section with nothing behind it. */
      await expect(main.locator(NOT_DRAWN), `${app} → ${name} renders the not-drawn placeholder, so the name is on the navigation and the screen is not built`).toHaveCount(0);

      /* 1. It draws something. The threshold is deliberately low — this is the dead-link test, not
         a judgement about how much a screen should say. */
      const text = screenText(await main.innerText());
      expect(text.length, `${app} → ${name} renders almost nothing`).toBeGreaterThan(80);
      await expect(main.locator('h1, h2, h3').first(), `${app} → ${name} draws no heading at all`).toBeVisible();

      /* allTextContents rather than first().textContent(): a section with no <h1> at all is
         legitimate here — seven of them render a feature component that heads itself with an h2 —
         and asking a non-existent element for its text waits out the whole timeout. */
      const heading = (await main.locator('h1').allTextContents())[0]?.trim() ?? '';
      /* 4a. A destination whose <h1> is a *different* destination's name is rendering that one's
         screen. Two of the partner's four entries did exactly this. */
      if (heading && heading !== name && names.has(heading)) {
        throw new Error(`${app} → ${name} is headed "${heading}", which is another section in the same application. It is rendering that section's screen rather than one of its own.`);
      }
      /* 4b. And the whole-text version of the same question, which catches a duplicate whose
         heading was renamed and whose body was not. */
      for (const [other, before] of seen) {
        if (before.text === text) throw new Error(`${app} → ${name} renders exactly what ${app} → ${other} renders. One of the two has no screen of its own.`);
      }
      seen.set(name, { text, heading });
    }

    expect(seen.size, `${app} has ${destinations.length} navigation destinations and ${seen.size} were walked`).toBe(destinations.length);
  });
}

/* The public page is the fourth entry and its navigation is anchors down one document rather than
   sections behind a router, so the question it answers is the same one in its own shape: does every
   name in the nav land somewhere that exists. An anchor pointing at an id nothing carries is the
   landing page's version of a dead link. */
test('Landing: every navigation anchor lands on a section that exists', async ({ page }) => {
  await page.goto('/landing.html');
  const anchors = page.locator('.landing-nav a[href^="#"]');
  const count = await anchors.count();
  expect(count, 'The landing page navigation has no anchors, so either the page or this check is wrong').toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const href = await anchors.nth(i).getAttribute('href');
    const label = (await anchors.nth(i).textContent())?.trim();
    expect(href, `Landing → ${label} has no destination`).toBeTruthy();
    await expect(page.locator(href!), `Landing → ${label} points at ${href}, and nothing on the page carries that id`).toHaveCount(1);
  }
});
