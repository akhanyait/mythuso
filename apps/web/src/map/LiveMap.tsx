import { Component, Suspense, lazy, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './map.css';
import { coverage, place, plot, radiusInBoxUnits, rendering, say, tiles, tilesDefaultFor, tilesOffered, tilesStartOn, zones, type Credit, type MapSurface } from '../lib/geography';
import type { LatLng } from '../../../../packages/geo/index.ts';
/* The map, drawn on real streets when the person looking has asked for them and from the
 * coordinates alone the rest of the time.
 *
 * maplibre-gl is not imported here, and that is the point. It is 1.8 MB and it was loading in the
 * staff bundle before a nurse could see her first visit of the day. A patient opens this app a few
 * times a month, usually on wifi; a nurse has it open all day, in the field, on a prepaid data
 * bundle she is paying for out of the visit fee, and every screen of her day except this one needs
 * no map at all. So ./TileMap is behind a dynamic import, fetched the first time a map is open with
 * streets on — which on her day is the moment she opens a visit, and not before — and in a patient's
 * session, where streets start off, never fetched unless she asks.
 *
 * The schematic is not a placeholder. It answers the same question, who is where, from the same
 * contract, and needs no network: a dispatch board that shows a grey rectangle when a provider goes
 * down has taught its controller to distrust the screen at the moment they most need to believe it.
 * It is what draws when streets are off, when they have been switched off for the whole build, and
 * when they were asked for and did not come.
 *
 * Where the switch starts is the surface's, and this file does not remember the answer. That is two
 * decisions. The first is that a tile request discloses something — the square of the city on
 * screen, the address that asked, the time — and a default nobody chose is not consent to disclose
 * it; so a patient's arrival map starts off, and the sentence saying so is rendered against the
 * switch, because the switch is where the choice is made. A staff surface starts on, since 29
 * September 2026 and at the founder's asking: a nurse and a controller asked for the map by opening
 * a workspace whose job is where people are, and the same sentence sits beside the same switch so
 * that off is one press away. The contract states both defaults (geography.json, tiles.
 * defaultBySurface) and a check holds the patient's to off. The second decision is that there is
 * nowhere honest to keep the answer on either surface: this application persists nothing in a
 * browser, and a preview that started remembering a patient's preferences would be the first thing
 * in it that did.
 *
 * Nothing about the caseload is sent anywhere either way. The tile server is asked for streets by
 * tile coordinate; the zones, the visits and the nurses are drawn on top of tiles that know nothing
 * about them. There is no geolocation call in this file and no permission is requested. */

const TileMap = lazy(() => import('./TileMap').then(m => ({ default: m.TileMap })));

/* The fourth way streets do not arrive, and the one that used to take the whole screen with it.
 *
 * The other three happen inside the map: the endpoint is down, the network went, the wifi answered
 * with a sign-in page. This one happens before there is a map at all — the 1.8 MB chunk itself never
 * finishes downloading, which on a mid-range handset holding one bar is not an edge case, it is
 * Tuesday. A rejected dynamic import throws in render, and React with no boundary above it unmounts
 * the tree: a controller pressed a button to see roads and lost the dispatch board.
 *
 * So it lands where the other three land. Errors are for reporting, not for blanking a screen a
 * person is working from, and the schematic below it needs nothing that could have failed. */
class TilesOrSchematic extends Component<{ onFailed: () => void; fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 componentDidCatch() { this.props.onFailed(); }
 render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export type MapMarker = {
 id: string;
 at: LatLng | null;
 /** Matches an id in geography.json's `marks`, which is what the key on screen is built from. */
 kind: 'nurse-free' | 'nurse-busy' | 'nurse-blocked' | 'visit-waiting' | 'visit-assigned';
 label: string;
 selected?: boolean;
 onSelect?: () => void;
};

type Props = {
 markers: MapMarker[];
 /** Read to a screen reader in place of the graphic. Composed by the caller, which knows the counts. */
 summary: string;
 height?: number;
 /* The straight line an estimate was measured along, drawn dashed and through everything in its
    way. It exists because "straight line over 5.4 km — not a road route" is a sentence a reader can
    skim past, and a line through the buildings is not: the picture and the caveat say the same
    thing. It is deliberately dashed and deliberately not a route — nothing here is drawn as though
    a road had been followed, which is the rule packages/geo/routing.ts holds the whole product to.

    Both renderings draw it now. It used to be the schematic's alone, which was a gap rather than a
    decision, and putting streets underneath closed it the hard way: a straight line on a schematic
    is obviously not a route, and the same line over real roads is exactly what a reader mistakes
    for one. */
 link?: { from: LatLng; to: LatLng } | null;
 /* Whose screen this is, which decides where the switch starts. A caller that does not say is
    treated as a patient's, because off is the default that asks nothing of anybody; a staff surface
    has to say so, which is the point. */
 surface?: MapSurface;
};

export function LiveMap({ markers, summary, height = 340, link = null, surface = 'patient' }: Props) {
 const startsOn = tilesStartOn(surface);
 const [wanted, setWanted] = useState(startsOn);
 /* Asked for and did not come: the endpoint down, the network gone, or a clinic's wifi answering
    with its own sign-in page. All three land back on the schematic and say which of them happened
    in the contract's words, and the switch goes back to off so that pressing it again is a retry
    rather than a dead control. */
 const [unreachable, setUnreachable] = useState(false);
 const giveUp = useCallback(() => { setUnreachable(true); setWanted(false); }, []);
 /* The credit's words come from the tile map, which is the only module that knows which provider's
    entry it drew with — the default's, or the one a token chose. Null until it says, and there is
    nothing on screen that needs crediting until then: the schematic asks nobody. */
 const [credit, setCredit] = useState<Credit | null>(null);
 const noteId = useId();
 const live = tilesOffered && wanted && !unreachable;

 const note = !tilesOffered ? rendering.withoutTiles.sentence
  : unreachable ? rendering.unreachable.sentence
   : live ? say(tiles.onSentence)
    : say(tiles.offSentence);
 /* Said only once the person has moved the switch away from the surface's own default: that is the
    choice that will be forgotten, and the sentence names which way it goes back. */
 const moved = tilesOffered && !unreachable && wanted !== (tilesDefaultFor(surface) === 'on');

 return (
  <div className="livemap">
   <div className="livemap-heading"><strong>Service area</strong><span>{live ? 'Street map' : 'Schematic'}</span></div>
   <div className="livemap-frame" style={{ height }}>
    {live
     ? <TilesOrSchematic onFailed={giveUp} fallback={<Schematic markers={markers} summary={summary} link={link}/>}>
        <Suspense fallback={<Schematic markers={markers} summary={summary} link={link}/>}>
         <TileMap markers={markers} summary={summary} link={link} onTilesFailed={giveUp} onDrawnBy={setCredit}/>
        </Suspense>
       </TilesOrSchematic>
     : <Schematic markers={markers} summary={summary} link={link}/>}
   </div>
   {/* The credit, and it is a licence condition rather than a courtesy: the ODbL asks that whoever
       draws this data names where it came from and lets a reader reach the licence. It is a strip
       under the map on an opaque ground, not a caption floating over the streets — contrast is a
       measurement and it cannot be measured against a photograph of a city. The words are the
       contract's, reported by the tile map from the entry it drew with, so replacing the provider
       replaces the credit in the same edit, and it cannot quietly stop appearing because a provider
       changed what its own tile metadata says. */}
   {live && credit && <p className="livemap-credit">
    <a href={credit.attributionUrl} target="_blank" rel="noreferrer noopener">{credit.attribution}</a>
   </p>}
   <div className="livemap-foot">
    {tilesOffered && (
     /* Described by the sentence rather than followed by it. The reason has to reach somebody
        reading with a screen reader before they press, and on a narrow screen the control has to
        come first visually or it is below the fold — aria-describedby is how both are true. */
     <button type="button" className={`livemap-tiles${wanted ? ' on' : ''}`} aria-pressed={wanted}
             aria-describedby={noteId}
             onClick={() => { setUnreachable(false); setWanted(!wanted); }}>
      {wanted ? tiles.hideLabel : tiles.showLabel}
     </button>
    )}
    <p className="livemap-note" id={noteId}>
     {note}
     {live && startsOn && <small>{tiles.startedOnSentence}</small>}
     {moved && <small>{startsOn ? tiles.notRememberedOn : tiles.notRemembered}</small>}
    </p>
   </div>
   {/* Only once streets are drawn, and that is the point of it. The schematic draws five suburbs
       and nothing else, so it cannot be read as a claim about anywhere. A real map of Johannesburg
       draws the whole metro whether or not anybody works in it, and a reader who has just been
       given roads will take the roads for the service area unless somebody says otherwise. */}
   {live && <p className="livemap-note">{coverage.sentence}</p>}
  </div>
 );
}

/* A nurse is a circle and a visit is a square. Colour is never the only difference between two
   marks on this board: a controller who cannot tell teal from amber reads the same map as everyone
   else. Selection is a control wherever it is offered, whether or not streets are drawn. */
/* The shape is 4.4 units of a 100-unit square, which on a 340-pixel board is fifteen pixels — and the
   shape was the whole of what a finger could land on. A pin that can be pressed carries a transparent
   circle under it whose radius is half the product's minimum target (tokens.json#targets.minimum, 44)
   in this square's units, measured from the drawn size exactly as the suburb labels are. The face
   stays small so the board stays readable; the target does not. Where two pins sit closer than that,
   the later one's circle wins the overlap, and both are still in the list beside the map and reachable
   by keyboard. */
const TARGET_PX = 44;
function Mark({ marker, x, y, hit }: { marker: MapMarker; x: number; y: number; hit: number }) {
 const shape = marker.kind.startsWith('visit')
  ? <rect x={x - 2.2} y={y - 2.2} width="4.4" height="4.4" rx="1.2"/>
  : <circle cx={x} cy={y} r="2.4"/>;
 if (!marker.onSelect) return <g><title>{marker.label}</title>{shape}</g>;
 return (
  <g role="button" tabIndex={0} aria-label={marker.label} aria-pressed={Boolean(marker.selected)}
     onClick={marker.onSelect}
     onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); marker.onSelect!(); } }}>
   <circle cx={x} cy={y} r={hit} fill="transparent" className="map-hit"/>
   {shape}
  </g>
 );
}

/* Suburb names on the schematic are the one piece of text in this product whose size nothing on the
   page controls. They live inside a 0–100 viewBox, so a font-size written in the stylesheet is
   measured in viewBox units and multiplied by whatever the square happens to be rendered at: four
   units read as 12.7px in a 318px box and 11.4px in a 285px one, and the type scale has a floor of
   13 for a reason. This measures the square and hands the stylesheet the number of units that comes
   to exactly thirteen pixels, whatever the viewport. It is the only way a label inside a scaled
   coordinate space can be held to a scale expressed in pixels. */
const FLOOR_PX = 13;

function useLabelUnits(svg: React.RefObject<SVGSVGElement | null>, onSide?: (side: number) => void) {
 useEffect(() => {
  const element = svg.current;
  if (!element) return;
  const measure = () => {
   const box = element.getBoundingClientRect();
   /* preserveAspectRatio="meet" on a square viewBox: the drawn square is the smaller side. */
   const side = Math.min(box.width, box.height);
   if (side > 0) { element.style.setProperty('--label-units', String((FLOOR_PX * 100) / side)); onSide?.(side); }
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  return () => observer.disconnect();
 }, [svg, onSide]);
}

function Schematic({ markers, summary, link }: { markers: MapMarker[]; summary: string; link: { from: LatLng; to: LatLng } | null }) {
 const svg = useRef<SVGSVGElement>(null);
 const [side, setSide] = useState(0);
 useLabelUnits(svg, setSide);
 /* Half a target, in the square's units; before the first measurement, the 340-pixel board's. */
 const hit = ((TARGET_PX / 2) * 100) / (side || 340);
 return (
  <div className="livemap-canvas schematic">
   <svg ref={svg} viewBox="0 0 100 100" role="img" aria-label={summary} preserveAspectRatio="xMidYMid meet">
    <rect width="100" height="100" className="map-ground"/>
    {[20, 40, 60, 80].map(n => (
     <g key={n}>
      <line x1="0" y1={n} x2="100" y2={n} className="map-grid"/>
      <line x1={n} y1="0" x2={n} y2="100" className="map-grid"/>
     </g>
    ))}
    {zones.map(z => <circle key={z.id} cx={plot(z.at).x} cy={plot(z.at).y} r={radiusInBoxUnits(z.radiusKm)} className="map-zone"/>)}
    {/* Under the pins, so a mark is never obscured by the line that was measured to it. */}
    {link && <line x1={plot(link.from).x} y1={plot(link.from).y} x2={plot(link.to).x} y2={plot(link.to).y} className="map-straight"/>}
    {markers.map(marker => {
     const placement = place(marker.at);
     if (!placement.drawn) return null;
     const p = plot(placement.at);
     /* A pin here is the same control it is on the tile map — a button, named, focusable, pressed
        or not. Whether the reader has asked for streets is a preference, and a map must not stop
        being usable with a keyboard because somebody left one switched off. */
     return (
      <g key={marker.id} className={`map-pin ${marker.kind}${marker.selected ? ' selected' : ''}`}>
       {marker.selected && <circle cx={p.x} cy={p.y} r="7" className="map-focus"/>}
       <Mark marker={marker} x={p.x} y={p.y} hit={hit}/>
      </g>
     );
    })}
    {zones.map(z => <text key={z.id} x={plot(z.at).x} y={plot(z.at).y - radiusInBoxUnits(z.radiusKm) + 4.4} className="map-label">{z.name}</text>)}
   </svg>
  </div>
 );
}
