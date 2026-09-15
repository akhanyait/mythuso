/**
 * The engines' HTTP door. Development only, synthetic data only, loopback only.
 *
 * Every engine module lives at packages/engines/src/<engine>/engine.ts and exports `engine`; the server
 * finds them there, so adding an engine is adding its directory rather than editing a shared list.
 * createRuntime() refuses without MYTHUSO_ENGINES=synthetic-data-only, so importing the library does not
 * skip the refusal; the server binds to 127.0.0.1 and refuses any request that did not arrive on the
 * loopback address and name a loopback host — a page that rebinds its own hostname to 127.0.0.1 arrives
 * from loopback with Host: evil.example, which is why the address alone is not enough. Nothing in
 * deploy/ may name this package or its flag, and every answer says it is synthetic.
 */
import { existsSync, readdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { hostName } from '../../mock-api/src/server.ts';
import { loadRuntimeContract } from './runtime/contract.ts';
import { RuntimeRefusedToStart, createRuntime, type Runtime } from './runtime/runtime.ts';
import type { EngineModule } from './runtime/types.ts';

export { RuntimeRefusedToStart };

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOST = '127.0.0.1';
const MAX_BODY = 64 * 1024;

/** Every engine module under src/<engine>/engine.ts whose directory is named for a declared engine. */
export async function discoverEngines(): Promise<EngineModule[]> {
 const contract = loadRuntimeContract();
 const here = new URL('./', import.meta.url);
 const found: EngineModule[] = [];
 for (const entry of readdirSync(here, { withFileTypes: true })) {
  if (!entry.isDirectory() || !contract.engines.has(entry.name)) continue;
  const file = new URL(`./${entry.name}/engine.ts`, here);
  if (!existsSync(file)) continue;
  const module = await import(file.href) as { engine?: EngineModule };
  if (module.engine) found.push(module.engine);
 }
 return found;
}

export function enginesConfig(env: NodeJS.ProcessEnv): { host: string; port: number } {
 const settings = loadRuntimeContract().settings;
 const port = Number(env[settings.portVariable] ?? settings.defaultPort);
 if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RuntimeRefusedToStart(`${settings.portVariable} is not a port.`);
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

export function serveEngines(runtime: Runtime, env: NodeJS.ProcessEnv = process.env): Server {
 const contract = loadRuntimeContract();
 const loopbackHosts = new Set(contract.mock.mock.loopbackHosts);
 const { host, port } = enginesConfig(env);
 const server = createServer(async (req, res) => {
  const reply = (status: number, body: Record<string, unknown>, answeredBy = 'runtime') => {
   res.writeHead(status, { 'content-type': 'application/json', 'x-mythuso-engines': contract.settings.flagValue, 'x-mythuso-answered-by': answeredBy });
   res.end(JSON.stringify(body));
  };
  try {
   if (!LOOPBACK.has(req.socket.remoteAddress ?? '') || !loopbackHosts.has(hostName(req.headers.host))) return reply(403, { error: 'not-loopback', message: 'The engines answer only on this machine, addressed to this machine.' });
   const url = new URL(req.url ?? '/', `http://${host}`);
   const body = req.method === 'GET' ? {} : await bodyOf(req);
   if (body === null) return reply(400, { error: 'unreadable-body', message: 'The body is not a JSON object of a sensible size.' });
   const headers: Record<string, string | undefined> = {};
   for (const [name, value] of Object.entries(req.headers)) headers[name] = Array.isArray(value) ? value[0] : value;
   const answer = runtime.handle({ method: req.method ?? 'GET', path: url.pathname, headers, query: Object.fromEntries(url.searchParams), body });
   reply(answer.status, answer.body, answer.answeredBy);
  } catch {
   /* Nothing a request sends may take the process down. */
   if (!res.headersSent) reply(500, { error: 'failed', message: 'The engines could not answer that request.' });
  }
 });
 server.listen(port, host);
 return server;
}

export async function startEngines(env: NodeJS.ProcessEnv = process.env): Promise<{ server: Server; runtime: Runtime }> {
 const runtime = createRuntime({ env, engines: await discoverEngines() });
 return { server: serveEngines(runtime, env), runtime };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const { server, runtime } = await startEngines();
 server.on('listening', () => console.log(`engines on http://${HOST}:${(server.address() as { port: number }).port} — synthetic data only; ${runtime.bound().length} routes answered by an engine, the rest by the contract mock`));
}
