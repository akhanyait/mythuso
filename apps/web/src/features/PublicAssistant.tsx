import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { GilbertAvatar, GilbertOneLogo, growFrom, useGilbertRig } from './GilbertAvatar';
import { AssistantGreeting } from '../components/AssistantGreeting';
import { MotionPause } from '../components/MotionPause';
import { Button } from '../ui/Button';
import { useDecor } from '../lib/motion';
import { affect, conversation, emergencyAnswer, identity, lines, screens, silenceIsNotSafety } from '../lib/assistant';
import { crisisLines, showsCrisisLines } from '../lib/crisis-lines';
import { publicAnswer, publicAssistant as copy, type PublicAnswer } from '../lib/public-assistant';
import './public-assistant.css';

/* The signed-out sheet's emergency footer, with its numbers as tap-to-call links. The sentence is the
   contract's silenceIsNotSafety and the numbers come from sos.json by id through lines() — never typed
   here — so the strip says exactly what the panel says, and a thumb can dial straight from it. */
function EmergencyFooter() {
 const numbers = lines(['ambulance', 'mobile']);
 const pattern = new RegExp(`(${numbers.map((entry) => entry.number).join('|')})`, 'g');
 return <p className="public-assistant-emergency">
  {silenceIsNotSafety.split(pattern).map((part, index) => {
   const match = numbers.find((entry) => entry.number === part);
   return match ? <a key={index} href={`tel:${match.number}`}>{match.number}</a> : part;
  })}
 </p>;
}

type Turn = { asked: string; answer: PublicAnswer };

/* The face each public answer wears is the contract's, read from affect.answers and never chosen
   here: the emergency holds the safety cue, a refusal wears the refusal's. A website answer has no
   entry in affect.answers — the face section maps the panel's answer kinds, and nobody has decided
   one for the guide's — so it plays no cue at all rather than a gesture picked by this component.
   Until 28 September 2026 it played A09, the nod the contract's notWired list refuses for every
   answer because a nod can read as agreement. */
const cueFor = (answer: PublicAnswer) =>
 answer.kind === 'emergency' ? affect.answers.emergency.cue
  : answer.kind === 'refusal' ? affect.answers.refusal.cue
  : null;
/* Website-only surface: no role parameter, patient visit, microphone, network or persistence.
   The native dialog supplies focus containment and Escape; closing preserves this page's chat.

   The landing page holds its motion to a budget (tests/motion.spec.ts: the carousel's clock and the
   two hero drifts, nothing else at rest), so the robot on the launcher is still while the sheet is
   closed — no blink, no idle drift, no transition waiting to fire — and moves only once somebody has
   opened him. The sheet grows out of him and shrinks back into him, as the patient's panel does. */
export default function PublicAssistant() {
 const [open, setOpen] = useState(false);
 const [draft, setDraft] = useState('');
 const [turns, setTurns] = useState<Turn[]>([]);
 const dialog = useRef<HTMLDialogElement>(null);
 const launcher = useRef<HTMLButtonElement>(null);
 const latest = useRef<HTMLLIElement>(null);
 const { reduced, playing } = useDecor();
 const rig = useGilbertRig({ reduced, paused: !playing || !open });
 const entrance = useRef<Animation | null>(null);
 /* The one answer that has just landed, and the only one that rises. */
 const [arrived, setArrived] = useState<number | null>(null);
 useEffect(() => {
  const sheet = dialog.current;
  if (!sheet) return;
  if (open && !sheet.open) { sheet.showModal(); entrance.current = growFrom(launcher.current, sheet, reduced); }
  else if (!open && sheet.open) { entrance.current?.cancel(); sheet.close(); launcher.current?.focus(); setArrived(null); }
 }, [open]);
 useEffect(() => { latest.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);
 const ask = (asked: string) => {
  if (!asked.trim()) return;
  const answer = publicAnswer(asked);
  setTurns(previous => [...previous, { asked, answer }]);
  setArrived(turns.length);
  setDraft('');
  // The rig holds its safety cue until the visitor explicitly starts again.
  const cue = cueFor(answer);
  if (cue) rig.play(cue);
 };
 const submit = (event: FormEvent) => { event.preventDefault(); ask(draft); };
 return <>
  <AssistantGreeting open={open} onOpen={() => setOpen(true)}/>
  <button ref={launcher} className="public-assistant-launcher" aria-label="Ask GilbertOne about MyThuso" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
   <GilbertAvatar pose={rig.pose} size={104} blend={rig.blend} friendly={turns.length === 0}/>
  </button>
  <dialog ref={dialog} className="public-assistant" aria-labelledby="public-assistant-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
   <div className="public-assistant-frame">
    {/* The head is the patient panel's arrangement: the official logo as the heading — its alt is the
        dialog's name — level with the controls, and beneath it the rig beside the guide's label and the
        descriptor, which must stand wherever the name does. */}
    <header>
     <div className="public-assistant-bar">
      <h2 id="public-assistant-title"><GilbertOneLogo width={112} alt={identity.name}/></h2>
      <div className="public-assistant-controls">
       <MotionPause/>
       <Button variant="secondary" size="icon" className="public-assistant-close" aria-label="Close GilbertOne" onClick={() => setOpen(false)}><X aria-hidden="true"/></Button>
      </div>
     </div>
     <div className="public-assistant-caption">
      <GilbertAvatar pose={rig.pose} size={56} blend={rig.blend} friendly={turns.length === 0}/>
      <div className="public-assistant-titles"><p>{copy.label}</p><p>{identity.descriptorLine}</p></div>
     </div>
    </header>
    <div className="public-assistant-scroll">
     <div className="public-assistant-greeting"><p>{copy.welcome}</p><p className="public-assistant-note">{copy.privacy}</p></div>
     <div role="log" aria-label="MyThuso website conversation" aria-live="polite"><ol>
      {turns.map((turn, index) => <li key={index} ref={index === turns.length - 1 ? latest : undefined} data-outcome={turn.answer.kind} data-arrived={index === arrived || undefined}>
       <p className="public-assistant-question"><strong>You:</strong> {turn.asked}</p>
       <div className="public-assistant-answer"><strong>{identity.name}</strong>
        {turn.answer.kind === 'faq' ? <><p>{turn.answer.question.answer}</p><a href={turn.answer.question.href} onClick={() => setOpen(false)}>{turn.answer.question.linkLabel}</a></>
         : turn.answer.kind === 'refusal' ? <p>{copy.refusal}</p>
         : <><p>{emergencyAnswer.headline}</p><p>{emergencyAnswer.lead}</p><ul>{lines(emergencyAnswer.numbers).map(n => <li key={n.number}><strong>{n.number}</strong> — {n.name}</li>)}</ul><p>{emergencyAnswer.notAnAmbulance}</p>{showsCrisisLines(turn.answer.groups) && <div className="public-assistant-crisis"><p>{crisisLines.heading}</p><ul>{crisisLines.lines.map(l => <li key={l.id}><strong>{l.number}</strong> — {l.name}</li>)}</ul></div>}</>}
       </div>
      </li>)}
     </ol></div>
     <p className="public-assistant-quick">{screens.publicSheet.quickHeading}</p>
     <nav aria-label="MyThuso questions">{copy.questions.map(q => <Button variant="secondary" key={q.id} onClick={() => ask(q.question)}>{q.question}</Button>)}</nav>
     {turns.length > 0 && <Button variant="ghost" className="public-assistant-again" onClick={() => { setTurns([]); setDraft(''); setArrived(null); rig.rest(); }}>{conversation.startAgainLabel}</Button>}
    </div>
    <form onSubmit={submit}>
     <label htmlFor="public-assistant-input">{copy.inputLabel}</label>
     <div><input id="public-assistant-input" value={draft} onChange={e => setDraft(e.target.value)} placeholder={copy.inputHint} maxLength={500} autoComplete="off"/><Button type="submit" className="public-assistant-send">{conversation.sendLabel}</Button></div>
     <EmergencyFooter/>
    </form>
   </div>
  </dialog>
 </>;
}
