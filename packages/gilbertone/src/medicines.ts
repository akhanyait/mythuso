import assistant from "../../catalog/assistant.json" with { type: "json" };

/* "Read my medicine list back" — the list as the record holds it, in sentences, and nothing done
   to it.

   This module never sees a record. The caller hands it the lines — name, dose, frequency, whether
   the entry is protected, whether it was stopped — and it returns the contract's sentences around
   them, from answers.medicines in packages/catalog/assistant.json. The line itself is the contract's
   template over the record's own fields, so no dose is typed here or anywhere but the record.

   THE TWO REFUSALS. A protected entry is never read: an antiretroviral or a psychiatric medicine is
   released by the patient entry by entry to a named party, and a reply read aloud in a kitchen is
   not a named party. The sentence saying protected entries are not read is said every time, whether
   or not one exists, because saying it only when one exists would say that one exists. And nothing
   is changed: the answer carries the sentence refusing to add, stop or alter anything, and the
   module has no way to. A stopped medicine is left out because the record marks it stopped, not
   because this module decided it was. No network, no model, no environment variable. */

export type MedicineLine = {
  name: string;
  dose: string;
  frequency: string;
  protected: boolean;
  stopped: boolean;
};

export type MedicinesAnswer = {
  heading: string;
  lead: string;
  /* The lines read back, in the record's order; empty when there is nothing to read. */
  lines: string[];
  noMedicines: string | null;
  protectedNotRead: string;
  neverChanges: string;
  preview: string;
};

const words = assistant.answers.medicines;
const fill = (sentence: string, values: Record<string, string>) =>
  sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

export function medicinesAnswer(medicines: readonly MedicineLine[]): MedicinesAnswer {
  const lines = medicines
    .filter((m) => !m.protected && !m.stopped)
    .map((m) =>
      fill(words.line, { name: m.name, dose: m.dose, frequency: m.frequency }),
    );
  return {
    heading: words.heading,
    lead: words.lead,
    lines,
    noMedicines: lines.length ? null : words.noMedicines,
    protectedNotRead: words.protectedNotRead,
    neverChanges: words.neverChanges,
    preview: words.preview,
  };
}
