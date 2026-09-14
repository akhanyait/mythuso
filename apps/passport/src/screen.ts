/**
 * Whether something a caller wants to store says who a person is.
 *
 * The Passport knows people by a token it minted. The first version refused a name only at the top
 * level of a Patient resource, which left a name free to arrive three levels down — in an extension
 * called patient-name, in an Observation's note, in performer.display. So the screen walks every
 * value at every depth of every resource, and of a break-glass note, and answers with the path of
 * the first thing it finds:
 *
 *   · a key from packages/catalog/passport-gateway.json's identity list (name, telecom, address,
 *     performer and the rest) — who performed an act is the grant's to say, in the provenance;
 *   · an extension whose url says it holds a name, a phone number, an address or an identifier;
 *   · a run of digits long enough to be a phone or identity number, allowing the spaces, dashes,
 *     dots and brackets people write them with;
 *   · anything shaped like an email address.
 *
 * What it cannot do is recognise a name written into free text. Nothing here claims otherwise, and
 * that is one of the reasons the break-glass note is kept out of the patient-visible audit chain.
 */
import gateway from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };

const KEYS = new Set(gateway.identityScreen.keys.map(key => key.toLowerCase()));
const URL_WORDS = new RegExp(gateway.identityScreen.extensionUrlWords.map(word => word.replace(/[-]/g, '\\-')).join('|'), 'i');
const DIGIT_RUN = new RegExp(`(?:\\d[\\s().-]*){${gateway.identityScreen.digitRun},}`);
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

export function identityShaped(value: unknown, path = ''): string | null {
 if (typeof value === 'string') return DIGIT_RUN.test(value) || EMAIL.test(value) ? path || '(value)' : null;
 if (Array.isArray(value)) {
  for (let index = 0; index < value.length; index++) {
   const found = identityShaped(value[index], `${path}[${index}]`);
   if (found) return found;
  }
  return null;
 }
 if (value && typeof value === 'object') {
  for (const [key, inner] of Object.entries(value)) {
   const here = path ? `${path}.${key}` : key;
   if (KEYS.has(key.toLowerCase())) return here;
   if (key === 'url' && typeof inner === 'string' && URL_WORDS.test(inner)) return here;
   const found = identityShaped(inner, here);
   if (found) return found;
  }
 }
 return null;
}
