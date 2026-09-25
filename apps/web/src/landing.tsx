import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './features/Landing';
/* The public page renders fourteen classes from the design system and none of the product's own
   screens, so it takes the core and stops there. It used to download all four applications' CSS. */
import './surface/core.css';
import './surface/studio.css';
import './landing.css';
import './surface/revamp.css';
import './surface/public-revamp.css';
// The main address serves both the public site and every role dashboard. Workspaces
// stay lazy so reading the public site does not download clinical screens.
const Workspace = lazy(() => import('./Workspace'));
function MainEntry() {
 const [search, setSearch] = useState(window.location.search);
 useEffect(() => {
  const update = () => setSearch(window.location.search);
  window.addEventListener('popstate', update);
  return () => window.removeEventListener('popstate', update);
 }, []);
 return new URLSearchParams(search).has('role')
  ? <Suspense fallback={<main className="opening" role="status">Opening your dashboard…</main>}><Workspace/></Suspense>
  : <Landing/>;
}
createRoot(document.getElementById('root')!).render(<MainEntry/>);
