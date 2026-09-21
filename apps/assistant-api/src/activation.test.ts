import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_ACKNOWLEDGEMENT,
  PRODUCTION_VARIABLE,
  activationRefusal,
  assistantActivation,
  modelTierAllowed,
} from './lib/activation.ts';

/* The acknowledgement gate's own tests, added with it on 21 September 2026.

   The gate exists because the credential sequence ends with the service enabled and, one health
   check later, `"azure": true` — a key typed and a unit enabled is a public model answering
   patients, and nothing in those two commands says that this is the moment. The unit deliberately
   does not carry the acknowledgement variable; the operator writes it into
   /etc/mythuso/assistant.env by hand, from deploy/RUNBOOK.md. What these tests hold is that a
   configured key alone changes nothing, and the spawn at the bottom is the refusal seen from
   outside the process: the real server.ts, a real Node, an exit before the port.

   Fixtures stay under the .invalid TLD and are assembled the way deploy.test.ts assembles its own,
   so the boundary script's credential scan never sees a variable's name and a credential-shaped
   value meeting at an equals sign — the variable NAMES are what this file is about, and they are
   written as names. */

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://assistant-fixture.invalid';
const KEY = 'fixture-key-0123456789abcdef';

/* A production box with the key typed in: the endpoint and the key, the two halves of the pair the
   adapter's provider classes read by name. No value here is real, and none survives an assertion. */
const configured = (env: Record<string, string | undefined> = {}) => ({
  ...env,
  AZURE_OPENAI_ENDPOINT: ENDPOINT,
  AZURE_OPENAI_KEY: KEY,
});

test('production is NODE_ENV exactly, and acknowledged is that one word, case and all', () => {
  assert.deepEqual(assistantActivation({}), {
    production: false,
    acknowledged: false,
    credentialsConfigured: false,
  });
  assert.equal(assistantActivation({ NODE_ENV: 'development' }).production, false);
  assert.equal(
    assistantActivation({ NODE_ENV: ' production ' }).production,
    true,
    'the unit writes the word; whitespace around it is stripped, not ignored',
  );
  assert.equal(
    assistantActivation({ NODE_ENV: 'Production' }).production,
    false,
    'a production that only almost says production is not one',
  );
  assert.equal(
    assistantActivation({ [PRODUCTION_VARIABLE]: PRODUCTION_ACKNOWLEDGEMENT }).acknowledged,
    true,
  );
  assert.equal(
    assistantActivation({ [PRODUCTION_VARIABLE]: ' Acknowledged ' }).acknowledged,
    false,
    'a value close enough is how acknowledged becomes ack — the word is typed from the RUNBOOK and read as typed',
  );
  assert.equal(assistantActivation({ [PRODUCTION_VARIABLE]: 'yes' }).acknowledged, false);
});

test('credentials are configured by presence: a pair, the documented alias, or a local Ollama', () => {
  assert.equal(assistantActivation(configured()).credentialsConfigured, true);
  assert.equal(
    assistantActivation({ AZURE_OPENAI_ENDPOINT: ENDPOINT }).credentialsConfigured,
    false,
    'an endpoint without a key is half a pair',
  );
  assert.equal(
    assistantActivation({ AZURE_OPENAI_KEY: KEY }).credentialsConfigured,
    false,
    'a key without an endpoint is the other half',
  );
  assert.equal(
    assistantActivation({ AZURE_OPENAI_ENDPOINT: ENDPOINT, AZURE_OPENAI_API_KEY: KEY })
      .credentialsConfigured,
    true,
    'the adapter has always read the alias too, so the gate must not miss it',
  );
  assert.equal(
    assistantActivation({ OLLAMA_URL: 'http://127.0.0.1:11434' }).credentialsConfigured,
    true,
    'a local Ollama is a provider in the same sense — the probe path is a way a model can appear',
  );
});

test('production without the acknowledgement may not reach a model, whatever is configured', () => {
  assert.equal(
    modelTierAllowed({ NODE_ENV: 'production' }),
    false,
    'even with nothing configured: the Ollama probe is the credential-less way a model could otherwise appear',
  );
  assert.equal(
    modelTierAllowed(configured({ NODE_ENV: 'production' })),
    false,
    'a configured key is not the decision',
  );
  assert.equal(
    modelTierAllowed(
      configured({ NODE_ENV: 'production', [PRODUCTION_VARIABLE]: PRODUCTION_ACKNOWLEDGEMENT }),
    ),
    true,
    'the acknowledgement is the second, deliberate decision',
  );
  assert.equal(modelTierAllowed({}), true, 'development always may — that is what makes the bridge testable');
});

test('the refusal arrives only when production, a provider and no acknowledgement meet', () => {
  assert.equal(activationRefusal({}), null, 'development never refuses');
  assert.equal(
    activationRefusal({ NODE_ENV: 'production' }),
    null,
    'production with nothing configured has no model to refuse',
  );
  assert.equal(
    activationRefusal(
      configured({ NODE_ENV: 'production', [PRODUCTION_VARIABLE]: PRODUCTION_ACKNOWLEDGEMENT }),
    ),
    null,
    'the acknowledgement ends the sequence',
  );
  const refusal = activationRefusal(configured({ NODE_ENV: 'production' }));
  assert.ok(refusal, 'a configured key in production without the acknowledgement must refuse');
  assert.ok(refusal.includes(PRODUCTION_VARIABLE), 'the refusal names the variable to write');
  assert.ok(refusal.includes('deploy/RUNBOOK.md'), 'and says where the exact command is');
  assert.ok(
    !refusal.includes(KEY),
    'this process may be holding the key — a log is one of the places it must never surface',
  );
  assert.ok(!refusal.includes(ENDPOINT), 'nor the resource the endpoint came from');
});

test('the server itself refuses to start when the acknowledgement is missing — before it binds', () => {
  /* The real entry point under a real Node, in the one configuration the gate exists for, with
     cwd set the way `npm start` runs it. The timeout is half the assertion: a server that listened
     would keep the event loop alive and be killed at the timeout, and a killed child is a
     result.error this test does not accept. The acknowledgement variable is explicitly emptied
     rather than left absent, so a developer's own environment cannot quietly satisfy the gate. */
  const result = spawnSync(process.execPath, ['src/server.ts'], {
    cwd: PACKAGE,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AZURE_OPENAI_ENDPOINT: ENDPOINT,
      AZURE_OPENAI_KEY: KEY,
      [PRODUCTION_VARIABLE]: '',
    },
  });
  assert.equal(
    result.error,
    undefined,
    'a process that bound the port would never exit on its own — the refusal happens before listen()',
  );
  assert.equal(result.status, 1, 'the refusal is an exit, not a warning');
  assert.match(result.stderr, /Refusing to start/);
  assert.ok(result.stderr.includes(PRODUCTION_VARIABLE), 'the refusal names the variable');
  assert.ok(
    !result.stderr.includes(KEY) && !result.stdout.includes(KEY),
    'the key may be in this process\u2019s environment and must reach neither stream',
  );
});
