import { isFiniteCoordinate, type LatLng } from './coords.ts';

/* The nine provinces as conservative rectangles around their real outlines, plus a centroid.

   This table earns its place twice. It is the tighter test the national bounding box is not — the
   national box is deliberately generous enough to admit Gaborone and Maputo — and it is the coarsest
   honest label for a coordinate, which is what a screen should say when it is naming where something
   is rather than pretending to know a street.

   The rectangles overlap, because provinces are not rectangles. That is why there is no function
   here that returns one province for any point on Earth. The sibling project had one: it took the
   nearest centroid, so a coordinate in the middle of the Atlantic came back as "Western Cape" with
   no hint that anything was wrong. Containment can answer "none", and "none" is the answer that
   catches the bug. */
export interface Province {
 key: string;
 name: string;
 centre: LatLng;
 bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number };
}
export const provinces: Province[] = [
 { key: 'LIM', name: 'Limpopo',       centre: { lat: -23.4, lng: 29.5 }, bounds: { minLng: 26.0, maxLng: 32.0, minLat: -25.6, maxLat: -22.0 } },
 { key: 'NW',  name: 'North West',    centre: { lat: -26.7, lng: 25.6 }, bounds: { minLng: 22.5, maxLng: 28.1, minLat: -28.0, maxLat: -24.6 } },
 { key: 'GP',  name: 'Gauteng',       centre: { lat: -26.1, lng: 28.1 }, bounds: { minLng: 27.2, maxLng: 29.1, minLat: -26.9, maxLat: -25.4 } },
 { key: 'MP',  name: 'Mpumalanga',    centre: { lat: -25.6, lng: 30.6 }, bounds: { minLng: 28.4, maxLng: 32.0, minLat: -27.5, maxLat: -24.4 } },
 { key: 'NC',  name: 'Northern Cape', centre: { lat: -29.0, lng: 21.9 }, bounds: { minLng: 16.4, maxLng: 25.0, minLat: -32.2, maxLat: -26.0 } },
 { key: 'FS',  name: 'Free State',    centre: { lat: -28.5, lng: 26.8 }, bounds: { minLng: 24.4, maxLng: 29.6, minLat: -30.7, maxLat: -26.6 } },
 { key: 'KZN', name: 'KwaZulu-Natal', centre: { lat: -28.8, lng: 30.9 }, bounds: { minLng: 28.6, maxLng: 33.0, minLat: -31.1, maxLat: -26.9 } },
 { key: 'WC',  name: 'Western Cape',  centre: { lat: -33.5, lng: 21.0 }, bounds: { minLng: 17.4, maxLng: 23.9, minLat: -35.5, maxLat: -30.7 } },
 { key: 'EC',  name: 'Eastern Cape',  centre: { lat: -32.3, lng: 26.5 }, bounds: { minLng: 22.7, maxLng: 30.4, minLat: -34.9, maxLat: -30.3 } }
];
export const provinceByKey = (key: string) => provinces.find(p => p.key === key);

/* Every rectangle the point falls in, nearest centroid first. More than one is normal near a
   border and is not an error; none means the point is not in South Africa at all. */
export function provincesContaining(p: LatLng | null | undefined): Province[] {
 if (!isFiniteCoordinate(p)) return [];
 return provinces
  .filter(province => p.lng >= province.bounds.minLng && p.lng <= province.bounds.maxLng
                   && p.lat >= province.bounds.minLat && p.lat <= province.bounds.maxLat)
  .sort((a, b) => squaredDegrees(p, a.centre) - squaredDegrees(p, b.centre));
}
/* The likeliest province, or null. Null rather than a nearest guess: a screen that says "Gauteng"
   about a coordinate in the sea has told the reader something worse than nothing. */
export const provinceFor = (p: LatLng | null | undefined): Province | null => provincesContaining(p)[0] ?? null;
const squaredDegrees = (a: LatLng, b: LatLng) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
