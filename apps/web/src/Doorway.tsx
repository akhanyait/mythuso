import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import App from './App';
import { RoleContext } from './features/DemoLogin';
import { roleFromSearch, roleOf, searchForRole, type RoleId } from './lib/roles';

/* The role in the URL selects a preview dashboard. The main site supplies the login
   picker, and /app/ remains a compatibility entry for older bookmarks. Role changes clear
   patient deep links and remount the clinical shell so its first dashboard always opens.
   This switcher grants no server permissions and stores no identity in the browser. */

/* Two chunks, not five. The four clinical roles are one application wearing four sets of navigation,
   so they share a chunk; the back office is a different audience and a different set of screens.
   Named imports would defeat the split, so these are the whole modules. */
const ClinicalWorkspace = lazy(() => import('./shells/StaffShell'));
const BackOffice = lazy(() => import('./shells/AdminShell'));
/* And one more door, which is not a role at all: ?preview=gilbertone opens the character
   demonstrator — a preview of GilbertOne's presentation, and a design review of an animation scope,
   with no model, no server, no voice and no patient data behind it. The live GilbertOne is the panel
   the orb opens on every patient page; this door reaches look and motion only, and neither the
   matcher nor the voice policy is wired to it.

   Open on the deployed site since 17 September 2026, and it was development-only until that day.
   The page is unchanged by the move: it still carries the preview badge, every refusal notice and the
   voice capability's own words, it is still linked from no navigation anywhere in the product, and it
   still reaches no network, no microphone and no browser media API of any kind. What changed is who
   can be shown it — a reviewer with the address, on the deployed preview, rather than somebody with
   the repository and a dev server.

   The patient pays 0.15 kB gzipped for that: the door itself, on the first view. Everything behind it
   — the demonstrator, the rig, the widget, the manifest and the two contracts it quotes — is a
   dynamic import and arrives only when the address is opened, which is why the rest of a page nobody
   will navigate to costs the people this is built for nothing at all. Measured on 17 September:
   275.57 kB before and 275.72 kB after, across the same 13 files. */
const GilbertOnePreview = lazy(() => import('./features/GilbertOneDemo'));

export default function Doorway() {
 const [role, setRoleState] = useState<RoleId>(() => roleFromSearch(window.location.search));
 /* Back and forward have to work. A role is a URL, so a reader who presses Back after opening the
    dispatch board expects her own visits again, and a switcher that only wrote forward would give
    her a page that did not change. */
 useEffect(() => {
  const onPop = () => setRoleState(roleFromSearch(window.location.search));
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
 }, []);
 const setRole = useCallback((next: RoleId) => {
  if (role === next) return;
  // Keep history writes outside a React state updater: Strict Mode can replay updaters.
  window.history.pushState(null, '', `${window.location.pathname}${searchForRole(window.location.search, next, window.location.pathname === '/')}`);
  setRoleState(next);
 }, [role]);
 const { surface, workspace } = roleOf(role);
 if (new URLSearchParams(window.location.search).get('preview') === 'gilbertone') {
  /* Its own waiting card rather than the role one: `Opening` names a role and its opening line, and
     neither is true of a design review. */
  return <Suspense fallback={<div className="opening"><div className="opening-card" role="status"><h1>GilbertOne</h1><p className="helper">Getting the preview ready.</p></div></div>}>
   <GilbertOnePreview/>
  </Suspense>;
 }
 return <RoleContext.Provider value={{ role, setRole }}>
  {surface === 'patient' ? <App/>
   : <Suspense fallback={<Opening role={role}/>}>
      {/* The role is also the audience the assistant serves in that workspace, passed on so the
         shells never hold a second copy of the door's one vocabulary. */}
      {workspace ? <ClinicalWorkspace key={role} role={workspace} audience={role}/> : <BackOffice audience={role}/>}
     </Suspense>}
 </RoleContext.Provider>;
}

/* What a person sees while a workspace is on its way.
 *
 * It says the true thing rather than spinning: this code was not downloaded until you asked for it,
 * which is why there is a wait at all and why there was not one on the screen before. On a fast
 * connection it is one frame; on the connection this product is designed for it is the difference
 * between a blank screen and an explained one. Nothing here animates — a spinner that runs forever
 * is the one piece of motion this codebase refuses outright. */
function Opening({ role }: { role: RoleId }) {
 const { label, opensTo } = roleOf(role);
 /* No `.clinical` and no `.aurora`: both live in the sheet that travels with the workspace, so a
     fallback wearing them would be unstyled for exactly as long as it is on the screen. */
 return <div className="opening">
  <div className="opening-card" role="status">
   <p className="eyebrow">OPENING</p>
   <h1>{label}</h1>
   <p className="muted">{opensTo}</p>
   <p className="helper">Getting your workspace ready. This may take a moment on a slower connection.</p>
  </div>
 </div>;
}
