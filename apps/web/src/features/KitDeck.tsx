/* Thuso Kit's deck, its figures and its stylesheet, as one module that is only ever loaded on demand.
 *
 * Thuso Kit is the one screen here a patient opens as well as a nurse, and App.tsx imports it
 * statically, so every module and every stylesheet Kit imports is in the patient's entry. Measured on
 * the wire against the committed tree, the kit redesign put 4.1 kB gzipped onto what a patient on a
 * metered phone downloads before she has opened anything at all — the deck, its sheet, the vetting
 * console's styles that rode in with nurse-tools.css, and the words on the deck itself. Everything
 * here is behind the one dynamic import Kit makes, so a patient who never opens the kit pays for none
 * of it, and a nurse finds all of it already in the workspace chunk.
 *
 * Kit keeps what it hands over — the entries, the connection and when this device last wrote its
 * copy of the record — so the deck counts the same rows the sheet below it draws and cannot keep a
 * second list of its own. */
import { Cloud, CloudOff } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import type { Capture } from '../lib/capture';
import { ClinicalDeck, type DeckFigure } from './ClinicalDeck';
import './nurse-kit.css';

/* How long a reading has been sitting on this phone, short enough to set as a figure.
   `ageText` says the same thing in a sentence and is still what every row carries; a numeral needs
   the number and its unit apart, and inventing a second clock to get them would be a second place
   the age can be wrong. Both read the same timestamp and the same `Date.now()`. */
function heldFor(iso: string, now = Date.now()) {
 const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
 if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? 'min' : 'mins' };
 const hours = Math.round(minutes / 60);
 if (hours < 48) return { value: String(hours), unit: hours === 1 ? 'hour' : 'hours' };
 return { value: String(Math.round(hours / 24)), unit: 'days' };
}

export default function KitDeck({ entries, online, onToggle, localCopyAt }: {
 entries: readonly Capture[]; online: boolean; onToggle: () => void; localCopyAt: string;
}) {
 const waiting = entries.filter(e => e.state === 'captured' || e.state === 'queued' || e.state === 'sending');
 const stored = entries.filter(e => e.state === 'stored');
 const needsDecision = entries.filter(e => e.state === 'conflicted');
 const onDevice = waiting.length;
 /* Everything that has not reached the record, oldest first, measured in minutes. It is the queue
    on the sheet below, measured — nothing is added to it and nothing is left out of it — and each bar
    carries the reading it is, so "the oldest" names a reading rather than a length. */
 const waitingRows = waiting
  .map(e => ({ age: Date.now() - new Date(e.deviceAt).getTime(), label: `${e.value} ${e.unit}` }))
  .sort((a, b) => b.age - a.age);
 const oldest = waitingRows.length ? heldFor(new Date(Date.now() - waitingRows[0].age).toISOString()) : undefined;
 const copyAge = heldFor(localCopyAt);
 /* The deck's four figures, urgency first, which is the order the deck places them in: what is still
    on the phone leads on the glass; how long the oldest has waited and how old this device's copy is
    cross the panel's edge; what reached the record is the quiet half, a ring with one arc per reading
    on the sheet and the stored ones lit. */
 const figures: DeckFigure[] = [
  { label: 'Waiting to leave this phone', value: String(onDevice), chip: online ? 'A connection is available' : 'No connection', flagged: !online && onDevice > 0,
    shape: onDevice ? { kind: 'bars', values: waitingRows.map(row => Math.max(1, Math.round(row.age / 60_000))), labels: waitingRows.map(row => row.label),
                        label: `${onDevice} readings still on this device, the oldest of them ${oldest!.value} ${oldest!.unit} old` } : undefined },
  { label: 'The oldest of them has waited', value: oldest?.value ?? '—', unit: oldest?.unit, chip: oldest ? 'Nothing is retried behind your back' : 'Nothing is waiting', flagged: false },
  { label: 'Since this device wrote its copy of the record', value: copyAge.value, unit: copyAge.unit, chip: 'Served with its age, in words', flagged: false },
  { label: 'Readings that reached the record', value: String(stored.length), flagged: false,
    chip: needsDecision.length ? `${needsDecision.length} ${needsDecision.length === 1 ? 'needs' : 'need'} a decision` : `Of ${entries.length} on this device`,
    shape: { kind: 'ring', segments: entries.map(e => e.state === 'stored') } }
 ];

 return <>
 {/* The deck carries the only thing on this screen that is live — how much work is still on the
     phone, and whether there is a connection to send it over — with the capability's own sentence
     on it rather than under it. A screen whose first claim is that nothing is paired should not
     make a reader scroll past an instrument to find that out. */}
 <ClinicalDeck role="Thuso Kit" title="Thuso Kit" figures={figures}
  headline={['Connected capture,', { glyph: 'radio' }, 'and what it owes a reading.']}
  note="Where a reading came from, which instrument took it, whether that instrument is in calibration, and what becomes of work done in a house with no signal.">
  <NotConnected of="devices"/>
  {/* The connection's own sentence, beside the switch that changes it — a control and the thing it
      means are one statement or they are neither. */}
  <div className="c-deck-controls">
   <button type="button" className="c-pill" onClick={onToggle} aria-pressed={online}>
    {online ? <><Cloud size={16} aria-hidden="true"/>Connection: on</> : <><CloudOff size={16} aria-hidden="true"/>Connection: off</>}
   </button>
   <p>{online
    ? 'A connection is available, so the queue can be sent.'
    : 'No connection. A sealed reading goes nowhere, and the nurse has done everything she can do.'}</p>
  </div>
 </ClinicalDeck>
 </>;
}
