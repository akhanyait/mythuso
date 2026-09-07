import schema from '../../../../packages/catalog/records.json';
import { can, roleById, type Decision, type VettingSubject } from './vetting';

/* The record contract, read the way lib/catalog.ts reads the service catalogue: six master areas,
   three sensitivity classes, the eight-item navigation, 42 record types with their FHIR resource
   and the capability each is gated by, one standardised consultation and one summary card. It is
   held in packages/catalog/records.json so a clinician-facing file, a consultation form and a
   household record cannot quietly disagree about what a record is or who may open it.

   Two things here are not in the JSON, and both matter.

   The first is that sensitivity is classified twice. A record *type* carries a class — a
   consultation is clinical, social support is protected — and that class is a floor rather than a
   ceiling. records.json says so itself, in the chronic-condition entry: "HIV and mental-health
   conditions are protected and are held separately." So an individual entry may raise its own
   class above its type's, and everything downstream resolves the higher of the two.

   The second is that vetting is not the only gate on a protected category. vetting.json's own
   refusal says it plainly — "A protected category is released by the patient, entry by entry. It
   is never opened by a scope, however senior the nurse." A cleared nurse therefore passes
   can(subject, 'view-protected-record') and still sees nothing, because the patient has released
   nothing to her. The capability says the party is fit to be trusted with the category; the
   release says this patient trusted this party with this entry.

   Fictional patients, fictional numbers, no record reached from anywhere. */

export type SensitivityId = 'routine' | 'clinical' | 'protected';
export type Area = typeof schema.areas[number];
export type Sensitivity = { id: SensitivityId; name: string; detail: string; guardianDefault: string; summaryHeader: string; categories?: string[] };
export type RecordType = { id: string; name: string; area: string; fhir: string; sensitivity: SensitivityId; gatedBy: string[]; summary: string };
export type ConsultationSection = { id: string; name: string; required: boolean; note?: string; gatedBy?: string };
export type SoapStep = typeof schema.consultation.soap[number];

export const areas: Area[] = schema.areas;
export const sensitivities: Sensitivity[] = schema.sensitivity as Sensitivity[];
/* Eight tabs, in the contract's order. The 42 record types are the data model; this is the
   navigation, and the two are deliberately not the same length. */
export const navigation: string[] = schema.navigation;
export const recordTypes: RecordType[] = schema.records as RecordType[];
export const consultationSections: ConsultationSection[] = schema.consultation.sections as ConsultationSection[];
export const consultationWhy: string = schema.consultation.why;
export const soap: SoapStep[] = schema.consultation.soap;
export const summaryCard = schema.summaryCard;

export const areaById = (id: string) => areas.find(a => a.id === id);
export const recordById = (id: string) => recordTypes.find(r => r.id === id);
export const sensitivityById = (id: SensitivityId) => sensitivities.find(s => s.id === id)!;
export const recordsInArea = (areaId: string) => recordTypes.filter(r => r.area === areaId);
export const protectedTypes = recordTypes.filter(r => r.sensitivity === 'protected');
/* The categories the header and the household summary refuse to name, held as the contract's own
   list rather than as prose in a component: a category added to records.json is named on every
   screen that names them without anybody editing one. The protected record types are folded in as
   well, because a record type is a category the moment it is the only thing in it. It lives here
   rather than in a feature file so both readers take the same list — lib/records.ts imports no
   feature, so there is nothing to cycle back on. */
export const protectedCategories: string[] = [...new Set([
 ...(sensitivityById('protected').categories ?? []),
 ...protectedTypes.map(r => r.name)
])];

/* ---- Sensitivity ------------------------------------------------------------------------ */
const rank: Record<SensitivityId, number> = { routine: 0, clinical: 1, protected: 2 };
/* An entry is at least as sensitive as its type, and may be more. Nothing may be less. */
export function sensitivityOf(typeId: string, entry?: SensitivityId): SensitivityId {
 const type = recordById(typeId)?.sensitivity ?? 'clinical';
 return !entry || rank[entry] <= rank[type] ? type : entry;
}
export type Sensitive = { typeId: string; sensitivity?: SensitivityId; releasedTo?: string[] };
export const isProtected = (item: Sensitive) => sensitivityOf(item.typeId, item.sensitivity) === 'protected';

/* ---- Gating -----------------------------------------------------------------------------
   A record type names its capabilities. Any one of them opens it: the medication tab is reached
   through view-clinical-record by a doctor and through dispense by a pharmacy, and vetting.json
   says as much — "A pharmacy sees the prescription and the allergies that bear on filling it."
   When every route is refused the first refusal is the one shown, because the first capability
   listed is the one the reader was most likely reaching for. */
export function canAny(subject: VettingSubject, capabilities: string[]): Decision {
 const decisions = capabilities.map(c => can(subject, c));
 return decisions.find(d => d.allowed) ?? decisions[0] ?? { allowed: false, reason: 'No capability governs this.', blockedBy: [] };
}
export function canOpenRecord(subject: VettingSubject, typeId: string): Decision {
 return canAny(subject, recordById(typeId)?.gatedBy ?? ['view-clinical-record']);
}
/* The written sentence a role is refused a protected category with, taken from the vetting
   contract rather than composed here, so the refusal reads the same wherever it is shown. */
export function releaseRefusal(roleId: string): string {
 const grant = roleById(roleId)?.grants.find(g => g.capability === 'view-protected-record');
 return grant?.refusal ?? 'A protected category is released by the patient, entry by entry.';
}
/* Vetting first, then the patient. Passing the first and failing the second is the normal case,
   not an error state — it is what "released by the patient" means when nobody has released
   anything. */
export function canOpenProtected(subject: VettingSubject, entry: Sensitive): Decision {
 const vetted = can(subject, 'view-protected-record');
 if (!vetted.allowed) return vetted;
 if (entry.releasedTo?.includes(subject.id)) return { allowed: true, blockedBy: [] };
 return { allowed: false, reason: releaseRefusal(subject.roleId), blockedBy: [] };
}
/* One decision for any item in the file, whatever its class. Protected items are never resolved
   by the type's own capability — that is the whole point of the third class. */
export function canOpen(subject: VettingSubject, item: Sensitive): Decision {
 return isProtected(item) ? canOpenProtected(subject, item) : canOpenRecord(subject, item.typeId);
}

/* ---- The eight tabs ---------------------------------------------------------------------
   Keyed off the contract's navigation array rather than a second list of names, so a tab cannot
   be renamed here and stay Overview there. Referrals opens on view-clinical-record because that is
   what records.json says: reading a referral and making one are different acts, and a nurse who may
   not refer still has to know her patient was referred. `refer-patient` is the write. */
const tabGates: Record<string, string[]> = {
 Overview: ['view-patient-summary'],
 Timeline: ['view-clinical-record'],
 Consultations: ['view-clinical-record'],
 Medication: ['view-clinical-record', 'dispense'],
 Results: ['view-results'],
 Referrals: ['view-clinical-record'],
 Documents: ['view-clinical-record'],
 Billing: ['view-billing']
};
const tabCopy: Record<string, [string, string]> = {
 Overview: ['The summary card from the contract: identity, allergies, current medicine, one contact, the last visit, the next appointment and the latest observations.', 'Nothing here is editable, and no action leaves the browser.'],
 Timeline: ['Every consultation, test, prescription, referral and document this viewer may open, newest first, each carrying its record type.', 'Filtering is by record type only. Date ranges, search across notes and a printable extract are not built.'],
 Consultations: ['Encounters in the standardised structure — the same twelve sections whoever writes them, with SOAP as the reading order.', 'Writing a consultation is a separate surface. This one reads.'],
 Medication: ['Current and past medicine with dose, frequency, repeats and the prescribing clinician, plus what a pharmacy actually handed over.', 'Interaction checking, substitution and chronic authorisation are not built.'],
 Results: ['Laboratory and imaging reports with reference ranges, and who released them.', 'Trend comparison across a whole panel, cumulative reports and imaging viewers are not built.'],
 Referrals: ['Who the patient was sent to, why, how urgently, and what came back.', 'Booking the receiving appointment and tracking the reply letter are not built.'],
 Documents: ['Consent forms, referral letters, scheme cards, certificates and reports held against this patient.', 'Nothing can be uploaded, opened or downloaded here; the files are titles only.'],
 Billing: ['Invoices, claims and authorisations, by service code and amount.', 'Submitting a claim, reconciling a payment and appealing a rejection are not built.']
};
export type FileTab = { name: string; capabilities: string[]; holds: string; notBuilt: string };
export const fileTabs: FileTab[] = navigation.map(name => ({
 name, capabilities: tabGates[name] ?? ['view-patient-summary'],
 holds: tabCopy[name]?.[0] ?? '', notBuilt: tabCopy[name]?.[1] ?? ''
}));
export const canOpenTab = (subject: VettingSubject, tab: FileTab) => canAny(subject, tab.capabilities);

/* ---- Actions ----------------------------------------------------------------------------
   The product owner's action row. Every one of them is a capability before it is a button:
   uploading a document is writing into somebody's record, and booking a visit is sending a named
   person to a named address, which is the most sensitive thing this platform does. */
export type FileAction = { label: string; capability: string; detail: string };
export const fileActions: FileAction[] = [
 { label: 'New consultation', capability: 'write-clinical-note', detail: 'Open the standardised encounter under your own registration' },
 { label: 'Prescription', capability: 'prescribe', detail: 'Issue medicine against this patient' },
 { label: 'Referral', capability: 'refer-patient', detail: 'Send this patient to another provider' },
 { label: 'Upload document', capability: 'write-clinical-note', detail: 'Add a letter, report or consent form to the file' },
 { label: 'Book a visit', capability: 'dispatch-nurses', detail: 'Send a nurse to this address in a chosen window' }
];

/* ---- Fixtures ---------------------------------------------------------------------------
   Three fictional patients. One carries nothing protected, one carries two protected categories
   and one carries a third, and the header reads identically on all three — which is the point.
   A notice that appeared only when there was something behind it would disclose the thing it is
   hiding, so it appears always.

   Dates are written out rather than held relative to today, because a clinical file that reads
   "next appointment in 11 days" every time it is opened is a demo, and a file dated 18 September
   2026 is a file. They will go stale, and they are fictional anyway. */
export type Allergy = { substance: string; reaction: string; severity: string };
export type ConditionEntry = Sensitive & { name: string; since: string; managedBy: string; status: string };
export type Medicine = Sensitive & { at: string; name: string; dose: string; frequency: string; started: string; repeats: string; prescriber: string; dispensedBy?: string; stopped?: string };
export type VitalSet = { at: string; systolic: number; diastolic: number; pulse: number; temperature: number; weight: number; oxygen: number };
export type ConsultationRecord = Sensitive & { id: string; at: string; kind: string; by: string; registration: string; place: string; reason: string; assessment: string; plan: string; sections: string[] };
export type ResultRow = { name: string; value: string; range: string; flag?: 'high' | 'low' };
export type LabReport = Sensitive & { id: string; at: string; name: string; source: string; status: string; releasedBy: string; rows: ResultRow[] };
export type ReferralRow = Sensitive & { id: string; at: string; to: string; reason: string; urgency: string; status: string; by: string };
export type DocumentRow = Sensitive & { id: string; at: string; name: string; kind: string; by: string };
export type BillingLine = Sensitive & { id: string; at: string; code: string; service: string; amount: number; payer: string; status: string; note?: string };
export type CareTeamMember = { name: string; role: string; since: string };
export type PatientRecord = {
 id: string; name: string; dob: string; sex: string; mobile: string; address: string; facility: string; bloodGroup: string;
 medicalAid: { scheme: string; plan: string; member: string; status: string; tone: string };
 emergency: { name: string; relationship: string; mobile: string };
 service: string; window: string;
 allergies: Allergy[]; conditions: ConditionEntry[]; medication: Medicine[]; vitals: VitalSet[];
 careTeam: CareTeamMember[]; summaryPoints: string[];
 lastVisit: { at: string; service: string; by: string; outcome: string };
 nextAppointment: { at: string; time: string; service: string; place: string } | null;
 consultations: ConsultationRecord[]; results: LabReport[]; referrals: ReferralRow[]; documents: DocumentRow[]; billing: BillingLine[];
};

export const patients: PatientRecord[] = [
 {
  id: 'THU-0001842', name: 'Thando Mokoena', dob: '1987-05-14', sex: 'Female', mobile: '082 431 7789',
  address: '14 Mofolo Street, Orlando East, Soweto', facility: 'Thuso Health Soweto', bloodGroup: 'O+',
  medicalAid: { scheme: 'Discovery Health', plan: 'Classic Comprehensive', member: '0142 887 331 · dependant 00', status: 'Active', tone: '' },
  emergency: { name: 'Nomsa Mokoena', relationship: 'Mother', mobile: '083 552 1140' },
  service: 'Vitals & chronic check', window: 'Fri 18 Sep, 10:30 – 11:15',
  allergies: [{ substance: 'Penicillin', reaction: 'Rash and facial swelling', severity: 'Severe' }],
  conditions: [{ typeId: 'chronic-condition', name: 'Hypertension', since: 'March 2021', managedBy: 'Dr N. Dlamini', status: 'Controlled' }],
  medication: [
   { typeId: 'prescription', at: '2026-09-04', name: 'Amlodipine', dose: '5 mg', frequency: 'Once daily, morning', started: 'March 2021', repeats: '5 of 6 remaining', prescriber: 'Dr N. Dlamini · HPCSA MP0483217', dispensedBy: 'Rosebank Community Pharmacy · 4 Sep 2026' },
   { typeId: 'prescription', at: '2026-06-12', name: 'Hydrochlorothiazide', dose: '12.5 mg', frequency: 'Once daily, morning', started: 'March 2021', stopped: 'June 2026', repeats: '—', prescriber: 'Dr N. Dlamini · HPCSA MP0483217' }
  ],
  vitals: [
   { at: '2026-06-12', systolic: 142, diastolic: 91, pulse: 78, temperature: 36.8, weight: 73.4, oxygen: 97 },
   { at: '2026-07-10', systolic: 136, diastolic: 88, pulse: 76, temperature: 36.6, weight: 72.8, oxygen: 98 },
   { at: '2026-08-07', systolic: 131, diastolic: 85, pulse: 79, temperature: 36.9, weight: 72.1, oxygen: 98 },
   { at: '2026-09-04', systolic: 128, diastolic: 82, pulse: 74, temperature: 36.7, weight: 71.5, oxygen: 98 }
  ],
  careTeam: [
   { name: 'Dr N. Dlamini', role: 'Treating doctor · General practice', since: 'March 2021' },
   { name: 'Sister Thandeka Zulu', role: 'Registered nurse · Chronic care', since: 'June 2026' }
  ],
  summaryPoints: [
   'Hypertension controlled on amlodipine 5 mg. Systolic 142 → 128 over three months, on four recorded readings.',
   'Penicillin allergy recorded 2019: rash and facial swelling. An alternative antibiotic is required, and the pharmacy is shown this before anything else.',
   'Hydrochlorothiazide stopped in June 2026 for postural dizziness. The reason is recorded rather than left to be inferred from the gap.',
   'No admission, procedure or imaging on file.'
  ],
  lastVisit: { at: '2026-09-04', service: 'Chronic hypertension review', by: 'Dr N. Dlamini', outcome: 'Continue amlodipine 5 mg. Dietitian referral raised.' },
  nextAppointment: { at: '2026-09-18', time: '10:30', service: 'Vitals & chronic check · home visit', place: 'Thuso Health Soweto · Sister Thandeka Zulu' },
  consultations: [
   { typeId: 'consultation', id: 'ENC-4412', at: '2026-09-04', kind: 'Doctor review · telehealth', by: 'Dr N. Dlamini', registration: 'HPCSA MP0483217', place: 'Thuso Health Soweto', reason: 'Three-monthly hypertension review', assessment: 'Hypertension, controlled. No end-organ symptoms reported.', plan: 'Continue amlodipine 5 mg daily. Dietitian referral. Review in 14 days.', sections: ['reason', 'history', 'observations', 'examination', 'assessment', 'plan', 'medication', 'referral', 'followup', 'clinician'] },
   { typeId: 'home-visit', id: 'ENC-4380', at: '2026-08-07', kind: 'Nurse home visit', by: 'Sister Thandeka Zulu', registration: 'SANC 20014477', place: '14 Mofolo Street, Orlando East', reason: 'Routine chronic observations', assessment: 'Readings within the indicative range. Escalation not required.', plan: 'Continue current medicine. Next observations in four weeks.', sections: ['reason', 'history', 'observations', 'assessment', 'plan', 'followup', 'clinician'] },
   { typeId: 'consultation', id: 'ENC-4291', at: '2026-06-12', kind: 'Doctor review · telehealth', by: 'Dr N. Dlamini', registration: 'HPCSA MP0483217', place: 'Thuso Health Soweto', reason: 'Postural dizziness on waking', assessment: 'Likely postural hypotension on combined therapy.', plan: 'Stop hydrochlorothiazide. Continue amlodipine. Repeat U&E in eight weeks.', sections: ['reason', 'history', 'observations', 'examination', 'assessment', 'plan', 'medication', 'tests', 'followup', 'clinician'] }
  ],
  results: [
   { typeId: 'laboratory', id: 'LAB-1188', at: '2026-08-28', name: 'Urea, electrolytes and creatinine', source: 'Highveld Pathology', status: 'Released', releasedBy: 'Dr N. Dlamini · 29 Aug 2026', rows: [{ name: 'Sodium', value: '139 mmol/L', range: '135 – 145' }, { name: 'Potassium', value: '4.2 mmol/L', range: '3.5 – 5.1' }, { name: 'Creatinine', value: '74 µmol/L', range: '49 – 90' }, { name: 'eGFR', value: '> 90 mL/min', range: '> 90' }] },
   { typeId: 'laboratory', id: 'LAB-1104', at: '2026-06-14', name: 'Lipogram', source: 'Highveld Pathology', status: 'Released', releasedBy: 'Dr N. Dlamini · 15 Jun 2026', rows: [{ name: 'Total cholesterol', value: '5.4 mmol/L', range: '< 5.0', flag: 'high' }, { name: 'LDL cholesterol', value: '3.6 mmol/L', range: '< 3.0', flag: 'high' }, { name: 'HDL cholesterol', value: '1.4 mmol/L', range: '> 1.2' }, { name: 'Triglycerides', value: '1.1 mmol/L', range: '< 1.7' }] }
  ],
  referrals: [{ typeId: 'referral', id: 'REF-0311', at: '2026-09-04', to: 'K. Petersen · Registered dietitian, Soweto', reason: 'Dietary management of hypertension and raised LDL', urgency: 'Routine', status: 'Accepted · appointment 2 Oct 2026', by: 'Dr N. Dlamini' }],
  documents: [
   { typeId: 'document', id: 'DOC-2210', at: '2026-09-04', name: 'Visit summary · 4 September 2026', kind: 'Clinical summary', by: 'Dr N. Dlamini' },
   { typeId: 'document', id: 'DOC-2140', at: '2026-06-12', name: 'Consent to home visits and record keeping', kind: 'Consent form', by: 'Thando Mokoena' },
   { typeId: 'document', id: 'DOC-2139', at: '2026-06-12', name: 'Discovery Health membership card', kind: 'Scheme document', by: 'Thando Mokoena' }
  ],
  billing: [
   { typeId: 'claim', id: 'CLM-8841', at: '2026-09-04', code: '0191', service: 'Consultation · established patient, 15–25 min', amount: 495, payer: 'Discovery Health · Classic Comprehensive', status: 'Accepted' },
   { typeId: 'claim', id: 'CLM-8802', at: '2026-08-07', code: '0146', service: 'Home visit · registered nurse, chronic observations', amount: 650, payer: 'Discovery Health · Classic Comprehensive', status: 'Accepted' },
   { typeId: 'claim', id: 'CLM-8744', at: '2026-06-14', code: '4025', service: 'Pathology · lipogram', amount: 312, payer: 'Discovery Health · Classic Comprehensive', status: 'Rejected', note: 'Benefit exhausted for the calendar year. Reason recorded; no diagnosis is carried on the line.' }
  ]
 },
 {
  id: 'THU-0002177', name: 'Sipho Radebe', dob: '1979-03-02', sex: 'Male', mobile: '073 208 4416',
  address: '882 Setswetla Extension, Alexandra', facility: 'Thuso Health Alexandra', bloodGroup: 'A+',
  medicalAid: { scheme: 'No scheme on file', plan: 'Self-funded · Thuso Wallet', member: '—', status: 'Self-funded', tone: 'amber' },
  emergency: { name: 'Busisiwe Radebe', relationship: 'Sister', mobile: '072 119 6602' },
  service: 'Chronic medicine collection', window: 'Tue 22 Sep, 08:00 – 09:00',
  allergies: [],
  conditions: [
   { typeId: 'chronic-condition', name: 'Type 2 diabetes', since: 'August 2018', managedBy: 'Dr N. Dlamini', status: 'Fair control' },
   { typeId: 'chronic-condition', sensitivity: 'protected', releasedTo: ['D-401'], name: 'HIV · on antiretroviral therapy', since: 'February 2016', managedBy: 'Dr N. Dlamini', status: 'Suppressed' },
   { typeId: 'chronic-condition', sensitivity: 'protected', name: 'Major depressive disorder', since: 'November 2024', managedBy: 'Alexandra Community Mental Health', status: 'In treatment' }
  ],
  medication: [
   { typeId: 'prescription', at: '2026-08-26', name: 'Metformin', dose: '1 000 mg', frequency: 'Twice daily with food', started: 'August 2018', repeats: '3 of 6 remaining', prescriber: 'Dr N. Dlamini · HPCSA MP0483217', dispensedBy: 'Diepkloof Family Pharmacy · 26 Aug 2026' },
   { typeId: 'prescription', at: '2026-07-25', sensitivity: 'protected', releasedTo: ['D-401'], name: 'Tenofovir / lamivudine / dolutegravir', dose: '300/300/50 mg', frequency: 'Once daily', started: 'February 2016', repeats: '4 of 6 remaining', prescriber: 'Dr N. Dlamini · HPCSA MP0483217' },
   { typeId: 'prescription', at: '2026-08-12', sensitivity: 'protected', name: 'Escitalopram', dose: '10 mg', frequency: 'Once daily', started: 'November 2024', repeats: '1 of 3 remaining', prescriber: 'Alexandra Community Mental Health' }
  ],
  vitals: [
   { at: '2026-06-20', systolic: 141, diastolic: 90, pulse: 84, temperature: 36.5, weight: 90.1, oxygen: 97 },
   { at: '2026-07-25', systolic: 139, diastolic: 89, pulse: 86, temperature: 36.6, weight: 89.4, oxygen: 97 },
   { at: '2026-08-26', systolic: 138, diastolic: 88, pulse: 82, temperature: 36.4, weight: 88.2, oxygen: 97 }
  ],
  careTeam: [{ name: 'Dr N. Dlamini', role: 'Treating doctor · General practice', since: 'February 2016' }],
  summaryPoints: [
   'Type 2 diabetes on metformin 1 000 mg twice daily. HbA1c 7.9% in August — above target, discussed at the last review.',
   'No allergy has been recorded. That is not the same as no allergy, and the file does not say it is.',
   'Blood pressure has sat at 138–141 systolic across three readings without a diagnosis of hypertension being made. Flagged for the next review.',
   'Weight down 1.9 kg since June, unplanned. Recorded, not interpreted.'
  ],
  lastVisit: { at: '2026-08-26', service: 'Chronic review and medicine collection', by: 'Dr N. Dlamini', outcome: 'Continue metformin. Repeat HbA1c in three months.' },
  nextAppointment: { at: '2026-09-22', time: '08:00', service: 'Chronic medicine collection', place: 'Thuso Corner · Alexandra' },
  consultations: [
   { typeId: 'consultation', id: 'ENC-4402', at: '2026-08-26', kind: 'Doctor review · telehealth', by: 'Dr N. Dlamini', registration: 'HPCSA MP0483217', place: 'Thuso Health Alexandra', reason: 'Three-monthly diabetes review', assessment: 'Type 2 diabetes, fair control. HbA1c 7.9%.', plan: 'Continue metformin 1 000 mg twice daily. Repeat HbA1c in three months. Dietary counselling offered.', sections: ['reason', 'history', 'observations', 'assessment', 'plan', 'medication', 'tests', 'followup', 'clinician'] },
   { typeId: 'consultation', sensitivity: 'protected', releasedTo: ['D-401'], id: 'ENC-4371', at: '2026-07-25', kind: 'Doctor review · telehealth', by: 'Dr N. Dlamini', registration: 'HPCSA MP0483217', place: 'Thuso Health Alexandra', reason: 'Antiretroviral therapy review', assessment: 'Viral load suppressed. Adherence good on self-report.', plan: 'Continue current regimen. Repeat viral load in six months.', sections: ['reason', 'history', 'observations', 'assessment', 'plan', 'medication', 'followup', 'clinician'] }
  ],
  results: [
   { typeId: 'laboratory', id: 'LAB-1173', at: '2026-08-24', name: 'HbA1c', source: 'Highveld Pathology', status: 'Released', releasedBy: 'Dr N. Dlamini · 25 Aug 2026', rows: [{ name: 'HbA1c', value: '7.9 %', range: '< 7.0 (on treatment)', flag: 'high' }] },
   { typeId: 'laboratory', sensitivity: 'protected', releasedTo: ['D-401'], id: 'LAB-1150', at: '2026-07-22', name: 'HIV viral load', source: 'Highveld Pathology', status: 'Released', releasedBy: 'Dr N. Dlamini · 24 Jul 2026', rows: [{ name: 'HIV-1 RNA', value: '< 50 copies/mL', range: 'Target not detected' }, { name: 'CD4 count', value: '612 cells/µL', range: '500 – 1 500' }] }
  ],
  referrals: [{ typeId: 'referral', sensitivity: 'protected', id: 'REF-0288', at: '2024-11-14', to: 'Alexandra Community Mental Health', reason: 'Assessment and management of major depressive disorder', urgency: 'Routine', status: 'Under care', by: 'Dr N. Dlamini' }],
  documents: [
   { typeId: 'document', id: 'DOC-2190', at: '2026-08-26', name: 'Visit summary · 26 August 2026', kind: 'Clinical summary', by: 'Dr N. Dlamini' },
   { typeId: 'document', id: 'DOC-2101', at: '2026-02-03', name: 'Consent to home visits and record keeping', kind: 'Consent form', by: 'Sipho Radebe' }
  ],
  billing: [
   { typeId: 'claim', id: 'CLM-8830', at: '2026-08-26', code: '0191', service: 'Consultation · established patient, 15–25 min', amount: 495, payer: 'Self-funded · Thuso Wallet', status: 'Paid' },
   { typeId: 'claim', id: 'CLM-8798', at: '2026-08-24', code: '4064', service: 'Pathology · glycated haemoglobin', amount: 268, payer: 'Self-funded · Thuso Wallet', status: 'Paid' },
   { typeId: 'claim', sensitivity: 'protected', id: 'CLM-8760', at: '2026-07-22', code: '3932', service: 'Antiretroviral therapy · monthly supply', amount: 0, payer: 'State programme', status: 'Covered' }
  ]
 },
 {
  id: 'THU-0002310', name: 'Lindiwe Nkosi', dob: '1994-11-09', sex: 'Female', mobile: '084 776 3021',
  address: '27 Ivory Park Extension 9, Tembisa', facility: 'Thuso Health Tembisa', bloodGroup: 'B−',
  medicalAid: { scheme: 'Bonitas', plan: 'BonStart', member: '8842 110 76 · principal', status: 'Active · waiting period', tone: 'amber' },
  emergency: { name: 'Thabo Nkosi', relationship: 'Partner', mobile: '079 445 8813' },
  service: 'Mother & baby check', window: 'Thu 24 Sep, 14:00 – 15:00',
  allergies: [{ substance: 'Sulfonamides', reaction: 'Urticaria', severity: 'Moderate' }],
  conditions: [
   { typeId: 'chronic-condition', name: 'Iron-deficiency anaemia', since: 'July 2026', managedBy: 'Sister Boitumelo Nkosi', status: 'On treatment' },
   { typeId: 'maternal-health', name: 'Antenatal care · 26 weeks', since: 'April 2026', managedBy: 'Thuso Health Tembisa', status: 'Ongoing', releasedTo: ['N-201'] }
  ],
  medication: [{ typeId: 'prescription', at: '2026-08-20', name: 'Ferrous sulfate', dose: '200 mg', frequency: 'Twice daily with food', started: 'July 2026', repeats: '2 of 3 remaining', prescriber: 'Dr N. Dlamini · HPCSA MP0483217', dispensedBy: 'Rosebank Community Pharmacy · 21 Aug 2026' }],
  vitals: [
   { at: '2026-07-16', systolic: 112, diastolic: 72, pulse: 84, temperature: 36.7, weight: 62.1, oxygen: 99 },
   { at: '2026-08-20', systolic: 108, diastolic: 70, pulse: 86, temperature: 36.5, weight: 63.4, oxygen: 99 },
   { at: '2026-09-03', systolic: 106, diastolic: 68, pulse: 88, temperature: 36.6, weight: 64.3, oxygen: 99 }
  ],
  careTeam: [{ name: 'Sister Boitumelo Nkosi', role: 'Registered nurse · Maternal and child', since: 'April 2026' }],
  summaryPoints: [
   'Iron-deficiency anaemia on ferrous sulfate. Haemoglobin 10.4 g/dL in August, up from 9.6 in July.',
   'Sulfonamide allergy recorded: urticaria, moderate.',
   'Blood pressure low-normal and steady across three readings.',
   'Blood group B negative. Recorded here because it changes what a stranger would do in the next ten minutes.'
  ],
  lastVisit: { at: '2026-09-03', service: 'Nurse home visit · observations', by: 'Sister Boitumelo Nkosi', outcome: 'Observations recorded. Continue iron. Review in three weeks.' },
  nextAppointment: { at: '2026-09-24', time: '14:00', service: 'Mother & baby check · home visit', place: 'Thuso Health Tembisa · Sister Boitumelo Nkosi' },
  consultations: [
   { typeId: 'home-visit', id: 'ENC-4408', at: '2026-09-03', kind: 'Nurse home visit', by: 'Sister Boitumelo Nkosi', registration: 'SANC 20019902', place: '27 Ivory Park Extension 9', reason: 'Routine observations and iron review', assessment: 'Readings within the indicative range. Tolerating iron.', plan: 'Continue ferrous sulfate. Repeat full blood count in four weeks.', sections: ['reason', 'history', 'observations', 'assessment', 'plan', 'followup', 'clinician'] },
   { typeId: 'maternal-health', releasedTo: ['N-201'], id: 'ENC-4390', at: '2026-08-20', kind: 'Antenatal visit', by: 'Sister Boitumelo Nkosi', registration: 'SANC 20019902', place: 'Thuso Health Tembisa', reason: 'Antenatal review at 24 weeks', assessment: 'Progressing normally. Fundal height appropriate.', plan: 'Next antenatal visit in four weeks. Iron continued.', sections: ['reason', 'history', 'observations', 'examination', 'assessment', 'plan', 'followup', 'clinician'] }
  ],
  results: [{ typeId: 'laboratory', id: 'LAB-1169', at: '2026-08-19', name: 'Full blood count and iron studies', source: 'Highveld Pathology', status: 'Released', releasedBy: 'Dr N. Dlamini · 20 Aug 2026', rows: [{ name: 'Haemoglobin', value: '10.4 g/dL', range: '12.0 – 15.5', flag: 'low' }, { name: 'Mean cell volume', value: '76 fL', range: '80 – 100', flag: 'low' }, { name: 'Ferritin', value: '14 µg/L', range: '15 – 200', flag: 'low' }] }],
  referrals: [],
  documents: [
   { typeId: 'document', id: 'DOC-2205', at: '2026-08-20', name: 'Consent to home visits and record keeping', kind: 'Consent form', by: 'Lindiwe Nkosi' },
   { typeId: 'document', id: 'DOC-2206', at: '2026-08-19', name: 'Full blood count report · 19 August 2026', kind: 'Laboratory report', by: 'Highveld Pathology' }
  ],
  billing: [
   { typeId: 'claim', id: 'CLM-8820', at: '2026-09-03', code: '0146', service: 'Home visit · registered nurse, observations', amount: 650, payer: 'Bonitas · BonStart', status: 'Submitted' },
   { typeId: 'claim', id: 'CLM-8795', at: '2026-08-19', code: '3755', service: 'Pathology · full blood count', amount: 214, payer: 'Bonitas · BonStart', status: 'Accepted' }
  ]
 }
];
export const patientById = (id: string) => patients.find(p => p.id === id);

/* ---- The timeline -----------------------------------------------------------------------
   Derived rather than authored, so a consultation cannot appear in the Consultations tab and be
   missing from the Timeline because somebody forgot to add it twice. */
export type TimelineEntry = Sensitive & { id: string; at: string; title: string; detail: string; by: string };
export function timelineFor(patient: PatientRecord): TimelineEntry[] {
 const entries: TimelineEntry[] = [
  ...patient.consultations.map(c => ({ typeId: c.typeId, sensitivity: c.sensitivity, releasedTo: c.releasedTo, id: c.id, at: c.at, title: c.kind, detail: c.reason, by: c.by })),
  ...patient.results.map(r => ({ typeId: r.typeId, sensitivity: r.sensitivity, releasedTo: r.releasedTo, id: r.id, at: r.at, title: r.name, detail: `${r.source} · ${r.status.toLowerCase()}`, by: r.releasedBy })),
  ...patient.medication.filter(m => !m.stopped).map(m => ({ typeId: m.typeId, sensitivity: m.sensitivity, releasedTo: m.releasedTo, id: `RX-${m.name.slice(0, 4).toUpperCase()}`, at: m.at, title: `${m.name} ${m.dose}`, detail: `${m.frequency} · ${m.repeats}`, by: m.prescriber })),
  ...patient.referrals.map(r => ({ typeId: r.typeId, sensitivity: r.sensitivity, releasedTo: r.releasedTo, id: r.id, at: r.at, title: `Referral · ${r.to}`, detail: `${r.urgency} · ${r.status}`, by: r.by })),
  ...patient.documents.map(d => ({ typeId: d.typeId, sensitivity: d.sensitivity, releasedTo: d.releasedTo, id: d.id, at: d.at, title: d.name, detail: d.kind, by: d.by }))
 ];
 return entries.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/* ---- Small shared readings --------------------------------------------------------------- */
export const ageFrom = (dob: string) => {
 const born = new Date(`${dob}T00:00:00Z`), now = new Date();
 let age = now.getUTCFullYear() - born.getUTCFullYear();
 const month = now.getUTCMonth() - born.getUTCMonth();
 if (month < 0 || (month === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
 return age;
};
export const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
