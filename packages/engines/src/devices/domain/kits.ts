/* A kit: registered devices issued to a nurse against a recorded deposit, returned, or reported lost.
 *
 * THE DEPOSIT IS RECORDED AND NEVER TAKEN. No contract held a kit deposit, so it is the setting kit-deposit
 * in packages/catalog/devices.json, a proposal. A kit keeps the amount and the settings version it was
 * issued under. Nothing here takes, holds, returns or charges money: Money's engine is where that is
 * decided, in Wave 5.
 *
 * A LOSS CHARGES NOBODY. It is a row in the kit's audit with who, when and why. What a lost kit costs,
 * and who pays, is Money's to decide later, and a loss recorded today stays exactly as it was recorded.
 *
 * THE AUDIT IS ADDED TO, NEVER EDITED. Every issue, return and loss is a new row.
 */
import { accept, lossReasons, refuse, type Result } from './contract.ts';
import type { Device } from './registry.ts';
import type { DevicesInForce } from './settings.ts';

export type KitClosed = { readonly code: 'returned' | 'lost'; readonly at: number; readonly reasonCode: string | null };
export type Kit = {
 readonly kitRef: string;
 readonly kitSerial: string;
 readonly holderRef: string;
 readonly deviceRefs: readonly string[];
 readonly depositCents: number;
 readonly settingsVersion: number;
 readonly issuedAt: number;
 readonly closed: KitClosed | null;
};
export type KitAct = 'issued' | 'returned' | 'lost';
export type AuditRow = { readonly kitRef: string; readonly act: KitAct; readonly reasonCode: string | null; readonly byRole: string; readonly byRef: string | null; readonly at: number };

export type IssueInput = { readonly kitRef: string; readonly kitSerial: string; readonly holderRef: string; readonly deviceRefs: unknown };
export type IssueContext = { readonly deviceOf: (ref: string) => Device | undefined; readonly openKits: readonly Kit[]; readonly settings: DevicesInForce; readonly now: number };

export function issueKit(input: IssueInput, ctx: IssueContext): Result<Kit> {
 const refs = Array.isArray(input.deviceRefs) ? [...new Set(input.deviceRefs.map(String))] : [];
 if (!refs.length) return refuse('kit-without-devices');
 if (ctx.openKits.some(k => k.kitSerial === input.kitSerial)) return refuse('kit-already-out');
 const found = refs.map(ref => ctx.deviceOf(ref));
 if (found.some(d => d === undefined)) return refuse('device-not-registered');
 if (found.some(d => d!.recall !== null)) return refuse('recalled-device-not-issued');
 if (ctx.openKits.some(k => k.deviceRefs.some(ref => refs.includes(ref)))) return refuse('device-already-in-a-kit');
 return accept({
  kitRef: input.kitRef, kitSerial: input.kitSerial, holderRef: input.holderRef, deviceRefs: refs,
  depositCents: ctx.settings.kitDepositCents, settingsVersion: ctx.settings.settingsVersion, issuedAt: ctx.now, closed: null
 });
}

export function returnKit(kit: Kit | undefined, now: number): Result<Kit> {
 if (!kit) return refuse('kit-not-issued');
 if (kit.closed !== null) return refuse('kit-already-closed');
 return accept({ ...kit, closed: { code: 'returned', at: now, reasonCode: null } });
}

export type LossInput = { readonly reasonCode: unknown; readonly byRole: string; readonly byRef: string | null };

export function reportLoss(kit: Kit | undefined, input: LossInput, now: number): Result<Kit> {
 if (typeof input.reasonCode !== 'string' || !input.reasonCode.trim()) return refuse('loss-without-reason');
 if (!lossReasons.some(r => r.id === input.reasonCode)) return refuse('loss-reason-not-declared');
 if (!kit) return refuse('kit-not-issued');
 if (kit.closed !== null) return refuse('kit-already-closed');
 /* The desk records a loss for any kit. A nurse records one only for the kit she holds. */
 if (input.byRole === 'nurse' && input.byRef !== kit.holderRef) return refuse('loss-reported-by-another-nurse');
 return accept({ ...kit, closed: { code: 'lost', at: now, reasonCode: input.reasonCode } });
}
