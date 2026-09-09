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
type Props = { navigate: (page: string) => void };
export function HeroCarousel({ navigate }: Props) {
 const t = useT();
 const [index, setIndex] = useState(0);
 const [playing, setPlaying] = useState(true);
 const [paused, setPaused] = useState(false);
 const [layer, setLayer] = useState<Record<string, 'cutout' | 'photo' | 'art'>>({});
 const drag = useRef<number | null>(null);
 const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
 /* Pausing on hover is for a pointer that can hover. A touch screen has no hover state to leave, so
    the mouseenter a browser synthesises under a finger is a pause nothing ever undoes — tap where
    the banner happens to be and it stops rotating for the rest of the session, on the handsets this
    product is actually for. WCAG 2.2.2 is satisfied by the pause button and by focus, both of which
    a touch user has; hover is the one of the three that is a lie there. */
 const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
 const rotating = playing && !paused && !reduced;
 useEffect(() => {
  if (!rotating) return;
  const timer = setInterval(() => setIndex(i => (i + 1) % slides.length), ROTATE_MS);
  return () => clearInterval(timer);
 }, [rotating]);
 const go = (next: number) => setIndex((next + slides.length) % slides.length);
 return <section
  className="hero-carousel" aria-roledescription="carousel" aria-label="MyThuso highlights"
  onMouseEnter={canHover ? () => setPaused(true) : undefined} onMouseLeave={canHover ? () => setPaused(false) : undefined}
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
       src={shown === 'cutout' ? `/banners/${slide.photo}-cutout.webp` : shown === 'photo' ? `/banners/${slide.photo}.jpg` : slide.art}
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
