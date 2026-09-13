import framing from '../../../../packages/catalog/framing.json' with { type: 'json' };
import { EXPIRY_WARNING_DAYS, roleById, subjectStatusLabels, summarise } from './vetting';
import { subjectById } from './vetting-fixtures';
import { initialsOf } from './names';

/* Who you can open MyThuso as, in one table.
 *
 * There were four front doors — the patient app, a clinical sign-in that offered four workspaces, a
 * back-office sign-in that offered one, and the landing page linking at two of them. Four doors is
 * one door per audience, which is right for a product with accounts and wrong for one with none:
 * every one of them ended in the same sentence, that there is nothing to sign in to, and then asked
 * the reader to choose anyway. The founder's instruction was to stop pretending and make the choice
 * the door: one address, a role you pick, and no wall in front of it.
 *
 * So this is the table the door is built from, and the only place a role's identity is written down.
 * The four clinical subject ids used to live in shells/StaffShell.tsx and the back office's in
 * shells/AdminShell.tsx, which meant the door could not name the person behind a role without
 * importing the workspace it was about to open — and that is how a picker ends up loading every
 * screen it offers. The names, registers and references here are read out of the vetting register,
 * so a role whose clearance lapses says so on the door as well as inside the workspace.
 *
 * `surface` is what actually gets downloaded, and it is deliberately coarser than `id`: the four
 * clinical roles are one bundle because they are one application, and picking Doctor rather than
 * Nurse changes the navigation rather than the code.
 *
 * `opensTo` is the sentence each workspace shows under its own first section. It is not written
 * here: packages/catalog/framing.json holds the six, because iOS carried a seven-case copy of the
 * same sentences and a TypeScript file is a home two of the three applications cannot read. The
 * shell reads them back through `openingLine` and the phones read the generated `FramingData`, so
 * the door, the screen behind it and both native apps cannot start describing one job differently. */

export type Surface = 'patient' | 'clinical' | 'back-office';
/* The four workspaces inside the clinical application, named here as well as in the shell that
   draws them. The shell cannot be imported from this module — the door would then pull in the very
   bundle it exists to defer — so shells/StaffShell.tsx checks its own table against this type
   instead, and a fifth workspace added there fails to compile until it is added here. */
export type ClinicalWorkspaceId = 'Nurse' | 'Doctor' | 'Partner' | 'Control Tower';
export type RoleId = 'patient' | 'nurse' | 'doctor' | 'partner' | 'control-tower' | 'back-office';

export type Role = {
 readonly id: RoleId;
 /** What the switcher calls it. Short, because three of these sit in a bar on a phone. */
 readonly label: string;
 readonly surface: Surface;
 /** The workspace key inside the clinical application, for the four roles that have one. */
 readonly workspace: ClinicalWorkspaceId | null;
 /** The party on the vetting register this role opens as, where there is one. */
 readonly subjectId: string | null;
 /** What a person opens the app to do in this role — one line, in their own terms. */
 readonly opensTo: string;
};

/* Loud rather than blank: a role whose opening line is missing from the contract would otherwise
   render an empty paragraph on the door somebody signs in through, and nothing would say so. */
const openingFor = (id: RoleId): string => {
 const opening = framing.opening.find(o => o.role === id);
 if (!opening) throw new Error(`packages/catalog/framing.json has no opening line for the role "${id}". Every role shows one on the door it signs in through.`);
 return opening.line;
};

export const roles: readonly Role[] = [
 { id: 'patient', label: 'Patient', surface: 'patient', workspace: null, subjectId: null,
   opensTo: openingFor('patient') },
 { id: 'nurse', label: 'Nurse', surface: 'clinical', workspace: 'Nurse', subjectId: 'N-205',
   opensTo: openingFor('nurse') },
 { id: 'doctor', label: 'Doctor', surface: 'clinical', workspace: 'Doctor', subjectId: 'D-401',
   opensTo: openingFor('doctor') },
 { id: 'partner', label: 'Pharmacy partner', surface: 'clinical', workspace: 'Partner', subjectId: 'P-501',
   opensTo: openingFor('partner') },
 { id: 'control-tower', label: 'Control Tower', surface: 'clinical', workspace: 'Control Tower', subjectId: 'O-801',
   opensTo: openingFor('control-tower') },
 { id: 'back-office', label: 'Back office', surface: 'back-office', workspace: null, subjectId: 'A-901',
   opensTo: openingFor('back-office') }
];

/* The three the founder put in the bar itself. Everything else is one press further, behind "All
   roles" — a bar that lists six workspaces at 390px either overflows or drops below 44px, and both
   of those are worse than a second press. */
export const BAR_ROLES: readonly RoleId[] = ['patient', 'nurse', 'doctor'];

export const roleOf = (id: RoleId): Role => {
 const found = roles.find(r => r.id === id);
 /* Loud rather than a silent fall back to the patient app: a door that opens the wrong workspace
    when it cannot read its own table is worse than one that will not open. */
 if (!found) throw new Error(`No role "${id}" in lib/roles.ts`);
 return found;
};

/* What a workspace's own first section says it is for. The clinical shell draws these as the blurb
   under its heading and the door draws them as what a role opens the app to do; they are one
   sentence because they answer one question. Keyed by the section id the shell uses, which is the
   only thing the shell can look them up by without importing its own table into this module. */
const OPENING_SECTION: Record<string, RoleId> = {
 Schedule: 'nurse', 'Review queue': 'doctor', Orders: 'partner', Dispatch: 'control-tower'
};
export const openingLine = (section: string): string => {
 const id = OPENING_SECTION[section];
 /* Loud rather than undefined, for the same reason `roleOf` is: a heading whose sentence quietly
    renders as nothing is a screen that has stopped explaining itself, and nothing would say so. */
 if (!id) throw new Error(`No role opens the app at section "${section}". The four that do are: ${Object.keys(OPENING_SECTION).join(', ')}.`);
 return roleOf(id).opensTo;
};

/** Who a role signs in as, read from the vetting register rather than typed beside the label. */
export function partyFor(role: Role) {
 if (!role.subjectId) return null;
 const subject = subjectById(role.subjectId);
 if (!subject) throw new Error(`Role "${role.id}" names vetting subject "${role.subjectId}" and the register has no such party.`);
 return { name: subject.name, register: roleById(subject.roleId)?.name ?? '', reference: subject.reference };
}

/* The register entry behind the person, and the sentence a sidebar or a door shows about it. Derived
   from the same summarise() the vetting console decides with, so a workspace cannot look cleared in
   the chrome while the console has suspended it.
   A countdown is only news inside the window the contract warns on. "SANC registration renews in
   243 days" is a number nobody can act on taking up the one line the sidebar has for something a
   clinician might need to do today, so outside EXPIRY_WARNING_DAYS it says what is passing instead.

   It lived in shells/StaffShell.tsx, and shells/AdminShell.tsx imported it from there — so opening
   the back office pulled the clinical application in behind it, which is precisely the cost the
   entry split exists to avoid. It is a question about the register rather than about a sidebar, so
   it is here, where the door can ask it without loading a workspace. */
export function whoIs(subjectId: string, withdrawn: string) {
 const subject = subjectById(subjectId)!;
 const state = summarise(subject);
 const due = state.nextDue && state.nextDue.days >= 0 && state.nextDue.days <= EXPIRY_WARNING_DAYS ? state.nextDue : null;
 const credential = state.status === 'suspended' || state.status === 'declined'
  ? `${subjectStatusLabels[state.status]}. ${withdrawn}`
  : due ? `${due.check.name} renews in ${due.days} days.`
   : `${state.passed} of ${state.total} checks passing on the register.`;
 return { subject, roleName: roleById(subject.roleId)?.name ?? '', state, credential, initials: initialsOf(subject.name),
  stopped: state.status === 'suspended' || state.status === 'declined' };
}

/* The role in the address bar, and nothing else remembers it.
 *
 * No storage of any kind — the rule that keeps patient data out of this preview applies to which
 * workspace somebody was last looking at as well. The URL is the whole state, which also means a
 * role is a link: /app/?role=doctor opens the review queue, and that is what makes this an auto
 * login rather than a menu. An unreadable value opens the patient app, because that is what the
 * address without a role means and a stranger's link is not a reason to show somebody a dispatch
 * board. */
export const ROLE_PARAM = 'role';
export function roleFromSearch(search: string): RoleId {
 const asked = new URLSearchParams(search).get(ROLE_PARAM);
 return roles.some(r => r.id === asked) ? asked as RoleId : 'patient';
}
export function searchForRole(search: string, id: RoleId): string {
 const params = new URLSearchParams(search);
 /* The patient app is what the bare address means, so it does not carry a parameter. A door that
    rewrites / into /?role=patient has made its own default look like somebody's choice. */
 if (id === 'patient') params.delete(ROLE_PARAM); else params.set(ROLE_PARAM, id);
 const query = params.toString();
 return query ? `?${query}` : '';
}

/* ---- The section in the address bar --------------------------------------------------------
 *
 * A second piece of state that lives in the URL and nowhere else, for the same reason the role
 * does: no storage, and a link that opens the screen it says it opens.
 *
 * The landing page's hero carries four calls to action out of packages/catalog/hero.json, and two
 * of them name a section of the patient application rather than the application. "Explore family
 * care" landing somebody on their own home screen is a banner that did not do the one thing it
 * offered, so `/app/?open=live-well` opens Live well and `/app/?open=my-family` opens the family.
 *
 * It is read once, when the application starts, and never written. A section is where a link put
 * you, not where you are: once somebody is inside and navigating, the address stops following them
 * — which is the honest behaviour while the app has no routing of its own, rather than a history
 * of pages that Back cannot actually walk.
 *
 * An unreadable value opens the overview, because that is what the address without one means. A
 * stranger's link is not a reason to show somebody a screen this application does not have. */
export const OPEN_PARAM = 'open';
export const slugOfSection = (page: string) => page.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const searchForSection = (page: string | null) => page ? `?${OPEN_PARAM}=${slugOfSection(page)}` : '';
export function sectionFromSearch(search: string, pages: readonly string[], fallback: string): string {
 const asked = new URLSearchParams(search).get(OPEN_PARAM);
 return pages.find(page => slugOfSection(page) === asked) ?? fallback;
}
