import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, X } from "lucide-react";
import {
  entryReviewSentence,
  entrySourceSentence,
  pressSkinOption,
  skinContract as c,
  skinOutcome,
  skinReviewSentence,
  skinSummaryRows,
  type ShownFirstAid,
  type SkinAnswers,
  type SkinOutcome,
} from "../../../../packages/gilbertone/src/skin-check.ts";
import { notesText, photoProblem } from "../lib/skin-check";
import { skinSendRefusal } from "../lib/skin-check.generated";
import { Button } from "../ui/Button";
import "./skin-check.css";

/* Show GilbertOne a rash, on the web — the founder's ask of 1 October 2026, drawn inside the patient's
   GilbertOne panel on its own dynamic import (features/Assistant.tsx), so neither this screen, its
   contract nor the knowledge entries behind it reach the patient's first view.

   THE PHOTO. One file input that asks for an image; the browser on a phone offers its camera or its
   gallery. The file is held in this component's state and nowhere else, shown back through an object
   URL that is revoked when the photo is replaced, removed, the check ends or the screen closes — the
   effect's own clean-up, so no path can leave one behind. Nothing reads its bytes and nothing sends
   it: no request, no storage of any kind, no canvas. The contract's sentences under it say exactly that,
   and that nothing looks at it.

   THE ANSWERS reach an outcome only through packages/gilbertone/src/skin-check.ts. Every press is asked
   whether it raised an emergency rule, and one that did hands the option's own words to the
   conversation at once (onEmergency) — the panel renders its own emergency answer and this screen
   closes, the photo with it. Typed words are asked of the emergency matcher the moment she asks to see
   anything, before any rule reads them. Every sentence on this screen is the contract's or a knowledge
   entry's; none is typed here. */

type Props = {
  onBack: () => void;
  /* The words that raised an emergency, for the conversation to answer with its own emergency turn. */
  onEmergency: (words: string) => void;
};

function FirstAid({ entry }: { entry: ShownFirstAid }) {
  const w = c.outcomes["general-information"];
  return (
    <article className="sk-entry" aria-label={entry.title}>
      <h5>{entry.title}</h5>
      <ol>
        {entry.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="sk-label">{w.warningsLabel}</p>
      <ul>
        {entry.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="sk-label">{w.whenToCallLabel}</p>
      <p>{entry.whenToCall}</p>
      <p className="sk-source">
        {entrySourceSentence(entry.source)} {entryReviewSentence(entry.reviewedBy)}
      </p>
    </article>
  );
}

export default function SkinCheck({ onBack, onEmergency }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [answers, setAnswers] = useState<SkinAnswers>({});
  const [typed, setTyped] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState("");
  const [outcome, setOutcome] = useState<SkinOutcome | null>(null);
  const [ended, setEnded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => heading.current?.focus(), []);
  /* The one place an object URL is made, and the clean-up that revokes it: replacing the photo,
     removing it, ending the check and closing the screen all pass through here. */
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const choose = (picked: HTMLInputElement) => {
    const next = picked.files?.[0];
    picked.value = "";
    if (!next) return;
    const why = photoProblem(next);
    setProblem(why ?? "");
    if (!why) setFile(next);
  };
  const press = (questionId: string, optionId: string) => {
    const next = pressSkinOption(answers, questionId, optionId);
    const now = skinOutcome(next);
    if (now.kind === "emergency") {
      setFile(null);
      onEmergency(now.says);
      return;
    }
    setAnswers(next);
    setOutcome(null);
    setCopied(false);
  };
  const see = () => {
    const now = skinOutcome(answers, typed);
    if (now.kind === "emergency") {
      setFile(null);
      onEmergency(now.says);
      return;
    }
    setOutcome(now);
  };
  const end = () => {
    setFile(null);
    setAnswers({});
    setTyped("");
    setOutcome(null);
    setProblem("");
    setEnded(true);
  };
  const copy = () => {
    void navigator.clipboard?.writeText(notesText(answers, typed, file !== null)).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  const shown = outcome && outcome.kind !== "incomplete" && outcome.kind !== "emergency";
  const rows = skinSummaryRows(answers, typed, file !== null);

  return (
    <section className="sk" aria-labelledby="sk-title">
      <div className="sk-top">
        <Button variant="ghost" size="sm" onClick={onBack} leadingIcon={<ArrowLeft size={16} aria-hidden="true" />}>
          {c.screen.backLabel}
        </Button>
      </div>
      <h3 id="sk-title" ref={heading} tabIndex={-1}>
        {c.screen.title}
      </h3>
      <p>{c.screen.lead}</p>
      <ul className="sk-not">
        {c.whatItIsNot.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>
      <p className="sk-review">{skinReviewSentence()}</p>

      {ended ? (
        <p className="sk-ended" role="status">
          {c.screen.ended}
        </p>
      ) : (
        <>
          <div className="sk-photo">
            <input
              ref={input}
              className="sk-file"
              type="file"
              accept="image/*"
              aria-label={c.photo.addLabel}
              onChange={(event) => choose(event.currentTarget)}
            />
            <Button variant="secondary" onClick={() => input.current?.click()} leadingIcon={<Camera size={18} aria-hidden="true" />}>
              {file ? c.photo.replaceLabel : c.photo.addLabel}
            </Button>
            {problem && <p role="alert">{problem}</p>}
            {url && (
              <figure className="sk-preview">
                <img src={url} alt={c.photo.alt} />
                <Button variant="ghost" size="sm" onClick={() => setFile(null)} leadingIcon={<X size={16} aria-hidden="true" />}>
                  {c.photo.removeLabel}
                </Button>
              </figure>
            )}
            <p className="sk-quiet">{c.photo.held}</p>
            <p className="sk-quiet">{c.photo.noReader}</p>
            <p className="sk-quiet">{c.photo.videoRefused}</p>
          </div>

          {!shown &&
            c.questions.map((question) => (
              <fieldset key={question.id} className="sk-question">
                <legend>{question.ask}</legend>
                {question.kind === "multi" && <p className="sk-quiet">{c.screen.multiHint}</p>}
                {question.kind === "text" ? (
                  <>
                    <p className="sk-quiet" id="sk-typed-hint">
                      {c.screen.textHint}
                    </p>
                    <textarea
                      className="sk-typed"
                      aria-label={question.ask}
                      aria-describedby="sk-typed-hint"
                      value={typed}
                      maxLength={500}
                      rows={3}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setTyped(event.target.value)}
                    />
                  </>
                ) : (
                  <div className="sk-chips" role="group" aria-label={question.ask}>
                    {("options" in question ? (question.options ?? []) : []).map((option) => (
                      <Button
                        key={option.id}
                        variant="secondary"
                        className="sk-chip"
                        aria-pressed={(answers[question.id] ?? []).includes(option.id)}
                        data-urgent={question.id === "signs" && option.id !== "none" ? "" : undefined}
                        onClick={() => press(question.id, option.id)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                )}
              </fieldset>
            ))}

          {outcome?.kind === "incomplete" && (
            <p className="sk-missing" role="alert">
              {c.screen.missing}
            </p>
          )}

          {outcome?.kind === "sister-today" && (
            <div className="sk-outcome" data-outcome="sister-today" role="region" aria-label={c.outcomes["sister-today"].headline}>
              <h4>{c.outcomes["sister-today"].headline}</h4>
              <p>{c.outcomes["sister-today"].lead}</p>
              {outcome.rules.map((rule) => (
                <div key={rule.id} className="sk-rule">
                  <p className="sk-label">{c.outcomes["sister-today"].becauseLabel}</p>
                  <p className="sk-says">{rule.says}</p>
                  {rule.guidance.length > 0 && <p className="sk-label">{c.outcomes["sister-today"].guidanceLabel}</p>}
                  {rule.guidance.map((g) => (
                    <article key={g.id} className="sk-entry" aria-label={g.title}>
                      <h5>{g.title}</h5>
                      <p>{g.line}</p>
                      <p className="sk-source">
                        {entrySourceSentence(g.source)} {entryReviewSentence(g.reviewedBy)}
                      </p>
                    </article>
                  ))}
                </div>
              ))}
              <p>{c.outcomes["sister-today"].arrange}</p>
              <p className="sk-worse">{c.outcomes["sister-today"].worse}</p>
            </div>
          )}

          {outcome?.kind === "general-information" && (
            <div className="sk-outcome" data-outcome="general-information" role="region" aria-label={c.outcomes["general-information"].headline}>
              <h4>{c.outcomes["general-information"].headline}</h4>
              {outcome.checkFirst.length > 0 && (
                <section className="sk-first" aria-label={c.outcomes["general-information"].checkFirstHeading}>
                  <h5>{c.outcomes["general-information"].checkFirstHeading}</h5>
                  {outcome.checkFirst.map((entry) => (
                    <FirstAid key={entry.id} entry={entry} />
                  ))}
                </section>
              )}
              {outcome.conditions.length ? (
                <>
                  <p>{c.outcomes["general-information"].lead}</p>
                  <p className="sk-only">{c.outcomes["general-information"].onlyAClinician}</p>
                  {outcome.conditions.map((entry) => (
                    <article key={entry.id} className="sk-entry" aria-label={entry.title}>
                      <h5>{entry.title}</h5>
                      <p className="sk-label">{c.outcomes["general-information"].looksLabel}</p>
                      <ul>
                        {entry.looks.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <p className="sk-label">{c.outcomes["general-information"].whenLabel}</p>
                      <p>{entry.when}</p>
                      <p className="sk-source">
                        {entrySourceSentence(entry.source)} {entryReviewSentence(entry.reviewedBy)}
                      </p>
                    </article>
                  ))}
                </>
              ) : (
                <p>
                  {c.outcomes["general-information"].noneMatched} {c.outcomes["general-information"].onlyAClinician}
                </p>
              )}
              <h5>{c.outcomes["general-information"].selfCareHeading}</h5>
              <p className="sk-quiet">{c.outcomes["general-information"].selfCareLead}</p>
              {outcome.selfCare.map((entry) => (
                <FirstAid key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {shown && rows.length > 0 && (
            <div className="sk-notes" role="region" aria-label={c.summary.title}>
              <h4>{c.summary.title}</h4>
              <ul>
                {rows.map((row) => (
                  <li key={row.line}>{row.line}</li>
                ))}
              </ul>
              <Button variant="secondary" onClick={copy}>
                {copied ? c.summary.copiedLabel : c.summary.copyLabel}
              </Button>
              <p className="sk-quiet">
                {c.summary.sendLead} {skinSendRefusal}
              </p>
            </div>
          )}

          <div className="sk-actions">
            {shown ? (
              <Button variant="secondary" onClick={() => setOutcome(null)}>
                {c.screen.changeLabel}
              </Button>
            ) : (
              <Button variant="primary" onClick={see}>
                {c.screen.seeLabel}
              </Button>
            )}
            <Button variant="ghost" onClick={end}>
              {c.screen.endLabel}
            </Button>
          </div>
          <p className="sk-quiet sk-reader">{c.photoReading.sentence}</p>
        </>
      )}
    </section>
  );
}
