import { checkById, inDays, inMonths, isoDate, recordEvent, roleById, type CheckRecord, type CheckState, type VettingEvent, type VettingSubject } from './vetting';

/* Fictional parties, one per interesting state, so every refusal in the module can be seen rather
   than described. Nobody here is real; no credential here is valid anywhere.

   Dates are written relative to today so the preview never goes stale, and so "this clearance
   lapsed nine days ago" stays true whenever the demo is opened. */

const reviewers = ['M. Sithole · Clinical Governance', 'T. van Wyk · Compliance', 'P. Mabaso · Clinical Director'];
type Override = Partial<CheckRecord> & { state?: CheckState };
type Seed = {
 id: string; name: string; roleId: string; reference: string; zone?: string; scope?: string[];
 suspended?: boolean; suspendedReason?: string; declined?: boolean; declinedReason?: string; appealed?: boolean;
 /* Only the exceptions are written out. Everything unnamed is verified and in date. */
 overrides?: Record<string, Override>;
};

/* A verified check carries a real decision date and, where the check renews, a real expiry — so
   the countdown in the console is arithmetic rather than a label somebody typed.

   The decision date is held against the check's own cadence. Spreading every decision four to eight
   months back reads well until it meets a check that renews every six: an access role decided eight
   months ago is lapsed the moment it is written, and a fixture that suspends the reviewers by
   accident makes the console impossible to demonstrate. A check is decided at most two fifths of
   the way through its own cycle. */
function defaultRecord(roleId: string, checkId: string, index: number): CheckRecord {
 const check = checkById(roleId, checkId)!;
 const spread = 4 + (index % 5);
 const decidedOn = inMonths(-(check.renewMonths ? Math.min(spread, Math.max(1, Math.floor(check.renewMonths * 0.4))) : spread));
 const record: CheckRecord = {
  checkId, state: 'verified', decidedOn, decidedBy: reviewers[index % reviewers.length], evidence: check.evidence
 };
 if (check.renewMonths) {
  const from = new Date(`${decidedOn}T00:00:00Z`);
  from.setMonth(from.getMonth() + check.renewMonths);
  record.expiresOn = isoDate(from);
 }
 if (check.risk === 'high') record.secondedBy = reviewers[(index + 1) % reviewers.length];
 return record;
}
function build(seed: Seed): VettingSubject {
 const checks = roleById(seed.roleId)?.checks ?? [];
 const records = checks.map((c, i) => {
  const base = defaultRecord(seed.roleId, c.id, i + seed.id.length);
  const override = seed.overrides?.[c.id];
  if (!override) return base;
  /* An override that only says "outstanding" should not keep the decision fields of a check
     nobody has decided. */
  const cleared = override.state && override.state !== 'verified'
   ? { checkId: c.id, state: override.state } as CheckRecord
   : base;
  return { ...cleared, ...override };
 });
 return { ...seed, records };
}

export const seededSubjects: VettingSubject[] = [
 build({ id: 'N-201', name: 'Sister Thandeka Zulu', roleId: 'nurse', reference: 'SANC 20014477', zone: 'Soweto', scope: ['Chronic care', 'Wound care'],
  overrides: { 'police-clearance': { state: 'verified', expiresOn: inDays(21) } } }),                                  // renewal due, still dispatchable
 build({ id: 'N-202', name: 'Sister Boitumelo Nkosi', roleId: 'nurse', reference: 'SANC 20019902', zone: 'Randburg', scope: ['Maternal & child'],
  overrides: { 'police-clearance': { state: 'in-review' }, references: { state: 'submitted' }, 'kit-training': { state: 'outstanding' }, 'popia-training': { state: 'outstanding' } } }),
 build({ id: 'N-203', name: 'Brother Lwazi Mahlangu', roleId: 'nurse', reference: 'SANC 20007731', zone: 'Tembisa', scope: ['Post-operative', 'Phlebotomy'],
  overrides: { 'sanc-registration': { secondedBy: undefined }, 'kit-training': { state: 'in-review' } } }),             // waiting on a second reviewer
 build({ id: 'N-204', name: 'Sister Ayanda Dube', roleId: 'nurse', reference: 'SANC 20022145', zone: 'Soweto', scope: ['Elderly care'],
  overrides: { 'police-clearance': { state: 'verified', expiresOn: inDays(-9) } } }),                                   // lapsed: suspended automatically
 build({ id: 'N-205', name: 'Sister Naledi Mokoena', roleId: 'nurse', reference: 'SANC 20016688', zone: 'Rosebank', scope: ['Wound care', 'Chronic care'] }),
 build({ id: 'N-206', name: 'Sister Palesa Khumalo', roleId: 'nurse', reference: 'SANC 20011203', zone: 'Soweto', scope: ['Wound care', 'Maternal & child'] }),
 build({ id: 'N-207', name: 'Sister Refilwe Sithole', roleId: 'nurse', reference: 'SANC 20018844', zone: 'Randburg', scope: ['Chronic care', 'Paediatric'] }),
 build({ id: 'N-208', name: 'Brother Sipho Ndlovu', roleId: 'nurse', reference: 'SANC 20013390', zone: 'Melville', scope: ['Post-operative', 'Chronic care'],
  overrides: { indemnity: { state: 'verified', expiresOn: inDays(33) } } }),
 build({ id: 'N-209', name: 'Sister Zanele Mkhize', roleId: 'nurse', reference: 'SANC 20024401', zone: 'Alexandra', scope: ['Chronic care'],
  declined: true, declinedReason: 'Two clinical references could not be confirmed with the institutions named.', appealed: true,
  overrides: { references: { state: 'declined', note: 'Referee could not confirm the applicant worked in the unit stated.' } } }),
 build({ id: 'L-301', name: 'Sister Karabo Mothibi', roleId: 'locum', reference: 'SANC 20016688', zone: 'Roodepoort', scope: ['Chronic care', 'Paediatric'] }),
 build({ id: 'L-302', name: 'Sister Nokuthula Baloyi', roleId: 'locum', reference: 'SANC 20026117', zone: 'Midrand', scope: ['Wound care'],
  overrides: { 'shift-eligibility': { state: 'in-review', note: 'Declared 44 hours a week elsewhere. Clinical Director reviewing.' } } }),
 build({ id: 'D-401', name: 'Dr Ayanda Dlamini', roleId: 'doctor', reference: 'HPCSA MP0483217', scope: ['General practice', 'Telemedicine'] }),
 build({ id: 'D-402', name: 'Dr Sanjay Naidoo', roleId: 'doctor', reference: 'HPCSA MP0559104', scope: ['General practice'],
  overrides: { 'hpcsa-registration': { state: 'verified', expiresOn: inDays(-4) } } }),                                 // lapsed: the queue refuses the signature
 build({ id: 'D-403', name: 'Dr Lerato Khumalo', roleId: 'doctor', reference: 'HPCSA MP0612885', scope: ['Family medicine'],
  overrides: { 'prescribing-authority': { state: 'in-review' }, cpd: { state: 'submitted' } } }),
 build({ id: 'P-501', name: 'Rosebank Community Pharmacy', roleId: 'pharmacy', reference: 'SAPC Y041882', zone: 'Rosebank' }),
 build({ id: 'P-502', name: 'Diepkloof Family Pharmacy', roleId: 'pharmacy', reference: 'SAPC Y058317', zone: 'Soweto',
  overrides: { 'responsible-pharmacist': { state: 'in-review', note: 'Named pharmacist resigned. A replacement has been proposed.' }, 'cold-chain': { state: 'submitted' } } }),
 build({ id: 'B-601', name: 'Highveld Pathology', roleId: 'laboratory', reference: 'SANAS M0521', zone: 'Parktown' }),
 build({ id: 'B-602', name: 'Vaal Diagnostics', roleId: 'laboratory', reference: 'SANAS M0744', zone: 'Vereeniging',
  overrides: { 'iso-15189': { state: 'verified', expiresOn: inDays(-31) } } }),                                         // lapsed: results stay held
 build({ id: 'C-701', name: 'Mandla Nkuna', roleId: 'courier', reference: 'PDP 401220118834', zone: 'Johannesburg' }),
 build({ id: 'C-702', name: 'Johannes Pretorius', roleId: 'courier', reference: 'PDP 401993220117', zone: 'Ekurhuleni',
  overrides: { 'cold-chain-training': { state: 'outstanding' }, vehicle: { state: 'in-review' } } }),
 build({ id: 'O-801', name: 'Kagiso Molefe', roleId: 'operator', reference: 'Staff 0114', zone: 'Control Tower' }),
 build({ id: 'O-802', name: 'Michelle Fourie', roleId: 'operator', reference: 'Staff 0139', zone: 'Control Tower',
  overrides: { 'escalation-training': { state: 'verified', expiresOn: inDays(12) } } }),
 build({ id: 'A-901', name: 'Thandi van Wyk', roleId: 'admin', reference: 'Staff 0102' }),
 build({ id: 'A-902', name: 'Bongani Mthembu', roleId: 'admin', reference: 'Staff 0147',
  overrides: { 'access-role': { state: 'in-review', note: 'Requested access to the clinical queue. Least privilege being reassessed.' } } }),
 build({ id: 'E-011', name: 'Ubuntu Logistics (Pty) Ltd', roleId: 'employer', reference: 'CIPC 2019/443871/07',
  overrides: { 'operator-agreement': { state: 'in-review' }, 'aggregate-only': { state: 'submitted' } } }),
 build({ id: 'E-012', name: 'Highveld Mining Services', roleId: 'employer', reference: 'CIPC 2014/118203/07' }),
 build({ id: 'S-021', name: 'Themba Molefe', roleId: 'sponsor', reference: 'Sponsor 0231',
  overrides: { 'recipient-consent': { state: 'in-review', note: 'Waiting for the recipient to confirm in their own account.' } } }),
 build({ id: 'S-022', name: 'Zodwa Radebe', roleId: 'sponsor', reference: 'Sponsor 0244' }),
 build({ id: 'G-031', name: 'Nomsa Molefe', roleId: 'guardian', reference: 'Guardian 0118',
  overrides: { 'legal-authority': { state: 'submitted', note: 'Unabridged birth certificate uploaded; awaiting document check.' }, relationship: { state: 'outstanding' } } }),
 build({ id: 'G-032', name: 'Elizabeth Sithole', roleId: 'guardian', reference: 'Guardian 0126' }),
 build({ id: 'T-041', name: 'Thuso Corner · Diepkloof', roleId: 'corner', reference: 'Site 0007', zone: 'Soweto' }),
 build({ id: 'T-042', name: 'Thuso Corner · Ivory Park', roleId: 'corner', reference: 'Site 0011', zone: 'Tembisa',
  overrides: { 'privacy-layout': { state: 'declined', note: 'The consulting room opens onto the queue. Re-inspection after alterations.' }, 'waste-disposal': { state: 'submitted' } } })
];

export const subjectsByRole = (roleId: string) => seededSubjects.filter(s => s.roleId === roleId);
export const subjectById = (id: string) => seededSubjects.find(s => s.id === id);
/* The named nurses the dispatch board and the clinical queue already use, so gating there is the
   same record as the one the console decides on rather than a second list that agrees by luck. */
export const subjectByName = (name: string) => seededSubjects.find(s => s.name === name);

/* A short history so the audit view has something to show on open. It is built with the same
   append-only helper the console uses, in the order the events happened. */
export const seededLog: VettingEvent[] = [
 { subjectId: 'N-204', name: 'Sister Ayanda Dube', roleId: 'nurse', checkId: 'police-clearance', kind: 'lapsed' as const, actor: 'System · scheduled re-vetting', note: 'SAPS clearance passed its renewal date. Removed from dispatch automatically.', at: inDays(-9) + 'T04:00:00.000Z' },
 { subjectId: 'B-602', name: 'Vaal Diagnostics', roleId: 'laboratory', checkId: 'iso-15189', kind: 'lapsed' as const, actor: 'System · scheduled re-vetting', note: 'SANAS accreditation expired. Result release withdrawn; held results stay held.', at: inDays(-31) + 'T04:00:00.000Z' },
 { subjectId: 'D-402', name: 'Dr Sanjay Naidoo', roleId: 'doctor', checkId: 'hpcsa-registration', kind: 'lapsed' as const, actor: 'System · scheduled re-vetting', note: 'HPCSA registration not renewed. Sign-off withdrawn.', at: inDays(-4) + 'T04:00:00.000Z' },
 { subjectId: 'N-209', name: 'Sister Zanele Mkhize', roleId: 'nurse', checkId: 'references', kind: 'declined' as const, actor: 'P. Mabaso · Clinical Director', evidence: 'Two named referees', note: 'Referee could not confirm the applicant worked in the unit stated.', at: inDays(-16) + 'T09:24:00.000Z' },
 { subjectId: 'N-209', name: 'Sister Zanele Mkhize', roleId: 'nurse', kind: 'appealed' as const, actor: 'Sister Zanele Mkhize', note: 'Applicant states the unit was renamed. New referee details supplied.', at: inDays(-11) + 'T15:02:00.000Z' },
 { subjectId: 'T-042', name: 'Thuso Corner · Ivory Park', roleId: 'corner', checkId: 'privacy-layout', kind: 'declined' as const, actor: 'T. van Wyk · Compliance', evidence: 'Floor plan and inspection sign-off', note: 'The consulting room opens onto the queue. Re-inspection after alterations.', at: inDays(-6) + 'T11:40:00.000Z' },
 { subjectId: 'N-201', name: 'Sister Thandeka Zulu', roleId: 'nurse', checkId: 'sanc-registration', kind: 'seconded' as const, actor: 'M. Sithole · Clinical Governance', note: 'Second reviewer agreed. Registration current on the SANC register.', at: inDays(-3) + 'T08:15:00.000Z' }
].reduce((log, e) => recordEvent(log, { ...e, subjectName: e.name }), [] as VettingEvent[]);
