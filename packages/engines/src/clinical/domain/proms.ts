/* Outcome questions: an episode of care scheduled when its review is signed, and answers refused until the board
 * has chosen what to ask.
 *
 * THE SCHEDULE IS A SETTING, KEPT. An episode reads prom-days from the settings in force when its review is signed
 * and keeps them, with the settings version. A change on the Configuration screen reaches the next episode and
 * never one already scheduled, so a patient is never asked on a day nobody told them.
 *
 * THE INSTRUMENT IS THE BOARD'S. clinical.json proms.instruments is empty, and an answer with no chosen instrument
 * is refused in the route's sentence. Were one chosen, its answers would be written to the Health Passport through
 * its consent gateway; the engine runtime cannot reach that gateway, and the writer it is handed says so by
 * failing rather than by inventing an entry.
 *
 * WHOSE EPISODE. The patient's own, by the reference the runtime admitted. Another patient's episode is answered
 * as one that does not exist.
 */
import { DAY, done, promInstruments, refused, type Instrument, type Result } from './contract.ts';

export type Episode = {
 readonly episodeRef: string; readonly subjectRef: string; readonly reviewRef: string;
 readonly startedAt: number; readonly days: readonly number[]; readonly settingsVersion: number;
};

export function startEpisode(input: { episodeRef: string; subjectRef: string; reviewRef: string }, inForce: { readonly promDays: readonly number[]; readonly settingsVersion: number }, now: number): Episode {
 return { ...input, startedAt: now, days: [...inForce.promDays], settingsVersion: inForce.settingsVersion };
}

/** When each question falls due, earliest first. */
export const dueDates = (episode: Episode): number[] => episode.days.map(day => episode.startedAt + day * DAY);

export type AnswerContext = {
 readonly instruments?: readonly Instrument[];
 /** Writes the answers to the Passport through its gateway and returns the entry. */
 readonly write: (episode: Episode, answers: readonly unknown[]) => string;
};

export function answer(episode: Episode | undefined, request: { readonly dayMark: unknown; readonly answers: readonly unknown[] }, patient: { readonly ref: string | null }, context: AnswerContext, now: number): Result<{ readonly promEntryRef: string }> {
 if (!episode || !patient.ref || episode.subjectRef !== patient.ref) return refused('no-such-episode');
 const day = request.dayMark;
 if (typeof day !== 'number' || !episode.days.includes(day) || now < episode.startedAt + day * DAY) return refused('prom-not-due');
 if (!(context.instruments ?? promInstruments).length) return refused('no-prom-instrument');
 return done({ promEntryRef: context.write(episode, request.answers) });
}

/** The engine runtime's writer. The Passport gateway is not reachable from it, so an answer is never written here. */
export const noPassportGatewayHere = (): string => {
 throw new Error('The Health Passport gateway is not reachable from the engine runtime, so no outcome answer is written and nothing is said to have been.');
};
