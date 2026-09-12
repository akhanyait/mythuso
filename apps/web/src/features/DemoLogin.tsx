import { createContext, useContext, useState } from 'react';
import { ArrowRight, ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Modal } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { simulationRefusal } from '../lib/capabilities';
import { initialsOf } from '../lib/names';
import { BAR_ROLES, partyFor, roleOf, roles, whoIs, type RoleId } from '../lib/roles';

/* The way in, and the only one.
 *
 * MyThuso has no accounts — `accounts` is a simulated capability and the contract says so on every
 * screen that depends on it. Until this landed, that fact was told four times: a patient sign-in, a
 * clinical sign-in offering four workspaces, a back-office sign-in offering one, and a dialog in the
 * patient's More hub explaining that the clinical application lives at another address. Each of them
 * carried the same notice, and each then asked the reader to pick a workspace anyway, which is a
 * sign-in wall with the wall drawn on. The founder's instruction was to stop drawing it.
 *
 * So: one bar, sitting where the preview disclosure already sat, in all three shells. Three roles in
 * it, the other three one press behind "All roles", and the current one filled charcoal — the same
 * pill the navigation uses for where-you-are, because that is exactly what this says.
 *
 * Two things it must not become, and both are in packages/catalog/capabilities.json under
 * a-demo-login-is-not-an-account:
 *
 *   It must not look like an account. The panel renders this capability's notice and the refusal
 *   the contract writes for the switcher itself, word for word; the bar never says "signed in as".
 *
 *   It must not be quieter than the four screens it replaced. Those screens carried the notice, so
 *   the panel behind the bar carries it, on every surface, whichever role is open.
 */

/* The role, and how to change it, without every shell taking two more props. The three shells are
   written by different hands and one of them is loaded lazily; a context is the seam that does not
   require the patient app to know the clinical one exists. */
export const RoleContext = createContext<{ role: RoleId; setRole: (id: RoleId) => void }>({
 role: 'patient', setRole: () => {}
});
export const useRole = () => useContext(RoleContext);

/* What the register says about the party a role opens as. The door shows it for the same reason the
   clinical sidebar does: a lapsed clearance is not news you should first hear inside the workspace
   it has already withdrawn dispatch from. */
const credentialOf = (subjectId: string | null) =>
 subjectId ? whoIs(subjectId, 'Everything this role could dispatch is withdrawn until that is put right.') : null;

/* `surface` is the same additive class the patient application passes its other dialogs: a modal is
   rendered into the top layer rather than inside the shell that opened it, so it cannot inherit the
   surface it belongs to. The clinical shells pass nothing and are unchanged. */
export function DemoBar({ note, surface = '' }: { note: string; surface?: string }) {
 const { role, setRole } = useRole();
 const [panel, setPanel] = useState(false);
 const current = roleOf(role);
 /* Three roles fit in the bar and there are six. When the one you are in is not one of the three,
    the door to the rest carries it and wears the current pill — otherwise the back office reads as
    three unselected choices and nothing saying where you are, which is the one thing navigation has
    to say before anything else on the screen means anything. */
 const inBar = BAR_ROLES.includes(role);
 return <div className="demo-bar">
  {/* The disclosure keeps its own element, its own class and its own words. It is not part of the
      switcher and must not start reading as a label for it. */}
  <p className="demo-pill" role="note"><span className="status-dot"/>{note}</p>
  <div className="demo-login">
   <span className="demo-login-label" id="demo-login-label">Demo login</span>
   {/* Wide enough for the bar: three roles and the door to the rest. Below 720px this is display:none
       and the single control under it takes over — six labels and four targets at 44px do not fit
       across 320px, and a bar that overflows is worse than one that asks for a second press. */}
   <div className="demo-login-roles" role="group" aria-labelledby="demo-login-label">
    {BAR_ROLES.map(id => <button key={id} type="button" aria-pressed={role === id}
      className={role === id ? 'is-current' : ''} onClick={() => setRole(id)}>{roleOf(id).label}</button>)}
   </div>
   <button type="button" className={`demo-login-all${inBar ? '' : ' is-current'}`} aria-haspopup="dialog" onClick={() => setPanel(true)}>
    <span className="demo-login-all-wide">{inBar ? 'All roles' : current.label}</span>
    <span className="demo-login-all-narrow">Demo login<b>{current.label}</b></span>
    <ChevronDown size={15}/>
   </button>
  </div>
  {panel && <Modal surface={surface} title="Open MyThuso as" onClose={() => setPanel(false)}>
   <RolePanel onPick={id => { setRole(id); setPanel(false); }}/>
  </Modal>}
 </div>;
}

/* Every role, what it opens the app to do, and who it opens as. The rows are the same shape the four
   sign-in screens used, deliberately: it is the one list in the product whose job is "choose a party
   from the register", and a second shape for it would be a second thing to keep in step. */
export function RolePanel({ onPick }: { onPick: (id: RoleId) => void }) {
 const { role } = useRole();
 return <div className="form-stack role-panel">
  <NotConnected of="accounts"/>
  {/* The contract's own sentence about this control, rather than a reassurance written next to it.
      Reword it in capabilities.json and the slug stops resolving, so the screen fails loudly
      instead of going on refusing something in words nobody says any more.

      It needs the lead-in. The refusal list is written as imperatives — "Send anything to a real
      handset." — which read correctly under the status page's heading and read as an instruction
      anywhere else. So the heading comes with it. */}
  <p className="role-refuses"><strong>What the demo login will not do.</strong> {simulationRefusal('accounts', 'grant-a-role-the-demo-login-chooses-which-workspace-to-draw-it-authenticates-nobody-and-no-workspace-it-opens-is-reached-by-having-permission-to')}</p>
  <div className="staff-signin-roles">{roles.map(r => {
   const party = partyFor(r);
   const credential = credentialOf(r.subjectId);
   return <button className="record-row" key={r.id} aria-current={role === r.id ? 'true' : undefined} onClick={() => onPick(r.id)}>
    <span className="avatar small">{party ? initialsOf(party.name) : 'You'}</span>
    <span>
     <strong>{r.label}</strong>
     <small>{party ? `${party.name} · ${party.register} · ${party.reference}` : 'The person booking a visit, and the family they book for'}</small>
     <small className="role-opens">{r.opensTo}</small>
     {credential && <small className={`role-credential${credential.stopped ? ' stop' : ''}`}>
      {credential.stopped ? <ShieldAlert size={13}/> : <ShieldCheck size={13}/>}{credential.credential}
     </small>}
    </span>
    <ArrowRight size={17}/>
   </button>;
  })}</div>
 </div>;
}
