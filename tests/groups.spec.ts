import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { goSection } from './nav';
import { noticeFor } from './notices';
/* A group that pays for its members, on both viewports: the member is invited and agrees as herself, choosing how the
 * group's screen reads what it paid for her; the treasurer then sees amounts and days and nothing about anybody's care;
 * and the same screen as an employer shows no member rows and no total.
 *
 * Every sentence is packages/catalog/groups.json's and every amount is a service's price from
 * packages/catalog/services.json, read here rather than typed, because a spec carrying its own copy of a price is one
 * more place for the price to be wrong. */
const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const groups = json('packages/catalog/groups.json') as {
  screen: { admin: Record<string, string> & { never: string[] }; member: Record<string, string>; preview: string };
  lineDetails: { id: string; name: string; detail: string }[];
  states: { id: string; memberWords: string; adminWords: string }[];
  noPooledMoney: { statement: string };
  employer: { statement: string; floorWords: string };
  preview: { groupName: string; members: { name: string; agrees: boolean; lineDetail: string | null; visitServiceId: string | null }[] };
};
const services = json('packages/catalog/services.json') as { id: string; name: string; price: number }[];
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const say = (text: string) => fill(text, { group: groups.preview.groupName });
const memberWordsOf = (id: string) => say(groups.states.find(s => s.id === id)!.memberWords);
const detail = (id: string) => groups.lineDetails.find(d => d.id === id)!;
const priceOf = (id: string) => services.find(s => s.id === id)!.price;
/* The member who chose amount and day in the preview, and what her visit costs: the one amount the treasurer sees. */
const shown = groups.preview.members.find(m => m.agrees && m.lineDetail === 'amount-and-day')!;
const rand = (amount: number) => new RegExp(`R\\s?${amount}\\b`);

const toWallet = async (page: Page) => { await page.goto('/app/'); await goSection(page, 'Thuso Wallet'); };

test('a member is invited, agrees as herself and chooses what her group sees; nothing is charged', async ({ page }) => {
  await toWallet(page);
  await page.getByRole('button', { name: /Groups that pay for you/ }).click();
  const screen = page.locator('.group-member');
  await expect(screen.getByRole('heading', { name: groups.screen.member.heading })).toBeVisible();
  await expect(screen.getByText(noticeFor('payments')!)).toBeVisible();
  /* Invited is not a member: the words say so, and the group has paid for nothing of hers. */
  await expect(screen.locator('.group-state')).toHaveText(memberWordsOf('invited'));

  await screen.getByRole('radio', { name: new RegExp(detail('amount-and-day').name) }).check();
  await screen.getByRole('button', { name: say(groups.screen.member.agree) }).click();
  await expect(screen.locator('.group-state')).toHaveText(memberWordsOf('member'));
  /* And she can leave, which stops the group paying for anything new. */
  await expect(screen.getByRole('button', { name: say(groups.screen.member.leave) })).toBeVisible();
});

test('the treasurer sees amounts and days and never what the care was, and the group holds no money', async ({ page }) => {
  await toWallet(page);
  await page.getByRole('button', { name: /A group you pay for/ }).click();
  const screen = page.locator('.group-admin');
  await expect(screen.getByRole('heading', { name: groups.screen.admin.heading })).toBeVisible();
  await expect(screen.locator('.group-holds-nothing')).toHaveText(groups.noPooledMoney.statement);
  await expect(screen.getByText(noticeFor('payments')!)).toBeVisible();

  /* One member chose amount and day, so her line is a day and an amount — the catalogue's price for her visit. */
  const lines = screen.locator('.group-lines li');
  await expect(lines.first()).toContainText(rand(priceOf(shown.visitServiceId!)));
  /* Not one service name is on this screen, for any of the members' visits. */
  for (const member of groups.preview.members.filter(m => m.visitServiceId)) {
    await expect(screen.getByText(services.find(s => s.id === member.visitServiceId)!.name)).toHaveCount(0);
  }
  /* The member who chose the month total only has no line of her own at all. */
  await expect(screen.getByText(groups.screen.admin.memberTotalOnly)).toBeVisible();
  for (const sentence of groups.screen.admin.never) await expect(screen.getByText(sentence)).toBeVisible();
});

test('as an employer the same screen has no member rows, and no total until enough have agreed', async ({ page }) => {
  await toWallet(page);
  await page.getByRole('button', { name: /A group you pay for/ }).click();
  const screen = page.locator('.group-admin');
  await screen.getByRole('button', { name: groups.screen.admin.employerPreview }).click();
  await expect(screen.locator('.group-employer')).toContainText(groups.employer.statement);
  await expect(screen.locator('.group-employer')).toContainText(groups.employer.floorWords);
  await expect(screen.locator('.group-member-row')).toHaveCount(0);
  await expect(screen.locator('.group-total')).toHaveCount(0);
});
