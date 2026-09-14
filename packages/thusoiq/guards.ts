import { bounds, grouped, label, refusal, soapKeys } from './contract.ts';
import { EngineError, type Actor, type ClinicalRole, type EngineErrorCode, type State } from './types.ts';

type Fills = Record<string, string | number>;

/** Every sentence this kernel refuses with is fetched from packages/catalog/thusoiq.json by id. A
 *  literal here would be a second copy of something three platforms have to say identically, and
 *  the copy that drifts is always the one nobody is looking at. */
export function refuse(code: EngineErrorCode, id: string, fills?: Fills): never { throw new EngineError(code, refusal(id, fills)); }
export function requireThat(condition: unknown, id: string, fills?: Fills): asserts condition { if (!condition) refuse('invalid', id, fills); }
export function allow(actor: Actor, ...roles: ClinicalRole[]) { if (!actor.verified || !roles.includes(actor.role)) refuse('forbidden', 'role-not-permitted'); }
/* Not found and not yours are one answer. A kernel that told them apart would be a way of asking
   whether a named person is a MyThuso patient, which is a disclosure on its own. */
export function patientIn(state: State, id: string) { const patient = state.patients.find(p => p.id === id); if (!patient) refuse('not-found', 'patient-not-here'); return patient; }
export function consentFor(state: State, id: string) { if (!patientIn(state, id).consent) refuse('consent-required', 'consent-required'); }
export function itemFor<T extends { id: string; patientId: string }>(items: T[], id: string, patientId: string): T { const item = items.find(x => x.id === id && x.patientId === patientId); if (!item) refuse('not-found', 'wrong-patient'); return item; }
/* One sentence for nine required fields, filled with the field's own label out of the contract, so
   that nine fields cannot become nine ways of asking for the same thing. */
export const textRequired = (value: string, labelId: string) => requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= bounds.noteCharacters.max, 'text-required', { label: label(labelId), max: grouped(bounds.noteCharacters.max) });
export const completeNotes = (notes: Record<string, string>) => soapKeys.every(key => typeof notes[key] === 'string' && !!notes[key].trim());
