import { useState } from 'react';
import type { Refusal } from '../../../../packages/engines/src/medicines/domain/contract.ts';
import { fillHl7, hl7Laboratory, hl7Words } from '../lib/hl7-inbound';
import { receiveHl7Result } from '../lib/medicines';
import { Info } from 'lucide-react';
import { Button, MyThusoResultsIcon } from '../ui';
import './hl7-quarantine.css';

/* The HL7 v2 bridge's parts of the doctor's lab results (Wave 5): the preview sentence, the button that receives the
 * synthetic laboratory's result as an HL7 message, who sent a result that arrived that way and what kind, and that it is
 * not complete until she acknowledges it.
 *
 * WHY A FILE OF ITS OWN. features/Medicines.tsx is also the patient's collector dialog, which App.tsx imports lazily, and
 * anything it imports statically is a chunk the patient's first load names in its preload list. These parts, the HL7
 * contract and the parser arrive only when a doctor opens her results. Nothing here acknowledges a result or closes an
 * order: those are Medicines.tsx's buttons, asking lib/medicines.ts, as for every other result.
 *
 * ON THE IDENTITY (28 September 2026, wave 4c): the preview sentence is the handoff's info note with its
 * icon, who sent a result is set as a line of its own under the result, "not complete" is the warning ink
 * beside the words, and the receive button is the handoff's secondary button with the results icon —
 * receiving a result is a healthcare action the MyThuso family draws. Every word is the contract's.
 */

export function Hl7ResultsNotice() {
 return <p className="md-notice hl7-note" role="note"><Info aria-hidden="true" size={16}/><span>{hl7Words.results.preview}</span></p>;
}

export function Hl7ArrivedBy({ arrivedBy }: { arrivedBy: { readonly kind: string; readonly facility: string } }) {
 return <small className="hl7-arrived">{fillHl7(hl7Words.results.arrivedBy, arrivedBy)}</small>;
}

export function Hl7NotComplete() {
 return <p className="md-empty hl7-incomplete">{hl7Words.results.notComplete}</p>;
}

export function Hl7ReceiveButton({ labOrderRef, onAnswer }: { labOrderRef: string; onAnswer: (refusal: Refusal | null) => void }) {
 const [waiting, setWaiting] = useState(false);
 return <Button variant="secondary" loading={waiting} leadingIcon={<MyThusoResultsIcon aria-hidden="true"/>} onClick={() => {
  setWaiting(true);
  void receiveHl7Result(labOrderRef).then(refusal => { setWaiting(false); onAnswer(refusal); });
 }}>{fillHl7(hl7Words.results.receiveHl7, { facility: hl7Laboratory.label })}</Button>;
}
