import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { base32Decode } from "../../api/src/totp.ts";
import {
  founderAccessEnabled,
  founderCredential,
  parsePasswordHash,
  verifyPassword,
} from "./lib/founder-access.ts";
import { isMasterKeyShape, masterKeyOf } from "./lib/provider-vault.ts";
import contract from "../../../packages/catalog/founder-access.json" with { type: "json" };

/* deploy/ops/configure-founder-access.sh, tested rather than trusted — the same way deploy.test.ts
   holds configure-assistant-env.sh. It runs in the test mode it carries for exactly this purpose
   (MYTHUSO_FOUNDER_ENV_TEST=1 plus FOUNDER_ENV_FILE), so every write lands in a sandbox and /etc is
   never touched. What is held: the file is 0600 and holds a hash, never the password; the hash is one
   the service verifies; the secret printed once is the secret stored, and the service reads it; the
   password never reaches either output stream; a mismatch or a short password writes nothing; every
   line the script does not own is kept; and the script never writes the enable line. */

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../deploy/ops/configure-founder-access.sh",
);
const PASSWORD = "a synthetic founder passphrase";
const HASH = contract.credential.passwordHashVariable;
const SECRET = contract.credential.totpSecretVariable;
const ENABLE = contract.enable.variable;
const VAULT_KEY = contract.vault.keyVariable;

const run = (input: string, envFile: string) =>
  spawnSync("bash", [SCRIPT], {
    input,
    encoding: "utf8",
    env: { ...process.env, MYTHUSO_FOUNDER_ENV_TEST: "1", FOUNDER_ENV_FILE: envFile },
  });
const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), "mythuso-founder-env-"));
  return { file: join(dir, "founder.env"), done: () => rmSync(dir, { recursive: true }) };
};
const parse = (text: string) =>
  Object.fromEntries(
    text
      .split("\n")
      .filter(Boolean)
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );

test("writes the hash and the secret at 0600, and the service verifies the one and reads the other", async () => {
  const box = sandbox();
  try {
    const result = run(`${PASSWORD}\n${PASSWORD}\n`, box.file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(box.file).mode & 0o777, 0o600, "readable by root only");
    const env = parse(readFileSync(box.file, "utf8"));
    assert.deepEqual(Object.keys(env).sort(), [HASH, SECRET, VAULT_KEY].sort(), "the two credential lines, the vault key, and nothing else");
    assert.ok(isMasterKeyShape(env[VAULT_KEY]!), "the vault key is thirty-two bytes, base64, as the service reads it");
    assert.ok(masterKeyOf(env), "and the vault opens on it");
    for (const stream of [result.stdout, result.stderr])
      assert.ok(!stream.includes(env[VAULT_KEY]!), "the vault key is never printed");
    const parsed = parsePasswordHash(env[HASH]);
    assert.ok(parsed, "the hash is one the service accepts as a credential");
    assert.equal(parsed.log2N, contract.credential.scrypt.log2N);
    assert.equal(parsed.salt.length, contract.credential.scrypt.saltBytes);
    assert.equal(parsed.key.length, contract.credential.scrypt.keyLength);
    assert.equal(await verifyPassword(PASSWORD, parsed), true, "the password verifies against it");
    assert.equal(await verifyPassword("another passphrase entirely", parsed), false);
    assert.equal(base32Decode(env[SECRET]!).length, contract.credential.totpSecretBytes);
    assert.ok(founderCredential(env), "the service reads the credential");
    assert.equal(founderAccessEnabled(env), false, "and founder access is still dark: no enable line was written");

    const uri = result.stdout.match(/otpauth:\/\/totp\/[^\s]+/)?.[0];
    assert.ok(uri, "the otpauth URI is printed for the founder's app");
    const printed = new URL(uri);
    assert.equal(printed.searchParams.get("secret"), env[SECRET], "the secret shown is the secret stored");
    assert.equal(printed.searchParams.get("digits"), String(contract.totp.codeDigits));
    assert.equal(printed.searchParams.get("period"), String(contract.totp.stepSeconds));
    assert.equal(result.stdout.split(env[SECRET]!).length - 1, 1, "shown exactly once");
    for (const stream of [result.stdout, result.stderr]) {
      assert.ok(!stream.includes(PASSWORD), "the password never reaches the output");
      assert.ok(!stream.includes(env[HASH]!), "nor does the hash");
    }
    assert.ok(!readFileSync(box.file, "utf8").includes(PASSWORD), "the password is never on disk");
  } finally {
    box.done();
  }
});

test("two passwords that differ, or one shorter than the contract's minimum, write nothing", () => {
  const box = sandbox();
  try {
    const mismatch = run(`${PASSWORD}\n${PASSWORD}x\n`, box.file);
    assert.equal(mismatch.status, 1);
    assert.ok(!existsSync(box.file));
    const short = "x".repeat(contract.credential.passwordMinimumLength - 1);
    const tooShort = run(`${short}\n${short}\n`, box.file);
    assert.equal(tooShort.status, 1);
    assert.ok(!existsSync(box.file));
    const exactly = "y".repeat(contract.credential.passwordMinimumLength);
    assert.equal(run(`${exactly}\n${exactly}\n`, box.file).status, 0, "the minimum itself is accepted");
    for (const result of [mismatch, tooShort])
      assert.ok(!result.stdout.includes(PASSWORD) && !result.stderr.includes(PASSWORD));
  } finally {
    box.done();
  }
});

test("a rotation replaces the credential and keeps every other line, the enable line included", () => {
  const box = sandbox();
  try {
    writeFileSync(box.file, `${ENABLE}=${contract.enable.value}\n${HASH}=old\n${SECRET}=OLD\n${VAULT_KEY}=existing-vault-key-kept-as-it-is\nOPERATOR_NOTE=kept\n`, { mode: 0o600 });
    const result = run(`${PASSWORD}\n${PASSWORD}\n`, box.file);
    assert.equal(result.status, 0, result.stderr);
    const lines = readFileSync(box.file, "utf8").split("\n").filter(Boolean);
    assert.ok(lines.includes(`${ENABLE}=${contract.enable.value}`), "the founder's own enable line is left alone");
    assert.ok(lines.includes("OPERATOR_NOTE=kept"));
    assert.ok(lines.includes(`${VAULT_KEY}=existing-vault-key-kept-as-it-is`), "an existing vault key is never rotated: a rotated one is a vault nobody can read");
    assert.equal(lines.filter((l) => l.startsWith(`${VAULT_KEY}=`)).length, 1);
    assert.ok(result.stdout.includes("was kept as it was"));
    assert.ok(!lines.includes(`${HASH}=old`) && !lines.includes(`${SECRET}=OLD`), "the old credential is gone");
    assert.equal(lines.filter((l) => l.startsWith(`${HASH}=`)).length, 1);
    assert.equal(lines.filter((l) => l.startsWith(`${SECRET}=`)).length, 1);
    assert.equal(statSync(box.file).mode & 0o777, 0o600);
  } finally {
    box.done();
  }
});

test("the script never writes the enable line, in any branch", () => {
  const source = readFileSync(SCRIPT, "utf8");
  const code = source
    .split("\n")
    .filter((line) => !/^\s*#/.test(line) && !/^\s*say /.test(line))
    .join("\n");
  assert.ok(!code.includes(`${ENABLE}=${contract.enable.value}`), "no line of code names the enable value beside the variable");
  assert.ok(!/printf[^\n]*MYTHUSO_FOUNDER_ACCESS/.test(code), "no printf writes the variable");
});

test("the vault key is written only when the file has none, and no say or echo line can print it", () => {
  const source = readFileSync(SCRIPT, "utf8");
  assert.match(source, /^VAULT_KEY_VARIABLE=MYTHUSO_VAULT_KEY$/m);
  assert.match(source, new RegExp(`^VAULT_KEY_BYTES=${contract.vault.keyBytes}$`, "m"));
  assert.match(source, /if \[ ! -f "\$ENV_FILE" \] \|\| ! grep -qE "\^\$\{VAULT_KEY_VARIABLE\}=" "\$ENV_FILE"; then/, "generated only when absent");
  for (const line of source.split("\n"))
    if (/^\s*(say|echo|printf)\b/.test(line) && !/>> "\$tmp"/.test(line) && !/grep -qE/.test(line))
      assert.ok(!/\$vault_key|\$\{vault_key/.test(line), `a line prints the vault key: ${line.trim()}`);
});
