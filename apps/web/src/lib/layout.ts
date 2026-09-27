import { useCallback, useSyncExternalStore } from 'react';

/* Whether the screen has room for a second column, asked of the viewport and watched rather than asked
 * once — a window dragged narrower, or a phone turned, changes the answer while the screen is open.
 *
 * It exists for one decision, made on the settings screens of 28 September 2026 (the Configuration tab
 * and GilbertOne's Speech settings): what an administrator can change comes first, and what is merely in
 * force — a setting's default and limits, the providers' cards, the locked items — sits beside it where
 * there is room and folds into a closed disclosure where there is not. A disclosure's open state is an
 * attribute, not a style, so the width has to be known in script; the stylesheets key the second column
 * off the same answer (data-layout="wide") rather than off a media query of their own, so the fold and the
 * column cannot disagree about which screen they are on.
 *
 * 1200px, not the sidebar's 1000: at 1000 the Control Tower's sidebar and the Configuration tree already
 * take a third of the width, and a second column beside a setting's card left the card too narrow to hold
 * its own figure. At 1200 the settings column is still wider than a phone held sideways. */
const WIDE = '(min-width: 1200px)';

const query = () => typeof matchMedia === 'function' ? matchMedia(WIDE) : null;

export function useWideLayout(): boolean {
 const subscribe = useCallback((notify: () => void) => {
  const list = query();
  list?.addEventListener('change', notify);
  return () => list?.removeEventListener('change', notify);
 }, []);
 return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
}
