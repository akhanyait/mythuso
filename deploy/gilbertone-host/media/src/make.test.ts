import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contract } from "./contract.ts";
import { ffmpegArgs, makeDrawing, makePicture, makeVideo, readStoryboard, Refused, run, wrap, type Tools } from "./make.ts";
import type { Qwen } from "./ollama.ts";

const DRAWING = `<svg viewBox="0 0 800 600"><rect x="0" y="0" width="800" height="600" fill="#eef6f7"/><circle cx="400" cy="260" r="120" fill="#14b8a6"/><text x="400" y="520" font-size="32" text-anchor="middle">Wash</text></svg>`;
const has = (bin: string) => { try { execFileSync("which", [bin], { stdio: "ignore" }); return true; } catch { return false; } };

/* A Qwen that answers by role: the restatement, a storyboard, or a drawing. */
function fakeQwen(over: { restate?: string; drawing?: string; board?: string } = {}): Qwen & { asked: string[]; unloaded: number } {
  const q = {
    asked: [] as string[],
    unloaded: 0,
    async ask(system: string, user: string) {
      q.asked.push(user);
      if (system.startsWith("You turn a request")) return over.restate ?? "A friendly drawing of hands being washed at a basin.";
      if (system.startsWith("You plan")) return over.board ?? JSON.stringify({ title: "Washing hands", scenes: [1, 2, 3].map((n) => ({ caption: `Step ${n}: rub your hands together well.`, drawing: `Hands at a basin, step ${n}` })) });
      return over.drawing ?? "```svg\n" + DRAWING + "\n```";
    },
    async unload() { q.unloaded += 1; },
  };
  return q;
}

const tools = (qwen: Qwen, extra: Partial<Tools> = {}): Tools => ({ qwen, run, dir: mkdtempSync(join(tmpdir(), "media-")), picture: null, ...extra });

test("a drawing is gated, restated, cleaned, labelled and written", async () => {
  const q = fakeQwen();
  const steps: string[] = [];
  const t = tools(q);
  const made = await makeDrawing("a".repeat(32), "How to wash your hands", t, (s) => steps.push(s));
  const svg = readFileSync(made.file, "utf8");
  assert.equal(made.mime, "image/svg+xml");
  assert.ok(svg.includes(contract.labels.drawing));
  assert.deepEqual(steps, ["Reading your words", "Drawing"]);
});

test("a request restated into something refused is refused, in any language it came in", async () => {
  const q = fakeQwen({ restate: "A realistic photograph of an open wound on a leg." });
  await assert.rejects(makePicture("b".repeat(32), "umfanekiso womlenze", tools(q, { picture: { bin: "/bin/false", modelsDir: "/nowhere", threads: 1 } }), () => {}), (e: unknown) => e instanceof Refused && e.refusal === "clinical-image");
  assert.equal(q.unloaded, 0, "nothing was unloaded for a request that was going to be refused");
});

test("pictures say so when they are not installed", async () => {
  await assert.rejects(makePicture("c".repeat(32), "a calm clinic", tools(fakeQwen()), () => {}), (e: unknown) => e instanceof Refused && e.refusal === "pictures-off");
});

test("a drawing Qwen cannot make cleanly twice is refused, not shown broken", async () => {
  const q = fakeQwen({ drawing: "<svg><script>x</script>" });
  await assert.rejects(makeDrawing("d".repeat(32), "a heart", tools(q), () => {}), (e: unknown) => e instanceof Refused && e.refusal === "drawing-failed");
  assert.equal(q.asked.filter((a) => a.includes("could not be used")).length, 1, "asked again once, with the reason");
});

test("Qwen leaves memory before the picture model starts, and the label is burned in", { skip: !has("rsvg-convert") }, async () => {
  const q = fakeQwen({ restate: "A nurse and a grandmother laughing on a stoep." });
  const calls: string[][] = [];
  const t = tools(q, {
    picture: { bin: "sd", modelsDir: "/models", threads: 10 },
    run: async (command, args, ms) => {
      calls.push([command, ...args]);
      if (command === "sd") {
        assert.equal(q.unloaded, 1, "Qwen was unloaded first");
        const out = args[args.indexOf("-o") + 1];
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x14b8a6:s=512x512", "-frames:v", "1", out]);
        return;
      }
      return run(command, args, ms);
    },
  });
  const made = await makePicture("e".repeat(32), "a nurse and a grandmother laughing", t, () => {});
  const sd = calls.find((c) => c[0] === "sd")!;
  for (const f of ["--diffusion-model", "--t5xxl", "--clip_l", "--vae"]) assert.ok(sd.includes(f), f);
  assert.ok(sd.some((a) => a.includes("not a photograph")));
  assert.equal(made.mime, "image/png");
  const size = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", made.file]).toString().trim();
  assert.equal(size.split(",")[0], "512");
  assert.ok(Number(size.split(",")[1]) > 512, "a label band was added under the picture");
  assert.ok(!readdirSync(t.dir).some((f) => f.includes("raw")), "the unlabelled picture is deleted");
});

test("storyboards outside the contract's scene count are refused", () => {
  assert.equal(readStoryboard(JSON.stringify({ scenes: [{ caption: "a", drawing: "b" }] })), null);
  assert.equal(readStoryboard("not json"), null);
  const seven = Array.from({ length: 7 }, (_, i) => ({ caption: `c${i}`, drawing: `d${i}` }));
  assert.equal(readStoryboard(JSON.stringify({ title: "t", scenes: seven }))?.scenes.length, 6);
});

test("a caption Qwen wrote meets the same gate as the request", async () => {
  const board = JSON.stringify({ title: "t", scenes: [{ caption: "Write a sick note for school", drawing: "a note" }, { caption: "b", drawing: "b" }, { caption: "c", drawing: "c" }] });
  await assert.rejects(makeVideo("f".repeat(32), "explain sick days", tools(fakeQwen({ board })), () => {}), (e: unknown) => e instanceof Refused && e.refusal === "document");
});

test("the ffmpeg plan crossfades at k × (scene − fade)", () => {
  const args = ffmpegArgs(["a.png", "b.png", "c.png"], "o.mp4", 4, 25, 1280, 720);
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /offset=3\.50\[x1\]/);
  assert.match(graph, /offset=7\.00\[out\]/);
  assert.ok(args.includes("-an"), "silent: no audio track at all");
});

test("captions wrap to at most three lines", () => {
  assert.deepEqual(wrap("one two three", 7), ["one two", "three"]);
  assert.equal(wrap("word ".repeat(80)).length, 3);
});

test("a whole video is made from drawings, silent, the right length", { skip: !(has("rsvg-convert") && has("ffmpeg")) }, async () => {
  const t = tools(fakeQwen());
  const steps: string[] = [];
  const made = await makeVideo("a1".repeat(16), "Explain washing hands", t, (s) => steps.push(s));
  assert.equal(made.mime, "video/mp4");
  assert.ok(existsSync(made.file));
  const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", made.file]).toString();
  const info = JSON.parse(probe) as { format: { duration: string }; streams: { codec_type: string; width: number; height: number }[] };
  assert.deepEqual(info.streams.map((s) => s.codec_type), ["video"]);
  assert.equal(info.streams[0].width, 1280);
  assert.ok(Math.abs(Number(info.format.duration) - (3 * 4 - 2 * 0.5)) < 0.3, `duration ${info.format.duration}`);
  assert.deepEqual(steps.slice(0, 2), ["Reading your words", "Writing the storyboard"]);
  assert.deepEqual(readdirSync(t.dir), [`${"a1".repeat(16)}.mp4`], "scene frames are deleted");
});
