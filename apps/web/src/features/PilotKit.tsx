import type { ReactElement } from 'react';
import kit from '../../../../packages/catalog/pilot-kit.json' with { type: 'json' };

/* The Gugulethu pilot kit, drawn in the MyThuso and GilbertOne look for the funder view.
 *
 * The devices are drawn rather than photographed because the photographs are a supplier's, and
 * because what Gilbert asked to see is the branding on them, which no supplier's picture has. Each
 * drawing follows the shape of the catalogue item it names, so a funder who opens the catalogue
 * recognises it.
 *
 * WHAT IT REFUSES TO DO. It shows no price: what the pilot spends on devices is the budget's to say,
 * in funder-brief.json, and a second figure here could disagree with it. It does not call a device
 * ordered or approved, because none is ordered and none is registered with SAHPRA. The numbers on
 * the screens are there to show where the marks sit; the card says they are made up, under the
 * DEMO DATA badge, because a reading on a medical device is the thing most easily taken as a result.
 * The watch's button reaches a person, and the card says it is not an ambulance. */

const NAVY = '#141B2D', CORAL = '#E5533F', PAPER = '#FAF8F6', SHELL = '#F1EEEA', EDGE = '#D9D3CD';

/* The two marks, once, as symbols every drawing uses. The G1 is the mark from the approved
 * mockups (packages/brand/fresh-look); the heart-pulse is public/brand/mythuso-mark.svg. */
function Marks() {
 return <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
  <defs>
   <symbol id="pk-g1" viewBox="0.75 6.75 86.5 86.5">
    <clipPath id="pk-g1c"><path d="M-20 -20H130V33H50.75V68.5L61.75 57.5V130H-20Z"/></clipPath>
    <path d="M81.25 50A37.25 37.25 0 1 1 65.895 19.864L56.197 33.213A20.75 20.75 0 1 0 64.75 50Z" fill={PAPER} clipPath="url(#pk-g1c)"/>
    <path d="M81.25 39L81.25 87.25L64.75 87.25L64.75 51.5L53.75 62.5L53.75 50L64.75 39Z" fill={CORAL}/>
    <rect x="28.7" y="45" width="7.6" height="13" rx="3.8" fill={PAPER}/><rect x="42.7" y="45" width="7.6" height="13" rx="3.8" fill={PAPER}/>
   </symbol>
   <symbol id="pk-mark" viewBox="0 0 100 100">
    <path d="M77.5 23.4A39 39 0 1 0 77.5 74.6" fill="none" stroke={NAVY} strokeWidth="10.5" strokeLinecap="round"/>
    <polyline points="8,51 28,51 37,34 49,68 61,26 69,51 92,51" fill="none" stroke={CORAL} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
   </symbol>
   <symbol id="pk-mark-rev" viewBox="0 0 100 100">
    <path d="M77.5 23.4A39 39 0 1 0 77.5 74.6" fill="none" stroke="#fff" strokeWidth="10.5" strokeLinecap="round"/>
    <polyline points="8,51 28,51 37,34 49,68 61,26 69,51 92,51" fill="none" stroke={CORAL} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
   </symbol>
  </defs>
 </svg>;
}

const Word = ({ x, y, size, light }: { x: number; y: number; size: number; light?: boolean }) =>
 <text x={x} y={y} fontFamily="Figtree, system-ui, sans-serif" fontWeight="800" fontSize={size} letterSpacing="-.02em">
  <tspan fill={light ? '#fff' : NAVY}>my</tspan><tspan fill={CORAL}>thuso</tspan>
 </text>;

const LCD = { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontWeight: 700 } as const;

function Handheld() {
 return <svg viewBox="0 0 200 240" role="img" aria-label="A nurse's handheld showing the MyThuso workspace">
  <rect x="52" y="8" width="96" height="224" rx="16" fill={NAVY}/>
  <rect x="47" y="70" width="6" height="34" rx="3" fill={CORAL}/><rect x="147" y="70" width="6" height="34" rx="3" fill={CORAL}/>
  <rect x="58" y="22" width="84" height="178" rx="6" fill={PAPER}/>
  <rect x="58" y="22" width="84" height="30" rx="6" fill={NAVY}/><rect x="58" y="40" width="84" height="12" fill={NAVY}/>
  <use href="#pk-mark-rev" x="63" y="27" width="20" height="20"/><Word x={86} y={42} size={12} light/>
  <text x="64" y="66" fontFamily="Figtree, system-ui, sans-serif" fontSize="8.5" fontWeight="700" fill={NAVY}>Today · Gugulethu</text>
  {[0, 1, 2].map(i => <g key={i} transform={`translate(64 ${74 + i * 30})`}>
   <rect width="72" height="25" rx="5" fill="#fff" stroke={EDGE}/>
   <text x="5" y="11" {...LCD} fontSize="7.5" fill="#C2412F">{['09:00', '10:30', '12:00'][i]}</text>
   <rect x="5" y="15" width={[44, 52, 38][i]} height="4" rx="2" fill="#C9CEDA"/>
  </g>)}
  <rect x="64" y="166" width="72" height="24" rx="12" fill={CORAL}/>
  <text x="100" y="181.5" textAnchor="middle" fontFamily="Figtree, system-ui, sans-serif" fontSize="8.5" fontWeight="800" fill="#fff">Start visit</text>
  <use href="#pk-g1" x="91" y="208" width="18" height="18"/>
 </svg>;
}

function BloodPressure() {
 return <svg viewBox="0 0 200 240" role="img" aria-label="A blood pressure monitor with the MyThuso mark">
  <path d="M100 170 C 100 200, 150 205, 170 225" fill="none" stroke="#B9BFCC" strokeWidth="5" strokeLinecap="round"/>
  <rect x="26" y="44" width="148" height="132" rx="22" fill="#fff" stroke={EDGE} strokeWidth="2"/>
  <rect x="40" y="58" width="120" height="74" rx="10" fill={NAVY}/>
  <text x="50" y="74" {...LCD} fontSize="7" fill="#9AA2B2">SYS</text>
  <text x="152" y="92" textAnchor="end" {...LCD} fontSize="26" fill="#fff">128</text>
  <text x="50" y="104" {...LCD} fontSize="7" fill="#9AA2B2">DIA</text>
  <text x="152" y="122" textAnchor="end" {...LCD} fontSize="20" fill="#fff">82</text>
  <use href="#pk-g1" x="48" y="108" width="16" height="16"/>
  <use href="#pk-mark" x="42" y="140" width="22" height="22"/><Word x={68} y={157} size={14}/>
  <circle cx="150" cy="152" r="13" fill={CORAL}/>
  <text x="150" y="155" textAnchor="middle" fontFamily="Figtree, system-ui, sans-serif" fontSize="7" fontWeight="800" fill="#fff">START</text>
 </svg>;
}

function Glucose() {
 return <svg viewBox="0 0 200 240" role="img" aria-label="A glucose meter with the MyThuso mark">
  <rect x="58" y="20" width="84" height="196" rx="30" fill="#fff" stroke={EDGE} strokeWidth="2"/>
  <rect x="68" y="36" width="64" height="76" rx="10" fill={NAVY}/>
  <text x="124" y="80" textAnchor="end" {...LCD} fontSize="28" fill="#fff">6.1</text>
  <text x="124" y="96" textAnchor="end" {...LCD} fontSize="7.5" fill="#9AA2B2">mmol/L</text>
  <use href="#pk-g1" x="74" y="88" width="14" height="14"/>
  <use href="#pk-mark" x="80" y="124" width="40" height="40"/>
  <Word x={100 - 24} y={180} size={12}/>
  <rect x="72" y="188" width="24" height="12" rx="6" fill={SHELL} stroke={EDGE}/><rect x="104" y="188" width="24" height="12" rx="6" fill={SHELL} stroke={EDGE}/>
  <rect x="90" y="212" width="20" height="14" rx="2" fill={CORAL}/>
 </svg>;
}

function Oximeter() {
 return <svg viewBox="0 0 200 240" role="img" aria-label="A wrist pulse oximeter with the GilbertOne mark">
  <rect x="20" y="96" width="160" height="40" rx="20" fill={NAVY}/>
  <rect x="58" y="78" width="84" height="76" rx="18" fill="#fff" stroke={EDGE} strokeWidth="2"/>
  <rect x="66" y="88" width="68" height="40" rx="8" fill={NAVY}/>
  <text x="128" y="114" textAnchor="end" {...LCD} fontSize="19" fill="#fff">97<tspan fontSize="10">%</tspan></text>
  <use href="#pk-g1" x="71" y="100" width="15" height="15"/>
  <use href="#pk-mark" x="70" y="132" width="16" height="16"/><Word x={89} y={145} size={10}/>
  <path d="M142 116 C 175 120, 178 170, 140 190" fill="none" stroke="#B9BFCC" strokeWidth="4" strokeLinecap="round"/>
  <rect x="112" y="180" width="34" height="26" rx="13" fill={CORAL}/>
  <rect x="120" y="188" width="18" height="10" rx="5" fill="#fff" opacity=".85"/>
 </svg>;
}

function Watch() {
 return <svg viewBox="0 0 200 240" role="img" aria-label="A patient SOS watch with the GilbertOne mark">
  <rect x="72" y="4" width="56" height="232" rx="14" fill={NAVY}/>
  <rect x="50" y="64" width="100" height="112" rx="28" fill="#2B3243" stroke="#0C111D" strokeWidth="3"/>
  <rect x="152" y="104" width="10" height="32" rx="4" fill={CORAL}/>
  <rect x="60" y="74" width="80" height="92" rx="20" fill="#0C111D"/>
  <use href="#pk-g1" x="86" y="82" width="28" height="28"/>
  <text x="100" y="128" textAnchor="middle" {...LCD} fontSize="16" fill="#fff">10:42</text>
  <rect x="72" y="138" width="56" height="20" rx="10" fill={CORAL}/>
  <text x="100" y="152" textAnchor="middle" fontFamily="Figtree, system-ui, sans-serif" fontSize="10" fontWeight="800" fill="#fff">SOS</text>
  <use href="#pk-mark-rev" x="90" y="196" width="20" height="20"/>
 </svg>;
}

const drawings: Record<string, () => ReactElement> = { handheld: Handheld, bp: BloodPressure, glucose: Glucose, oximeter: Oximeter, watch: Watch };

export default function PilotKit() {
 return <section className="fv-samples fv-kit" aria-labelledby="fv-kit-h">
  <Marks/>
  <div className="fv-samples-head">
   <h2 id="fv-kit-h">The pilot kit, in our colours</h2>
   <span className="fv-demo">DEMO DATA</span>
  </div>
  <p className="fv-lead">What a nurse would carry on the first pilot, in {kit.site}. {kit.partner}.</p>
  <p className="fv-disclaimer" role="note">{kit.status} {kit.readingsNote}</p>
  <ul className="fv-kit-list">
   {kit.devices.map(d => {
    const Draw = drawings[d.id];
    return <li key={d.id} className="fv-kit-item" data-device={d.id}>
     <div className="fv-kit-art">{Draw && <Draw/>}</div>
     <b>{d.name}</b>
     <span className="fv-kit-role">{d.role}</span>
     <span className="fv-source">Catalogue #{d.catalogue} · {d.source}</span>
    </li>;
   })}
  </ul>
 </section>;
}
