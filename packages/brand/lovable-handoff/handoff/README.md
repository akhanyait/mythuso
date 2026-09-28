# MyThuso Design System — Claude Handoff

This package contains the reusable visual system built for MyThuso: official brand assets, semantic theme tokens, accessible React components, MyThuso healthcare icons, and the animated GilbertOne assistant.

## What Claude should do

1. Copy this package's `src/` into the target application's `src/design-system/mythuso/` folder.
2. Import the theme once from the target application's global client entry or root layout:

```ts
import "@/design-system/mythuso/styles/theme.css";
```

3. Import components from the barrel:

```tsx
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GilbertOne,
  MyThusoHealthIcon,
} from "@/design-system/mythuso";
```

4. Read `docs/design-guidelines.md` before restyling screens. Treat it as the design contract.
5. Use `docs/component-catalog.json` for component usage examples and anti-patterns.
6. Replace existing brand marks with the exact files under `src/assets/logos/`. Do not redraw, recolor, crop, or regenerate them.
7. Preserve the target application's framework, routing, authentication, data access, and business logic. Rebrand presentation incrementally rather than replacing working application logic.
8. Verify every changed screen on desktop and mobile, including keyboard focus, overflow, contrast, loading, empty, warning, and error states.

## Required packages

The core exported barrel needs:

```bash
npm install class-variance-authority clsx lucide-react tailwind-merge
```

It expects React 19 and Tailwind CSS 4. If the target already uses compatible versions, keep its existing versions. 
## Tailwind setup

The canonical theme is `src/styles/theme.css`. It contains the Tailwind import, semantic variables, utility mappings, component motion, dark mode, and reduced-motion behavior. Do not split token values into page files. If the target already owns a global Tailwind entry, merge its existing global rules carefully while keeping this theme as the source of MyThuso tokens.

## Brand assets

- `src/assets/logos/mythuso-logo.png` is the exact official MyThuso logo supplied by the owner.
- `src/assets/logos/gilbert-one-logo.png` is the official GilbertOne identity mark.
- `src/components/gilbert-one.tsx` is the animated in-product assistant, not a substitute logo.

## Recommended migration order

1. Theme and fonts
2. Global shell and navigation
3. Buttons, forms, cards, alerts, tabs, and status patterns
4. Official logos and MyThuso icons
5. Patient screens
6. Nurse screens
7. Doctor screens
8. Partner screens
9. Responsive and accessibility verification

## Important boundaries

This handoff is visual-system source, not patient data, authentication configuration, database migrations, Mapbox credentials, or deployment secrets. Keep all secrets outside source control. Existing production data must stay behind the target application's current security controls.
