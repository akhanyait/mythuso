import { PenLine, Radio, Sigma, Speech, Wrench } from 'lucide-react';
import { calibrationCaveat, calibrationState, deviceById, instrumentBySerial, provenanceById, provenanceWord, type ProvenanceId, type Source } from '../lib/capture';
export type { Source } from '../lib/capture';

/* Four origins, four marks, one size. This is the part of the contract that is easiest to get
   wrong in a stylesheet rather than in a decision: the obvious design is a solid badge for the
   device reading and a faded one for everything else, and that design says a manual blood pressure
   is a device reading that failed. The contract says the opposite in as many words — “It is not
   weaker than a device reading — a manual blood pressure is a clinical skill — but it is a
   different fact and the record says which.”

   So the four differ by icon, by word and by the fact each of them attaches, and by nothing else.
   Same height, same weight, same contrast, no tick and no warning triangle. What a reader tells
   apart at a glance is which of the four it is, never which of the four is better. The only tone in
   this file that means “be careful” belongs to a calibration date, and it sits on the instrument
   rather than on the origin — because a nurse has to be able to see that this is a device reading
   *and* that the instrument is overdue, and one amber badge for both loses the first of those. */

const icons = { device: Radio, manual: PenLine, 'patient-reported': Speech, derived: Sigma };

/* The fact each origin carries. A device reading without its instrument, or a calculated one
   without its inputs, is the same failure as a reading with no origin at all. */
export function sourceDetail(source: Source): string {
 if (source.provenance === 'device') {
  const instrument = source.serial ? instrumentBySerial(source.serial) : undefined;
  const name = instrument ? deviceById(instrument.deviceId)?.name : undefined;
  return [name, source.serial].filter(Boolean).join(' · ') || 'Paired instrument';
 }
 if (source.provenance === 'manual') return source.by ?? 'Typed by a clinician';
 if (source.provenance === 'patient-reported') return source.saidBy ?? 'In the patient’s words';
 return source.inputs?.length ? `from ${source.inputs.join(' and ')}` : 'inputs unknown — not a value';
}

export function ProvenanceTag({ source, detail = true }: { source: Source; detail?: boolean }) {
 const Icon = icons[source.provenance];
 return <span className={`prov prov-${source.provenance}`}>
  <Icon size={12} aria-hidden="true"/>{provenanceWord[source.provenance]}
  {detail && <em>{sourceDetail(source)}</em>}
 </span>;
}

/* Out of calibration is a mark on the reading, never a refusal of it. */
export function CalibrationTag({ source }: { source?: Source }) {
 const state = source && calibrationState(source);
 if (!state || state === 'in-date') return null;
 return <span className={`calib calib-${state}`}>
  <Wrench size={12} aria-hidden="true"/>{state === 'overdue' ? 'Calibration overdue' : 'Calibration due'}
 </span>;
}

/* The caveat in full, for the places with room for a sentence: the moment of capture, the sign-off
   review, the consultation record and the queue. A reading taken in this session can say how many
   days over the instrument was; one read out of a fixture can only say that it was over, because
   asking today's arithmetic about last month's reading would answer the wrong question. */
export function CalibrationCaveat({ source }: { source?: Source }) {
 if (!source) return null;
 const state = calibrationState(source);
 if (!state || state === 'in-date') return null;
 const instrument = source.serial ? instrumentBySerial(source.serial) : undefined;
 const text = instrument && source.calibration ? calibrationCaveat(instrument, source.calibration)
  : state === 'overdue'
   ? 'The instrument that took this reading was past its calibration date at the time. The reading was taken, kept and filed — and it is filed saying so, because a number without the caveat is the only thing worse than no number.'
   : 'The instrument that took this reading was inside its calibration window and close to the end of it.';
 return <p className={`helper calib-line ${state}`} role="status"><Wrench size={13}/><span>{text}</span></p>;
}

/* The four side by side, with the contract's own trust sentences under them. It earns its place on
   the kit surface and in a design review, because “these two are different and neither is lesser”
   is a claim best checked by looking at them together. */
export function ProvenanceLegend() {
 return <ul className="prov-legend">
  {(['device', 'manual', 'patient-reported', 'derived'] as ProvenanceId[]).map(id => {
   const spec = provenanceById(id);
   return <li key={id}>
    <ProvenanceTag source={{ provenance: id }} detail={false}/>
    <strong>{spec.name}</strong>
    <small>{spec.detail}</small>
    <em>{spec.trust}</em>
   </li>;
  })}
 </ul>;
}
