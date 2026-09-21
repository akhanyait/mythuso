/* The production acknowledgement gate, added 21 September 2026 with the credential script.

   THE HOLE THIS CLOSES. configure-assistant-env.sh ends with the service enabled and, on the next
   health check, `"azure": true`. Every act in that sequence — typing a key, appending a line,
   enabling a unit — is deliberate, but they are three deliberate acts in one sitting, and the last
   two are single commands a person copies. A key pasted and a service enabled is a public model
   answering patients, and nothing in it forced anyone to stop and say that this is the moment the
   second tier goes live to the public. Credentials alone must not be able to do that.

   So production now takes one more line, written on purpose and only by hand:
   MYTHUSO_ASSISTANT_PRODUCTION=acknowledged in the service's own env file
   (/etc/mythuso/assistant.env, 0600 root:root, written by that same script's operator). With
   NODE_ENV=production and a provider configured, the service refuses to start without it — loudly,
   before it binds its port — and orchestrate() returns degraded without it, so even a running
   process cannot reach a model. Test mode does not exist here: this module has no bypass, and the
   boundary check reads this file for the variable name.

   WHY NODE_ENV AND NOT THE UNIT FILE. NODE_ENV=production is the signal this whole repository
   already reads — the unit sets it, the tests run without it, and the credential script never
   touches it. A flag that also decided when this gate applies would be a flag that could be
   forgotten in one of its two jobs.

   WHAT THIS IS NOT. It is not authentication and not a second credential: root can append the line
   the same way root appends the key. It is the difference between a sequence of commands and a
   decision — and it is what makes the RUNBOOK say, out loud, that the moment below is the one where
   the public internet gets a model. */

export const PRODUCTION_VARIABLE = 'MYTHUSO_ASSISTANT_PRODUCTION';
export const PRODUCTION_ACKNOWLEDGEMENT = 'acknowledged';

export type ActivationState = {
  /* NODE_ENV is exactly "production". */
  production: boolean;
  /* The acknowledgement line is present and exact. Case matters: this is typed from the RUNBOOK,
     and a value close enough is how "acknowledged" becomes "ack". */
  acknowledged: boolean;
  /* An Azure endpoint and key, or an Ollama URL, is present. The same three facts the adapter's
     provider classes read — by name only, never by value. */
  credentialsConfigured: boolean;
};

export function assistantActivation(
  env: Record<string, string | undefined> = process.env,
): ActivationState {
  const production = (env.NODE_ENV ?? '').trim() === 'production';
  const acknowledged =
    (env[PRODUCTION_VARIABLE] ?? '').trim() === PRODUCTION_ACKNOWLEDGEMENT;
  const endpoint = (env.AZURE_OPENAI_ENDPOINT ?? '').trim();
  const key = (env.AZURE_OPENAI_KEY ?? env.AZURE_OPENAI_API_KEY ?? '').trim();
  const credentialsConfigured = Boolean((endpoint && key) || (env.OLLAMA_URL ?? '').trim());
  return { production, acknowledged, credentialsConfigured };
}

/* The one question every model path asks before it reaches a provider: may this tier run here?
   Development always may — that is what makes the panel's bridge testable — and so does a
   production process that carries the acknowledgement. Production without it may not, whatever
   credentials are present and whether or not a local Ollama happens to be listening: the probe
   path is exactly the credential-less way a model could otherwise appear. */
export function modelTierAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const state = assistantActivation(env);
  return !state.production || state.acknowledged;
}

/* The refusal server.ts prints before it binds a port. It names the variable and where the line
   goes, never a value — the key may be in this process's environment, and the one place it must
   never surface is a log. */
export function activationRefusal(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const state = assistantActivation(env);
  if (!state.production || !state.credentialsConfigured || state.acknowledged) return null;
  return [
    `Refusing to start: NODE_ENV=production and a model provider is configured, but ${PRODUCTION_VARIABLE} is not set to "${PRODUCTION_ACKNOWLEDGEMENT}" in this service's environment.`,
    'A configured key alone must never switch the public model on; the acknowledgement is the second, deliberate decision.',
    `Append the line to /etc/mythuso/assistant.env by hand — deploy/RUNBOOK.md, "Activating the assistant service", has the exact command — then start again.`,
  ].join('\n');
}
