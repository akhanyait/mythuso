/* The four patient screens the Lovable export draws and the live app did not have — connected devices,
   messages, test results and the consultation's waiting room — as the router, the sidebar and the More
   hub name them.

   Only the names and what to say while each arrives. This file is on the patient's first load, because the
   router, the shell and the hub all read it; the screens themselves and every contract behind them arrive
   on a dynamic import from App.tsx the first time one is opened. One place for the four names, so the
   sidebar row, the hub row, the address and the screen cannot name four different pages. */
export const patientScreenRoutes = {
 devices: { opens: 'Connected devices', opening: 'Opening your connected devices.' },
 messages: { opens: 'Messages', opening: 'Opening your messages.' },
 results: { opens: 'Test results', opening: 'Opening your test results.' },
 consultation: { opens: 'Online consultation', opening: 'Opening the consultation.' },
 /* The Wednesday demo's simulated call. Named here so the consultation screen's button and
    ?open=video-consult open one page, and so the screen itself stays on a dynamic import. */
 videoConsult: { opens: 'Video consult', opening: 'Opening the video consult.' },
 /* The Wednesday demo's six questions. Named once so the home button, `?open=book-care` and the
    screen cannot disagree. Not a sidebar row: the home is the only door in. */
 bookCare: { opens: 'Book care', opening: 'Opening Book care.' },
} as const;

export const patientScreenNames: string[] = Object.values(patientScreenRoutes).map(route => route.opens);
export const patientScreenOpenings: Record<string, string> =
 Object.fromEntries(Object.values(patientScreenRoutes).map(route => [route.opens, route.opening]));
