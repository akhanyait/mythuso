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
 return <RoleContext.Provider value={{ role, setRole }}>
  {surface === 'patient' ? <App/>
   : <Suspense fallback={<Opening role={role}/>}>
      {workspace ? <ClinicalWorkspace key={role} role={workspace}/> : <BackOffice/>}
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
