import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './shells/shells.css';
/* The patient entry. One of four — the clinical workspaces are at /staff and the back office at
   /admin, each its own bundle, so nobody opening their own visits downloads either. */
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
