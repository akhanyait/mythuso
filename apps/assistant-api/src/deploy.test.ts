import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* The credential script's own tests, added with it on 21 September 2026. deploy/ops/
   configure-assistant-env.sh is the only sanctioned way the Azure key reaches the server, which
   makes it the one piece of shell in this repository where a wrong behaviour is a disclosed key
   rather than a bug — so its behaviour is tested here, not trusted. It runs in the test mode it
   carries for exactly this purpose: MYTHUSO_ASSISTANT_ENV_TEST=1 plus ASSISTANT_ENV_FILE confine
   every write to a sandbox path and relax the root requirement to match, and /etc is never
   touched by any of these tests.

   The fixtures are synthetic by construction and stay on the safe side of scripts/
   check-boundaries.mjs, which holds this repository to carrying no concrete Azure URL and no
   credential-shaped value: the endpoint is under the .invalid TLD reserved for exactly that, and
   the key is a fixed nonsense token. The expected file content is assembled by concatenation for
   the same reason — the variable's name and its value are never typed next to each other. */

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../deploy/ops/configure-assistant-env.sh",
);
const ENDPOINT = "https://assistant-fixture.invalid";
const KEY = "fixture-key-0123456789abcdef";

/* The script, run in its test mode with `input` on stdin — the three prompts answered the way a
   person at a terminal would answer them, in order. */
const run = (input: string, envFile: string) =>
  spawnSync("bash", [SCRIPT], {
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      MYTHUSO_ASSISTANT_ENV_TEST: "1",
      ASSISTANT_ENV_FILE: envFile,
    },
  });

const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), "mythuso-assistant-env-"));
  return {
    dir,
    file: join(dir, "assistant.env"),
    done: () => rmSync(dir, { recursive: true }),
  };
};

test("writes the three Azure lines at mode 0600, defaulting the deployment name", () => {
  const box = sandbox();
  try {
    const result = run(`${ENDPOINT}\n${KEY}\n\n`, box.file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      statSync(box.file).mode & 0o777,
      0o600,
      "the file must be readable by root only",
    );
    assert.deepEqual(
      readFileSync(box.file, "utf8").split("\n").filter(Boolean),
      [
        "AZURE_OPENAI_ENDPOINT=" + ENDPOINT,
        "AZURE_OPENAI_KEY=" + KEY,
        "AZURE_OPENAI_MODEL=gpt-4.1-mini",
      ],
      "exactly the three Azure variables, nothing else",
    );
  } finally {
    box.done();
  }
});

test("reports the key only as its fingerprint — the value never appears in the output", () => {
  const box = sandbox();
  try {
    const result = run(`${ENDPOINT}\n${KEY}\ngpt-4o\n`, box.file);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes(KEY), "the key must never be echoed");
    assert.ok(
      !result.stderr.includes(KEY),
      "the key must never reach the error stream either",
    );
    const fingerprint = createHash("sha256")
      .update(KEY)
      .digest("hex")
      .slice(0, 16);
    assert.ok(
      result.stdout.includes("Key fingerprint: " + fingerprint),
      "the fingerprint is the SHA-256 the register records, computed the same way on both sides",
    );
  } finally {
    box.done();
  }
});

test("rejects an endpoint that is not https, and writes nothing at all", () => {
  const box = sandbox();
  try {
    const result = run(
      `http://assistant-fixture.invalid\n${KEY}\n\n`,
      box.file,
    );
    assert.equal(
      result.status,
      1,
      "an http endpoint is a key sent in the clear — a refusal",
    );
    assert.ok(
      !existsSync(box.file),
      "a rejected input must leave no file behind",
    );
    assert.ok(!result.stdout.includes(KEY) && !result.stderr.includes(KEY));
  } finally {
    box.done();
  }
});

test("rejects an endpoint with a path, a query or a port bolted on", () => {
  const box = sandbox();
  try {
    for (const bad of [
      "https://assistant-fixture.invalid/deployments",
      "https://assistant-fixture.invalid?api-version=2025-01-01-preview",
      "https://assistant-fixture.invalid:443",
    ]) {
      const result = run(`${bad}\n${KEY}\n\n`, box.file);
      assert.equal(
        result.status,
        1,
        `${bad} must be refused — the file is a host name, not a URL`,
      );
      assert.ok(
        !existsSync(box.file),
        "no run of this test may leave a file behind",
      );
    }
  } finally {
    box.done();
  }
});

test("rejects an empty key", () => {
  const box = sandbox();
  try {
    const result = run(`${ENDPOINT}\n\n\n`, box.file);
    assert.equal(result.status, 1, "an empty key is no credentials at all");
    assert.ok(!existsSync(box.file));
  } finally {
    box.done();
  }
});

test("a failed run leaves a previous file exactly as it was", () => {
  const box = sandbox();
  try {
    writeFileSync(box.file, "QDRANT_URL=https://vector.invalid\n", {
      mode: 0o600,
    });
    const before = readFileSync(box.file, "utf8");
    const result = run(
      `http://assistant-fixture.invalid\n${KEY}\n\n`,
      box.file,
    );
    assert.equal(result.status, 1);
    assert.equal(
      readFileSync(box.file, "utf8"),
      before,
      "the interruption contract: untouched",
    );
  } finally {
    box.done();
  }
});

test("keeps the variables an operator put in the file by hand, and replaces only the Azure lines", () => {
  const box = sandbox();
  try {
    writeFileSync(
      box.file,
      "QDRANT_URL=https://vector.invalid\nAZURE_OPENAI_MODEL=an-old-model-name\n",
      { mode: 0o600 },
    );
    const result = run(`${ENDPOINT}\n${KEY}\ngpt-4o\n`, box.file);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      readFileSync(box.file, "utf8").split("\n").filter(Boolean),
      [
        "QDRANT_URL=https://vector.invalid",
        "AZURE_OPENAI_ENDPOINT=" + ENDPOINT,
        "AZURE_OPENAI_KEY=" + KEY,
        "AZURE_OPENAI_MODEL=gpt-4o",
      ],
      "the hand-written line survives and the Azure lines are the new ones",
    );
  } finally {
    box.done();
  }
});

test(
  "refuses to run as a normal user when its test mode is not set",
  {
    /* Skipped when the tests themselves run as root, because then there is no normal user to be:
     the refusal under test is the root gate, and a root run would sail through it into the real
     /etc/mythuso — which is the one thing these tests must never touch. */
    skip: typeof process.getuid === "function" && process.getuid() === 0,
  },
  () => {
    const env = { ...process.env };
    delete env.MYTHUSO_ASSISTANT_ENV_TEST;
    delete env.ASSISTANT_ENV_FILE;
    const result = spawnSync("bash", [SCRIPT], {
      input: `${ENDPOINT}\n${KEY}\n\n`,
      encoding: "utf8",
      env,
    });
    assert.equal(
      result.status,
      1,
      "the production gate is root, and this test is not root",
    );
    assert.match(
      result.stderr,
      /root/,
      "the refusal says why, and names the sudo form",
    );
  },
);

/* ── The deploy's wiring and the edge ────────────────────────────────────────────────────────────

   Added with the runtime's delivery on 21 September 2026. The credential script above is where a
   key may enter the box; these hold where the artifact may come from and what stands in front of
   the port — the facts a person rebuilding the deploy would check first. The same facts are held
   over the whole repository by scripts/check-boundaries.mjs; they are repeated here in miniature
   because a test that fails beside the change teaches faster than one that fails in CI. */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readRepo = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

test("the root check runs the boundary script exactly once", () => {
  const scripts = JSON.parse(readRepo("package.json")).scripts as Record<
    string,
    string
  >;
  assert.equal(
    scripts.check.split("node scripts/check-boundaries.mjs").length - 1,
    1,
    "npm run check must invoke node scripts/check-boundaries.mjs exactly once — the documented local gate, and the web CI job that runs it",
  );
});

test("the runtime bundles to one deterministic artifact, carrying no credential value", () => {
  const build = () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/build-assistant.mjs"],
      {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(
      resolve(ROOT, "apps/assistant-api/dist/server.mjs"),
      "utf8",
    );
  };
  const first = build();
  assert.equal(
    build(),
    first,
    "the same tree must build the same bytes — the deploy publishes what it built and the sha256 is what travels",
  );
  assert.doesNotMatch(
    first,
    /(?:AZURE_OPENAI_KEY|AZURE_OPENAI_API_KEY|OLLAMA_URL)["']?\s*[:=]\s*["'][A-Za-z0-9][A-Za-z0-9._:/-]{15,}["']/,
    "a credential value in the artifact is the one fault the build itself refuses to produce — this is the second pair of eyes",
  );
  assert.ok(
    first.includes("MYTHUSO_ASSISTANT_PRODUCTION"),
    "the acknowledgement gate travels in the artifact: a bundle built without it would let a key alone start the public model",
  );
});

test("nginx carries the assistant proxy, the fence on it, and the microphone policy twice", () => {
  const nginx = readRepo("deploy/nginx/mythuso.conf");
  assert.match(
    nginx,
    /location \/assistant\/ \{/,
    "the bridge is same-origin: the location is the bridge",
  );
  assert.match(
    nginx,
    /proxy_pass http:\/\/127\.0\.0\.1:8791;/,
    "to the loopback port the unit binds",
  );
  assert.match(
    nginx,
    /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/,
  );
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  assert.match(
    nginx,
    /client_max_body_size 768k;/,
    "the service’s own ceiling, mirrored at the edge",
  );
  assert.match(
    nginx,
    /limit_req_zone \$binary_remote_addr zone=assistant_limit:10m rate=60r\/m;/,
  );
  assert.match(nginx, /limit_req zone=assistant_limit burst=10 nodelay;/);
  assert.equal(
    nginx.split("limit_req zone=assistant_limit").length - 1,
    1,
    "the limit is applied in exactly one place — co-tenant sites share the box, not the fence",
  );
  assert.match(nginx, /limit_req_status 429;/);
  assert.match(nginx, /proxy_connect_timeout 5s;/);
  assert.match(nginx, /proxy_read_timeout 20s;/);
  assert.match(nginx, /proxy_send_timeout 10s;/);
  assert.match(nginx, /add_header X-Robots-Tag "noindex, nofollow" always;/);
  assert.equal(
    nginx.split(
      'add_header Strict-Transport-Security "max-age=300; includeSubDomains" always;',
    ).length - 1,
    2,
    "HSTS stays at 300 seconds on both declarations — deliberately short until the certificate proof is in",
  );
  const policy =
    'add_header Permissions-Policy "camera=(), microphone=(self), geolocation=(), interest-cohort=()" always;';
  assert.equal(
    nginx.split(policy).length - 1,
    2,
    "the server level and /assistant/ both — a location declaring add_header inherits none, so the second copy is the one patients receive",
  );
  assert.ok(
    !nginx.includes("microphone=()"),
    "no declaration in this file may block the site’s own microphone — tap-to-talk is a shipped control",
  );
});

test("the identity service still refuses the microphone, and its block stays dark", () => {
  const identity = readRepo("apps/api/src/server.ts");
  assert.ok(
    identity.includes(
      "'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()'",
    ),
    "the identity API’s transport headers still deny the microphone outright",
  );
  const nginx = readRepo("deploy/nginx/mythuso.conf");
  assert.match(
    nginx,
    /# location \/api\/ \{/,
    "the identity block stays commented — identity arrives with TLS and an SMS provider, not before",
  );
});

/* ── The remote digest, and what a server without GNU coreutils still does ──────────────────────

   Added with the CodeReview fixes of 21 September 2026. The deploy computes the artifact's sha256
   on both sides of the wire and publishes only when the two agree; the local side has always
   fallen back from sha256sum to shasum -a 256, and the remote side now does the same. This is
   where that fallback is exercised rather than read: a fake ssh runs the deploy's own remote
   command under a PATH that is only what the "server" was given, and a fake hasher logs the name
   it was called by. The last case is the safe failure — a server with neither tool must leave the
   deploy able to reach its cleanup branch (`|| remote_digest=""` under set -e), never abort it
   with the half-transferred server.mjs.next still beside the running runtime. */

const deploySource = readRepo("deploy/deploy.sh");

const readRemoteDigest = (): string => {
  const line = deploySource.match(/^\s*remote_digest=\$\(.*$/m)?.[0];
  assert.ok(
    line,
    "deploy.sh must keep a remote_digest assignment this test can read",
  );
  assert.ok(
    line.includes('|| remote_digest=""'),
    "the assignment must keep its guard: a failed digest is routed into the mismatch branch, not into set -e",
  );
  return line;
};

const ARTIFACT_FIXTURE = 'export const marker = "assistant-runtime-fixture";\n';
const ARTIFACT_DIGEST = createHash("sha256")
  .update(ARTIFACT_FIXTURE)
  .digest("hex");

/* Runs the deploy's own remote-digest line — the assignment with its guard, under the deploy's
   own shell flags — against a sandbox "server" whose PATH holds exactly `tools`. The fixture
   file's real sha256 is computed here in node, so the digest a fake prints either matches it or
   does not. */
const runRemoteDigest = (tools: readonly ("sha256sum" | "shasum")[]) => {
  const line = readRemoteDigest();
  const box = mkdtempSync(join(tmpdir(), "mythuso-deploy-digest-"));
  const bin = join(box, "bin");
  const remote = join(box, "remote");
  mkdirSync(bin);
  mkdirSync(remote);
  writeFileSync(join(box, "server.mjs.next"), ARTIFACT_FIXTURE);
  const log = join(box, "tools.log");
  /* The sandbox's only ssh: it runs the deploy's remote command under a PATH built from the
     "remote" directory alone, so the server sees exactly the tools the case gave it. */
  writeFileSync(
    join(bin, "ssh"),
    ["#!/bin/sh", 'PATH="$FAKE_REMOTE_PATH" /bin/sh -c "$2"', ""].join("\n"),
    { mode: 0o755 },
  );
  for (const tool of tools) {
    const [name, argument] =
      tool === "sha256sum" ? ["sha256sum", "$1"] : ["shasum", "$3"];
    writeFileSync(
      join(remote, name),
      [
        "#!/bin/sh",
        `echo ${name} >> "$FAKE_TOOL_LOG"`,
        `printf '%s  %s\\n' '${ARTIFACT_DIGEST}' "${argument}"`,
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
  }
  const wrapper = join(box, "run.sh");
  writeFileSync(
    wrapper,
    [
      /* The deploy's own shell flags: the guard under test only has a job under them. */
      "set -euo pipefail",
      line,
      "printf 'REMOTE=[%s]\\n' \"$remote_digest\"",
      "",
    ].join("\n"),
  );
  const result = spawnSync("/bin/bash", [wrapper], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      FAKE_REMOTE_PATH: remote,
      FAKE_TOOL_LOG: log,
      ASSISTANT: box,
      TARGET: "fixture-server.invalid",
    },
  });
  const used = existsSync(log) ? readFileSync(log, "utf8").trim() : "";
  const remoteValue = /^REMOTE=\[(.*)\]$/m.exec(result.stdout ?? "")?.[1];
  const stderr = result.stderr ?? "";
  rmSync(box, { recursive: true });
  return { status: result.status, remoteValue, used, stderr };
};

test("the remote digest is portable: sha256sum where the server has it, shasum -a 256 where it does not", () => {
  const gnu = runRemoteDigest(["sha256sum"]);
  assert.equal(gnu.status, 0, gnu.stderr);
  assert.equal(
    gnu.remoteValue,
    ARTIFACT_DIGEST,
    "the digest the server produced reaches the comparison as the local side reads its own",
  );
  assert.equal(
    gnu.used,
    "sha256sum",
    "GNU coreutils is the tool asked first where it exists",
  );

  const bsd = runRemoteDigest(["shasum"]);
  assert.equal(bsd.status, 0, bsd.stderr);
  assert.equal(
    bsd.remoteValue,
    ARTIFACT_DIGEST,
    "the BSD tool answers the same digest",
  );
  assert.equal(
    bsd.used,
    "shasum",
    "shasum -a 256 is the fallback that actually ran",
  );

  const both = runRemoteDigest(["sha256sum", "shasum"]);
  assert.equal(
    both.used,
    "sha256sum",
    "with both present the GNU name stays the one used",
  );
});

test("a server with neither tool fails safely into the mismatch branch’s cleanup", () => {
  const none = runRemoteDigest([]);
  assert.equal(
    none.status,
    0,
    'under set -e the `|| remote_digest=""` guard is what keeps this line from aborting the deploy',
  );
  assert.equal(
    none.remoteValue,
    "",
    "an empty digest can never equal a real local one",
  );
  assert.equal(
    none.used,
    "",
    "no tool ran — the failure is exactly that the server has neither",
  );
  /* And the empty digest lands where the deploy already handles disagreement: remove the
     half-transferred file, say so with "none" in place of a digest, exit 1. */
  const mismatch = deploySource.indexOf(
    'if [ "$local_digest" != "$remote_digest" ]; then',
  );
  const cleanup = deploySource.indexOf("rm -f $ASSISTANT/server.mjs.next");
  const exit = deploySource.indexOf("exit 1", cleanup);
  assert.ok(
    mismatch >= 0 && cleanup > mismatch && exit > cleanup,
    "the mismatch branch still removes server.mjs.next and exits 1 before anything is moved into place",
  );
  assert.ok(
    deploySource.includes("${remote_digest:-none}"),
    'the message shows "none" rather than an empty digest',
  );
});
