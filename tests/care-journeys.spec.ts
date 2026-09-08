import { test, expect, type Page } from '@playwright/test';
import { openWorkspace } from './nav';
/* The shell is a bottom tab bar on phones and a sidebar from 1000px up, so navigation in the
   tests goes through whichever one this project actually renders. */
/* Tab-bar labels are translated, so the phone path addresses tabs by position, not by text. */
const tabOrder = ['Overview', 'Book a nurse', 'My visits', 'Health Passport', 'More'];
const tab = (page: Page, index: number) => page.locator('.tabbar button').nth(index);
async function navigate(page: Page, name: string) {
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  if (await sidebar.isVisible()) { await sidebar.getByRole('button', { name, exact: true }).click(); return; }
  const index = tabOrder.indexOf(name);
  if (index >= 0) { await tab(page, index).click(); return; }
  await tab(page, 4).click();
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
test('booking requires acknowledgement and creates a demo visit', async ({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Vitals & chronic check/}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Who is this visit for?').selectOption('Nomsa Molefe');
  await dialog.getByRole('button',{name:'Continue'}).click();
  // the second day the app offers, whatever date that is today — the strip used to be hard-coded
  await dialog.locator('.date-chip').nth(1).click();
  await dialog.getByRole('button',{name:'14:00',exact:true}).click();
  await dialog.getByRole('button',{name:'Continue'}).click();
  await dialog.getByRole('button',{name:'Continue'}).click();
  await expect(dialog.getByRole('button',{name:'Confirm & book'})).toBeDisabled();
  await expect(dialog.locator('.review-line').first()).toContainText('2026');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'Confirm & book'}).click();
  await expect(dialog.getByText('Your visit is booked.')).toBeVisible();
  await dialog.getByRole('button',{name:'View my visits'}).click();
  // 14:30, not 15:00: a vitals check is thirty minutes in the catalogue, and the visit now ends
  // its own duration after it starts rather than a flat hour later
  await expect(page.locator('.panel').first()).toContainText('14:00 – 14:30');
  await expect(page.locator('.panel').first()).toContainText('Nomsa Molefe');
});
test('services filter and empty state',async({page})=>{
  await page.goto('/');await navigate(page,'Book a nurse');
  await page.getByRole('button',{name:'Recovery',exact:true}).click();
  await expect(page.locator('.catalog-grid .service-card')).toHaveCount(3);
  // later-phase services are visible but not bookable
  await expect(page.locator('.catalog-grid .service-card.later')).toHaveCount(1);
  await expect(page.locator('.catalog-grid .service-card.later')).toContainText('Phase 3');
  await page.getByRole('textbox',{name:'Search services'}).fill('no-such-service');
  await expect(page.getByText('No services match your search. Try another name or category.')).toBeVisible();
});
test('family addition, sharing revocation and export',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Add a family member',exact:true}).click();
  await page.getByLabel('Display name').fill('Aunt Thandi');await page.getByRole('button',{name:'Add demo member'}).click();
  await expect(page.getByRole('heading',{name:'Aunt Thandi'})).toBeVisible();
  await navigate(page,'Health Passport');await page.getByRole('button',{name:'Share record'}).click();
  await page.getByRole('button',{name:'Preview limited sharing'}).click();
  await expect(page.getByText('Demo access active. You can revoke it at any time.')).toBeVisible();
  await page.getByRole('button',{name:'Revoke demo access'}).click();await expect(page.getByText('No active shares.')).toBeVisible();
  await page.getByRole('button',{name:'Close dialog'}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export sample passport'}).click();
  expect((await download).suggestedFilename()).toBe('mythuso-demo-passport.json');
});
/* Each clinical workspace opens at its own first section, from its own entry. The heading that
   used to be asserted here — "NURSE WORKSPACE · DEMO" — went with the workspace picker: there is
   no role switching left for it to disclaim, and a section is now headed by what it is for. */
test('each clinical workspace opens at its own work, and no horizontal overflow',async({page})=>{
  for(const [role,first] of [['Nurse',/\d{4}$/],['Doctor',/^Review queue$/],['Partner',/^Orders$/],['Control Tower',/^Dispatch$/]] as const) {
    await openWorkspace(page,role);
    await expect(page.getByText(role.toUpperCase(),{exact:true}).first()).toBeVisible();
    await expect(page.getByRole('heading',{level:1})).toHaveText(first);
  }
  expect(await page.evaluate(()=>(()=>{const el=document.querySelector('main')??document.documentElement;return el.scrollWidth<=el.clientWidth;})())).toBe(true);
});
test('dashboard renders without errors and fits the viewport',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  // the home leads with the greeting and the four bookable services, not a rotating banner
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page.locator('.shortcut-row')).toHaveCount(4);
  expect(await page.evaluate(()=>(()=>{const el=document.querySelector('main')??document.documentElement;return el.scrollWidth<=el.clientWidth;})())).toBe(true);
  await page.screenshot({path:`test-results/dashboard-${testInfo.project.name}.png`});
  expect(errors).toEqual([]);
});
