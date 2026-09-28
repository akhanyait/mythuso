# MyThuso Design System

MyThuso is a calm, credible healthcare design language. It balances clinical precision with approachable warmth: deep ink establishes trust, vivid aqua communicates progress, and clear white surfaces preserve focus. Interfaces should feel composed, fast, and reassuring rather than sterile or playful.

## Hard constraints

- Import the canonical theme once from `src/styles/theme.css` and use semantic tokens or token-backed utilities for every color, spacing, radius, shadow, and typography choice.
- Never introduce raw color literals or one-off inline visual styles in product interfaces. If a new visual role is genuinely needed, add a semantic token first.
- Compose interfaces from exported MyThuso components before creating parallel controls.
- Keep corners compact and hierarchy crisp. Avoid pill-shaped containers except badges, statuses, and compact controls.
- Use Lucide icons at the system stroke weight. Do not mix icon families within one interface.
- Do not use gradients, decorative orbs, glass effects, oversized empty marketing layouts, or purple-dominant palettes.

## Typography and voice

Use `font-display` for page titles and compact feature headings; use `font-sans` everywhere else. Headlines are confident and concise. Supporting language is plain, specific, and human. Prefer “Review patient record” to “Unlock intelligent insights.” Labels describe actions directly. Avoid jargon, hype, and exclamation-heavy writing.

## Component pattern

```tsx
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/design-system/mythuso";

<Card>
  <CardHeader><CardTitle>Patient summary</CardTitle></CardHeader>
  <CardContent>
    <Button variant="primary" size="md">Open record</Button>
  </CardContent>
</Card>
```

Use named `variant` and `size` props instead of styling a component externally. `className` is for layout composition, not for inventing a new visual variant.

## Accessibility baseline

Every action uses its native semantic element. All controls need visible focus, sufficient contrast, keyboard operation, and accessible names. Pair form controls with labels and error text through IDs and ARIA attributes. Never rely on color alone for status. Motion should be short, purposeful, and disabled when the user prefers reduced motion.

## Layout and composition

Use an 8-point rhythm with compact information density. Give primary tasks obvious placement, group related facts, and reserve aqua for actions, selected states, and positive progress. Clinical alerts must pair iconography and text with color. On narrow screens, preserve reading order and minimum touch targets rather than shrinking controls.

## MyThuso identity and iconography

Use the MyThuso icon family for primary patient destinations, healthcare actions, and branded feature entry points. Its visual grammar combines compact rounded geometry, open clinical linework, and a small lime signal point with navy, teal, and orange accents. Use Lucide only for universal utility actions such as search, close, download, arrows, and overflow controls. Never mix a generic icon and a MyThuso icon for the same concept.

The uploaded `GilbertOne` artwork is the official GilbertOne logo: the complete seated character above the GilbertOne name. Preserve its proportions, colors, transparency, and clear space; never recolor, crop, redraw, rotate, or separate the character from the lettering when used as the logo. The exported animated `GilbertOne` component is a separate in-product assistant expression. Reserve both forms for AI guidance, conversation, and support—not generic decoration or ordinary healthcare actions.
