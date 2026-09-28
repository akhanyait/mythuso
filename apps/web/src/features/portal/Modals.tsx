import { Suspense, lazy } from 'react';
import { ArrowRight } from 'lucide-react';
import { Modal } from '../../components/UI';
import { Button } from '../../ui/Button';
import { IncidentDetail, NurseVetting } from '../Dispatch';
import { VettingApplication } from '../Vetting';
import { DoctorReview } from '../Clinical';
import { Programmes } from '../Programmes';
import { HL7_QUARANTINE_HEADING } from '../Workspaces';

/* The portal's dialogs: the ones the two old surfaces' screens open, and the four More tools the
   Control Tower carried. The same components the two old modal routers opened, under the same names —
   docs/control-tower-tab-inventory.md notes that both old routers already sent "Nurse onboarding &
   vetting" to the identical screen, and this keeps that one door rather than reconciling it into a
   third. Every string here is a name a category passes to `open`; anything else falls through to the
   honest not-drawn dialog rather than to a screen it was not meant to reach. */
const Hl7Quarantine = lazy(() => import('../Hl7Quarantine').then(m => ({ default: m.Hl7Quarantine })));
const DeviceLab = lazy(() => import('../DeviceLab').then(m => ({ default: m.DeviceLab })));

const titleOf = (modal: string) => {
 if (modal.startsWith('Incident ')) return 'Incident';
 if (modal.startsWith('Doctor review') || modal.startsWith('Doctor case:')) return 'Clinical review';
 if (modal === 'Vetting application') return 'Apply for vetting';
 if (modal === 'Nurse onboarding & vetting' || modal === 'Nurse vetting') return 'Vetting queue';
 return modal;
};
const referenceIn = (modal: string) => modal.match(/\b(TH|INC)-\d+/)?.[0] ?? undefined;

export default function PortalModal({ modal, onClose, open }: { modal: string; onClose: () => void; open: (m: string) => void }) {
 return <Modal title={titleOf(modal)} onClose={onClose}>{bodyOf(modal, onClose, open)}</Modal>;
}
function bodyOf(modal: string, close: () => void, open: (m: string) => void) {
 if (modal.startsWith('Incident ')) return <IncidentDetail reference={modal.replace('Incident ', '')} onClose={close}/>;
 if (modal.startsWith('Doctor review') || modal.startsWith('Doctor case:')) return <DoctorReview reference={referenceIn(modal)} open={open} onClose={close}/>;
 if (modal === 'Vetting application') return <VettingApplication onClose={close}/>;
 if (modal === 'Nurse onboarding & vetting' || modal === 'Nurse vetting') return <NurseVetting onClose={close}/>;
 if (modal === 'Employer programmes') return <Programmes/>;
 if (modal === HL7_QUARANTINE_HEADING) return <Suspense fallback={null}><Hl7Quarantine/></Suspense>;
 if (modal === 'Device Lab') return <Suspense fallback={null}><DeviceLab/></Suspense>;
 return <div className="form-stack">
  <div className="staff-blank"><h2>{modal}</h2><p>This part of the Control Tower is in the roadmap and is not drawn yet. Nothing behind this name is connected to a record, a payment, a device or a party.</p></div>
  <Button variant="primary" onClick={close} trailingIcon={<ArrowRight aria-hidden="true"/>}>Got it</Button>
 </div>;
}
