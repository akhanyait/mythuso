import { Suspense, lazy } from 'react';
/* Language and access, as App.tsx names it.

   App.tsx imports this file statically, so everything it held — the table of eleven languages, the sign-language
   accommodation, the interpreter roster and, since wave 4d, the shared components those wear — was on every
   patient's first load, for a page a patient opens from the foot of a menu. The page is AccessPage.tsx now and
   this is its door: a Suspense boundary whose wait names the page it is fetching rather than drawing nothing. */
const Page = lazy(() => import('./AccessPage').then(m => ({ default: m.AccessPage })));

/* `level` is 2 when the page is drawn as a tab of Privacy & settings, under that page's own h1. */
export function Access({ level = 1 }: { level?: 1 | 2 }) {
 return <Suspense fallback={<p className="helper" role="status">Opening Language and access…</p>}><Page level={level}/></Suspense>;
}
