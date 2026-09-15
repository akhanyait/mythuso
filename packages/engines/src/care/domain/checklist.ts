/* The checklist a visit runs under, and why today it runs under none.
 *
 * A service names the protocols in packages/catalog/protocols.json that govern it, and the checklist
 * is those protocols at the versions the register holds. Every one of them is a draft, and a draft
 * carries a name and a number and nothing else — so there are no steps to show and this module has
 * nowhere to get any from. It does not invent them. What a screen draws instead is which protocol,
 * which version, that it is a draft, and the route's own refusal: a checklist runs only under a
 * ratified protocol.
 *
 * The day the board ratifies one, `runnable` becomes true for the services that name it and nothing
 * else here changes; the steps will be read at the version the register names, from the content the
 * register points at, and never from a copy compiled into this engine. */
import { requirementFor, routeOf, ROUTES, type CareContract, type ProtocolRow } from './contract.ts';

export type ChecklistView = {
 readonly serviceId: string;
 readonly protocols: readonly (ProtocolRow & { readonly reference: string; readonly ratified: boolean })[];
 /** True only when every protocol the service names is ratified. */
 readonly runnable: boolean;
 /** What the screen says instead of steps, or null when it may run. */
 readonly refusal: string | null;
 /** The register's own reason a draft shows no steps, when one of the protocols is a draft. */
 readonly why: string | null;
};

export function checklistFor(contract: CareContract, serviceId: string): ChecklistView {
 const requirement = requirementFor(contract, serviceId);
 const rows = (requirement?.protocolIds ?? []).map(id => {
  const row = contract.protocols.find(p => p.id === id);
  if (!row) throw new Error(`packages/catalog/care.json names the protocol "${id}", which the register does not hold.`);
  return { ...row, reference: `${row.id}@${row.version}`, ratified: row.status === 'ratified' };
 });
 if (!rows.length) return { serviceId, protocols: [], runnable: false, refusal: contract.sentences.noProtocol, why: null };
 const runnable = rows.every(r => r.ratified);
 const notRatified = routeOf(contract, ROUTES.checklist).refusals.find(r => r.id === 'protocol-not-ratified')!.statement;
 return {
  serviceId, protocols: rows, runnable,
  refusal: runnable ? null : notRatified,
  why: rows.some(r => r.status === 'draft') ? contract.sentences.draftCarriesNothing : null
 };
}

/** An id@version the register holds, or null. Nothing outside the register may name a version. */
export function protocolAt(contract: CareContract, protocolVersionId: string): ProtocolRow | null {
 const at = protocolVersionId.lastIndexOf('@');
 if (at < 1) return null;
 const id = protocolVersionId.slice(0, at), version = Number(protocolVersionId.slice(at + 1));
 return contract.protocols.find(p => p.id === id && p.version === version) ?? null;
}
