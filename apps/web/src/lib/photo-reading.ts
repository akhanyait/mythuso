import { photoReading, validateReading, type Suggested } from "../../../../packages/gilbertone/src/skin-photo-reading.ts";

/* The web's one door to the skin check's photo reader, 2 October 2026, under the founder's demonstration
   override. It arrives with the skin check, behind the panel's own dynamic import, and nothing else in
   the app imports it, so none of it reaches the patient's first view.

   WHAT LEAVES THE PHONE, AND WHAT NEVER DOES. One still, and only when she presses "Ask GilbertOne to
   look": drawn from the picture already on the screen — the photo's own img element, or the clip's video
   element at the moment it is showing — onto a canvas no larger than the contract's maxEdge, encoded as a
   JPEG, sent once to the assistant service, and the canvas emptied. This module is never handed a File, a
   Blob or the clip: it takes an element and draws what is on it, so the clip itself, its other frames and
   its sound cannot reach a request from here. Nothing is stored — no storage of any kind, no cache — and
   the string goes out of scope when the answer arrives.

   WHAT COMES BACK is held to the contract again here: a 200 is two lists of the skin check's own option
   ids, checked by the same validator the service used, and anything else is treated as no answer. A
   refusal carries the service's own sentence, which is the contract's; nothing answering at all is a
   null message, and the screen says the contract's fallback sentence. It never throws. */

declare const __ASSISTANT_API_URL__: string;

const ROUTE_PATH = photoReading.route.replace(/^\w+ (\S+)@\d+$/, "/assistant$1");
const url = () => `${typeof __ASSISTANT_API_URL__ === "string" ? __ASSISTANT_API_URL__ : ""}${ROUTE_PATH}`;
/* The service gives the model the contract's timeout; the screen waits a little longer, so it hears the
   service's own answer rather than cutting it off. */
const WAIT_MS = photoReading.timeoutMs + 5_000;

export type LookOpen = { readonly processor: string; readonly region: string; readonly demonstration: boolean };
export type LookAnswer =
  | { readonly ok: true; readonly suggested: Suggested }
  | { readonly ok: false; readonly refusalId: string | null; readonly message: string | null };

async function ask(init: RequestInit, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop);
  const timer = setTimeout(stop, WAIT_MS);
  try {
    const response = await fetch(url(), { ...init, headers: { "content-type": "application/json" }, signal: controller.signal });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

/* Whether the service says the reader is open here, and who would read the picture where — or null. */
export async function photoReadingOpen(): Promise<LookOpen | null> {
  const { status, body } = await ask({ method: "GET" });
  const record = (body ?? {}) as Record<string, unknown>;
  if (status !== 200 || typeof record.processor !== "string" || typeof record.region !== "string" || typeof record.demonstration !== "boolean") return null;
  return { processor: record.processor, region: record.region, demonstration: record.demonstration };
}

/* The video's current frame, or the middle one when she never moved it, made ready to be drawn. */
async function frameReady(video: HTMLVideoElement): Promise<boolean> {
  /* Paused first, so the frame that goes is the frame she is looking at. */
  if (!video.paused) video.pause();
  const seekTo = video.currentTime > 0 ? video.currentTime : video.duration / 2;
  if (video.readyState >= 2 && video.currentTime > 0) return true;
  if (!Number.isFinite(seekTo)) return false;
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve(ok);
    };
    const onSeeked = () => done(video.readyState >= 2);
    const timer = setTimeout(() => done(video.readyState >= 2), 3_000);
    video.addEventListener("seeked", onSeeked);
    video.currentTime = seekTo;
  });
}

/* One smaller JPEG of what the element shows, as base64, or null when it cannot be made within the
   contract's size. Two qualities are tried, the contract's and a lower one; nothing larger is ever sent. */
export async function stillOf(element: HTMLImageElement | HTMLVideoElement): Promise<string | null> {
  const isVideo = element instanceof HTMLVideoElement;
  if (isVideo && !(await frameReady(element))) return null;
  const width = isVideo ? element.videoWidth : element.naturalWidth;
  const height = isVideo ? element.videoHeight : element.naturalHeight;
  if (!width || !height) return null;
  const scale = Math.min(1, photoReading.image.maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try {
    const drawing = canvas.getContext("2d");
    if (!drawing) return null;
    drawing.drawImage(element, 0, 0, canvas.width, canvas.height);
    for (const quality of [photoReading.image.quality, photoReading.image.quality / 2]) {
      const encoded = canvas.toDataURL(photoReading.image.type, quality).split(",")[1] ?? "";
      if (encoded && Math.floor((encoded.length * 3) / 4) <= photoReading.image.maxBytes) return encoded;
    }
    return null;
  } finally {
    /* The canvas's pixels are let go at once rather than left for the collector. */
    canvas.width = 0;
    canvas.height = 0;
  }
}

/* One look: the still, her agreement (she pressed the button) and who the rash is on, nothing else. */
export async function askToLook(element: HTMLImageElement | HTMLVideoElement, who: string, signal: AbortSignal): Promise<LookAnswer | "too-large"> {
  const imageBase64 = await stillOf(element);
  if (!imageBase64) return "too-large";
  const { status, body } = await ask(
    { method: "POST", body: JSON.stringify({ userConsent: true, who, imageBase64, imageType: photoReading.image.type }) },
    signal,
  );
  const record = (body ?? {}) as Record<string, unknown>;
  if (status === 200) {
    const reading = validateReading({ outcome: "described", looks: record.looks, where: record.where });
    return reading ? { ok: true, suggested: { looks: reading.looks, where: reading.where } } : { ok: false, refusalId: null, message: null };
  }
  return {
    ok: false,
    refusalId: typeof record.refusalId === "string" ? record.refusalId : null,
    message: status > 0 && typeof record.message === "string" ? record.message : null,
  };
}
