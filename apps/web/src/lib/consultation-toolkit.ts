import contract from '../../../../packages/catalog/consultation-toolkit.json' with { type: 'json' };
import { clinicalLimits, permitted, refusalById as callRefusal } from './teleconsult';
import { can, type VettingSubject } from './vetting';
import { patients } from './records';

/* The consultation toolkit's reasoning (2 October 2026): which tools a clinician reaches in a consultation, in
 * what order, and what each one says to this clinician, in this consultation, right now.
 *
 * Every answer is read from somewhere else. The tools, their order per role and every sentence are
 * packages/catalog/consultation-toolkit.json's; whether this party may use a tool is the vetting register's,
 * asked live through can(); what the line allows a doctor to decide is the teleconsultation's clinical limits,
 * through permitted(); the refusal a room without a nurse is given is teleconsult.json's own. This file joins
 * them and decides nothing of its own — a tool's state is the first of those answers that says no.
 *
 * WHY THE ORDER OF THE ANSWERS. Being built comes first, because a tool with no screen has nothing to refuse.
 * Then the register: a doctor whose registration lapsed is refused every decision whatever the line is doing.
 * Then the encounter: a call that ended without counting as a consultation decides nothing, permanently. Then
 * the room: a medicine is not started and a certificate is not written for a patient nobody in the room has
 * examined, for the length of the appointment. Only then the line, which is the one answer that changes back. */

export type SurfaceId = 'teleconsult' | 'consultation-record' | 'care-visit';
/* The contract's shapes, declared once: a JSON import types each tool as its own object, and the optional fields
   a few of them carry would otherwise have to be asked about with `in` at every read. */
export type Tool = {
 id: string; name: string; short: string; capability: string | null; summary: string;
 honesty: { capability: string; drawnBy: 'tool' | 'toolkit' };
 decision?: boolean; signsAfterCall?: boolean; pending?: boolean;
 onCall?: { limit: string; refusal: string }[];
 screens: { web: string | null; ios: string | null; android: string | null };
};
export type Surface = {
 id: SurfaceId; role: 'doctor' | 'nurse'; home: { id: string; name: string; short: string }; heading: string;
 from?: string; tools: string[]; refused?: { tool: string; sentence: string }[];
};
type Refusal = { id: string; sentence: string; surfaces?: string[] };
const tools = contract.tools as Tool[];
const surfaces = contract.surfaces as Surface[];
const refusals = contract.refusals as Refusal[];
export const words = contract.words;
export const gates = contract.gates;

export const fill = (template: string, values: Record<string, string>) =>
 template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

export const toolById = (id: string): Tool => {
 const tool = tools.find(t => t.id === id);
 if (!tool) throw new Error(`consultation-toolkit.json holds no tool "${id}"`);
 return tool;
};
export const surfaceById = (id: SurfaceId): Surface => surfaces.find(s => s.id === id)!;
/** The stage of a visit a surface first appears at, when it names one. */
export const surfaceFrom = (id: SurfaceId): string | null => surfaceById(id).from ?? null;
/** The tools a surface lists, in its order. */
export const toolsOf = (surface: Surface): Tool[] => surface.tools.map(toolById);
/** What the surface's role is never granted, said where the doctor's tools would be. Only a nurse's has any. */
export const refusedOn = (surface: Surface): { tool: Tool; sentence: string }[] =>
 (surface.refused ?? []).map(r => ({ tool: toolById(r.tool), sentence: r.sentence }));
/** The toolkit's own refusals said on this surface: those that name no surface are said on every one. */
export const refusalsOn = (surface: Surface) =>
 refusals.filter(r => !r.surfaces || r.surfaces.includes(surface.id));

/** The call, as far as a tool needs to know it. Null on a surface that is not a call. */
export type CallState = { connectionId: string; nursePresent: boolean; ended: boolean; countsAsConsultation: boolean };

export type ToolState =
 | { kind: 'open' }
 | { kind: 'pending'; reason: string }
 | { kind: 'withheld'; reason: string }
 | { kind: 'closed'; reason: string }
 | { kind: 'room'; reason: string }
 | { kind: 'waiting'; reason: string };

/** What a state is called on the tool's own button, when it is anything but open. */
export const stateWord: Record<Exclude<ToolState['kind'], 'open'>, string> = {
 pending: words.statePending, withheld: words.withheld, closed: words.stateClosed, room: words.stateRoom, waiting: words.waiting
};

export function stateOf(tool: Tool, subject: VettingSubject, call: CallState | null): ToolState {
 if (tool.pending) return { kind: 'pending', reason: fill(gates.beingBuilt, { tool: tool.name }) };
 if (tool.capability) {
  const decision = can(subject, tool.capability);
  if (!decision.allowed) return { kind: 'withheld', reason: decision.reason ?? words.withheld };
 }
 if (!call) return { kind: 'open' };
 const decides = tool.decision || tool.signsAfterCall;
 if (!decides) return { kind: 'open' };
 if (call.ended && !call.countsAsConsultation) return { kind: 'closed', reason: fill(gates.notAConsultation, { tool: tool.name }) };
 /* A limit that needs the nurse is the room's answer, and the room is said in the teleconsultation's own words.
    Asked of the room rather than of permitted(), because a dropped line withdraws the nurse's limit too — and a
    doctor told "nobody here has examined the patient" while the nurse is standing beside her would be told
    something false. */
 for (const gate of tool.onCall ?? []) {
  const limit = clinicalLimits.find(l => l.id === gate.limit);
  if (limit?.needs === 'nurse' && !call.nursePresent) return { kind: 'room', reason: callRefusal(gate.refusal).sentence };
 }
 if (!call.ended && !tool.decision) return { kind: 'open' };
 if (!call.ended && !permitted(call.connectionId, call.nursePresent).some(l => l.id === 'conclude'))
  return { kind: 'waiting', reason: fill(gates.lineDoesNotAllow, { tool: tool.name }) };
 return { kind: 'open' };
}

/** The patient's file, by the name on the consultation — or nothing, said as nothing. Never another patient's. */
export const fileOf = (patient: string) => patients.find(p => p.name === patient) ?? null;
