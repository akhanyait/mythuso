/* The one function a credential is read through, 28 September 2026.

   Every adapter in this service used to read its key straight from process.env, which was true and
   sufficient while the env file was the only place a key could be. The provider vault
   (./provider-vault.ts) is a second place, with precedence — the vault's value, then the environment,
   then not configured — and a disabled card answers not configured for every variable of its own. That
   decision has to be made in one place or two adapters will one day disagree about which key is in
   force; so it is made by the vault's envFor(), and this module is only the seam through which the
   parts of the service that are not handed an environment — the language-model tier, whose adapter and
   orchestrator read process.env at module level — reach the same view.

   By default the view IS process.env: a process with no vault installed reads exactly as it always
   did. server.ts installs the vault's view once, when the server is built; nothing else calls
   installCredentialSource, and a test that builds two servers in one process gets the last one's view
   for the language-model tier — the speech seam is handed its view explicitly and does not go through
   here. Nothing in this module stores, logs or copies a value. */

export type Env = Record<string, string | undefined>;

let source: () => Env = () => process.env;

export function installCredentialSource(view: () => Env): void {
  source = view;
}

/* The environment a credential is read from, now. A function rather than a value so a key stored in
   the vault a moment ago is what the next read sees. */
export const credentialEnv = (): Env => source();
