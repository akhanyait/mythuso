import contract from '../../../../packages/catalog/assistant-public.json';
import { emergencyGroupsIn, type EmergencyGroup } from './assistant';
export { contract as publicAssistant };
export type PublicAnswer = { kind: 'emergency'; groups: EmergencyGroup[] } | { kind: 'faq'; question: typeof contract.questions[number] } | { kind: 'refusal' };
const normalise = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
/* Whole-question matching refuses appended instructions, clinical details and unknown topics.
   Emergency detection always precedes the website scope; it never turns into a FAQ answer. */
export function publicAnswer(input: string): PublicAnswer {
 /* The groups travel with the answer so the sheet can add the crisis lines when, and only when, the
    crisis words raised it — packages/catalog/crisis-lines.json. */
 const groups = emergencyGroupsIn(input);
 if (groups.length) return { kind: 'emergency', groups };
 const text = normalise(input).replace(/^please /, '').replace(/ please$/, '');
 const question = contract.questions.find(q => q.aliases.some(alias => normalise(alias) === text));
 return question ? { kind: 'faq', question } : { kind: 'refusal' };
}
