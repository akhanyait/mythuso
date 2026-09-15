import { Ban, FileText, Info, Send, ShieldCheck } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { SectionTitle } from '../components/UI';
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

export function ClaimsOnRecord() {
 const claim = usePatientClaim();
 const words = claimWords.patient;
 return <div className="claim-screen">
  <div className="page-intro"><div className="eyebrow">THUSO MONEY</div>
   <h1>{words.heading}</h1>
   <p>{words.intro}</p></div>
  <NotConnected of="scheme-claims"/>

  <section className="panel">
   <div className="claim-figures">
    <div><small>{claim.claimRef}</small><strong>{claim.service}</strong></div>
    <div><small>{words.amount}</small><strong>{claim.amount}</strong></div>
   </div>
   <p className="claim-state" role="status"><strong>{claim.stateName}.</strong> {claim.words}</p>
   <p className="claim-not-sent"><Ban size={15} aria-hidden="true"/> {claim.notSentBecause}</p>
   {claim.agreed ? <p className="helper">{claim.agreed}</p> : null}
   {claim.canAgree ? <>
    <p className="helper"><ShieldCheck size={14} aria-hidden="true"/>{claimConsent.notAGrant}</p>
    <button className="primary full" onClick={agreeToSend}><Send size={17} aria-hidden="true"/>{words.agree}</button>
   </> : null}
   {claim.said ? <p className="claim-said" role="status"><Info size={15} aria-hidden="true"/>{claim.said}</p> : null}
  </section>

  <SectionTitle title={words.heading}/>
  <ul className="claim-never">
   <li><Ban size={15} aria-hidden="true"/>{claimConsent.never}</li>
   <li><Ban size={15} aria-hidden="true"/>{codeSets.statement}</li>
  </ul>
  <p className="helper">{claimWords.preview}</p>
 </div>;
}

export function ClaimDraft() {
 const claim = useDoctorClaim();
 const words = claimWords.doctor;
 return <div className="claim-screen claim-draft">
  <NotConnected of="scheme-claims"/>
  <p className="claim-no-code"><FileText size={15} aria-hidden="true"/>{claim.codeSetAdopted ? words.codeLabel : codeSets.doctorWords}</p>
  <p className="helper">{codeSets.doctorDetail}</p>

  <div className="panel">
   <div className="claim-figures">
    <div><small>{claim.claimRef}</small><strong>{claim.service}</strong></div>
    <div><small>{claimWords.patient.amount}</small><strong>{claim.amount}</strong></div>
   </div>
   <p className="claim-state" role="status"><strong>{claim.stateName}.</strong> {claim.words}</p>
   <p className="claim-not-sent"><Ban size={15} aria-hidden="true"/> {claim.notSentBecause}</p>
   <button className="secondary" onClick={askToSend}><Send size={16} aria-hidden="true"/>{words.send}</button>
   {claim.said ? <p className="claim-said" role="status"><Info size={15} aria-hidden="true"/>{claim.said}</p> : null}
  </div>

  <SectionTitle title={words.preauthHeading}/>
  <div className="panel"><p className="helper">{preauthorisation.words}</p></div>
  <p className="helper">{claimWords.preview}</p>
 </div>;
}
