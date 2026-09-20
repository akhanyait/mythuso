import contract from '../../../../packages/catalog/assistant-public.json';
import { emergencyGroupsIn } from './assistant';
export { contract as publicAssistant };
export type PublicAnswer = { kind: 'emergency' } | { kind: 'faq'; question: typeof contract.questions[number] } | { kind: 'refusal' };
const normalise = (text: string) => text.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
/* Whole-question matching refuses appended instructions, clinical details and unknown topics.
   Emergency detection always precedes the website scope; it never turns into a FAQ answer. */
export function publicAnswer(input: string): PublicAnswer {
 if (emergencyGroupsIn(input).length) return { kind: 'emergency' };
 const text = normalise(input).replace(/^please /, '').replace(/ please$/, '');
 const question = contract.questions.find(q => q.aliases.some(alias => normalise(alias) === text));
 return question ? { kind: 'faq', question } : { kind: 'refusal' };
}
