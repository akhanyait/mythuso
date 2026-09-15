/* Triage: the rule engine's frame and the gates around it, with no rule in it.
 *
 * THE FRAME, IN ORDER. Gilbert's emergency terms are asked before triage, by Access, and nothing here reads,
 * changes or outranks them. Then the protocol: a version the register holds as ratified, of a protocol the board
 * has named a triage protocol, or nothing is triaged. Then the protocol's own rules, loaded by its version: this
 * build loads none, because no protocol's content is in it, so a ratified protocol whose rules cannot be read is
 * still answered not triaged. Then the gates, which are the part that is ours:
 *
 *   - THE RED-FLAG GATE. A red flag that fires sets the protocol's most urgent priority, whatever the rest of its
 *     rules said, and nothing after it may lower it.
 *   - REASON CODES. A priority is set only with the reason codes that set it; they are written to the record, and
 *     only the priority and the care setting travel on the bus.
 *   - A MODEL NEVER LOWERS. A language model may explain the answer. A priority it names may match the rules' or be
 *     more urgent, and one less urgent — or one the protocol's scale does not hold, which nobody can say is not
 *     less urgent — refuses the triage rather than being quietly ignored.
 *
 * Every answer in this build is a refusal, in the contract's sentence, and a screen shows it beside
 * clinical.json's triage.notTriaged: not triaged, handed to a nurse or a doctor. Software never guesses a priority.
 */
import { done, protocolAt, refused, register, triageProtocolIds, type Register, type Result } from './contract.ts';

/** What a ratified protocol's rules would answer for one intake. Supplied by the board's content, never written here. */
export type RuleOutcome = {
 readonly priorityCode: string; readonly careSetting: string; readonly reasonCodes: readonly string[];
 readonly redFlagFired: boolean; readonly triageEntryRef: string;
};
export type RuleSet = {
 /** The protocol's priorities, most urgent first. */
 readonly priorityScale: readonly string[];
 /** The priority a red flag sets. */
 readonly redFlagPriority: string;
 run(intakeEntryRef: string): RuleOutcome;
};
export type RuleLoader = (protocolVersionId: string) => RuleSet | null;
/** This build's loader. No protocol's rules are in it, so it loads none. */
export const noRulesInThisBuild: RuleLoader = () => null;

export type TriageRequest = { readonly intakeEntryRef: string; readonly protocolVersionId?: unknown; readonly explanationPriorityCode?: unknown };
export type Triaged = { readonly triageRef: string; readonly priorityCode: string; readonly careSetting: string; readonly triageEntryRef: string };
export type TriageContext = { readonly triageRef: string; readonly load?: RuleLoader; readonly register?: Register; readonly triageProtocols?: readonly string[] };

export function triageOn(request: TriageRequest, context: TriageContext): Result<Triaged> {
 const protocol = protocolAt(request.protocolVersionId, context.register ?? register);
 if (!protocol || protocol.status !== 'ratified' || !(context.triageProtocols ?? triageProtocolIds).includes(protocol.id)) return refused('triage-without-ratified-protocol');
 const versionId = request.protocolVersionId as string;
 const rules = (context.load ?? noRulesInThisBuild)(versionId);
 if (!rules) return refused('protocol-content-not-in-this-build');
 return gate(rules, rules.run(request.intakeEntryRef), request.explanationPriorityCode, context.triageRef, versionId);
}

/** The gates, over whatever the rules answered. Exported so the build can run them against every order of priority. */
export function gate(rules: RuleSet, outcome: RuleOutcome, explanation: unknown, triageRef: string, protocolVersionId: string): Result<Triaged> {
 const rank = (code: unknown) => typeof code === 'string' ? rules.priorityScale.indexOf(code) : -1;
 const priorityCode = outcome.redFlagFired ? rules.redFlagPriority : outcome.priorityCode;
 if (rank(priorityCode) < 0) return refused('protocol-content-not-in-this-build');
 if (!outcome.reasonCodes.length) return refused('priority-without-reason-codes');
 if (explanation !== undefined && explanation !== null && explanation !== '') {
  const explained = rank(explanation);
  if (explained < 0 || explained > rank(priorityCode)) return refused('model-lowers-priority');
 }
 return done({ triageRef, priorityCode, careSetting: outcome.careSetting, triageEntryRef: outcome.triageEntryRef }, [{
  key: 'triage.completed@2', payload: { triageRef, priorityCode, careSetting: outcome.careSetting }, protocolVersion: protocolVersionId
 }]);
}
