import contract from '../../../../packages/catalog/device-concepts.json' with { type: 'json' };

/* The v3 pack's device pictures, read from packages/catalog/device-concepts.json: which picture belongs to which
   instrument in capture.json, its alt text, and the one notice every picture is shown with. A picture is a concept
   from the funding proposal, so the screen that draws one says so under it; nothing here says a device is paired. */
export type DeviceConcept = typeof contract.concepts[number];
export const conceptNotice = contract.notice;
export const deviceConcepts = contract.concepts;
export const conceptForKitDevice = (id: string) => contract.concepts.find(c => c.kitDevice === id);
export const nurseKitConcepts = contract.concepts.filter(c => c.kit === 'nurse');
