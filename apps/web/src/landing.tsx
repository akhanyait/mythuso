import { createRoot } from 'react-dom/client';
import { Landing } from './features/Landing';
/* The public page renders fourteen classes from the design system and none of the product's own
   screens, so it takes the core and stops there. It used to download all four applications' CSS. */
import './surface/core.css';
import './landing.css';
// Web-specific theme follows each entry's existing component styles.
import './surface/web-refresh.css';
import './surface/creative.css';
createRoot(document.getElementById('root')!).render(<Landing/>);
