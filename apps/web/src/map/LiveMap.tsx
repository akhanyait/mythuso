import { Suspense, lazy, useState } from 'react';
import './map.css';
import { coverage, place, plot, radiusInBoxUnits, rendering, tilesAvailable, zones } from '../lib/geography';
import type { LatLng } from '../../../../packages/geo/index.ts';
/* The map, drawn on real streets where a tile token exists and from the coordinates alone where it
 * does not.
 *
 * mapbox-gl is not imported here, and that is the point. It is two megabytes — 740 kB gzipped — and
 * it was loading in the staff bundle before a nurse could see her first visit of the day. A patient
 * opens this app a few times a month, usually on wifi; a nurse has it open all day, in the field, on
 * a prepaid data bundle she is paying for out of the visit fee, and every screen of her day except
 * this one needs no map at all. So ./TileMap is behind a dynamic import, fetched when a map is
 * actually drawn, and in a build with no token — this repository, and every test run — never
 * fetched at all.
 *
 * The schematic is not a placeholder. It answers the same question, who is where, from the same
 * contract, and needs no network: a dispatch board that shows a grey rectangle when a key expires
 * has taught its controller to distrust the screen at the moment they most need to believe it.
 *
 * Nothing about the caseload is sent anywhere. The tile server is asked for streets; the zones, the
 * visits and the nurses are drawn on top of tiles that know nothing about them. There is no
 * geolocation call in this file and no permission is requested. */

const TileMap = lazy(() => import('./TileMap').then(m => ({ default: m.TileMap })));

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

    Only the schematic draws it. A build with a tile token would show the two pins and no line, and
    that is a gap rather than a decision — TileMap needs the same three lines and this file cannot
    be the place they are added, because the tile map is behind the dynamic import that keeps
    mapbox-gl out of the patient's bundle. */
 link?: { from: LatLng; to: LatLng } | null;
};

export function LiveMap({ markers, summary, height = 340, link = null }: Props) {
 /* A token can be present and still not work — revoked, over quota, blocked by a captive portal on
    a clinic's wifi. All three fall back to the schematic rather than to nothing. */
 const [tilesFailed, setTilesFailed] = useState(false);
 const live = tilesAvailable && !tilesFailed;
 return (
  <div className="livemap" style={{ height }}>
   {live
    ? <Suspense fallback={<Schematic markers={markers} summary={summary} link={link}/>}>
       <TileMap markers={markers} summary={summary} onTilesFailed={() => setTilesFailed(true)}/>
      </Suspense>
    : <Schematic markers={markers} summary={summary} link={link}/>}
   <p className="livemap-note">{live ? coverage.sentence : rendering.withoutToken.sentence}</p>
  </div>
 );
}

/* A nurse is a circle and a visit is a square. Colour is never the only difference between two
   marks on this board: a controller who cannot tell teal from amber reads the same map as everyone
   else. Selection is a control wherever it is offered, whether or not the build has tiles. */
function Mark({ marker, x, y }: { marker: MapMarker; x: number; y: number }) {
 const shape = marker.kind.startsWith('visit')
  ? <rect x={x - 2.2} y={y - 2.2} width="4.4" height="4.4" rx="1.2"/>
  : <circle cx={x} cy={y} r="2.4"/>;
 if (!marker.onSelect) return <g><title>{marker.label}</title>{shape}</g>;
 return (
  <g role="button" tabIndex={0} aria-label={marker.label} aria-pressed={Boolean(marker.selected)}
     onClick={marker.onSelect}
     onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); marker.onSelect!(); } }}>
   {shape}
  </g>
 );
}

function Schematic({ markers, summary, link }: { markers: MapMarker[]; summary: string; link: { from: LatLng; to: LatLng } | null }) {
 return (
  <div className="livemap-canvas schematic">
   <svg viewBox="0 0 100 100" role="img" aria-label={summary} preserveAspectRatio="xMidYMid meet">
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
        or not. Whether the build has a tile token is an operations detail, and an operator must not
        find that the map stopped being usable with a keyboard because a key expired. */
     return (
      <g key={marker.id} className={`map-pin ${marker.kind}${marker.selected ? ' selected' : ''}`}>
       {marker.selected && <circle cx={p.x} cy={p.y} r="7" className="map-focus"/>}
       <Mark marker={marker} x={p.x} y={p.y}/>
      </g>
     );
    })}
    {zones.map(z => <text key={z.id} x={plot(z.at).x} y={plot(z.at).y - radiusInBoxUnits(z.radiusKm) + 4.4} className="map-label">{z.name}</text>)}
   </svg>
  </div>
 );
}
