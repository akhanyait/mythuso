import { useEffect, useRef, useState } from 'react';
import { useDecor } from '../../lib/motion';
import demo from '../../../../../packages/catalog/control-tower-province-demo.json' with { type: 'json' };
import './design-widgets.css';
import { RangeSlider, Switch } from './Fields';

/* The province outline is geographical; every connection is a labelled fictional scenario.
   Kept inside the portal chunk: this illustration must never weigh on the patient entry. The outline's
   fill and edge are design-widgets.css's roles; the gradient and the brand-ink stops it carried in the
   markup until 30 September 2026 were painted over by that sheet and are gone with the retired names. */
 const points = demo.rings.flat();
 const west = Math.min(...points.map(p=>p[0])), east=Math.max(...points.map(p=>p[0]));
 const south=Math.min(...points.map(p=>p[1])), north=Math.max(...points.map(p=>p[1]));
 const scale=Math.min(520/(east-west),520/(north-south));
 const xy=(p:number[])=>[310+(p[0]-(west+east)/2)*scale,290-(p[1]-(south+north)/2)*scale];
 const boundary=demo.rings.map(r=>r.map((p,i)=>`${i?'L':'M'}${xy(p).join(',')}`).join(' ')+'Z').join(' ');

export function ProvinceDemo() {
 const [selected, setSelected] = useState(demo.samples[0].id);
 const [reviewOnly, setReviewOnly] = useState(false);
 const [connections, setConnections] = useState(true);
 const [progress, setProgress] = useState(0);
 const [replaying, setReplaying] = useState(false);
 const progressRef = useRef(0);
 const { playing: decorPlaying, reduced } = useDecor();
 const updateProgress = (value: number) => { progressRef.current=value; setProgress(value); };
 useEffect(() => {
  if (!replaying || !decorPlaying || reduced) { setReplaying(false); return; }
  let frame=0;
  const initial=progressRef.current;
  const started=performance.now();
  const tick=(now:number)=>{
   const next=Math.min(100,initial+(now-started)/100);
   progressRef.current=next;setProgress(next);
   if(next<100) frame=requestAnimationFrame(tick); else setReplaying(false);
  };
  frame=requestAnimationFrame(tick);
  return ()=>cancelAnimationFrame(frame);
 },[replaying,decorPlaying,reduced]);
 const samples=demo.samples.filter(s=>!reviewOnly||s.status==='Review needed');
 const current=demo.samples.find(s=>s.id===selected)!;
 return <section className="pt-province" aria-labelledby="province-heading">
  <header><div><span className="pt-widget-kicker">PROVINCE WALKTHROUGH</span><h2 id="province-heading">Care, across Gauteng.</h2><p>{demo.disclosure}</p></div><span className="pt-province-badge">Demonstration</span></header>
  <div className="pt-province-layout"><div className="pt-province-map"><svg viewBox="0 0 620 580" role="img" aria-label="Full Gauteng boundary with fictional dispatch connections. The sample buttons provide details."><path d={boundary} strokeWidth="2"/><text x="305" y="120" className="pt-map-name">GAUTENG</text>{samples.map(s=>{const [x,y]=xy(s.from),[a,b]=xy(s.to),cx=(x+a)/2+42,cy=(y+b)/2,t=progress/100;return <g key={s.id} className={`pt-map-route is-${s.colour}${selected===s.id?' is-selected':''}`}><title>{s.place} to {s.destination}: {s.status}, fictional</title>{connections&&<><path d={`M${x},${y} Q${cx},${cy} ${a},${b}`} fill="none"/><circle cx={(1-t)**2*x+2*(1-t)*t*cx+t*t*a} cy={(1-t)**2*y+2*(1-t)*t*cy+t*t*b} r="6"/></>}<circle cx={x} cy={y} r="4"/><circle cx={a} cy={b} r="4"/><text x={x-12} y={y+24} textAnchor="end">{s.place}</text><text x={a+10} y={b-10}>{s.destination}</text></g>})}<text x="555" y="45" className="pt-map-name">N ↑</text></svg><p>City markers approximate · No location permission or live map service</p></div>
  <aside className="pt-province-queue"><h3>The next moves.</h3><div className="pt-map-filters" aria-label="Sample map filter"><button type="button" aria-pressed={!reviewOnly} onClick={()=>setReviewOnly(false)}>All samples</button><button type="button" aria-pressed={reviewOnly} onClick={()=>{setReviewOnly(true);setSelected(demo.samples.find(s=>s.status==='Review needed')!.id);}}>Needs review</button></div>{samples.map(s=><button type="button" key={s.id} className={`pt-map-sample is-${s.colour}`} aria-pressed={s.id===selected} onClick={()=>setSelected(s.id)}><span>{s.id} · {s.status}</span><strong>{s.place} → {s.destination}</strong><small>{s.label}</small></button>)}<div className="pt-map-toggle"><Switch label="Show sample connections" checked={connections} onChange={setConnections} stateText={connections?'Shown':'Hidden'}/></div></aside><aside className="pt-map-detail" role="status"><span className="pt-widget-kicker">SELECTED SAMPLE</span><h3>{current.place} → {current.destination}</h3><p>{current.detail}</p></aside></div>
  <div className="pt-map-playback"><button type="button" aria-pressed={replaying} disabled={!decorPlaying || reduced} onClick={()=>{if(progressRef.current>=100)updateProgress(0);setReplaying(!replaying);}}>{replaying?'Pause demo':'Play demo'}</button><label htmlFor="province-progress">Scenario progress</label><RangeSlider id="province-progress" tone="bare" label="Scenario progress" min={0} max={100} value={progress} valueText={`${Math.round(progress)}%`} onChange={value=>{setReplaying(false);updateProgress(value);}}/><output htmlFor="province-progress">{Math.round(progress)}%</output><button type="button" onClick={()=>{setReplaying(false);updateProgress(0);setSelected(demo.samples[0].id);setReviewOnly(false);setConnections(true);}}>Reset demo</button></div>
  {(!decorPlaying || reduced)&&<p className="pt-map-motion-note">Animated replay is paused by your motion preference. Use the scenario slider to explore each position.</p>}
  <footer><p>Boundary: <a href={demo.source.url} target="_blank" rel="noreferrer">{demo.source.label}</a>. No real visits, staff locations or dispatch actions.</p></footer>
 </section>;
}
