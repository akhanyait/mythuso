/* What a Mapbox style asks for, translated into requests MapLibre can make.
 *
 * MapLibre parted from mapbox-gl at version two and took the mapbox:// scheme out with it. A style
 * fetched from api.mapbox.com still refers to everything it needs by that scheme — its vector
 * sources as `mapbox://mapbox.mapbox-streets-v8`, its sprite as `mapbox://sprites/mapbox/streets-v12`,
 * its glyphs as `mapbox://fonts/mapbox/{fontstack}/{range}.pbf` — and MapLibre, handed one of those,
 * loads nothing and says nothing. So the map's `transformRequest` runs every URL through this before
 * it is fetched: the four mapbox:// shapes become their https equivalents on api.mapbox.com, and any
 * request already bound for api.mapbox.com or a *.tiles.mapbox.com host gets the token appended if
 * it does not carry one. Everything else — OpenFreeMap, this origin, the worker — is left exactly as
 * it was, which is what `undefined` means to MapLibre.
 *
 * It is a pure function of a URL and a token, with no import and no DOM, so tests/map.spec.ts can
 * hold it to its rules without a token and without a browser: the repository ships without a token,
 * and a test that needed one would be a test nobody could run.
 *
 * What it will not do. It never adds the `sku` parameter mapbox-gl attaches to every tile request,
 * because that parameter is how Mapbox meters a session and it is not a thing MapLibre is asked to
 * account for. It never appends the token to any host outside the two Mapbox families, because a
 * token on a request to a third party is a leaked credential. And it knows nothing about
 * events.mapbox.com, mapbox-gl's telemetry endpoint: MapLibre carries no code that would call it,
 * this application adds none, and the page's content policy names no such origin — so telemetry is
 * refused three times over rather than switched off once. */

const API = 'https://api.mapbox.com';

/** True for api.mapbox.com and any *.tiles.mapbox.com host, and for nothing else. */
export const isMapboxHost = (host: string) => host === 'api.mapbox.com' || /^[a-z0-9-]+\.tiles\.mapbox\.com$/.test(host);

const withToken = (url: string, token: string) => {
 const parsed = new URL(url);
 if (!parsed.searchParams.has('access_token')) parsed.searchParams.set('access_token', token);
 return parsed.toString();
};

/** The https form of a mapbox:// name, or null when the name is not one of the four the style uses. */
export function resolveMapboxUrl(url: string): string | null {
 if (!url.startsWith('mapbox://')) return null;
 const path = url.slice('mapbox://'.length);
 /* mapbox://styles/{user}/{style} — the style itself, should anything name it that way. */
 const style = path.match(/^styles\/([^/]+)\/([^/?]+)$/);
 if (style) return `${API}/styles/v1/${style[1]}/${style[2]}`;
 /* mapbox://sprites/{user}/{style}{@2x}.{json|png} — MapLibre appends the density and the extension
    before asking, so the name arrives whole and the pieces go back on the API's sprite path. */
 const sprite = path.match(/^sprites\/([^/]+)\/([^/@.]+)(@\dx)?\.(json|png)$/);
 if (sprite) return `${API}/styles/v1/${sprite[1]}/${sprite[2]}/sprite${sprite[3] ?? ''}.${sprite[4]}`;
 /* mapbox://fonts/{user}/{fontstack}/{range}.pbf */
 const glyphs = path.match(/^fonts\/([^/]+)\/(.+)\/([0-9]+-[0-9]+)\.pbf$/);
 if (glyphs) return `${API}/fonts/v1/${glyphs[1]}/${encodeURIComponent(glyphs[2])}/${glyphs[3]}.pbf`;
 /* mapbox://{tileset}[,{tileset}…] — a vector source, answered by a v4 TileJSON. `secure` asks for
    https tile URLs inside it, which the content policy is the only thing that would accept. */
 if (/^[a-z0-9_.-]+(,[a-z0-9_.-]+)*$/i.test(path)) return `${API}/v4/${path}.json?secure`;
 return null;
}

export type MapboxRequest = { url: string } | undefined;

/** MapLibre's `transformRequest`, for a build whose source is Mapbox. */
export function mapboxRequests(token: string): (url: string) => MapboxRequest {
 return url => {
  const resolved = resolveMapboxUrl(url);
  if (resolved) return { url: withToken(resolved, token) };
  let host = '';
  try { host = new URL(url).host; } catch { return undefined; }
  return isMapboxHost(host) ? { url: withToken(url, token) } : undefined;
 };
}
