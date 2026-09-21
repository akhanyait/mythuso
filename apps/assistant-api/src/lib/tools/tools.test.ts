import test from 'node:test';
import assert from 'node:assert/strict';
import sos from '../../../../../packages/catalog/sos.json' with { type: 'json' };
import mentalHealth from '../../../../../packages/catalog/knowledge/mental-health.json' with { type: 'json' };
import { formatKnowledgeResults, knowledgeSearchTool, searchKnowledgeBase } from './knowledge-search.ts';
import { checkDrugInteraction, drugCheckTool } from './drug-check.ts';
import { checkSymptoms, symptomCheckTool } from './symptom-check.ts';
import { lookupMedication, medicationInfoTool } from './medication-info.ts';
import { emergencyNumbers, emergencyNumbersTool } from './emergency-numbers.ts';

/* The five tools' own tests, added with the orchestrator tier on 21 September 2026. Every tool is
   a catalog lookup, so the assertions pin outputs to the catalog's own records — read here from
   the same JSON the tools read, so a record that changes in the catalog fails the test that quotes
   it rather than the two quietly drifting apart. The recurring assertions are the safety contract:
   every output carries its sources, names no diagnosis, and hands the decision to a clinician.
   The LangChain wrappers are invoked once each, because the wrapper — not the function — is what
   the agent calls. */

test('knowledge-search hands the model titled, attributed excerpts', async () => {
 const output = await searchKnowledgeBase('child immunisation schedule');
 assert.ok(output.includes('Knowledge base results for "child immunisation schedule":'));
 assert.ok(output.includes('Childhood Immunisation'));
 assert.ok(output.includes('Source: '), 'every excerpt carries its source line');
 assert.ok(output.includes('Sources: SA NDoH Expanded Programme on Immunisation'));
 assert.ok(
  output.includes('none of it is a diagnosis or a prescription'),
  'the excerpts say what they are not',
 );
 /* The empty answer is still an attributed answer. */
 const empty = await searchKnowledgeBase('zzz qqq nothing here');
 assert.ok(empty.includes("Nothing in MyThuso's knowledge base matches"));
 assert.ok(empty.includes('Sources:'));
});

test('formatKnowledgeResults keeps each result to title, snippet and source', () => {
 const formatted = formatKnowledgeResults('a query', [
  {
   id: 'stub-001',
   title: 'Stub title',
   snippet: 'Stub snippet',
   source: 'Stub source',
   score: 0.9,
   file: 'prevention',
  },
 ]);
 assert.ok(formatted.includes('1. Stub title (relevance 90%, prevention)'));
 assert.ok(formatted.includes('Stub snippet'));
 assert.ok(formatted.includes('Source: Stub source'));
 assert.ok(formatted.includes('Sources: Stub source.'));
});

test('drug-check finds the recorded pair behind South African shelf names', async () => {
 /* brufen -> ibuprofen, disprin -> aspirin: the aliases exist so a person's own word for a
    medicine reaches the generic the record is written in. */
 const output = await checkDrugInteraction('brufen', 'disprin');
 assert.ok(output.includes('One recorded interaction found between Ibuprofen and Aspirin'));
 assert.ok(output.includes('severity: MODERATE'));
 assert.ok(output.includes('Effect: '));
 assert.ok(output.includes('What the record advises: '));
 assert.ok(output.includes('Sources: OpenFDA / SA NDoH Standard Treatment Guidelines.'));
 assert.ok(
  output.includes('not advice to take, change or stop either medicine'),
  'the record closes by handing the decision back',
 );
 /* And the pair is order-free: the question does not stop being a question when the names swap. */
 assert.ok((await checkDrugInteraction('aspirin', 'ibuprofen')).includes('severity: MODERATE'));
});

test('drug-check reads the warfarin and aspirin record at its recorded severity', async () => {
 const output = await checkDrugInteraction('warfarin', 'aspirin');
 assert.ok(output.includes('severity: HIGH'));
 assert.ok(output.includes('Increased bleeding risk'));
 assert.ok(output.includes('Avoid the combination'));
});

test('drug-check answers a same-medicine pair and a missing name honestly', async () => {
 const same = await checkDrugInteraction('panado', 'paracetamol');
 assert.ok(same.includes('the same medicine'), 'panado and paracetamol are one medicine');
 assert.ok(same.includes('ask a pharmacist or your nurse'));
 const unnamed = await checkDrugInteraction('', 'aspirin');
 assert.ok(unnamed.includes('Two medicine names are needed'));
});

test('drug-check says "no record", never "safe to combine"', async () => {
 const output = await checkDrugInteraction('paracetamol', 'loratadine');
 assert.ok(output.includes('No known interaction is recorded'));
 assert.ok(output.includes('That is not the same as safe to combine'));
 assert.ok(output.includes('Sources:'));
});

test('symptom-check mirrors the catalog, with the doctor line beside every condition', async () => {
 const output = await checkSymptoms('runny nose, sore throat and sneezing');
 assert.ok(output.includes('Common Cold'));
 assert.ok(output.includes('When to see a doctor: '));
 assert.ok(output.includes('This is a reading of recorded symptom lists, not a diagnosis.'));
 assert.ok(output.includes('Sources: '));
});

test('symptom-check leads with the IMCI danger signs when a child carries one', async () => {
 const output = await checkSymptoms('my baby is not drinking anything and vomiting everything');
 assert.ok(output.startsWith('URGENT'), 'the urgent line comes first, before any condition list');
 assert.ok(output.includes('cannot drink or breastfeed'));
 assert.ok(output.includes('vomits everything'));
 assert.ok(output.includes('10177'));
 /* A mild cold in a child is guidance, not an alarm: no red flag words, no urgent line. */
 const mild = await checkSymptoms('my baby has a runny nose and mild cough');
 assert.equal(mild.includes('URGENT'), false);
 assert.ok(mild.includes('When to see a doctor: '));
});

test('symptom-check answers silence and an empty ask as silence and a request', async () => {
 const none = await checkSymptoms('zzz qqq');
 assert.ok(none.includes("No condition in MyThuso's list records these symptoms"));
 assert.ok(none.includes('10177'), 'even the empty answer names the emergency number');
 const empty = await checkSymptoms('');
 assert.ok(empty.includes('Describe the symptoms'));
});

test('medication-info reads the paracetamol record back in full', async () => {
 const output = await lookupMedication('paracetamol');
 assert.ok(output.includes('Paracetamol'));
 assert.ok(output.includes('Usual dosage on the record: Adults: 500mg-1g'));
 assert.ok(output.includes('Side effects listed: '));
 assert.ok(output.includes('Cautions and contraindications: '));
 assert.ok(output.includes('Pregnancy: '));
 assert.ok(output.includes('not a prescription'));
 assert.ok(output.includes('Sources: SA Essential Medicines List / SA NDoH Standard Treatment Guidelines.'));
 /* A generic word meets its qualified name: "aspirin" is the Aspirin (low-dose) record. */
 const aspirin = await lookupMedication('aspirin');
 assert.ok(aspirin.includes('Aspirin (low-dose)'));
 assert.ok(aspirin.includes('Usual dosage on the record: '));
});

test('medication-info answers ambiguity with the list and absence with the truth', async () => {
 const ambiguous = await lookupMedication('amox');
 assert.ok(ambiguous.includes('More than one medicine answers to "amox"'));
 assert.ok(ambiguous.includes('Amoxicillin'));
 assert.ok(ambiguous.includes('Name the exact one'));
 const absent = await lookupMedication('panado');
 assert.ok(absent.includes("is not in MyThuso's medication list"));
 assert.ok(absent.includes('prescribing label and their instructions come first'));
 const empty = await lookupMedication('');
 assert.ok(empty.includes('Name a medicine'));
});

test('emergency-numbers carries sos.json’s own three, by the contract’s ordering', async () => {
 const output = await emergencyNumbers('not specified');
 for (const entry of sos.emergency.numbers) {
  assert.ok(
   output.includes(`${entry.name}: ${entry.number}`),
   `${entry.id} (${entry.number}) should be read from sos.json, not typed`,
  );
 }
 /* The support lines are pinned against the catalog's mental-health resources: a number that
    changes in the catalog fails here rather than going stale on a person in crisis. */
 const catalogResources = mentalHealth
  .flatMap((entry: { saResources?: string[] }) => entry.saResources ?? [])
  .join('\n');
 for (const number of ['0800 567 567', '0861 322 322', '0800 428 428'])
  assert.ok(
   catalogResources.includes(number),
   `${number} should be the catalog's own number for a support line`,
  );
 assert.ok(output.includes('SADAG mental health helpline'));
 assert.ok(output.includes('0800 567 567'));
 assert.ok(output.includes('Lifeline South Africa'));
 assert.ok(output.includes('0861 322 322'));
 assert.ok(output.includes('Sources: '));
 /* A support-shaped question gets the support sentence; a plain ask does not. */
 assert.ok((await emergencyNumbers('I am feeling very depressed and anxious')).includes('For how you are feeling'));
 assert.equal(output.includes('For how you are feeling'), false);
});

test('each LangChain wrapper carries the name the agent knows it by, and answers when invoked', async () => {
 assert.equal(knowledgeSearchTool.name, 'knowledge_search');
 assert.equal(drugCheckTool.name, 'drug_interaction_check');
 assert.equal(symptomCheckTool.name, 'symptom_check');
 assert.equal(medicationInfoTool.name, 'medication_info');
 assert.equal(emergencyNumbersTool.name, 'emergency_numbers');

 const knowledge = await knowledgeSearchTool.invoke({ query: 'child immunisation schedule' });
 assert.ok(String(knowledge).includes('Knowledge base results'));

 const interaction = await drugCheckTool.invoke({ drugA: 'warfarin', drugB: 'aspirin' });
 assert.ok(String(interaction).includes('severity: HIGH'));

 const symptoms = await symptomCheckTool.invoke({ symptoms: 'runny nose and sneezing' });
 assert.ok(String(symptoms).includes('Common Cold'));

 const medication = await medicationInfoTool.invoke({ medication: 'paracetamol' });
 assert.ok(String(medication).includes('Usual dosage on the record'));

 const numbers = await emergencyNumbersTool.invoke({ need: 'not specified' });
 assert.ok(String(numbers).includes('10177'));
});
