import test from 'node:test';
import assert from 'node:assert/strict';
import override from '../../../../../packages/catalog/demonstration-override.json' with { type: 'json' };
import federation from '../../../../../packages/catalog/knowledge/federation.json' with { type: 'json' };
import { overrideClosed } from '../demonstration-override.ts';
import type { FederationAdapter } from '../knowledge-federation.ts';
import { REFERENCE_SOURCES_TOOL, referenceSourcesTool, searchReferenceSources } from './reference-sources.ts';

/* The reference_sources tool's own tests, added on 2 October 2026 with the founder's demonstration
   override. The adapters are injected, so nothing here reaches a network; what is under test is what
   the tool says: each source's own words with the attribution federation.json records for it, the
   override's disclaimer word for word whenever a source is on only for demonstration, which sources wait
   for credentials, and — with the override switched off — that every source is dark. */

const attributionOf = (id: string): string =>
 (federation.sources.find((source) => source.id === id)!.licensing as { attribution?: string }).attribution!;

const medlinePlus: FederationAdapter = {
 id: 'medlineplus-nlm',
 search: async () => ({
  status: 'ok',
  sourceId: 'medlineplus-nlm',
  results: [
   {
    id: 'medlineplus-nlm:sunexposure',
    title: 'Sun Exposure',
    snippet: 'Ultraviolet (UV) rays are an invisible form of radiation.',
    score: 0.85,
    codes: {},
    citation: { authority: 'US National Library of Medicine (NIH)', url: 'https://medlineplus.gov/sunexposure.html', sourceId: 'medlineplus-nlm' },
    sourceId: 'medlineplus-nlm',
   },
  ],
 }),
};

test('the tool is registered by the name the orchestrator dispatches on', () => {
 assert.equal(referenceSourcesTool.name, REFERENCE_SOURCES_TOOL);
});

test("an answer carries the source's words, its attribution, the disclaimer word for word, and what waits for credentials", async () => {
 const text = await searchReferenceSources('sunburn', { adapters: [medlinePlus], override: { ...override, inForce: true } });
 assert.ok(text.includes('Sun Exposure'));
 assert.ok(text.includes('Page: https://medlineplus.gov/sunexposure.html'));
 assert.ok(text.includes(attributionOf('medlineplus-nlm')), 'the attribution MedlinePlus asks for');
 assert.ok(text.includes(override.disclaimer.sentence), "the override's disclaimer, word for word");
 for (const gate of override.gates.filter((g) => g.state === 'waiting-for-credentials'))
  assert.ok(text.includes((gate as { waitingFor: string }).waitingFor), `${gate.id} says what it waits for`);
 assert.ok(/^Sources: .*MedlinePlus/m.test(text), 'the Sources line the orchestrator reads for attribution');
});

test('a request for a diagnosis or a dose is refused before any source is asked', async () => {
 let asked = 0;
 const spy: FederationAdapter = { id: 'openfda', search: async () => { asked += 1; return { status: 'ok', sourceId: 'openfda', results: [] }; } };
 /* Scope refusal is what the tool says when a source could otherwise be asked. The live
    override is off, so this injects an in-force copy; the switched-off answer is the next test. */
 const text = await searchReferenceSources('should I double my dose of insulin', { adapters: [spy], override: { ...override, inForce: true } });
 assert.ok(text.includes(federation.abstention['outside-approved-scope']));
 assert.equal(asked, 0);
});

test('with the override switched off and nothing signed, the tool says every source is off and shows no disclaimer', async () => {
 const text = await searchReferenceSources('sunburn', { override: overrideClosed, adapterDeps: { fetchImpl: (async () => { throw new Error('nothing may be asked'); }) as unknown as typeof fetch } });
 assert.ok(text.startsWith('Every external reference source is switched off'));
 assert.equal(text.includes(override.disclaimer.sentence), false);
});
