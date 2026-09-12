import React from 'react';
import ReactDOM from 'react-dom/client';
import Doorway from './Doorway';
/* Four sheets, not one. styles.css was 2,098 lines shipped whole to every entry, so a patient
   opening her own visits downloaded the dispatch board, the vetting queue and the back office's
   allocation tables in order to look at them. The order below is the cascade: core.css is what a
   page cannot be drawn without, app.css is what the three applications genuinely share, and
   patient-screens.css is reachable from this entry and nowhere else. */
import './surface/core.css';
/* And immediately after it, the Care Studio palette. It re-points the three neutral ramps this
   application is written in onto the generation the founder chose on 12 September, so every
   screen moves at once rather than twelve stylesheets being re-typed in a fourth ramp. It sits
   here, second, because everything below is free to override its components and nothing below
   redefines a token at :root. */
import './surface/studio.css';
import './surface/app.css';
import './surface/patient-screens.css';
import './shells/shells.css';
/* Last, deliberately. The patient surface is a sweep over the design system rather than a set of new
   components: it re-points the neutral ramp at charcoal and re-draws the shell, the cards and the
   chrome in glass. Several of its rules have the same specificity as the ones they replace, so the
   cascade decides, and the cascade is decided here — importing it from a component would let the
   bundler inject it wherever that component happens to sit in the graph. */
import './surface/patient.css';
/* And after it, the way in. Sign-in, the one-time code, recovery and first run stand on their own
   card rather than on the shell, and several of their rules answer one of equal specificity in
   core.css — so like patient.css this sheet is placed by the entry rather than by whichever
   component the bundler happened to reach first. It also carries the demo login, which is the only
   door left: the clinical and back-office sign-in screens are gone, and the role switcher stands
   where all three of them used to. */
import './surface/door.css';
/* The application entry, and now the only one the product has: /app serves this, / serves the public
   page and /status the page that says what is connected. The clinical workspaces and the back office
   used to be entries of their own; they are lazily-imported chunks of this one, reached by choosing a
   role on the demo login rather than by going to another address. Nobody opening their own visits
   downloads either — see src/Doorway.tsx for the measurement that says so. */
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Doorway /></React.StrictMode>);
