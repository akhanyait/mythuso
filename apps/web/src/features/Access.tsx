import { Suspense, lazy } from 'react';
/* Language and access, as App.tsx names it.

   App.tsx imports this file statically, so everything it held — the table of eleven languages, the sign-language
   accommodation, the interpreter roster and, since wave 4d, the shared components those wear — was on every
   patient's first load, for a page a patient opens from the foot of a menu. The page is AccessPage.tsx now and
   this is its door: a Suspense boundary whose wait names the page it is fetching rather than drawing nothing. */
const Page = lazy(() => import('./AccessPage').then(m => ({ default: m.AccessPage })));

export function Access() {
 return <Suspense fallback={<p className="helper" role="status">Opening Language and access…</p>}><Page/></Suspense>;
}
