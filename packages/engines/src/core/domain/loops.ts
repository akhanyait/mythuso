/* The closed loop's arithmetic, with no store and no bus: who a concern nobody has taken on goes to next,
 * when it has run out of people to go to, what a panic alerts, and the order the Control Tower reads
 * concerns in. The engine and the web preview both run it, so where a concern is cannot differ between them.
 *
 * ── Where a concern goes when nobody takes it on ─────────────────────────────────────────────────────
 *
 * Its owner first, then its fallback, then up the posts of the escalation rota — Core's setting in
 * packages/catalog/closed-loop.json, as it was in force when the concern was opened. The fallback is an
 * extra rung before the rota and never rung one's override: the engine that opened the concern named it,
 * and the desk is still asked after it, so a concern loses neither. The fallback is given the time the
 * owner had; each post is given its minutes; and the last post, with nobody after it to hand the concern
 * to, the owner's time again. Nothing here types a post, a role or a minute: the rota a concern kept says
 * all three.
 *
 * ── Why a post is skipped ────────────────────────────────────────────────────────────────────────────
 *
 * A post is asked only when one of its windows covers the moment the concern reaches it, on the day and at
 * the time in packages/catalog/scheduling.json's timezone: the desk at two in the morning is an empty chair,
 * and paging it is the concern waiting on nobody. A post no role on the vetting register holds is skipped
 * too, and never handed to another role in its place. Every skip is returned with the move, so whoever
 * moves the concern writes it down.
 *
 * ── Why a concern keeps its rota ─────────────────────────────────────────────────────────────────────
 *
 * A concern carries the rota, the minutes and the settings version it was opened under, and nothing here
 * reads the settings. An admin changing the rota at three o'clock changes where the next concern goes; a
 * concern already on its second rung carries on up the rota it started on, rather than being reshuffled to
 * a post nobody told.
 *
 * ── A panic ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * A panic alerts every post on duty at once and walks nothing, and no minute is read on the way: nobody
 * decides how long a nurse in danger waits for the second person to hear. It is a rule in closed-loop.json
 * rather than a setting, and the build fails if a setting ever says otherwise.
 *
 * ── When it stops ────────────────────────────────────────────────────────────────────────────────────
 *
 * When nobody is left after its holder's deadline, the concern is exhausted: it keeps its holder, stays
 * open, and records when. Nothing here closes it, snoozes it or moves it down a rung — a concern with nobody
 * left is the one that most needs a person, and every way of making it quieter is a way of that person never
 * being found.
 *
 * ── Why an acknowledged concern does not escalate ────────────────────────────────────────────────────
 *
 * "Unacknowledged items escalate automatically." A concern somebody has taken on is waiting for its
 * outcome, and the clock that moves it is the acknowledgement's. The desk can still move it by hand. */
import { onDuty, type Post, type Window } from '../../settings/shape.ts';

/** A unit, not a policy. */
export const MINUTE_MS = 60_000;

/** The rota a concern was opened under: its posts in order, their windows, the time each post but the last holds it, and the settings version that said so. */
export type KeptRota = {
 readonly settingsVersion: number;
 readonly posts: readonly Post[];
 readonly windows: readonly Window[];
 readonly stepsMs: readonly number[];
};

/** Who holds a concern: its owner, its fallback, a post of its rota by position, or every post at once for a panic. */
export type Holder =
 | { readonly kind: 'owner' }
 | { readonly kind: 'fallback' }
 | { readonly kind: 'post'; readonly index: number }
 | { readonly kind: 'every-post' };

/** A post passed over on the way up, and why: nobody on duty in it, or no role on the register to hold it. */
export type Skip = { readonly post: string; readonly because: 'off-duty' | 'no-role' };

export type Loop = {
 loopRef: string;
 sourceEngine: string;
 /** The purpose it was opened under, which every later event about it carries. */
 purpose: string;
 ownerRole: string;
 /** Who holds it when its owner has not taken it on; null for a panic, which alerts every post at once. */
 fallbackRole: string | null;
 holder: Holder;
 /** The rota it walks, as it was in force when it was opened. Never read again from the settings. */
 rota: KeptRota;
 /** The posts a panic alerted; null for every other concern. */
 alerted: readonly string[] | null;
 /** The severity a panic is opened at; null for every other concern. */
 severity: string | null;
 openedAt: number;
 dueBy: number;
 /** The time its first owner was given, which its fallback and the last post of its rota are given too. */
 spanMs: number;
 acknowledgedAt: number | null;
 acknowledgedByRole: string | null;
 exhaustedAt: number | null;
 /** When the announcement that it is exhausted was accepted by the bus; null while it has not been. */
 announcedAt: number | null;
 closedAt: number | null;
 outcomeRef: string | null;
 /** What happened, as one of the outcomes closed-loop.json lists; null while open, and for a concern closed before outcomes were codes. */
 outcomeCode: string | null;
 closedByRole: string | null;
 /** Present when the concern is an alert: its reference, rung, key and record entry. */
 alertRef: string | null;
 rung: number | null;
 dedupeKey: string | null;
 recordEntryRef: string | null;
};

export type StateCode = 'open' | 'acknowledged' | 'exhausted' | 'closed';

export const isOpen = (loop: Loop): boolean => loop.closedAt === null;

export const stateCodeOf = (loop: Loop): StateCode =>
 loop.closedAt !== null ? 'closed' : loop.exhaustedAt !== null ? 'exhausted' : loop.acknowledgedAt !== null ? 'acknowledged' : 'open';

/* Why a close is refused, asked the same way by the engine and by the Control Tower's preview, so a close
   the preview accepts is one the route would. A closed concern is refused before its outcome is read,
   because a second outcome on one concern is wrong whatever it says. A blank code is no outcome, and a code
   the closed loop does not list is not one either. An exhausted concern is asked nothing different: it
   closes with an outcome like any other, and only that way. Who may close is the route's callers, which the
   runtime admits before this is asked. */
export type CloseRefusal = 'loop-closed' | 'no-outcome' | 'outcome-not-a-code';
export function closeRefusal(loop: Loop, outcomeCode: string, listed: ReadonlySet<string>): CloseRefusal | null {
 if (loop.closedAt !== null) return 'loop-closed';
 if (!outcomeCode.trim()) return 'no-outcome';
 if (!listed.has(outcomeCode.trim())) return 'outcome-not-a-code';
 return null;
}

/* Whether a post is on duty is the shared settings code's onDuty, not a rule of Core's own: the handover desk
   on the Access engine asks the same question of its hours, and two copies are two answers about whether six
   in the morning has begun. */

/** Where a concern goes if it moves at a moment: its next holder and that holder's time, or null when nobody is left, and every post passed over. */
export type Move = { readonly holder: Holder | null; readonly ownerRole: string | null; readonly spanMs: number; readonly skipped: readonly Skip[] };

export function nextHolder(loop: Loop, at: number): Move {
 const skipped: Skip[] = [];
 if (loop.holder.kind === 'owner' && loop.fallbackRole !== null) return { holder: { kind: 'fallback' }, ownerRole: loop.fallbackRole, spanMs: loop.spanMs, skipped };
 if (loop.holder.kind === 'every-post') return { holder: null, ownerRole: null, spanMs: loop.spanMs, skipped };
 const posts = loop.rota.posts;
 for (let index = loop.holder.kind === 'post' ? loop.holder.index + 1 : 0; index < posts.length; index += 1) {
  const post = posts[index]!;
  if (post.role === null) { skipped.push({ post: post.id, because: 'no-role' }); continue; }
  if (!onDuty(loop.rota, post.id, at)) { skipped.push({ post: post.id, because: 'off-duty' }); continue; }
  /* The last post has no minutes of its own: there is no post after it to hand the concern to. */
  return { holder: { kind: 'post', index }, ownerRole: post.role, spanMs: loop.rota.stepsMs[index] ?? loop.spanMs, skipped };
 }
 return { holder: null, ownerRole: null, spanMs: loop.spanMs, skipped };
}

/** The post that holds a concern now, when a post does. */
export const postOf = (loop: Loop): Post | null => loop.holder.kind === 'post' ? loop.rota.posts[loop.holder.index] ?? null : null;

/** The roles that hold a concern now and may take it on: every role a panic alerted, or its owner. */
export const holdersOf = (loop: Loop): string[] => loop.holder.kind === 'every-post'
 ? loop.rota.posts.filter(post => post.role !== null && (loop.alerted ?? []).includes(post.id)).map(post => post.role!)
 : [loop.ownerRole];

/** The concern with its next holder: a new owner who has not taken it on, given its holder's time from the moment it moved. */
export const movedTo = (loop: Loop, move: Move, at: number): Loop => ({
 ...loop, holder: move.holder ?? loop.holder, ownerRole: move.ownerRole ?? loop.ownerRole, acknowledgedAt: null, acknowledgedByRole: null, dueBy: at + move.spanMs
});

/** One thing the clock did to a concern, at the deadline it happened at. */
export type Step = { readonly kind: 'escalated' | 'exhausted'; readonly at: number; readonly loop: Loop; readonly skipped: readonly Skip[] };

/* Every deadline that has passed is acted on at its own moment, not at the moment somebody looked: a post
   is on duty or not at the time the concern reached it, and a clock that jumped an hour must not ask the
   desk at a quarter past ten about a concern that reached it at five to. */
export function settle(loop: Loop, now: number): Step[] {
 const steps: Step[] = [];
 let current = loop;
 while (current.closedAt === null && current.acknowledgedAt === null && current.exhaustedAt === null && current.dueBy <= now) {
  const at = current.dueBy;
  const move = nextHolder(current, at);
  current = move.holder ? movedTo(current, move, at) : { ...current, exhaustedAt: at };
  steps.push({ kind: move.holder ? 'escalated' : 'exhausted', at, loop: current, skipped: move.skipped });
 }
 return steps;
}

/** What a panic heard at a moment alerts: every post on duty in the rota in force, at once, and every post passed over. It reads no minutes. */
export function everyPostOnDuty(rota: KeptRota, at: number): { readonly alerted: readonly Post[]; readonly skipped: readonly Skip[] } {
 const alerted = rota.posts.filter(post => post.role !== null && onDuty(rota, post.id, at));
 const skipped = rota.posts.filter(post => !alerted.includes(post)).map((post): Skip => ({ post: post.id, because: post.role === null ? 'no-role' : 'off-duty' }));
 return { alerted, skipped };
}

/* Exhausted first, longest exhausted at the top; then what nobody has acknowledged, nearest deadline
   first; then what somebody has. Closed concerns are not read. */
const groups: readonly ((loop: Loop) => boolean)[] = [loop => loop.exhaustedAt !== null, loop => loop.acknowledgedAt === null, () => true];
const groupOf = (loop: Loop) => groups.findIndex(inGroup => inGroup(loop));

export function towerOrder(loops: readonly Loop[]): Loop[] {
 return loops.filter(isOpen).sort((a, b) => {
  const byGroup = groupOf(a) - groupOf(b);
  if (byGroup) return byGroup;
  const byTime = groupOf(a) === 0 ? a.exhaustedAt! - b.exhaustedAt! : a.dueBy - b.dueBy;
  return byTime || a.openedAt - b.openedAt;
 });
}
