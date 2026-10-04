/* Remembers only that this browser already accepted GilbertOne's opening
   acknowledgements. The value is the single character "1". No message, no
   vital, and no record is written. A private window or a blocked store just
   asks again. */

const PATIENT = "mythuso.gilbertone.accepted.patient";
const PUBLIC = "mythuso.gilbertone.accepted.public";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* Accepted for this page even if the browser will not keep it. */
  }
}

export const patientAcknowledged = () => read(PATIENT);
export const acknowledgePatient = () => write(PATIENT);
export const publicAcknowledged = () => read(PUBLIC);
export const acknowledgePublic = () => write(PUBLIC);
