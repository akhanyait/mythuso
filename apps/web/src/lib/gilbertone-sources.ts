import connectors from '../../../../packages/catalog/gilbertone-connectors.json' with { type: 'json' };

/* What produced a GilbertOne answer, for the sources caption beneath it in the panel (2 October 2026,
 * the founder's "a small caption under GilbertOne that shows sources its getting information from").
 *
 * The source is read from the reply's own kind and from nothing else, so the caption can only name what
 * actually answered: a model reply is the service's, an emergency is the device's rules, an unmatched
 * reply is the device's safe fallback, and every other kind is the catalogue's approved words. The
 * open-source connectors the founder switched on for the demo are listed apart and called simulated,
 * because none is installed — gilbertone-connectors.json's no-demo-connector-named-as-a-source.
 * The signed-in health reply may name a card when the patient's words appear on it.
 * It does not paste the card's `adds` sentence into the reply. */

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

/* A signed-in health reply may name a demo connector only when the patient's own words appear in
 * that card's text (its name, what it adds, or the project line). The card's `adds` sentence is
 * not copied into the reply. A connector whose card does not share a word with the message is not listed. */
const CONNECTOR_STOP = new Set([
  "about", "after", "also", "and", "answer", "answers", "any", "are", "because", "been", "before",
  "can", "closer", "could", "does", "entries", "entry", "from", "general", "have", "information",
  "just", "like", "model", "models", "more", "most", "name", "names", "not", "please", "question",
  "questions", "reading", "really", "search", "second", "should", "size", "small", "some", "still",
  "text", "than", "that", "the", "their", "them", "then", "they", "this", "very", "what", "when",
  "where", "which", "while", "with", "would", "written", "you", "your",
]);

const connectorTokens = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter((word) => !CONNECTOR_STOP.has(word));

const tokenHits = (left: readonly string[], right: ReadonlySet<string>): boolean =>
  left.some((word) => {
    if (right.has(word)) return true;
    if (word.length < 5) return false;
    for (const other of right) {
      if (other.length >= 5 && (other.startsWith(word) || word.startsWith(other))) return true;
    }
    return false;
  });

export type UsedConnector = { readonly id: string; readonly name: string; readonly text: string };

export const connectorsUsedFor = (message: string): readonly UsedConnector[] => {
  if (!connectors.demo.on) return [];
  const said = connectorTokens(message);
  if (!said.length) return [];
  const used: UsedConnector[] = [];
  for (const id of connectors.demo.connectors) {
    const found = connectors.connectors.find((card) => card.id === id);
    if (!found) continue;
    const hay = new Set(connectorTokens(`${found.name} ${found.adds} ${found.project}`));
    if (!tokenHits(said, hay)) continue;
    used.push({ id: found.id, name: found.name, text: found.adds });
  }
  return used;
};
