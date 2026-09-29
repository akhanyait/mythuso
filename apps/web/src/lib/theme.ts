import { useCallback, useSyncExternalStore } from 'react';

/* Light by default; dark is a switch a person turns on — the founder's decision of 29 September 2026,
 * made after seeing the whole product go dark under a dark OS scheme. So the OS never decides: the
 * generated tokens carry the dark roles only under `[data-theme="dark"]` on the document element, and
 * this store is the one thing that sets it.
 *
 * It is a module-level store, like lib/motion.ts's, because the shells and the landing page each draw
 * the control and two copies of "is it dark" is how a switch comes to say the wrong thing. It keeps
 * nothing across a load: the preview may not keep anything in the browser's storage of any kind, so a
 * person who wants dark turns it on for this visit, and the next visit is light again. That is the
 * honest cost of the storage rule, and it is written here rather than worked around. */
const theme = {
 dark: false,
 listeners: new Set<() => void>(),
 set(dark: boolean) {
  this.dark = dark;
  const root = document.documentElement;
  if (dark) root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  for (const notify of [...this.listeners]) notify();
 },
};

/** Whether the page is dark, and the way to switch it. */
export function useTheme() {
 const dark = useSyncExternalStore(
  useCallback((notify: () => void) => { theme.listeners.add(notify); return () => { theme.listeners.delete(notify); }; }, []),
  () => theme.dark,
  () => false,
 );
 const toggle = useCallback(() => theme.set(!theme.dark), []);
 return { dark, toggle } as const;
}
