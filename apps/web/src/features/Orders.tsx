import { Suspense, lazy } from 'react';
/* The two order screens a partner fills, as the shells and App.tsx name them.

   App.tsx imports this file statically, which put both screens, and since wave 4d the shared components
   they wear, on the patient's first load — for sheets a patient reaches only by opening an order. So the
   screens live in OrderDetails.tsx and each name here is a lazy door to it: nothing in this file is more
   than a Suspense boundary, and the patient's first view carries two small functions instead of a
   pharmacy. The wait says what it is waiting for rather than drawing an empty sheet. */
const details = () => import('./OrderDetails');
const Prescription = lazy(() => details().then(m => ({ default: m.PrescriptionDetail })));
const LabOrder = lazy(() => details().then(m => ({ default: m.LabOrderDetail })));
const Opening = ({ what }: { what: string }) => <p className="helper" role="status">Opening the {what}…</p>;

export function PrescriptionDetail(props: { reference?: string; open?: (m: string) => void }) {
 return <Suspense fallback={<Opening what="prescription"/>}><Prescription {...props}/></Suspense>;
}
export function LabOrderDetail(props: { reference?: string }) {
 return <Suspense fallback={<Opening what="laboratory order"/>}><LabOrder {...props}/></Suspense>;
}
