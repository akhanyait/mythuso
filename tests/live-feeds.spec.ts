import { test, expect } from '@playwright/test';
import { noticeFor } from './notices';
/* The ingestion boundary as a supplier would meet it: over the network, through the app's own /api
   proxy, with no test harness holding it up. Runs only when an identity service is answering —
   start one with `npm run api` — because the design preview is deliberately able to run with no
   backend at all.

   apps/api/test/feeds.test.ts covers the same module far more thoroughly and drives a real socket
   doing it. What this adds is the one thing that suite cannot: that a caller arriving from outside
   the process, over the proxy the browser uses, gets the same refusal. A seam whose refusal depends
   on being called from inside the test file is not a seam. */
test.beforeEach(async ({ page }) => {
  const reachable = await page.request.get('/api/health').then(r => r.ok()).catch(() => false);
  test.skip(!reachable, 'no identity service on /api — run `npm run api`');
});

test('every feed is described, and every one of them says it is connected to nothing', async ({ page }) => {
  const body = await (await page.request.get('/api/feeds')).json();
  expect(body.holds).toMatch(/refuses every payload/);
  expect(body.feeds.length).toBeGreaterThan(0);
  for (const feed of body.feeds) {
    expect(feed.connected, feed.id).toBe(false);
    // what would have to arrive, and — the half that matters — what never may
    expect(feed.accepts.length, feed.id).toBeGreaterThan(0);
    expect(feed.neverAccepts.length, feed.id).toBeGreaterThan(0);
    for (const condition of feed.beforeSwitchOn) expect(condition.met, `${feed.id}/${condition.id}`).toBe(false);
  }
  // and every capability is answered: served by a seam, or carrying the reason there is none
  expect(body.noSeam.length).toBeGreaterThan(0);
});

test('a well-formed position refuses anyway, in the capability’s own words', async ({ page }) => {
  const response = await page.request.post('/api/feeds/nurse-position', {
    data: { partyId: 'N-205', lat: -26.15, lng: 28.046, accuracyMetres: 12, reportedAt: '2026-09-10T14:32:07+02:00' }
  });
  expect(response.status()).toBe(503);
  const body = await response.json();
  expect(body.error).toBe('not-connected');
  expect(body.capability).toBe('dispatch');
  // the sentence is the one the screens render, out of packages/catalog/capabilities.json
  expect(body.notice).toContain(noticeFor('dispatch'));
});

test('a patient id in a position feed is refused at the door, whatever it is called', async ({ page }) => {
  for (const spelling of ['patientId', 'patient_id', 'subjectId']) {
    const response = await page.request.post('/api/feeds/nurse-position', {
      data: { partyId: 'N-205', lat: -26.15, lng: 28.046, accuracyMetres: 12, reportedAt: '2026-09-10T14:32:07+02:00', [spelling]: 'P-1' }
    });
    expect(response.status(), spelling).toBe(422);
    const body = await response.json();
    expect(body.error, spelling).toBe('forbidden-field');
    // named by the contract rather than by whoever sent it
    expect(body.forbidden.field, spelling).toBe('patientId');
  }
});

test('a field nobody asked for is counted and never quoted back', async ({ page }) => {
  const response = await page.request.post('/api/feeds/nurse-position', {
    data: {
      partyId: 'N-205', lat: -26.15, lng: 28.046, accuracyMetres: 12, reportedAt: '2026-09-10T14:32:07+02:00',
      'BP 180 over 110, Lerato Molefe': 1
    }
  });
  expect(response.status()).toBe(422);
  const text = await response.text();
  expect(JSON.parse(text).undeclaredFields).toBe(1);
  expect(text).not.toContain('180');
  expect(text).not.toContain('Lerato');
});

test('accuracy is not optional, because a coordinate without one is a false precision', async ({ page }) => {
  const response = await page.request.post('/api/feeds/nurse-position', {
    data: { partyId: 'N-205', lat: -26.15, lng: 28.046, reportedAt: '2026-09-10T14:32:07+02:00' }
  });
  expect((await response.json()).missing).toEqual(['accuracyMetres']);
});
