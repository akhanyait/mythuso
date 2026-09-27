import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  activationRefusal,
  assistantActivation,
  modelTierAllowed,
} from "./lib/activation.ts";
import { AzureOpenAIProvider, OllamaProvider } from "./lib/llm-adapter.ts";
import { retrieveKnowledge } from "./lib/knowledge.ts";
import {
  assembleHandover,
  createObservationStore,
  type ObservationStore,
} from "./lib/observations.ts";
import {
  clearedCookie as clearedFounderCookie,
  createFounderAccess,
  founderLine,
  type FounderAccess,
} from "./lib/founder-access.ts";
import { corsFor } from "./lib/origin-policy.ts";
import {
  selectedSpeech,
  speechSelection,
  SPEECH_VOICE_NAMES,
  type SpeechSeam,
} from "./lib/speech.ts";
import { triageGate } from "./lib/triage-gate.ts";
import { validateVital, type VitalInput } from "./lib/vitals.ts";
import { handleTurn, handleTurnStream, RequiredFieldMissingError } from "./routes/turn.ts";
import assistantContract from "../../../packages/catalog/apis/assistant.json" with { type: "json" };

/* No web framework, the same way apps/api has none: two routes over node:http, and the only
   dependencies this service carries are the LangChain tier and the catalog it reads — every one of
   them a thing to audit before a patient's words reach it. The framework is the part that was
   left out; the tier below ./lib is the part that is not small, and pretending otherwise is what
   this comment used to do. */

const MAX_BODY_BYTES = 768 * 1024;

/* The plan's versioned family, and what this process does not answer of it yet. The contract
   (packages/catalog/apis/assistant.json) declares this service's addresses; any address no version
   of which is built is answered with the engine's own not-yet-available refusal: its 501, its id
   and its own sentence, so a caller meets words it can read rather than a 404 it cannot tell from a
   typo. Both the list and the sentence are read from the contract, never typed again here: an
   address is refused exactly when no version of it is built, so the day one of these is built this
   map stops carrying it by itself. That is how listen and speak left it on 22 September 2026, the
   day their handlers below landed, and how the two triage steps, the vitals reading and the two
   handover steps left it later the same day when theirs did: the map this process starts with is
   now empty, and the branch it feeds is kept for the next address the contract declares ahead of
   the handler that answers it. */
const notYetAvailableStatement: string =
  assistantContract.refusals.find(
    (refusal) => refusal.id === "not-yet-available",
  )?.statement ??
  "This route is not built yet, and it says so rather than pretending.";
/* The engine refusal push-to-talk's two routes answer when the cloud voice is not switched on:
   its own sentence, read from the contract exactly as the 501 above is — the contract's own note
   for it says the service reads the sentence from there rather than typing it again, so it lives
   in one place. */
const speechNotConfiguredStatement: string =
  assistantContract.refusals.find(
    (refusal) => refusal.id === "speech-not-configured",
  )?.statement ??
  "Cloud speech is not configured here; the browser's own voice is the one to carry on with.";
const builtAddresses = new Set(
  assistantContract.routes
    .filter((route) => route.status === "built")
    .map((route) => `${route.method} /assistant${route.path}`),
);
const notYetAvailable = new Map<string, string>();
for (const route of assistantContract.routes) {
  const address = `${route.method} /assistant${route.path}`;
  if (!builtAddresses.has(address))
    notYetAvailable.set(address, notYetAvailableStatement);
}

/* Every refusal sentence this service says out loud is the contract's own, indexed here from
   packages/catalog/apis/assistant.json and never typed a second time in a handler — the rule the
   two engine refusals above already follow, extended to the refusals each route declares for
   itself, because a sentence held in two places is a sentence that drifts in one of them. The
   engine's own refusals are indexed first, so where an id is declared at both levels the wider
   promise is the one said. The fallback every call of statementOf() carries is never reached for
   an id the contract declares; it exists so a sentence the contract lost reads as its own absence
   rather than arriving at a caller as an undefined. */
const refusalStatements = new Map<string, string>();
for (const refusal of assistantContract.refusals)
  refusalStatements.set(refusal.id, refusal.statement);
for (const route of assistantContract.routes) {
  for (const refusal of route.refusals) {
    if (!refusalStatements.has(refusal.id))
      refusalStatements.set(refusal.id, refusal.statement);
  }
}
const statementOf = (refusalId: string, fallback: string): string =>
  refusalStatements.get(refusalId) ?? fallback;
/* The `error` word that travels beside a refusalId, in the snake_case every response this service
   sends already uses. The contract's id is the truth and this is only its spelling as a JSON word,
   so the two can never disagree about which refusal was met. */
const errorWord = (refusalId: string): string => refusalId.replace(/-/g, "_");
/* The status each refusal is declared at, indexed the same way as its sentence, so a founder route
   answers a refusal with the contract's status as well as its words. Founder access's refusals are
   the only ones answered through refuse() below; every older branch spells its status out, and is
   held to the contract by the checks that read it. */
const refusalStatusCodes = new Map<string, number>();
for (const refusal of assistantContract.refusals)
  refusalStatusCodes.set(refusal.id, refusal.status);
for (const route of assistantContract.routes) {
  for (const refusal of route.refusals) {
    if (!refusalStatusCodes.has(refusal.id))
      refusalStatusCodes.set(refusal.id, refusal.status);
  }
}
/* A founder route's refusal: the contract's status, its id and its sentence, and nothing else — no
   hint of which factor failed, whether a key exists, or how many attempts are left. */
function refuse(
  res: ServerResponse,
  headers: Record<string, string>,
  refusalId: string,
): void {
  send(res, refusalStatusCodes.get(refusalId) ?? 500, headers, {
    error: errorWord(refusalId),
    refusalId,
    message: statementOf(refusalId, "The request could not be processed safely."),
  });
}

/* Browser origins are answered per ./lib/origin-policy.ts: the site's own two names in production,
   localhost shapes in development, a 403 for every other Origin before any route reads the URL. A
   request with no Origin — curl, a health check — is not a browser context and is answered as
   before, without CORS headers it never needed. */
function send(
  res: ServerResponse,
  status: number,
  headers: Record<string, string>,
  body: unknown,
): void {
  res.writeHead(status, {
    ...headers,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

/* Server-Sent Events, added with the speed pass of 23 September 2026 for the one route that streams
   — POST /v1/turn when the caller asks with `stream: true`. Three small helpers over node:http's
   own writable response, no library: open the stream with the SSE content type, write one named
   event, and let the caller end it. The CORS headers the JSON path sends ride along unchanged, so a
   browser origin is answered the same way whether it asked to stream or not — the constraint the
   streaming path shares with every other response this service sends. `cache-control: no-cache` and
   `connection: keep-alive` are what an SSE client needs to read events as they arrive rather than
   buffering a finished body, and `x-content-type-options: nosniff` stays, as it does on every
   response here. */
function openEventStream(
  res: ServerResponse,
  headers: Record<string, string>,
): void {
  res.writeHead(200, {
    ...headers,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-content-type-options": "nosniff",
  });
  /* Flush the headers to the client at once, so it knows the stream is open before the first event
     is ready — the point of streaming is early data, and headers held until the body would defeat
     it. writeHead has already queued them; this pushes them out. */
  if (typeof (res as { flushHeaders?: () => void }).flushHeaders === "function")
    (res as { flushHeaders: () => void }).flushHeaders();
}

/* One SSE frame: the event name on its `event:` line, the payload as a single-line JSON on its
   `data:` line, and the blank line that ends the frame. JSON.stringify never emits a bare newline
   inside a value, so one frame is always exactly these lines and a client's event boundary is
   unambiguous. */
function writeEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* Reads the whole body before parsing, capped below the size a legitimate request could ever
   need: a typed sentence is nothing, and the largest honest body is one push-to-talk capture,
   base64-encoded and bounded by the contract's own cap — 768 KB carries it with room to spare,
   and nginx refuses anything larger before it reaches this function, with the same number held
   to this one by scripts/check-boundaries.mjs. Oversized and malformed are different failures
   with different causes, so they get different statuses rather than one generic 400. */
async function readJsonBody(
  req: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return { ok: false, status: 413 };
    chunks.push(chunk);
  }
  if (!chunks.length) return { ok: true, value: {} };
  try {
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
  } catch {
    return { ok: false, status: 400 };
  }
}

/* The line a failed request writes: one JSON object on one line, carrying only facts this process
   owns — which event failed, at which route, and an error's type name. An exception out of
   handleTurn can be a provider's raw error, and a raw provider error can carry an endpoint, a
   header or a body — so the line reads the type name and nothing else, reduced to letters and
   capped, a shape no value can ride out on: a scheme, a path or an address cannot survive the
   strip. The event and the route are this file's own literals, never a caller's. The request's
   own text, its headers, the endpoint and the response body are never touched here, because a
   log is one of the places the adapter's own comments say a patient's words and a credential
   must never surface. */
const failureLine = (event: string, route: string, error: unknown): string => {
  const name = error instanceof Error ? error.name : typeof error;
  const kind = name.replace(/[^A-Za-z]/g, "").slice(0, 32) || "unknown";
  return JSON.stringify({ event, route, kind });
};

/* A seam's answer: either the value the route returns, or the contract's own refusal id with the
   status that refusal is declared at. A refusal travels as data and not as an exception, so the
   reason a step was refused — an answer offered for a step that is not the one being asked —
   reaches the caller as the sentence the contract wrote for it rather than as a fault. */
export type TriageOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; refusalId: string; status: number };

/* The seam the four clinical-flow routes below are written against: the triage gate's answer, the
   two triage steps, the switch that says whether a vital reading may be accepted in this process at
   all, and the observation store the validated readings and prepared handovers are held in. It is a
   seam for the same reason the turn handler, the search and the voice are one — this file's own
   tests hold the routes in their process, and the only way to prove a gate opens is to be able to
   hand the handler a gate that is open. What the live one does, below, is refuse. */
export interface ClinicalFlowSeam {
  /* Whether a ratified triage protocol lets this service take a person through the questions. */
  triageOpen(): boolean;
  /* The first question of a guided assessment, and the shape of the conversation it begins. */
  beginTriage(input: { language: string; sessionId: string }): TriageOutcome<{
    question: string;
    step: number;
    steps: number;
  }>;
  /* The next question, or the end of the last step. */
  answerTriage(input: {
    sessionId: string;
    step: number;
    answer: string;
  }): TriageOutcome<{
    done: boolean;
    question?: string;
    step: number;
  }>;
  /* Whether a vital reading may be accepted in this process at all. */
  vitalsSynthetic(): boolean;
  /* Where the validated readings and the prepared handover packs are held. */
  store(): ObservationStore;
}

/* The live seam, and the honest reason it is a refusal rather than a flow.

   The triage half reads the register through ./lib/triage-gate.ts, which answers false until
   packages/catalog/clinical.json names a triage protocol and packages/catalog/protocols.json holds
   every protocol it names ratified under a formed board and an appointed Medical Director. Today it
   names none, so the gate is shut and neither triage step is reachable in a live process. They
   refuse rather than improvise because the questions a guided assessment asks, the order it asks
   them in and the priority it sets are a ratified protocol's own content, and no contract in this
   repository holds any of it: a handler that invented questions would be inventing clinical
   content, which is the one thing this service is not. The routes, their request and response
   shapes, their consent checks and the gate that reads the register are all built, so the board
   publishing a ratified protocol's content in a contract is what opens them — the reading of that
   content belongs here, beside the gate, and nowhere in a handler.

   The vitals half is dark for real device data behind the same kind of gate: the device allowlist in
   packages/catalog/vitals.json is empty because no data protection impact assessment has been done
   for a real device, a HealthKit source or a Health Connect one. A process that says out loud it is
   testing — MYTHUSO_VITALS_TESTING=synthetic, and only that exact word — may accept a synthetic
   reading through the same validation a real one would meet; every other process refuses the route
   before it reads a body. */
export function liveClinicalFlows(): ClinicalFlowSeam {
  const observations = createObservationStore();
  return {
    triageOpen: () => triageGate().open,
    beginTriage: () => ({
      ok: false,
      refusalId: "internal-error",
      status: 500,
    }),
    answerTriage: () => ({
      ok: false,
      refusalId: "internal-error",
      status: 500,
    }),
    vitalsSynthetic: () => process.env.MYTHUSO_VITALS_TESTING === "synthetic",
    store: () => observations,
  };
}

/* The server, built rather than started, so its own tests can hold the routes in their process:
   four seams are injectable — the turn handler, the knowledge search, the cloud voice and the
   clinical flows. The real turn handler raises only for a field its contract declares required — an
   absent userConsent, which the catch below maps to the caller's own required-field-missing 400 — and
   answers every other input rather than raising, so a stub is still the only way to reach the 500 half
   of that catch; the search is a seam because
   the corpus it reads is a startup fact, and the one way to hold this file to its own "nothing
   is returned without a source to stand on" is to be able to hand it a match that has none; the
   speech seam is ./lib/speech.ts's selection — Azure's two doors unless the environment names
   another built provider per direction — injectable so the listen and speak tests can prove the
   configured and the unconfigured halves without a credential or a network; the clinical
   seam is the one above, injectable so the triage routes can be held against a gate that is open
   and a gate that is shut without a ratified protocol existing to open the real one. The real
   entry passes nothing and gets all four real ones. A fifth seam, `turnStream`, is the streaming
   door beside the turn handler: the same route reads it when a caller asks for Server-Sent Events,
   and it is injectable for the same reason the turn handler is — so a test can hold the SSE frames
   the route writes without a model or a network behind them. The real entry passes nothing and gets
   the real handleTurnStream. */
export function createAssistantServer(
  turn: typeof handleTurn = handleTurn,
  search: typeof retrieveKnowledge = retrieveKnowledge,
  speech: SpeechSeam = selectedSpeech(),
  clinical: ClinicalFlowSeam = liveClinicalFlows(),
  turnStream: typeof handleTurnStream = handleTurnStream,
  founder: FounderAccess = createFounderAccess(),
): Server {
  /* Read once, per server: the facts the status routes report are facts about how this process was
    configured, and they cannot change while it runs. */
  const activation = assistantActivation();
  /* The answer both status addresses give — GET /assistant/health and GET /assistant/v1/status are
    the same reading at two addresses, and they are written once here so they cannot disagree.
    Provider presence is a fact about configuration, not a health claim: `true` means this process
    read an endpoint and a key from its environment — and nothing about the values themselves. It
    exists so the activation sequence in deploy/RUNBOOK.md can show that the service found the
    credentials it was given, without anything printing them. Ollama is reported the same cheap
    way (a set OLLAMA_URL, never the 800ms probe): a status route that could take the best part of
    a second to answer is one a checker starts skipping. `production` and `activated` are the
    acknowledgement gate's own truth: in production `activated` is false until the
    acknowledgement line is in the env file, and a process carrying it is the only one that would
    have started with credentials configured at all. Booleans only — there is no field here that
    could carry a secret even by accident. */
  const statusAnswer = () => ({
    ok: true,
    mode: "phase-2-safe",
    azure: new AzureOpenAIProvider().available,
    ollama: new OllamaProvider().available,
    production: activation.production,
    activated: modelTierAllowed(),
    /* The cloud voice's own truth, added 23 September 2026: whether THIS process read an Azure
       Speech region and key. It is reported separately from `activated` (the OpenAI acknowledgement
       gate) because a service activated for the language model can still have no speech credential,
       and a client that could not tell the two apart fell back to the browser's robotic voice while
       believing a natural one was configured. Presence only, through the same seam the speak and
       listen routes gate on — never a value. */
    speech: speech.configured(),
  });

  return createServer(async (req, res) => {
    const cors = corsFor(req.headers.origin);
    if (cors.refused) {
      /* A browser origin this deployment does not answer. Nothing further is read — not the method,
      not the URL, not the body — and no CORS header goes back that could be read as permission. */
      return send(
        res,
        403,
        {},
        {
          error: "origin_not_allowed",
          message: "This service answers its own site only.",
        },
      );
    }
    /* The preflight, answered before any route looks at the URL or the method: no body is read,
     nothing is classified, and a browser on the allow-list gets the headers it asked about. */
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors.headers, "cache-control": "no-store" });
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/assistant/health") {
      /* The unversioned health address, kept because deploy checks already call it: the same reading
      the plan's versioned status address gives, at the address the health check has always known. */
      return send(res, 200, cors.headers, statusAnswer());
    }
    if (req.method === "GET" && req.url === "/assistant/v1/status") {
      /* The plan's status address — GET /v1/status in packages/catalog/apis/assistant.json, whose own
      summary says it answers what the health route answers: provider presence, production and the
      acknowledgement gate's answer, all told truthfully and none of it a secret. The two share
      statusAnswer() above so they cannot describe this process differently. */
      return send(res, 200, cors.headers, statusAnswer());
    }
    if (req.method === "POST" && req.url === "/assistant/turn") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          message: "The request could not be processed safely.",
        });
      }
      try {
        const result = await turn(
          body.value as Parameters<typeof handleTurn>[0],
        );
        return send(res, 200, cors.headers, result);
      } catch (error) {
        /* A required field the caller did not send is the caller's omission, not this process's fault,
       so it is answered with the contract's own shared required-field-missing 400 — the refusal every
       route inherits from packages/catalog/apis.json — and writes no failure line, because nothing
       went wrong on this side to record. The handler raises it only for a field its contract declares
       required, and never for an emergency, which is answered whatever the caller left out. */
        if (error instanceof RequiredFieldMissingError) {
          return send(res, 400, cors.headers, {
            error: "required_field_missing",
            refusalId: "required-field-missing",
            message: "A field this route needs was not sent.",
          });
        }
        /* Any other exception out of the turn is this process's fault, never the caller's: the 400 this
       catch used to send told a caller their request was wrong when the truth was the opposite,
       and it left whoever read the logs with nothing at all. The caller gets one generic
       sentence under a 500 — non-revealing by construction — and the line above is the only
       record of what the process itself met. */
        console.error(
          failureLine("assistant.turn.failed", "/assistant/turn", error),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/turn") {
      /* The plan's versioned turn address: the same handler as /assistant/turn, deliberately written
      out again rather than shared through a helper. scripts/check-boundaries.mjs holds each built
      route's branch to the contract's evidence by reading the branch's own text whole — from its
      condition to the next one — and a helper would put the audited logic outside every slice, so
      the versioned address would lean on evidence it does not itself contain. The two bodies are
      the same five lines on purpose. */
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          message: "The request could not be processed safely.",
        });
      }
      /* The optional streaming door, added with the speed pass of 23 September 2026 and the only
         change to this branch: a caller that sends `stream: true` is answered with Server-Sent
         Events instead of the one JSON body, and a caller that does not — the web bridge, every
         client that predates this — falls through to the unchanged non-streaming path below, byte
         for byte. The flag is read loosely, so a body that is not an object simply is not a stream
         request. The events themselves are shaped by handleTurnStream in routes/turn.ts, the same
         generator the non-streaming handleTurn drains; this branch only carries them to the wire.

         The first event is pulled before the stream is opened on purpose. A turn that fails on a
         required field — an absent userConsent — throws before it yields anything, so at that point
         no SSE header has been committed and the failure is still answerable as the same 400 the
         non-streaming path gives. Once the stream is open the status line has already gone out as a
         200 and cannot be taken back, so a later fault — which the generator's shape does not admit
         after its first yield, but which a transport could still raise — is logged the same way and
         the stream is closed rather than pretending to a status it can no longer send. */
      const asked = (body.value ?? {}) as { stream?: unknown };
      if (asked.stream === true) {
        const turnReq = body.value as Parameters<typeof handleTurn>[0];
        let opened = false;
        try {
          const events = turnStream(turnReq);
          let next = await events.next();
          openEventStream(res, cors.headers);
          opened = true;
          while (!next.done) {
            writeEvent(res, next.value.event, next.value.data);
            next = await events.next();
          }
          res.end();
          return;
        } catch (error) {
          if (!opened && error instanceof RequiredFieldMissingError) {
            return send(res, 400, cors.headers, {
              error: "required_field_missing",
              refusalId: "required-field-missing",
              message: "A field this route needs was not sent.",
            });
          }
          console.error(
            failureLine("assistant.turn.failed", "/assistant/v1/turn", error),
          );
          if (!opened) {
            return send(res, 500, cors.headers, {
              error: "internal_error",
              message: "The request could not be processed safely.",
            });
          }
          res.end();
          return;
        }
      }
      try {
        const result = await turn(
          body.value as Parameters<typeof handleTurn>[0],
        );
        return send(res, 200, cors.headers, result);
      } catch (error) {
        /* The same two answers as the unversioned branch above, deliberately written out again rather
       than shared: a missing required field is the caller's 400, anything else is this process's 500. */
        if (error instanceof RequiredFieldMissingError) {
          return send(res, 400, cors.headers, {
            error: "required_field_missing",
            refusalId: "required-field-missing",
            message: "A field this route needs was not sent.",
          });
        }
        console.error(
          failureLine("assistant.turn.failed", "/assistant/v1/turn", error),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/knowledge/search") {
      /* The plan's retrieval address: the catalogue's published knowledge, searched the way the
      orchestrator's own tools search it (./lib/knowledge.ts, through the `search` seam), answered
      publicly so a client can see what an answer may stand on. The refusals are the contract's
      own, not invented here: a non-JSON body is invalid-request 400, a body over the ceiling is
      payload-too-large 413, a missing query or language is the inherited required-field-missing
      400 (the language is held to being present, which is all the contract claims for it), a
      match with no source is withheld rather than returned, and a search whose matches were all
      withheld is no-source-no-fact 422 rather than an empty-looking success. */
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          refusalId:
            body.status === 413 ? "payload-too-large" : "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      const asked = (body.value ?? {}) as {
        query?: unknown;
        language?: unknown;
      };
      const query = typeof asked.query === "string" ? asked.query.trim() : "";
      const language =
        typeof asked.language === "string" ? asked.language.trim() : "";
      if (!query || !language) {
        return send(res, 400, cors.headers, {
          error: "required_field_missing",
          refusalId: "required-field-missing",
          message: "A field this route needs was not sent.",
        });
      }
      try {
        const found = await search(query, 4);
        const kept = found.filter((entry) => entry.source.trim().length > 0);
        if (!kept.length && found.length) {
          return send(res, 422, cors.headers, {
            error: "no_source_no_fact",
            refusalId: "no-source-no-fact",
            message: "Nothing is returned without a source to stand on.",
          });
        }
        /* Each source keeps its own id, title and source — the inside of a source as the contract
       declares it — and `withheld` says out loud how many matches were dropped for want of a
       source, so a thin answer reads as thin rather than complete. */
        return send(res, 200, cors.headers, {
          sources: kept.map((entry) => ({
            id: entry.id,
            title: entry.title,
            source: entry.source,
          })),
          withheld: found.length - kept.length,
        });
      } catch (error) {
        console.error(
          failureLine(
            "assistant.knowledge.failed",
            "/assistant/v1/knowledge/search",
            error,
          ),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          refusalId: "internal-error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/listen") {
      /* Push-to-talk's hearing half, built 22 September 2026. The gate comes before the body, so a
      route that is not switched on reads nothing: without the cloud voice configured — or in a
      production process whose acknowledgement is missing, where the cloud voice is as absent as
      a missing key — the route answers the engine's speech-not-configured sentence, which tells
      the caller the browser's own voice is the one carrying on rather than handing it a failure.
      The agreement comes next, because the plan's rule is that the button is the consent: only
      an explicit true hears, and anything else is refused with the route's own
      speech-without-consent sentence rather than transcribed. Then the capture: it arrives
      base64, its words travel back, and neither the audio nor a recording of it is kept — there
      is no store here a capture could reach. A fault out of the recogniser — a refusal, a
      timeout, a transport that hung — is one non-revealing 500, exactly as the knowledge route
      treats a search that threw. The gate asks about the hearing door alone ("stt"): since
      28 September 2026 the two directions may be different providers, and a box with a voice
      but no ear must refuse here rather than reach a door that is not there. */
      if (!speech.configured("stt") || !modelTierAllowed()) {
        return send(res, 501, cors.headers, {
          error: "speech_not_configured",
          refusalId: "speech-not-configured",
          message: speechNotConfiguredStatement,
        });
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          refusalId:
            body.status === 413 ? "payload-too-large" : "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      const asked = (body.value ?? {}) as {
        userConsent?: unknown;
        language?: unknown;
        audioBase64?: unknown;
        audioFormat?: unknown;
      };
      const language =
        typeof asked.language === "string" ? asked.language.trim() : "";
      const audioBase64 =
        typeof asked.audioBase64 === "string" ? asked.audioBase64 : "";
      const audioFormat =
        typeof asked.audioFormat === "string" ? asked.audioFormat.trim() : "";
      if (asked.userConsent !== true) {
        return send(res, 403, cors.headers, {
          error: "speech_without_consent",
          refusalId: "speech-without-consent",
          message: "Nothing is listened to without the person's agreement.",
        });
      }
      if (!language || !audioBase64 || !audioFormat) {
        return send(res, 400, cors.headers, {
          error: "invalid_request",
          refusalId: "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      try {
        const heard = await speech.recognize({
          audioBase64,
          language,
          audioFormat,
        });
        if (!heard.ok) throw new Error("speech did not answer");
        return send(res, 200, cors.headers, {
          text: heard.text,
          language: heard.language,
        });
      } catch (error) {
        console.error(
          failureLine("assistant.listen.failed", "/assistant/v1/listen", error),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          refusalId: "internal-error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/speak") {
      /* Push-to-talk's speaking half, built 22 September 2026: the words of an answer that already
      exists, read back in one of the contract's two en-ZA voices. The same gate first and the
      same sentence for a process the cloud voice is not switched on for; then the words, which
      are the caller's to send and this process's to voice and keep nowhere — the audio travels
      in the response. A voice the contract does not name is refused with the route's own
      invalid-request rather than silently replaced, because a caller that asked for a voice
      should hear which voice it got. One call is one stretch of speech: a caller wanting sound
      before the last sentence of an answer is voiced asks for the next stretch itself. The gate
      asks about the speaking door alone ("tts"), for the reason the listen route gives. */
      if (!speech.configured("tts") || !modelTierAllowed()) {
        return send(res, 501, cors.headers, {
          error: "speech_not_configured",
          refusalId: "speech-not-configured",
          message: speechNotConfiguredStatement,
        });
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          refusalId:
            body.status === 413 ? "payload-too-large" : "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      const asked = (body.value ?? {}) as {
        text?: unknown;
        language?: unknown;
        voice?: unknown;
      };
      const text = typeof asked.text === "string" ? asked.text.trim() : "";
      const language =
        typeof asked.language === "string" ? asked.language.trim() : "";
      const voice = typeof asked.voice === "string" ? asked.voice.trim() : "";
      /* Any voice the contract names, in any language; the speech seam then holds the name to the
         language asked for. Checking the en-ZA pair alone here is what silenced Afrikaans. */
      if (!text || !language || (voice && !SPEECH_VOICE_NAMES.includes(voice))) {
        return send(res, 400, cors.headers, {
          error: "invalid_request",
          refusalId: "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      try {
        const read = await speech.synthesize({
          text,
          language,
          voice: voice || undefined,
        });
        if (!read.ok) throw new Error("the voice did not answer");
        return send(res, 200, cors.headers, {
          audioBase64: read.audioBase64,
          format: read.format,
          voice: read.voice,
          language: read.language,
        });
      } catch (error) {
        console.error(
          failureLine("assistant.speak.failed", "/assistant/v1/speak", error),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          refusalId: "internal-error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/triage/start") {
      /* Guided assessment's first step, built 22 September 2026 — and built shut. The gate comes
      before the body, exactly as the voice routes' gate does, because a route that may not run
      reads nothing: ./lib/triage-gate.ts reads the register's own truth — which protocols
      packages/catalog/clinical.json names as triage protocols, and whether
      packages/catalog/protocols.json holds every one of them ratified under a formed board and an
      appointed Medical Director — and today it names none, so the answer is the engine's own
      triage-not-ratified sentence at a 503. Not a 501, because this route is built; not a 404,
      because the address is declared; and not a guess, because software sets no priority for
      anybody. The gate reads a catalog rather than a flag in this file, so the board ratifying a
      triage protocol opens it with no edit here.

      After the gate, the agreement: the questions are the person's own health information the
      moment they are answered, so an explicit true is the only thing that begins one, and anything
      else is refused with the route's own assessment-needs-consent sentence rather than asked.
      Then the language, held to being present. The questions themselves are the protocol's
      content, reached through the `clinical` seam — see liveClinicalFlows() for why the live one
      has none to give. */
      if (!clinical.triageOpen()) {
        return send(res, 503, cors.headers, {
          error: errorWord("triage-not-ratified"),
          refusalId: "triage-not-ratified",
          message: statementOf(
            "triage-not-ratified",
            "Guided triage is not clinically validated here, and it is refused rather than guessed.",
          ),
        });
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          refusalId:
            body.status === 413 ? "payload-too-large" : "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      const asked = (body.value ?? {}) as {
        userConsent?: unknown;
        language?: unknown;
        sessionId?: unknown;
      };
      if (asked.userConsent !== true) {
        return send(res, 403, cors.headers, {
          error: errorWord("assessment-needs-consent"),
          refusalId: "assessment-needs-consent",
          message: statementOf(
            "assessment-needs-consent",
            "An assessment begins only where the person agreed to one.",
          ),
        });
      }
      const language =
        typeof asked.language === "string" ? asked.language.trim() : "";
      if (!language) {
        return send(res, 400, cors.headers, {
          error: "required_field_missing",
          refusalId: "required-field-missing",
          message: "A field this route needs was not sent.",
        });
      }
      /* A caller that held a conversation id continues it; one that did not is given one, and it is
      returned so the answer step has something to name. The id names a conversation and never a
      person: nothing here identifies anybody. */
      const sessionId =
        typeof asked.sessionId === "string" && asked.sessionId.trim()
          ? asked.sessionId.trim()
          : randomUUID();
      try {
        const begun = clinical.beginTriage({ language, sessionId });
        if (!begun.ok) {
          /* A refusal the seam answered with is data and not a fault, and this file's own rule holds for
        it: a 4xx is the caller's or the register's, and only a 5xx is this process's, so only a 5xx
        is written. What is written carries an error's type name and nothing else. */
          if (begun.status >= 500)
            console.error(
              failureLine(
                "assistant.triage.refused",
                "/assistant/v1/triage/start",
                new Error(begun.refusalId),
              ),
            );
          return send(res, begun.status, cors.headers, {
            error: errorWord(begun.refusalId),
            refusalId: begun.refusalId,
            message: statementOf(
              begun.refusalId,
              "The request could not be processed safely.",
            ),
          });
        }
        return send(res, 200, cors.headers, {
          question: begun.value.question,
          step: begun.value.step,
          steps: begun.value.steps,
          sessionId,
        });
      } catch (error) {
        console.error(
          failureLine(
            "assistant.triage.failed",
            "/assistant/v1/triage/start",
            error,
          ),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          refusalId: "internal-error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/triage/answer") {
      /* Guided assessment's next step, built 22 September 2026 and gated behind the same register
      read as the step that begins it, for the same reason: an answer is only an answer if there is
      a ratified protocol's question behind it, and there is none, so the gate answers first and
      nothing is read. The step a caller names is held to, because a conversation that skips a
      question has invented the answer to it — and which step is current is the protocol's to know,
      so an answer offered out of order comes back from the seam as the route's own
      step-out-of-order rather than being fitted to whatever was being asked. */
      if (!clinical.triageOpen()) {
        return send(res, 503, cors.headers, {
          error: errorWord("triage-not-ratified"),
          refusalId: "triage-not-ratified",
          message: statementOf(
            "triage-not-ratified",
            "Guided triage is not clinically validated here, and it is refused rather than guessed.",
          ),
        });
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          refusalId:
            body.status === 413 ? "payload-too-large" : "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      const asked = (body.value ?? {}) as {
        sessionId?: unknown;
        step?: unknown;
        answer?: unknown;
      };
      const sessionId =
        typeof asked.sessionId === "string" ? asked.sessionId.trim() : "";
      const answer =
        typeof asked.answer === "string" ? asked.answer.trim() : "";
      const step =
        typeof asked.step === "number" &&
        Number.isInteger(asked.step) &&
        asked.step > 0
          ? asked.step
          : 0;
      if (!sessionId || !step || !answer) {
        return send(res, 400, cors.headers, {
          error: "required_field_missing",
          refusalId: "required-field-missing",
          message: "A field this route needs was not sent.",
        });
      }
      try {
        const next = clinical.answerTriage({ sessionId, step, answer });
        if (!next.ok) {
          /* As above: an answer offered for a step that is not the one being asked is the caller's
        mistake, and a caller's mistake is not a failure line. Only this process's own fault is. */
          if (next.status >= 500)
            console.error(
              failureLine(
                "assistant.triage.refused",
                "/assistant/v1/triage/answer",
                new Error(next.refusalId),
              ),
            );
          return send(res, next.status, cors.headers, {
            error: errorWord(next.refusalId),
            refusalId: next.refusalId,
            message: statementOf(
              next.refusalId,
              "The request could not be processed safely.",
            ),
          });
        }
        /* A step that is not the last owes the next question, and the last owes nothing but its own
       end: `question` is sent only when there is one, so a caller is never handed an empty string
       to read aloud as a question. */
        return send(
          res,
          200,
          cors.headers,
          next.value.done || typeof next.value.question !== "string"
            ? { done: next.value.done, step: next.value.step }
            : {
                done: false,
                question: next.value.question,
                step: next.value.step,
              },
        );
      } catch (error) {
        console.error(
          failureLine(
            "assistant.triage.failed",
            "/assistant/v1/triage/answer",
            error,
          ),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          refusalId: "internal-error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/vitals") {
      /* A vital reading, built 22 September 2026 and dark for everything but a synthetic one. The
      gate comes first and reads nothing: packages/catalog/vitals.json's device allowlist is empty
      because no data protection impact assessment has been done for a real device, a HealthKit
      source or a Health Connect one, so a process that has not said out loud it is testing
      (MYTHUSO_VITALS_TESTING=synthetic) is refused with the route's own sentence at a 503 rather
      than being read from. The agreement comes next, because a reading is the person's own health
      information the moment it is accepted.

      What is then validated is validated against the catalog and never against a rule in this
      file: ./lib/vitals.ts reads the accepted types with their LOINC codes and UCUM units, the
      plausibility bounds, the staleness window and the allowlist from that same contract, and
      refuses an identity-shaped value, an unregistered type or unit, a number outside its bound, a
      reading older than the window and a device nobody registered. A refused reading is never
      stored. A reading that passed is held in the session's observation context and answered with
      its own entry reference — and validation is all this is: nothing here says what a number
      means for a patient, scores one or triages it. */
      if (!clinical.vitalsSynthetic()) {
        return send(res, 503, cors.headers, {
          error: errorWord("device-data-needs-a-dpia"),
          refusalId: "device-data-needs-a-dpia",
          message: statementOf(
            "device-data-needs-a-dpia",
            "A reading from a real device is refused here until its data protection assessment is done.",
          ),
        });
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          refusalId:
            body.status === 413 ? "payload-too-large" : "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      const asked = (body.value ?? {}) as VitalInput & {
        userConsent?: unknown;
        sessionId?: unknown;
      };
      if (asked.userConsent !== true) {
        return send(res, 403, cors.headers, {
          error: errorWord("vitals-needs-consent"),
          refusalId: "vitals-needs-consent",
          message: statementOf(
            "vitals-needs-consent",
            "A reading is accepted only where the person agreed to one.",
          ),
        });
      }
      const sessionId =
        typeof asked.sessionId === "string" ? asked.sessionId.trim() : "";
      if (!sessionId) {
        return send(res, 400, cors.headers, {
          error: "required_field_missing",
          refusalId: "required-field-missing",
          message: "A field this route needs was not sent.",
        });
      }
      try {
        const verdict = validateVital(asked, Date.now());
        if (!verdict.ok) {
          return send(res, verdict.status, cors.headers, {
            error: errorWord(verdict.refusalId),
            refusalId: verdict.refusalId,
            message: statementOf(
              verdict.refusalId,
              "A reading that failed validation is not written.",
            ),
          });
        }
        const entryRef = `vital-${randomUUID()}`;
        clinical.store().addReading(sessionId, verdict.reading);
        return send(res, 200, cors.headers, {
          accepted: true,
          entryRef,
          sessionId,
        });
      } catch (error) {
        console.error(
          failureLine("assistant.vitals.failed", "/assistant/v1/vitals", error),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          refusalId: "internal-error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/handover/prepare") {
      /* The handover pack, assembled 22 September 2026 — and assembled, never submitted. This route
      reads what the session's observation context holds, puts it into the shape a clinician would
      be handed, and gives it back to the person to review; the submission that would route it to a
      clinician is the next address down and stays dark. The agreement comes first, because a
      handover is the person's own conversation being offered to somebody else.

      A session with no validated reading on it has nothing to hand over, and an empty pack sent to
      a clinician is a person's time spent on nothing, so it is refused with the route's own
      nothing-to-hand-over rather than prepared. The pack carries no score and no priority: the
      fields a clinician would act on are a ratified triage protocol's to set and there is none, so
      the urgency it names is the honest "not-triaged". Every line of it is run through the same
      redactor the turn route uses, because a handover pack is exactly the artefact that redactor
      exists to protect. */
      const body = await readJsonBody(req);
      if (!body.ok) {
        return send(res, body.status, cors.headers, {
          error: body.status === 413 ? "payload_too_large" : "invalid_request",
          refusalId:
            body.status === 413 ? "payload-too-large" : "invalid-request",
          message: "The request could not be processed safely.",
        });
      }
      const asked = (body.value ?? {}) as {
        sessionId?: unknown;
        userConsent?: unknown;
      };
      if (asked.userConsent !== true) {
        return send(res, 403, cors.headers, {
          error: errorWord("handover-needs-consent"),
          refusalId: "handover-needs-consent",
          message: statementOf(
            "handover-needs-consent",
            "A handover is prepared only where the person agreed to one.",
          ),
        });
      }
      const sessionId =
        typeof asked.sessionId === "string" ? asked.sessionId.trim() : "";
      if (!sessionId) {
        return send(res, 400, cors.headers, {
          error: "required_field_missing",
          refusalId: "required-field-missing",
          message: "A field this route needs was not sent.",
        });
      }
      try {
        const assembled = assembleHandover(
          clinical.store(),
          sessionId,
          Date.now(),
        );
        if (!assembled.ok) {
          return send(res, 409, cors.headers, {
            error: errorWord("nothing-to-hand-over"),
            refusalId: "nothing-to-hand-over",
            message: statementOf(
              "nothing-to-hand-over",
              "A handover is prepared from a conversation that happened.",
            ),
          });
        }
        /* Held against its own reference, so a submission — the day one exists to make — looks the
       pack up rather than trusting a caller to carry it back unchanged. */
        clinical.store().addHandover(sessionId, assembled.pack);
        return send(res, 200, cors.headers, {
          handoverRef: assembled.pack.handoverRef,
          preparedAt: assembled.pack.preparedAt,
          pack: {
            summary: assembled.pack.summary,
            urgency: assembled.pack.urgency,
            symptoms: assembled.pack.symptoms,
            vitals: assembled.pack.vitals,
            sources: assembled.pack.sources,
          },
        });
      } catch (error) {
        console.error(
          failureLine(
            "assistant.handover.failed",
            "/assistant/v1/handover/prepare",
            error,
          ),
        );
        return send(res, 500, cors.headers, {
          error: "internal_error",
          refusalId: "internal-error",
          message: "The request could not be processed safely.",
        });
      }
    }
    if (req.method === "POST" && req.url === "/assistant/v1/handover/submit") {
      /* The handover submission, built 22 September 2026 as a refusal and as nothing else. Routing a
      pack to a clinician needs three contracts this repository does not have: an identity service
      that says who the person handing over is, a nurse roster that says who is on and where, and a
      destination contract that says which queue a pack enters and who reads it. Without them a
      submission could only be acknowledged into nothing, and a handover acknowledged into nothing
      is worse than one refused — the person stops looking for help that never started. So this
      branch reads no body, looks up no reference and always answers the route's own
      clinician-routing-not-built sentence at a 503: the frame is here, the refusal is the contract's,
      and the day the three contracts exist this branch is where the routing is written. */
      return send(res, 503, cors.headers, {
        error: errorWord("clinician-routing-not-built"),
        refusalId: "clinician-routing-not-built",
        message: statementOf(
          "clinician-routing-not-built",
          "A handover reaches no clinician from here: the identity, roster and destination contracts it would need do not exist.",
        ),
      });
    }
    if (req.method === "POST" && req.url === "/assistant/v1/founder/session") {
      /* Founder sign-in, added 24 September 2026 (lib/founder-access.ts has the whole account). The
      gate comes first and reads nothing: a request a page on another site could have made is refused,
      and so is every request while founder access is dark — both halves of the switch are needed,
      and the provisioning script writes only one of them. Then the lock, before any password is
      hashed. Then the two factors together, refused in one sentence that never says which failed.
      The session id travels only in the Set-Cookie header; the body says when it ends and nothing
      else, and the audit line says what happened and nothing else. */
      const gated = founder.gate(req.headers);
      if (gated) {
        console.log(founderLine("founder.sign-in", gated.refusalId));
        return refuse(res, cors.headers, gated.refusalId);
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        const refusalId = body.status === 413 ? "payload-too-large" : "invalid-request";
        console.log(founderLine("founder.sign-in", refusalId));
        return refuse(res, cors.headers, refusalId);
      }
      const asked = (body.value ?? {}) as { password?: unknown; code?: unknown };
      if (typeof asked.password !== "string" || typeof asked.code !== "string") {
        console.log(founderLine("founder.sign-in", "required-field-missing"));
        return send(res, 400, cors.headers, {
          error: "required_field_missing",
          refusalId: "required-field-missing",
          message: "A field this route needs was not sent.",
        });
      }
      const signed = await founder.signIn(asked.password, asked.code);
      if (!signed.ok) {
        console.log(founderLine("founder.sign-in", signed.refusalId));
        return refuse(res, cors.headers, signed.refusalId);
      }
      console.log(founderLine("founder.sign-in", "accepted"));
      return send(
        res,
        200,
        { ...cors.headers, "set-cookie": signed.cookie, pragma: "no-cache" },
        { signedIn: true, expiresAt: signed.expiresAt },
      );
    }
    if (req.method === "DELETE" && req.url === "/assistant/v1/founder/session") {
      /* Founder sign-out: the live session ends and the cookie is cleared. Without a live session there
      is nothing to end, and the answer says so — with the cookie cleared anyway, so a stale one does
      not linger in the browser. */
      const gated = founder.gate(req.headers);
      if (gated) {
        console.log(founderLine("founder.sign-out", gated.refusalId));
        return refuse(res, cors.headers, gated.refusalId);
      }
      if (!founder.sessionFrom(req.headers.cookie)) {
        console.log(founderLine("founder.sign-out", "founder-no-session"));
        return refuse(
          res,
          { ...cors.headers, "set-cookie": clearedFounderCookie() },
          "founder-no-session",
        );
      }
      founder.signOut();
      console.log(founderLine("founder.sign-out", "accepted"));
      return send(
        res,
        200,
        { ...cors.headers, "set-cookie": clearedFounderCookie(), pragma: "no-cache" },
        { signedIn: false },
      );
    }
    if (req.method === "GET" && req.url === "/assistant/v1/founder/keys") {
      /* What may be said about the two keys without revealing either: present or not, the last four
      characters and the SHA-256 fingerprint prefix — the same sixteen characters the provisioning
      script printed and the register records. A live session is enough for this, and no code is
      asked, because none of it is the key. */
      const gated = founder.gate(req.headers);
      if (gated) {
        console.log(founderLine("founder.keys", gated.refusalId));
        return refuse(res, cors.headers, gated.refusalId);
      }
      if (!founder.sessionFrom(req.headers.cookie)) {
        console.log(founderLine("founder.keys", "founder-no-session"));
        return refuse(res, cors.headers, "founder-no-session");
      }
      console.log(founderLine("founder.keys", "accepted"));
      return send(
        res,
        200,
        { ...cors.headers, pragma: "no-cache" },
        { keys: founder.keys(), expiresAt: founder.sessionExpiresAt() },
      );
    }
    if (req.method === "POST" && req.url === "/assistant/v1/founder/reveal") {
      /* The reveal: one allowlisted key, to a live session that has just typed a fresh code. The
      session alone is not enough — a stolen cookie reveals nothing — and the code is burned, so it
      cannot be spent twice. The value travels in this one response body, under no-store and
      no-cache, and nowhere else: the audit line carries the key's name and fingerprint, never it. */
      const gated = founder.gate(req.headers);
      if (gated) {
        console.log(founderLine("founder.reveal", gated.refusalId));
        return refuse(res, cors.headers, gated.refusalId);
      }
      if (!founder.sessionFrom(req.headers.cookie)) {
        console.log(founderLine("founder.reveal", "founder-no-session"));
        return refuse(res, cors.headers, "founder-no-session");
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        const refusalId = body.status === 413 ? "payload-too-large" : "invalid-request";
        console.log(founderLine("founder.reveal", refusalId));
        return refuse(res, cors.headers, refusalId);
      }
      const asked = (body.value ?? {}) as { name?: unknown; code?: unknown };
      if (typeof asked.name !== "string" || typeof asked.code !== "string") {
        console.log(founderLine("founder.reveal", "required-field-missing"));
        return send(res, 400, cors.headers, {
          error: "required_field_missing",
          refusalId: "required-field-missing",
          message: "A field this route needs was not sent.",
        });
      }
      const revealed = founder.reveal(asked.name, asked.code);
      if (!revealed.ok) {
        console.log(
          founderLine("founder.reveal", revealed.refusalId, { name: asked.name, fingerprint: null }),
        );
        return refuse(res, cors.headers, revealed.refusalId);
      }
      console.log(
        founderLine("founder.reveal", "accepted", {
          name: revealed.name,
          fingerprint: revealed.fingerprint,
        }),
      );
      return send(
        res,
        200,
        { ...cors.headers, pragma: "no-cache" },
        {
          name: revealed.name,
          revealedKey: revealed.value,
          lastFour: revealed.lastFour,
          fingerprint: revealed.fingerprint,
        },
      );
    }
    const refusedRoute = `${req.method} ${req.url}`;
    if (req.method && notYetAvailable.has(refusedRoute)) {
      /* The plan's family refuses what it cannot do, at the addresses it was declared at: every
      address this process has no built version of is answered with the engine's
      not-yet-available refusal — its 501, its id and its own sentence, read from the contract
      rather than typed again. No body is read and no header beyond the origin already checked is
      looked at, because there is nothing to read them for. */
      return send(res, 501, cors.headers, {
        error: "not_yet_available",
        refusalId: "not-yet-available",
        message: notYetAvailable.get(refusedRoute),
      });
    }
    send(res, 404, cors.headers, { error: "not_found" });
  });
}

/* Binding is the entry's act, not the module's: imported by a test, this file exports the factory
   above and takes no port. Run directly — `npm start` in development, or the bundled server.mjs
   the unit starts — the guard below is true and the port is bound, as it always was.

   LOOPBACK, EXPLICITLY. Unlike apps/api/src/server.ts — which binds every interface because some
   of its routes are meant to be reached through nginx once the identity service is enabled, and
   checks the caller's address per-route for the ones that are not — this service has no route
   meant to be reached any way but through the nginx proxy in front of it. node:http's listen()
   binds every interface when no host is given, so the difference between "reachable only through
   nginx" and "reachable directly from the internet" was, until now, a firewall rule rather than a
   fact this process could not help but be true. ufw already denies the port by default on the
   deployed box, but a service that depends on a firewall it did not configure to be internal-only
   is a service that stops being internal-only the day that firewall rule changes for an unrelated
   reason. Umami, the co-tenant whose port this once collided with, binds the same way for the
   same reason. */
export function start(): void {
  /* The production acknowledgement gate, enforced before the port is even bound: with NODE_ENV
    production and a provider configured, a key alone does not start this service. The message
    names the missing variable and never a value, because this process may be holding a credential
    in its environment and a log is one of the few places it must never appear. See
    ./lib/activation.ts for why the gate exists and what it is not.

    IN start(), NOT AT MODULE TOP LEVEL. This file is imported, not run, by server.test.ts — a
    process.exit(1) at import time would have killed that entire test run the day it ran under an
    ambient NODE_ENV=production with credentials already exported and no acknowledgement, for a
    reason no failing assertion would have named. Refusing here, at the one call that actually
    binds a port, means importing this module is always safe and only starting it can refuse. */
  const refusal = activationRefusal();
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  /* The speech selection's two refusals, enforced in the same place and for the same reason. A
    value that names no built provider is a misconfiguration and the service does not start; a
    provider with no South African region selected in production while the residency decision is
    blank is refused in the registry's own words and the direction falls back to the default — the
    service starts, and says so here, once, so nobody can believe a patient's voice is going where
    the env file says. Neither line carries a value beyond the card id the operator typed. */
  const selection = speechSelection();
  if (selection.fatal) {
    console.error(selection.fatal);
    process.exit(1);
  }
  for (const line of selection.refused) console.error(line);
  const server = createAssistantServer();
  server.listen(8791, "127.0.0.1", () => {
    console.log("Assistant API listening on 127.0.0.1:8791");
  });
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")
)
  start();
