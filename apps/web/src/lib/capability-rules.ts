import contract from '../../../../packages/catalog/capabilities.json' with { type: 'json' };
/* The capability contract's own rules, for the status page.
 *
 * They live apart from lib/capabilities.ts because that module is on the patient's first view, and importing the
 * contract there carries all of it — the rules, the evidence, the surfaces and the commentary — to a patient who only
 * wanted to read her visits. The status page is its own entry, read by somebody deciding whether to trust the product,
 * and it is the one surface that renders a rule; nothing on the patient's first view imports this file, and
 * scripts/check-boundaries.mjs walks that view's imports to hold it so. */

export const rules = contract.rules;

/* The rules are the contract's own reasoning, and the public status page renders one of them word
   for word: the one that says a row may not read "Connected" until there is a file to point at.
   Looked up by id and thrown on rather than found-or-undefined, for the same reason `capability`
   is — a rule that quietly renders as nothing is a paragraph of accountability that has silently
   left the page. */
export const rule = (id: string) => {
 const found = rules.find(r => r.id === id);
 if (!found) throw new Error(`No rule "${id}" in packages/catalog/capabilities.json`);
 return found;
};

/* The note a capability carries about what may never be softened — voice and emergency carry one,
   and no other capability does. It lives here rather than in lib/capabilities.ts for the same reason
   the rules do: it is the contract's reasoning rather than a sentence a screen shows a patient, and
   the first view does not read it. The GilbertOne demonstrator renders the voice one word for word
   beside the control it refuses to draw, because a refusal quoted from the contract can be checked
   against the contract and a refusal in an engineer's own words cannot. */
export const neverSoftenOf = (id: string): string | null => {
 const found = contract.capabilities.find(c => c.id === id);
 return (found && 'neverSoften' in found ? found.neverSoften : null) ?? null;
};
