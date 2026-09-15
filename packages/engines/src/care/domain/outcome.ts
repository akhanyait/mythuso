/* What every Care act answers with: the value and the events it produced, or a refusal in the
 * contract's own words.
 *
 * There is no third shape. An act that half-succeeds — an offer made with nobody to make it to, a
 * visit started with a code that did not match — is the defect this engine exists to refuse, so a
 * caller cannot receive a value without having been told whether it was refused.
 *
 * An event here is the payload and the envelope fields only an act can know: who it is about, which
 * role caused it and for what purpose. The event id, the clock stamp and the owner are the bus's to
 * add, because a domain that minted its own event ids would be a second publisher waiting to happen.
 * Nothing in this file imports anything, so the runtime can bind it to whatever bus it builds. */

export type Refusal = {
 readonly ok: false;
 /** The route whose contract declares the refusal, as METHOD path@version. */
 readonly route: string;
 readonly id: string;
 readonly status: number;
 readonly statement: string;
};

export type CareEvent = {
 readonly type: string;
 readonly version: number;
 readonly subjectRef: string;
 readonly actorRole: string;
 readonly purposeOfUse: string;
 readonly payload: Readonly<Record<string, string | boolean>>;
};

export type Answer<T> = { readonly ok: true; readonly value: T; readonly events: readonly CareEvent[] } | Refusal;

export const answer = <T>(value: T, events: readonly CareEvent[] = []): Answer<T> => ({ ok: true, value, events });

export const isRefusal = <T>(a: Answer<T>): a is Refusal => a.ok === false;
