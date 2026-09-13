# Main-site login and map styling

The main site now contains a Log in action on desktop and phone. Choosing Patient, Nurse,
Doctor, Pharmacy partner, Control Tower or Back office opens the corresponding dashboard
at the same root path, with the preview role in the query string. Refresh preserves that
role; browser Back returns to the previous role. Switching roles clears patient section
links and starts the selected workspace at its own dashboard. Existing /app/ bookmarks
continue to work.

The role picker selects fictional demo identities. It does not create an authenticated
session, assign server permissions, or bypass the real patient identity flow. No role or
patient data is stored in browser storage. Native applications already use their own role
selection and remain fully native.

The public page loads the workspace only when a role is opened; clinical and back-office
shells retain their separate lazy imports. The main HTML entry now has the same restricted
map-host and same-origin-worker policy as the legacy app entry. The status page remains
unable to contact the map provider.

## Map direction

Retain OpenFreeMap Positron for its quiet road hierarchy. Tint land, parks, buildings and
water to the MyThuso palette; keep contrasting, shape-coded care markers, a visible
schematic/street-map label, 44px zoom controls and an immediate Reset view. Keep the view
north-up. Resolve CSS colour mixes to sRGB before supplying MapLibre paint values.

Native dispatch zones use muted sage fills and fine outlines. The Android arrival map
uses the same treatment. Existing positions, coverage, privacy zoom limit, reference
geometry and dashed straight-line estimates retain their meanings. No simulated line is
presented as a road route. Maps stay schematic until the user requests streets, and return
to the schematic if streets fail. Attribution remains visible.

Sources consulted: [OpenFreeMap style guide](https://openfreemap.org/quick_start/) and
[MapLibre map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/).

## Verification

- TypeScript, contract/boundary checks and production web build.
- Browser journeys for all six logins, refresh, patient deep links, role history,
  keyboard dismissal, opt-in maps, touch controls and map reset.
- Existing landing, arrival, role/session and chart-motion regressions.
- Native iOS simulator build; Android debug build and lint.
- Actual provider street map and 320px login inspected visually.

The production web build retains the existing large-chunk advisory. The map provider
remains configured for preview use; this change does not establish a production service
agreement or implement real staff authentication.
