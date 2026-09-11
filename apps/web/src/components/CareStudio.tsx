import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Heart, Pause, Play, ShieldCheck, Sparkles, Stethoscope, Users } from 'lucide-react';

const chapters = [
 { label: 'For me', kicker: 'A LITTLE CARE GOES A LONG WAY', title: ['Feel good.', 'Live fully.'], detail: 'Your next chapter of feeling better starts at home. Find a little help that fits your everyday.', action: 'Explore care', target: 'Book a nurse', image: 'feel-better', icon: Stethoscope, note: 'Your space. Your pace.' },
 { label: 'For family', kicker: 'LOVE, EVEN FROM A DISTANCE', title: ['Close to heart.', 'Closer to care.'], detail: 'Bring your people into your circle. Arrange care for someone you love, while keeping their records private.', action: 'Meet your circle', target: 'My family', image: 'care-that-comes-to-you', icon: Users, note: 'A little help. A lot of love.' },
 { label: 'My records', kicker: 'YOUR STORY BELONGS TO YOU', title: ['Every chapter.', 'Connected.'], detail: 'Readings, results and visits, all in your Health Passport. A clearer picture, with you in control.', action: 'Open my passport', target: 'Health Passport', image: 'one-safe-place', icon: ShieldCheck, note: 'Your story. In your hands.' }
] as const;

export function CareStudio({ navigate }: { navigate: (target: string) => void }) {
 const [selected, setSelected] = useState(0);
 const [motion, setMotion] = useState(true);
 const [reduced, setReduced] = useState(false);
 const panel = useRef<HTMLElement>(null);
 const tabs = useRef<(HTMLButtonElement | null)[]>([]);
 useEffect(() => {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => setReduced(query.matches);
  update(); query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
 }, []);
 const chapter = chapters[selected];
 const moving = motion && !reduced;
 return <section ref={panel} className={`care-studio chapter-${selected}${moving ? ' is-moving' : ''}`} aria-label="Your care studio"
  onPointerMove={e => {
   if (!moving || e.pointerType !== 'mouse') return;
   const box = e.currentTarget.getBoundingClientRect();
   e.currentTarget.style.setProperty('--pointer-x', `${(e.clientX - box.left) / box.width * 100}%`);
   e.currentTarget.style.setProperty('--pointer-y', `${(e.clientY - box.top) / box.height * 100}%`);
  }}>
  <div className="studio-top"><span><Sparkles size={16}/>THE CARE STUDIO</span>
   <button className="studio-motion" aria-label={moving ? 'Pause decorative motion' : 'Enable decorative motion'} aria-pressed={moving} disabled={reduced} onClick={() => setMotion(v => !v)}>{moving ? <Pause size={15}/> : <Play size={15}/>}<span>{moving ? 'Motion on' : 'Motion off'}</span></button>
  </div>
  <div className="studio-tabs" role="tablist" aria-label="Choose your care focus">{chapters.map((item, index) => <button key={item.label} ref={el => { tabs.current[index] = el; }} role="tab" id={`care-tab-${index}`} aria-selected={selected === index} aria-controls="care-chapter" tabIndex={selected === index ? 0 : -1}
   onClick={() => setSelected(index)} onKeyDown={e => {
    const next = e.key === 'ArrowRight' ? (selected + 1) % 3 : e.key === 'ArrowLeft' ? (selected + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : null;
    if (next !== null) { e.preventDefault(); setSelected(next); tabs.current[next]?.focus(); }
   }}><item.icon size={15}/>{item.label}</button>)}</div>
  <div id="care-chapter" role="tabpanel" aria-labelledby={`care-tab-${selected}`} className="studio-chapter">
   <div key={selected} className="studio-copy">
    <p className="studio-kicker">{chapter.kicker}</p>
    <h2>{chapter.title[0]}<br/><em>{chapter.title[1]}</em></h2>
    <p className="studio-description">{chapter.detail}</p>
    <button className="studio-cta" onClick={() => navigate(chapter.target)}>{chapter.action}<span><ArrowUpRight size={21}/></span></button>
   </div>
   <div className="studio-art" aria-hidden="true">
    <div className="studio-orbit orbit-one"/><div className="studio-orbit orbit-two"/>
    <div className="studio-disc"><img key={chapter.image} src={`/banners/${chapter.image}-cutout.webp`} alt=""/></div>
    <span className="studio-star star-one">✳</span><span className="studio-star star-two">✧</span>
    <span className="studio-sticker"><Heart size={18}/>{chapter.note}</span>
    <span className="studio-art-label">HELP. HEALTH. HOME.</span>
   </div>
  </div>
  <div className="studio-bottom"><span><i/>A more human kind of healthcare</span><span>0{selected + 1} <b>/ 03</b></span></div>
 </section>;
}
