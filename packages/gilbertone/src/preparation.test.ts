import test from "node:test";
import assert from "node:assert/strict";
import { preparationContract, preparationFor } from "./preparation.ts";
import { medicinesAnswer } from "./medicines.ts";
import services from "../../catalog/services.json" with { type: "json" };
import assistant from "../../catalog/assistant.json" with { type: "json" };

test("every service the catalogue sells has a preparation list, read common items first", () => {
  for (const service of services) {
    const answer = preparationFor(service.id);
    assert.equal(answer.kind, "list");
    if (answer.kind !== "list") continue;
    assert.equal(answer.serviceName, service.name);
    assert.ok(answer.lead.includes(service.name));
    assert.deepEqual(answer.items.slice(0, preparationContract.common.length), preparationContract.common);
    assert.ok(answer.items.length > preparationContract.common.length, service.id);
    /* Nobody clinical has read any list yet, and the answer says so rather than hiding it. */
    assert.equal(answer.reviewedBy, null);
    assert.equal(answer.review, preparationContract.answer.unreviewed);
    assert.equal(answer.neverInstructs, preparationContract.answer.neverInstructs);
  }
});

test("nothing booked is said plainly, and no service is guessed at", () => {
  assert.deepEqual(preparationFor(null), {
    kind: "none",
    sentence: preparationContract.answer.nothingBooked,
  });
  assert.throws(() => preparationFor("no-such-service"), /has no list for the service/);
});

test("the medicine list is read back as given, protected and stopped entries left out, the refusals said every time", () => {
  const words = assistant.answers.medicines;
  const answer = medicinesAnswer([
    { name: "Amlodipine", dose: "5 mg", frequency: "Once daily, morning", protected: false, stopped: false },
    { name: "Hydrochlorothiazide", dose: "12.5 mg", frequency: "Once daily, morning", protected: false, stopped: true },
    { name: "Tenofovir", dose: "300 mg", frequency: "Once daily", protected: true, stopped: false },
  ]);
  assert.deepEqual(answer.lines, ["Amlodipine, 5 mg, Once daily, morning."]);
  assert.equal(answer.noMedicines, null);
  assert.equal(answer.protectedNotRead, words.protectedNotRead);
  assert.equal(answer.neverChanges, words.neverChanges);
  /* The same sentence with no protected entry at all: its presence must reveal nothing. */
  const plain = medicinesAnswer([
    { name: "Amlodipine", dose: "5 mg", frequency: "Once daily, morning", protected: false, stopped: false },
  ]);
  assert.equal(plain.protectedNotRead, words.protectedNotRead);
  const empty = medicinesAnswer([]);
  assert.deepEqual(empty.lines, []);
  assert.equal(empty.noMedicines, words.noMedicines);
  assert.equal(empty.protectedNotRead, words.protectedNotRead);
});
