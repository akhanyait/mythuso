import test from "node:test";
import assert from "node:assert/strict";
import {
  answerIntake,
  beginIntake,
  currentQuestion,
  intakeConsent,
  intakeContract,
  intakeGroupFor,
  intakeReviewSentence,
  questionsFor,
  summaryRows,
} from "./intake.ts";
import { evaluateMessage } from "./engine.ts";

/* The shared fixtures in packages/catalog/symptom-intake.json, run against this package's own
   recogniser — never a typed duplicate of them. An "emergency" fixture is asserted through the
   engine, which checks the emergency words before anything else: the recogniser is never asked
   about a message the emergency words already answered, and the fixture says so by never reaching it. */
test("every intake fixture in the contract opens the group it expects, or nothing, or the emergency answer", () => {
  const disagreements: string[] = [];
  for (const fixture of intakeContract.fixtures.messages) {
    if (fixture.expect === "emergency") {
      if (evaluateMessage(fixture.says).route !== "emergency")
        disagreements.push(`"${fixture.says}" was not an emergency`);
      continue;
    }
    const group = intakeGroupFor(fixture.says);
    if ((group?.id ?? null) !== fixture.expect)
      disagreements.push(`"${fixture.says}" opened ${group?.id ?? "nothing"}, expected ${fixture.expect ?? "nothing"}`);
  }
  assert.deepEqual(disagreements, []);
});

test("the flow fixture asks every question once, common ones first, and the notes card has one row per answer", () => {
  const flow = intakeContract.fixtures.flow;
  const questions = questionsFor(flow.group);
  assert.equal(flow.answers.length, questions.length, "the fixture answers every question the group asks");
  assert.deepEqual(
    questions.slice(0, intakeContract.common.questions.length).map((q) => q.id),
    intakeContract.common.questions.map((q) => q.id),
  );
  let state = beginIntake(flow.group);
  for (const [i, answer] of flow.answers.entries()) {
    assert.equal(state.done, false);
    assert.equal(currentQuestion(state)?.id, questions[i].id);
    const next = answerIntake(state, answer);
    assert.equal(next.kind, "intake");
    if (next.kind !== "intake") return;
    state = next;
  }
  assert.equal(state.done, true);
  assert.equal(state.stopped, false);
  assert.equal(currentQuestion(state), null);
  const rows = summaryRows(state);
  assert.equal(rows.length, flow.rows);
  for (const [i, row] of rows.entries()) {
    assert.equal(row.label, questions[i].ask);
    assert.equal(row.value, flow.answers[i]);
    /* The line is the contract's format with the two fields in it, and nothing typed here. */
    assert.equal(
      row.line,
      intakeContract.summary.line.replace("{question}", questions[i].ask).replace("{answer}", flow.answers[i]),
    );
  }
});

test("the state is never written into: every turn is a new object and the old one is unchanged", () => {
  const first = beginIntake("headache");
  const frozen = JSON.stringify(first);
  const second = answerIntake(first, "Today");
  assert.notEqual(second, first);
  assert.equal(JSON.stringify(first), frozen);
  assert.equal(second.kind, "intake");
  if (second.kind !== "intake") return;
  assert.equal(second.step, 1);
  assert.equal(second.answers.length, 1);
  assert.equal(first.answers.length, 0);
});

test("the stop word ends the intake where it is and keeps what was answered; an answer that only contains it does not", () => {
  let state = beginIntake("stomach");
  const afterOne = answerIntake(state, "A few days");
  assert.equal(afterOne.kind, "intake");
  if (afterOne.kind !== "intake") return;
  const stopped = answerIntake(afterOne, intakeContract.answer.stop.word.toUpperCase());
  assert.equal(stopped.kind, "intake");
  if (stopped.kind !== "intake") return;
  assert.equal(stopped.done, true);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.answers.length, 1);
  assert.equal(currentQuestion(stopped), null);
  /* Answering after the end changes nothing. */
  assert.equal(answerIntake(stopped, "more"), stopped);
  /* "it does not stop" is an answer, not the stop word. */
  const carriesOn = answerIntake(afterOne, "it does not stop");
  assert.equal(carriesOn.kind, "intake");
  if (carriesOn.kind !== "intake") return;
  assert.equal(carriesOn.stopped, false);
  assert.equal(carriesOn.answers[1].answer, "it does not stop");
});

test("an emergency typed as an answer ends the intake with the emergency answer, whatever the question was", () => {
  const state = answerIntake(beginIntake("headache"), "A few days");
  assert.equal(state.kind, "intake");
  if (state.kind !== "intake") return;
  const emergency = intakeContract.fixtures.messages.find((f) => f.expect === "emergency")!;
  assert.deepEqual(answerIntake(state, emergency.says), { kind: "emergency" });
  assert.deepEqual(answerIntake(state, "I think I am having a heart attack"), { kind: "emergency" });
});

test("an empty answer records nothing and hands the same state back, so the caller reads unmatchedInside", () => {
  const state = beginIntake("fever");
  assert.equal(answerIntake(state, "   "), state);
  assert.ok(intakeContract.answer.unmatchedInside.length > 0);
});

test("a chips answer is recorded in the option's own words; anything else as typed", () => {
  const state = beginIntake("headache");
  const chips = answerIntake(state, "a few DAYS");
  assert.equal(chips.kind, "intake");
  if (chips.kind !== "intake") return;
  assert.equal(chips.answers[0].answer, "A few days");
  const typed = answerIntake(state, "since Tuesday");
  assert.equal(typed.kind, "intake");
  if (typed.kind !== "intake") return;
  assert.equal(typed.answers[0].answer, "since Tuesday");
});

test("consent is the contract's own words, whole message; a group nothing declares is refused loudly", () => {
  for (const word of intakeContract.answer.consent.yesWords) assert.equal(intakeConsent(word), "yes");
  for (const word of intakeContract.answer.consent.noWords) assert.equal(intakeConsent(word), "no");
  assert.equal(intakeConsent("my head still hurts"), null);
  assert.throws(() => beginIntake("no-such-group"), /has no group/);
});

test("nobody clinical has reviewed the questions, and the sentence says so rather than hiding it", () => {
  assert.equal(intakeContract.review.reviewedBy, null);
  assert.equal(intakeReviewSentence(), intakeContract.review.unreviewed);
});
