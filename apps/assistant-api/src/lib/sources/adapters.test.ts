import test from 'node:test';
import assert from 'node:assert/strict';
import { federationSource } from './config.ts';
import { RateGate } from './rate-gate.ts';
import { searchIcd11 } from './icd11-adapter.ts';
import { searchOpenFda } from './openfda-adapter.ts';
import { searchPubMed } from './pubmed-adapter.ts';
import { searchMedlinePlus } from './medlineplus-adapter.ts';
import { searchCdc } from './cdc-adapter.ts';
import { searchWikidata, wikidataQuery } from './wikidata-adapter.ts';
import { overrideClosed } from '../demonstration-override.ts';

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
 /* Dark is the go-live state: the real federation.json rows with the founder's demonstration override
    switched off (inForce false). */
 const calls: string[] = [];
 const fetchImpl = mustNotFetch(calls);
 const where = { fetchImpl, override: overrideClosed };
 const outcomes = [
  await searchIcd11('gout', where),
  await searchOpenFda('warfarin', where),
  await searchPubMed('hypertension', where),
  await searchMedlinePlus('sunburn', where),
  await searchCdc('hand washing', where),
  await searchWikidata('diabetes', where),
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
 for (const id of ['icd11-who', 'openfda', 'pubmed-europepmc', 'medlineplus-nlm', 'cdc-content-services', 'wikidata']) {
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
 assert.ok(
  urls[0].includes('search=openfda.generic_name%3A%22warfarin%22+openfda.brand_name%3A%22warfarin%22'),
  "the term is searched as a medicine's generic or brand name, not as any phrase in any label",
 );
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
       license: 'cc by',
      },
      {
       pmid: '42000001',
       title: 'A non-commercial paper.',
       pubYear: '2025',
       journalTitle: 'J Example',
       abstractText: 'Text a commercial service may not reword.',
       license: 'cc by-nc',
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
 assert.equal(outcome.results.length, 2, 'the untraceable record is not a citation');
 const [result, nonCommercial] = outcome.results;
 assert.ok(result.snippet.includes('arginine metabolism'), "a CC BY abstract's opening is carried");
 assert.equal(nonCommercial.snippet.includes('may not reword'), false, 'a CC BY-NC abstract is not carried: title and identifier only');
 assert.ok(nonCommercial.snippet.includes('PMID:42000001'));
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

/* The three adapters written on 2 October 2026, when the founder's demonstration override opened their
   sources. Each is held to its licence's conditions with a stubbed fetch; nothing reaches a network. */

test('every adapter sends only the redacted topic words, never a person', async () => {
 const urls: string[] = [];
 const fetchImpl = (async (input: unknown) => {
  urls.push(decodeURIComponent(String(input)));
  return new Response('{}', { status: 503 });
 }) as unknown as typeof fetch;
 const typed = 'rash on Thandi call 082 555 1234 thandi@example.com 8001015009087';
 for (const search of [searchOpenFda, searchPubMed, searchMedlinePlus, searchCdc, searchWikidata])
  await search(typed, { fetchImpl, gate: new RateGate(10), env: {} });
 assert.equal(urls.length, 5);
 for (const url of urls) {
  assert.equal(url.includes('082 555 1234'), false, url);
  assert.equal(url.includes('thandi@example.com'), false, url);
  assert.equal(url.includes('8001015009087'), false, url);
 }
});

test('MedlinePlus: health topics only, de-tagged and attributed; the encyclopedia and drug monographs are never carried', async () => {
 const urls: string[] = [];
 const xml = `<?xml version="1.0" encoding="UTF-8"?><nlmSearchResult><list num="3">
  <document rank="0" url="https://medlineplus.gov/sunexposure.html">
   <content name="title">&lt;span class="qt1"&gt;Sun Exposure&lt;/span&gt;</content>
   <content name="FullSummary">&lt;p&gt;Ultraviolet (UV) rays are an invisible form of radiation. &lt;span class="qt0"&gt;Sunburns&lt;/span&gt; are a sign of skin damage.&lt;/p&gt;</content>
  </document>
  <document rank="1" url="https://medlineplus.gov/ency/article/003227.htm">
   <content name="title">Sunburn (A.D.A.M.)</content>
   <content name="FullSummary">Encyclopedia text that may only be linked to.</content>
  </document>
  <document rank="2" url="https://medlineplus.gov/druginfo/meds/a682159.html">
   <content name="title">Ibuprofen (ASHP)</content>
  </document>
 </list></nlmSearchResult>`;
 const fetchImpl = (async (input: unknown) => {
  urls.push(String(input));
  return new Response(xml, { status: 200, headers: { 'content-type': 'text/xml' } });
 }) as unknown as typeof fetch;
 const outcome = await searchMedlinePlus('sunburn', { config: activeConfig('medlineplus-nlm'), fetchImpl, gate: new RateGate(10) });
 assert.equal(outcome.status, 'ok');
 if (outcome.status !== 'ok') return;
 assert.equal(outcome.results.length, 1, 'the A.D.A.M. and ASHP pages are dropped');
 const [result] = outcome.results;
 assert.equal(result.title, 'Sun Exposure');
 assert.ok(result.snippet.startsWith('Ultraviolet (UV) rays'), 'the summary arrives as plain text');
 assert.equal(result.snippet.includes('<'), false);
 assert.equal(result.citation.url, 'https://medlineplus.gov/sunexposure.html');
 assert.equal(result.citation.sourceId, 'medlineplus-nlm');
 assert.ok(urls[0].startsWith('https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=sunburn'), 'the health-topics database alone');
});

test("CDC: only CDC's own items on cdc.gov, carried unchanged, never a third party's", async () => {
 const fetchImpl = (async () =>
  new Response(
   JSON.stringify({
    results: [
     { id: 397629, name: 'Key Facts About Seasonal Flu Vaccine', description: 'Vaccination has been shown to reduce the risk of flu illness, hospitalization and flu-related death.', sourceUrl: 'https://www.cdc.gov/flu/vaccines/keyfacts.html', source: { acronym: 'CDC' } },
     { id: 1, name: 'A state page', description: 'Not CDC material.', sourceUrl: 'https://health.example.gov/flu', source: { acronym: 'STATE' } },
     { id: 2, name: 'Off cdc.gov', description: 'Hosted elsewhere.', sourceUrl: 'https://example.org/flu', source: { acronym: 'CDC' } },
     { id: 3, name: 'A long description', description: 'x'.repeat(500), sourceUrl: 'https://www.cdc.gov/long.html', source: { acronym: 'CDC' } },
    ],
   }),
   { status: 200, headers: { 'content-type': 'application/json' } },
  )) as unknown as typeof fetch;
 const outcome = await searchCdc('flu', { config: activeConfig('cdc-content-services'), fetchImpl, gate: new RateGate(10) });
 assert.equal(outcome.status, 'ok');
 if (outcome.status !== 'ok') return;
 assert.deepEqual(outcome.results.map((r) => r.title), ['Key Facts About Seasonal Flu Vaccine', 'A long description']);
 assert.equal(outcome.results[0].snippet, 'Vaccination has been shown to reduce the risk of flu illness, hospitalization and flu-related death.', "CDC's words, unchanged");
 assert.equal(outcome.results[1].snippet, 'A long description', 'a description too long to carry whole is left out, not cut');
});

test('Wikidata: labels in four South African languages and cross-references, never a code and never a health statement', async () => {
 let sent = '';
 let agent = '';
 const fetchImpl = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
  sent = new URL(String(input)).searchParams.get('query') ?? '';
  agent = init?.headers?.['user-agent'] ?? '';
  const v = (value: string) => ({ value });
  return new Response(
   JSON.stringify({
    results: {
     bindings: [
      { item: v('http://www.wikidata.org/entity/Q12206'), en: v('diabetes'), zu: v('isifo sikashukela'), af: v('suikersiekte'), st: v('Lefu la Tswekere'), snomed: v('73211009'), mesh: v('D003920') },
      { item: v('http://www.wikidata.org/entity/Q12206'), en: v('diabetes'), xh: v('iswekile yemellitus'), icd11: v('465177735') },
     ],
    },
   }),
   { status: 200 },
  );
 }) as unknown as typeof fetch;
 const outcome = await searchWikidata('diabetes"} ; DROP', { config: activeConfig('wikidata'), fetchImpl, gate: new RateGate(10) });
 assert.equal(outcome.status, 'ok');
 if (outcome.status !== 'ok') return;
 assert.equal(outcome.results.length, 1, 'rows for one item fold into one result');
 const [result] = outcome.results;
 assert.equal(result.title, 'diabetes (Wikidata Q12206)');
 for (const label of ['isiZulu: isifo sikashukela', 'isiXhosa: iswekile yemellitus', 'Afrikaans: suikersiekte', 'Sesotho: Lefu la Tswekere', 'SNOMED CT 73211009', 'MeSH D003920'])
  assert.ok(result.snippet.includes(label), label);
 assert.ok(result.snippet.includes('not yet checked by a first-language reviewer'));
 assert.deepEqual(result.codes, {}, 'a crowd-sourced identifier is not written in as a verified code');
 assert.equal(result.citation.url, 'https://www.wikidata.org/wiki/Q12206');
 assert.ok(sent.includes('mwapi:search "diabetes DROP"'), 'the term reaches the query as plain words, its quote and braces gone');
 assert.equal(sent, wikidataQuery('diabetes DROP'));
 assert.ok(/mythuso\.co\.za/.test(agent), "Wikimedia's policy: the agent names the deployment and a contact");
});
