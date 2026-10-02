import { useSyncExternalStore } from 'react';
import { FileText } from 'lucide-react';
import { holder } from '../lib/passport';
import { sickNote, subscribeWritten, writtenThisSession, type SickNoteCertificate } from '../lib/sick-note';
import './sick-note.css';

/* A medical certificate as the patient would read it, and nothing more: rule 16's items in rule 16's
   order, worked out once by lib/sick-note.ts's certificateFrom. Its own file so the patient's Passport
   can draw what the doctor wrote without carrying the composer that wrote it.

   It is marked not issued above its heading and again under its signature line, in the contract's words,
   because a certificate is the one document in healthcare people hand to somebody who was not in the room
   — and a screenshot of a preview that only said so once, at the top, would crop to something that looks
   real. */
export function CertificateSheet({ certificate }: { certificate: SickNoteCertificate }) {
 return <article className="sn-certificate" aria-label={`${sickNote.screen.title} · ${certificate.reference}`}>
  <p className="sn-stamp" role="note">{sickNote.notIssuedShort}</p>
  <header className="sn-certificate-head">
   <span className="sn-mark" aria-hidden="true"><FileText size={20}/></span>
   <div><h3>{sickNote.screen.title}</h3><p>{certificate.reference} · {certificate.patient}</p></div>
  </header>
  <dl className="sn-lines">{certificate.lines.map(line => <div key={line.id} className={`sn-line sn-line-${line.id}`}>
   <dt>{line.label}</dt><dd>{line.value}</dd>
  </div>)}</dl>
  <p className="sn-not-issued">{sickNote.notIssued}</p>
 </article>;
}

/* The patient's side of the same session (the Passport's "Medical certificate"). A doctor who signs one in
   the preview and switches to the patient in the same tab sees it here, as the patient would — for the
   Passport's own holder only, because a certificate about somebody else is not this patient's to read.
   Nothing is fetched or stored: it is lib/sick-note.ts's memory, and the sentence under it says a reload
   ends it. With nothing written it draws nothing, and the Passport's own account of the document stands. */
export function WrittenThisSession() {
 const mine = useSyncExternalStore(subscribeWritten, writtenThisSession, writtenThisSession).filter(c => c.patient === holder.name);
 if (!mine.length) return null;
 return <section className="sn sn-session" aria-label={sickNote.screen.passportHeading}>
  <h3 className="sn-sub">{sickNote.screen.passportHeading}</h3>
  {mine.map((certificate, i) => <CertificateSheet key={`${certificate.reference}-${i}`} certificate={certificate}/>)}
  <p className="sn-quiet">{sickNote.memoryOnly}</p>
 </section>;
}
