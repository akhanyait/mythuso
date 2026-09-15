/* Home Guidance: one of four outcomes, read to the patient from a ratified script, or nothing at all.
 *
 * The outcomes are clinical.json's frame, named as ThusoIQ Master v3.5 §8 names them and nothing more. A script is
 * the clinical governance board's words at a ratified protocol version, found in clinical.json guidance.scripts
 * by its reference and read by its contentRef; the registry is empty, so every outcome refuses in the route's
 * sentence and the patient is told nothing by software. Were a script there, its words would still be held to the
 * patient wording rule before they were given: guidance never tells a patient they have a condition.
 *
 * No script's words are in this build, so the reader here reads none, and a script whose words cannot be read is
 * not given.
 */
import { diagnosisTold, done, guidanceOutcomes, guidanceScripts, isRatified, refused, register, type Register, type Result, type Script } from './contract.ts';

export type Delivered = { readonly guidanceRef: string; readonly outcomeCode: string };
export type ScriptReader = (contentRef: string) => string | null;
/** This build's reader. No script's words are in it. */
export const noScriptWordsInThisBuild: ScriptReader = () => null;
export type GuidanceContext = { readonly guidanceRef: string; readonly scripts?: readonly Script[]; readonly register?: Register; readonly read?: ScriptReader };

export function deliver(request: { readonly triageRef: unknown; readonly scriptRef: unknown }, context: GuidanceContext): Result<Delivered> {
 const script = (context.scripts ?? guidanceScripts).find(s => s.scriptRef === request.scriptRef);
 if (!script || !isRatified(script.protocolVersionId, context.register ?? register) || !guidanceOutcomes.some(o => o.code === script.outcomeCode)) return refused('script-not-ratified');
 const words = (context.read ?? noScriptWordsInThisBuild)(script.contentRef);
 if (words === null) return refused('script-not-ratified');
 if (diagnosisTold(words)) return refused('tells-a-diagnosis');
 return done({ guidanceRef: context.guidanceRef, outcomeCode: script.outcomeCode }, [{
  key: 'guidance.delivered@1', payload: { guidanceRef: context.guidanceRef, outcomeCode: script.outcomeCode, scriptRef: script.scriptRef }, protocolVersion: script.protocolVersionId
 }]);
}
