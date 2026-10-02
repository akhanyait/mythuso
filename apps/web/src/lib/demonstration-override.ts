import override from '../../../../packages/catalog/demonstration-override.json' with { type: 'json' };

/* The founder's demonstration override of 2 October 2026, as the Control Tower reads it.

   packages/catalog/demonstration-override.json stands in for the Information Officer's and the clinical
   reviewer's signatures on the gates it lists, while inForce is true, so the capability can be shown
   before either person is appointed. A screen that shows one of those gates shows the disclaimer below
   word for word, from this file — never a sentence of its own — and asks overrideOpens() beside the
   gate's own signatures, never instead of them. Nothing here switches anything: the override is a value
   in a reviewed file, and going live is setting it to false. */

export type DemonstrationGate = { readonly id: string; readonly kind: string; readonly sourceId?: string; readonly state: string; readonly waitingFor?: string };
export type NotOpened = { readonly id: string; readonly name: string; readonly where: string; readonly class: string; readonly why: string };

export const demonstration = override;
export const demonstrationDisclaimer: string = override.disclaimer.sentence;
export const demonstrationWords = override.words;
export const demonstrationGates = override.gates as readonly DemonstrationGate[];
export const notOpened = override.notOpened as readonly NotOpened[];
export const notOpenedClass = (id: string): string => (override.classes as Record<string, string>)[id] ?? '';

/* The listed gate for an id while the override is in force, or null. */
export const overrideGate = (id: string): DemonstrationGate | null =>
 override.inForce === true ? demonstrationGates.find(gate => gate.id === id) ?? null : null;

export const overrideOpens = (id: string): boolean => overrideGate(id) !== null;
