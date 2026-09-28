import { deferred } from './deferred';

/* Live well, the journal, and what was brought to a visit, as the application imports them. The screens are in WellbeingScreens.tsx and arrive
   on the first press rather than the first load; the names, the props and every word on them are unchanged. */
const screens = () => import('./WellbeingScreens');
export const LiveWell = deferred(screens, 'LiveWell', 'Opening Live well.');
export const BroughtToTheVisit = deferred(screens, 'BroughtToTheVisit', 'Opening what you brought to the visit.');
