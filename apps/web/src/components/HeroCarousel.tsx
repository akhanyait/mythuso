import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Heart, House, Leaf, Pause, Play, ShieldCheck, Sparkles, Stethoscope, Users } from 'lucide-react';
import nurse from '../../../../packages/illustrations/nurse.svg';
import family from '../../../../packages/illustrations/family.svg';
import elder from '../../../../packages/illustrations/elder.svg';
import { useT } from '../lib/i18n';
const ROTATE_MS = 6500;
const slides = [
 { id: 'care', photo: 'care-that-comes-to-you', art: family, trust: [House, ShieldCheck, Users], target: 'Book a nurse' },
 { id: 'pass', photo: 'one-safe-place', art: elder, trust: [ShieldCheck, Users, Sparkles], target: 'Health Passport' },
 { id: 'nurse', photo: 'feel-better', art: nurse, trust: [ShieldCheck, Heart, Stethoscope], target: 'Book a nurse' }
] as const;
/* Decoration: soft drifting bubbles and two slow currents behind the whole top of the screen.
   aria-hidden, transform and opacity only, and stopped dead under prefers-reduced-motion. */
export function Texture() {
 return <svg className="hero-texture" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id="hero-current" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stopColor="#0e7c6b" stopOpacity="0"/><stop offset="50%" stopColor="#0e7c6b" stopOpacity=".22"/><stop offset="100%" stopColor="#0e7c6b" stopOpacity="0"/>
   </linearGradient>
  </defs>
  <g className="hero-currents">
   <path d="M-40 214C40 180 108 250 190 208s150-18 260-74" className="hero-line one"/>
   <path d="M-40 258C50 232 120 276 210 244s150 6 250-52" className="hero-line two"/>
   <path d="M-40 96C60 66 130 128 220 92s140-30 220-64" className="hero-line three"/>
  </g>
  <g className="hero-bubbles">
   {[[52, 232, 34], [118, 52, 20], [236, 248, 26], [318, 74, 44], [176, 156, 13], [372, 200, 17], [16, 104, 15], [268, 128, 11], [148, 274, 22], [352, 292, 15]].map(([cx, cy, r], i) =>
    <circle key={i} cx={cx} cy={cy} r={r} className={`hero-bubble b${i % 9}`}/>)}
   {[[86, 296, 8], [204, 306, 6], [292, 300, 10], [346, 292, 7]].map(([cx, cy, r], i) =>
    <circle key={`r${i}`} cx={cx} cy={cy} r={r} className={`hero-rising r${i}`}/>)}
  </g>
 </svg>;
}
type Props = { navigate: (page: string) => void };
export function HeroCarousel({ navigate }: Props) {
 const t = useT();
 const [index, setIndex] = useState(0);
 const [playing, setPlaying] = useState(true);
 const [paused, setPaused] = useState(false);
 const [layer, setLayer] = useState<Record<string, 'cutout' | 'photo' | 'art'>>({});
 const drag = useRef<number | null>(null);
 const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
 const rotating = playing && !paused && !reduced;
 useEffect(() => {
  if (!rotating) return;
  const timer = setInterval(() => setIndex(i => (i + 1) % slides.length), ROTATE_MS);
  return () => clearInterval(timer);
 }, [rotating]);
 const go = (next: number) => setIndex((next + slides.length) % slides.length);
 return <section
  className="hero-carousel" aria-roledescription="carousel" aria-label="MyThuso highlights"
  onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
  onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
  onPointerDown={e => { drag.current = e.clientX; }}
  onPointerUp={e => { if (drag.current !== null && Math.abs(e.clientX - drag.current) > 45) go(index + (e.clientX < drag.current ? 1 : -1)); drag.current = null; }}
 >
  <div className="hero-track" style={{ transform: `translateX(-${index * 100}%)` }}>
   {slides.map((slide, i) => {
    const key = `slide${i + 1}`;
    const shown = layer[slide.id] ?? 'cutout';
    return <article key={slide.id} className={`hero-slide tone-${i}`} aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} aria-hidden={i !== index} inert={i !== index}>
     <div className="hero-card">
      <div className="hero-slide-copy">
       <h1>{t(`${key}.title`).split('|').map((line, n) => <span key={line}>{n ? <br/> : null}{line}</span>)}</h1>
       <p>{t(`${key}.body`)}</p>
       <button className="primary" onClick={() => navigate(slide.target)} tabIndex={i === index ? undefined : -1}>{t(`${key}.cta`)}<ArrowRight size={17}/></button>
      </div>
      <ul className="hero-trust">
       {slide.trust.map((Icon, n) => <li key={n}><span><Icon size={16}/></span>{t(`${key}.trust${n + 1}`)}</li>)}
      </ul>
      <button className="hero-caption" onClick={() => navigate(slide.target)} tabIndex={i === index ? undefined : -1}>
       <span className="hero-caption-mark"><Leaf size={17}/></span>{t(`${key}.caption`)}<ChevronRight size={17}/>
      </button>
     </div>
     <div className="hero-figure">
      <img
       src={shown === 'cutout' ? `/banners/${slide.photo}-cutout.png` : shown === 'photo' ? `/banners/${slide.photo}.jpg` : slide.art}
       alt="" className={shown === 'photo' ? 'hero-photo' : 'hero-art'}
       onError={() => setLayer(l => ({ ...l, [slide.id]: shown === 'cutout' ? 'photo' : 'art' }))}/>
     </div>
    </article>;
   })}
  </div>
  <div className="hero-controls">
   <div className="hero-dots" role="group" aria-label="Choose a highlight">
    {slides.map((slide, i) => <button key={slide.id} className={i === index ? 'on' : ''} aria-current={i === index ? 'true' : undefined}
     aria-label={`Highlight ${i + 1} of ${slides.length}: ${t(`slide${i + 1}.title`).replace('|', ' ')}`} onClick={() => { setIndex(i); setPlaying(false); }}/>)}
   </div>
   {!reduced && <button className="hero-play" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause the highlights' : 'Play the highlights'}>
    {playing ? <Pause size={14}/> : <Play size={14}/>}
   </button>}
  </div>
 </section>;
}
