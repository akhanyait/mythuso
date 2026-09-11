import React from 'react';
import ReactDOM from 'react-dom/client';
import StaffApp from './shells/StaffShell';
/* No patient-screens.css here. A nurse standing at somebody's front door has no reason to download
   the emergency pathway, the consent centre or the family list in order to read her schedule. */
import './surface/core.css';
import './surface/app.css';
import './surface/clinical-screens.css';
import './shells/shells.css';
// Web-specific theme follows each entry's existing component styles.
import './surface/web-refresh.css';
import './surface/creative.css';
/* The clinical entry. It shares the design system with the patient app and nothing else: no patient
   shell, no booking flow, no wallet, no catalogue, and no route back into any of them. */
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><StaffApp /></React.StrictMode>);
