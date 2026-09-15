import { useEffect, useState } from 'react';
import contract from '../../../../packages/catalog/vouchers.json' with { type: 'json' };
import type { Money } from '../../../../packages/engines/src/money/domain/ledger.ts';
import type { Redeemed } from '../lib/vouchers';
import { money } from '../lib/catalog';
import { longDateOf } from '../lib/scheduling';
import { voucherExpiryYearsNow } from '../lib/settings';
import './voucher-checkout.css';

/* A voucher at the booking's review step: one line that opens into a code field, and what the voucher paid.
 *
 * Collapsed by default, because most people booking have no voucher and the review step is where they check the
 * address and the price. Opening it fetches the ledger and the voucher rules on a dynamic import, issues the simulated
 * shop's voucher into this booking's ledger, and says plainly that a simulated shop issued it. The amount taken is as
 * much as the voucher holds up to what is owed, and every refusal is the redemption route's own sentence.
 *
 * What is still owed is handed back to the booking, which takes that amount — or, when a voucher covered the visit,
 * takes nothing and says so. A changed visit is a different payable, so what this panel showed is cleared with it.
 */
export const voucherWords = contract.screen;
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

export function VoucherAtCheckout({ reference, serviceId, ledger, onOwed }: {
 reference: string; serviceId: string; ledger: { current: Money | null }; onOwed: (owedCents: number | null) => void;
}) {
 const [open, setOpen] = useState(false);
 const [issued, setIssued] = useState<{ code: string; expiresOn: string; service: string } | { refused: string } | null>(null);
 const [code, setCode] = useState('');
 const [result, setResult] = useState<Redeemed | null>(null);
 const [attempt, setAttempt] = useState(0);
 const [busy, setBusy] = useState(false);
 useEffect(() => { setResult(null); onOwed(null); }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

 const opened = async () => {
  setOpen(true);
  const [{ bookingLedger }, { previewVoucher }] = await Promise.all([import('../lib/money'), import('../lib/vouchers')]);
  ledger.current ??= bookingLedger(voucherExpiryYearsNow);
  setIssued(previewVoucher(ledger.current));
 };
 const redeem = async () => {
  if (busy || !code.trim()) return;
  setBusy(true);
  try {
   const [{ bookingLedger }, { redeemAtCheckout }] = await Promise.all([import('../lib/money'), import('../lib/vouchers')]);
   ledger.current ??= bookingLedger(voucherExpiryYearsNow);
   const next = attempt + 1;
   setAttempt(next);
   const answer = redeemAtCheckout(ledger.current, { reference, serviceId, code, attempt: next });
   setResult(answer);
   if (answer.refused === undefined) onOwed(answer.owedCents);
  } finally {
   setBusy(false);
  }
 };

 if (!open) return <button type="button" className="text-button voucher-open" onClick={() => { void opened(); }}>{voucherWords.heading}</button>;
 return <div className="voucher-checkout">
  <h4>{voucherWords.heading}</h4>
  <p className="helper">{voucherWords.intro}</p>
  {issued && ('refused' in issued ? <p className="voucher-refused" role="alert">{issued.refused}</p>
   : <p className="voucher-issued">{fill(voucherWords.issuedInPreview, { code: issued.code, service: issued.service, expires: longDateOf(issued.expiresOn) })}</p>)}
  <form className="voucher-row" onSubmit={e => { e.preventDefault(); void redeem(); }}>
   <label htmlFor="voucher-code">{voucherWords.codeLabel}</label>
   <input id="voucher-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false}/>
   <button className="secondary" type="submit" disabled={busy || !code.trim()} aria-busy={busy}>{voucherWords.redeem}</button>
  </form>
  {result?.refused !== undefined && <p className="voucher-refused" role="alert">{result.refused}</p>}
  {result && result.refused === undefined && <>
   <p className="voucher-redeemed" role="status">{result.owedCents === 0 ? voucherWords.covered
    : fill(voucherWords.redeemed, { amount: money(result.redeemedCents / 100), left: money(result.remainingCents / 100), expires: longDateOf(result.expiresOn) })}</p>
   <div className="review-line"><span>{voucherWords.owed}</span><strong>{money(result.owedCents / 100)}</strong></div>
  </>}
  <p className="helper">{voucherWords.never}</p>
 </div>;
}
