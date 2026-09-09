import { createRoot } from 'react-dom/client';
import { Status } from './features/Status';
/* The fifth entry, and the smallest one on purpose.
 *
 * This is the page somebody opens when they suspect nothing works — a funder doing due diligence, a
 * partner deciding whether to sign, a reader who has just been told by a screen that it does not
 * book a visit and wants to know what else that is true of. They are as likely to be on a metered
 * connection in a car park as at a desk, so it takes the design system and stops: no shell, no
 * feature modules, no app.css. core.css and one small sheet of its own.
 *
 * It renders packages/catalog/capabilities.json and nothing else. Nobody edits this page when an
 * integration lands — the boolean in the contract changes and the row changes with it, which is the
 * only version of a status page that stays true past the week it was written. */
import './surface/core.css';
import './surface/status.css';
createRoot(document.getElementById('root')!).render(<Status/>);
