import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Jobs } from "./jobs.ts";
import { handler } from "./server.ts";
import { Refused, type Tools, makers as realMakers } from "./make.ts";

const dir = mkdtempSync(join(tmpdir(), "media-srv-"));
const tools: Tools = { qwen: { ask: async () => "", unload: async () => {} }, run: async () => {}, dir, picture: null };

/* Makers that answer at once, so the HTTP surface is what is tested. */
let release: () => void = () => {};
const makers: typeof realMakers = {
  drawing: async (id) => {
    await new Promise<void>((r) => { release = r; });
    const file = join(dir, `${id}.svg`);
    await writeFile(file, `<svg xmlns="http://www.w3.org/2000/svg"/>`);
    return { file, mime: "image/svg+xml", title: "t" };
  },
  picture: async () => { throw new Refused("pictures-off"); },
  video: async () => { throw new Error("ffmpeg exploded at /secret/path"); },
};

async function serve(jobs: Jobs): Promise<{ base: string; server: Server }> {
  const h = handler(jobs, false);
  const server = createServer((req, res) => void h(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

type Any = any;
const body = async (r: Response): Promise<Any> => r.json();
const post = (base: string, body: unknown) => fetch(`${base}/media/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("a refusal is said at once, with the contract's sentence", async () => {
  const { base, server } = await serve(new Jobs(tools, makers));
  const r = await post(base, { kind: "drawing", words: "a sick note for my boss" });
  assert.equal(r.status, 422);
  assert.equal((await body(r)).refusal, "document");
  const p = await post(base, { kind: "picture", words: "a calm clinic" });
  assert.equal((await body(p)).refusal, "pictures-off");
  server.close();
});

test("a job is queued, made, served with a locked-down policy, and swept after the hour", async () => {
  let now = 1_000_000;
  const jobs = new Jobs(tools, makers, () => now);
  const { base, server } = await serve(jobs);
  const r = await post(base, { kind: "drawing", words: "hands being washed" });
  assert.equal(r.status, 202);
  const { id } = await body(r);
  assert.equal((await body(await fetch(`${base}/media/jobs/${id}`))).state, "working");
  release();
  await new Promise((r) => setTimeout(r, 20));
  const done = await body(await fetch(`${base}/media/jobs/${id}`));
  assert.equal(done.state, "done");
  assert.equal(done.file, `files/${id}`);
  const file = await fetch(`${base}/media/files/${id}`);
  assert.equal(file.headers.get("content-type"), "image/svg+xml");
  assert.match(file.headers.get("content-security-policy") ?? "", /default-src 'none'.*sandbox/);
  now += 61 * 60_000;
  assert.equal(await jobs.sweep(), 1);
  assert.equal(existsSync(join(dir, `${id}.svg`)), false);
  assert.equal((await fetch(`${base}/media/files/${id}`)).status, 404);
  server.close();
});

test("three waiting is the most; the fourth is told the studio is busy", async () => {
  const { base, server } = await serve(new Jobs(tools, makers));
  const statuses: number[] = [];
  for (let i = 0; i < 5; i += 1) statuses.push((await post(base, { kind: "drawing", words: `a tree ${i}` })).status);
  assert.deepEqual(statuses, [202, 202, 202, 202, 429], "one working, three waiting, then busy");
  for (let i = 0; i < 4; i += 1) { release(); await new Promise((r) => setTimeout(r, 10)); }
  server.close();
});

test("a failure tells the person plainly and leaks nothing from the server", async () => {
  const { base, server } = await serve(new Jobs(tools, makers));
  const { id } = await body(await post(base, { kind: "video", words: "a short film about water" }));
  await new Promise((r) => setTimeout(r, 20));
  const job = await body(await fetch(`${base}/media/jobs/${id}`));
  assert.equal(job.state, "failed");
  assert.ok(!JSON.stringify(job).includes("secret"));
  server.close();
});

test("the studio page and its script are served; nothing else is", async () => {
  const { base, server } = await serve(new Jobs(tools, makers));
  const page = await fetch(`${base}/media/`);
  assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.match(await page.text(), /GilbertOne Studio/);
  assert.equal((await fetch(`${base}/media/studio.js`)).status, 200);
  assert.equal((await fetch(`${base}/media/../../etc/passwd`)).status, 404);
  assert.equal((await fetch(`${base}/media/files/not-a-job`)).status, 404);
  server.close();
});
