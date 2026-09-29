import { useState, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Apple,
  ArrowRight,
  Ban,
  BellRing,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";
import {
  aside,
  communityHelplines,
  communityNavigation,
  hub,
  libraryTabs,
  nutritionCards,
  refusals,
  review,
  screens,
  searchLibrary,
  vaccinationCards,
  type LibraryEntry,
} from "../lib/patient-pages";
import {
  answerIntake,
  beginIntake,
  currentQuestion,
  intakeContract,
  questionsFor,
  summaryRows,
  type IntakeState,
} from "../../../../packages/gilbertone/src/intake.ts";
import "./patient-pages.css";

/* The eight patient pages of the full Lovable export's Phase D, and the "Your health" hub that carries
 * them, in one module behind one dynamic import.
 *
 * WHY ONE MODULE. They are one family — the pages the design asked for and the build did not have — and
 * they share a frame, a refusals panel and the review notice. Splitting them into nine chunks would put
 * nine network round-trips between a patient and the hub's shortcuts, for code that is small and read
 * together. None of it is on the first load: the router carries only each page's name and arrival
 * sentence (patient-pages-routes.generated.ts), and this module and the six knowledge files behind it
 * arrive when somebody opens the hub.
 *
 * WHAT IT WILL NOT DO. Every word is packages/catalog/patient-pages.json's, or an entry of the governed
 * knowledge base that contract names in `derivations`. The symptom checker asks symptom-intake.json's
 * set questions through packages/gilbertone's intake and escalates on the emergency words before it
 * records an answer; it sets no priority, names no cause and gives no advice, and the findings the case
 * pathway works out are for the nurse and never rendered here. The risk assessment computes no score.
 * No screen shows a number the contracts do not hold: where a figure would go, a written empty state
 * says what is missing and why. The emergency number is never restated — the emergency screen this page
 * can open carries it. */

type Nav = { navigate: (page: string) => void; open: (modal: string) => void };
type ScreenAction = { label: string; kind: string; target?: string };

const askAssistant = () =>
  window.dispatchEvent(new CustomEvent("mythuso:ask-assistant"));

/* The frame every page shares: its intro, then the page's own content beside the refusals and the
   review notice. The notice sits in the aside on a wide screen and below the content on a phone, but
   it is on every page, because it is the sentence that qualifies all of them. */
function PageFrame({
  eyebrow,
  heading,
  lead,
  children,
}: {
  eyebrow: string;
  heading: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pp-screen">
      <div className="page-intro">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{heading}</h1>
        <p>{lead}</p>
      </div>
      <div className="pp-layout">
        <div className="pp-main">{children}</div>
        <aside className="pp-about panel" aria-labelledby="pp-refusals-heading">
          <h2 id="pp-refusals-heading">{aside.refusalsHeading}</h2>
          <ul className="pp-refusals">
            {refusals.map((sentence) => (
              <li key={sentence}>
                <Ban size={16} />
                <span>{sentence}</span>
              </li>
            ))}
          </ul>
          <p className="pp-review">
            <ShieldCheck size={16} />
            <span>{review.notice}</span>
          </p>
        </aside>
      </div>
    </div>
  );
}

function Actions({
  actions,
  navigate,
  open,
}: { actions: readonly ScreenAction[] } & Nav) {
  if (actions.length === 0) return null;
  return (
    <div className="pp-actions">
      {actions.map((action) => {
        const onClick =
          action.kind === "navigate"
            ? () => navigate(action.target!)
            : action.kind === "modal"
              ? () => open(action.target!)
              : action.kind === "assistant"
                ? askAssistant
                : undefined;
        return (
          <button
            key={action.label}
            type="button"
            className="secondary m-press"
            onClick={onClick}
          >
            {action.label}
            <ArrowRight size={16} />
          </button>
        );
      })}
    </div>
  );
}

/* One knowledge-base entry as a card: its title, the contract's label beside each field it carries,
   and the source line under it. It renders the entry's own words and nothing composed here. */
function EntryCard({ entry }: { entry: LibraryEntry }) {
  return (
    <article className="pp-entry">
      <h3 className="pp-entry-title">{entry.title}</h3>
      {entry.fields.map((field) => (
        <div className="pp-field" key={field.label}>
          <h4>{field.label}</h4>
          <ul>
            {field.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="pp-source">{entry.sourceText}</p>
    </article>
  );
}

function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="pp-empty">
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

/* ---- The hub ------------------------------------------------------------------------------------ */
const hubIcons: Record<
  string,
  ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  "symptom-checker": Stethoscope,
  "risk-assessment": Activity,
  "health-library": BookOpen,
  "health-timeline": ClipboardList,
  vaccinations: Syringe,
  community: Users,
  nutrition: Apple,
  reminders: BellRing,
};

function Hub({ navigate }: Nav) {
  return (
    <div className="pp-screen">
      <div className="page-intro">
        <div className="eyebrow">{hub.eyebrow}</div>
        <h1>{hub.heading}</h1>
        <p>{hub.lead}</p>
      </div>
      <div className="pp-hub">
        {hub.shortcuts.map((shortcut) => {
          const Icon = hubIcons[shortcut.id] ?? ShieldCheck;
          const route = screens[shortcut.id as keyof typeof screens];
          return (
            <button
              key={shortcut.id}
              type="button"
              className="pp-shortcut panel m-press"
              onClick={() => navigate(route.opens)}
            >
              <span className="pp-shortcut-icon" aria-hidden="true">
                <Icon size={22} strokeWidth={1.7} />
              </span>
              <span className="pp-shortcut-text">
                <strong>{shortcut.title}</strong>
                <small>{shortcut.sub}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          );
        })}
      </div>
      <p className="pp-review pp-review-hub">
        <ShieldCheck size={16} />
        <span>{review.notice}</span>
      </p>
    </div>
  );
}

/* ---- Symptom checker ---------------------------------------------------------------------------- */
function SymptomChecker({ navigate, open }: Nav) {
  const words = screens["symptom-checker"];
  const groups = intakeContract.groups.map((group) => ({
    id: group.id,
    name: group.name,
  }));
  const [state, setState] = useState<IntakeState | null>(null);
  const [emergency, setEmergency] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const answer = (value: string) => {
    if (!state) return;
    const next = answerIntake(state, value);
    setText("");
    if (next.kind === "emergency") {
      setState(null);
      setEmergency(true);
      return;
    }
    setState(next);
  };
  const stop = () => {
    if (!state) return;
    const next = answerIntake(state, intakeContract.answer.stop.word);
    if (next.kind === "intake") setState(next);
  };
  const restart = () => {
    setState(null);
    setEmergency(false);
    setCopied(false);
    setText("");
  };

  const question = state ? currentQuestion(state) : null;
  const total = state ? questionsFor(state.groupId).length : 0;
  const rows = state ? summaryRows(state) : [];
  const notes = rows.map((row) => row.line).join("\n");
  const copy = () => {
    void navigator.clipboard?.writeText(notes).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  let body: React.ReactNode;
  if (emergency) {
    body = (
      <div className="pp-emergency" role="alert">
        <h2>
          <AlertTriangle size={20} />
          {words.emergency.heading}
        </h2>
        <p>{words.emergency.detail}</p>
        <div className="pp-actions">
          <button
            type="button"
            className="primary m-press"
            onClick={() => open(words.emergency.modal)}
          >
            {words.emergency.action}
            <ArrowRight size={16} />
          </button>
          <button type="button" className="secondary m-press" onClick={restart}>
            <RotateCcw size={16} />
            {words.handover.againLabel}
          </button>
        </div>
      </div>
    );
  } else if (!state) {
    body = (
      <div className="pp-picker">
        <h2 className="pp-picker-label">{words.pickerLabel}</h2>
        <div className="pp-chips">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="pp-chip m-press"
              onClick={() => setState(beginIntake(group.id))}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (question && !state.done) {
    body = (
      <div className="pp-ask">
        <p className="pp-progress">
          <span>{words.progressLabel}</span>
          <span className="pp-count">
            {state.step}/{total}
          </span>
        </p>
        <h2 className="pp-question">{question.ask}</h2>
        {question.kind === "chips" ? (
          <div className="pp-chips">
            {question.options?.map((option) => (
              <button
                key={option}
                type="button"
                className="pp-chip m-press"
                onClick={() => answer(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="pp-answer"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) answer(text);
            }}
          >
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label={question.ask}
              placeholder={question.ask}
            />
            <button
              type="submit"
              className="primary m-press"
              disabled={!text.trim()}
            >
              {words.sendLabel}
            </button>
          </form>
        )}
        <button type="button" className="pp-stop" onClick={stop}>
          {words.stopLabel}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="pp-handover">
        <h2>{words.handover.heading}</h2>
        <p className="pp-handover-detail">{words.handover.detail}</p>
        {state.stopped && <p className="pp-stopped">{words.stoppedNote}</p>}
        <dl className="pp-notes">
          {rows.map((row, i) => (
            <div key={i}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="pp-actions">
          <button type="button" className="primary m-press" onClick={copy}>
            {copied ? (
              <>
                <Check size={16} />
                {words.handover.copiedLabel}
              </>
            ) : (
              <>
                <Copy size={16} />
                {words.handover.copyLabel}
              </>
            )}
          </button>
          <button type="button" className="secondary m-press" onClick={restart}>
            <RotateCcw size={16} />
            {words.handover.againLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      {body}
      {!emergency && (
        <Actions actions={words.actions} navigate={navigate} open={open} />
      )}
    </PageFrame>
  );
}

/* ---- Risk assessment ---------------------------------------------------------------------------- */
function RiskAssessment({ navigate, open }: Nav) {
  const words = screens["risk-assessment"];
  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      <div className="pp-blocked" role="note">
        <h2>
          <Ban size={18} />
          {words.blocked.heading}
        </h2>
        <p>{words.blocked.detail}</p>
      </div>
      <h2 className="pp-subheading">{words.wouldCover.heading}</h2>
      <div className="pp-rows">
        {words.wouldCover.rows.map((row) => (
          <div className="pp-row panel" key={row.title}>
            <strong>{row.title}</strong>
            <small>{row.detail}</small>
          </div>
        ))}
      </div>
      <Actions actions={words.actions} navigate={navigate} open={open} />
    </PageFrame>
  );
}

/* ---- Health library ----------------------------------------------------------------------------- */
function HealthLibrary() {
  const words = screens["health-library"];
  const [tabId, setTabId] = useState(libraryTabs[0]!.id);
  const [query, setQuery] = useState("");
  const tab = libraryTabs.find((t) => t.id === tabId) ?? libraryTabs[0]!;
  const results = searchLibrary(tab, query);
  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      <div className="pp-search">
        <Search size={17} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={words.searchLabel}
          placeholder={words.searchPlaceholder}
        />
      </div>
      <div className="pp-tabs" role="tablist" aria-label={words.searchLabel}>
        {libraryTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tabId}
            className="pp-tab m-press"
            onClick={() => {
              setTabId(t.id);
              setQuery("");
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {results.length ? (
        <div className="pp-entries">
          {results.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <EmptyBlock title={words.emptyTitle} detail={words.emptyDetail} />
      )}
    </PageFrame>
  );
}

/* ---- Health timeline ---------------------------------------------------------------------------- */
function HealthTimeline({ navigate, open }: Nav) {
  const words = screens["health-timeline"];
  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      <h2 className="pp-subheading">{words.kindsHeading}</h2>
      <ol className="pp-timeline">
        {words.kinds.map((kind) => (
          <li className="pp-timeline-item" key={kind.title}>
            <strong>{kind.title}</strong>
            <small>{kind.detail}</small>
          </li>
        ))}
      </ol>
      <EmptyBlock title={words.emptyTitle} detail={words.emptyDetail} />
      <Actions actions={words.actions} navigate={navigate} open={open} />
    </PageFrame>
  );
}

/* ---- Vaccinations ------------------------------------------------------------------------------- */
function Vaccinations({ navigate }: Nav) {
  const words = screens["vaccinations"];
  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      <h2 className="pp-subheading">{words.scheduleHeading}</h2>
      <div className="pp-entries">
        {vaccinationCards.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
      <div className="pp-record panel">
        <h2>
          <Syringe size={18} />
          {words.record.heading}
        </h2>
        <EmptyBlock
          title={words.record.emptyTitle}
          detail={words.record.emptyDetail}
        />
        <button
          type="button"
          className="secondary m-press"
          onClick={() => navigate(words.record.target)}
        >
          {words.record.action}
          <ArrowRight size={16} />
        </button>
      </div>
      <p className="pp-note">
        <MapPin size={15} aria-hidden="true" />
        {words.roadToHealth}
      </p>
    </PageFrame>
  );
}

/* ---- Community support -------------------------------------------------------------------------- */
function Community({ navigate, open }: Nav) {
  const words = screens["community"];
  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      <h2 className="pp-subheading">{words.nearHeading}</h2>
      <div className="pp-entries">
        {communityNavigation.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
      <h2 className="pp-subheading">{words.helplinesHeading}</h2>
      <p className="pp-note">{words.helplinesNote}</p>
      <ul className="pp-helplines">
        {communityHelplines.map((line) => (
          <li key={line}>
            <Phone size={16} aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="pp-notconnected panel" role="note">
        <h2>{words.notConnected.heading}</h2>
        <p>{words.notConnected.detail}</p>
      </div>
      <Actions actions={words.actions} navigate={navigate} open={open} />
    </PageFrame>
  );
}

/* ---- Nutrition ---------------------------------------------------------------------------------- */
function Nutrition({ navigate, open }: Nav) {
  const words = screens["nutrition"];
  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      <h2 className="pp-subheading">{words.topicsHeading}</h2>
      <div className="pp-entries">
        {nutritionCards.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
      <ul className="pp-inline-refusals">
        {words.refusals.map((sentence) => (
          <li key={sentence}>
            <Ban size={15} />
            <span>{sentence}</span>
          </li>
        ))}
      </ul>
      <Actions actions={words.actions} navigate={navigate} open={open} />
    </PageFrame>
  );
}

/* ---- Reminders ---------------------------------------------------------------------------------- */
function Reminders({ navigate, open }: Nav) {
  const words = screens["reminders"];
  return (
    <PageFrame
      eyebrow={words.eyebrow}
      heading={words.heading}
      lead={words.lead}
    >
      <h2 className="pp-subheading">{words.kindsHeading}</h2>
      <div className="pp-rows">
        {words.kinds.map((kind) => (
          <div className="pp-row panel" key={kind.title}>
            <strong>{kind.title}</strong>
            <small>{kind.detail}</small>
          </div>
        ))}
      </div>
      <EmptyBlock title={words.emptyTitle} detail={words.emptyDetail} />
      <Actions actions={words.actions} navigate={navigate} open={open} />
    </PageFrame>
  );
}

const screenFor = (page: string, nav: Nav): React.ReactNode => {
  if (page === screens["symptom-checker"].opens)
    return <SymptomChecker {...nav} />;
  if (page === screens["risk-assessment"].opens)
    return <RiskAssessment {...nav} />;
  if (page === screens["health-library"].opens) return <HealthLibrary />;
  if (page === screens["health-timeline"].opens)
    return <HealthTimeline {...nav} />;
  if (page === screens.vaccinations.opens) return <Vaccinations {...nav} />;
  if (page === screens.community.opens) return <Community {...nav} />;
  if (page === screens.nutrition.opens) return <Nutrition {...nav} />;
  if (page === screens.reminders.opens) return <Reminders {...nav} />;
  return <Hub {...nav} />;
};

export function PatientPages({ page, navigate, open }: { page: string } & Nav) {
  return <>{screenFor(page, { navigate, open })}</>;
}
