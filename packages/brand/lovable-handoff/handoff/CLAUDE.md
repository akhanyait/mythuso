# Claude implementation brief

Rebrand the existing MyThuso application using the local design system in this folder.

## Non-negotiable rules

- Preserve all existing application behavior, routes, authentication, permissions, data contracts, and backend integrations unless the owner explicitly asks for a functional change.
- Use the semantic tokens and exported components supplied here. Do not introduce ad-hoc colors, duplicate components, inline visual styles, or a second theme.
- Use only the supplied official MyThuso and GilbertOne logos. Never recreate either mark.
- Keep GilbertOne's official logo separate from the animated assistant component.
- Match the established patient, nurse, doctor, and partner experience: calm healthcare clarity, compact information density, visible status, purposeful motion, and strong mobile behavior.
- Respect `prefers-reduced-motion` and maintain keyboard access, visible focus, semantic controls, labels, and adequate contrast.
- Do not expose or hardcode credentials, tokens, patient records, or private clinical data.

## Execution approach

First audit the target application's screens and produce a route-by-route migration checklist. Then migrate in small batches, retaining business logic and replacing only the presentation layer. After each batch, run the target's existing tests and inspect desktop and mobile rendering. Do not claim completion while broken links, missing states, console errors, or horizontal overflow remain.

Read `README.md`, then `docs/design-guidelines.md`, then `docs/component-catalog.json` before editing.
