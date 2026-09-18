import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleTurn } from './routes/turn.ts';

/* Dependency-free, the same way apps/api is: two routes do not need a web framework, and every
   dependency here is one more thing to trust with a patient's words before they ever reach the
   safety engine in packages/gilbertone. */

const MAX_BODY_BYTES = 16 * 1024;

function send(res: ServerResponse, status: number, body: unknown): void {
 res.writeHead(status, {
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
