import { useEffect, useState, type ReactNode } from 'react';
import { CloudOff, LockKeyhole, RefreshCw, SearchX, TriangleAlert } from 'lucide-react';
/* Every screen that will one day talk to a clinical, payment or device integration needs
   these five states designed, not improvised at integration time.
 *
 * There used to be a StatePicker beside most of them — a collapsed "Preview states" control that
 * let a reviewer force a screen into offline or permission-denied. It was a development tool
 * sitting in the product, on screens whose state could only ever be `ready` because there is no
 * service behind them to fail. The states stay, designed and shared; the switch that faked them
 * is gone, and a screen now carries a state block only where something can genuinely answer. */
export const loadStates = ['ready', 'loading', 'error', 'offline', 'denied'] as const;
export type LoadState = typeof loadStates[number];
export const stateLabels: Record<LoadState, string> = { ready: 'Loaded', loading: 'Loading', error: 'Service error', offline: 'Offline', denied: 'Permission denied' };
/* Offline is the one of the five that is true or false right now, on this device, without any
   service existing to ask — so it is the one state a screen may drive from a real condition today
   rather than from a picker. `navigator.onLine` answers on first paint and the two events answer
   afterwards, and a South African commuter losing signal between Rosebank and Sandton is not an
   edge case worth waiting for an integration to design for. */
export function useOffline(): boolean {
 const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
 useEffect(() => {
  const answer = () => setOffline(navigator.onLine === false);
  window.addEventListener('online', answer);
  window.addEventListener('offline', answer);
  answer();
  return () => { window.removeEventListener('online', answer); window.removeEventListener('offline', answer); };
 }, []);
 return offline;
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
 return <div className="skeleton" role="status" aria-live="polite" aria-label="Loading care information">
  {Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}><span className="skeleton-icon"/><span className="skeleton-lines"><i style={{ width: `${72 - i * 9}%` }}/><i style={{ width: `${48 - i * 6}%` }}/></span></div>)}
  <span className="visually-hidden">Loading…</span>
 </div>;
}
type Props = { state: LoadState; subject: string; permission?: string; onRetry?: () => void; children: ReactNode };
export function StateBlock({ state, subject, permission = 'device access', onRetry, children }: Props) {
 if (state === 'ready') return <>{children}</>;
 if (state === 'loading') return <Skeleton/>;
 const icon = state === 'offline' ? <CloudOff size={24}/> : state === 'denied' ? <LockKeyhole size={24}/> : <TriangleAlert size={24}/>;
 const heading = state === 'offline' ? 'You’re offline' : state === 'denied' ? 'We need your permission first' : 'We couldn’t load this just now';
 const body = state === 'offline'
  ? `${subject} needs a connection. What you’ve already opened stays available, and nothing you entered has been lost.`
  : state === 'denied'
   ? `MyThuso cannot show ${subject.toLowerCase()} until you allow ${permission}. You can change your mind at any time, and declining never blocks a visit.`
   : `${subject} did not load, and nothing was lost — what you entered is still here. Try again in a moment; if it keeps failing, the care team is told without you having to report it.`;
 return <div className={`state-block ${state}`} role={state === 'error' ? 'alert' : 'status'}>
  <span className="state-icon">{icon}</span>
  <div><h3>{heading}</h3><p>{body}</p></div>
  {onRetry && <button className="secondary" onClick={onRetry}>{state === 'denied' ? <><LockKeyhole size={15}/>Review permission</> : <><RefreshCw size={15}/>Try again</>}</button>}
 </div>;
}
export function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
 return <div className="state-block empty" role="status">
  <span className="state-icon"><SearchX size={24}/></span>
  <div><h3>{title}</h3><p>{body}</p></div>
  {action && <button className="secondary" onClick={onAction}>{action}</button>}
 </div>;
}
