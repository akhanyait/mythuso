import providers from "../../../../packages/catalog/model-providers.json" with { type: "json" };
import skin from "../../../../packages/catalog/skin-check.json" with { type: "json" };
import {
  photoReading,
  readingFromText,
  readingInstructions,
  type PhotoReading,
} from "../../../../packages/gilbertone/src/skin-photo-reading.ts";
import { modelTierAllowed } from "./activation.ts";
import { credentialEnv, type Env } from "./credentials.ts";
import {
  demonstrationDisclaimer,
  demonstrationOverride,
  overrideOpens,
  type DemonstrationOverride,
} from "./demonstration-override.ts";
import { AZURE_API_VERSION, AZURE_DEFAULT_MODEL, azureCredentials } from "./llm-adapter.ts";

/* The skin check's photo reader, built 2 October 2026 under the founder's demonstration override. This
   service is live in production, so every line here is a production decision: once deployed and
   restarted, a patient on the web who presses "Ask GilbertOne to look" sends one picture of her skin
   through this file to Azure OpenAI.

   THE GATE (photoReadingGate) asks, in this order: the four things packages/catalog/skin-check.json#
   photoReading waits on all in place — signed — or the override in force and listing this gate, and
   never the override alone, so inForce false closes it and the signatures are still what opens it at
   go-live; then the model tier allowed to run in this process (the production acknowledgement); Azure
   OpenAI configured; a deployment the contract names as taking a picture; and the provider's recorded
   region one of the contract's South African regions. Any of the last four missing is one refusal —
   there is no model here that may look — rather than a picture sent to a model that cannot see it, or
   abroad, and an answer faked.

   THE MODEL DESCRIBES AND THE RULES DECIDE. It is given the contract's own brief and the contract's own
   option ids, asked for one JSON object, and its answer is held to that vocabulary by the shared
   validator in packages/gilbertone/src/skin-photo-reading.ts; anything else is dropped whole and answered
   with photo-not-described. Its three refusing outcomes — a face or a private area, not skin, not clear —
   are answered as the route's own refusals, and nothing it saw comes back with them. What reaches the
   caller is ids, never a word of the model's, and the patient confirms each one before the skin check's
   rules read it.

   NOTHING IS KEPT. This module imports no file system, no store and no session, and writes no log line:
   the picture arrives as one string in one request, its decoded bytes are checked for size and for a
   JPEG's first bytes and then zeroed, the string goes to the model in one request body, and every
   reference to it ends with the answer. A failure is logged by server.ts as an error's type name and
   nothing else. The model sees no identifier, because a picture carries none this service could read; a
   face is what it is told to refuse. */

export const PHOTO_ROUTE = "/assistant/v1/photo-reading";

export type PhotoGate =
  | { open: true; demonstration: boolean; disclaimer: string | null; processor: string; region: string; deployment: string }
  | { open: false; refusalId: "photo-reading-not-open" | "photo-reading-has-no-model" };

/* Signed: every condition the reader waits on is in place. None is today. */
export const photoReadingSigned = (waitsOn: readonly { inPlace: boolean }[] = photoReading.waitsOn): boolean =>
  waitsOn.length > 0 && waitsOn.every((condition) => condition.inPlace === true);

export function photoReadingGate(
  options: {
    override?: DemonstrationOverride;
    signed?: boolean;
    /* The credential view (the vault before the environment), for the Azure endpoint, key and deployment. */
    env?: Env;
    /* The process's own environment, for NODE_ENV and the production acknowledgement. */
    processEnv?: Env;
  } = {},
): PhotoGate {
  const override = options.override ?? demonstrationOverride();
  const signed = options.signed ?? photoReadingSigned();
  const env = options.env ?? credentialEnv();
  if (!(signed || overrideOpens("photo-reading", override))) return { open: false, refusalId: "photo-reading-not-open" };
  const noModel = { open: false, refusalId: "photo-reading-has-no-model" } as const;
  if (!modelTierAllowed(options.processEnv ?? process.env)) return noModel;
  if (!azureCredentials(env)) return noModel;
  const deployment = (env.AZURE_OPENAI_MODEL ?? "").trim() || AZURE_DEFAULT_MODEL;
  if (!photoReading.processor.imageDeployments.includes(deployment)) return noModel;
  const card = providers.providers.find((provider) => provider.id === photoReading.processor.provider);
  const region = (photoReading.processor.regions as Record<string, string>)[String(card?.region ?? "")];
  if (!card || !region) return noModel;
  const demonstration = !signed;
  return {
    open: true,
    demonstration,
    disclaimer: demonstration ? demonstrationDisclaimer(override) : null,
    processor: card.name,
    region,
    deployment,
  };
}

/* A request, checked before any model is asked: her agreement, who the rash is on, a JPEG and its size. */
export type CheckedPhoto = { ok: true; imageBase64: string } | { ok: false; refusalId: string };

/* The skin check's own who options; anything else is not an answer to its question. */
const WHO = new Set((skin.questions.find((q) => q.id === "who")?.options ?? []).map((option) => option.id));

export function checkPhotoRequest(body: unknown): CheckedPhoto {
  const asked = (body ?? {}) as { userConsent?: unknown; who?: unknown; imageBase64?: unknown; imageType?: unknown };
  if (asked.userConsent !== true) return { ok: false, refusalId: "photo-reading-needs-consent" };
  const who = typeof asked.who === "string" ? asked.who : "";
  const imageBase64 = typeof asked.imageBase64 === "string" ? asked.imageBase64 : "";
  if (!WHO.has(who) || !imageBase64 || typeof asked.imageType !== "string") return { ok: false, refusalId: "invalid-request" };
  if (who === "young-baby") return { ok: false, refusalId: "photo-of-a-young-baby" };
  if (asked.imageType !== photoReading.image.type) return { ok: false, refusalId: "photo-not-a-jpeg" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return { ok: false, refusalId: "invalid-request" };
  if (Math.floor((imageBase64.length * 3) / 4) > photoReading.image.maxBytes + 2) return { ok: false, refusalId: "payload-too-large" };
  const bytes = Buffer.from(imageBase64, "base64");
  const size = bytes.length;
  const jpeg = size > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  /* The decoded copy existed only to be measured and to show it is a JPEG; it is zeroed rather than left
     for the collector. */
  bytes.fill(0);
  if (size > photoReading.image.maxBytes) return { ok: false, refusalId: "payload-too-large" };
  if (!jpeg) return { ok: false, refusalId: "photo-not-a-jpeg" };
  return { ok: true, imageBase64 };
}

/* The model, as a seam: given the brief, the deployment and the picture, its raw text. The live one is
   Azure OpenAI's chat completions over the platform's fetch; the tests hand in a stub and no network. */
export type PhotoModel = (input: {
  instructions: string;
  deployment: string;
  imageBase64: string;
  signal: AbortSignal;
}) => Promise<string>;

export function azurePhotoModel(fetcher: typeof fetch = fetch, env: () => Env = credentialEnv): PhotoModel {
  return async ({ instructions, deployment, imageBase64, signal }) => {
    const creds = azureCredentials(env());
    if (!creds) throw new Error("azure-not-configured");
    const response = await fetcher(
      `${creds.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${AZURE_API_VERSION}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": creds.key },
        body: JSON.stringify({
          messages: [
            { role: "system", content: instructions },
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this picture as the instructions say." },
                { type: "image_url", image_url: { url: `data:${photoReading.image.type};base64,${imageBase64}`, detail: "auto" } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_completion_tokens: 200,
        }),
        signal,
      },
    );
    if (!response.ok) throw new Error("model-refused");
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("model-answered-nothing");
    return content;
  };
}

export type ReadOutcome = { ok: true; reading: PhotoReading } | { ok: false; refusalId: string };

/* The model's refusing outcomes, each answered as the route's own refusal with nothing it saw. */
const REFUSING: Record<string, string> = {
  "private-or-face": "photo-shows-a-face-or-private-area",
  "not-skin": "photo-is-not-skin",
  unclear: "photo-not-clear",
};

/* One look. A fault or a timeout out of the model throws, and server.ts answers it as internal-error. */
export async function readPhoto(
  imageBase64: string,
  deployment: string,
  model: PhotoModel,
  timeoutMs: number = photoReading.timeoutMs,
): Promise<ReadOutcome> {
  const text = await model({ instructions: readingInstructions(), deployment, imageBase64, signal: AbortSignal.timeout(timeoutMs) });
  const reading = readingFromText(text);
  if (!reading) return { ok: false, refusalId: "photo-not-described" };
  if (reading.outcome !== "described") return { ok: false, refusalId: REFUSING[reading.outcome] ?? "photo-not-described" };
  return { ok: true, reading };
}

/* What server.ts is handed: the gate, and one look through a model. Injectable, so the routes' tests
   prove the shut gate, the refusals and the answer with a stubbed model and no network. */
export type PhotoReaderSeam = {
  gate(): PhotoGate;
  read(imageBase64: string, deployment: string): Promise<ReadOutcome>;
};

export function livePhotoReader(model: PhotoModel = azurePhotoModel()): PhotoReaderSeam {
  return {
    gate: () => photoReadingGate(),
    read: (imageBase64, deployment) => readPhoto(imageBase64, deployment, model),
  };
}
