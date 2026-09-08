import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { mapboxToken, mapWindow, place, rendering, view, zones } from '../lib/geography';
import type { LatLng } from '../../../../packages/geo/index.ts';
import type { MapMarker } from './LiveMap';
/* The tile map, and the only module in this application that imports mapbox-gl.
 *
 * It is behind a dynamic import for one reason, and the reason is a person rather than a metric.
 * mapbox-gl is two megabytes — 740 kB gzipped — and it was loading in the staff bundle before a
 * nurse could see her first visit of the day. A patient opens this app a few times a month, usually
 * on wifi. A nurse has it open all day, in the field, on a prepaid data bundle she is paying for out
 * of the visit fee, and every screen of her day except one needs no map at all.
 *
 * So it is fetched when a map is actually drawn, and in a build with no tile token — which is this
 * repository, and every test run — it is never fetched at all. */

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

export function TileMap({ markers, summary, onTilesFailed }:
 { markers: MapMarker[]; summary: string; onTilesFailed: () => void }) {
 const host = useRef<HTMLDivElement>(null);
 const map = useRef<mapboxgl.Map | null>(null);
 const pins = useRef<mapboxgl.Marker[]>([]);

 useEffect(() => {
  if (!host.current || map.current) return;
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
  instance.on('error', event => { if (String(event.error?.message ?? '').match(/token|401|403/i)) onTilesFailed(); });

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
 }, []);

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
   return [new mapboxgl.Marker({ element: el }).setLngLat([placement.at.lng, placement.at.lat]).addTo(instance)];
  });
  return () => { for (const pin of pins.current) pin.remove(); pins.current = []; };
 }, [markers]);

 /* A token can be present and still not work — revoked, over quota, blocked by a captive portal on
    a clinic's wifi. All three fall back to the schematic, which is a complete answer to the same
    question and needs no network, rather than leaving a controller looking at nothing. */
 return <div ref={host} className="livemap-canvas" role="img" aria-label={summary}/>;
}
