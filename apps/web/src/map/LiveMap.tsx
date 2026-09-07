import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './map.css';
import { coverage, mapboxToken, mapWindow, place, plot, radiusInBoxUnits, rendering, tilesAvailable,
 view, zones } from '../lib/geography';
import type { LatLng } from '../../../../packages/geo/index.ts';
/* The map, drawn on real streets.
 *
 * What was here before was a 100x100 SVG square with circles on it. The coordinates behind it were
 * real Johannesburg and always had been — packages/geo has been doing the projection for months —
 * but a controller looking at the board could not tell Soweto from Randburg, because neither of
 * them had a road in it. This renders the same numbers on the same city.
 *
 * Two renderings, one set of coordinates. With a token the base map is Mapbox GL; without one it is
 * the schematic, and the schematic is not a placeholder — it answers the same question, who is
 * where, from the same contract, and needs no network at all. A dispatch board that shows a grey
 * rectangle when a key expires has taught its controller to distrust the screen at the moment they
 * most need to believe it.
 *
 * Nothing about the caseload is sent anywhere. The tile server is asked for streets; the zones, the
 * visits and the nurses are drawn by this application on top of tiles that know nothing about them.
 * There is no geolocation call in this file and no permission is requested. */

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
};

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* The palette comes from the same generated tokens as everything else, read at runtime rather than
   restated here, so a map cannot be the one surface that kept the old colours. */
const paint = () => ({
 indigo: cssVar('--indigo') || '#1e3a8a',
 indigoDeep: cssVar('--indigo-deep') || '#172f6f',
 teal: cssVar('--teal') || '#14b8a6',
 tealInk: cssVar('--teal-ink') || '#0f766e',
 mango: cssVar('--mango') || '#ffb347',
 danger: cssVar('--danger') || '#b42318',
 faint: cssVar('--faint') || '#5d6b80',
 canvas: cssVar('--canvas') || '#f1f5f9',
 surface: cssVar('--surface') || '#ffffff',
 line: cssVar('--line') || '#e2e8f0'
});

/** A circle of `radiusKm` around a point, as a GeoJSON polygon. Mapbox will happily scale a circle
    by pixels, which is the wrong unit: a service zone is three kilometres wide at every zoom. */
function circle(centre: LatLng, radiusKm: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
 const dLat = radiusKm / 110.574;
 const dLng = radiusKm / (111.32 * Math.cos((centre.lat * Math.PI) / 180));
 const ring: GeoJSON.Position[] = [];
 for (let i = 0; i <= steps; i++) {
  const theta = (i / steps) * 2 * Math.PI;
  ring.push([centre.lng + dLng * Math.cos(theta), centre.lat + dLat * Math.sin(theta)]);
 }
 return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

const markerColour = (kind: MapMarker['kind'], c: ReturnType<typeof paint>) =>
 kind === 'nurse-free' ? c.tealInk
  : kind === 'nurse-busy' ? c.faint
  : kind === 'nurse-blocked' ? c.danger
  : kind === 'visit-assigned' ? c.indigo
  : c.mango;

export function LiveMap({ markers, summary, height = 340 }: Props) {
 const host = useRef<HTMLDivElement>(null);
 const map = useRef<mapboxgl.Map | null>(null);
 const pins = useRef<mapboxgl.Marker[]>([]);
 /* A token can be present and still not work — revoked, over quota, blocked by a captive portal on
    a clinic's wifi. The schematic is the answer to all three, so a tile error falls back to it
    rather than leaving a controller looking at nothing. */
 const [tilesFailed, setTilesFailed] = useState(false);
 const live = tilesAvailable && !tilesFailed;

 useEffect(() => {
  if (!live || !host.current || map.current) return;
  mapboxgl.accessToken = mapboxToken;
  const c = paint();
  const instance = new mapboxgl.Map({
   container: host.current,
   style: rendering.styleUrl,
   center: [mapWindow.centre.lng, mapWindow.centre.lat],
   zoom: view.zoom,
   minZoom: view.minZoom,
   /* Fifteen is a privacy limit, not a performance one: above it a reader can pick out one house,
      and no screen in this product has a reason to. */
   maxZoom: view.maxZoom,
   attributionControl: true,
   /* Motion is the reader's to refuse, and a map that animates its own camera is motion. */
   fadeDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300
  });
  map.current = instance;
  instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
  instance.on('error', event => { if (String(event.error?.message ?? '').match(/token|401|403/i)) setTilesFailed(true); });

  instance.on('load', () => {
   /* A dispatch board is not a street directory. Every restaurant and filling station the base map
      wants to name is one more thing between a controller and the visit that has been waiting fifty
      minutes. Suburb names, roads and water stay; the rest goes. */
   for (const layer of rendering.suppressedLayers) {
    if (instance.getLayer(layer)) instance.setLayoutProperty(layer, 'visibility', 'none');
   }
   instance.addSource('zones', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: zones.map(z => ({ ...circle(z.at, z.radiusKm), properties: { name: z.name } })) }
   });
   instance.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones', paint: { 'fill-color': c.teal, 'fill-opacity': 0.14 } });
   instance.addLayer({ id: 'zone-edge', type: 'line', source: 'zones', paint: { 'line-color': c.tealInk, 'line-width': 1.5, 'line-opacity': 0.55 } });
   instance.addLayer({
    id: 'zone-name', type: 'symbol', source: 'zones',
    layout: { 'text-field': ['get', 'name'], 'text-size': 13, 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-offset': [0, -1.4] },
    paint: { 'text-color': c.indigoDeep, 'text-halo-color': c.surface, 'text-halo-width': 1.6 }
   });
  });

  return () => { instance.remove(); map.current = null; };
 }, [live]);

 /* Markers are DOM, not a layer: each one is a button a controller can reach with the keyboard and
    a screen reader can name. A canvas-drawn pin is invisible to both. */
 useEffect(() => {
  const instance = map.current;
  if (!live || !instance) return;
  const c = paint();
  for (const pin of pins.current) pin.remove();
  pins.current = markers.flatMap(marker => {
   const placement = place(marker.at);
   if (!placement.drawn) return [];
   const el = document.createElement('button');
   el.type = 'button';
   el.className = `map-marker ${marker.kind}${marker.selected ? ' selected' : ''}`;
   el.style.setProperty('--marker', markerColour(marker.kind, c));
   el.setAttribute('aria-label', marker.label);
   el.setAttribute('aria-pressed', String(Boolean(marker.selected)));
   if (marker.onSelect) el.addEventListener('click', marker.onSelect);
   return [new mapboxgl.Marker({ element: el }).setLngLat([placement.at.lng, placement.at.lat]).addTo(instance)];
  });
  return () => { for (const pin of pins.current) pin.remove(); pins.current = []; };
 }, [markers, live]);

 return (
  <div className="livemap" style={{ height }}>
   {live
    ? <div ref={host} className="livemap-canvas" role="img" aria-label={summary}/>
    : <Schematic markers={markers} summary={summary}/>}
   <p className="livemap-note">
    {live ? coverage.sentence : rendering.withoutToken.sentence}
   </p>
  </div>
 );
}

/* The same coordinates, without a network. This is the rendering every native app draws too, and
   the one the tests measure, so the behaviour under test is behaviour a real reader can get. */
function Schematic({ markers, summary }: { markers: MapMarker[]; summary: string }) {
 return (
  <div className="livemap-canvas schematic">
   <svg viewBox="0 0 100 100" role="img" aria-label={summary} preserveAspectRatio="xMidYMid slice">
    <rect width="100" height="100" className="map-ground"/>
    {[20, 40, 60, 80].map(n => (
     <g key={n}>
      <line x1="0" y1={n} x2="100" y2={n} className="map-grid"/>
      <line x1={n} y1="0" x2={n} y2="100" className="map-grid"/>
     </g>
    ))}
    {zones.map(z => <circle key={z.id} cx={plot(z.at).x} cy={plot(z.at).y} r={radiusInBoxUnits(z.radiusKm)} className="map-zone"/>)}
    {markers.map(marker => {
     const placement = place(marker.at);
     if (!placement.drawn) return null;
     const p = plot(placement.at);
     return (
      <g key={marker.id} className={`map-pin ${marker.kind}${marker.selected ? ' selected' : ''}`}>
       {marker.selected && <circle cx={p.x} cy={p.y} r="7" className="map-focus"/>}
       <circle cx={p.x} cy={p.y} r="2.4"/>
      </g>
     );
    })}
    {zones.map(z => <text key={z.id} x={plot(z.at).x} y={plot(z.at).y - radiusInBoxUnits(z.radiusKm) + 4.4} className="map-label">{z.name}</text>)}
   </svg>
  </div>
 );
}
