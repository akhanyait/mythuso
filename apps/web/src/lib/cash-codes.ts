import { useSyncExternalStore } from 'react';
import care from '../../../../packages/catalog/care.json' with { type: 'json' };
import { createMoney, type Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import { isRefusal, money as contract, serviceById, stateOf } from '../../../../packages/engines/src/money/domain/contract.ts';

/* The cash code at the door, on the nurse's screen, and the desk's panel of cash payments held for too many
 * wrong codes — both driven by Money's own ledger in the browser, as lib/money.ts drives payment.
 *
 * ── Why the ledger, and not a copy of its rules ───────────────────────────────────────────────
 *
 * The attempt limit, the hold, the refusal of the right code once held, the release that needs a reason and
 * the audit that says who, when and why are the ledger's, and the engine binds the same ledger to its routes.
 * A screen that counted attempts itself would be a second limit that could disagree with the first.
 *
 * ── What stands in for the patient's phone ────────────────────────────────────────────────────
 *
 * The preview has one screen, so the patient's cash code is drawn on the nurse's and says whose screen it is.
 * It is shown the way the patient's app shows it — once — and forgotten the moment the nurse enters anything.
 * The ledger never had it to begin with: it keeps a salted digest, and this module keeps the code only until
 * that first entry.
 *
 * ── Module-level and in memory ────────────────────────────────────────────────────────────────
 *
 * As lib/care-visit.ts is, for the same reason: a visit that lived in a screen's state would be lost by walking
 * to the next one, and nothing in apps/web/src writes to the browser's storage. Nothing is sent anywhere. */

export const nurseWords = contract.cash.nurse;
export const deskWords = contract.cash.desk;
export const releaseReasons = contract.cash.releaseReasons;
export const codeLength = contract.cash.codeLength;

const preview = care.preview;
const nurse = { role: 'nurse', subjectRef: preview.clinicianRef };
/* The Control Tower's own subject, as apps/web/src/shells/StaffShell.tsx signs the desk in. */
const desk = { role: 'ops-desk', subjectRef: 'O-801' };
/* A code that is certainly not the one issued: every digit moved on by one. Used only to hold the desk's sample payments. */
const notThe = (code: string) => code.split('').map(d => String((Number(d) + 1) % 10)).join('');

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const changed = () => { nurseView = null; deskView = null; listeners.forEach(listener => listener()); };

/* ---- The nurse, at the door ----------------------------------------------------------------- */

export type NurseCashView = {
 /** What is owed, in rand, from the ledger's payable — never a price this module worked out. */
 amount: number;
 stateName: string;
 /** The code on the patient's simulated screen, until the nurse first enters anything. */
 patientCode: string | null;
 recorded: boolean;
 /** The ledger's refusal of the last entry, in the contract's words. */
 refusal: string | null;
};

let door: { money: Money; paymentRef: string; patientCode: string | null; billable: boolean; refusal: string | null } | null = null;
let nurseView: NurseCashView | null = null;

/* The preview visit's patient chose cash: its payable is opened at the catalogue's price and paid in cash, which
   leaves money owed and a code for the patient. */
function openDoor() {
 const money = createMoney({ simulation: true });
 const payableRef = `PB-${preview.appointmentRef}`;
 const payable = money.openVisitPayable({ payableRef, serviceId: preview.serviceId, subjectRef: preview.subjectRef, appointmentRef: preview.appointmentRef });
 const receipt = money.pay({ role: 'patient', subjectRef: preview.subjectRef }, { idempotencyKey: `${payableRef}:cash`, payableRef, method: 'cash-otp', amountCents: payable.amountCents });
 if (isRefusal(receipt)) throw new Error(`The preview visit's cash payment was refused: ${receipt.statement}`);
 return { money, paymentRef: receipt.paymentRef, patientCode: receipt.cashCode ?? null, billable: false, refusal: null };
}

/** Care said the visit was completed, so Money hears it is billable, once. Cash is recorded only after this. */
export function visitBillable() {
 const d = door ??= openDoor();
 if (d.billable) return;
 d.money.hear({ type: 'visit.billable', version: 1, payload: { appointmentRef: preview.appointmentRef, serviceId: preview.serviceId, clinicianRef: preview.clinicianRef } });
 d.billable = true;
 changed();
}

/** The nurse enters the code the patient gives her. The patient's screen forgets its code the moment she does. */
export function enterCashCode(code: string) {
 const d = door ??= openDoor();
 d.patientCode = null;
 const answer = d.money.enterCashCode(nurse, { paymentRef: d.paymentRef, code });
 d.refusal = isRefusal(answer) ? answer.statement : null;
 changed();
}

const readNurse = (): NurseCashView => {
 if (nurseView) return nurseView;
 const d = door ??= openDoor();
 const payment = d.money.payment(d.paymentRef)!;
 const state = stateOf(payment.stateCode);
 return nurseView = { amount: payment.amountCents / 100, stateName: state.name, patientCode: d.patientCode, recorded: payment.stateCode === 'succeeded', refusal: d.refusal };
};
export const useNurseCash = (): NurseCashView => useSyncExternalStore(subscribe, readNurse, readNurse);

/* ---- The desk ------------------------------------------------------------------------------- */

export type HeldRow = {
 paymentRef: string;
 serviceName: string;
 amount: number;
 nurseRef: string;
 /** Wrong codes the audit recorded before the hold, counted from its rows rather than kept beside them. */
 wrongCodes: number;
 held: boolean;
 released: { actorRef: string; at: string; reason: string } | null;
 refusal: string | null;
};

let deskLedger: { money: Money; rows: { paymentRef: string; serviceId: string; nurseRef: string }[]; refusals: Map<string, string> } | null = null;
let deskView: HeldRow[] | null = null;

/* Each sample in money.json's deskPreview is booked, paid in cash, billed, and given the wrong code by its nurse
   until the ledger holds it — so every hold on the panel is one the ledger made. The real codes are dropped here. */
function openDesk() {
 const money = createMoney({ simulation: true });
 const rows = contract.cash.deskPreview.map(sample => {
  const payableRef = `PB-${sample.appointmentRef}`;
  const payable = money.openVisitPayable({ payableRef, serviceId: sample.serviceId, subjectRef: sample.subjectRef, appointmentRef: sample.appointmentRef });
  const receipt = money.pay({ role: 'patient', subjectRef: sample.subjectRef }, { idempotencyKey: `${payableRef}:cash`, payableRef, method: 'cash-otp', amountCents: payable.amountCents });
  if (isRefusal(receipt)) throw new Error(`The desk preview's cash payment for ${sample.appointmentRef} was refused: ${receipt.statement}`);
  money.hear({ type: 'visit.billable', version: 1, payload: { appointmentRef: sample.appointmentRef, serviceId: sample.serviceId, clinicianRef: sample.clinicianRef } });
  const wrong = notThe(receipt.cashCode!);
  while (money.cashStanding(receipt.paymentRef)?.held === false) money.enterCashCode({ role: 'nurse', subjectRef: sample.clinicianRef }, { paymentRef: receipt.paymentRef, code: wrong });
  return { paymentRef: receipt.paymentRef, serviceId: sample.serviceId, nurseRef: sample.clinicianRef };
 });
 return { money, rows, refusals: new Map<string, string>() };
}

/** Release a held payment with one of money.json's reasons, or be refused in the route's words. */
export function releaseHeld(paymentRef: string, reasonCode: string) {
 const d = deskLedger ??= openDesk();
 const answer = d.money.releaseCashCode(desk, { paymentRef, reasonCode: reasonCode || undefined });
 if (isRefusal(answer)) d.refusals.set(paymentRef, answer.statement);
 else d.refusals.delete(paymentRef);
 changed();
}

const readDesk = (): HeldRow[] => {
 if (deskView) return deskView;
 const d = deskLedger ??= openDesk();
 return deskView = d.rows.map(row => {
  const audit = d.money.cashAuditFor(row.paymentRef);
  const release = [...audit].reverse().find(entry => entry.outcome === 'released');
  return {
   paymentRef: row.paymentRef, serviceName: serviceById(row.serviceId).name,
   amount: d.money.payment(row.paymentRef)!.amountCents / 100, nurseRef: row.nurseRef,
   wrongCodes: audit.filter(entry => entry.outcome === 'wrong' || entry.outcome === 'held').length,
   held: d.money.cashStanding(row.paymentRef)?.held === true,
   released: release ? { actorRef: release.actorRef, at: release.at, reason: releaseReasons.find(r => r.id === release.reasonCode)?.text ?? '' } : null,
   refusal: d.refusals.get(row.paymentRef) ?? null
  };
 });
};
export const useHeldCash = (): HeldRow[] => useSyncExternalStore(subscribe, readDesk, readDesk);
