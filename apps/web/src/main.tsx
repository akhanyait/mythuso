import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './shells/shells.css';
/* Last, deliberately. The patient surface is a sweep over the design system rather than a set of new
   components: it re-points the neutral ramp at charcoal and re-draws the shell, the cards and the
   chrome in glass. Several of its rules have the same specificity as the ones they replace, so the
   cascade decides, and the cascade is decided here — importing it from a component would let the
   bundler inject it wherever that component happens to sit in the graph. */
import './surface/patient.css';
/* The patient entry. One of four — the clinical workspaces are at /staff and the back office at
   /admin, each its own bundle, so nobody opening their own visits downloads either. */
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
