# `@mythuso/geo` — coordinates, once

Zero dependencies, plain TypeScript, no framework and no vendor. The web app imports it directly.
iOS and Android hand-write their own copies, the way they hand-write the identity check-digit
validator, because these are decisions rather than data and generating them would hide the decision.
This file is what a hand-written copy owes.

Run the tests:

```
npm test --prefix packages/geo      # 70 tests, node --test, no test framework to install
npm run check --prefix packages/geo # the tests are type-checked here; the modules are also
                                    # checked by npm run check, through the web app that imports them
```

## What a native port must reproduce

Behaviour, not shape. A Swift or Kotlin copy is free to be idiomatic — `CLLocationCoordinate2D`,
sealed classes, whatever reads best — as long as every one of these holds, because these are the
things that were wrong somewhere before they were written down here.

**The bounding box.** `minLng 16, maxLng 33.5, minLat -35.5, maxLat -22`. Generous on purpose: it
covers the coastline and the Mozambique-border protrusion, and it admits Gaborone and Maputo near
the corners. That is accepted. The province rectangles are the tighter test where one is needed.

**`normalizeSouthAfricaLngLat(input, sourceLabel)`, in this order.**

1. Coerce whatever arrived to a number — a string out of a database column, a form field, a query
   parameter. Refusing text only pushes the same conversion out to every caller, where it gets
   forgotten in one of them.
2. Refuse anything not finite: `Coordinate is not a number.`
3. Accept a pair already inside the box, unchanged, with `autoCorrected` false.
4. If the pair is valid only read the other way round, **swap it back, mark `autoCorrected`, and warn
   with the source label in the message**. South African longitude is positive and latitude is
   negative, so this is unambiguous rather than a guess. The warning is not decoration: a silent
   correction means the upstream bug is never found.
5. Otherwise refuse, and **name the offender where it is recognisable**, because the wording is what
   sends a developer to the right line of code:
   - within a degree of `37.33, -122.03` → `Coordinate looks like the iOS Simulator default (Cupertino).`
   - exactly `0, 0` → `Coordinate is null-island (0, 0) — almost always an unset field rather than a place.`
   - `|lat| > 90` or `|lng| > 180` → `Coordinate exceeds the global lat/lng range.`
   - anything else → `Coordinate is outside South Africa.`
6. Every result carries `sourceLabel` and the untouched `raw` input, valid or not, so a screenshot of
   a diagnostic tells the whole story.

**`MAX_REALISTIC_DISPATCH_KM = 300`.** Both endpoints can pass the national box and still be most of
a country apart. Past this, an estimate is refused as a coordinate fault rather than reported as a
long trip. This is the guard that stops a smaller version of the 16,939 km line.

**Haversine, in metres, on a 6,371 km sphere.** Symmetric, zero for a point against itself.

**The ETA rule.** An arrival time is `minutes: number | null` plus the basis it came from, and there
is no path to a number without one. Null when there is nothing to go on, and a `reason` in words the
screen can print. Never zero: one minute is the floor, because somebody at the gate still has to
reach the door. `URBAN_SPEED_KMH = 30` is a stated assumption, printed on the row it produced. No
detour factor is applied — the label says "straight line", so the number has to be one.

**The routing rule.** `etaFromRoute` takes a route and nothing else, so it *cannot* fall back to a
straight line: an unavailable route yields null and the provider's reason. `stale` is not
`unavailable` — a measurement from two minutes ago keeps its number and says how old it is; blanking
it during a refresh is how a board flickers between a real arrival time and "calculating", which
teaches an operator to distrust both. A screen that wants a straight-line estimate calls
`straightLineEta` by name, at its own call site, and labels it where the reader can see it.

**Provinces answer "none".** Containment, not nearest centroid. A nearest-centroid lookup names a
province for a coordinate in the middle of the Atlantic, and nobody ever sees the bug.

## What a port may leave out

`projectToSquare` and `kmToBoxUnits` exist so the web dispatch map is a projection of the same
coordinates the list uses rather than hand-placed pixels. A native board that draws its own map from
the same numbers wants them; one that only shows a list does not.

## Spelling

`normalizeSouthAfricaLngLat` keeps the American spelling of the sibling project it was ported from,
so the two remain greppable as the same thing. Everything else here is South African English —
`distanceMetres`, not `distanceMeters`.

## Three copies, and what is actually held in step

The natives hand-write their own copies rather than reading this package, the way they hand-write
the identity check-digit validator. `scripts/check-boundaries.mjs` compares the part that matters:
the six refusal sentences word for word, and the numbers an estimate is built from — the bounding
box, the assumed urban speed, the distance beyond which a gap is a coordinate fault, and the earth
radius. A speed named on a row must be the speed the arithmetic used, on every platform, or the row
is lying about its own working.

What is deliberately **not** held in step is the shape each language reaches for. Swift models an
estimate as an enum, so a number cannot be constructed without the distance and speed it came from —
the compiler refuses what a review would otherwise have to catch. Kotlin and TypeScript use a record
with a nullable field. Same contract, three idioms, and forcing one of them on the other two would
make each app worse at being itself.

The simulator sentence names the Android emulator as well as Cupertino, because the two defaults sit
inside the same one-degree circle. Naming only Cupertino sends an Android developer to the wrong
line, which is the whole reason the offender is named rather than being called "outside South
Africa".
