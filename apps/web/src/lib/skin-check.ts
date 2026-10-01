import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import {
  skinContract,
  skinSummaryRows,
  type SkinAnswers,
} from "../../../../packages/gilbertone/src/skin-check.ts";

/* The web's half of Show GilbertOne a rash (1 October 2026). The rules, the outcomes and the notes are
   packages/gilbertone/src/skin-check.ts's, shared with nothing typed here; this file holds the two
   things only a browser has to decide — whether a chosen file is a photo it may hold, and what the
   clipboard is handed — and says nothing itself. It arrives with the screen, behind the panel's own
   dynamic import, so neither reaches the patient's first view.

   A photo is checked by the browser's own description of it and never opened: its type must be one
   the contract accepts, which no video type is, and its size within the panel's attachment limit.
   The input itself asks for any image, so a phone offers its camera beside its gallery, and the type
   is checked here once a file is chosen. Nothing reads its bytes — not FileReader, not a canvas, not
   a request — because the only thing the check does with a photo is hand the browser an object URL
   to show it back, and revoke it. */

export function photoProblem(file: File): string | null {
  if (!skinContract.photo.accept.includes(file.type)) return skinContract.photo.notImage;
  if (file.size > ui.attachments.limitBytes) return ui.attachments.tooLarge;
  return null;
}

/* The notes as text for the clipboard: the card's title and its lines. The clipboard is the person's
   own; the app stores nothing and sends nothing. */
export const notesText = (answers: SkinAnswers, typed: string, photoHeld: boolean) =>
  [skinContract.summary.title, ...skinSummaryRows(answers, typed, photoHeld).map((row) => row.line)].join("\n");
