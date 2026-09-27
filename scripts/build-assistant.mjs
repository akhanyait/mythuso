import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/* Bundles apps/assistant-api into one plain-JavaScript artifact, apps/assistant-api/dist/server.mjs,
   for deployment to /opt/mythuso/assistant.

   WHY A BUNDLE RATHER THAN SOURCE. The service depends on @langchain/core and @langchain/openai, and
   those arrive as a tree of packages with platform-specific install steps — node_modules built on
   this machine (macOS) is not a node_modules a Linux server can trust, and `npm install` on the
   server would put the production runtime at the mercy of the registry's availability and whatever
   the lockfile resolves that day. One esbuild pass here — esbuild is already in the tree as Vite's
   own bundler — turns the whole service, the LangChain tree and every catalog JSON it imports
   (assistant.json, sos.json, the nine knowledge files) into a single deterministic JavaScript file
   that needs nothing but a Node binary to run. Nothing is minified: a health product's server
   artifact stays readable by a person auditing what the box actually runs.

   THE BUNDLE CARRIES NO SECRET AND MUST NEVER GAIN ONE. The provider configuration —
   AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, OLLAMA_URL and their neighbours — is read from the
   environment at runtime, from /etc/mythuso/assistant.env, which is written by
   deploy/ops/configure-assistant-env.sh and never leaves the box. The scan at the bottom of this
   script is the first of three that hold that line: this one at build time, deploy.sh's over what
   is about to be published, and scripts/check-boundaries.mjs's over the repository itself. */

const ROOT = resolve(dirname(new URL(import.meta.url).pathname));
const ENTRY = resolve(ROOT, "../apps/assistant-api/src/server.ts");
const OUTDIR = resolve(ROOT, "../apps/assistant-api/dist");
const OUTFILE = resolve(OUTDIR, "server.mjs");

/* Node's own floor for this repository, read from package.json rather than restated — a minimum
   version typed into two files is a minimum version the two drift on. The bundle is transpiled to
   run on this floor and no lower, which is what deploy.sh then asks the server to prove. */
const nodeFloor = (readFileSync(resolve(ROOT, "../package.json"), "utf8").match(
  /"node":\s*">=(\d+\.\d+\.\d+)"/,
) ?? [])[1];
if (!nodeFloor)
  throw new Error(
    "scripts/build-assistant.mjs can no longer read the engines floor out of package.json, so it cannot name the Node the bundle is built for.",
  );

mkdirSync(OUTDIR, { recursive: true });
const result = await build({
  entryPoints: [ENTRY],
  outfile: OUTFILE,
  bundle: true,
  platform: "node",
  format: "esm",
  target: `node${nodeFloor.split(".").slice(0, 2).join(".")}`,
  /* Some of the LangChain tree is CommonJS that calls require() for a node built-in at run time
     rather than at the top of the file, and an ESM bundle has no require. Without this banner the
     first such call — node-fetch asking for "stream" — is a startup crash, found by running the
     bundle rather than by reading it. createRequire gives the bundle the same require its unbundled
     source had, built-ins included; no package is left un-bundled by it. */
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  /* The licences of the bundled packages belong in the artifact: docs/OPEN-SOURCE.md is the honest
     list, and a bundle that silently dropped the notices would make it wrong. */
  legalComments: "eof",
  logLevel: "warning",
  metafile: true,
});

/* One file is the point — a second chunk or an asset would be a thing a deploy could publish
   without, and the unit's ExecStart names exactly one. esbuild's metafile names outputs relative
   to the working directory, so both are resolved before they are compared. */
const outputs = Object.keys(result.metafile.outputs).map((o) => resolve(o));
if (outputs.length !== 1 || outputs[0] !== OUTFILE)
  throw new Error(
    `The assistant bundle produced ${outputs.length} outputs (${outputs.map((o) => o.split("/").pop()).join(", ")}); it must produce exactly one file, server.mjs, because that one file is all the deploy publishes.`,
  );

const bundle = readFileSync(OUTFILE, "utf8");

/* A literal key in the bundle is the one fault this build must refuse to produce. The service reads
   its credentials from the environment, so the variable NAMES belong in the bundle and the VALUES
   never can — this catches the accident where one is baked in by a change nobody reviewed.

   The variable list and the 20-character floor are deploy/deploy.sh's own second scan, on the
   published artifact, repeated rather than shared — a bash grep -E and a JS RegExp cannot be one
   function — but a length or a name that drifted between the two would mean a leaked value short
   or under a name only one of the two scans reads is caught here and waved through there, or the
   other way around. Keep them equal on a change to either. */
const secretShape = /(?:AZURE_OPENAI_ENDPOINT|AZURE_OPENAI_KEY|AZURE_OPENAI_API_KEY|OLLAMA_URL|ELEVENLABS_API_KEY)["']?\s*[:=]\s*["'][A-Za-z0-9][A-Za-z0-9._:/-]{20,}["']/;
if (secretShape.test(bundle))
  throw new Error(
    "The assistant bundle carries what looks like a provider credential's value. Nothing in this artifact may hold a secret — the service reads /etc/mythuso/assistant.env at runtime. Find what put it there before building again.",
  );

const bytes = Buffer.byteLength(bundle);
const fingerprint = createHash("sha256").update(bundle).digest("hex").slice(0, 16);
console.log(
  `Assistant runtime bundled: apps/assistant-api/dist/server.mjs — ${(bytes / 1024).toFixed(0)} kB, sha256 ${fingerprint}…, built for Node >= ${nodeFloor}.`,
);
