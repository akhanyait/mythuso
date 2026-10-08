/* How each kind is made. The order inside each one is the point:

     1. The person's words pass the gate (guard.ts) before Qwen sees them.
     2. Qwen restates them as one English description, and the gate runs again over that, so a
        request in isiXhosa meets the same refusals as one in English.
     3. Only then is anything drawn, painted or joined, and every result carries its label.

   Pictures are the one kind that need a second model. The server must never hold two large models at
   once, so before painting, Qwen is asked to leave memory and the service waits until it has; chat
   reloads it on the next question. Videos are drawings with captions, joined by ffmpeg: honest about
   what a CPU can do, and nothing in them can be mistaken for footage of a real person. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { contract, kind, pictureFiles, refusal, type Kind } from "./contract.ts";
import { gate } from "./guard.ts";
import type { Qwen } from "./ollama.ts";
import { cleanSvg, escapeText, labelled, type Cleaned } from "./svg.ts";

export class Refused extends Error {
  refusal: string;
  sentence: string;
  constructor(id: string, sentence?: string) {
    super(id);
    this.refusal = id;
    this.sentence = sentence ?? refusal(id).sentence;
  }
}

export type Run = (command: string, args: string[], timeoutMs: number) => Promise<void>;

export interface Tools {
  qwen: Qwen;
  run: Run;
  dir: string;
  /* Absent when pictures were not installed, or were switched off on purpose. */
  picture: { bin: string; modelsDir: string; threads: number } | null;
}

export interface Made {
  file: string;
  mime: string;
  title: string;
}

export type Progress = (step: string) => void;

export const run: Run = (command, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let tail = "";
    child.stderr.on("data", (chunk: Buffer) => { tail = (tail + chunk.toString()).slice(-2000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} stopped (${code ?? "killed"}): ${tail.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });

function check(k: Kind, text: string): void {
  const verdict = gate(k, text);
  if (!verdict.ok) throw new Refused(verdict.refusal, verdict.sentence);
}

async function restate(k: Kind, words: string, tools: Tools): Promise<string> {
  const english = (
    await tools.qwen.ask(
      "You turn a request for an illustration into one English description of at most 60 words: what is shown, " +
        "who is in it (imagined people only), and the setting. Translate if the request is not in English. " +
        "Add nothing the person did not ask for. Answer with the description only.",
      words,
      { maxTokens: 160 },
    )
  ).trim();
  check(k, english.slice(0, kind(k).maxPromptCharacters));
  return english;
}

async function draw(subject: string, tools: Tools): Promise<Extract<Cleaned, { ok: true }> | null> {
  const system =
    "You are GilbertOne's illustrator for MyThuso, a South African home nursing service. " +
    "You explain health and care with simple, friendly drawings.\n" +
    contract.drawingRules.map((r, i) => `${i + 1}. ${r}`).join("\n");
  let ask = subject;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cleaned = cleanSvg(await tools.qwen.ask(system, ask, { maxTokens: 4000 }));
    if (cleaned.ok) return cleaned;
    ask = `${subject}\n\nYour last drawing could not be used (${cleaned.why}). Draw it again, simpler, as one complete <svg>.`;
  }
  return null;
}

export async function makeDrawing(id: string, words: string, tools: Tools, progress: Progress): Promise<Made> {
  check("drawing", words);
  progress("Reading your words");
  const english = await restate("drawing", words, tools);
  progress("Drawing");
  const cleaned = await draw(words, tools);
  if (!cleaned) throw new Refused("drawing-failed");
  const file = join(tools.dir, `${id}.svg`);
  await writeFile(file, labelled(cleaned, contract.labels.drawing, english));
  return { file, mime: "image/svg+xml", title: english };
}

export async function makePicture(id: string, words: string, tools: Tools, progress: Progress): Promise<Made> {
  check("picture", words);
  if (!tools.picture) throw new Refused("pictures-off");
  progress("Reading your words");
  const english = await restate("picture", words, tools);
  const spec = kind("picture");
  progress("Making room: Qwen steps out while the picture model works");
  await tools.qwen.unload();
  progress("Painting. On this server that takes a few minutes");
  const raw = join(tools.dir, `${id}.raw.png`);
  const { bin, modelsDir, threads } = tools.picture;
  const files = pictureFiles().flatMap((f) => [f.flag, join(modelsDir, f.name)]);
  await tools.run(
    bin,
    [
      ...files,
      "-p", `${english}. Soft painted illustration, warm natural light, gentle colours, not a photograph.`,
      "--cfg-scale", "1.0", "--sampling-method", "euler", "--steps", String(spec.steps ?? 4),
      "-W", String(spec.width ?? 512), "-H", String(spec.height ?? 512),
      "-t", String(threads), "-s", "-1", "-o", raw,
    ],
    20 * 60_000,
  );
  progress("Adding the label");
  const file = join(tools.dir, `${id}.png`);
  await burnLabel(raw, file, spec.width ?? 512, spec.height ?? 512, contract.labels.picture, tools);
  await rm(raw, { force: true });
  return { file, mime: "image/png", title: english };
}

/* The label goes into the pixels, not beside them: a picture saved and forwarded still says it was
   made by a model. The wrapper is this file's own SVG around the model's PNG, rendered by librsvg. */
async function burnLabel(raw: string, out: string, w: number, h: number, label: string, tools: Tools): Promise<void> {
  const band = Math.round(h * 0.07);
  const png = (await readFile(raw)).toString("base64");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + band}" viewBox="0 0 ${w} ${h + band}">` +
    `<image href="data:image/png;base64,${png}" x="0" y="0" width="${w}" height="${h}"/>` +
    `<rect x="0" y="${h}" width="${w}" height="${band}" fill="#083848"/>` +
    `<text x="${w / 2}" y="${h + band * 0.66}" fill="#ffffff" font-family="sans-serif" font-size="${Math.round(band * 0.45)}" text-anchor="middle">${escapeText(label)}</text></svg>`;
  const wrapper = `${raw}.svg`;
  await writeFile(wrapper, svg);
  await tools.run("rsvg-convert", ["-o", out, wrapper], 60_000);
  await rm(wrapper, { force: true });
}

export interface Scene {
  caption: string;
  drawing: string;
}

/* The storyboard is checked as hard as the request: the right number of scenes, short captions, and
   every caption and description through the gate, because Qwen wrote them and a person will read
   them. */
export function readStoryboard(answer: string): { title: string; scenes: Scene[] } | null {
  const spec = kind("video");
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  const board = parsed as { title?: unknown; scenes?: unknown };
  if (!Array.isArray(board.scenes)) return null;
  const scenes = board.scenes
    .filter((s): s is Scene => typeof s?.caption === "string" && typeof s?.drawing === "string")
    .map((s) => ({ caption: s.caption.trim().slice(0, 140), drawing: s.drawing.trim().slice(0, 240) }))
    .filter((s) => s.caption && s.drawing)
    .slice(0, spec.maxScenes ?? 6);
  if (scenes.length < (spec.minScenes ?? 3)) return null;
  return { title: typeof board.title === "string" ? board.title.slice(0, 80) : "", scenes };
}

export function wrap(text: string, width = 46, lines = 3): string[] {
  const out: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last !== undefined && (last + " " + word).length <= width) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out.slice(0, lines);
}

export function sceneFrame(drawing: Extract<Cleaned, { ok: true }> | null, caption: string, label: string, w: number, h: number): string {
  const captionTop = Math.round(h * 0.76);
  const lines = wrap(caption);
  const art = drawing
    ? `<svg x="${w * 0.06}" y="${h * 0.04}" width="${w * 0.88}" height="${captionTop - h * 0.07}" viewBox="${drawing.viewBox.join(" ")}">${drawing.inner}</svg>`
    : `<circle cx="${w / 2}" cy="${captionTop / 2}" r="${h * 0.16}" fill="#14b8a6" opacity="0.25"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#eef6f7"/>` +
    `<rect x="${w * 0.04}" y="${h * 0.03}" width="${w * 0.92}" height="${captionTop - h * 0.05}" rx="24" fill="#ffffff"/>` +
    art +
    `<rect x="0" y="${captionTop}" width="${w}" height="${h - captionTop}" fill="#083848"/>` +
    lines
      .map((line, i) => `<text x="${w / 2}" y="${captionTop + 52 + i * 44}" fill="#ffffff" font-family="sans-serif" font-size="36" font-weight="600" text-anchor="middle">${escapeText(line)}</text>`)
      .join("") +
    `<text x="${w - 24}" y="${h - 14}" fill="#bfe3e6" font-family="sans-serif" font-size="18" text-anchor="end">${escapeText(label)}</text>` +
    `</svg>`
  );
}

/* Scenes are stills with a slow push-in, crossfaded. offset_k = k × (scene − fade) is where each
   crossfade starts, so the film runs scenes × scene − (scenes − 1) × fade seconds. */
export function ffmpegArgs(frames: string[], out: string, seconds: number, fps: number, w: number, h: number): string[] {
  const fade = 0.5;
  const per = Math.round(seconds * fps);
  const inputs = frames.flatMap((f) => ["-i", f]);
  const clips = frames.map(
    (_, i) => `[${i}:v]zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${per}:s=${w}x${h}:fps=${fps},format=yuv420p,setsar=1[v${i}]`,
  );
  const joins: string[] = [];
  let last = "v0";
  for (let k = 1; k < frames.length; k += 1) {
    const next = k === frames.length - 1 ? "out" : `x${k}`;
    joins.push(`[${last}][v${k}]xfade=transition=fade:duration=${fade}:offset=${(k * (seconds - fade)).toFixed(2)}[${next}]`);
    last = next;
  }
  const map = frames.length === 1 ? "[v0]" : "[out]";
  return ["-y", "-loglevel", "error", ...inputs, "-filter_complex", [...clips, ...joins].join(";"), "-map", map, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out];
}

export async function makeVideo(id: string, words: string, tools: Tools, progress: Progress): Promise<Made> {
  check("video", words);
  progress("Reading your words");
  const english = await restate("video", words, tools);
  const spec = kind("video");
  progress("Writing the storyboard");
  const board = readStoryboard(
    await tools.qwen.ask(
      "You plan short, silent explainer videos for MyThuso, a South African home nursing service.\n" +
        contract.storyboardRules.map((r, i) => `${i + 1}. ${r}`).join("\n"),
      words,
      { json: true, maxTokens: 900 },
    ),
  );
  if (!board) throw new Refused("drawing-failed");
  for (const scene of board.scenes) {
    check("video", scene.caption);
    check("video", scene.drawing);
  }
  const w = spec.width ?? 1280;
  const h = spec.height ?? 720;
  const frames: string[] = [];
  try {
    for (const [i, scene] of board.scenes.entries()) {
      progress(`Drawing scene ${i + 1} of ${board.scenes.length}`);
      const drawing = await draw(`${scene.drawing} (for the caption: "${scene.caption}")`, tools);
      const svgPath = join(tools.dir, `${id}.scene${i}.svg`);
      const pngPath = join(tools.dir, `${id}.scene${i}.png`);
      await writeFile(svgPath, sceneFrame(drawing, scene.caption, contract.labels.video, w, h));
      await tools.run("rsvg-convert", ["-w", String(w), "-h", String(h), "-o", pngPath, svgPath], 60_000);
      await rm(svgPath, { force: true });
      frames.push(pngPath);
    }
    progress("Joining the scenes");
    const file = join(tools.dir, `${id}.mp4`);
    await tools.run("ffmpeg", ffmpegArgs(frames, file, spec.secondsPerScene ?? 4, spec.framesPerSecond ?? 25, w, h), 10 * 60_000);
    return { file, mime: "video/mp4", title: board.title || english };
  } finally {
    await Promise.all(frames.map((f) => rm(f, { force: true })));
  }
}

export const makers: Record<Kind, (id: string, words: string, tools: Tools, progress: Progress) => Promise<Made>> = {
  drawing: makeDrawing,
  picture: makePicture,
  video: makeVideo,
};
