import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './shells/AdminShell';
import './surface/core.css';
import './surface/app.css';
import './surface/clinical-screens.css';
import './shells/shells.css';
/* The back-office entry. Separate from the clinical one because they are separate audiences with
   separate accounts, and a console of readiness, catalogue and finance has no business being
   downloaded by a nurse standing at somebody's front door. */
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AdminApp /></React.StrictMode>);
