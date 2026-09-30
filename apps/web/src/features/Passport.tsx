import { deferred } from './deferred';

/* The Health Passport's pages, as the application imports them, arriving on a dynamic import.
 *
 * App.tsx and the Passport page import these names statically, and until 28 September 2026 that put every
 * one of them on the patient's first load: the trends, the timeline, the care team, the certificate, the
 * prescription's journey, the device sheets — about a tenth of the whole first view, for screens a person
 * reaches by pressing something on the Passport. They live in PassportScreens.tsx now, and each name here is
 * a small component that fetches that module the first time one of them is opened, says so in a sentence
 * while it does, and then renders the page exactly as it was. The names, the props and the words are
 * unchanged, so nothing that opens a page had to learn anything. */
export type { Integration, PassportTab } from './PassportScreens';

const screens = () => import('./PassportScreens');
export const HealthTrends = deferred(screens, 'HealthTrends', 'Opening your health trends.');
export const DevicePermission = deferred(screens, 'DevicePermission', 'Opening the permission sheet.');
export const ReadingsExplained = deferred(screens, 'ReadingsExplained', 'Opening what your readings mean.');
export const CareTimeline = deferred(screens, 'CareTimeline', 'Opening your care timeline.');
export const CareTeam = deferred(screens, 'CareTeam', 'Opening your care team.');
export const MedicalCertificate = deferred(screens, 'MedicalCertificate', 'Opening the certificate.');
export const PrescriptionJourney = deferred(screens, 'PrescriptionJourney', 'Opening what happens to a prescription.');
/* The Passport's tabbed home draws its panel from here, so the panels' figures, charts and the dispensing
   contract arrive on the first press of the Passport rather than with every patient's first load. One
   component for every tab, so choosing a tab re-keys the panel inside it and never re-fetches. */
export const HealthPanel = deferred(screens, 'HealthPanel', 'Opening your Health Passport.');
export const AuthorisationLead = deferred(screens, 'AuthorisationLead', 'Opening your medicines.');
