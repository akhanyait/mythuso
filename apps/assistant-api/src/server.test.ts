import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantServer, liveClinicalFlows, type ClinicalFlowSeam } from './server.ts';
import { handleTurn } from './routes/turn.ts';
import { cloudSpeech, type SpeechSeam } from './lib/speech.ts';
import { createObservationStore, type ObservationStore } from './lib/observations.ts';
import { triageGate } from './lib/triage-gate.ts';
import type { AssistantTurnResponse } from './lib/schema.ts';
import type { KnowledgeResult, retrieveKnowledge } from './lib/knowledge.ts';
import { buildResponse } from '../../../packages/gilbertone/src/engine.ts';
import assistantContract from '../../../packages/catalog/apis/assistant.json' with { type: 'json' };
import vitalsContract from '../../../packages/catalog/vitals.json' with { type: 'json' };

/* The server's own tests, added with the CodeReview fixes of 21 September 2026 and extended on 22
   September 2026 with the plan's /v1 family, push-to-talk's two routes and the gated clinical five:
   the status a caller meets must tell the truth about whose fault a failure is — 400 and 413 are the
   caller's request, 500 is this process — and the line a failure writes must be one structured record,
   carrying no request text, no credential, no header and no endpoint. Four seams are injected,
   because the real ones cannot be made to fail on demand: the real turn handler raises only for a
   missing required field (which the catch maps to the caller’s own 400), so a stub is still the only
   way to reach the 500 half of the catch under test; the knowledge corpus is a startup fact, so only an injected search can
   hand the search route a match with no source to stand on; the cloud voice is two external
   calls, so the listen and speak tests hand them their own door — a configured fake that answers
   what the test decided, and the real seam handed an empty environment for the unconfigured
   half, which is the same code a deployment without Azure Speech credentials runs; and the
   clinical flows read three contracts the tests cannot change, so the triage and vitals tests hand
   them a seam that says yes — the only way to prove a gate opens, since no ratified triage protocol
   and no completed data protection assessment exist to open the real ones. The dummy
   strings below are shaped like the things a log must never hold, and every byte a failure
   writes is read back and held to their absence. */

const REQUEST_TEXT = 'my id number is 8001015009087 and I feel dizzy';
const DUMMY_KEY = 'fixture-secret-9f4c2b7e1a';
const DUMMY_ENDPOINT = 'https://fixture-account.openai.azure.invalid';
const DUMMY_HEADER = 'x-fixture-authorization: Bearer fixture-token';

/* Every line the server writes to the error stream while `body` runs, and the real console put
   back whatever happens — a test that leaks a mocked console changes what the next test is
   measuring. Binding port 0 keeps this file clear of the 8791 a running service may hold.

   A search a test did not inject must never run: the real one would answer out of the real
   corpus, so a test that meant to hold this file to its withholding rule would instead be
   reading the catalogue. */
const notSearching: typeof retrieveKnowledge = async () => {
 throw new Error('a test that did not inject a search must never run one');
};
/* A cloud voice a test did not inject must never run either: an unconfigured seam keeps every
   test that predates push-to-talk on the route's 501 branch, and its two doors throw if anything
   ever reaches them. */
const notSpeaking: SpeechSeam = {
 configured: () => false,
 recognize: async () => {
  throw new Error('a test that did not inject a cloud voice must never hear anything');
 },
 synthesize: async () => {
  throw new Error('a test that did not inject a cloud voice must never voice anything');
 },
};
const withServer = async (
 turn: typeof handleTurn,
 body: (base: string) => Promise<void>,
 search: typeof retrieveKnowledge = notSearching,
 speech: SpeechSeam = notSpeaking,
 clinical: ClinicalFlowSeam = liveClinicalFlows(),
): Promise<string[]> => {
 const errors: string[] = [];
 const originalError = console.error;
 console.error = (...args: unknown[]) => {
  errors.push(args.map((entry) => String(entry)).join(' '));
 };
 const server = createAssistantServer(turn, search, speech, clinical);
 await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
 try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await body(`http://127.0.0.1:${address.port}`);
 } finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.error = originalError;
 }
 return errors;
};

const postTo = (base: string, path: string, body: string, origin?: string) =>
 fetch(`${base}${path}`, {
  method: 'POST',
  headers: origin
   ? { 'content-type': 'application/json', origin }
   : { 'content-type': 'application/json' },
  body,
 });
const post = (base: string, body: string) => postTo(base, '/assistant/turn', body);

/* A turn handler that must never be reached: if one of the bodies below ever got through, the
   result would be a 500 and a log line, and every assertion beside it would catch that. */
const mustNotRun = async (): Promise<never> => {
 throw new Error('a body the edges rejected must never reach the turn handler');
};

const QUIET_ANSWER: AssistantTurnResponse = {
 turnId: 'turn-stub',
 sessionId: 'session-stub',
 route: 'standard',
 classification: 'greeting',
 reply: 'Hello — how can I help today?',
 style: 'supportive',
 confidence: 1,
 requiresConfirmation: false,
 suggestedActions: [],
 detectedLanguage: 'en',
};

test('a malformed body is the caller’s 400, and writes no failure line', async () => {
 const errors = await withServer(mustNotRun, async (base) => {
  const response = await post(base, '{');
  assert.equal(response.status, 400, 'unparseable JSON is the request’s fault, and 400 says so');
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, 'invalid_request');
 });
 assert.deepEqual(
  errors,
  [],
  'a caller’s mistake is not a failure line — the log exists for this process’s own faults',
 );
});

test('an oversized body is the caller’s 413, and writes no failure line', async () => {
 const errors = await withServer(mustNotRun, async (base) => {
  const response = await post(
   base,
   JSON.stringify({ text: 'x'.repeat(800 * 1024), userConsent: true }),
  );
  assert.equal(response.status, 413, 'too large is a different failure from malformed, and reads as one');
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, 'payload_too_large');
 });
 assert.deepEqual(errors, [], 'the ceiling rejecting a body is not a process fault');
});

test('a turn the handler answers is a 200, and writes no failure line', async () => {
 const errors = await withServer(async () => QUIET_ANSWER, async (base) => {
  const response = await post(base, JSON.stringify({ text: 'hello', userConsent: true }));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as AssistantTurnResponse;
  assert.equal(payload.reply, QUIET_ANSWER.reply, 'the handler’s answer is the caller’s answer');
  assert.equal(payload.sessionId, QUIET_ANSWER.sessionId);
 });
 assert.deepEqual(errors, [], 'a normal turn says nothing on the error stream');
});

test('an unexpected exception is a generic 500, and one structured line without any of its secrets', async () => {
 /* The poisoned turn stands in for the rawest failure this route can meet: a provider error whose
    message carries an endpoint, a header, a key and the person's own words. None of it may ride
    out — not into the response, not into the log. */
 const poisonedTurn = async (): Promise<AssistantTurnResponse> => {
  throw new Error(
   `provider at ${DUMMY_ENDPOINT} answered 500 (${DUMMY_HEADER}) for key ${DUMMY_KEY} while processing "${REQUEST_TEXT}"`,
  );
 };
 const errors = await withServer(poisonedTurn, async (base) => {
  const response = await post(
   base,
   JSON.stringify({ text: REQUEST_TEXT, userConsent: true }),
  );
  assert.equal(response.status, 500, 'an internal failure is this process’s, and 500 says so');
  const rawBody = await response.text();
  assert.deepEqual(
   JSON.parse(rawBody),
   { error: 'internal_error', message: 'The request could not be processed safely.' },
   'the payload is the one generic sentence — nothing that could reveal the fault or the data',
  );
  for (const secret of [REQUEST_TEXT, DUMMY_KEY, DUMMY_ENDPOINT, DUMMY_HEADER])
   assert.equal(rawBody.includes(secret), false, `the response must not echo "${secret}"`);
 });
 assert.equal(errors.length, 1, 'exactly one failure line, and nothing else');
 const line = errors[0];
 assert.equal(line.includes('\n'), false, 'one structured record is one line');
 assert.deepEqual(
  JSON.parse(line),
  { event: 'assistant.turn.failed', route: '/assistant/turn', kind: 'Error' },
  'the record is exactly these three fields — a request body, a provider payload or a header has nowhere to sit in it',
 );
 for (const forbidden of [
  REQUEST_TEXT,
  '8001015009087',
  DUMMY_KEY,
  DUMMY_ENDPOINT,
  'fixture-account',
  DUMMY_HEADER,
  'provider at',
 ])
  assert.equal(line.includes(forbidden), false, `the failure line must not carry "${forbidden}"`);
});

test('an error name cannot smuggle an address out: the logged kind is letters only', async () => {
 /* The kind is read from the error's name, and a name is attacker-adjacent in the one case that
    matters: a subclass or a library could set it to anything, an address included. The strip is
    what makes the field safe whatever the name held — this test hands it exactly that worst case
    and reads the line back. */
 const hostileTurn = async (): Promise<AssistantTurnResponse> => {
  const error = new Error('carrier');
  error.name = `Ugly Name@${DUMMY_ENDPOINT}/path?token=fixture-token`;
  throw error;
 };
 const errors = await withServer(hostileTurn, async (base) => {
  const response = await post(base, JSON.stringify({ text: 'a message', userConsent: true }));
  assert.equal(response.status, 500);
 });
 assert.equal(errors.length, 1);
 const parsed = JSON.parse(errors[0]) as { kind: string };
 assert.match(
  parsed.kind,
  /^[A-Za-z]{0,32}$/,
  'letters only, capped — a scheme, a path or a host cannot survive the strip',
 );
 assert.ok(parsed.kind.startsWith('UglyName'), 'the readable part of the name is kept for debugging');
 assert.equal(errors[0].includes('://'), false);
 assert.equal(errors[0].includes('fixture-account'), false);
 assert.equal(errors[0].includes('token=fixture-token'), false);
 assert.equal(errors[0].includes('='), false);
});

/* ---- The plan's /v1 family, wired on 22 September 2026 -------------------------------------- */

test('the versioned turn address answers the turn the unversioned one answers', async () => {
 const errors = await withServer(async () => QUIET_ANSWER, async (base) => {
  const legacy = await post(base, JSON.stringify({ text: 'hello', userConsent: true }));
  const versioned = await postTo(
   base,
   '/assistant/v1/turn',
   JSON.stringify({ text: 'hello', userConsent: true }),
  );
  assert.equal(versioned.status, 200);
  assert.deepEqual(
   await versioned.json(),
   await legacy.json(),
   'the two addresses are one service: the versioned answer is the unversioned answer',
  );
 });
 assert.deepEqual(errors, [], 'a normal turn says nothing on the error stream at either address');
});

test('the versioned turn address refuses the same bad bodies as the unversioned one', async () => {
 const errors = await withServer(mustNotRun, async (base) => {
  const malformed = await postTo(base, '/assistant/v1/turn', '{');
  assert.equal(malformed.status, 400);
  assert.equal(((await malformed.json()) as { error?: string }).error, 'invalid_request');
  const oversized = await postTo(
   base,
   '/assistant/v1/turn',
   JSON.stringify({ text: 'x'.repeat(800 * 1024), userConsent: true }),
  );
  assert.equal(oversized.status, 413);
  assert.equal(((await oversized.json()) as { error?: string }).error, 'payload_too_large');
 });
 assert.deepEqual(errors, [], 'a body the edges rejected is the caller’s, at either address');
});

test('a failed v1 turn writes its own route on the failure line, and nothing else new', async () => {
 const errors = await withServer(
  async () => {
   throw new Error(`provider at ${DUMMY_ENDPOINT} with key ${DUMMY_KEY}`);
  },
  async (base) => {
   const response = await postTo(
    base,
    '/assistant/v1/turn',
    JSON.stringify({ text: REQUEST_TEXT, userConsent: true }),
   );
   assert.equal(response.status, 500);
   const rawBody = await response.text();
   assert.deepEqual(
    JSON.parse(rawBody),
    { error: 'internal_error', message: 'The request could not be processed safely.' },
    'the 500 body is the same one generic sentence the unversioned turn sends',
   );
   for (const secret of [REQUEST_TEXT, DUMMY_KEY, DUMMY_ENDPOINT])
    assert.equal(rawBody.includes(secret), false, `the response must not echo "${secret}"`);
  },
 );
 assert.equal(errors.length, 1);
 assert.deepEqual(
  JSON.parse(errors[0]),
  { event: 'assistant.turn.failed', route: '/assistant/v1/turn', kind: 'Error' },
  'the line names the versioned route, so a log reader can tell the two addresses apart',
 );
 for (const forbidden of [REQUEST_TEXT, '8001015009087', DUMMY_KEY, DUMMY_ENDPOINT])
  assert.equal(errors[0].includes(forbidden), false, `the failure line must not carry "${forbidden}"`);
});

test('a turn with no userConsent is the caller’s required-field-missing 400 at both addresses, and an emergency is answered anyway', async () => {
 /* The real handler, not a stub, because the fact under test is the contract's own: userConsent is a
    required field of /turn and /v1/turn, so an absent one is the caller's omission and is answered with
    the shared required-field-missing 400 every route inherits — never coerced to a withheld consent, which
    would refuse the message on a value the caller never sent. The one thing that outranks a missing field
    is an emergency: the same absence on an emergency word is a 200 down the emergency route, because no
    answer may lower an emergency. Neither writes a failure line — one is the caller's, the other is an
    answer, and neither is a fault of this process. */
 const errors = await withServer(handleTurn, async (base) => {
  for (const path of ['/assistant/turn', '/assistant/v1/turn']) {
   const missing = await postTo(base, path, JSON.stringify({ text: 'when is my nurse coming?' }));
   assert.equal(missing.status, 400, `${path}: an absent userConsent is the caller's 400, not a coerced refusal`);
   assert.deepEqual(
    await missing.json(),
    {
     error: 'required_field_missing',
     refusalId: 'required-field-missing',
     message: 'A field this route needs was not sent.',
    },
    `${path}: the shared refusal's own word, id and sentence`,
   );
   const emergency = await postTo(base, path, JSON.stringify({ text: "I can't breathe, please help" }));
   assert.equal(emergency.status, 200, `${path}: an emergency is answered even with no userConsent at all`);
   const body = (await emergency.json()) as AssistantTurnResponse;
   assert.equal(body.route, 'emergency');
   assert.equal(body.classification, 'emergency');
   assert.equal(body.refusalId, undefined, 'an emergency is never refused, so it carries no refusal id');
  }
 });
 assert.deepEqual(errors, [], 'a missing field is the caller’s and an emergency answer is an answer — neither is a process fault, so neither is logged');
});

test('the versioned status address answers exactly what the health route answers', async () => {
 const errors = await withServer(mustNotRun, async (base) => {
  const health = await fetch(`${base}/assistant/health`);
  const versioned = await fetch(`${base}/assistant/v1/status`);
  assert.equal(versioned.status, 200);
  const body = (await versioned.json()) as Record<string, unknown>;
  assert.deepEqual(body, await health.json(), 'one reading, two addresses — written once');
  assert.equal(body.ok, true);
  assert.equal(typeof body.mode, 'string');
  for (const field of ['azure', 'ollama', 'production', 'activated', 'speech'])
   assert.equal(
    typeof body[field],
    'boolean',
    `${field} is a fact this process can state as a boolean, never as a value`,
   );
 });
 assert.deepEqual(errors, [], 'a status read writes nothing on the error stream');
});

/* ---- The knowledge search, answered publicly on 22 September 2026 --------------------------- */

const SOURCED: KnowledgeResult = {
 id: 'cond-001',
 title: 'A condition the catalogue publishes',
 snippet: 'a snippet only the panel shows',
 source: 'MyThuso conditions catalogue',
 score: 0.5,
 file: 'conditions',
 codes: {},
 citation: { authority: 'MyThuso conditions catalogue' },
};
const WITHOUT_SOURCE: KnowledgeResult = { ...SOURCED, id: 'cond-002', source: '' };
const finding =
 (results: KnowledgeResult[]): typeof retrieveKnowledge =>
 async () =>
  results;
const mustNotSearch: typeof retrieveKnowledge = async () => {
 throw new Error('a body this test rejected must never reach the search');
};

test('the knowledge search answers each source with its own identity, and counts what it withheld', async () => {
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const response = await postTo(
    base,
    '/assistant/v1/knowledge/search',
    JSON.stringify({ query: 'diabetes', language: 'en' }),
   );
   assert.equal(response.status, 200);
   assert.deepEqual(
    await response.json(),
    {
     sources: [{ id: SOURCED.id, title: SOURCED.title, source: SOURCED.source }],
     withheld: 1,
    },
    'a source is its id, title and source — no snippet, no score — and the match without a source is withheld, not returned',
   );
  },
  finding([SOURCED, WITHOUT_SOURCE]),
 );
 assert.deepEqual(errors, []);
});

test('a search whose matches all lacked a source is refused, not answered as empty', async () => {
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const response = await postTo(
    base,
    '/assistant/v1/knowledge/search',
    JSON.stringify({ query: 'diabetes', language: 'en' }),
   );
   assert.equal(response.status, 422);
   assert.deepEqual(await response.json(), {
    error: 'no_source_no_fact',
    refusalId: 'no-source-no-fact',
    message: 'Nothing is returned without a source to stand on.',
   });
  },
  finding([WITHOUT_SOURCE]),
 );
 assert.deepEqual(errors, []);
});

test('a search that matched nothing answers an empty list, honestly', async () => {
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const response = await postTo(
    base,
    '/assistant/v1/knowledge/search',
    JSON.stringify({ query: 'nothing in the catalogue speaks to this', language: 'en' }),
   );
   assert.equal(response.status, 200);
   assert.deepEqual(await response.json(), { sources: [], withheld: 0 });
  },
  finding([]),
 );
 assert.deepEqual(errors, [], 'no matches is neither a fault nor a refusal');
});

test('a search missing the fields it needs is the shared 400, and never runs the search', async () => {
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   for (const body of [
    {},
    { query: 'diabetes' },
    { language: 'en' },
    { query: '   ', language: 'en' },
    { query: 'diabetes', language: 7 },
   ]) {
    const response = await postTo(base, '/assistant/v1/knowledge/search', JSON.stringify(body));
    assert.equal(
     response.status,
     400,
     `a missing or unusable field is 400 for ${JSON.stringify(body)}`,
    );
    assert.deepEqual(await response.json(), {
     error: 'required_field_missing',
     refusalId: 'required-field-missing',
     message: 'A field this route needs was not sent.',
    });
   }
  },
  mustNotSearch,
 );
 assert.deepEqual(errors, []);
});

test('a malformed search body is its 400 and an oversized one its 413, each naming its refusal', async () => {
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const malformed = await postTo(base, '/assistant/v1/knowledge/search', '{');
   assert.equal(malformed.status, 400);
   assert.deepEqual(await malformed.json(), {
    error: 'invalid_request',
    refusalId: 'invalid-request',
    message: 'The request could not be processed safely.',
   });
   const oversized = await postTo(
    base,
    '/assistant/v1/knowledge/search',
    JSON.stringify({ query: 'x'.repeat(800 * 1024), language: 'en' }),
   );
   assert.equal(oversized.status, 413);
   assert.deepEqual(await oversized.json(), {
    error: 'payload_too_large',
    refusalId: 'payload-too-large',
    message: 'The request could not be processed safely.',
   });
  },
  mustNotSearch,
 );
 assert.deepEqual(errors, [], 'a body the edges rejected is not a process fault');
});

test('a failed search is this process 500, one structured line, and none of its secrets', async () => {
 const poisonedSearch: typeof retrieveKnowledge = async () => {
  throw new Error(`index at ${DUMMY_ENDPOINT} failed with ${DUMMY_KEY} for "${REQUEST_TEXT}"`);
 };
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const response = await postTo(
    base,
    '/assistant/v1/knowledge/search',
    JSON.stringify({ query: REQUEST_TEXT, language: 'en' }),
   );
   assert.equal(response.status, 500);
   const rawBody = await response.text();
   assert.deepEqual(JSON.parse(rawBody), {
    error: 'internal_error',
    refusalId: 'internal-error',
    message: 'The request could not be processed safely.',
   });
   for (const secret of [REQUEST_TEXT, DUMMY_KEY, DUMMY_ENDPOINT, 'index at'])
    assert.equal(rawBody.includes(secret), false, `the response must not echo "${secret}"`);
  },
  poisonedSearch,
 );
 assert.equal(errors.length, 1, 'exactly one failure line, and nothing else');
 assert.equal(errors[0].includes('\n'), false, 'one structured record is one line');
 assert.deepEqual(JSON.parse(errors[0]), {
  event: 'assistant.knowledge.failed',
  route: '/assistant/v1/knowledge/search',
  kind: 'Error',
 });
 for (const forbidden of [REQUEST_TEXT, DUMMY_KEY, DUMMY_ENDPOINT, 'index at'])
  assert.equal(errors[0].includes(forbidden), false, `the failure line must not carry "${forbidden}"`);
});

/* ---- Push-to-talk's two routes, built on 22 September 2026 ----------------------------------- */

/* The unconfigured cloud voice as the routes actually meet it: the real seam from ./lib/speech.ts,
   handed an empty environment, so the 501 asserted below comes out of the same code a deployment
   without Azure Speech credentials runs — not out of a fake. Its fetch must never run: an
   unconfigured door that reached the network would fail on that line first. */
const mustNotFetch: typeof fetch = async () => {
 throw new Error('a test that did not configure the cloud voice must never reach the network');
};
const unconfigured = cloudSpeech(mustNotFetch, {});

/* A configured cloud voice with both doors recorded: the tests below read back exactly what the
   route handed over — its caller's fields and nothing extra — as well as what came out. */
const fakeCloudVoice = (
 heard: string,
): {
 seam: SpeechSeam;
 recognises: { audioBase64: string; language: string; audioFormat: string }[];
 synthesises: { text: string; language: string; voice?: string }[];
} => {
 const recognises: { audioBase64: string; language: string; audioFormat: string }[] = [];
 const synthesises: { text: string; language: string; voice?: string }[] = [];
 const seam: SpeechSeam = {
  configured: () => true,
  recognize: async (request) => {
   recognises.push({ ...request });
   return { ok: true, text: heard, language: request.language };
  },
  synthesize: async (request) => {
   synthesises.push({ ...request });
   return {
    ok: true,
    audioBase64: 'ZmFrZS1hdWRpbw==',
    format: 'audio/mpeg',
    voice: request.voice ?? 'en-ZA-LeahNeural',
    language: request.language,
   };
  },
 };
 return { seam, recognises, synthesises };
};

test('with the cloud voice off, both push-to-talk routes answer the contract 501 before reading anything', async () => {
 const refusal = assistantContract.refusals.find((entry) => entry.id === 'speech-not-configured');
 assert.ok(refusal, 'the contract must still carry the refusal this test reads');
 assert.equal(refusal.status, 501);
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   for (const path of ['/assistant/v1/listen', '/assistant/v1/speak']) {
    const response = await postTo(base, path, JSON.stringify({ userConsent: true }));
    assert.equal(response.status, 501, `${path} refuses as declared while the cloud voice is off`);
    assert.deepEqual(
     await response.json(),
     {
      error: 'speech_not_configured',
      refusalId: 'speech-not-configured',
      message: refusal.statement,
     },
     `${path} answers the contract’s own sentence — the one that sends the caller back to the browser’s voice`,
    );
    /* The gate is before the body: a body this route will not use is not parsed and not sized,
       so a route that is not switched on cannot be measured or logged by what it was sent. */
    const malformed = await postTo(base, path, '{');
    assert.equal(malformed.status, 501, `${path} does not parse a body it will not use`);
    const oversized = await postTo(base, path, JSON.stringify({ text: 'x'.repeat(800 * 1024) }));
    assert.equal(oversized.status, 501, `${path} does not size a body it will not use`);
   }
  },
  notSearching,
  unconfigured,
 );
 assert.deepEqual(errors, [], 'a refusal is an answer, and an answer writes nothing on the error stream');
});

test('push-to-talk passes the same front door: a foreign origin hears the origin refusal, not a route', async () => {
 const { seam, recognises } = fakeCloudVoice('anything at all');
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const response = await postTo(
    base,
    '/assistant/v1/listen',
    JSON.stringify({ userConsent: true }),
    'https://not-the-site.example',
   );
   assert.equal(response.status, 403, 'a page this deployment does not answer is refused before any route looks');
   assert.deepEqual(await response.json(), {
    error: 'origin_not_allowed',
    message: 'This service answers its own site only.',
   });
  },
  notSearching,
  seam,
 );
 assert.deepEqual(recognises, [], 'the refusal happened before the recogniser was anywhere near');
 assert.deepEqual(errors, []);
});

test('the listen route hears nothing without an explicit agreement', async () => {
 const listenRoute = assistantContract.routes.find(
  (candidate) => candidate.path === '/v1/listen' && candidate.version === 3,
 );
 assert.ok(listenRoute, 'the contract must still carry the listen@3 route this test reads');
 const consentRefusal = listenRoute.refusals.find((entry) => entry.id === 'speech-without-consent');
 assert.ok(consentRefusal, 'the contract must still carry the refusal this test reads');
 const { seam, recognises } = fakeCloudVoice('words that must never be transcribed');
 const capture = {
  language: 'en-ZA',
  audioBase64: Buffer.from('a capture').toString('base64'),
  audioFormat: 'audio/wav',
 };
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   for (const userConsent of [false, undefined, 'yes', 1]) {
    const response = await postTo(
     base,
     '/assistant/v1/listen',
     JSON.stringify({ userConsent, ...capture }),
    );
    assert.equal(response.status, 403, `only true is an agreement; ${JSON.stringify(userConsent)} is not`);
    assert.deepEqual(
     await response.json(),
     {
      error: 'speech_without_consent',
      refusalId: 'speech-without-consent',
      message: consentRefusal.statement,
     },
     'the route answers the contract’s own sentence, and it is about the person rather than the request',
    );
   }
  },
  notSearching,
  seam,
 );
 assert.deepEqual(recognises, [], 'not one capture reached the recogniser without the agreement');
 assert.deepEqual(errors, []);
});

test('a listen missing its capture is the 400, and the hundred-kilobyte take the raised ceiling is for is a 200', async () => {
 const heard = 'my chest hurts when I breathe in';
 const { seam, recognises } = fakeCloudVoice(heard);
 const capture = (audioBase64: string) => ({
  userConsent: true,
  language: 'en-ZA',
  audioBase64,
  audioFormat: 'audio/wav',
 });
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   for (const body of [
    capture(''),
    { userConsent: true, language: 'en-ZA' },
    { userConsent: true, audioBase64: 'AAAA', audioFormat: 'audio/wav' },
    { ...capture('AAAA'), language: '   ' },
   ]) {
    const response = await postTo(base, '/assistant/v1/listen', JSON.stringify(body));
    assert.equal(response.status, 400, `a body missing a field is 400 for ${JSON.stringify(body)}`);
    assert.deepEqual(await response.json(), {
     error: 'invalid_request',
     refusalId: 'invalid-request',
     message: 'The request could not be processed safely.',
    });
   }
   const malformed = await postTo(base, '/assistant/v1/listen', '{');
   assert.equal(malformed.status, 400, 'unparseable JSON is the request’s fault, and 400 says so');
   const oversized = await postTo(
    base,
    '/assistant/v1/listen',
    JSON.stringify(capture('x'.repeat(800 * 1024))),
   );
   assert.equal(oversized.status, 413, 'past the raised ceiling is still the caller’s 413');
   assert.deepEqual(await oversized.json(), {
    error: 'payload_too_large',
    refusalId: 'payload-too-large',
    message: 'The request could not be processed safely.',
   });
   /* A hundred kilobytes was over the 16 KB ceiling this service carried before push-to-talk and
      is the size the 768 KB one was raised for — nginx holds the same number — so one real
      capture travels, one answer comes back, and neither is kept anywhere. */
   const big = await postTo(
    base,
    '/assistant/v1/listen',
    JSON.stringify(capture('x'.repeat(100 * 1024))),
   );
   assert.equal(big.status, 200, 'a capture of a real size is what the raised ceiling is for');
   assert.deepEqual(await big.json(), { text: heard, language: 'en-ZA' });
  },
  notSearching,
  seam,
 );
 assert.equal(recognises.length, 1, 'exactly one capture — the hundred-kilobyte one — reached the recogniser');
 const [first] = recognises;
 assert.equal(first.audioBase64.length, 100 * 1024, 'the capture travelled whole');
 assert.equal(first.audioFormat, 'audio/wav');
 assert.equal(first.language, 'en-ZA');
 assert.deepEqual(errors, []);
});

test('the speak route voices the words it was given, defaults to the female voice, and refuses a name the contract does not carry', async () => {
 const { seam, synthesises } = fakeCloudVoice('nothing is heard here');
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   for (const body of [
    {},
    { text: 'Hello' },
    { text: '   ', language: 'en-ZA' },
    { text: 'Hello', language: 'en-ZA', voice: 'en-ZA-SiphoNeural' },
   ]) {
    const response = await postTo(base, '/assistant/v1/speak', JSON.stringify(body));
    assert.equal(response.status, 400, `a body this route cannot voice is 400 for ${JSON.stringify(body)}`);
   }
   const plain = await postTo(
    base,
    '/assistant/v1/speak',
    JSON.stringify({ text: 'Good morning', language: 'en-ZA' }),
   );
   assert.equal(plain.status, 200);
   assert.deepEqual(
    await plain.json(),
    {
     audioBase64: 'ZmFrZS1hdWRpbw==',
     format: 'audio/mpeg',
     voice: 'en-ZA-LeahNeural',
     language: 'en-ZA',
    },
    'the words come back as the contract’s mp3 stream, in the female voice the contract makes the default',
   );
   const male = await postTo(
    base,
    '/assistant/v1/speak',
    JSON.stringify({ text: 'Good morning', language: 'en-ZA', voice: 'en-ZA-LukeNeural' }),
   );
   assert.equal(male.status, 200);
   assert.equal(
    ((await male.json()) as { voice?: string }).voice,
    'en-ZA-LukeNeural',
    'a caller that asked for the male voice hears which voice it got',
   );
  },
  notSearching,
  seam,
 );
 assert.equal(synthesises.length, 2, 'the asks the route refused never reached the voice');
 assert.equal(
  synthesises[0].voice,
  undefined,
  'an ask with no voice hands the door no voice: the default is decided in one place, ./lib/speech.ts',
 );
 assert.equal(synthesises[1].voice, 'en-ZA-LukeNeural');
 assert.deepEqual(errors, []);
});

/* The patient panel names a language's own voice since 24 September — af-ZA-AdriNeural for an
   Afrikaans answer — and until 27 September the door refused every name outside the en-ZA pair, so
   Afrikaans was read by the browser's voice while the contract's voice was never asked. The door
   now admits any voice the contract names; a voice from the wrong language is still refused, by the
   speech seam, and an invented one is still 400 at the door. */
test('the speak route admits a language’s own voice, and still refuses one the contract does not name', async () => {
 const { seam, synthesises } = fakeCloudVoice('niks word hier gehoor nie');
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const adri = await postTo(
    base,
    '/assistant/v1/speak',
    JSON.stringify({ text: 'Goeie môre', language: 'af', voice: 'af-ZA-AdriNeural' }),
   );
   assert.equal(adri.status, 200, 'the Afrikaans voice the contract names is admitted at the door');
   assert.equal(((await adri.json()) as { voice?: string }).voice, 'af-ZA-AdriNeural');
   const invented = await postTo(
    base,
    '/assistant/v1/speak',
    JSON.stringify({ text: 'Goeie môre', language: 'af', voice: 'af-ZA-PietNeural' }),
   );
   assert.equal(invented.status, 400, 'a name the contract does not carry is still refused at the door');
   /* A voice from the wrong language is the speech seam's refusal, not the door's, and the seam is
      faked here; ./lib/speech.test.ts holds the real one to it. */
  },
  notSearching,
  seam,
 );
 assert.equal(synthesises.length, 1, 'only the admitted ask reached the voice');
 assert.equal(synthesises[0].voice, 'af-ZA-AdriNeural');
 assert.deepEqual(errors, []);
});

test('a recogniser fault and a voicer fault are each one non-revealing 500, one structured line, and none of the secrets', async () => {
 const poisoned = () =>
  new Error(
   `recogniser at ${DUMMY_ENDPOINT} answered with ${DUMMY_HEADER} for key ${DUMMY_KEY} while reading "${REQUEST_TEXT}"`,
  );
 const brokenCloudVoice: SpeechSeam = {
  configured: () => true,
  recognize: async () => {
   throw poisoned();
  },
  synthesize: async () => {
   throw poisoned();
  },
 };
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const heard = await postTo(
    base,
    '/assistant/v1/listen',
    JSON.stringify({ userConsent: true, language: 'en-ZA', audioBase64: 'AAAA', audioFormat: 'audio/wav' }),
   );
   assert.equal(heard.status, 500, 'a recogniser that failed is this process’s fault, and 500 says so');
   const heardBody = await heard.text();
   assert.deepEqual(JSON.parse(heardBody), {
    error: 'internal_error',
    refusalId: 'internal-error',
    message: 'The request could not be processed safely.',
   });
   for (const secret of [REQUEST_TEXT, DUMMY_KEY, DUMMY_ENDPOINT, DUMMY_HEADER])
    assert.equal(heardBody.includes(secret), false, `the response must not echo "${secret}"`);
   const spoken = await postTo(
    base,
    '/assistant/v1/speak',
    JSON.stringify({ text: 'Good morning', language: 'en-ZA' }),
   );
   assert.equal(spoken.status, 500);
   const spokenBody = await spoken.text();
   for (const secret of [DUMMY_KEY, DUMMY_ENDPOINT, DUMMY_HEADER])
    assert.equal(spokenBody.includes(secret), false, `the response must not echo "${secret}"`);
  },
  notSearching,
  brokenCloudVoice,
 );
 assert.equal(errors.length, 2, 'exactly two failure lines, one per route, and nothing else');
 assert.deepEqual(JSON.parse(errors[0]), {
  event: 'assistant.listen.failed',
  route: '/assistant/v1/listen',
  kind: 'Error',
 });
 assert.deepEqual(JSON.parse(errors[1]), {
  event: 'assistant.speak.failed',
  route: '/assistant/v1/speak',
  kind: 'Error',
 });
 for (const line of errors)
  for (const forbidden of [REQUEST_TEXT, '8001015009087', DUMMY_KEY, DUMMY_ENDPOINT, DUMMY_HEADER, 'recogniser at'])
   assert.equal(line.includes(forbidden), false, `the failure line must not carry "${forbidden}"`);
});

test('a door that answers "not ok" rather than throwing is the same 500, never a silent empty reading', async () => {
 const refusingCloudVoice: SpeechSeam = {
  configured: () => true,
  recognize: async () => ({ ok: false }),
  synthesize: async () => ({ ok: false }),
 };
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const heard = await postTo(
    base,
    '/assistant/v1/listen',
    JSON.stringify({ userConsent: true, language: 'en-ZA', audioBase64: 'AAAA', audioFormat: 'audio/wav' }),
   );
   assert.equal(heard.status, 500, 'a capture the recogniser refused is not a capture of nothing');
   assert.deepEqual(await heard.json(), {
    error: 'internal_error',
    refusalId: 'internal-error',
    message: 'The request could not be processed safely.',
   });
   const spoken = await postTo(
    base,
    '/assistant/v1/speak',
    JSON.stringify({ text: 'Good morning', language: 'en-ZA' }),
   );
   assert.equal(spoken.status, 500, 'words the voice could not read are not silence');
  },
  notSearching,
  refusingCloudVoice,
 );
 assert.equal(errors.length, 2);
 assert.deepEqual(JSON.parse(errors[0]), {
  event: 'assistant.listen.failed',
  route: '/assistant/v1/listen',
  kind: 'Error',
 });
});

test('an emergency heard through listen answers from the engine with the network held shut', async () => {
 const heard = 'chest pain, get me a nurse';
 const { seam } = fakeCloudVoice(heard);
 const originalFetch = globalThis.fetch;
 let outside = 0;
 globalThis.fetch = (async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
 ) => {
  if (String(input).startsWith('http://127.0.0.1:')) return originalFetch(input, init);
  outside += 1;
  throw new Error('an emergency must not reach the network');
 }) as typeof fetch;
 try {
  const errors = await withServer(
   handleTurn,
   async (base) => {
    const listenResponse = await postTo(
     base,
     '/assistant/v1/listen',
     JSON.stringify({ userConsent: true, language: 'en-ZA', audioBase64: 'AAAA', audioFormat: 'audio/wav' }),
    );
    assert.equal(listenResponse.status, 200);
    const { text } = (await listenResponse.json()) as { text: string };
    assert.equal(text, heard, 'the capture became words');
    const response = await post(base, JSON.stringify({ text, userConsent: true }));
    assert.equal(response.status, 200);
    const payload = (await response.json()) as AssistantTurnResponse;
    assert.equal(payload.route, 'emergency');
    assert.equal(payload.classification, 'emergency');
    assert.equal(
     payload.reply,
     buildResponse(heard, 'patient').reply,
     'the engine’s own emergency reply, word for word — a capture that says chest pain never waits on a model',
    );
   },
   notSearching,
   seam,
  );
  assert.deepEqual(errors, [], 'an emergency turn is answered, and an answer writes nothing on the error stream');
 } finally {
  globalThis.fetch = originalFetch;
 }
 assert.equal(outside, 0, 'not one request left for the model tiers: the emergency path is offline by construction');
});

/* ---- The gated clinical family, built and shut on 22 September 2026 -------------------------

   The five addresses below are built in the handler and refused by the contracts: the two triage
   steps answer the engine's triage-not-ratified while packages/catalog/clinical.json names no
   ratified protocol, the vital reading answers device-data-needs-a-dpia in any process that has
   not said it is testing, and the handover submission answers clinician-routing-not-built always.
   What these tests hold down is the difference between a route that is dark and a route that is
   missing — a 503 with the contract's own sentence, never a 501 and never a 404 — and the shape
   of the day the gates open: the same handler, the same request and response fields, the same
   consent checks, answered by a seam that says yes. */

/* The contract's own sentence for a refusal, read the way the server reads it — the engine's
   refusals first, then the routes' own — so a test asserts the sentence the contract holds and
   never a copy of it that could drift beside it. */
const statementOf = (refusalId: string): string => {
 const engine = assistantContract.refusals.find((entry) => entry.id === refusalId);
 if (engine) return engine.statement;
 for (const route of assistantContract.routes) {
  const own = route.refusals.find((entry) => entry.id === refusalId);
  if (own) return own.statement;
 }
 throw new Error(`the contract no longer declares a refusal called ${refusalId}`);
};
/* The whole body a refusal arrives in: the id, the snake_case word beside it and the sentence. */
const refusalOf = (refusalId: string) => ({
 error: refusalId.replace(/-/g, '_'),
 refusalId,
 message: statementOf(refusalId),
});

/* A clinical seam a test decides, shut at every door by default and holding a real observation
   store the test can read back — because the only way to prove a gate opens is to be able to hand
   the handler a gate that is open, and the only way to prove a handover is assembled from what was
   stored is to have stored it through the route that stores it. */
const clinicalSeam = (
 over: Partial<ClinicalFlowSeam> = {},
): ClinicalFlowSeam & { observations: ObservationStore } => {
 const observations = createObservationStore();
 return {
  triageOpen: () => false,
  beginTriage: () => ({ ok: false, refusalId: 'internal-error', status: 500 }),
  answerTriage: () => ({ ok: false, refusalId: 'internal-error', status: 500 }),
  vitalsSynthetic: () => false,
  store: () => observations,
  ...over,
  observations,
 };
};

/* The stub that stands in for a ratified protocol: two questions, asked a step at a time, which is
   the whole of what a protocol's content would hand a handler. It exists because the live seam has
   no questions to ask — no contract in this repository holds any, and a handler that invented them
   would be inventing clinical content — and a gate that could only ever be shut is a gate nobody
   has proved opens. */
const ratifiedQuestions = (observations = createObservationStore()): ClinicalFlowSeam => {
 const questions = ['Does the pain sit in your chest?', 'How long has it been there?'];
 const begun = new Set<string>();
 return {
  triageOpen: () => true,
  beginTriage: ({ sessionId }) => {
   begun.add(sessionId);
   return { ok: true, value: { question: questions[0], step: 1, steps: questions.length } };
  },
  answerTriage: ({ sessionId, step }) => {
   /* Which step is current is the protocol's to know, so an answer for a session that never began
      one, or for a step that is not being asked, comes back as the route's own refusal rather than
      being fitted to whatever the handler happened to be holding. */
   if (!begun.has(sessionId)) return { ok: false, refusalId: 'step-out-of-order', status: 409 };
   if (step >= questions.length) return { ok: true, value: { done: true, step } };
   return { ok: true, value: { done: false, question: questions[step], step: step + 1 } };
  },
  vitalsSynthetic: () => false,
  store: () => observations,
 };
};

/* A reading the contract would accept, stamped now because the route measures staleness against
   its own clock and a fixture timestamp would be stale before the suite finished. */
const vitalBody = (over: Record<string, unknown> = {}) => ({
 type: 'heart-rate',
 value: 82,
 unit: '{beats}/min',
 capturedAt: new Date().toISOString(),
 source: 'manual',
 sessionId: 'session-fixture-01',
 userConsent: true,
 ...over,
});
const VITALS = '/assistant/v1/vitals';
const TRIAGE_START = '/assistant/v1/triage/start';
const TRIAGE_ANSWER = '/assistant/v1/triage/answer';
const PREPARE = '/assistant/v1/handover/prepare';
const SUBMIT = '/assistant/v1/handover/submit';

test('every address the contract declares is built, and none of them answers not-yet-available', async () => {
 const notYet = assistantContract.refusals.find(
  (entry) => entry.id === 'not-yet-available',
 ) as { id: string; status: number; statement: string; answeredBy?: string[] | null } | undefined;
 assert.ok(notYet, 'the contract still carries the refusal this test reads');
 assert.equal(notYet.status, 501);
 /* The engine refusal's answeredBy is the list of addresses that used to refuse with it. Every one
    is a withdrawn version now, and every one has a built version beside it at the same address —
    which is exactly the rule the server's own not-yet-available map is built from, so a map that
    still carried an address would be a map this test contradicts. */
 for (const answered of notYet.answeredBy ?? []) {
  const [method, at] = answered.split(' ');
  const [path, version] = at.split('@');
  const route = assistantContract.routes.find(
   (entry) => entry.method === method && entry.path === path && entry.version === Number(version),
  );
  assert.ok(route, `${answered} is named by the refusal, so the contract declares it`);
  assert.equal(route.status, 'withdrawn', `${answered} refuses as unbuilt only as a withdrawn version`);
 }
 for (const route of assistantContract.routes) {
  if (route.status === 'built') continue;
  assert.ok(
   assistantContract.routes.some(
    (built) => built.method === route.method && built.path === route.path && built.status === 'built',
   ),
   `${route.method} ${route.path}@${route.version} is ${route.status} and has no built version beside it`,
  );
 }
 /* Since 27 September 2026 the assistant engine has settings, and its two settings routes are built
    on the engine runtime under packages/engines — the same runtime every other engine's settings
    answer on — and not by this service. They are told apart by where their evidence lives, never by
    name, so a third route built there is left out the same way and a route built here is walked. */
 const servedHere = (route: { evidence?: { file?: string } }) =>
  !route.evidence?.file?.startsWith('packages/engines/');
 const declared = [
  ...new Map(
   assistantContract.routes
    .filter(servedHere)
    .map((route) => [`${route.method} ${route.path}`, route] as const),
  ).values(),
 ];
 const elsewhere = assistantContract.routes.filter((route) => !servedHere(route));
 assert.ok(
  elsewhere.every((route) => /^\/v1\/assistant\/(settings|setting-changes|setting-reviews)$/.test(route.path)),
  'the only addresses built elsewhere are the settings routes the engine runtime answers',
 );
 /* Twelve addresses the conversation surface answers, and founder access's four (24 September 2026),
    which a server started without its switch answers with the dark refusal — never a 404 and never
    not-yet-available — so the walk below holds them to the same rule. */
 assert.equal(declared.length, 16, 'sixteen addresses, and the test below walks every one');
 const errors = await withServer(
  async () => QUIET_ANSWER,
  async (base) => {
   for (const route of declared) {
    const path = `/assistant${route.path}`;
    const response = await fetch(`${base}${path}`, {
     method: route.method,
     headers: { 'content-type': 'application/json' },
     body: route.method === 'POST' ? JSON.stringify({}) : undefined,
    });
    assert.notEqual(
     response.status,
     404,
     `${route.method} ${path} is declared, so it is answered rather than unknown`,
    );
    const payload = (await response.json()) as { refusalId?: string };
    assert.notEqual(
     payload.refusalId,
     'not-yet-available',
     `${route.method} ${path} is built, so it refuses on its own terms or answers`,
    );
   }
   const undeclared = await fetch(`${base}/assistant/v1/undeclared`, { method: 'POST' });
   assert.equal(undeclared.status, 404, 'an address the contract does not declare is still a 404');
   const wrongMethod = await fetch(`${base}${TRIAGE_START}`);
   assert.equal(
    wrongMethod.status,
    404,
    'a method the contract does not declare is neither a 501 nor the gate’s 503',
   );
  },
  async () => [],
  notSpeaking,
 );
 assert.deepEqual(errors, [], 'a refusal is an answer, and an answer writes nothing on the error stream');
});

test('both triage steps answer the contract’s own 503 while no protocol is ratified, never a 501', async () => {
 /* The real seam, which reads the real register: this is the refusal a deployment meets today. */
 const errors = await withServer(mustNotRun, async (base) => {
  for (const path of [TRIAGE_START, TRIAGE_ANSWER]) {
   const response = await postTo(
    base,
    path,
    JSON.stringify({ userConsent: true, language: 'en-ZA', sessionId: 'session-fixture', step: 1, answer: 'yes' }),
   );
   assert.equal(
    response.status,
    503,
    `${path} is built and gated, which is a 503 with a sentence — not a 501, which would say it was missing`,
   );
   assert.notEqual(response.status, 501, `${path} must not refuse as unbuilt`);
   assert.deepEqual(await response.json(), refusalOf('triage-not-ratified'), `${path} says the contract's own words`);
  }
 });
 assert.deepEqual(errors, [], 'a governed refusal is an answer, and writes nothing on the error stream');
});

test('a shut gate reads nothing: a body that would be refused on its own terms never gets the chance', async () => {
 /* The gate is the first statement in both branches, and this is the proof. A malformed body is a
    400 and an oversized one a 413 everywhere else in this file; here both are the same 503, because
    a route that may not run has no business parsing what it was sent — and a caller learns nothing
    about the shape of a request the service would refuse anyway. */
 const oversized = JSON.stringify({ userConsent: true, language: 'x'.repeat(800 * 1024) });
 const errors = await withServer(mustNotRun, async (base) => {
  for (const path of [TRIAGE_START, TRIAGE_ANSWER]) {
   const malformed = await postTo(base, path, '{');
   assert.equal(malformed.status, 503, `${path} answers the gate before it answers the body`);
   assert.deepEqual(await malformed.json(), refusalOf('triage-not-ratified'));
   const tooLarge = await postTo(base, path, oversized);
   assert.equal(tooLarge.status, 503, `${path} never measures a body it will not read`);
   assert.deepEqual(await tooLarge.json(), refusalOf('triage-not-ratified'));
  }
  /* The same is true of the vitals route's own gate, and of the submission, which reads no body at
     all: three doors that answer before anything is parsed. */
  const vitals = await postTo(base, VITALS, '{');
  assert.equal(vitals.status, 503);
  assert.deepEqual(await vitals.json(), refusalOf('device-data-needs-a-dpia'));
  const submit = await postTo(base, SUBMIT, '{');
  assert.equal(submit.status, 503);
  assert.deepEqual(await submit.json(), refusalOf('clinician-routing-not-built'));
 });
 assert.deepEqual(errors, [], 'four refusals, and not one of them is this process’s fault');
});

test('the live seam’s two doors are the register’s answer and the environment’s, and never this file’s', async () => {
 const live = liveClinicalFlows();
 const gate = triageGate();
 assert.equal(gate.open, false, 'no triage protocol is designated, so the gate is shut');
 assert.equal(
  live.triageOpen(),
  gate.open,
  'the live seam asks the gate rather than holding its own opinion',
 );
 /* The vitals door is the environment's, read against the contract's own two words rather than
    against a copy of them: an unset switch and a switch set to anything else both keep the route
    dark, and only the contract's exact value opens it. */
 const { env, value } = vitalsContract.testing;
 const held = process.env[env];
 try {
  delete process.env[env];
  assert.equal(liveClinicalFlows().vitalsSynthetic(), false, 'an unset switch keeps the route dark');
  process.env[env] = 'yes';
  assert.equal(liveClinicalFlows().vitalsSynthetic(), false, 'any other word keeps it dark too');
  process.env[env] = value;
  assert.equal(liveClinicalFlows().vitalsSynthetic(), true, `${env}=${value} is the one door`);
 } finally {
  if (held === undefined) delete process.env[env];
  else process.env[env] = held;
 }
 /* Two stores from one seam are the same store, so a reading accepted on one route is there for the
    next one to assemble; two seams are two stores, so a test cannot leak a reading into another. */
 assert.equal(live.store(), live.store());
 assert.notEqual(liveClinicalFlows().store(), liveClinicalFlows().store());
});

/* A seam that counts every time a route reaches past its own checks, so a test can assert not only
   the refusal a caller met but that nothing behind it ran: a consent or a required field refused
   after a question was asked, a reading stored or a pack assembled would be a check that decorates
   the route rather than gating it. */
const countingSeam = (over: Partial<ClinicalFlowSeam> = {}) => {
 const reached: string[] = [];
 const seam = clinicalSeam({
  triageOpen: () => true,
  vitalsSynthetic: () => true,
  beginTriage: (input) => {
   reached.push(`begin:${input.sessionId}`);
   return { ok: true, value: { question: 'Does the pain sit in your chest?', step: 1, steps: 2 } };
  },
  answerTriage: (input) => {
   reached.push(`answer:${input.sessionId}:${input.step}`);
   return { ok: true, value: { done: true, step: input.step } };
  },
  ...over,
 });
 return { seam, reached };
};

/* The shared refusal every route in this service inherits from packages/catalog/apis.json, whose
   statement the handler says word for word: a route that guessed a missing field would have
   invented part of somebody's request. */
const REQUIRED_FIELD_MISSING = {
 error: 'required_field_missing',
 refusalId: 'required-field-missing',
 message: 'A field this route needs was not sent.',
};

test('an open gate with no protocol content behind it is this process’s 500, and is written as one', async () => {
 /* The blocker, asserted rather than hidden. The gate, the routes, their fields and their consent
    checks all open from the catalog, but the questions a guided assessment asks are a ratified
    protocol's own content and no contract in this repository holds any — so the live seam refuses
    to invent them, and a gate that somehow opened onto nothing is this process's fault rather than
    a caller's. The caller gets the one non-revealing sentence and the log gets an error's type
    name; what opens the route for real is the board publishing that content in a contract. */
 const live = liveClinicalFlows();
 const seam = clinicalSeam({
  triageOpen: () => true,
  beginTriage: live.beginTriage,
  answerTriage: live.answerTriage,
 });
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const begun = await postTo(
    base,
    TRIAGE_START,
    JSON.stringify({ userConsent: true, language: 'en-ZA', sessionId: 'session-fixture-01' }),
   );
   assert.equal(begun.status, 500, 'a gate that opened onto no questions is a fault, not an answer');
   assert.deepEqual(await begun.json(), refusalOf('internal-error'));
   const answered = await postTo(
    base,
    TRIAGE_ANSWER,
    JSON.stringify({ sessionId: 'session-fixture-01', step: 1, answer: 'yes' }),
   );
   assert.equal(answered.status, 500);
   assert.deepEqual(await answered.json(), refusalOf('internal-error'));
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.equal(errors.length, 2, 'one line per route, and nothing else');
 assert.deepEqual(JSON.parse(errors[0]), {
  event: 'assistant.triage.refused',
  route: '/assistant/v1/triage/start',
  kind: 'Error',
 });
 assert.deepEqual(JSON.parse(errors[1]), {
  event: 'assistant.triage.refused',
  route: '/assistant/v1/triage/answer',
  kind: 'Error',
 });
 for (const line of errors)
  for (const forbidden of [REQUEST_TEXT, DUMMY_KEY, DUMMY_ENDPOINT, DUMMY_HEADER, 'internal-error'])
   assert.equal(line.includes(forbidden), false, `the failure line must not carry "${forbidden}"`);
});

test('an open gate asks the protocol’s own question and answers a step at a time', async () => {
 /* The ungated half, reached through the seam rather than through a ratified protocol that does
    not exist: the same handler, the same fields, the same statuses the contract declares. This is
    the proof that what stands between a caller and a triage is the register and nothing in the
    handler. */
 const seam = ratifiedQuestions();
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const started = await postTo(
    base,
    TRIAGE_START,
    JSON.stringify({ userConsent: true, language: 'en-ZA', sessionId: 'session-fixture-09' }),
   );
   assert.equal(started.status, 200);
   assert.deepEqual(
    await started.json(),
    {
     question: 'Does the pain sit in your chest?',
     step: 1,
     steps: 2,
     sessionId: 'session-fixture-09',
    },
    'the four fields the contract declares, and no fifth',
   );
   const minted = await postTo(base, TRIAGE_START, JSON.stringify({ userConsent: true, language: 'en-ZA' }));
   assert.equal(minted.status, 200);
   const { sessionId } = (await minted.json()) as { sessionId: string };
   assert.match(sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-/, 'a caller that held no conversation is given one');

   const next = await postTo(base, TRIAGE_ANSWER, JSON.stringify({ sessionId, step: 1, answer: 'yes' }));
   assert.equal(next.status, 200);
   assert.deepEqual(
    await next.json(),
    { done: false, question: 'How long has it been there?', step: 2 },
    'a step that is not the last owes the next question',
   );
   const last = await postTo(base, TRIAGE_ANSWER, JSON.stringify({ sessionId, step: 2, answer: 'two days' }));
   assert.equal(last.status, 200);
   assert.deepEqual(
    await last.json(),
    { done: true, step: 2 },
    'the last step owes its own end and no empty string to be read aloud as a question',
   );

   /* Which step is current is the protocol's to know, so an answer offered for a conversation that
      never began one comes back as the route's own refusal — at the status the contract declares
      for it, with the sentence the contract wrote, and with nothing written on the error stream,
      because a caller's mistake is not this process's fault. */
   const outOfOrder = await postTo(
    base,
    TRIAGE_ANSWER,
    JSON.stringify({ sessionId: 'session-never-begun', step: 1, answer: 'yes' }),
   );
   assert.equal(outOfOrder.status, 409);
   assert.deepEqual(await outOfOrder.json(), refusalOf('step-out-of-order'));
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.deepEqual(errors, [], 'two answers and one caller’s 409 write nothing on the error stream');
});

test('the agreement is asked before a question, a reading or a handover is', async () => {
 const { seam, reached } = countingSeam();
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const unconsenting = [undefined, false, 'true', 1, null];
   const doors: Array<[string, string, Record<string, unknown>]> = [
    [TRIAGE_START, 'assessment-needs-consent', { language: 'en-ZA' }],
    [VITALS, 'vitals-needs-consent', vitalBody()],
    [PREPARE, 'handover-needs-consent', { sessionId: 'session-fixture-01' }],
   ];
   for (const [path, refusalId, rest] of doors) {
    for (const userConsent of unconsenting) {
     const response = await postTo(base, path, JSON.stringify({ ...rest, userConsent }));
     assert.equal(
      response.status,
      403,
      `${path} with userConsent ${JSON.stringify(userConsent) ?? 'absent'} is refused`,
     );
     assert.deepEqual(
      await response.json(),
      refusalOf(refusalId),
      `${path} says the sentence the contract wrote for its own agreement`,
     );
    }
   }
   assert.deepEqual(reached, [], 'not one question was asked, and not one reading was reached for');
   assert.deepEqual(
    seam.observations.readings('session-fixture-01'),
    [],
    'a reading refused for want of consent was never stored',
   );

   /* And an explicit true is the only thing that opens them. */
   const begun = await postTo(base, TRIAGE_START, JSON.stringify({ userConsent: true, language: 'en-ZA' }));
   assert.equal(begun.status, 200);
   assert.equal(reached.length, 1, 'the agreement satisfied, the seam was reached exactly once');
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.deepEqual(errors, [], 'a consent refusal is an answer, and writes nothing');
});

test('a field the contract requires is held to, and the seam is never reached without it', async () => {
 const { seam, reached } = countingSeam();
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const missing: Array<[string, Record<string, unknown>]> = [
    [TRIAGE_START, { userConsent: true }],
    [TRIAGE_START, { userConsent: true, language: '   ' }],
    [TRIAGE_START, { userConsent: true, language: 7 }],
    [TRIAGE_ANSWER, { sessionId: 'session-fixture-01', step: 1 }],
    [TRIAGE_ANSWER, { sessionId: 'session-fixture-01', answer: 'yes' }],
    [TRIAGE_ANSWER, { sessionId: 'session-fixture-01', step: 0, answer: 'yes' }],
    [TRIAGE_ANSWER, { sessionId: 'session-fixture-01', step: 1.5, answer: 'yes' }],
    [TRIAGE_ANSWER, { sessionId: 'session-fixture-01', step: '1', answer: 'yes' }],
    [VITALS, vitalBody({ sessionId: undefined })],
    [VITALS, vitalBody({ sessionId: '   ' })],
    [PREPARE, { userConsent: true }],
    [PREPARE, { userConsent: true, sessionId: 7 }],
   ];
   for (const [path, body] of missing) {
    const response = await postTo(base, path, JSON.stringify(body));
    assert.equal(response.status, 400, `${path} refuses ${JSON.stringify(body)}`);
    assert.deepEqual(await response.json(), REQUIRED_FIELD_MISSING, `${path} says the shared refusal's own sentence`);
   }
   assert.deepEqual(reached, [], 'a request missing a field never reached the seam behind it');

   /* A malformed body is its own refusal, at its own status, and distinct from a missing field. */
   for (const path of [TRIAGE_START, TRIAGE_ANSWER, VITALS, PREPARE]) {
    const malformed = await postTo(base, path, '{');
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), refusalOf('invalid-request'));
    const oversized = await postTo(
     base,
     path,
     JSON.stringify({ userConsent: true, language: 'en-ZA', sessionId: 'x'.repeat(800 * 1024) }),
    );
    assert.equal(oversized.status, 413, `${path} measures its body against the same ceiling as every other route`);
    assert.deepEqual(await oversized.json(), refusalOf('payload-too-large'));
   }
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.deepEqual(errors, [], 'every one of these is the caller’s, and the log exists for this process’s');
});

test('the vitals route is dark in a process that has not said it is testing, whatever it is sent', async () => {
 /* The DPIA gate, at the route: packages/catalog/vitals.json's real-device allowlist is empty
    because no data protection impact assessment has been done, so a process that has not set the
    contract's own switch refuses every reading before it reads one. The live seam is used here on
    purpose — this is the refusal a deployment meets. */
 const { env } = vitalsContract.testing;
 const held = process.env[env];
 delete process.env[env];
 try {
  const errors = await withServer(
   mustNotRun,
   async (base) => {
    const refused = await postTo(base, VITALS, JSON.stringify(vitalBody()));
    assert.equal(
     refused.status,
     503,
     'a reading that would have passed every validation is still refused in a process that is not testing',
    );
    assert.deepEqual(await refused.json(), refusalOf('device-data-needs-a-dpia'));
    /* The darkness comes before the agreement, for the same reason the triage gate comes before
       the body: a route that may not run reads nothing, and a caller is not asked to agree to
       something that will be refused anyway. */
    const unconsented = await postTo(base, VITALS, JSON.stringify(vitalBody({ userConsent: false })));
    assert.equal(unconsented.status, 503, 'the darkness is not a consent question');
    assert.deepEqual(await unconsented.json(), refusalOf('device-data-needs-a-dpia'));
    const malformed = await postTo(base, VITALS, '{');
    assert.equal(malformed.status, 503, 'and it is not a body question either');
   },
   notSearching,
   notSpeaking,
   liveClinicalFlows(),
  );
  assert.deepEqual(errors, [], 'a governed refusal is an answer, and writes nothing');
 } finally {
  if (held === undefined) delete process.env[env];
  else process.env[env] = held;
 }
});

test('a synthetic reading is validated, stored in its own session and answered with its own reference', async () => {
 const seam = clinicalSeam({ vitalsSynthetic: () => true });
 const sent = vitalBody();
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   const accepted = await postTo(base, VITALS, JSON.stringify(sent));
   assert.equal(accepted.status, 200);
   const reply = (await accepted.json()) as Record<string, unknown>;
   assert.deepEqual(
    Object.keys(reply).sort(),
    ['accepted', 'entryRef', 'sessionId'],
    'the three fields the contract declares, and no reading echoed back at the caller',
   );
   assert.equal(reply.accepted, true);
   assert.equal(reply.sessionId, 'session-fixture-01');
   assert.match(String(reply.entryRef), /^vital-/, 'the reference names what it refers to');
   /* What landed in the session context is the contract's own reading, not the caller's: the LOINC
      code and the UCUM unit come from packages/catalog/vitals.json, so a value can never be stored
      as another measure than the one it was validated against. */
   assert.deepEqual(seam.observations.readings('session-fixture-01'), [
    {
     type: 'heart-rate',
     loinc: '8867-4',
     value: 82,
     unit: '{beats}/min',
     capturedAt: sent.capturedAt,
     source: 'manual',
    },
   ]);
   /* A second reading joins the first in the same session, and a second session keeps its own. */
   const second = await postTo(
    base,
    VITALS,
    JSON.stringify(vitalBody({ type: 'oxygen-saturation', value: 98, unit: '%' })),
   );
   assert.equal(second.status, 200);
   const elsewhere = await postTo(base, VITALS, JSON.stringify(vitalBody({ sessionId: 'session-fixture-02' })));
   assert.equal(elsewhere.status, 200);
   assert.deepEqual(
    seam.observations.readings('session-fixture-01').map((entry) => entry.type),
    ['heart-rate', 'oxygen-saturation'],
   );
   assert.deepEqual(
    seam.observations.readings('session-fixture-02').map((entry) => entry.type),
    ['heart-rate'],
   );
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.deepEqual(errors, [], 'an accepted reading is an answer, and writes nothing');
});

test('a reading the contract refuses is refused at the route, and never stored', async () => {
 /* The route level of what ../lib/vitals.test.ts holds at the validator: what matters here is that
    each refusal arrives with the contract's own sentence at the contract's own status, and that a
    refused reading left nothing behind in the session — a store that kept what it refused would be
    keeping exactly the values the contract exists to keep out. */
 const seam = clinicalSeam({ vitalsSynthetic: () => true });
 const stale = new Date(Date.now() - (vitalsContract.staleness.maxAgeMs + 60_000)).toISOString();
 const cases: Array<[string, Record<string, unknown>, string, number]> = [
  ['a type the contract does not register', { type: 'blood-oxygen' }, 'reading-not-validated', 422],
  ['a unit that belongs to another measure', { unit: 'mm[Hg]' }, 'reading-not-validated', 422],
  ['a value above its plausibility bound', { value: 400 }, 'reading-not-validated', 422],
  ['a value below its plausibility bound', { value: 0 }, 'reading-not-validated', 422],
  ['a value that is not a number', { value: 'eighty-two' }, 'reading-not-validated', 422],
  ['a reading older than the staleness window', { capturedAt: stale }, 'reading-not-validated', 422],
  ['a timestamp that cannot be read', { capturedAt: 'this morning' }, 'reading-not-validated', 422],
  ['a source the contract does not name', { source: 'fitbit' }, 'reading-not-validated', 422],
  ['a device reading, with the allowlist empty', { source: 'device', deviceRef: 'device-fixture-01' }, 'unregistered-device', 422],
  ['a HealthKit reading, with the allowlist empty', { source: 'healthkit', deviceRef: 'device-fixture-01' }, 'unregistered-device', 422],
  ['a Health Connect reading, with no device named', { source: 'healthconnect' }, 'unregistered-device', 422],
  ['an identity number riding in the device reference', { deviceRef: '8001015009087' }, 'reading-not-validated', 422],
 ];
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   for (const [why, over, refusalId, status] of cases) {
    const response = await postTo(base, VITALS, JSON.stringify(vitalBody(over)));
    assert.equal(response.status, status, why);
    assert.deepEqual(await response.json(), refusalOf(refusalId), why);
   }
   assert.deepEqual(seam.observations.readings('session-fixture-01'), [], 'not one refused reading was stored');
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.deepEqual(errors, [], 'a refused reading is the contract’s answer, not this process’s fault');
});

test('a handover is prepared for the person to review, and the preparing never submits it', async () => {
 const seam = clinicalSeam({ vitalsSynthetic: () => true });
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   /* A session with nothing validated on it has nothing to hand over, and an empty pack sent to a
      clinician is a person's time spent on nothing. */
   const empty = await postTo(base, PREPARE, JSON.stringify({ sessionId: 'session-fixture-01', userConsent: true }));
   assert.equal(empty.status, 409);
   assert.deepEqual(await empty.json(), refusalOf('nothing-to-hand-over'));

   const stored = await postTo(base, VITALS, JSON.stringify(vitalBody()));
   assert.equal(stored.status, 200);
   const prepared = await postTo(base, PREPARE, JSON.stringify({ sessionId: 'session-fixture-01', userConsent: true }));
   assert.equal(prepared.status, 200);
   const reply = (await prepared.json()) as {
    handoverRef: string;
    preparedAt: string;
    pack: Record<string, unknown>;
   };
   assert.deepEqual(
    Object.keys(reply).sort(),
    ['handoverRef', 'pack', 'preparedAt'],
    'the pack and its reference — and no submitted flag, no queue, no clinician',
   );
   assert.match(reply.handoverRef, /^handover-/);
   assert.equal(reply.preparedAt, new Date(reply.preparedAt).toISOString(), 'the pack is stamped with a real moment');
   assert.deepEqual(
    Object.keys(reply.pack).sort(),
    ['sources', 'summary', 'symptoms', 'urgency', 'vitals'],
    'the five fields the contract declares for the pack, and nothing a clinician would act on that this service did not compute',
   );
   assert.equal(
    reply.pack.urgency,
    'not-triaged',
    'the honest urgency while no ratified protocol has run — never a score and never a priority',
   );
   assert.equal((reply.pack.vitals as string[]).length, 1);
   assert.match((reply.pack.vitals as string[])[0], /^heart-rate 82 \{beats\}\/min at /);
   /* Held against its own reference, so a submission — the day one exists to write — looks the pack
      up rather than trusting a caller to carry it back unchanged. */
   assert.equal(seam.observations.handover(reply.handoverRef)?.urgency, 'not-triaged');

   /* And the next address down still refuses, holding the very reference the person was just given:
      routing a pack to a clinician needs an identity service, a nurse roster and a destination
      contract, and this repository has none of the three. */
   const submitted = await postTo(base, SUBMIT, JSON.stringify({ handoverRef: reply.handoverRef }));
   assert.equal(submitted.status, 503, 'a prepared pack is not a routed one');
   assert.deepEqual(await submitted.json(), refusalOf('clinician-routing-not-built'));
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.deepEqual(errors, [], 'a 409, a 200 and a governed 503 write nothing on the error stream');
});

test('the handover submission refuses whatever it is given, because nothing behind it exists', async () => {
 /* The route frame and nothing else. It reads no body, looks up no reference and never varies: a
    handover acknowledged into nothing is worse than one refused, because the person stops looking
    for help that never started. */
 const bodies = [
  '',
  '{}',
  '{',
  JSON.stringify({ handoverRef: 'handover-fixture' }),
  JSON.stringify({ handoverRef: 'handover-fixture', userConsent: true, destination: 'nurse-queue' }),
 ];
 for (const seam of [clinicalSeam(), clinicalSeam({ triageOpen: () => true, vitalsSynthetic: () => true })]) {
  const errors = await withServer(
   mustNotRun,
   async (base) => {
    for (const body of bodies) {
     const response = await postTo(base, SUBMIT, body);
     assert.equal(response.status, 503, `a submission of "${body.slice(0, 24)}" is refused`);
     assert.deepEqual(await response.json(), refusalOf('clinician-routing-not-built'));
    }
    /* A malformed body is the same 503 and not a 400, which is the proof that nothing was parsed:
       there is no shape this route would accept, so it asks for none. */
   },
   notSearching,
   notSpeaking,
   seam,
  );
  assert.deepEqual(errors, [], 'a refusal it always gives is not a fault');
 }
});

test('an identity-shaped value is refused at the vitals route and redacted out of a handover pack', async () => {
 const seam = clinicalSeam({ vitalsSynthetic: () => true });
 const IDENTITY = '8001015009087';
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   /* Every string field a reading carries is run through the same detector the turn route uses, and
      the reading is refused whole rather than redacted and stored: a clinical value with somebody's
      identity number inside it is not a reading this service should be holding at all. */
   for (const field of ['type', 'unit', 'source', 'deviceRef']) {
    const response = await postTo(base, VITALS, JSON.stringify(vitalBody({ [field]: IDENTITY })));
    assert.equal(response.status, 422, `an identity number in ${field} is refused`);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), refusalOf('reading-not-validated'));
    assert.equal(text.includes(IDENTITY), false, `the refusal does not echo the number back out of ${field}`);
   }
   assert.deepEqual(seam.observations.readings('session-fixture-01'), [], 'and nothing was stored');

   /* The pack redacts on the way out too, for a reading that reached the store by some other road:
      a handover is the one artefact this service builds that another person is meant to read, so it
      is the one the redactor most has to catch. */
   seam.observations.addReading('session-fixture-02', {
    type: `heart-rate ${IDENTITY}`,
    loinc: '8867-4',
    value: 82,
    unit: '{beats}/min',
    capturedAt: new Date().toISOString(),
    source: 'manual',
   });
   const prepared = await postTo(base, PREPARE, JSON.stringify({ sessionId: 'session-fixture-02', userConsent: true }));
   assert.equal(prepared.status, 200);
   const pack = await prepared.text();
   assert.equal(pack.includes(IDENTITY), false, 'the identity number is nowhere in the pack');
   assert.match(pack, /\[ID REDACTED\]/, 'and its absence reads as a redaction, not as a gap');
  },
  notSearching,
  notSpeaking,
  seam,
 );
 for (const line of errors)
  assert.equal(line.includes(IDENTITY), false, 'a failure line never carries the number either');
 assert.deepEqual(errors, [], 'and nothing here was this process’s fault');
});

test('a foreign origin meets the origin refusal on all five clinical addresses, and no seam is reached', async () => {
 const { seam, reached } = countingSeam();
 const errors = await withServer(
  mustNotRun,
  async (base) => {
   for (const path of [TRIAGE_START, TRIAGE_ANSWER, VITALS, PREPARE, SUBMIT]) {
    const response = await postTo(base, path, JSON.stringify(vitalBody()), 'https://not-the-site.example');
    assert.equal(response.status, 403, `${path} is refused before it is reached`);
    assert.deepEqual(await response.json(), {
     error: 'origin_not_allowed',
     message: 'This service answers its own site only.',
    });
   }
   assert.deepEqual(reached, [], 'not a gate, not a consent and not a reading ran behind the origin check');
  },
  notSearching,
  notSpeaking,
  seam,
 );
 assert.deepEqual(errors, []);
});

