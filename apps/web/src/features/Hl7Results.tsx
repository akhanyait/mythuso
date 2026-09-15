import { useState } from 'react';
import type { Refusal } from '../../../../packages/engines/src/medicines/domain/contract.ts';
import { fillHl7, hl7Laboratory, hl7Words } from '../lib/hl7-inbound';
import { receiveHl7Result } from '../lib/medicines';

/* The HL7 v2 bridge's parts of the doctor's lab results (Wave 5): the preview sentence, the button that receives the
 * synthetic laboratory's result as an HL7 message, who sent a result that arrived that way and what kind, and that it is
 * not complete until she acknowledges it.
 *
 * WHY A FILE OF ITS OWN. features/Medicines.tsx is also the patient's collector dialog, which App.tsx imports lazily, and
 * anything it imports statically is a chunk the patient's first load names in its preload list. These parts, the HL7
 * contract and the parser arrive only when a doctor opens her results. Nothing here acknowledges a result or closes an
 * order: those are Medicines.tsx's buttons, asking lib/medicines.ts, as for every other result.
 */

export function Hl7ResultsNotice() {
 return <p className="md-notice" role="note">{hl7Words.results.preview}</p>;
}

export function Hl7ArrivedBy({ arrivedBy }: { arrivedBy: { readonly kind: string; readonly facility: string } }) {
 return <small>{fillHl7(hl7Words.results.arrivedBy, arrivedBy)}</small>;
}

export function Hl7NotComplete() {
 return <p className="md-empty">{hl7Words.results.notComplete}</p>;
}

export function Hl7ReceiveButton({ labOrderRef, onAnswer }: { labOrderRef: string; onAnswer: (refusal: Refusal | null) => void }) {
 const [waiting, setWaiting] = useState(false);
 return <button className="secondary" disabled={waiting} onClick={() => {
  setWaiting(true);
  void receiveHl7Result(labOrderRef).then(refusal => { setWaiting(false); onAnswer(refusal); });
 }}>{fillHl7(hl7Words.results.receiveHl7, { facility: hl7Laboratory.label })}</button>;
}
