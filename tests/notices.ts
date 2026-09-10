import { readFileSync } from 'node:fs';
/* The sentence a screen shows about what is behind it, read from the contract rather than typed.
 *
 * Thirteen assertions across eight journeys had the sentence written out, and every one of them was
 * wrong the moment `capabilities.json` grew a third state: a capability that is `simulated` renders
 * its simulation notice rather than its absent one, and the specs went on asserting the absent one.
 * The suite was red and nobody saw it, because `playwright.config.ts` reuses an existing server on
 * 5173 and a run in one checkout will happily test whatever tree started that server first.
 *
 * So the specs ask the same question the screens ask. `apps/web/src/lib/capabilities.ts` has
 * `noticeFor` and this is it, over the file rather than over the module, because a spec that
 * imported the web app's TypeScript would drag Vite's module graph into the test process for one
 * string. The rule it implements is the contract's own: nothing while connected, the simulation
 * sentence while simulated, and the absent sentence otherwise.
 */
type Capability = {
 id: string;
 connected: boolean;
 notice: string;
 simulation?: { notice: string };
};
const { capabilities } = JSON.parse(
 readFileSync(new URL('../packages/catalog/capabilities.json', import.meta.url), 'utf8')
) as { capabilities: Capability[] };

export function noticeFor(id: string): string {
 const found = capabilities.find(capability => capability.id === id);
 /* Loud rather than undefined, for the reason the web's own lookup throws: a spec naming a
    capability nobody declared would assert against `undefined` and pass on any screen at all. */
 if (!found) throw new Error(`No capability "${id}" in packages/catalog/capabilities.json`);
 if (found.connected) throw new Error(`Capability "${id}" is connected, so no screen renders a notice for it and this assertion cannot be about one.`);
 return found.simulation ? found.simulation.notice : found.notice;
}
