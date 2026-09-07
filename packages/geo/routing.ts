import type { LatLng, LngLat } from './coords.ts';

/* What a real routing call returns, written down before there is one.

   MyThuso has no routing provider, no API key and no map vendor, and the web app has exactly one
   runtime dependency on purpose. What it can have now is the shape — so that adding a provider is
   writing one adapter that returns a RouteResult, rather than a refactor of every screen that shows
   an arrival time.

   The rule this contract exists to hold, learned by a sibling project the expensive way: when the
   route is unavailable, you say it is unavailable. You do not quietly draw the straight line
   between the two points and let it read as a road. That project had a live map that re-seeded its
   route layer with a straight line every time the artisan moved, overwriting real road geometry
   with a line through buildings, and nobody could tell the two apart by looking. So:

   - There is no straight-line fallback in this file. There is deliberately nothing here that can
     manufacture geometry, a duration or a distance. The only thing an unavailable route produces is
     a refusal with a reason on it.
   - A screen that wants to show a straight-line estimate instead has to reach for a differently
     named function in eta.ts, at its own call site, in code a reviewer can see — and then label it
     as a straight line where the reader can see it too.
   - "Stale" is not "unavailable". A route measured ninety seconds ago is still a measurement, and
     blanking it while a refresh is in flight is how a board flickers between a real arrival time
     and "calculating" — which teaches an operator to distrust both. It keeps its number and says
     how old it is. */

export type RouteStatus = 'ok' | 'stale' | 'unavailable';
/** GeoJSON, so a provider's own geometry passes through unchanged. Coordinates are [lng, lat]. */
export interface RouteGeometry { type: 'LineString'; coordinates: LngLat[] }
export interface RouteMeasured {
 status: 'ok' | 'stale';
 geometry: RouteGeometry;
 /** As the provider measured them. Neither is ever inferred from the other. */
 distanceMetres: number;
 durationSeconds: number;
 /** ISO timestamp of the measurement, and how old it is now. Age is what makes "stale" checkable. */
 measuredAt: string;
 ageSeconds: number;
 provider: string;
}
export interface RouteUnavailable {
 status: 'unavailable';
 /** Said in words a dispatcher can act on, not a vendor error code. */
 reason: string;
 provider: string;
}
export type RouteResult = RouteMeasured | RouteUnavailable;
export interface RouteRequest { from: LatLng; to: LatLng; departAt?: string }
/* One adapter's worth of surface. A provider is dropped in behind this and nothing else changes. */
export interface RouteProvider { name: string; route(request: RouteRequest): Promise<RouteResult> }

export const isRouteMeasured = (r: RouteResult): r is RouteMeasured => r.status !== 'unavailable';

/* Ninety seconds. A nurse in traffic has not moved far in that time, and a board that re-asks more
   often than this is paying a vendor to tell it the same thing. */
export const ROUTE_STALE_AFTER_SECONDS = 90;
export const routeUnavailable = (reason: string, provider = 'none'): RouteUnavailable => ({ status: 'unavailable', reason, provider });

/* Age a measurement against the clock. Passing the clock in keeps it testable and keeps every
   screen from deciding for itself what "old" means. */
export function ageRoute(route: RouteResult, nowMs: number = Date.now()): RouteResult {
 if (!isRouteMeasured(route)) return route;
 const ageSeconds = Math.max(0, (nowMs - Date.parse(route.measuredAt)) / 1000);
 if (!Number.isFinite(ageSeconds)) return routeUnavailable('The route carries no usable measurement time.', route.provider);
 return { ...route, ageSeconds, status: ageSeconds > ROUTE_STALE_AFTER_SECONDS ? 'stale' : 'ok' };
}

/* The honest default, and the one MyThuso actually runs on today: asked for a route, it says there
   is no provider. It is a real implementation of the interface rather than a stub, so the screens
   are already written against the answer they will get on the day a provider is late, rate-limited
   or down — which is the same answer. */
export const noRoutingProvider: RouteProvider = {
 name: 'none',
 route: async () => routeUnavailable('No routing provider is connected, so no road route can be drawn or timed.')
};
