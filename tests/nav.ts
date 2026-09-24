import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
/* The shell is a sidebar from 1000px and a tab bar below it, and since the workspaces got their own
   navigation both carry role sections rather than the patient's tabs. Journeys go through whichever
   one the viewport actually renders.

   Both are matched by accessible name rather than by visible text: a clinical tab shows a short
   label — "Earnings", "Repeats", "Consult" — under an accessible name that is the whole section, so
   a journey can name the section once and reach it on either viewport. */
/* Four of the patient's ten sections are tabs on a phone, under a shorter label than their section
   name. The other six are rows in the More hub, which is what the fallback below opens. */
export const PATIENT_TAB_LABEL: Record<string, string> = {
  'Overview': 'Home', 'Book a nurse': 'Book care', 'My visits': 'Visits', 'Health Passport': 'Passport'
};

export async function goSection(page: Page, name: string) {
  /* The Control Tower and the back office are one portal now (Phase 3), and their old sections are
     categories and tabs in it. A journey that names an old section is taken to where the portal's
     contract says that section went — the same table the portal itself resolves an old address by. */
  /* A role chosen in the same tab arrives on a dynamic import, so wait for whichever navigation it
     draws before deciding which kind of shell this is. */
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).or(page.locator('.tabbar'))
    .or(page.getByRole('tablist', { name: PORTAL_CATEGORIES })).first()).toBeVisible();
  if (await portalIsOpen(page)) { await goLegacySection(page, name); return; }
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) {
    const entry = sidebar.getByRole('button', { name, exact: true });
    if (await entry.count()) { await entry.click(); return; }
    /* Then by contained text. A sidebar row carries a count inside the button — "My visits 3" — so
       its accessible name is not its section name and the exact match above finds nothing. It then
       fell through to the settings links, which is a different part of the sidebar entirely, and
       waited thirty seconds for a row that was on the screen the whole time. */
    const counted = sidebar.getByRole('button').filter({ hasText: name });
    if (await counted.count()) { await counted.first().click(); return; }
    /* Not every destination is a nav row. Privacy & settings and Language & access sit in the
       sidebar's foot as settings links, and a helper that only knew about the navigation landmark
       sent every caller into a thirty-second wait for a button that was never going to be there. */
    await page.locator('button.settings-link').filter({ hasText: name }).first().click();
    return;
  }
  /* By accessible name rather than visible text: a clinical tab shows a short label and carries the
     whole section name for a screen reader, so "Earnings & payouts" is never what is drawn. */
  const tab = page.locator('.tabbar').getByRole('button', { name, exact: true });
  if (await tab.count()) { await tab.first().click(); return; }
  /* The patient's tab bar is the exception, and it is the one this helper could not reach. A strip
     at 390px cannot carry "Health Passport", so four sections are drawn *and named* short — and
     unlike the clinical tabs they do not carry the long name for a screen reader either. Every spec
     that needed them had written its own map; this is that map, in the one place navigating lives,
     because a private copy of navigation is a private copy of every fix made to it since. */
  const short = PATIENT_TAB_LABEL[name];
  if (short) {
    /* Contained text, not an exact accessible name. "Visits" carries a count inside the button, so
       its name is "Visits 3" and an exact match waits thirty seconds for a tab that is on the
       screen. That is the same trap the clinical branch above avoids for the opposite reason. */
    const patientTab = page.locator('.tabbar button').filter({ hasText: short });
    if (await patientTab.count()) { await patientTab.first().click(); return; }
  }
  /* And on a phone the rest of the patient's sections live behind More. */
  await page.locator('.tabbar button').last().click();
  const row = page.locator('.menu-row').filter({ hasText: name });
  await expect(row.first()).toBeVisible();
  await row.first().click();
}

/* One application, one address, and a role in the query string.
 *
 * There is no sign-in screen in front of a workspace any more: the four doors became one demo login
 * — apps/web/src/features/DemoLogin.tsx — and a role is a link, which is what makes it an auto login
 * rather than a menu. So a journey opens a workspace the way a person following a link does, and the
 * ids are the contract's own, out of apps/web/src/lib/roles.ts.
 *
 * The workspace arrives on a dynamic import, so `openWorkspace` waits for the navigation rather than
 * for the URL: a spec that asserted immediately after the goto would be looking at the fallback. */
const ROLE_PARAM: Record<string, string> = {
  Nurse: 'nurse', Doctor: 'doctor', Partner: 'partner', 'Control Tower': 'control-tower'
};
export async function openWorkspace(page: Page, role: string) {
  const id = ROLE_PARAM[role];
  if (!id) throw new Error(`No role "${role}" on the demo login. It offers: ${Object.keys(ROLE_PARAM).join(', ')}.`);
  await page.goto(`/app/?role=${id}`);
  /* The Control Tower opens the merged portal, whose navigation is its category list. */
  await expect(page.getByRole('navigation', { name: 'Primary' }).or(page.getByRole('navigation', { name: 'Main navigation' }))
    .or(page.getByRole('tablist', { name: PORTAL_CATEGORIES })).first()).toBeVisible();
}

/* ---- The merged Control Tower (Phase 3) -------------------------------------------------------
 *
 * One portal where the Control Tower workspace and the back office were two. Its categories, their
 * tabs and where every old tab and section went are packages/catalog/control-tower-portal.json's, read
 * here rather than copied, so a journey written against an old name follows the tab to its new place
 * the way an old bookmark does. The category list is a tab list — a column from 1000px, a strip below
 * it — and only one of the two is ever displayed, so a role query finds the one on the screen. */
type PortalTab = { id: string; label: string };
type PortalCategory = { id: string; label: string; tabs: PortalTab[]; tools?: string[] };
export const portalContract = JSON.parse(readFileSync(new URL('../packages/catalog/control-tower-portal.json', import.meta.url), 'utf8')) as {
  categories: PortalCategory[];
  legacyAddresses: { legacy: string; category: string; tab: string; disposition: string; tool?: boolean }[];
  [key: string]: unknown;
};
export const PORTAL_CATEGORIES = 'Categories';
export const portalCategory = (id: string) => {
  const found = portalContract.categories.find(c => c.id === id);
  if (!found) throw new Error(`packages/catalog/control-tower-portal.json has no category "${id}".`);
  return found;
};
export const portalIsOpen = (page: Page) => page.getByRole('tablist', { name: PORTAL_CATEGORIES }).isVisible();
/** A category by its label, then — where it has more than one — a tab inside it by its label. */
export async function goPortal(page: Page, categoryLabel: string, tabLabel?: string) {
  const tab = page.getByRole('tablist', { name: PORTAL_CATEGORIES }).getByRole('tab', { name: categoryLabel, exact: true });
  await tab.click();
  const category = portalContract.categories.find(c => c.label === categoryLabel);
  if (!category) throw new Error(`No category "${categoryLabel}" in packages/catalog/control-tower-portal.json.`);
  /* Arrived, not merely pressed: every category is its own dynamic import, and a journey that reads the
     screen before the category has replaced its loading state is reading the category it left. */
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pt-category .pt-loading')).toHaveCount(0);
  await expect(page.locator('#pt-category .pt-intro .eyebrow')).toContainText(categoryLabel);
  if (tabLabel && category.tabs.length > 1) {
    const inner = page.getByRole('tablist', { name: `${categoryLabel} tabs` }).getByRole('tab', { name: tabLabel, exact: true });
    await inner.click();
    await expect(inner).toHaveAttribute('aria-selected', 'true');
  }
}
/** An old section or tab, by its old name, wherever the portal's contract says it went. */
export async function goLegacySection(page: Page, name: string) {
  const entry = portalContract.legacyAddresses.find(e => e.legacy === `control-tower:${name}`)
    ?? portalContract.legacyAddresses.find(e => e.legacy === `back-office:${name}`);
  if (!entry) throw new Error(`The merged Control Tower has no old section called "${name}". packages/catalog/control-tower-portal.json#legacyAddresses lists every one.`);
  const category = portalCategory(entry.category);
  await goPortal(page, category.label, category.tabs.find(t => t.id === entry.tab)!.label);
}
/** The back office's old tabs, by their old names: Vetting, Operations, Catalogue and the rest. */
export async function goConsole(page: Page, name: string) {
  const entry = portalContract.legacyAddresses.find(e => e.legacy === `back-office:${name}`);
  if (!entry) throw new Error(`The back office had no tab called "${name}".`);
  const category = portalCategory(entry.category);
  await goPortal(page, category.label, category.tabs.find(t => t.id === entry.tab)!.label);
}
/* The console lands on Overview, and Overview is what its heading now says. It used to say
   "Operations console" on all eight tabs — the name of the console, at the largest size on the
   screen, above the one word that told you which of the eight you were looking at. The name is the
   eyebrow now, so this waits for the tab rather than for the product. */
export async function openAdminConsole(page: Page) {
  await page.goto('/app/?role=back-office');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
}
/* Another role in the same tab, through the demo login's full list, which both viewports draw. No page
   load happens, so whatever the preview holds in memory — a timer, a panic, a setting changed in the back
   office — is still there, which is exactly what a journey across two roles needs to see. The role is
   matched on its label alone, because a row's other lines can mention a nurse without being one. */
export async function chooseRole(page: Page, label: string) {
  await page.locator('.demo-login-all').click();
  await page.getByRole('dialog').locator('.record-row').filter({ has: page.locator('strong', { hasText: new RegExp(`^${label}$`) }) }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/* Explore MyThuso is the patient's roadmap page and the door to the first-run flow, the state
   gallery and the module previews. It is a sidebar entry on a wide screen and lives behind More on
   a phone, which is why it needs a helper of its own rather than goSection. */
export async function goExplore(page: Page) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name: 'Explore MyThuso', exact: true }).click(); return; }
  await page.locator('.tabbar button').nth(4).click();
  await page.locator('.menu-row').filter({ hasText: 'Explore MyThuso' }).first().click();
}
export async function openFirstRun(page: Page) {
  await goExplore(page);
  /* The design-review card called "First-run & recovery" is gone with the rest of the scaffolding.
     Sign-up is reached the way a person reaches it: the highlighted card that offers to set the
     account up. */
  await page.locator('.module-card').filter({ hasText: 'Set up your account' }).click();
}
export async function openModule(page: Page, name: string) {
  await goExplore(page);
  await page.locator('.module-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
}

/* The sentence a screen shows for a capability, chosen the way the app chooses it.
 *
 * Read from packages/catalog/capabilities.json rather than typed into a spec, because that is
 * exactly the drift these tests were caught by: five of them asserted "No payment is taken" — the
 * sentence for a capability with nothing behind it — and went on asserting it after the contract
 * grew a third state and a simulator started answering. A test carrying its own copy of a notice is
 * one more place for the notice to be wrong, and the least likely one to be noticed.
 *
 * Null when the capability is connected, because then no notice renders at all. */
const capabilityContract = JSON.parse(readFileSync(new URL('../packages/catalog/capabilities.json', import.meta.url), 'utf8')) as {
  capabilities: { id: string; connected: boolean; state: string; notice: string; simulation?: { notice: string; refuses: string[] } }[];
};
export const capabilityOf = (id: string) => {
  const found = capabilityContract.capabilities.find(c => c.id === id);
  if (!found) throw new Error(`No capability "${id}" in packages/catalog/capabilities.json`);
  return found;
};
/* `noticeFor` used to live here too. It is in tests/notices.ts and only there: two modules
   answering "what does this screen say" is the second copy this repository fails the build over
   everywhere it can reach, and the other one is better — it throws for a connected capability
   instead of returning null, so a spec asserting a notice that no longer exists fails loudly
   rather than comparing two nothings. nav.ts keeps `capabilityOf`, which is the record itself. */

/* Confirming a booking, now that there is a payment behind the button.
 *
 * The simulated provider declines roughly one attempt in five, deterministically per visit, and a
 * declined payment does not book a visit — dispatching a nurse to a house against money that was
 * refused is the one outcome this screen must not produce. So a journey that means to end up with a
 * booking has to do what a person does: try again. The retry is a new attempt at the provider
 * rather than the same one replayed, which is why the answer can change.
 *
 * Written here rather than in each spec so that the six journeys that book a visit say what they
 * mean — "book this" — instead of each carrying its own loop. */
export async function confirmBooking(scope: Locator) {
  const retry = scope.getByRole('button', { name: 'Try the payment again' });
  const onwards = scope.getByRole('button', { name: 'View my visits' });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await scope.getByRole('button', { name: attempt === 0 ? 'Confirm & book' : 'Try the payment again' }).click();
    /* Settled one way or the other before the next look: either the flow has moved on and offers
       the visit list, or the decline is on the screen with the button that tries again. */
    await expect(retry.or(onwards).first()).toBeVisible();
    if (!(await retry.isVisible())) return;
  }
  throw new Error('Eight simulated payment attempts on one visit and every one of them was declined. The provider declines about one in five, so this is a seed that has stopped varying rather than a run of bad luck.');
}
