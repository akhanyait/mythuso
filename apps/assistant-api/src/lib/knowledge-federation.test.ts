import test from 'node:test';
import assert from 'node:assert/strict';
import { abstentionSentence } from './sources/config.ts';
import {
 federatedSearch,
 outsideApprovedScope,
 federationStatus,
 type FederationAdapter,
} from './knowledge-federation.ts';
import type { KnowledgeResult } from './knowledge.ts';
import type { FederatedResult } from './sources/config.ts';

/* The governed federation's own tests, added on 22 September 2026 with the federation work.
   Everything here is deterministic: the local search and the adapters are injected through the
   FederationDeps seam, so no test touches the real index, a real network or another test's state.
   The one test that uses the real registry ("the shipped federation.json") runs the production
   path on purpose — every adapter dark — and asserts exactly that. */

const localResult = (
 id: string,
 title: string,
 codes: KnowledgeResult['codes'] = {},
 citation: Partial<KnowledgeResult['citation']> = {},
): KnowledgeResult => ({
 id,
 title,
 snippet: `${title} — local catalogue text`,
 source: 'South Africa NDoH',
 score: 1,
 file: 'conditions',
 codes,
 citation: {
  authority: 'South Africa NDoH',
  jurisdiction: 'South Africa',
  retrievedDate: '2026-09-21',
  ...citation,
 },
});

const externalResult = (
 id: string,
 title: string,
 score: number,
 codes: KnowledgeResult['codes'] = {},
): FederatedResult => ({
 id,
 title,
 snippet: `${title} — external source text`,
 score,
 codes,
 citation: {
  authority: 'WHO',
  jurisdiction: 'International',
  retrievedDate: '2026-09-22',
  licence: 'CC BY-ND 3.0 IGO',
  url: `https://id.who.int/icd/entity/${id}`,
  sourceId: 'icd11-who',
 },
 sourceId: 'icd11-who',
});

const okAdapter = (id: string, results: FederatedResult[]): FederationAdapter => ({
 id,
 search: async () => ({ status: 'ok', sourceId: id, results }),
});

test('every abstention sentence is quoted from federation.json, not written in code', () => {
 assert.ok(abstentionSentence('no-evidence').includes('approved knowledge base has nothing'));
 assert.ok(abstentionSentence('expired-evidence').includes('past its review date'));
 assert.ok(abstentionSentence('conflicting-evidence').includes('disagree with each other'));
 assert.ok(abstentionSentence('outside-approved-scope').includes('outside what'));
});

test('an empty question abstains with no-evidence and costs no lookup', async () => {
 let calls = 0;
 const answer = await federatedSearch('   ', {
  localSearch: async () => {
   calls += 1;
   return [];
  },
  adapters: [],
 });
 assert.equal(answer.kind, 'abstention');
 if (answer.kind !== 'abstention') return;
 assert.equal(answer.abstention, 'no-evidence');
 assert.equal(answer.sentence, abstentionSentence('no-evidence'));
 assert.equal(calls, 0);
 assert.deepEqual(answer.notes, []);
});

test('out-of-scope questions are refused before any search runs, in the phrasings people use', async () => {
 let localCalls = 0;
 let adapterCalls = 0;
 const where = {
  localSearch: async () => {
   localCalls += 1;
   return [];
  },
  adapters: [
   {
    id: 'spy',
    search: async () => {
     adapterCalls += 1;
     return { status: 'ok' as const, sourceId: 'spy', results: [] };
    },
   },
  ],
 };
 const questions = [
  'Can you diagnose me?',
  'do I have diabetes',
  'should I stop my medication',
  'please prescribe me antibiotics',
  'can you read my blood results',
 ];
 for (const question of questions) {
  const answer = await federatedSearch(question, where);
  assert.equal(answer.kind, 'abstention', question);
  if (answer.kind !== 'abstention') return;
  assert.equal(answer.abstention, 'outside-approved-scope', question);
  assert.equal(answer.sentence, abstentionSentence('outside-approved-scope'));
 }
 assert.equal(localCalls, 0, 'an excluded question must cost no local lookup');
 assert.equal(adapterCalls, 0, 'an excluded question must cost no external call');
});

test('in-scope questions pass the deny-list and actually search', async () => {
 for (const question of ['what is diabetes', 'how is high blood pressure managed', 'warning signs of a stroke']) {
  assert.equal(outsideApprovedScope(question), false, question);
 }
 let calls = 0;
 const answer = await federatedSearch('what is diabetes', {
  localSearch: async () => {
   calls += 1;
   return [localResult('cond-002', 'Diabetes')];
  },
  adapters: [],
 });
 assert.equal(calls, 1);
 assert.equal(answer.kind, 'results');
});

test('with the shipped federation.json every allowlisted source reports dark, and local results still answer', async () => {
 /* The one test on the real registry: production passes no adapters, so these are the shipped
    three, each reading its own federation.json row. Dark means no request is made — which is the
    property the notes must state out loud. */
 const answer = await federatedSearch('common cold', {
  localSearch: async () => [localResult('cond-001', 'Common cold', { snomed: '82272006' })],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.deepEqual(
  answer.notes.map((note) => note.sourceId).sort(),
  ['icd11-who', 'openfda', 'pubmed-europepmc'],
 );
 for (const note of answer.notes) {
  assert.equal(note.status, 'dark');
  assert.ok(note.detail?.includes('active: false'), 'the note says what the flag is');
 }
 assert.equal(answer.results.length, 1);
 assert.equal(answer.results[0].id, 'cond-001');
 assert.equal(answer.results[0].file, 'conditions');
});

test('an in-scope question with nothing anywhere abstains with no-evidence, notes and all', async () => {
 const answer = await federatedSearch('tropical skin conditions', {
  localSearch: async () => [],
  adapters: [okAdapter('icd11-who', [])],
 });
 assert.equal(answer.kind, 'abstention');
 if (answer.kind !== 'abstention') return;
 assert.equal(answer.abstention, 'no-evidence');
 assert.deepEqual(answer.notes, [{ sourceId: 'icd11-who', status: 'ok' }]);
});

test('external results keep their order behind the local ones, wearing the federation file name', async () => {
 const adapter = okAdapter('icd11-who', [
  externalResult('icd11-who:1F4Z', 'Hypertension, low-priority coding note', 0.4),
  externalResult('icd11-who:BA00', 'Essential hypertension', 0.8),
 ]);
 const answer = await federatedSearch('blood pressure', {
  localSearch: async () => [localResult('cond-002', 'High blood pressure')],
  adapters: [adapter],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.deepEqual(
  answer.results.map((result) => result.id),
  ['cond-002', 'icd11-who:BA00', 'icd11-who:1F4Z'],
  'locals first, then externals by their own score',
 );
 const external = answer.results[1];
 assert.equal(external.file, 'federation', 'an external hit says so, rather than wearing a local file name');
 assert.equal(external.source, 'WHO');
 assert.equal(external.citation.licence, 'CC BY-ND 3.0 IGO');
 assert.equal(answer.deduped, 0);
});

test('duplicates are dropped and counted: same title, or same code for the same thing', async () => {
 const adapter = okAdapter('icd11-who', [
  externalResult('x:1', 'common cold', 0.9),
  externalResult('x:2', 'Common cold and flu', 0.7, { snomed: '82272006' }),
  externalResult('x:3', 'Malaria', 0.5, { snomed: '61462000' }),
 ]);
 const answer = await federatedSearch('common cold', {
  localSearch: async () => [localResult('cond-001', 'Common cold', { snomed: '82272006' })],
  adapters: [adapter],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.deepEqual(
  answer.results.map((result) => result.id),
  ['cond-001', 'x:3'],
  'the title echo and the code echo are folded away; the new record stands',
 );
 assert.equal(answer.deduped, 2);
});

test('a shared loinc observation code is never a duplicate and never a conflict', async () => {
 const answer = await federatedSearch('inr monitoring', {
  localSearch: async () => [localResult('med-036', 'Warfarin blood test monitoring', { loinc: '6301-6' })],
  adapters: [okAdapter('icd11-who', [externalResult('x:l', 'INR measurement', 0.5, { loinc: '6301-6' })])],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.equal(answer.results.length, 2, 'an observation code is legitimately shared by different records');
 assert.equal(answer.deduped, 0);
});

test('two records claiming one code for different things abstain as conflicting-evidence', async () => {
 /* The collision is deliberate: the fixture asks what the layer does when two records say one code
    names two different subjects. It must not pick a side for the reader. */
 const answer = await federatedSearch('common cold', {
  localSearch: async () => [
   localResult('cond-001', 'Common cold', { snomed: '82272006' }),
   localResult('cond-901', 'Malaria', { snomed: '82272006' }),
  ],
  adapters: [],
 });
 assert.equal(answer.kind, 'abstention');
 if (answer.kind !== 'abstention') return;
 assert.equal(answer.abstention, 'conflicting-evidence');
 assert.equal(answer.sentence, abstentionSentence('conflicting-evidence'));
});

test('a source claiming a local code for a different subject is a conflict, not a duplicate', async () => {
 const answer = await federatedSearch('malaria', {
  localSearch: async () => [localResult('cond-006', 'Malaria', { snomed: '61462000' })],
  adapters: [okAdapter('icd11-who', [externalResult('x:y', 'Yellow fever', 0.9, { snomed: '61462000' })])],
 });
 assert.equal(answer.kind, 'abstention');
 if (answer.kind !== 'abstention') return;
 assert.equal(answer.abstention, 'conflicting-evidence');
});

test('every record past its review date abstains as expired-evidence', async () => {
 const answer = await federatedSearch('hand hygiene', {
  localSearch: async () => [
   localResult('prev-001', 'Hand hygiene', {}, { expiresOrReviewBy: '2026-01-31' }),
  ],
  adapters: [],
  now: () => new Date('2026-09-22T09:00:00Z'),
 });
 assert.equal(answer.kind, 'abstention');
 if (answer.kind !== 'abstention') return;
 assert.equal(answer.abstention, 'expired-evidence');
 assert.equal(answer.sentence, abstentionSentence('expired-evidence'));
});

test('expired records are dropped from an otherwise fresh answer, and counted', async () => {
 const answer = await federatedSearch('hand hygiene', {
  localSearch: async () => [
   localResult('prev-001', 'Hand hygiene', {}, { expiresOrReviewBy: '2027-01-31' }),
   localResult('prev-002', 'Cough etiquette', {}, { expiresOrReviewBy: '2026-01-31' }),
  ],
  adapters: [],
  now: () => new Date('2026-09-22T09:00:00Z'),
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.deepEqual(answer.results.map((result) => result.id), ['prev-001']);
 assert.equal(answer.droppedExpired, 1);
});

test('a local search that raises is absorbed: the externals still answer', async () => {
 const answer = await federatedSearch('gout', {
  localSearch: async () => {
   throw new Error('index offline');
  },
  adapters: [okAdapter('icd11-who', [externalResult('x:g', 'Gout', 0.8, { icd11: 'FA25' })])],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.deepEqual(answer.results.map((result) => result.id), ['x:g']);
 assert.equal(answer.results[0].source, 'WHO');
});

test('a local search that raises, with no external answers, abstains with no-evidence', async () => {
 const answer = await federatedSearch('gout', {
  localSearch: async () => {
   throw new Error('index offline');
  },
  adapters: [],
 });
 assert.equal(answer.kind, 'abstention');
 if (answer.kind !== 'abstention') return;
 assert.equal(answer.abstention, 'no-evidence');
});

test('an adapter that raises is reported as unavailable, and the rest of the answer stands', async () => {
 const spy: FederationAdapter = {
  id: 'spy',
  search: async () => {
   throw new Error('boom');
  },
 };
 const answer = await federatedSearch('common cold', {
  localSearch: async () => [localResult('cond-001', 'Common cold')],
  adapters: [spy],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.deepEqual(answer.notes, [
  {
   sourceId: 'spy',
   status: 'unavailable',
   detail: 'the adapter raised instead of answering; treated as unavailable',
  },
 ]);
});

test('a rate-limited source is noted with the wait the gate reported', async () => {
 const limited: FederationAdapter = {
  id: 'openfda',
  search: async () => ({
   status: 'rate-limited',
   sourceId: 'openfda',
   retryAfterMs: 2500,
   detail: 'the configured rate limit for this source is reached; nothing was sent',
  }),
 };
 const answer = await federatedSearch('warfarin', {
  localSearch: async () => [localResult('med-036', 'Warfarin')],
  adapters: [limited],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.equal(answer.notes[0].status, 'rate-limited');
 assert.ok(answer.notes[0].detail?.endsWith('(about 3s)'));
});

test('the answer carries every distinct citation a panel renders, each with its provenance', async () => {
 const answer = await federatedSearch('common cold', {
  localSearch: async () => [
   localResult('cond-001', 'Common cold', {}, { evidenceGrade: 'guideline' }),
   localResult('cond-002', 'Malaria', {}, { evidenceGrade: 'guideline' }),
  ],
  adapters: [okAdapter('icd11-who', [externalResult('x:g', 'Gout', 0.8, { icd11: 'FA25' })])],
 });
 assert.equal(answer.kind, 'results');
 if (answer.kind !== 'results') return;
 assert.equal(answer.citations.length, 2, 'two identical local citations collapse to one');
 const [local, external] = answer.citations;
 assert.equal(local.authority, 'South Africa NDoH');
 assert.equal(local.jurisdiction, 'South Africa');
 assert.equal(local.evidenceGrade, 'guideline');
 assert.equal(local.retrievedDate, '2026-09-21');
 assert.equal(external.authority, 'WHO');
 assert.equal(external.licence, 'CC BY-ND 3.0 IGO');
 assert.equal(external.sourceId, 'icd11-who');
 assert.ok(external.url);
});

test('federationStatus reports the shipped posture: dark by default, three dark sources', () => {
 const status = federationStatus();
 assert.equal(status.darkByDefault, true);
 assert.deepEqual(
  status.sources.map((source) => source.id).sort(),
  ['icd11-who', 'openfda', 'pubmed-europepmc'],
 );
 for (const source of status.sources) {
  assert.equal(source.active, false, `${source.id} must ship dark`);
  assert.equal(source.crossBorderTransferApproved, false, `${source.id} must record the unapproved transfer`);
  assert.ok(source.role);
  assert.ok(source.licence);
 }
});
