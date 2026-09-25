# MyThuso — Life, considered

25 September 2026 · A proposed UI/UX kit and interactive design review. Not a production rollout.

Open [the interactive kit](index.html) directly in a browser, or serve the repository root with `python3 -m http.server 8192 --bind 127.0.0.1` and visit `http://127.0.0.1:8192/docs/design-review/life-kit/`.

## The direction

More life through people, colour, composition and useful interaction. The identity is already here: deep brand ink, mint, lime, warm paper, lilac and GilbertOne. The proposal makes those assets work together. MyThuso feels welcoming, Control Tower feels purposeful, and GilbertOne feels approachable without acquiring clinical authority.

The kit has six responsive views:

| View | What changes | Interactions |
|---|---|---|
| ControlTower | Compact context, a dark focal metric, an honest availability panel, readable chart and next-action rows | Dispatch navigation, exact chart table, access disclosure, category explanations |
| Dispatch | Context and queue side by side, schematic map, a clear empty state and decision sequence | Visit/incident filter, explanation dialog |
| MyThuso | One leading care invitation, existing human imagery, visit/journal/assistant cards | Care journey dialogs, GilbertOne navigation |
| GilbertOne | Existing character, generous introduction, suggested questions and a clear composer | Scripted prompts; typed input is cleared and receives a prototype explanation |
| Public site | A strong brand-led opening, illustrative nurse imagery and a simple three-part journey | Patient preview, care explanation, GilbertOne |
| UI kit | Palette, type, spacing, actions, forms, service states, empty/loading/unavailable patterns, motion and native handoff | Segmented example, modal, replay respecting reduced motion |

All six have desktop and phone captures under [screenshots](screenshots/). Start with [ControlTower](screenshots/tower-desktop.png), [MyThuso](screenshots/patient-desktop.png), [GilbertOne](screenshots/gilbert-desktop.png), [public site](screenshots/landing-desktop.png) and [mobile MyThuso](screenshots/patient-mobile.png).

## What is reusable

- Foundations: shared `tokens.json` colours, type sizes, spacing, radii and motion, plus the existing generated CSS. No new token requested.
- Navigation: labelled category list, selected state, mobile category selector, review navigation and mobile shortcuts. The fourteen Control Tower categories retain contract order. Categories without a designed screen open an explanation; they are not represented as implemented workflows.
- Layout: shell, page header, context row, visible simulation notice, focal card, metric, chart panel, action row, empty queue, next-step sequence and footer.
- Controls: primary/secondary/invitation buttons, labelled input, persistent field error, segmented choice, native disclosure and modal with Escape/focus return.
- Data: labelled chart, exact-value table, source attribution and explicit fixed sample period. No invented health scores or production KPIs.
- Content: one useful heading per view; action-oriented labels; unavailable, unknown, empty and gated states remain distinct.
- Motion: one entrance using shared timing, interaction feedback, no ambient loops. Reduced motion removes the animation.

`build-data.mjs` derives `data.js` from the existing token and portal contracts. Run `node docs/design-review/life-kit/build-data.mjs` after those sources change. Do not hand-edit the snapshot. Demonstration visit values and service vocabulary are read from their existing source, not re-authored.

## Boundaries and handoff

This is a complete review artifact for the six listed views and their shared component language, not a redesign implementation of every existing feature. Patient source, native source, generated production tokens, APIs, flags and deployment files are untouched. Production consumes none of these files, so the kit adds no patient-entry dependency; no new production bundle figure is claimed.

GilbertOne's illustration is an existing brand asset. Its live rig, safety hierarchy and deterministic engine are unchanged. No text, audio, health request or location is sent. No data is persisted. Only the existing repository assets are loaded. The kit does not implement access control or claim the production engine is offline; it states that the prototype itself has no connection.

Before implementation, apply this composition to one complete patient-facing journey at a time, preserving the existing contracts and exact refusal messages. The compact safety presentation here is a proposal: it must not silently replace the product's contract-authored notices. Keep every existing category address, keyboard behaviour and permission boundary. Use real observed state and timestamp for live service cards, never a decorative green status.

Native handoff: use SwiftUI and Compose components; retain semantic text sizes, Dynamic Type/font scaling, native safe areas/back navigation, VoiceOver/TalkBack and reduced motion. No WebView. Native rendering has not been verified in this pass.

See [the systems review](SYSTEMS-REVIEW.md) for the audit evidence, reference interpretation, broader screen inventory and implementation priorities.

## Verification

Run `node docs/design-review/life-kit/verify.mjs` with the local server above. `KIT_ORIGIN` overrides its origin. The checks cover six views at 1440, 720, 390 and 320 pixels; text/target floors, internal overflow, missing images, browser errors, navigation, queue filtering, modal/Escape, scripted prompts, composer clearing, segmented feedback, reduced motion and keyboard focus. The 720px check approximates the layout viewport of a 1440px window at 200% zoom; it is not a native browser-zoom or text-only-zoom test.

Actual results are recorded in [verification.txt](verification.txt). Repository `npm run check` also passed. Product `npm test`, production builds and native builds were not run: the deliverable is isolated documentation/prototype code, not an application feature. This does not claim a full product regression or accessibility certification.

Files added: this README, `SYSTEMS-REVIEW.md`, `index.html`, `kit.css`, `kit.js`, `build-data.mjs`, generated `data.js`, `verify.mjs`, `verification.txt`, and the captures under `screenshots/`. No existing test assertions were changed.

## Second review — colour and motion

The founder requested stronger colour, animation and a clearer GilbertOne presence. The default view now opens GilbertOne. Its existing character appears in a larger mint panel with decorative rings and a finite welcome entrance; it is also visible on the Control Tower summary card. Peach, mint and lilac distinguish supporting cards and suggested questions. Chart traces draw in, bars reveal from their baseline, cards enter in sequence and button arrows respond to hover. All effects finish; none loops or implies a live service state.

The global Motion on/off control applies across navigation, in memory only. System reduced motion disables effects. The prototype remains disconnected and the production avatar is unchanged. Refreshed desktop/mobile screenshots reflect this revision. This supersedes the initial single-entrance motion description above and in the systems review.

## Third review — GilbertOne conversation workspace

The founder rejected the enlarged hero treatment. GilbertOne now has a dedicated conversation layout: a compact existing character icon, a clear greeting, a large labelled composer directly below it, and three quiet suggestion cards with mint/lilac/peach icon accents. A lightweight conversation rail replaces patient navigation on desktop. New conversation clears the in-memory text and example reply. The oversized illustration panel, rings and promotional hero are removed from this view. Entry motion remains finite and respects the global toggle and reduced motion. The assistant is still a scripted, disconnected preview; the production rig and service are untouched.

## Fourth review — MyThuso, designed for the phone

The founder requested a UI/UX specialist review and a direction informed by Orbix Studio's nutrition concepts. A separate agent reviewed the old and new compositions while the implementation was built. The patient preview now uses a white surface, a compact ivory/lime care panel with an existing mother-and-child cutout, an orange primary action, three compact care shortcuts, a horizontal GilbertOne companion, and a labelled fixed phone navigation bar. Personal/family starting-point buttons update the explanation and next action in memory; they grant no access and save nothing. Upcoming visits remain honestly empty.

Motion uses the shared tokens: a finite image reveal, staggered content entrance, button feedback and short dialog entrances. All obey Motion off and system reduced motion. Orange button text is charcoal, measured at 6.01:1; charcoal on studioLime is 13.70:1. No nutrition scores or unverified clinical readings were introduced. `patient.css` is the only new implementation file in this revision, loaded by the standalone `index.html`; production is unchanged.

Reference pages reviewed, alongside the screenshots supplied by the founder:
- [AI Nutrition Scanner](https://dribbble.com/shots/27441703-AI-Nutrition-Scanner-Mobile-App-UI)
- [AI Nutrition & Food Recipe Generator](https://dribbble.com/shots/26881816-AI-Nutrition-Food-Recipe-Generator)
- [Fitness Nutrition — Meal and Nutrition Score](https://dribbble.com/shots/26702107-Fitness-Nutrition-App-Design-Meal-and-Nutrition-Score)

These inform spacing, focus and layering, not copied brand assets or health claims. The specialist's final visual review found no text/image collisions at 390px and confirmed shortcuts visible in the first viewport. It also caught a sentence-spacing defect in the compact visit state, which was fixed. The phone viewport screenshot is the clearest view of the fixed navigation; a full-page capture places fixed elements at their initial viewport position.

## Fifth review — layered banner motion and ControlTower

The supplied fitness/nutrition reference informed a deeper teal-to-white atmosphere, fine curved linework and layered surfaces. Its public page exposed still artwork, not a playable video/GIF in the inspected HTML; no claim is made that its animation timing was reproduced. The patient banner now has a teal art panel, a brief decorative light pass behind the existing cutout, linework that fades in and a restrained portrait settle. Copy and controls remain stationary. The choice explanation fades when changed. ControlTower has a quieter teal header, softer surfaces, a drawing chart and staged marker reveal; all values remain the same labelled samples.

`motion-polish.css` holds this revision. Every added animation finishes within three shared enter durations. Motion off and system reduced motion remove them. The overlays have no hit targets and imply no clinical or service status. This remains a standalone review kit, with no deployment or production changes.

## Reference correction — actual animation inspected

The founder pointed out that the Nutrition History reference is animated. A browser network inspection confirmed the dynamically loaded [13-second shot video](https://cdn.dribbble.com/userupload/45478723/file/d520e18e299a37e9c043685d9584991e.mp4). The earlier static-HTML inspection missed it. The other loaded video is the studio's promotional reel, not the nutrition interaction.

Frames at 8.0, 9.0, 9.4, 9.8, 10.2 and 11.2 seconds show the actual sequence: a See All tap indicator; the summary and navigation soften and fade; the Nutrition History title appears in the retained teal header; search and history rows resolve from blur into focus. By 11.2 seconds the history screen is sharp. The end transitions back to a three-screen presentation. This is a coordinated scene transition, beyond the current prototype's decorative banner sweep. This inspection does not claim that those exact transitions have already been implemented.

## Sixth review — new scenes and coordinated transitions

Two additional designs are now implemented in the standalone kit:

- `#care`: a MyThuso service catalogue with a retained teal header, inset white content, category filters, accessible search, empty results and preview detail dialogs. Service names, descriptions, durations and prices are generated from `packages/catalog/services.json`; only phase-one catalogue entries are displayed, explicitly labelled as a preview rather than available bookings.
- `#activity`: a ControlTower weekly review with sourced summary figures, an exact-value chart, per-day bars and visible demonstration provenance. All counts derive from the existing demonstration series.

Navigation uses the browser View Transition API to soften the outgoing snapshot and reveal the incoming scene through blur and opacity. Staged row opacity follows. Transitions use existing quick/settle/enter timing and do not block navigation or move the actual controls. Motion off and system reduced motion skip the transition. Browsers without the API navigate directly. This adapts the verified reference motion for a working interface; it is not a frame-for-frame recreation of the studio video.

New files: `scenes.css`, `verify-scenes.mjs`, care/activity screenshots at desktop and phone widths, and `screenshots/new-designs-motion.webm`. `build-data.mjs` now includes service data. `verify.mjs` covers all eight views. `verify-scenes.mjs` checks category/search/empty-result behaviour, service details, weekly counts and motion-off navigation, and records the transition walkthrough. No product screen or service was changed or deployed.

### Seventh review — full banners, human support and colourful widgets

The patient hero now spans the content grid. Fresh start uses a teal invitation with peach,
lilac and mint action cards; Care, made simple uses distinct coloured step cards. The care
catalogue has a new AI-generated support photograph. ControlTower uses coloured summary
cards, a weekday/weekend donut and rounded weekly bars, all calculated from the existing
sample visits. Motion is finite and honours the motion toggle and reduced-motion preference.

Visual reference: https://dribbble.com/shots/27617801-Healthcare-Dashboard-Design
Adapted its modular panels, circular visualisation and soft green palette; no clinical scores,
staff availability or patient records were copied into this preview.

Image: `assets/support-at-home-v1.png`, generated with the built-in image generation tool.
Final prompt: “Use case: photorealistic-natural. Asset type: wide website banner for MyThuso
care support catalogue. Create an editorial lifestyle photograph of a warm, realistic Black
South African female home-care nurse wearing simple teal scrubs, listening attentively to an
older Black South African woman in a cream cardigan, seated together comfortably at home.
Natural skin texture, candid gentle smiles, respectful human connection and reassurance, no
medical procedure. Wide landscape 3:2 composition, both people on the right two-thirds,
spacious soft muted teal wall on the left for a dark teal website copy overlay, warm window
light, subtle houseplant, premium natural photography, believable anatomy and hands. No text,
no logo, no watermark, no graphic UI. The subjects are fictional AI-generated people, not
actual staff or patients.”

This remains an isolated design review kit. No production bundle or native app was changed.

### Eighth review — edge-to-edge banner images

Patient and care photography now covers 100% of the banner area. Text sits above a gradient
for readability; the former half-width image panels are removed. Images use cover cropping
rather than distorting people's faces, with separate desktop and phone focal positions.

New image: `assets/family-panorama-v1.png`, built-in image generation tool.
Final prompt: “Create a photorealistic natural editorial website banner, extremely wide panoramic
3:1 landscape. A smiling Black South African mother in cream cardigan and black headwrap gently
cuddling her happy preschool daughter wearing a cream top, in a welcoming sunlit home with teal
wall and soft plants. Subjects together entirely within the RIGHT THIRD of the panorama, both
complete heads and faces clearly visible with generous top and bottom safe margins for cropping
into a shallow banner. Frame waist-up with space above heads, not a close-up. LEFT TWO THIRDS is
the continuous softly blurred teal and cream room, no people there, for HTML heading overlay.
Warm daylight, authentic skin detail, gentle candid affection, premium editorial realism. No
text, branding, watermark or graphics. Fictional AI-generated people.”

### Ninth review — Gauteng province dispatch concept

Open `#province` (now the ControlTower studio link) for an offline full-province map, selectable
fictional dispatch cards, review filtering, connection visibility, scenario scrubber and a ten-second
user-started replay with pause/reset. Motion-off or reduced-motion shows the final position without
animation. Playback stops when navigating away. The analytics and weekly review screens remain linked.

Geographic source: Municipal Demarcation Board geometry served by NDMC,
https://gislive21.ndmc.gov.za/hosting/rest/services/SouthAfricaBoundaries/MapServer/0
Downloaded with `PROVINCE='Gauteng'`, WGS84, generalisation tolerance 0.005 degrees on 25 September
2026; stored in `assets/gauteng.geojson`, with a local JavaScript geometry derivative for the kit.
The boundary is geographic; city positions are approximate. All dispatch points, statuses and
movements are fictional. Connections are schematic curves, not road routes, ETAs or navigation.
No patient information, GPS permissions, live tiles or dispatch API calls are used.
