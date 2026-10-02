import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import {
  skinContract,
  skinSummaryRows,
  type SkinAnswers,
} from "../../../../packages/gilbertone/src/skin-check.ts";

/* The web's half of Show GilbertOne a rash (1 October 2026). The rules, the outcomes and the notes are
   packages/gilbertone/src/skin-check.ts's, shared with nothing typed here; this file holds the two
   things only a browser has to decide — whether a chosen file is a photo or a clip it may hold, and
   what the clipboard is handed — and says nothing itself. It arrives with the screen, behind the panel's own
   dynamic import, so neither reaches the patient's first view.

   A file is checked by the browser's own description of it and never opened: its type must be one
   the contract accepts for a photo or for a clip, and a photo's size within the panel's attachment
   limit. A clip has no size limit here, because the browser reads it where it already is and nothing
   copies it; its limit is its length, which only the video element showing it can tell, so the
   screen asks clipLengthProblem once the element has read the clip's metadata. The input itself asks
   for any image or video, so a phone offers its camera beside its gallery, and the type is checked
   here once a file is chosen. Nothing reads its bytes — not FileReader, not a canvas, not a request —
   because the only thing the check does with a photo or a clip is hand the browser an object URL to
   show it back, and revoke it. */

export type Taken = { as: "photo" | "clip" } | { as: "refused"; why: string };

export function takenAs(file: File): Taken {
  if (skinContract.clip.accept.includes(file.type)) return { as: "clip" };
  if (!skinContract.photo.accept.includes(file.type)) return { as: "refused", why: skinContract.photo.notImage };
  if (file.size > ui.attachments.limitBytes) return { as: "refused", why: ui.attachments.tooLarge };
  return { as: "photo" };
}

/* A clip whose length the browser cannot tell is refused rather than guessed at: the cap is the
   contract's promise to the patient that only a short clip is held, and an unknown length keeps it
   for nobody. A recording made by a page's own recorder often reports no length at all. */
export function clipLengthProblem(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return skinContract.clip.lengthUnknown;
  if (seconds > skinContract.clip.maxSeconds) return skinContract.clip.tooLong;
  return null;
}

/* The notes as text for the clipboard: the card's title and its lines. The clipboard is the person's
   own; the app stores nothing and sends nothing. */
export const notesText = (answers: SkinAnswers, typed: string, photoHeld: boolean, clipHeld: boolean) =>
  [skinContract.summary.title, ...skinSummaryRows(answers, typed, photoHeld, clipHeld).map((row) => row.line)].join("\n");
