import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { activationRefusal, assistantActivation, modelTierAllowed } from './lib/activation.ts';
import { AzureOpenAIProvider, OllamaProvider } from './lib/llm-adapter.ts';
import { corsFor } from './lib/origin-policy.ts';
import { handleTurn } from './routes/turn.ts';

/* No web framework, the same way apps/api has none: two routes over node:http, and the only
   dependencies this service carries are the LangChain tier and the catalog it reads — every one of
   them a thing to audit before a patient's words reach it. The framework is the part that was
   left out; the tier below ./lib is the part that is not small, and pretending otherwise is what
   this comment used to do. */

const MAX_BODY_BYTES = 16 * 1024;

/* The production acknowledgement gate, enforced before the port is even bound: with NODE_ENV
   production and a provider configured, a key alone does not start this service. The message names
   the missing variable and never a value, because this process may be holding a credential in its
   environment and a log is one of the few places it must never appear. See ./lib/activation.ts for
   why the gate exists and what it is not. */
const refusal = activationRefusal();
if (refusal) {
 console.error(refusal);
 process.exit(1);
}

/* Browser origins are answered per ./lib/origin-policy.ts: the site's own two names in production,
   localhost shapes in development, a 403 for every other Origin before any route reads the URL. A
   request with no Origin — curl, a health check — is not a browser context and is answered as
   before, without CORS headers it never needed. */
function send(res: ServerResponse, status: number, headers: Record<string, string>, body: unknown): void {
 res.writeHead(status, {
  ...headers,
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
 });
 res.end(JSON.stringify(body));
}

/* Reads the whole body before parsing, capped below the size a legitimate turn could ever need —
   nobody's next sentence to GilbertOne is 16 KB, and nginx refuses anything larger before it
   reaches this function. Oversized and malformed are different failures with different causes, so
   they get different statuses rather than one generic 400. */
async function readJsonBody(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
 const chunks: Buffer[] = [];
 let size = 0;
 for await (const chunk of req as AsyncIterable<Buffer>) {
  size += chunk.length;
  if (size > MAX_BODY_BYTES) return { ok: false, status: 413 };
  chunks.push(chunk);
 }
 if (!chunks.length) return { ok: true, value: {} };
 try {
  return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
 } catch {
  return { ok: false, status: 400 };
 }
}

/* The line a failed turn writes: one JSON object on one line, carrying only facts this process
   owns. An exception out of handleTurn can be a provider's raw error, and a raw provider error
   can carry an endpoint, a header or a body — so the line reads the error's type name and nothing
   else, reduced to letters and capped, a shape no value can ride out on: a scheme, a path or an
   address cannot survive the strip. The request's own text, its headers, the endpoint and the
   response body are never touched here, because a log is one of the places the adapter's own
   comments say a patient's words and a credential must never surface. */
const turnFailureLine = (error: unknown): string => {
 const name = error instanceof Error ? error.name : typeof error;
 const kind = name.replace(/[^A-Za-z]/g, '').slice(0, 32) || 'unknown';
 return JSON.stringify({ event: 'assistant.turn.failed', route: '/assistant/turn', kind });
};

/* The server, built rather than started, so its own tests can hold the routes in their process:
   the turn handler is the one injectable seam — no input makes the real one throw (it answers an
   invalid message rather than raising), and the catch below it is exactly what those tests must
   reach. The real entry passes nothing and gets handleTurn. */
export function createAssistantServer(turn: typeof handleTurn = handleTurn): Server {
 /* Read once, per server: the facts the health route reports are facts about how this process was
    configured, and they cannot change while it runs. */
 const activation = assistantActivation();

 return createServer(async (req, res) => {
  const cors = corsFor(req.headers.origin);
  if (cors.refused) {
   /* A browser origin this deployment does not answer. Nothing further is read — not the method,
      not the URL, not the body — and no CORS header goes back that could be read as permission. */
   return send(res, 403, {}, {
    error: 'origin_not_allowed',
    message: 'This service answers its own site only.'
   });
  }
  /* The preflight, answered before any route looks at the URL or the method: no body is read,
     nothing is classified, and a browser on the allow-list gets the headers it asked about. */
  if (req.method === 'OPTIONS') {
   res.writeHead(204, { ...cors.headers, 'cache-control': 'no-store' });
   res.end();
   return;
  }
  if (req.method === 'GET' && req.url === '/assistant/health') {
   /* Provider presence is a fact about configuration, not a health claim: `true` means this process
      read an endpoint and a key from its environment — and nothing about the values themselves. It
      exists so the activation sequence in deploy/RUNBOOK.md can show that the service found the
      credentials it was given, without anything printing them. Ollama is reported the same cheap way
      (a set OLLAMA_URL, never the 800ms probe): a health route that could take the best part of a
      second to answer is a health route a checker starts skipping.
      `production` and `activated` are the acknowledgement gate's own truth: in production
      `activated` is false until the acknowledgement line is in the env file, and a process carrying
      it is the only one that would have started with credentials configured at all. Booleans only —
      there is no field here that could carry a secret even by accident. */
   return send(res, 200, cors.headers, {
    ok: true,
    mode: 'phase-2-safe',
    azure: new AzureOpenAIProvider().available,
    ollama: new OllamaProvider().available,
    production: activation.production,
    activated: modelTierAllowed(),
   });
  }
  if (req.method === 'POST' && req.url === '/assistant/turn') {
   const body = await readJsonBody(req);
   if (!body.ok) {
    return send(res, body.status, cors.headers, {
     error: body.status === 413 ? 'payload_too_large' : 'invalid_request',
     message: 'The request could not be processed safely.'
    });
   }
   try {
    const result = await turn(body.value as Parameters<typeof handleTurn>[0]);
    return send(res, 200, cors.headers, result);
   } catch (error) {
    /* An exception out of the turn is this process's fault, never the caller's: the 400 this
       catch used to send told a caller their request was wrong when the truth was the opposite,
       and it left whoever read the logs with nothing at all. The caller gets one generic
       sentence under a 500 — non-revealing by construction — and the line above is the only
       record of what the process itself met. */
    console.error(turnFailureLine(error));
    return send(res, 500, cors.headers, {
     error: 'internal_error',
     message: 'The request could not be processed safely.'
    });
   }
  }
  send(res, 404, cors.headers, { error: 'not_found' });
 });
}

/* Binding is the entry's act, not the module's: imported by a test, this file exports the factory
   above and takes no port. Run directly — `npm start` in development, or the bundled server.mjs
   the unit starts — the guard below is true and the port is bound, as it always was. The same
   house idiom apps/api/src/server.ts carries. */
export function start(): void {
 const server = createAssistantServer();
 server.listen(8791, () => {
  console.log('Assistant API listening on 8791');
 });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) start();
