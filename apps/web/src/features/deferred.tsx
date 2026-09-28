import { Suspense, lazy, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { StateBlock } from '../components/States';

/* A patient screen that is not on the first view, handed over on the first press rather than the first load.
 *
 * The application imports these screens by name, statically, from modules that used to carry the screens
 * themselves — so every one of them rode in the patient's first download. `deferred` keeps the name and the
 * props and swaps the body for a component that fetches the real one when it is first rendered, saying what it
 * is opening while it does, in a sentence rather than a spinner. Nothing is lost if the fetch is slow: the
 * sentence is a status a screen reader announces, and it is replaced by the page, not animated.
 *
 * A FETCH THAT FAILS SAYS SO. A person who has lost signal in a taxi and presses "View access history" must
 * read that the connection is gone, not an opening sentence that never ends: the promise tests/states.spec.ts
 * holds for the log itself holds for the door in front of it. So a chunk that does not arrive renders the
 * offline block when the phone knows it is offline, the error block otherwise, each with a retry — and the
 * retry makes a fresh attempt rather than replaying React.lazy's cached failure, which is why the lazy
 * component is remade per attempt. */
type PropsOf<C> = C extends (props: infer P) => ReactNode ? P : never;
const subjectOf = (opening: string) => {
 const words = opening.replace(/^Opening\s+/i, '').replace(/[.…]+$/, '').trim();
 return words ? words[0].toUpperCase() + words.slice(1) : 'This screen';
};
export function deferred<M, K extends keyof M>(load: () => Promise<M>, name: K, opening: string, subject = subjectOf(opening)) {
 type P = PropsOf<M[K]> & object;
 return function Deferred(props: P) {
  const [attempt, retry] = useState(0);
  const Page = useMemo(() => lazy(() => load()
   .then(m => ({ default: m[name] as ComponentType<P> }))
   .catch(() => ({ default: (function Unreached() {
    return <StateBlock state={typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'} subject={subject} onRetry={() => retry(a => a + 1)}>{null}</StateBlock>;
   }) as unknown as ComponentType<P> }))), [attempt]);
  return <Suspense fallback={<p className="helper" role="status">{opening}</p>}><Page {...props}/></Suspense>;
 };
}
