/* GilbertOne's media studio: drawings, pictures and short videos, made on the GilbertOne host.

   It refuses to start unless MYTHUSO_GILBERTONE_MEDIA=private-preview is set, and it binds only to the
   container's loopback. Caddy, in front of it behind the founder's login, is the only way in, as it
   is for the test chat (deploy/gilbertone-host/open-test-chat.sh). It is not on mythuso.co.za, not in
   the patient app, and not a route in packages/catalog/apis: it is a private preview on a box that
   holds no patient record, and it says so on every page it serves.

   Node's own http and nothing else, the same as apps/api: no framework, no dependency, no build step.
   Node runs these TypeScript files directly. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { contract, isKind } from "./contract.ts";
import { gate } from "./guard.ts";
import { Jobs } from "./jobs.ts";
import { run, type Tools } from "./make.ts";
import { ollama } from "./ollama.ts";

const FLAG = "private-preview";
const STUDIO = new URL("../studio/", import.meta.url);

export function handler(jobs: Jobs, picturesOn: boolean) {
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
        if (body.length > 4096) { reject(new Error("too large")); req.destroy(); }
      });
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://studio");
    const path = url.pathname.replace(/^\/media(?=\/|$)/, "") || "/";
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");

    if (req.method === "GET" && path === "/health") return json(res, 200, { ok: true, contract: contract.version, pictures: picturesOn });

    if (req.method === "GET" && (path === "/" || path === "/index.html" || path === "/studio.js")) {
      const name = path === "/studio.js" ? "studio.js" : "index.html";
      const body = await readFile(new URL(name, STUDIO));
      res.writeHead(200, {
        "content-type": name.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      });
      return res.end(body);
    }

    if (req.method === "GET" && path === "/contract") {
      return json(res, 200, {
        kinds: contract.kinds.map(({ id, label, meaning, maxPromptCharacters, typicalSeconds }) => ({ id, label, meaning, maxPromptCharacters, typicalSeconds })),
        labels: contract.labels,
        keeping: contract.keeping.sentence,
        preview: contract.preview,
        pictures: picturesOn,
        picturesOff: contract.refusals.find((r) => r.id === "pictures-off")?.sentence,
      });
    }

    if (req.method === "POST" && path === "/jobs") {
      let input: { kind?: unknown; words?: unknown };
      try {
        input = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { sentence: "That request could not be read." });
      }
      if (!isKind(input.kind) || typeof input.words !== "string" || !input.words.trim()) return json(res, 400, { sentence: "Say what you would like made, and choose a drawing, picture or video." });
      const words = input.words.trim();
      /* The gate runs here as well as in the job, so a refusal is said at once instead of after a wait. */
      const verdict = gate(input.kind, words);
      if (!verdict.ok) return json(res, 422, { refusal: verdict.refusal, sentence: verdict.sentence });
      if (input.kind === "picture" && !picturesOn) return json(res, 422, { refusal: "pictures-off", sentence: contract.refusals.find((r) => r.id === "pictures-off")?.sentence });
      const job = jobs.add(input.kind, words);
      if (!job) return json(res, 429, { refusal: "busy", sentence: contract.refusals.find((r) => r.id === "busy")?.sentence });
      return json(res, 202, { id: job.id });
    }

    const jobMatch = path.match(/^\/jobs\/([0-9a-f]{32})$/);
    if (req.method === "GET" && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) return json(res, 404, { sentence: "That has already been deleted from the server, or never existed." });
      return json(res, 200, {
        id: job.id,
        kind: job.kind,
        state: job.state,
        step: job.step,
        position: job.state === "queued" ? jobs.position(job) : 0,
        refusal: job.refusal,
        sentence: job.sentence,
        title: job.made?.title,
        file: job.made ? `files/${job.id}` : undefined,
        mime: job.made?.mime,
      });
    }

    const fileMatch = path.match(/^\/files\/([0-9a-f]{32})$/);
    if (req.method === "GET" && fileMatch) {
      const job = jobs.get(fileMatch[1]);
      if (!job?.made) return json(res, 404, { sentence: "That has already been deleted from the server." });
      const body = await readFile(job.made.file).catch(() => null);
      if (!body) return json(res, 404, { sentence: "That has already been deleted from the server." });
      const extension = job.made.mime === "video/mp4" ? "mp4" : job.made.mime === "image/png" ? "png" : "svg";
      res.writeHead(200, {
        "content-type": job.made.mime,
        "content-length": body.length,
        "cache-control": "private, no-store",
        "content-disposition": `inline; filename="gilbertone-${job.kind}.${extension}"`,
        /* A drawing opened on its own, outside the <img> the studio shows it in, still runs nothing. */
        "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      });
      return res.end(body);
    }

    return json(res, 404, { sentence: "Nothing here." });
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.MYTHUSO_GILBERTONE_MEDIA !== FLAG)
    throw new Error(`Refusing to start: MYTHUSO_GILBERTONE_MEDIA must be "${FLAG}". This studio is a private preview on the GilbertOne host and nowhere else.`);
  const host = process.env.MEDIA_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") throw new Error("Refusing to bind beyond loopback: Caddy, behind the login, is the only way in.");
  const port = Number(process.env.MEDIA_PORT ?? 8792);
  const dir = process.env.MEDIA_OUT_DIR ?? "/var/lib/gilbertone-media/out";
  mkdirSync(dir, { recursive: true });
  const bin = process.env.MEDIA_SD_BIN;
  const picturesOn = Boolean(bin) && process.env.MEDIA_PICTURES !== "off";
  const tools: Tools = {
    qwen: ollama(),
    run,
    dir,
    picture: picturesOn && bin ? { bin, modelsDir: process.env.MEDIA_MODELS_DIR ?? "/srv/gilbertone-media/models", threads: Number(process.env.MEDIA_THREADS ?? 10) } : null,
  };
  const jobs = new Jobs(tools);
  setInterval(() => void jobs.sweep(), 60_000).unref();
  const serve = handler(jobs, picturesOn);
  createServer((req, res) => {
    serve(req, res).catch((error: Error) => {
      console.error(`media request failed: ${error.message}`);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ sentence: "Something went wrong on the server." }));
    });
  }).listen(port, host, () => console.log(`GilbertOne media studio on http://${host}:${port}/ (pictures ${picturesOn ? "on" : "off"})`));
}
