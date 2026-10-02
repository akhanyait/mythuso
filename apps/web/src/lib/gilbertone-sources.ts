import connectors from '../../../../packages/catalog/gilbertone-connectors.json' with { type: 'json' };

/* What produced a GilbertOne answer, for the sources caption beneath it in the panel (2 October 2026,
 * the founder's "a small caption under GilbertOne that shows sources its getting information from").
 *
 * The source is read from the reply's own kind and from nothing else, so the caption can only name what
 * actually answered: a model reply is the service's, an emergency is the device's rules, an unmatched
 * reply is the device's safe fallback, and every other kind is the catalogue's approved words. The
 * open-source connectors the founder switched on for the demo are listed apart and called simulated,
 * because none is installed — gilbertone-connectors.json's no-demo-connector-named-as-a-source. */

export type SourceKind = 'catalogue' | 'model' | 'emergency' | 'fallback';

export const sourceOf = (replyKind: string): SourceKind =>
  replyKind === 'service' ? 'model' : replyKind === 'emergency' ? 'emergency' : replyKind === 'unmatched' ? 'fallback' : 'catalogue';

export const sourcesCaption = connectors.caption;

/* The connectors on for the demo, by name, in the contract's order; none when the switch is off. */
export const demoConnectorNames: readonly string[] = connectors.demo.on
  ? connectors.demo.connectors.map(id => {
      const found = connectors.connectors.find(c => c.id === id);
      if (!found) throw new Error(`gilbertone-connectors.json switches on "${id}" for the demo, and has no connector by that id.`);
      return found.name;
    })
  : [];
