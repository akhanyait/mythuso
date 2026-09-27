import contract from '../../../../packages/catalog/care-tips.json' with { type: 'json' };

/* The care tips, as the screen reads them.
 *
 * Every word the stack shows is the contract's, and this module is the only place that joins a tip
 * to its category and a category to its tint. The screen never types a sentence and never picks a
 * colour: a tint is a name from the contract that care-tips.css answers with a token pair
 * tokens.json#contrast has already measured.
 *
 * Nothing on the patient's first load imports this module or the contract: a JSON module imported
 * there is kept whole in the entry bundle, every tip with it. The router reads the two strings it needs
 * from care-tips-route.generated.ts, and the door on a completed visit arrives on a dynamic import. */

export type Tint = 'mint' | 'lilac' | 'peach' | 'lime' | 'night';
export type CareTip = { id: string; category: string; tag: string; tint: Tint; title: string; body: string };

export const careTipWords = contract.screen;
export const careTipDoor = contract.door;
export const careTipReview = contract.review;
export const careTipRefusals = contract.refusals.map(r => r.sentence);

export const careTips: CareTip[] = contract.tips.map(tip => {
 const category = contract.categories.find(c => c.id === tip.category);
 /* A tip in a category nobody declared is a contract error, and the build says so
    (scripts/check-boundaries.mjs); here it falls back to the tip's own id rather than an empty tag. */
 return { id: tip.id, category: tip.category, tag: category?.label ?? tip.category,
  tint: (category?.tint ?? 'lilac') as Tint, title: tip.title, body: tip.body };
});

const fill = (text: string, values: Record<string, string | number>) =>
 text.replace(/\{(\w+)\}/g, (whole, name: string) => String(values[name] ?? whole));

export const counterFor = (index: number) => fill(careTipWords.counter, { n: index + 1, total: careTips.length });
export const jumpLabelFor = (index: number) => fill(careTipWords.jumpLabel, { n: index + 1, title: careTips[index]!.title });
