export type ClinicalRole = 'nurse' | 'doctor' | 'pharmacist';
/** Supplied by an authenticated host in a real deployment, never inferred from a request body. */
export type Actor = { id: string; role: ClinicalRole; verified: boolean };
export type Patient = { id: string; name: string; reason: string; consent: boolean; allergies: string; allergiesReviewed: boolean };
export type Appointment = { id: string; patientId: string; clinicianId: string; startsAt: string; minutes: number; mode: 'home' | 'video'; status: 'scheduled' | 'arrived' | 'completed' | 'cancelled'; reason?: string };
export type Notes = { subjective: string; objective: string; assessment: string; plan: string };
export type Consultation = { id: string; patientId: string; appointmentId: string; status: 'draft' | 'awaiting-doctor' | 'signed'; notes: Notes; signedBy?: string; signedAt?: string };
export type Assessment = { id: string; patientId: string; consultationId: string; impression: string; evidence: string; status: 'proposed' | 'confirmed' | 'rejected'; origin: 'clinician'; reviewedBy?: string; rationale?: string };
export type MedicationRequest = { id: string; patientId: string; consultationId: string; item: string; directions: string; quantity: number; status: 'requested' | 'verified' | 'held' | 'dispensed'; prescriberId: string; reason?: string; batchId?: string; pharmacistId?: string };
export type StockBatch = { id: string; item: string; quantity: number; expiresAt: string };
export type WearableSample = { id: string; patientId: string; deviceId: string; metric: 'heart-rate' | 'steps'; value: number; unit: 'bpm' | 'count'; measuredAt: string; receivedAt: string; source: 'simulator'; quality: 'accepted' | 'poor-contact' };
export type WearableConnection = { patientId: string; enabled: boolean; consent: boolean; lastReceivedAt?: string };
export type AuditEvent = { sequence: number; at: string; actorId: string; action: Command['type']; patientId: string; revision: number };
export type State = { revision: number; patients: Patient[]; appointments: Appointment[]; consultations: Consultation[]; assessments: Assessment[]; medicationRequests: MedicationRequest[]; stock: StockBatch[]; wearableConnections: WearableConnection[]; samples: WearableSample[]; events: AuditEvent[] };
export type Command =
 | { type: 'appointment.schedule'; patientId: string; clinicianId: string; startsAt: string; minutes: number; mode: Appointment['mode'] }
 | { type: 'appointment.reschedule'; patientId: string; appointmentId: string; startsAt: string; mode: Appointment['mode'] }
 | { type: 'appointment.transition'; patientId: string; appointmentId: string; status: Appointment['status']; reason?: string }
 | { type: 'consultation.open'; patientId: string; appointmentId: string }
 | { type: 'consultation.save'; patientId: string; consultationId: string; notes: Notes }
 | { type: 'consultation.submit'; patientId: string; consultationId: string }
 | { type: 'consultation.sign'; patientId: string; consultationId: string }
 | { type: 'diagnosis.propose'; patientId: string; consultationId: string; impression: string; evidence: string }
 | { type: 'diagnosis.review'; patientId: string; assessmentId: string; decision: 'confirmed' | 'rejected'; rationale: string }
 | { type: 'dispensary.request'; patientId: string; consultationId: string; item: string; directions: string; quantity: number }
 | { type: 'dispensary.verify'; patientId: string; requestId: string; batchId: string; originalChecked: boolean; allergyChecked: boolean }
 | { type: 'dispensary.hold'; patientId: string; requestId: string; reason: string }
 | { type: 'dispensary.release'; patientId: string; requestId: string; recipientChecked: boolean }
 | { type: 'wearable.connection'; patientId: string; enabled: boolean; consent: boolean }
 | { type: 'wearable.ingest'; patientId: string; sample: Omit<WearableSample, 'receivedAt'> };
export type Receipt = { state: State; replayed: boolean };
/** An external ThusoIQ service implements this port. The apps do not import its internals. */
export interface ThusoIQPort {
 readonly mode: 'sandbox' | 'connected';
 snapshot(): State;
 execute(command: Command, options: { expectedRevision: number; idempotencyKey: string }): Receipt;
 subscribe(listener: () => void): () => void;
}
export const PROTOCOL_VERSION = '1.0';
/** Node strips types rather than compiling them, so a constructor parameter property would not
 * survive to runtime. The field is declared, as it is in apps/api. */
export type EngineErrorCode = 'forbidden' | 'conflict' | 'invalid' | 'not-found' | 'consent-required';
export class EngineError extends Error {
 code: EngineErrorCode;
 constructor(code: EngineErrorCode, message: string) { super(message); this.code = code; this.name = 'EngineError'; }
}
