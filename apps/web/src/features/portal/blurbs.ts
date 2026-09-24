import framing from '../../../../../packages/catalog/framing.json' with { type: 'json' };

/* The sentence a moved section already said about itself, read from where it already lives. A tab
   that moved into the portal keeps its words: packages/catalog/framing.json holds the Control Tower
   workspace's, and the back office's are its own console's (features/Admin.tsx exports them). Neither
   is retyped here, because a moved tab that described itself differently in the new place would be
   the parallel run failing on its first sentence. */
export function framingSection(id: string): string {
 const found = framing.sections.find(s => s.id === id);
 if (!found) throw new Error(`packages/catalog/framing.json has no section "${id}".`);
 return found.blurb;
}
