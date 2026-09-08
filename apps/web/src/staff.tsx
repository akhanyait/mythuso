import React from 'react';
import ReactDOM from 'react-dom/client';
import StaffApp from './shells/StaffShell';
import './styles.css';
import './shells/shells.css';
/* The clinical entry. It shares the design system with the patient app and nothing else: no patient
   shell, no booking flow, no wallet, no catalogue, and no route back into any of them. */
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><StaffApp /></React.StrictMode>);
