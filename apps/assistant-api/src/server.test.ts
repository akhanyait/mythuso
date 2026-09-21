import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantServer } from './server.ts';
import { handleTurn } from './routes/turn.ts';
import type { AssistantTurnResponse } from './lib/schema.ts';

/* The server's own tests, added with the CodeReview fixes of 21 September 2026: the status a
   caller meets must tell the truth about whose fault a failure is — 400 and 413 are the caller's
   request, 500 is this process — and the line a failure writes must be one structured record,
   carrying no request text, no credential, no header and no endpoint. The turn handler is
   injected because it is the one seam: no input makes the real handler throw (it answers an
   invalid message rather than raising), so a stub is the only way to reach the catch under test.
   The dummy strings below are shaped like the things a log must never hold, and every byte a
   failure writes is read back and held to their absence. */

const REQUEST_TEXT = 'my id number is 8001015009087 and I feel dizzy';
const DUMMY_KEY = 'fixture-secret-9f4c2b7e1a';
const DUMMY_ENDPOINT = 'https://fixture-account.openai.azure.invalid';
const DUMMY_HEADER = 'x-fixture-authorization: Bearer fixture-token';

/* Every line the server writes to the error stream while `body` runs, and the real console put
   back whatever happens — a test that leaks a mocked console changes what the next test is
   measuring. Binding port 0 keeps this file clear of the 8791 a running service may hold. */
const withServer = async (
 turn: typeof handleTurn,
 body: (base: string) => Promise<void>,
): Promise<string[]> => {
 const errors: string[] = [];
 const originalError = console.error;
 console.error = (...args: unknown[]) => {
  errors.push(args.map((entry) => String(entry)).join(' '));
 };
 const server = createAssistantServer(turn);
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

const post = (base: string, body: string) =>
 fetch(`${base}/assistant/turn`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body,
 });

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
   JSON.stringify({ text: 'x'.repeat(20 * 1024), userConsent: true }),
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
