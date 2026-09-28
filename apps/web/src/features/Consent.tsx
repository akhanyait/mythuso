import { deferred } from './deferred';

/* The consent centre, the access history and the Information Officer, as the application imports them. The screens are in ConsentScreens.tsx and arrive
   on the first press rather than the first load; the names, the props and every word on them are unchanged. */
const screens = () => import('./ConsentScreens');
export const ConsentCentre = deferred(screens, 'ConsentCentre', 'Opening your consent centre.');
export const AccessHistory = deferred(screens, 'AccessHistory', 'Opening who has looked at your record.');
export const InformationOfficer = deferred(screens, 'InformationOfficer', 'Opening the Information Officer.');
