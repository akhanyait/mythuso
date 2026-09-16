/* The four lists a nurse workspace, a locum or a dispatcher reads rather than acts on: her shifts, the
 * services offered where a visit would be, the open locum shifts she may pick up, and the rural circuits
 * a nurse or a dispatcher may read. Wave 2 declared all four; nothing answered them until now.
 *
 * PURE, LIKE EVERY OTHER FILE HERE. Each function is handed `now` and the settings already read, and
 * answers with data alone — never a refusal. Whether a caller may see what it returns, and what happens
 * when there is nothing to see, is engine.ts's thin binding to do, exactly as every other route's refusal
 * is decided at the binding and rendered by the runtime from the route's own contract.
 *
 * SHIFTS ARE ARITHMETIC, NOT A SECOND ROSTER. packages/catalog/roster.json's shift block already says a
 * shift is computed from the hours the product offers — half an hour before the first slot
 * packages/catalog/scheduling.json sells to half an hour after the last slot plus the longest visit
 * packages/catalog/services.json prices — rather than a pair of times typed here to drift from either.
 * This file is the one place that arithmetic is run for a nurse rather than only justified in prose.
 *
 * LOCUM SHIFTS ARE HONESTLY EMPTY. Nothing in the catalog models a hospital, a care home or an open shift
 * at either: packages/catalog/roster.json's nine nurses are Care's whole simulated workforce, and every
 * one of them is seeded with the role id "nurse". Inventing a ward and a handful of shifts to fill this
 * list would be exactly the overstatement CLAUDE.md refuses — a screen that could be mistaken for the
 * real thing. So the list is always empty, and the only thing this route still does is the one thing it
 * was declared for: refuse a locum whose Trust Score is not current, on the same standing Care already
 * checks before offering her a visit (./matching.ts).
 *
 * CIRCUITS ARE NAMED AND DRAFT. Nothing modelled a rural round either, so packages/catalog/care.json now
 * names two — Tembisa and Alexandra, the two suburbs its own roster already places nurses in and outside
 * phase one's coverage — each published: false. A circuit list with nothing published is refused whole
 * by the binding, in the contract's own words, rather than answered with an empty list that would read as
 * "there are none" when the truer sentence is "nobody has agreed to run one yet". */
import roster from '../../../../catalog/roster.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };
import services from '../../../../catalog/services.json' with { type: 'json' };
import care from '../../../../catalog/care.json' with { type: 'json' };
import geography from '../../../../catalog/geography.json' with { type: 'json' };
import { instantAt } from './clock.ts';
import { requirementFor, type CareContract } from './contract.ts';
import { rolesFor } from './matching.ts';

/* ── Shifts ───────────────────────────────────────────────────────────────────────────────────────── */

export type ShiftRow = {
 readonly shiftRef: string;
 readonly clinicianRef: string;
 readonly date: string;
 readonly startsAt: string;
 readonly endsAt: string;
 readonly zone: string;
};

const OFFERED_SERVICES = services.filter(s => s.phase <= care.seedPhase);
const LONGEST_VISIT_MINUTES = Math.max(...OFFERED_SERVICES.map(s => s.duration));

const minutesOf = (hhmm: string): number => {
 const [h, m] = hhmm.split(':').map(Number);
 return h! * 60 + m!;
};
const hhmmOf = (totalMinutes: number): string => {
 const clamped = ((totalMinutes % 1440) + 1440) % 1440;
 return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

const FIRST_SLOT = scheduling.offer.slots[0]!;
const LAST_SLOT = scheduling.offer.slots.at(-1)!;
const OPENS = hhmmOf(minutesOf(FIRST_SLOT) - roster.shift.startsBeforeFirstSlotMinutes);
const CLOSES = hhmmOf(minutesOf(LAST_SLOT) + LONGEST_VISIT_MINUTES + roster.shift.endsAfterLastVisitMinutes);

const dayIso = (at: Date, timezone: string): string =>
 new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** Every shift the product's own hours produce, for every nurse on the roster, over the days it schedules
    visits for. A dispatcher's read and a nurse's own are the same list; which rows a caller may keep is
    engine.ts's to decide, on the caller reference rather than on this data. */
export function shiftsFor(now: Date): readonly ShiftRow[] {
 const rows: ShiftRow[] = [];
 for (let offset = scheduling.offer.firstDayOffset; offset < scheduling.offer.firstDayOffset + scheduling.offer.days; offset++) {
  const day = new Date(now.getTime() + offset * 86_400_000);
  const date = dayIso(day, scheduling.timezone);
  for (const nurse of roster.nurses) {
   rows.push({
    shiftRef: `shift-${nurse.id}-${date}`,
    clinicianRef: nurse.id,
    date,
    startsAt: instantAt(now, offset, OPENS, scheduling.timezone),
    endsAt: instantAt(now, offset, CLOSES, scheduling.timezone),
    zone: nurse.zone
   });
  }
 }
 return rows;
}

/* ── Services ─────────────────────────────────────────────────────────────────────────────────────── */

export type ServiceListRow = {
 readonly serviceId: string;
 readonly name: string;
 readonly description: string;
 readonly price: number;
 readonly nurseShare: number;
 readonly duration: number;
 readonly category: string;
 readonly icon: string;
 readonly roles: readonly string[];
};

/** Every service phase one actually offers, with the roles it may be offered to as they stand now —
    the scope settings three of them read from may be changed by an admin, so this is read once per call
    rather than cached. */
export function servicesFor(contract: CareContract, rolesInForce: Readonly<Record<string, readonly string[]>>): readonly ServiceListRow[] {
 return OFFERED_SERVICES.map(s => {
  const requirement = requirementFor(contract, s.id);
  const roles = requirement ? rolesFor(requirement, rolesInForce) : [];
  return { serviceId: s.id, name: s.name, description: s.description, price: s.price, nurseShare: s.nurseShare, duration: s.duration, category: s.category, icon: s.icon, roles };
 });
}

/** A zone geography.json holds, by its id or its name — the same identity zoneAt() in engine.ts resolves a
    visit's own zone by, so a service list and an offer never disagree about what "covered" means. */
export const isZoneCovered = (zoneId: string): boolean => geography.zones.some(z => z.id === zoneId || z.name === zoneId);

/* ── Locum shifts ─────────────────────────────────────────────────────────────────────────────────── */

/** Always empty: see the file header. Kept as a function, not a constant, so a hospital or a care home
    that later has real shifts to offer is one change here and not a rewrite of the route. */
export function openLocumShifts(): readonly Record<string, never>[] {
 return [];
}

/* ── Circuits ─────────────────────────────────────────────────────────────────────────────────────── */

export type CircuitRow = { readonly circuitId: string; readonly name: string; readonly zone: string; readonly published: boolean };

/** Every circuit packages/catalog/care.json names, published or not. engine.ts keeps only the published
    ones, and refuses the read whole when there are none — see the file header for why that is a refusal
    and not an empty list. */
export function circuitsFor(): readonly CircuitRow[] {
 return care.circuits.map(c => ({ circuitId: c.id, name: c.name, zone: c.zone, published: c.published }));
}
