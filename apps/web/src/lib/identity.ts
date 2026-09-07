/* South African ID numbers carry a Luhn check digit. Validating it locally means we can show a
   real "that doesn't look right" state in the preview without sending anything anywhere. It lives
   in lib rather than in a screen because sign-up and vetting both have to agree about it. */
export function validateSaId(value: string): { ok: boolean; reason?: string; birth?: string } {
 const digits = value.replace(/\s/g, '');
 if (!/^\d{13}$/.test(digits)) return { ok: false, reason: 'A South African ID number has 13 digits.' };
 const [yy, mm, dd] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].map(Number);
 if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { ok: false, reason: 'The date of birth in this number is not valid.' };
 let sum = 0;
 for (let i = 0; i < 13; i++) {
  let d = Number(digits[12 - i]);
  if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
  sum += d;
 }
 if (sum % 10 !== 0) return { ok: false, reason: 'That number fails its check digit. Please re-enter it.' };
 const year = yy > 25 ? 1900 + yy : 2000 + yy;
 return { ok: true, birth: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${year}` };
}
