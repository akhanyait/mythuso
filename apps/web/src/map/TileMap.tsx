import { useEffect, useRef } from 'react';
import { MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { mapWindow, place, rendering, source, view, zones } from '../lib/geography';
import type { LatLng } from '../../../../packages/geo/index.ts';
import type { MapMarker } from './LiveMap';
/* The tile map, and the only module in this application that imports a map library.
 *
 * It is behind a dynamic import for one reason, and the reason is a person rather than a metric.
 * The library is 1.8 MB and it was loading in the staff bundle before a nurse could see her first
 * visit of the day. A patient opens this app a few times a month, usually on wifi. A nurse has it
 * open all day, in the field, on a prepaid data bundle she is paying for out of the visit fee, and
 * every screen of her day except one needs no map at all. So it is fetched when somebody asks for
 * streets, and never in a session where nobody does — which, because streets are off by default, is
 * most of them.
 *
 * MapLibre rather than mapbox-gl. Same API, same size, no account: mapbox-gl needs a pk. token, and
 * a token is a billing relationship, a procurement queue and a key whose expiry turns a dispatch
 * board into a grey rectangle. The endpoint it draws from, the licence, the credit and the usage
 * policy are all packages/catalog/geography.json rather than constants here, so replacing the
 * provider is a data change and the attribution cannot drift from the source it credits.
 *
 * What this file must never do is send anything about the caseload. The tile server is asked for
 * streets by tile coordinate. The zones, the visits, the nurses and the line between two suburbs
 * are drawn by this application on top of tiles that know nothing about them. There is no
 * geolocation call here and no permission is requested. What a tile request does disclose — the
 * square on screen, the address that asked, the time — is the privacy rule
 * `a-tile-request-is-a-viewport`, and LiveMap renders it beside the switch that causes it. */

/* MapLibre parses tiles off the main thread and works out where its worker lives from a URL it
   builds at runtime — `new URL(\`./${name}.mjs\`, import.meta.url)`. A bundler cannot see through a
   template literal, so nothing emits that file and the map dies on load in a built app, silently
   and only in production. Naming the worker here is what makes it an asset the build knows about.
   It is also what keeps the page's Content-Security-Policy honest: the worker is served from this
   origin, so worker-src stays 'self' rather than being opened to blob:. */
setWorkerUrl(mapWorkerUrl);

// Resolve CSS colour mixes to sRGB before passing them to the map style parser.
const cssVar = (name: string) => {
 const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
 if (!value) return '';
 const canvas = document.createElement('canvas');
 canvas.width = canvas.height = 1;
 const context = canvas.getContext('2d');
 if (!context) return value;
 context.fillStyle = value;
 context.fillRect(0, 0, 1, 1);
 const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
 return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
};

/* The palette comes from the same generated tokens as everything else, read at runtime rather than
   restated here, so a map cannot be the one surface that kept the old colours. */
const paint = () => ({
 indigo: cssVar('--indigo') || '#1e3a8a',
 indigoDeep: cssVar('--indigo-deep') || '#172f6f',
 teal: cssVar('--teal') || '#14b8a6',
 tealInk: cssVar('--teal-ink') || '#0f766e',
 mangoInk: cssVar('--mango-ink') || '#8a4b00',
 danger: cssVar('--danger') || '#b42318',
 faint: cssVar('--faint') || '#5d6b80',
 charcoal: cssVar('--charcoal') || '#1f2733',
 surface: cssVar('--surface') || '#ffffff',
 paper: cssVar('--studio-paper') || '#f6f5ef',
 sage: cssVar('--pale-sage') || '#e8eddf',
 water: cssVar('--teal-soft') || '#e0eeea',
 stone: cssVar('--stone') || '#d9ddd2'
});

/** A circle of `radiusKm` around a point, as a GeoJSON polygon. A GL renderer will happily scale a
    circle by pixels, which is the wrong unit: a service zone is three kilometres wide at every
    zoom, and a zone that grows as you zoom out is a coverage claim nobody made. */
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

/** The straight line an estimate was measured along, or an empty collection when there is nothing to
    measure — a nurse who is not on the way yet has no line, and an empty source is how you say that
    without adding and removing a layer. */
const straightLine = (link: { from: LatLng; to: LatLng } | null): GeoJSON.FeatureCollection => ({
 type: 'FeatureCollection',
 features: link
  ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[link.from.lng, link.from.lat], [link.to.lng, link.to.lat]] } }]
  : []
});

const markerColour = (kind: MapMarker['kind'], c: ReturnType<typeof paint>) =>
 kind === 'nurse-free' ? c.tealInk
  : kind === 'nurse-busy' ? c.faint
  : kind === 'nurse-blocked' ? c.danger
  : kind === 'visit-assigned' ? c.indigo
  : c.mangoInk;

export function TileMap({ markers, summary, link, onTilesFailed }: {
 markers: MapMarker[];
 summary: string;
 link: { from: LatLng; to: LatLng } | null;
 onTilesFailed: () => void;
}) {
 const host = useRef<HTMLDivElement>(null);
 const map = useRef<MapLibreMap | null>(null);
 const pins = useRef<Marker[]>([]);
 const drawn = useRef(false);
 /* The map is built once and never on a re-render. Both of these arrive as a fresh object or a fresh
    closure every time the parent renders, and depending on them tore the whole GL context down and
    rebuilt it on each pass — a map that never finished loading, an error that never surfaced, and a
    tile server asked for the same square over and over. They are held rather than depended on. */
 const failed = useRef(onTilesFailed);
 failed.current = onTilesFailed;
 const route = useRef(link);
 route.current = link;

 useEffect(() => {
  if (!host.current || map.current) return;
  const c = paint();
  const instance = new MapLibreMap({
   container: host.current,
   maxPitch: 0,
   dragRotate: false,
   style: source.styleUrl,
   center: [mapWindow.centre.lng, mapWindow.centre.lat],
   zoom: view.zoom,
   minZoom: view.minZoom,
   /* Fifteen is a privacy limit, not a performance one: above it a reader can pick out one house,
      and no screen in this product has a reason to. It is also the number that makes the disclosure
      a measurement — one tile at this zoom is about a kilometre of Johannesburg, so the finest thing
      the tile server can tell from a request is which suburb, not which door. */
   maxZoom: view.maxZoom,
   /* The credit is rendered by this application, from the contract, immediately under the map — not
      by the library's own control. Two reasons. The provider's tile metadata carries the same words,
      so the control drew them twice, and two identical credits is not more attribution, it is a
      defect. And a credit supplied by the party being credited can stop being supplied without
      anybody noticing, whereas one in packages/catalog/geography.json changes only when somebody
      edits the file that also names the endpoint. Never behind an i, either: a licence condition
      folded into a disclosure triangle is a licence condition somebody has to go looking for. */
   attributionControl: false,
   /* Motion is the reader's to refuse, and a map that animates its own camera is motion. */
   fadeDuration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300
  });
  map.current = instance;
  instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  instance.touchZoomRotate.disableRotation();
  const reset = () => {
   const halfLat = (view.spanKm / 2) / 110.574;
   const halfLng = (view.spanKm / 2) / (111.32 * Math.cos((mapWindow.centre.lat * Math.PI) / 180));
   instance.fitBounds(
    [[mapWindow.centre.lng - halfLng, mapWindow.centre.lat - halfLat], [mapWindow.centre.lng + halfLng, mapWindow.centre.lat + halfLat]],
    { animate: false, padding: 8 }
   );
  };
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'map-reset';
  resetButton.textContent = 'Reset view';
  resetButton.addEventListener('click', reset);
  host.current.append(resetButton);

  /* Three ways for streets not to arrive and one answer to all of them. The endpoint can be down,
     the network can be off, and a clinic's wifi can answer the request with its own sign-in page —
     which is not a failure at the socket, it is a 200 full of HTML that never parses. The first two
     raise an error before the style has loaded; the third raises one too, but a portal that simply
     holds the connection open raises nothing at all, so there is a clock on it as well. After the
     map has loaded, errors are left alone: a single tile missing at the edge of the viewport is not
     a reason to take a working board away from the person reading it. */
  let settled = false;
  const fail = () => { if (!settled) { settled = true; failed.current(); } };
  const clock = setTimeout(fail, source.loadTimeoutMs);
  instance.on('error', fail);
  instance.on('load', () => {
   settled = true;
   drawn.current = true;
   clearTimeout(clock);

   /* A dispatch board is not a street directory. Suburb names, roads and water stay; the country
      and province a controller is already standing in, American route shields, airports and
      footpath names go. The list is the contract's, because it belongs to the style rather than to
      this file, and changing style means changing it in the same edit. */
   for (const layer of rendering.suppressedLayers) {
    if (instance.getLayer(layer)) instance.setLayoutProperty(layer, 'visibility', 'none');
   }

   // Keep Positron's road hierarchy and label contrast, tint only the base fills.
   const fills: Record<string, string> = {
    park: c.sage, landcover_wood: c.sage, water: c.water,
    landuse_residential: c.paper, building: c.stone
   };
   if (instance.getLayer('background')) instance.setPaintProperty('background', 'background-color', c.paper);
   for (const [id, colour] of Object.entries(fills)) {
    if (instance.getLayer(id)?.type === 'fill') instance.setPaintProperty(id, 'fill-color', colour);
   }

   instance.addSource('zones', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: zones.map(z => ({ ...circle(z.at, z.radiusKm), properties: { name: z.name } })) }
   });
   /* The same Johannesburg the schematic draws, and that is not a nicety. The contract says the
      window is `spanKm` across, centred here; the schematic projects that onto a square and this map
      was opening at `zoom` instead, so in a box that is wider than it is tall the two renderings
      framed different cities and Soweto fell off the bottom of one of them. A controller must not
      find that a zone exists or does not depending on which rendering they happen to be looking at.
      Zoom stays in the contract as where the camera starts; the bounds are what it settles on. */
   reset();

   instance.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones', paint: { 'fill-color': c.teal, 'fill-opacity': 0.14 } });
   instance.addLayer({ id: 'zone-edge', type: 'line', source: 'zones', paint: { 'line-color': c.tealInk, 'line-width': 1.5, 'line-opacity': 0.55 } });

   /* The line an estimate was measured along, and it matters more here than it does on the
      schematic, not less. A schematic with a straight line on it is obviously not a route. A street
      map with a straight line on it looks like one, and a reader who takes it for a route has been
      told the nurse is coming down a road nobody has checked. So it is dashed, it is drawn through
      the buildings, and packages/geo refuses to call any of it a route. */
   instance.addSource('straight', { type: 'geojson', data: straightLine(route.current) });
   instance.addLayer({
    id: 'straight-line', type: 'line', source: 'straight',
    layout: { 'line-cap': 'round' },
    /* Heavier than the schematic's version of the same line, because it has more to argue with. On a
       plain square nothing suggests a road; over real roads a faint line reads as a route somebody
       has drawn along one, so it is drawn firmly and dashed firmly. */
    paint: { 'line-color': c.charcoal, 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [2, 1.6] }
   });

   /* Thirteen is the floor of the type scale and a map label is not exempt from it. The fontstack is
      what this style's glyph server actually has; naming one it does not serve loses every label on
      the board, silently. And these names never lose a collision to the base map's: a renderer that
      drops whichever label arrived last is a renderer that will quietly stop naming a suburb MyThuso
      works in in order to keep naming one it does not. */
   instance.addLayer({
    id: 'zone-name', type: 'symbol', source: 'zones',
    layout: {
     'text-field': ['get', 'name'], 'text-size': 13, 'text-font': ['Noto Sans Bold'],
     'text-offset': [0, -1.4], 'text-allow-overlap': true
    },
    paint: { 'text-color': c.charcoal, 'text-halo-color': c.surface, 'text-halo-width': 1.8 }
   });
  });

  return () => { clearTimeout(clock); drawn.current = false; resetButton.remove(); instance.remove(); map.current = null; };
 }, []);

 /* The line follows the estimate it was measured from rather than the map's lifetime: a patient
    watching a nurse gets a new pair of suburbs the moment the estimate is recomputed, and rebuilding
    the map to move a line would ask the tile server for the same squares again. */
 useEffect(() => {
  const instance = map.current;
  if (!instance || !drawn.current) return;
  const geojson = instance.getSource('straight');
  if (geojson && 'setData' in geojson) (geojson as { setData: (d: unknown) => void }).setData(straightLine(link));
 }, [link?.from.lat, link?.from.lng, link?.to.lat, link?.to.lng]);

 /* Markers are DOM, not a layer: each one is a button a controller can reach with the keyboard and
    a screen reader can name. A canvas-drawn pin is invisible to both. */
 useEffect(() => {
  const instance = map.current;
  if (!instance) return;
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
   return [new Marker({ element: el }).setLngLat([placement.at.lng, placement.at.lat]).addTo(instance)];
  });
  return () => { for (const pin of pins.current) pin.remove(); pins.current = []; };
 }, [markers]);

 return <div ref={host} className="livemap-canvas" role="group" aria-label={summary}/>;
}
