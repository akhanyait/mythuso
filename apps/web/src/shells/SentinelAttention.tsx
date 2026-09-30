import { rungOf, sentinelContract } from '../../../../packages/engines/src/safety/domain/sentinel.ts';
import { useSentinel } from '../lib/sentinel';
import { fill } from '../../../../packages/engines/src/safety/domain/rules.ts';
import { AttentionItems, type Attention } from './StaffChrome';

/* The Sentinel half of the staff shell's band: a tier raised by hand into this workspace's queue, in the
 * contract's words — the rung's label, "Raised at tier {rung} at {time}.", and who the rung says is told.
 * A nurse's queue is tier two, "Nurse review"; tier three is Core's concern, owned by a doctor, so that is
 * the doctor's. It is its own module so that the shell fetches it only after lib/sentinel has already
 * been fetched for a screen (StaffShell.tsx says when), and a first paint never waits for Sentinel. */
const say = sentinelContract.screens.sentinel;
const queueOf = { nurse: 'nurse-queue', doctor: 'core-loop' } as const;
const handledOn = { nurse: 'Thuso Kit', doctor: 'Patient context' } as const;
const when = (at: number) => new Date(at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' });

export default function SentinelAttention({ workspace, section, go }: { workspace: 'nurse' | 'doctor'; section: string; go: (id: string) => void }) {
 const store = useSentinel();
 const items: Attention[] = [...store.deviations].filter(d => d.toldCode === queueOf[workspace]).sort((a, b) => b.raisedAt - a.raisedAt)
  .map(d => ({ key: d.deviationRef, variant: 'warning', title: rungOf(d.rung)?.label ?? say.heading, to: handledOn[workspace], hideOn: [handledOn[workspace]],
               body: `${fill(say.raised, { rung: String(d.rung), time: when(d.raisedAt) })} ${rungOf(d.rung)?.whoIsTold ?? ''}`.trim() }));
 return <AttentionItems items={items} section={section} go={go}/>;
}
