import { test, expect, type Page } from '@playwright/test';
async function navigate(page: Page, name: string) {
  const menu=page.getByRole('button',{name:'Open navigation',exact:true});
  if(await menu.isVisible()) await menu.click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();
}
test('booking requires acknowledgement and creates a demo visit', async ({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Vitals & chronic check/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Who is this visit for?').selectOption('Nomsa Molefe');
  await dialog.getByRole('button',{name:'Review visit'}).click();
  await expect(dialog.getByRole('button',{name:'Confirm demo visit'})).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button',{name:'Confirm demo visit'}).click();
  await expect(dialog.getByText('Your demo visit is booked.')).toBeVisible();
  await dialog.getByRole('button',{name:'View my visits'}).click();
  await expect(page.getByText('Tomorrow, 09:00–10:00 · Nomsa Molefe')).toBeVisible();
});
test('services filter and empty state',async({page})=>{
  await page.goto('/');await navigate(page,'Book a nurse');
  await page.getByRole('button',{name:'Recovery',exact:true}).click();
  await expect(page.locator('.catalog-grid .service-card')).toHaveCount(2);
  await page.getByRole('textbox',{name:'Search services'}).fill('no-such-service');
  await expect(page.getByText('No services match your search. Try another name or category.')).toBeVisible();
});
test('family addition, sharing revocation and export',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Add a family member',exact:true}).click();
  await page.getByLabel('Display name').fill('Aunt Thandi');await page.getByRole('button',{name:'Add demo member'}).click();
  await expect(page.getByRole('heading',{name:'Aunt Thandi'})).toBeVisible();
  await navigate(page,'Health Passport');await page.getByRole('button',{name:'Manage sharing'}).click();
  await page.getByRole('button',{name:'Preview limited sharing'}).click();
  await expect(page.getByText('Demo access active. You can revoke it at any time.')).toBeVisible();
  await page.getByRole('button',{name:'Revoke demo access'}).click();await expect(page.getByText('No active shares.')).toBeVisible();
  await page.getByRole('button',{name:'Close dialog'}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export sample passport'}).click();
  expect((await download).suggestedFilename()).toBe('mythuso-demo-passport.json');
});
test('role workspaces and no horizontal overflow',async({page})=>{
  await page.goto('/');
  for(const role of ['Nurse','Doctor','Partner','Control Tower']) {
    await page.getByRole('button',{name:'Preview workspaces'}).click();
    await page.getByRole('dialog').getByRole('button').filter({has:page.getByText(role,{exact:true})}).click();
    await expect(page.getByText(`${role.toUpperCase()} WORKSPACE · DEMO`)).toBeVisible();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('dashboard renders without errors and fits the viewport',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'Feel better. Right at home.'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/dashboard-${testInfo.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});
