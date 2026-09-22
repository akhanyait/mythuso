import test from 'node:test';
import assert from 'node:assert/strict';
import { federationSource } from './config.ts';
import { RateGate } from './rate-gate.ts';
import { searchIcd11 } from './icd11-adapter.ts';
import { searchOpenFda } from './openfda-adapter.ts';
import { searchPubMed } from './pubmed-adapter.ts';

/* The three external-source adapters' own tests, added on 22 September 2026 with the governed
   federation work. Every adapter is dark by default, and the first test block holds all three to
   that: the config they read is the real federation.json row, and a fetch stub that would record
   the call proves nothing leaves the process while a source is dark. The remaining tests inject an
   activated copy of the same config through AdapterDeps — the seam a test uses and production does
   not — and hold the live-shape behaviour to what it promises: rate limiting that refuses before
   anything is sent, provenance on every result, and honest unavailability instead of a throw. All
   network I/O is mocked: no test in this file reaches a real endpoint. */

const activeConfig = (id: string) => {
 const source = federationSource(id);
 assert.ok(source, `federation.json should carry ${id}`);
 return { ...source, active: true };
};

const mustNotFetch = (calls: string[]) =>
 (async (input: unknown) => {
  calls.push(String(input));
  throw new Error('a dark source must not be called');
 }) as unknown as typeof fetch;

test('every adapter refuses to operate while its source is dark, and sends nothing', async () => {
 const calls: string[] = [];
 const fetchImpl = mustNotFetch(calls);
 const where = { fetchImpl };
 const outcomes = [
  await searchIcd11('gout', where),
  await searchOpenFda('warfarin', where),
  await searchPubMed('hypertension', where),
 ];
 for (const outcome of outcomes) {
  assert.equal(outcome.status, 'dark', `${outcome.sourceId} must refuse while active: false`);
  if (outcome.status === 'dark')
   assert.ok(
    outcome.detail.includes('active: false'),
    'the refusal says what the flag is, so an operator knows what to flip after the review',
   );
 }
 assert.deepEqual(calls, [], 'a dark source is never called, credentials or no credentials');
});

test('an activated copy of the real config still validates as dark against the catalogue', () => {
 /* The injection seam must be a copy of the real row, not a shape of its own: if federation.json
    ever renames the flag or a source id, the tests that activate a copy fail here first. */
 for (const id of ['icd11-who', 'openfda', 'pubmed-europepmc']) {
  const source = federationSource(id);
  assert.ok(source, `${id} should exist in federation.json`);
  assert.equal(source!.active, false, `${id} must ship dark`);
 }
});

test('openFDA: the rate gate refuses before anything is sent, and says how long to wait', async () => {
 let calls = 0;
 const fetchImpl = (async () => {
  calls += 1;
  return new Response(JSON.stringify({ results: [] }), { status: 200 });
 }) as unknown as typeof fetch;
 const gate = new RateGate(1);
 const first = await searchOpenFda('warfarin', { config: activeConfig('openfda'), fetchImpl, gate, env: {} });
 assert.equal(first.status, 'ok');
 const second = await searchOpenFda('warfarin', { config: activeConfig('openfda'), fetchImpl, gate, env: {} });
 assert.equal(second.status, 'rate-limited');
 if (second.status === 'rate-limited') {
  assert.ok(second.retryAfterMs > 0 && second.retryAfterMs <= 60_000, 'the wait is inside the minute window');
  assert.ok(second.detail.startsWith('the configured rate limit'), 'the refusal names the limit, not the source');
 }
 assert.equal(calls, 1, 'the rate-limited call sent nothing');
});

test('openFDA: label records come back attributed, with the licence and a checkable record URL', async () => {
 const urls: string[] = [];
 const fetchImpl = (async (input: unknown) => {
  urls.push(String(input));
  return new Response(
   JSON.stringify({
    results: [
     {
      id: 'abc-123',
      openfda: { generic_name: ['warfarin'], brand_name: ['Coumadin'] },
      boxed_warning: ['Warfarin sodium can cause major or fatal bleeding.'],
     },
    ],
   }),
   { status: 200, headers: { 'content-type': 'application/json' } },
  );
 }) as unknown as typeof fetch;
 const outcome = await searchOpenFda('warfarin', {
  config: activeConfig('openfda'),
  fetchImpl,
  gate: new RateGate(10),
  env: {},
 });
 assert.equal(outcome.status, 'ok');
 if (outcome.status !== 'ok') return;
 assert.equal(outcome.results.length, 1);
 const [result] = outcome.results;
 assert.equal(result.title, 'warfarin (Coumadin)', 'both the generic and the brand are carried');
 assert.ok(result.snippet.includes('major or fatal bleeding'), "the regulator's own warning is carried");
 assert.deepEqual(result.codes, {}, 'US label records carry no terminology codes, and none are invented');
 assert.equal(result.citation.authority, 'US FDA (openFDA)');
 assert.equal(result.citation.licence, 'Public domain (US Government work)');
 assert.equal(result.citation.sourceId, 'openfda');
 assert.ok(result.citation.url?.includes('id%3A%22abc-123%22'), 'the URL is how the record is found again');
 assert.ok(urls[0].startsWith('https://api.fda.gov/drug/label.json?'));
 assert.ok(urls[0].includes('search=%22warfarin%22'), 'the term rides the documented search parameter');
 assert.ok(urls[0].includes('limit=5'));
});

test('openFDA: an optional API key rides the request and never appears in the outcome', async () => {
 let seen = '';
 const fetchImpl = (async (input: unknown) => {
  seen = String(input);
  return new Response(JSON.stringify({ results: [] }), { status: 200 });
 }) as unknown as typeof fetch;
 const outcome = await searchOpenFda('warfarin', {
  config: activeConfig('openfda'),
  fetchImpl,
  gate: new RateGate(10),
  env: { OPENFDA_API_KEY: 'fixture-key-123' },
 });
 assert.equal(outcome.status, 'ok');
 assert.ok(seen.includes('api_key=fixture-key-123'), 'the configured key is sent');
 assert.equal(JSON.stringify(outcome).includes('fixture-key-123'), false, 'the key never rides out in an outcome');
});

test('openFDA: a bad status and a thrown fetch both become unavailability, never an exception', async () => {
 const badStatus = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
 const down = await searchOpenFda('warfarin', {
  config: activeConfig('openfda'),
  fetchImpl: badStatus,
  gate: new RateGate(10),
  env: {},
 });
 assert.equal(down.status, 'unavailable');
 if (down.status === 'unavailable') assert.ok(down.detail.includes('503'));

 const throwing = (async () => {
  throw new Error('network down');
 }) as unknown as typeof fetch;
 const unreachable = await searchOpenFda('warfarin', {
  config: activeConfig('openfda'),
  fetchImpl: throwing,
  gate: new RateGate(10),
  env: {},
 });
 assert.equal(unreachable.status, 'unavailable');
});

test('ICD-11: without credentials the adapter says which env vars are unset, and calls nothing', async () => {
 const calls: string[] = [];
 const outcome = await searchIcd11('gout', {
  config: activeConfig('icd11-who'),
  fetchImpl: mustNotFetch(calls),
  gate: new RateGate(10),
  env: {},
 });
 assert.equal(outcome.status, 'unavailable');
 if (outcome.status === 'unavailable') {
  assert.ok(outcome.detail.includes('ICD11_CLIENT_ID'));
  assert.ok(outcome.detail.includes('ICD11_CLIENT_SECRET'));
 }
 assert.deepEqual(calls, [], 'no token call is made without credentials');
});

test('ICD-11: entities come back de-tagged, coded, and attributed with the CC BY-ND licence', async () => {
 const calls: { url: string; authorization?: string }[] = [];
 const fetchImpl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
  const url = String(input);
  if (url.includes('/connect/token')) {
   calls.push({ url });
   return new Response(JSON.stringify({ access_token: 'fixture-token' }), { status: 200 });
  }
  calls.push({ url, authorization: init?.headers?.['authorization'] });
  return new Response(
   JSON.stringify({
    destinationEntities: [
     { id: 'http://id.who.int/icd/entity/1818651672', title: '<em>Gout</em>', theCode: 'FA25' },
     { id: 'http://id.who.int/icd/entity/999', title: 'Uncoded thing', theCode: 'not-a-code' },
    ],
   }),
   { status: 200, headers: { 'content-type': 'application/json' } },
  );
 }) as unknown as typeof fetch;
 const outcome = await searchIcd11('gout', {
  config: activeConfig('icd11-who'),
  fetchImpl,
  gate: new RateGate(10),
  env: { ICD11_CLIENT_ID: 'fixture-id', ICD11_CLIENT_SECRET: 'fixture-secret' },
 });
 assert.equal(outcome.status, 'ok');
 if (outcome.status !== 'ok') return;
 assert.equal(outcome.results.length, 2);
 const [first, second] = outcome.results;
 assert.equal(first.title, 'Gout', 'the highlight markup is stripped, not carried');
 assert.deepEqual(first.codes, { icd11: 'FA25' });
 assert.equal(first.id, 'icd11-who:FA25');
 assert.equal(first.citation.authority, 'WHO');
 assert.equal(first.citation.licence, 'CC BY-ND 3.0 IGO');
 assert.equal(first.citation.url, 'http://id.who.int/icd/entity/1818651672');
 assert.deepEqual(second.codes, {}, 'a value that is not shaped like a code is not attached as one');
 const search = calls.find((call) => !call.url.includes('/connect/token'));
 assert.equal(search?.authorization, 'Bearer fixture-token', 'the token rides the request, never the URL');
 assert.ok(search?.url.includes('q=gout'));
 assert.equal(JSON.stringify(outcome).includes('fixture-secret'), false, 'the client secret never rides out');
});

test('PubMed: only records with a checkable identifier are handed over, each with its citation', async () => {
 const calls: { url: string; agent?: string }[] = [];
 const fetchImpl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
  calls.push({ url: String(input), agent: init?.headers?.['user-agent'] });
  return new Response(
   JSON.stringify({
    resultList: {
     result: [
      {
       pmid: '42149813',
       title: 'Whole-body and intracellular arginine metabolism in hypertension.',
       pubYear: '2026',
       journalTitle: 'Am J Hypertens',
       abstractText: 'This study investigates arginine metabolism in hypertensive adults.',
      },
      { title: 'A record with nothing to check it against', pubYear: '2020' },
     ],
    },
   }),
   { status: 200, headers: { 'content-type': 'application/json' } },
  );
 }) as unknown as typeof fetch;
 const outcome = await searchPubMed('hypertension', {
  config: activeConfig('pubmed-europepmc'),
  fetchImpl,
  gate: new RateGate(10),
  env: {},
 });
 assert.equal(outcome.status, 'ok');
 if (outcome.status !== 'ok') return;
 assert.equal(outcome.results.length, 1, 'the untraceable record is not a citation');
 const [result] = outcome.results;
 assert.equal(result.id, 'pubmed-europepmc:PMID:42149813');
 assert.ok(result.snippet.includes('PMID:42149813'));
 assert.equal(result.citation.authority, 'Europe PMC (EMBL-EBI)');
 assert.equal(result.citation.url, 'https://europepmc.org/article/MED/42149813');
 assert.equal(result.citation.licence, 'Per-record');
 assert.ok(calls[0].url.includes('query=hypertension'));
 assert.ok(calls[0].agent?.includes('MyThuso'), 'the deployment names itself, as the config records');
});

test('PubMed: unreachable is reported as unavailability, never as "no literature"', async () => {
 const throwing = (async () => {
  throw new Error('network down');
 }) as unknown as typeof fetch;
 const outcome = await searchPubMed('hypertension', {
  config: activeConfig('pubmed-europepmc'),
  fetchImpl: throwing,
  gate: new RateGate(10),
  env: {},
 });
 assert.equal(outcome.status, 'unavailable');
 if (outcome.status === 'unavailable') assert.ok(outcome.detail.includes('failed'));
});

test('the rate gate is a rolling window, and a spent daily budget waits for tomorrow', () => {
 const gate = new RateGate(2);
 const start = Date.UTC(2026, 8, 22, 10, 0, 0);
 assert.equal(gate.take(start), true);
 assert.equal(gate.take(start + 1000), true);
 assert.equal(gate.take(start + 2000), false, 'the third call inside the minute is refused');
 assert.equal(gate.take(start + 61_000), true, 'the window rolls, and the gate opens again');

 const daily = new RateGate(100, 1);
 assert.equal(daily.take(start), true);
 assert.equal(daily.take(start + 61_000), false, 'the daily ceiling outlasts the minute window');
 const wait = daily.waitMsUntilAllowed(start + 61_000);
 assert.ok(wait > 0 && wait <= 24 * 60 * 60 * 1000, 'the wait runs to the next UTC midnight, and no further');
});
