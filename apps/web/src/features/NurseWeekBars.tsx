import { weeks } from '../lib/earnings';
import '../surface/nurse-identity.css';

/* The weeks on the earnings register as bars of visits, oldest first so the bars run the way time does;
   the week in progress is marked as still being added to, because an unfinished week drawn as the last of
   a series reads as a fall. The count on each bar is the register's own; nothing is a target or an
   average. Its own small module so the route map's Week view and Reports share it without either pulling in the
   other's screen. */
export function WeekBars() {
 const rows = [...weeks].sort((a, b) => a.ends.localeCompare(b.ends));
 const most = Math.max(1, ...rows.map(week => week.visits));
 return <>
  <ol className="nurse-route__weeks" aria-label="Visits each week">{rows.map((week, i) => <li key={week.id}>
   <span className="nurse-route__week-bar" aria-hidden="true"><i style={{ ['--share' as string]: week.visits / most, ['--i' as string]: i }}/></span>
   <strong>{week.visits}</strong>
   <small>{week.state === 'accruing' ? 'This week, so far' : `Week to ${new Date(week.ends).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`}</small>
  </li>)}</ol>
  <p className="nurse-route__note">The visits on each week of your earnings register, counted from its lines. Nothing here is a target or an average.</p>
 </>;
}
