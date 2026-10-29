import { Bluetooth, Cloud, HeartPulse, Smartphone, Stethoscope, UserRound } from 'lucide-react';
import path from '../../../../packages/catalog/reading-path.json' with { type: 'json' };
import './reading-path.css';

/* The v3 pack's IoT connectivity flow, as an explainer on Connected devices: the five places a reading would pass
 * through, in order, each with what happens there, from packages/catalog/reading-path.json.
 *
 * AN EXPLAINER, NOT A STATUS. The pack draws packets travelling the path and live dots on every node. Here the path
 * is drawn and nothing travels it, because nothing does: no device is paired, nothing relays and nobody is notified.
 * The contract's not-connected sentence sits under the path, where a reader looking for a status looks. The pack's
 * "Pair a device" tile is here as its refusal, not as a Connect button that pairs nothing. */
const icons = { device: HeartPulse, phone: Smartphone, cloud: Cloud, nurse: Stethoscope, doctor: UserRound } as const;

export function ReadingPath() {
 return <section className="rp" aria-labelledby="rp-title">
  <h2 id="rp-title">{path.title}</h2>
  <p className="rp-lead">{path.lead}</p>
  <ol className="rp-steps">{path.steps.map(step => {
   const Icon = icons[step.id as keyof typeof icons];
   return <li className="rp-step" key={step.id} data-step={step.id}>
    <span className="rp-node" aria-hidden="true"><Icon size={20} strokeWidth={1.8}/></span>
    <span className="rp-words"><strong>{step.name}</strong><small>{step.detail}</small></span>
   </li>;
  })}</ol>
  <p className="rp-note" role="note">{path.notConnected}</p>
  <div className="rp-pair">
   <span className="rp-node rp-node--off" aria-hidden="true"><Bluetooth size={20} strokeWidth={1.8}/></span>
   <span className="rp-words"><strong>{path.pairing.title}</strong><small>{path.pairing.refusal}</small></span>
  </div>
 </section>;
}
