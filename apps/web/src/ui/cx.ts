/* The handoff composes classes with clsx and tailwind-merge. Nothing here needs merging — every visual
   decision is a class of ui.css with its own name, so two of them never fight over one utility — and a
   dependency the patient never downloads is still one more thing to audit. This is the whole of clsx that
   the components spend. */
export function cx(...parts: (string | false | null | undefined)[]): string {
 return parts.filter(Boolean).join(' ');
}
