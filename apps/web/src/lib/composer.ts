import { useLayoutEffect, type KeyboardEvent, type RefObject } from 'react';

/* The assistant's composer, in the patient's panel and on the public sheet, is a field that grows with
 * what is written in it — the Lovable handoff's prompt input — and stops at a cap its stylesheet sets
 * as max-height, past which it scrolls inside itself, so a long message never pushes the conversation
 * out of the sheet. Imported by the two lazy assistant chunks and by nothing on either entry.
 *
 * Measured, rather than CSS `field-sizing: content`: that property is Chromium's alone today, so the
 * phones this is built for — Safari on an iPhone, a Samsung browser a version behind — would need this
 * measurement as the fallback anyway, and one path is one path the journeys can hold. The height is
 * layout, set once per change and never transitioned: the motion rules allow transform and opacity.
 *
 * It is measured whenever the words change, whoever wrote them — typing, a speech transcript, a send
 * that empties the field — and again when the sheet opens or the window is resized, because a closed
 * dialog has no layout, and a field measured inside one would be set to nothing. */
export function useGrowingField(field: RefObject<HTMLTextAreaElement | null>, words: string, shown: boolean) {
 useLayoutEffect(() => {
  const element = field.current;
  if (!element) return;
  /* Measured with its scrollbar held off: at one line every longer message overflows, and a scrollbar
     that appears for the measurement narrows the lines and makes the words look taller than they are. */
  const fit = () => {
   const { scrollTop } = element;
   element.style.height = '';
   if (!element.getClientRects().length) return false;
   element.style.overflowY = 'hidden';
   const { borderTopWidth, borderBottomWidth } = getComputedStyle(element);
   element.style.height = `${element.scrollHeight + parseFloat(borderTopWidth) + parseFloat(borderBottomWidth)}px`;
   element.style.overflowY = '';
   /* Past the cap, writing at the end keeps the end in view with the padding under it — the browser
      scrolls only as far as the caret, which leaves the last line on the field's bottom edge — and
      writing anywhere else leaves the field where the person had it. */
   element.scrollTop = element.selectionEnd === element.value.length ? element.scrollHeight : scrollTop;
   return true;
  };
  /* The sheet is shown by an effect of its own, which runs after this one on the render that opens it,
     so a field with no layout yet is measured again on the next frame rather than left at one line. */
  const frame = fit() ? 0 : requestAnimationFrame(fit);
  window.addEventListener('resize', fit);
  return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', fit); };
 }, [field, words, shown]);
}

/* Enter sends and Shift+Enter starts a new line, as the single-line field sent on Enter before it grew.
 * An Enter that finishes an IME composition — choosing the word on a Japanese or Chinese keyboard — is
 * the keyboard's own and never a send; Safari reports that Enter as keyCode 229 with isComposing false,
 * which is why both are asked. The send goes through the form, so it is the same submit Send makes. */
export function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
 if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
 event.preventDefault();
 event.currentTarget.form?.requestSubmit();
}
