import { createRoot } from 'react-dom/client';
import { Shop } from './features/Shop';
import './surface/core.css';
import './surface/studio.css';
import './features/shop.css';

/* The shop's own entry. It imports the design system and this one feature and stops there — no
   app shell, no clinical modules, no role switch. A person comparing the price of a thermometer
   has no reason to download a dispatch board, and the patient entry has no reason to carry a
   product catalogue. */
createRoot(document.getElementById('root')!).render(<Shop/>);
