import { deferred } from './deferred';

/* A completed visit's summary and a cancelled visit's record, as the application imports them. The screens are in VisitSummaryScreens.tsx and arrive
   on the first press rather than the first load; the names, the props and every word on them are unchanged. */
const screens = () => import('./VisitSummaryScreens');
export const PastVisit = deferred(screens, 'PastVisit', 'Opening what happened at this visit.');
export const CancelledVisit = deferred(screens, 'CancelledVisit', 'Opening the cancelled visit.');
