import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Heart, House, Pause, Play, ShieldCheck, Sparkles, Stethoscope, Users } from 'lucide-react';
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
/* The background texture is decorative: soft drifting bubbles and two slow currents. It is
   aria-hidden, uses only transform/opacity, and stops entirely under prefers-reduced-motion. */
function Texture() {
 return <svg className="hero-texture" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id="hero-current" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stopColor="#0e7c6b" stopOpacity="0"/><stop offset="50%" stopColor="#0e7c6b" stopOpacity=".22"/><stop offset="100%" stopColor="#0e7c6b" stopOpacity="0"/>
   </linearGradient>
  </defs>
  <g className="hero-currents">
   <path d="M-40 168C40 138 108 194 190 160s150-14 260-58" className="hero-line one"/>
   <path d="M-40 196C50 174 120 212 210 186s150 4 250-40" className="hero-line two"/>
  </g>
  <g className="hero-bubbles">
   {[[52, 168, 30, 0], [118, 44, 17, 1], [236, 178, 23, 2], [312, 62, 38, 3], [176, 116, 11, 4], [372, 150, 15, 5], [16, 78, 13, 6]].map(([cx, cy, r, i]) =>
    <circle key={i} cx={cx} cy={cy} r={r} className={`hero-bubble b${i}`}/>)}
  </g>
 </svg>;
}
type Props = { navigate: (page: string) => void };
export function HeroCarousel({ navigate }: Props) {
 const t = useT();
 const [index, setIndex] = useState(0);
 const [playing, setPlaying] = useState(true);
 const [paused, setPaused] = useState(false);
 // each slide prefers a cut-out that can break the banner's top edge, then a photograph
 // inside the banner, then the shared illustration. Whichever loads first wins.
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
     <div className="hero-plate"><Texture/></div>
     <div className="hero-slide-copy">
      <h1>{t(`${key}.title`).split('|').map((line, n) => <span key={line}>{n ? <br/> : null}{line}</span>)}</h1>
      <p>{t(`${key}.body`)}</p>
      <button className="primary" onClick={() => navigate(slide.target)} tabIndex={i === index ? undefined : -1}>{t(`${key}.cta`)}<ArrowRight size={17}/></button>
      <ul className="hero-trust">
       {slide.trust.map((Icon, n) => <li key={n}><span><Icon size={16}/></span>{t(`${key}.trust${n + 1}`)}</li>)}
      </ul>
     </div>
     {shown === 'photo'
      ? <div className="hero-photo-layer"><img src={`/banners/${slide.photo}.jpg`} alt="" className="hero-photo" onError={() => setLayer(l => ({ ...l, [slide.id]: 'art' }))}/></div>
      : <div className="hero-figure"><img
         src={shown === 'cutout' ? `/banners/${slide.photo}-cutout.png` : slide.art} alt="" className="hero-art"
         onError={() => setLayer(l => ({ ...l, [slide.id]: shown === 'cutout' ? 'photo' : 'art' }))}/></div>}
     {shown !== 'photo' && <span className="hero-caption">{t(`${key}.caption`)}</span>}
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
