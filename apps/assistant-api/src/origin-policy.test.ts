import test from 'node:test';
import assert from 'node:assert/strict';
import { corsFor } from './lib/origin-policy.ts';

/* Which browser origins this service answers, and what the rest are told — the CORS half of the
   public endpoint's hardening, added 21 September 2026.

   The policy itself lives in ./lib/origin-policy.ts and its own header explains why the wildcard
   had to go: every route here is unauthenticated, the panel's bridge is same-origin in production,
   so `access-control-allow-origin: *` bought nothing a patient uses and gave any page on the
   internet a free proxy into the paid model provider. What these tests hold is the shape of the
   answer: no Origin is not a browser and is never refused; production answers exactly the site's
   own two names and refuses every near miss and stranger with nothing a browser could read as
   permission; the development variable is consulted only outside production, so it cannot widen a
   real deployment even if it is left set on the box. */

const PRODUCTION: Record<string, string | undefined> = { NODE_ENV: 'production' };
const APEX = 'https://mythuso.co.za';
const WWW = 'https://www.mythuso.co.za';

test('no Origin is not a browser context: the question is never asked, so none is refused', () => {
  for (const env of [{}, PRODUCTION]) {
    const decision = corsFor(undefined, env);
    assert.equal(decision.refused, false);
    assert.deepEqual(
      decision.headers,
      {},
      'no Origin, no CORS headers — a health check and a server-side caller are answered as they always were',
    );
  }
});

test('production answers the site’s own two names, and echoes the one that asked', () => {
  for (const origin of [APEX, WWW]) {
    const decision = corsFor(origin, PRODUCTION);
    assert.equal(decision.refused, false, `${origin} is the site`);
    assert.equal(
      decision.headers['access-control-allow-origin'],
      origin,
      'the echoed exact origin — never a wildcard',
    );
    assert.equal(
      decision.headers.vary,
      'Origin',
      'the answer depended on the request’s Origin, so any cache between the two must key on it',
    );
  }
});

test('production refuses the near misses and the strangers, and grants them nothing', () => {
  for (const origin of [
    'http://mythuso.co.za', // the scheme is part of the origin
    'https://mythuso.co.za:443', // exact strings only — no normalisation anywhere
    'https://app.mythuso.co.za', // a subdomain is another site
    'https://mythuso.co.za.evil.example', // a suffix trick ends in nothing that helps it
    'https://evil.example',
    'null', // the opaque origin a sandboxed frame or a data: page sends
  ]) {
    const decision = corsFor(origin, PRODUCTION);
    assert.equal(
      decision.refused,
      true,
      `${origin} must be refused before any route reads the request`,
    );
    assert.deepEqual(
      decision.headers,
      {},
      'a refused origin hears nothing it could read as permission',
    );
  }
});

test('the development variable cannot widen a production deployment', () => {
  const env = { ...PRODUCTION, MYTHUSO_ASSISTANT_DEV_ORIGINS: 'https://tunnel.example' };
  assert.equal(
    corsFor('https://tunnel.example', env).refused,
    true,
    'left set on the box, the variable is still never read in production',
  );
  assert.equal(corsFor('http://localhost:5173', env).refused, true, 'and neither is localhost');
});

test('development answers localhost shapes and the configured list, and nothing else', () => {
  for (const origin of [
    'http://localhost:5173',
    'https://localhost',
    'http://127.0.0.1:4173',
    'http://[::1]:8080',
  ])
    assert.equal(corsFor(origin, {}).refused, false, `${origin} is where the panel runs`);
  const env = { MYTHUSO_ASSISTANT_DEV_ORIGINS: 'https://tunnel.example, https://second.example' };
  for (const origin of ['https://tunnel.example', 'https://second.example'])
    assert.equal(corsFor(origin, env).refused, false, `${origin} is on the written list`);
  assert.equal(corsFor('https://third.example', env).refused, true);
  assert.equal(corsFor('https://evil.example', {}).refused, true);
});
