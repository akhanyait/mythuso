import { useEffect, useRef, useState, type FormEvent } from 'react';
import { GilbertAvatar, useGilbertRig } from './GilbertAvatar';
import { AssistantGreeting } from '../components/AssistantGreeting';
import { MotionPause } from '../components/MotionPause';
import { useDecor } from '../lib/motion';
import { emergencyAnswer, identity, lines, say, silenceIsNotSafety } from '../lib/assistant';
import { publicAnswer, publicAssistant as copy, type PublicAnswer } from '../lib/public-assistant';
import './public-assistant.css';

type Turn = { asked: string; answer: PublicAnswer };
/* Website-only surface: no role parameter, patient visit, microphone, network or persistence.
   The native dialog supplies focus containment and Escape; closing preserves this page's chat. */
export default function PublicAssistant() {
 const [open, setOpen] = useState(false);
 const [draft, setDraft] = useState('');
 const [turns, setTurns] = useState<Turn[]>([]);
 const dialog = useRef<HTMLDialogElement>(null);
 const launcher = useRef<HTMLButtonElement>(null);
 const latest = useRef<HTMLLIElement>(null);
 const { reduced, playing } = useDecor();
 const rig = useGilbertRig({ reduced, paused: !playing });
 useEffect(() => {
  if (open) dialog.current?.showModal();
  else if (dialog.current?.open) { dialog.current.close(); launcher.current?.focus(); }
 }, [open]);
 useEffect(() => { latest.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);
 const ask = (asked: string) => {
  if (!asked.trim()) return;
  const answer = publicAnswer(asked);
  setTurns(previous => [...previous, { asked, answer }]);
  setDraft('');
  // The rig holds its safety cue until the visitor explicitly starts again.
  rig.play(answer.kind === 'emergency' ? 'A16' : answer.kind === 'refusal' ? 'A17' : 'A09');
 };
 const submit = (event: FormEvent) => { event.preventDefault(); ask(draft); };
 return <>
  <AssistantGreeting open={open} onOpen={() => setOpen(true)}/>
  <button ref={launcher} className="public-assistant-launcher" aria-label="Ask GilbertOne about MyThuso" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
   <GilbertAvatar pose={rig.pose} size={88} blend={rig.blend} friendly={turns.length === 0}/>
  </button>
  <dialog ref={dialog} className="public-assistant" aria-labelledby="public-assistant-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
   <div className="public-assistant-frame">
    <header>
     <GilbertAvatar pose={rig.pose} size={64} blend={rig.blend} friendly={turns.length === 0}/>
     <div><h2 id="public-assistant-title">{identity.name}</h2><p>{copy.label}</p><p>{identity.descriptorLine}</p></div>
     <button type="button" aria-label="Close GilbertOne" onClick={() => setOpen(false)}>×</button>
     <MotionPause/>
    </header>
    <div className="public-assistant-scroll">
     <p>{copy.welcome}</p><p className="public-assistant-note">{copy.privacy}</p>
     <div role="log" aria-label="MyThuso website conversation" aria-live="polite"><ol>
      {turns.map((turn, index) => <li key={index} ref={index === turns.length - 1 ? latest : undefined} data-outcome={turn.answer.kind}>
       <p className="public-assistant-question"><strong>You:</strong> {turn.asked}</p>
       <div className="public-assistant-answer"><strong>{identity.name}</strong>
        {turn.answer.kind === 'faq' ? <><p>{turn.answer.question.answer}</p><a href={turn.answer.question.href} onClick={() => setOpen(false)}>{turn.answer.question.linkLabel}</a></>
         : turn.answer.kind === 'refusal' ? <p>{copy.refusal}</p>
         : <><p>{emergencyAnswer.headline}</p><p>{emergencyAnswer.lead}</p><ul>{lines(emergencyAnswer.numbers).map(n => <li key={n.number}><strong>{n.number}</strong> — {n.name}</li>)}</ul><p>{emergencyAnswer.notAnAmbulance}</p></>}
       </div>
      </li>)}
     </ol></div>
     <nav aria-label="MyThuso questions">{copy.questions.map(q => <button type="button" key={q.id} onClick={() => ask(q.question)}>{q.question}</button>)}</nav>
     {turns.length > 0 && <button type="button" onClick={() => { setTurns([]); setDraft(''); rig.rest(); }}>Start again</button>}
    </div>
    <form onSubmit={submit}>
     <label htmlFor="public-assistant-input">{copy.inputLabel}</label>
     <div><input id="public-assistant-input" value={draft} onChange={e => setDraft(e.target.value)} placeholder={copy.inputHint} maxLength={500} autoComplete="off"/><button type="submit">Send</button></div>
     <p>{say(silenceIsNotSafety)}</p>
    </form>
   </div>
  </dialog>
 </>;
}
