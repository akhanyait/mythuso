/**
 * The mock's HTTP door. Development only, synthetic data only, loopback only.
 *
 * A mock that answers every route of a health platform with plausible data is, from outside, a fake
 * health service with a real address. So it refuses to start unless MYTHUSO_MOCK is set to exactly
 * synthetic-data-only — the words are the point: whoever starts it has said in so many words what it
 * serves — it binds to 127.0.0.1, it refuses any request that did not arrive on the loopback address,
 * and scripts/check-boundaries.mjs fails the build if anything in deploy/ names it. Every answer carries
 * a header saying it is synthetic.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createMock, loadContract } from './mock.ts';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOST = '127.0.0.1';
const MAX_BODY = 64 * 1024;

export class MockRefusedToStart extends Error {}

export function mockConfig(env: NodeJS.ProcessEnv): { host: string; port: number } {
 const { mock } = loadContract();
 if (env[mock.flag] !== mock.flagValue) throw new MockRefusedToStart(`The mock answers with synthetic data only, and starts only when ${mock.flag}=${mock.flagValue} says so.`);
 const port = Number(env.MYTHUSO_MOCK_PORT ?? 8799);
 if (!Number.isInteger(port) || port < 0 || port > 65535) throw new MockRefusedToStart('MYTHUSO_MOCK_PORT is not a port.');
 return { host: HOST, port };
}

async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown> | null> {
 const chunks: Buffer[] = [];
 let size = 0;
 for await (const chunk of req) {
  size += (chunk as Buffer).length;
  if (size > MAX_BODY) return null;
  chunks.push(chunk as Buffer);
 }
 if (!chunks.length) return {};
 try {
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
 } catch { return null; }
}

export function startMock(env: NodeJS.ProcessEnv = process.env): Server {
 const { host, port } = mockConfig(env);
 const mock = createMock();
 const server = createServer(async (req, res) => {
  const reply = (status: number, body: Record<string, unknown>) => {
   res.writeHead(status, { 'content-type': 'application/json', 'x-mythuso-mock': 'synthetic-data-only' });
   res.end(JSON.stringify(body));
  };
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return reply(403, { error: 'not-loopback', message: 'The mock answers only on this machine.' });
  const url = new URL(req.url ?? '/', `http://${host}`);
  const body = req.method === 'GET' ? {} : await bodyOf(req);
  if (body === null) return reply(400, { error: 'unreadable-body', message: 'The body is not a JSON object of a sensible size.' });
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) headers[name] = Array.isArray(value) ? value[0] : value;
  const answer = mock.handle({ method: req.method ?? 'GET', path: url.pathname, headers, query: Object.fromEntries(url.searchParams), body });
  reply(answer.status, answer.body);
 });
 server.listen(port, host);
 return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const server = startMock();
 server.on('listening', () => console.log(`mock-api on http://${HOST}:${(server.address() as { port: number }).port} — synthetic data only`));
}
