import { EngineError, type Actor, type ClinicalRole, type State } from './types.ts';
export function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new EngineError('invalid', message); }
export function allow(actor: Actor, ...roles: ClinicalRole[]) { if (!actor.verified || !roles.includes(actor.role)) throw new EngineError('forbidden', 'A verified professional with the required role must perform this action.'); }
export function patientIn(state: State, id: string) { const patient = state.patients.find(p => p.id === id); if (!patient) throw new EngineError('not-found', 'Patient not found in this care workspace.'); return patient; }
export function consentFor(state: State, id: string) { if (!patientIn(state, id).consent) throw new EngineError('consent-required', 'Care consent is required before continuing.'); }
export function itemFor<T extends { id: string; patientId: string }>(items: T[], id: string, patientId: string): T { const item = items.find(x => x.id === id && x.patientId === patientId); if (!item) throw new EngineError('not-found', 'This item does not belong to the selected patient.'); return item; }
export const textRequired = (value: string, label: string) => requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= 5000, `${label} is required (maximum 5,000 characters).`);
export const completeNotes = (notes: Record<string, string>) => ['subjective', 'objective', 'assessment', 'plan'].every(key => typeof notes[key] === 'string' && !!notes[key].trim());
