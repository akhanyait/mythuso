import type { CSSProperties } from 'react';
import { Droplet, Gauge, Heart, Hexagon, Thermometer } from 'lucide-react';
import './vital-icons.css';

/* The icon at the head of each card on the doctor's Triage. Founder request, 2 October 2026: the heart
 * pulses and the lungs fill and empty.
 *
 * They move at the reading's own rate — a pulse of 118 beats 118 times a minute, a breathing rate of 22
 * breathes 22 times a minute — so the motion says the number rather than decorating it. That is also why
 * neither moves without a reading: a heart beating where nothing was measured is a heartbeat the page is
 * faking. The rate is the one recorded at the door, never a live feed, and the screen says so beside it.
 *
 * Only transform, so it costs the compositor and nothing else. It runs only where the vitals list says
 * data-motion="running", which the page sets from useDecor(): the shell's pause control and the reader's
 * reduced-motion setting both stop it, and vital-icons.css removes it again under reduced motion. */

/* Two lobes either side of the windpipe, each drawn to scale from its own top so it fills downwards and
   outwards the way a lung does. Lucide has no lungs, and a borrowed glyph would not split into lobes. */
function Lungs() {
 return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M12 3v8m0 0-2.4 2.2M12 11l2.4 2.2"/>
  <g className="vi-lobe vi-lobe-left"><path d="M9.6 7.2C7.2 7.6 4 10.8 3.4 15.6c-.4 3 .9 4.6 3 4.4 2.3-.2 3.6-1.4 3.6-4.4V9.4c0-1.2-.1-2.3-.4-2.2Z"/></g>
  <g className="vi-lobe vi-lobe-right"><path d="M14.4 7.2c2.4.4 5.6 3.6 6.2 8.4.4 3-.9 4.6-3 4.4-2.3-.2-3.6-1.4-3.6-4.4V9.4c0-1.2.1-2.3.4-2.2Z"/></g>
 </svg>;
}

const still = { systolic: Gauge, diastolic: Gauge, temperature: Thermometer, oxygen: Droplet, glucose: Hexagon } as const;

export function VitalIcon({ id, value }: { id: string; value: number | undefined }) {
 /* A period in seconds from a rate per minute. Nothing below one a minute, so a typing error cannot
    stop the drawing on a frame that looks like a held breath. */
 const period = value && value > 0 ? { '--vi-period': `${(60 / Math.max(value, 1)).toFixed(3)}s` } as CSSProperties : undefined;
 if (id === 'pulse') return <span className={`vi vi-heart${period ? ' is-moving' : ''}`} style={period}><Heart size={20} aria-hidden="true"/></span>;
 if (id === 'respiratory') return <span className={`vi vi-lungs${period ? ' is-moving' : ''}`} style={period}><Lungs/></span>;
 const Icon = still[id as keyof typeof still] ?? Gauge;
 return <span className="vi"><Icon size={20} aria-hidden="true"/></span>;
}
