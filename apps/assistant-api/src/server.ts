import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleTurn } from './routes/turn.ts';

/* Dependency-free, the same way apps/api is: two routes do not need a web framework, and every
   dependency here is one more thing to trust with a patient's words before they ever reach the
   safety engine in packages/gilbertone. */

const MAX_BODY_BYTES = 16 * 1024;

/* The panel and this service are different origins in development — the vite dev server on its
   own port, this service on 3001 — so the browser asks before either request runs. This is the
   development answer: any origin may call, the two methods the routes carry plus the preflight,
   and nothing but a JSON content type is accepted. A deployment that fronts both under one
   origin never exercises any of it. */
const CORS_HEADERS = {
 'access-control-allow-origin': '*',
 'access-control-allow-methods': 'POST, GET, OPTIONS',
 'access-control-allow-headers': 'content-type'
};

function send(res: ServerResponse, status: number, body: unknown): void {
 res.writeHead(status, {
  ...CORS_HEADERS,
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
 });
 res.end(JSON.stringify(body));
}

/* Reads the whole body before parsing, capped below the size a legitimate turn could ever need —
   nobody's next sentence to GilbertOne is 16 KB. Oversized and malformed are different failures
   with different causes, so they get different statuses rather than one generic 400. */
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

const server = createServer(async (req, res) => {
 /* The preflight, answered before any route looks at the URL or the method: no body is read,
    nothing is classified, and the browser gets the three headers it asked about. */
 if (req.method === 'OPTIONS') {
  res.writeHead(204, { ...CORS_HEADERS, 'cache-control': 'no-store' });
  res.end();
  return;
 }
 if (req.method === 'GET' && req.url === '/assistant/health') {
  return send(res, 200, { ok: true, mode: 'phase-2-safe' });
 }
 if (req.method === 'POST' && req.url === '/assistant/turn') {
  const body = await readJsonBody(req);
  if (!body.ok) {
   return send(res, body.status, {
    error: body.status === 413 ? 'payload_too_large' : 'invalid_request',
    message: 'The request could not be processed safely.'
   });
  }
  try {
   const result = await handleTurn(body.value as Parameters<typeof handleTurn>[0]);
   return send(res, 200, result);
  } catch {
   return send(res, 400, { error: 'invalid_request', message: 'The request could not be processed safely.' });
  }
 }
 send(res, 404, { error: 'not_found' });
});

server.listen(3001, () => {
 console.log('Assistant API listening on 3001');
});
