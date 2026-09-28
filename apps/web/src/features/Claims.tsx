import { Ban, FileText, Info, Send, ShieldCheck } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button, Card } from '../ui';
import { OfficeHead, OfficeNote, OfficeSection } from '../surface/Office';
import { agreeToSend, askToSend, claimConsent, claimWords, codeSets, preauthorisation, useDoctorClaim, usePatientClaim } from '../lib/claims';
import './group-claims.css';

/* A claim to a medical scheme, from both ends, and the two reasons it goes nowhere.
 *
 * THE PATIENT'S SCREEN IS THE STATE IN PLAIN WORDS. Drafted, or agreed and not sent, with the sentence the contract
 * gives that state and the sentence saying why nothing has been sent. Agreeing is hers, on her own record, and what she
 * is agreeing to is said before the button: her scheme is told she was seen and what it cost, it opens nothing of her
 * record, and the agreement runs out.
 *
 * THE DOCTOR'S DRAFT LEADS WITH WHAT IS MISSING. "No adopted code set" is the first thing on it, because a claim
 * without a code a clinician chose is not a claim; nothing is filled in, nothing is suggested from the service's name,
 * and there is no field to type one into. The one button asks for it to be sent and shows the refusal word for word —
 * a button that had been disabled would have said nothing about why.
 *
 * Nothing here contacts a scheme. The claims capability's notice is on both screens. */

/* The two figures a person opens a claim for — which claim, and for how much — set as the handoff sets a
   figure, over the state in plain words and the reason nothing has been sent. The reason is a refusal
   and reads as one: its mark is the danger ink and its words say "not sent", so colour never carries it
   alone. */
function ClaimFigures({ claimRef, service, amountLabel, amount }: { claimRef: string; service: string; amountLabel: string; amount: string }) {
 return <div className="claim-figures">
  <div><span className="oi-eyebrow">{claimRef}</span><strong className="claim-service">{service}</strong></div>
  <div><span className="oi-eyebrow">{amountLabel}</span><strong className="claim-amount">{amount}</strong></div>
 </div>;
}

export function ClaimsOnRecord() {
 const claim = usePatientClaim();
 const words = claimWords.patient;
 return <div className="oi-screen claim-screen">
  <OfficeHead eyebrow="Thuso Money" title={words.heading} lead={words.intro}/>
  <NotConnected of="scheme-claims"/>

  <Card padding="md" className="oi-card-body claim-card">
   <ClaimFigures claimRef={claim.claimRef} service={claim.service} amountLabel={words.amount} amount={claim.amount}/>
   <p className="claim-state" role="status"><Badge>{claim.stateName}</Badge> <span>{claim.words}</span></p>
   <p className="oi-note oi-note--refusal claim-not-sent"><Ban aria-hidden="true"/><span>{claim.notSentBecause}</span></p>
   {claim.agreed ? <p className="oi-help">{claim.agreed}</p> : null}
   {claim.canAgree ? <div className="oi-stack">
    <p className="oi-help oi-with-icon"><ShieldCheck aria-hidden="true"/>{claimConsent.notAGrant}</p>
    <Button variant="primary" size="lg" className="oi-full" onClick={agreeToSend} leadingIcon={<Send aria-hidden="true"/>}>{words.agree}</Button>
   </div> : null}
   {claim.said ? <p className="oi-note claim-said" role="status"><Info aria-hidden="true"/><span>{claim.said}</span></p> : null}
  </Card>

  {/* Its own heading, not the screen's again: a section that repeats the page's name says nothing and reads as a
      second page. What a scheme is never told is the half of this screen worth a heading of its own. */}
  <OfficeSection title={words.neverHeading}>
   <Card><ul className="oi-rows claim-never">
    <li><div className="oi-row oi-row--mark"><Ban aria-hidden="true"/><p className="oi-row__title">{claimConsent.never}</p></div></li>
    <li><div className="oi-row oi-row--mark"><Ban aria-hidden="true"/><p className="oi-row__title">{codeSets.statement}</p></div></li>
   </ul></Card>
   <p className="oi-help">{claimWords.preview}</p>
  </OfficeSection>
 </div>;
}

export function ClaimDraft() {
 const claim = useDoctorClaim();
 const words = claimWords.doctor;
 return <div className="oi-screen claim-screen claim-draft">
  <NotConnected of="scheme-claims"/>
  <div className="oi-stack">
   <p className="claim-no-code"><FileText aria-hidden="true"/><span>{claim.codeSetAdopted ? words.codeLabel : codeSets.doctorWords}</span></p>
   <p className="oi-help">{codeSets.doctorDetail}</p>
  </div>

  <Card padding="md" className="oi-card-body claim-card">
   <ClaimFigures claimRef={claim.claimRef} service={claim.service} amountLabel={claimWords.patient.amount} amount={claim.amount}/>
   <p className="claim-state" role="status"><Badge>{claim.stateName}</Badge> <span>{claim.words}</span></p>
   <p className="oi-note oi-note--refusal claim-not-sent"><Ban aria-hidden="true"/><span>{claim.notSentBecause}</span></p>
   <div className="oi-actions"><Button variant="secondary" onClick={askToSend} leadingIcon={<Send aria-hidden="true"/>}>{words.send}</Button></div>
   {claim.said ? <p className="oi-note oi-note--refusal claim-said" role="status"><Info aria-hidden="true"/><span>{claim.said}</span></p> : null}
  </Card>

  <OfficeSection title={words.preauthHeading} level={3}>
   <OfficeNote icon={<Ban aria-hidden="true"/>}>{preauthorisation.words}</OfficeNote>
  </OfficeSection>
  <p className="oi-help">{claimWords.preview}</p>
 </div>;
}
