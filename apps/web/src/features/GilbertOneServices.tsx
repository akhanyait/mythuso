import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  HeartPulse,
  Info,
  Radio,
  Stethoscope,
  UserRound,
} from "lucide-react";
import ui from "../../../../packages/catalog/assistant-chat-ui.json";
import {
  fetchStatus,
  prepareHandover,
  searchKnowledge,
  startTriage,
  submitHandover,
  type HandoverPrepared,
  type KnowledgeAnswer,
  type ServiceRefusal,
  type StatusAnswer,
  type TriageStart,
  type TriageStep,
} from "../lib/gilbertone-service";
import type { AudienceId, Reply } from "../lib/assistant";

/* The panel's connected-capability region, and the whole of the patient-facing integration with the
 * GilbertOne service's versioned routes beyond the turn the bridge already carries.
 *
 * WHY IT IS A REGION OF ITS OWN RATHER THAN A NEW REPLY KIND. The deterministic engine in
 * lib/assistant.ts — its Reply union, its affect mapping, its spoken words — is a frozen contract
 * shared with the two native apps through fixtures, and threading a service capability through it
 * would be a contract change on three platforms for something that is web-only and, in every case
 * here, gated. So this region sits beside the transcript, consumes the routes directly through
 * lib/gilbertone-service.ts, and renders the service's own sentences. It adds nothing to the
 * patient entry: it is a lazily-imported chunk of the already-lazy panel.
 *
 * THE HONESTY RULE THIS WHOLE FILE OBEYS. Every capability it offers is either connected or it says
 * why it is not, in the service's own words. Triage is gated on a ratified protocol, so pressing
 * "Start a structured assessment" meets the contract's triage-not-ratified sentence and an offer to
 * prepare a nurse summary instead — never an invented question or score. Device readings are gated
 * on a data protection assessment, so the vitals row is a "connect a device" explanation, never a
 * simulated reading. Handover submission is gated on identity, roster and destination contracts, so
 * "Send to a nurse" meets the contract's clinician-routing-not-built sentence. A refusal's message is
 * the contract's own, read off the response by the client and rendered here verbatim; where nothing
 * answered at all, the region says so in the catalogue's own "unreachable" words. Nothing is faked
 * and nothing is labelled connected that is not.
 *
 * NO BACKGROUND CALLS. Every route here is reached only from a press — the status route on "Check
 * what is connected", retrieval on "See the sources", the gates on their own buttons. Opening the
 * panel fires nothing, which is both a privacy posture and the reason the existing journeys that do
 * not stub these routes stay green. */

const copy = ui.service;

/* {count} is the only token this region fills, and it is filled from the service's own withheld
   count rather than typed, so a thin answer reads as thin. */
const withCount = (sentence: string, count: number) =>
  sentence.replace("{count}", String(count));

type Assessment =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "declined" }
  | { state: "refused"; refusal: ServiceRefusal }
  | { state: "active"; triage: TriageStart; step: TriageStep | null };

type Handover =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "prepared"; prepared: HandoverPrepared }
  | { state: "refused"; refusal: ServiceRefusal };

type Submit =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "refused"; refusal: ServiceRefusal }
  | { state: "sent" };

export type GilbertOneServicesProps = {
  readonly sessionId: string;
  readonly audience: AudienceId;
  readonly consented: boolean;
  readonly lastAsked: string | null;
  readonly lastReplyKind: Reply["kind"] | null;
};

/* A refusal rendered the way every refusal in this region is: the service's own sentence where it
   gave one, the catalogue's unreachable words where nothing answered. One component so the three
   places that show a refusal cannot drift in how they say it. */
function Refusal({ refusal }: { readonly refusal: ServiceRefusal }) {
  return (
    <p className="gos-refusal" role="status">
      <Info size={15} aria-hidden="true" />
      <span>{refusal.message ?? copy.unreachable}</span>
    </p>
  );
}

export function GilbertOneServices({
  sessionId,
  audience,
  consented,
  lastAsked,
  lastReplyKind,
}: GilbertOneServicesProps) {
  const [status, setStatus] = useState<
    "idle" | "loading" | StatusAnswer | ServiceRefusal
  >("idle");
  const [knowledge, setKnowledge] = useState<
    "idle" | "loading" | KnowledgeAnswer | ServiceRefusal
  >("idle");
  const [assessment, setAssessment] = useState<Assessment>({ state: "idle" });
  const [handover, setHandover] = useState<Handover>({ state: "idle" });
  const [submit, setSubmit] = useState<Submit>({ state: "idle" });

  /* Start again gives the panel a new conversation id; everything this region gathered belongs to
     the old conversation and is dropped rather than shown beside a fresh one. */
  useEffect(() => {
    setStatus("idle");
    setKnowledge("idle");
    setAssessment({ state: "idle" });
    setHandover({ state: "idle" });
    setSubmit({ state: "idle" });
  }, [sessionId]);

  const checkStatus = useCallback(() => {
    setStatus("loading");
    void fetchStatus().then(setStatus);
  }, []);

  const seeSources = useCallback(() => {
    if (!lastAsked) return;
    setKnowledge("loading");
    void searchKnowledge(lastAsked).then(setKnowledge);
  }, [lastAsked]);

  const beginAssessment = useCallback(() => {
    setAssessment({ state: "loading" });
    void startTriage(sessionId).then((result) => {
      if (result.ok) setAssessment({ state: "active", triage: result, step: null });
      else setAssessment({ state: "refused", refusal: result });
    });
  }, [sessionId]);

  /* The nurse door the triage refusal offers, and the same door a person reaches for directly. It
     prepares the pack for review; nothing is sent by preparing it. */
  const prepare = useCallback(() => {
    setHandover({ state: "loading" });
    setSubmit({ state: "idle" });
    void prepareHandover(sessionId).then((result) => {
      if (result.ok) setHandover({ state: "prepared", prepared: result });
      else setHandover({ state: "refused", refusal: result });
    });
  }, [sessionId]);

  const send = useCallback(() => {
    if (handover.state !== "prepared") return;
    setSubmit({ state: "loading" });
    void submitHandover(handover.prepared.handoverRef).then((result) => {
      if (result.ok) setSubmit({ state: "sent" });
      else setSubmit({ state: "refused", refusal: result });
    });
  }, [handover]);

  /* The guided-assessment offer appears only for a health concern the classifier could not place or
     the orchestrator answered — never for an emergency (answered immediately on its own path), a
     greeting, an identity or a voice question, and never for a handover already in progress. It is a
     deterministic read of the last reply's kind, so nothing here guesses at clinical content. */
  const offerAssessment =
    audience === "patient" &&
    (lastReplyKind === "unmatched" || lastReplyKind === "service") &&
    assessment.state === "idle";

  /* This region is the patient's. A staff preview is scoped to the contract's own questions and is
     not offered a guided assessment or a clinician handover from here. */
  if (audience !== "patient" || !consented) return null;

  const statusView = () => {
    if (status === "idle")
      return (
        <button type="button" className="gos-button" onClick={checkStatus}>
          <Radio size={16} aria-hidden="true" />
          {copy.statusButton}
        </button>
      );
    if (status === "loading")
      return <p className="gos-loading" role="status">{copy.statusButton}…</p>;
    if (!status.ok) return <Refusal refusal={status} />;
    const rows: [string, boolean][] = [
      [copy.statusAzure, status.azure],
      [copy.statusOllama, status.ollama],
      [copy.statusProduction, status.production],
      [copy.statusActivated, status.activated],
    ];
    return (
      <div className="gos-status-read">
        <dl className="gos-status-list">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd data-yes={value || undefined}>{value ? copy.statusYes : copy.statusNo}</dd>
            </div>
          ))}
        </dl>
        <p className="gos-note">{copy.statusGated}</p>
        <button type="button" className="gos-button subtle" onClick={checkStatus}>
          {copy.statusRecheck}
        </button>
      </div>
    );
  };

  const knowledgeView = () => {
    if (knowledge === "loading")
      return <p className="gos-loading" role="status">{copy.knowledgeButton}…</p>;
    if (knowledge === "idle") return null;
    if (!knowledge.ok) return <Refusal refusal={knowledge} />;
    if (!knowledge.sources.length)
      return <p className="gos-note">{copy.knowledgeEmpty}</p>;
    return (
      <div className="gos-sources">
        <ul>
          {knowledge.sources.map((source) => (
            <li key={source.id}>
              <span className="gos-source-title">{source.title}</span>
              <span className="gos-source-from">
                <strong>{copy.knowledgeSourceLabel}:</strong> {source.source}
              </span>
            </li>
          ))}
        </ul>
        {knowledge.withheld > 0 && (
          <p className="gos-note">
            {withCount(
              knowledge.withheld === 1
                ? copy.knowledgeWithheld
                : copy.knowledgeWithheldMany,
              knowledge.withheld,
            )}
          </p>
        )}
      </div>
    );
  };

  const assessmentView = () => {
    if (assessment.state === "loading")
      return <p className="gos-loading" role="status">{copy.triageAccept}…</p>;
    if (assessment.state === "active") {
      /* Reached only if the triage gate ever opens on a ratified protocol. The question is the
         protocol's own, carried through the client; the answer step is wired but the gate answers
         first today, so this branch is the honest shape of a connected assessment rather than a
         simulated one. */
      const step = assessment.step ?? null;
      const question = step?.question ?? assessment.triage.question;
      return (
        <div className="gos-triage-active">
          <p className="gos-question">{question}</p>
          <p className="gos-note">
            {copy.triageOfferBody}
          </p>
        </div>
      );
    }
    if (assessment.state === "refused") {
      return (
        <div className="gos-triage-refused">
          <p className="gos-heading">{copy.triageRefusedHeading}</p>
          <Refusal refusal={assessment.refusal} />
          <p className="gos-note">{copy.nurseOfferBody}</p>
          {handover.state === "idle" && (
            <button type="button" className="gos-button" onClick={prepare}>
              <UserRound size={16} aria-hidden="true" />
              {copy.nurseOfferButton}
            </button>
          )}
        </div>
      );
    }
    return null;
  };

  const handoverView = () => {
    if (handover.state === "loading")
      return <p className="gos-loading" role="status">{copy.handoverPrepareButton}…</p>;
    if (handover.state === "refused") {
      /* A session with nothing to hand over, or a service that did not answer: either way the
         person reads the reason, and the device prompt below explains the gate that keeps a real
         reading out of the pack. */
      return <Refusal refusal={handover.refusal} />;
    }
    if (handover.state !== "prepared") return null;
    const { pack, handoverRef, preparedAt } = handover.prepared;
    const row = (label: string, value: string) => (
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );
    const list = (label: string, items: readonly string[]) => (
      <div>
        <dt>{label}</dt>
        <dd>
          {items.length ? (
            <ul className="gos-inline-list">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            copy.handoverNone
          )}
        </dd>
      </div>
    );
    return (
      <div className="gos-handover">
        <p className="gos-review-lead">{copy.handoverReviewLead}</p>
        <dl className="gos-pack">
          {row(copy.handoverSummaryLabel, pack.summary || copy.handoverNone)}
          {row(copy.handoverUrgencyLabel, pack.urgency || copy.handoverNone)}
          {list(copy.handoverSymptomsLabel, pack.symptoms)}
          {list(copy.handoverVitalsLabel, pack.vitals)}
          {list(copy.handoverSourcesLabel, pack.sources)}
          {row(copy.handoverRefLabel, handoverRef)}
          {preparedAt && row(copy.handoverPreparedLabel, preparedAt)}
        </dl>
        {!pack.vitals.length && (
          <div className="gos-device">
            <p className="gos-heading">
              <Activity size={15} aria-hidden="true" />
              {copy.vitalsConnectHeading}
            </p>
            <p className="gos-note">{copy.vitalsConnectBody}</p>
          </div>
        )}
        {submit.state === "refused" ? (
          <div className="gos-submit-refused">
            <p className="gos-heading">{copy.handoverSubmittedHeading}</p>
            <Refusal refusal={submit.refusal} />
          </div>
        ) : submit.state === "sent" ? (
          <p className="gos-note" role="status">{copy.handoverSubmittedHeading}</p>
        ) : (
          <button
            type="button"
            className="gos-button"
            onClick={send}
            disabled={submit.state === "loading"}
          >
            <Stethoscope size={16} aria-hidden="true" />
            {submit.state === "loading" ? `${copy.handoverSubmitButton}…` : copy.handoverSubmitButton}
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="gos-region" aria-label={copy.regionLabel}>
      <details className="gos-block">
        <summary>
          <Radio size={16} aria-hidden="true" />
          {copy.statusHeading}
        </summary>
        <p className="gos-lead">{copy.statusLead}</p>
        {statusView()}
      </details>

      {(offerAssessment || assessment.state !== "idle") && (
        <div className="gos-block gos-assessment">
          {offerAssessment ? (
            <>
              <p className="gos-heading">
                <HeartPulse size={16} aria-hidden="true" />
                {copy.triageOfferHeading}
              </p>
              <p className="gos-lead">{copy.triageOfferBody}</p>
              <div className="gos-actions">
                <button type="button" className="gos-button" onClick={beginAssessment}>
                  {copy.triageAccept}
                </button>
                <button
                  type="button"
                  className="gos-button subtle"
                  onClick={() => setAssessment({ state: "declined" })}
                >
                  {copy.triageDecline}
                </button>
              </div>
            </>
          ) : (
            assessmentView()
          )}
          {handover.state !== "idle" && handoverView()}
        </div>
      )}

      <details className="gos-block" open={handover.state !== "idle" || undefined}>
        <summary>
          <UserRound size={16} aria-hidden="true" />
          {copy.handoverHeading}
        </summary>
        {handover.state === "idle" ? (
          <>
            <p className="gos-lead">{copy.nurseOfferBody}</p>
            <button type="button" className="gos-button" onClick={prepare}>
              <Stethoscope size={16} aria-hidden="true" />
              {copy.handoverPrepareButton}
            </button>
          </>
        ) : (
          handoverView()
        )}
        <div className="gos-device gos-device-static">
          <p className="gos-heading">
            <Activity size={15} aria-hidden="true" />
            {copy.vitalsConnectHeading}
          </p>
          <p className="gos-note">{copy.vitalsConnectBody}</p>
        </div>
      </details>

      {lastAsked && (
        <details className="gos-block">
          <summary>
            <BookOpen size={16} aria-hidden="true" />
            {copy.knowledgeHeading}
          </summary>
          <p className="gos-lead">{copy.knowledgeLead}</p>
          {knowledge === "idle" ? (
            <button type="button" className="gos-button" onClick={seeSources}>
              <BookOpen size={16} aria-hidden="true" />
              {copy.knowledgeButton}
            </button>
          ) : (
            knowledgeView()
          )}
        </details>
      )}
    </section>
  );
}

export default GilbertOneServices;
