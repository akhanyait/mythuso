import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { useRole } from '../features/DemoLogin';
import { founderDoor as door, founderWords as words, probe, useFounderState, type FounderState } from '../lib/founder-access';
import { portalContract } from '../lib/portal';
import { PageHead } from '../features/portal/Parts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import './founder-gate.css';

/* The founder's door (packages/catalog/founder-access.json#door), on the founder's instruction of
 * 28 September 2026: "When you click on Control Tower it must bring logins with 2FA."
 *
 * WHAT IT IS. In production the Control Tower and the back office are drawn behind this screen, and the
 * portal is rendered only while the assistant service says the founder's session is live. It is the same
 * sign-in as the reveal panel's — the same password and authenticator code, the same four routes, the
 * same HttpOnly cookie, the same lock and burned codes — because it *is* the reveal panel's form: SignIn
 * arrives through a dynamic import of that module, so the product has one sign-in form and one file that
 * draws a password field. This file never carries a factor, never requests anything of its own, and holds
 * nothing but what lib/founder-access.ts already remembers for the page.
 *
 * WHAT IT REFUSES. It fails closed. Where the service says founder access is dark on this server, or does
 * not answer at all, the door stays a door and says so in the contract's own sentence; it never falls
 * through to the portal, and there is exactly one line below that draws the portal, under exactly one
 * condition — scripts/check-boundaries.mjs holds it there. It is not an admin login: it admits one person,
 * says on its face that no other account exists yet, and grants nothing, because every factor is checked
 * by the service and the door only asks it. The four demonstration previews are not behind it.
 *
 * WHEN IT HOLDS. `founderGateHolds` is exactly import.meta.env.PROD, or the address saying gate=founder —
 * the second half is how the journeys draw it against the dev server, and how the thirty Control Tower
 * journeys stay untouched. No storage of any kind, nothing written to an address, nothing logged. */

/* The shortest wait before the service is asked again once this browser's clock says the session is already
   over. A clock ahead of the service's computes an end in the past; the service answers that the session is
   still live, the same expiry comes back as a new state, and a bare one-second wait asked it every second
   until the service's own clock caught up. Half a minute is still prompt for a session that really ended. */
const REPROBE_FLOOR_MS = 30_000;

const SignIn = lazy(() => import('../features/portal/gilbertone/founder/FounderAccess').then(m => ({ default: m.SignIn })));

export const founderGateHolds = (): boolean =>
 import.meta.env.PROD || new URLSearchParams(window.location.search).get(door.param) === door.value;

export function FounderGate({ open }: { open: () => ReactNode }) {
 const state = useFounderState();
 useEffect(() => { void probe(); }, []);
 /* The service is asked again when its own clock says the session has ended, and when the tab comes back
    into view: a door that learned of the end only from the next failed request would draw the portal for
    a founder the service signed out an hour ago. The answer to that question is what puts the door back. */
 useEffect(() => {
  if (state.phase !== 'signed-in') return;
  const ends = Date.parse(state.expiresAt);
  const left = ends - Date.now();
  const timer = Number.isFinite(ends) ? window.setTimeout(() => void probe(), left > 0 ? left + 1000 : REPROBE_FLOOR_MS) : 0;
  const seen = () => { if (document.visibilityState === 'visible') void probe(); };
  document.addEventListener('visibilitychange', seen);
  return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', seen); };
 }, [state]);
 if (state.phase === 'signed-in') return <>{open()}</>;
 return <Door state={state}/>;
}

/* The screen itself: the wordmark on the handoff's calm ground, in one elevated Card, the contract's heading
   and sentence, and then whichever of the three things the service said — still asking, refused (dark,
   cross-site, locked: drawn in the service's words, with the form withheld), or signed out, which is the
   form. The way back is the handoff's ghost Button: a quiet action, never a second primary beside Sign in. */
function Door({ state }: { state: Exclude<FounderState, { phase: 'signed-in' }> }) {
 const { setRole } = useRole();
 return <div className="founder-gate">
  <main className="founder-gate-main" aria-labelledby="founder-gate-heading">
   <Card variant="elevated" padding="lg" className="founder-gate-card rise">
    <img className="founder-gate-mark" src="/brand/mythuso-logo.svg" alt="MyThuso"/>
    {/* The same head every Control Tower screen wears (Parts.tsx#PageHead): the portal's name as the eyebrow,
        the contract's heading and sentence, and what the service said as the status line. */}
    <PageHead className="founder-gate-head" eyebrow={portalContract.name} title={door.words.heading} titleId="founder-gate-heading" lead={door.words.sentence}
     status={state.phase === 'checking' || state.phase === 'refused' ? <>
      {state.phase === 'checking' && <p className="founder-gate-status" role="status" aria-busy="true">{words.checking}</p>}
      {state.phase === 'refused' && <>
       <p className="founder-gate-refusal" role="status">{state.message}</p>
       <p className="founder-gate-status">{door.words.holding}</p>
      </>}
     </> : undefined}/>
    {state.phase === 'signed-out' && <Suspense fallback={<p className="founder-gate-status" role="status" aria-busy="true">{portalContract.loading.sentence}</p>}>
     <SignIn message={state.message}/>
    </Suspense>}
    {/* Not the founder: the patient app, which is what the address means with no role on it. */}
    <Button variant="ghost" className="founder-gate-leave" onClick={() => setRole('patient')}>{door.words.leave}</Button>
   </Card>
  </main>
 </div>;
}
