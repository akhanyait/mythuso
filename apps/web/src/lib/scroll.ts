/* Going to a new screen means starting at the top of it.
 *
 * All three shells called `window.scrollTo({ top: 0 })` on every navigation, and none of them ever
 * moved anything: the document does not scroll here. The shell is a fixed-height grid and `main` is
 * the scroll container, so the browser's scrolling element is already at zero and the call was a
 * no-op that looked like a fix. What it costs is small and constant — navigate from a control at
 * the foot of a long screen and you land part-way down the next one, on a heading you did not ask
 * for. Measured at 390px it was 1490px down, which on that viewport is most of two screens.
 *
 * Both are reset, and the document second, because a shell is not the only caller and a page that
 * genuinely scrolls its own document should still go to the top of it. */
export function scrollToTop() {
 document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' });
 window.scrollTo({ top: 0, behavior: 'instant' });
}
