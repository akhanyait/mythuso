import contract from '../../../../packages/catalog/assistant-public.json';
import { emergencyGroupsIn, escalationEmergencyIn, type EmergencyGroup } from './assistant';
export { contract as publicAssistant };
export type PublicAnswer = { kind: 'emergency'; groups: EmergencyGroup[] } | { kind: 'faq'; question: typeof contract.questions[number] } | { kind: 'refusal' };
const normalise = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
/* Whole-question matching refuses appended instructions, clinical details and unknown topics.
   Emergency detection always precedes the website scope; it never turns into a FAQ answer. */
export function publicAnswer(input: string): PublicAnswer {
 /* The groups travel with the answer so the sheet can add the crisis lines when, and only when, the
    crisis words raised it — packages/catalog/crisis-lines.json. */
 const named = emergencyGroupsIn(input);
 /* And the escalation ruleset's emergencies (1 October 2026): "my throat is swelling" names no term,
    and the sheet used to refuse it as off-topic. It is the same emergency answer, never a FAQ. */
 const groups = named.length ? named : escalationEmergencyIn(input);
 if (groups) return { kind: 'emergency', groups };
 const text = normalise(input).replace(/^please /, '').replace(/ please$/, '');
 const question = contract.questions.find(q => q.aliases.some(alias => normalise(alias) === text));
 return question ? { kind: 'faq', question } : { kind: 'refusal' };
}
