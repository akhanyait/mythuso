import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Fingerprint, KeyRound, LifeBuoy, MapPin, MessageSquare, Phone, ShieldCheck, Users } from 'lucide-react';
import { Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { locales, type LocaleCode } from '../lib/i18n';
import { LogIn, UserPlus } from 'lucide-react';
import { startSignIn, verifyCode } from '../lib/auth';
import { CodeInput } from '../components/Steps';
/* Sign-up and vetting must agree about what a valid identity number is, so the Luhn check digit
   validation lives in lib/identity.ts and is re-exported here for the screens that already use it. */
import { validateSaId } from '../lib/identity';
export { validateSaId };
const steps = ['Welcome', 'Your number', 'Verify', 'Identity', 'Recovery', 'Consent'] as const;
type Props = { locale: LocaleCode; setLocale: (l: LocaleCode) => void; onDone: () => void; onSkip: () => void };
export function Onboarding({ locale, setLocale, onDone, onSkip }: Props) {
 const [step, setStep] = useState(0);
 const [recovering, setRecovering] = useState(false);
 const [phone, setPhone] = useState('');
 const [code, setCode] = useState('');
 const [codeError, setCodeError] = useState('');
 const [seconds, setSeconds] = useState(30);
 const [idNumber, setIdNumber] = useState('');
 const [idTouched, setIdTouched] = useState(false);
 const [trusted, setTrusted] = useState('Nomsa Molefe · Mother');
 const [recoveryWord, setRecoveryWord] = useState('');
 const [consents, setConsents] = useState({ care: false, popia: false, updates: false });
 useEffect(() => { if (step !== 2) return; setSeconds(30); const t = setInterval(() => setSeconds(s => (s > 0 ? s - 1 : 0)), 1000); return () => clearInterval(t); }, [step]);
 const idCheck = validateSaId(idNumber);
 const phoneOk = /^0\d{9}$/.test(phone.replace(/\s/g, ''));
 if (recovering) return <RecoverAccess onBack={() => setRecovering(false)} onDone={onDone}/>;
 return <div className="onboarding">
  <div className="onboard-panel">
   <img src="/logo.svg" alt="MyThuso — Help. Health. Home." className="onboard-brand"/>
   <ol className="onboard-steps" aria-label="Sign-up progress">{steps.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : i === step ? 'current' : ''}><b>{i < step ? <Check size={11}/> : i + 1}</b>{s}</li>)}</ol>
   <div className="onboard-note"><ShieldCheck size={17}/>Nothing you type here leaves your browser until you press the button that sends it.</div>
  </div>
  <div className="onboard-form">
   <div className="onboard-body">
    {step === 0 ? <>
     <h1>Care that comes to you.</h1>
     <NotConnected of="accounts"/>
     <p className="muted">Let’s set up your MyThuso account. It takes about two minutes, and you can stop at any point.</p>
     <fieldset className="locale-choice"><legend>Choose your language</legend>{locales.map(l => <label key={l.code} className={locale === l.code ? 'selected' : ''}><input type="radio" name="locale" checked={locale === l.code} onChange={() => setLocale(l.code)}/><span>{l.native}</span></label>)}</fieldset>
     <p className="helper">Navigation and the main actions are translated. Clinical wording stays in English until a clinical language review is complete.</p>
     <button className="primary full" onClick={() => setStep(1)}>Create my account<ArrowRight size={17}/></button>
     <button className="secondary full" onClick={() => setRecovering(true)}><LifeBuoy size={16}/>I’ve lost access to my account</button>
     <button className="text-button" onClick={onSkip}>Skip for now and look around</button>
    </> : step === 1 ? <>
     <h1>What’s your number?</h1>
     <p className="muted">We’ll send a one-time code. Your number is how nurses reach you on the day of a visit.</p>
     <label>Mobile number<div className="phone-field"><span>+27</span><input inputMode="numeric" autoFocus value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))} placeholder="082 000 0000" aria-describedby="phone-help"/></div></label>
     <p className="helper" id="phone-help">{phone && !phoneOk ? 'Enter a 10-digit South African mobile number, starting with 0.' : 'Standard network rates apply. We never share your number with advertisers.'}</p>
     <div className="privacy-note"><ShieldCheck size={19}/>This step is rate-limited, and a code is bound to the one device that asked for it.</div>
     <div className="button-row"><button className="secondary" onClick={() => setStep(0)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!phoneOk} onClick={() => { setCode(''); setCodeError(''); setStep(2); }}>Send my code<ArrowRight size={16}/></button></div>
    </> : step === 2 ? <>
     <h1>Check your messages.</h1>
     <p className="muted">We’ve sent a 6-digit code to <strong>+27 {phone.replace(/^0/, '')}</strong>.</p>
     <NotConnected of="accounts"/>
     <label>Verification code</label>
     <CodeInput value={code} onChange={v => { setCode(v); setCodeError(''); }} label="Verification code" describedBy="code-help" invalid={!!codeError} autoFocus/>
     <p className="helper" id="code-help" role="status">{codeError || (seconds > 0 ? `You can ask for a new code in ${seconds}s.` : 'Didn’t get it? Ask for a new code.')}</p>
     <div className="button-row">
      <button className="secondary" disabled={seconds > 0} onClick={() => { setSeconds(30); setCode(''); }}><MessageSquare size={16}/>Resend</button>
      <button className="primary" disabled={code.length < 6} onClick={() => code === '240924' ? setStep(3) : setCodeError('That code doesn’t match. Check the message and try again.')}>Verify<ArrowRight size={16}/></button>
     </div>
     <button className="text-button" onClick={() => setStep(1)}>Use a different number</button>
    </> : step === 3 ? <>
     <h1>Let’s confirm it’s you.</h1>
     <p className="muted">Your identity number lets a nurse confirm the right patient at the door, and keeps someone else’s records out of your account.</p>
     <label>South African ID number<input inputMode="numeric" autoFocus value={idNumber} onBlur={() => setIdTouched(true)} onChange={e => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 13))} className={idTouched && idNumber && !idCheck.ok ? 'field-error' : ''} aria-invalid={idTouched && !!idNumber && !idCheck.ok} aria-describedby="id-help" placeholder="8001015009087"/></label>
     <p className="helper" id="id-help" role="status">{idNumber && idTouched && !idCheck.ok ? idCheck.reason : idCheck.ok ? `Checks out. Date of birth ${idCheck.birth}.` : 'Thirteen digits, as printed on the document.'}</p>
     <div className="privacy-note"><Fingerprint size={19}/>Verification runs against the Department of Home Affairs through an accredited provider, under a documented lawful basis. MyThuso never keeps a copy of the document itself.</div>
     <div className="button-row"><button className="secondary" onClick={() => setStep(2)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!idCheck.ok} onClick={() => setStep(4)}>Continue<ArrowRight size={16}/></button></div>
     <button className="text-button" onClick={() => setStep(4)}>I don’t have an SA ID number</button>
    </> : step === 4 ? <>
     <h1>If you ever lose your phone.</h1>
     <p className="muted">Two ways back in, so a lost handset never means losing your health history.</p>
     <label>Trusted family contact<select value={trusted} onChange={e => setTrusted(e.target.value)}><option>Nomsa Molefe · Mother</option><option>Thabo Molefe · Son</option><option>I’ll add someone later</option></select></label>
     <label>Recovery word<input value={recoveryWord} onChange={e => setRecoveryWord(e.target.value.slice(0, 24))} placeholder="A word only you would know" autoComplete="off"/></label>
     <p className="helper">Choose something memorable that isn’t your name, birthday or a family name.</p>
     <div className="privacy-note"><Users size={19}/>A trusted contact can start recovery for you. They never see your records, and you are told every time recovery is attempted.</div>
     <div className="button-row"><button className="secondary" onClick={() => setStep(3)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={recoveryWord.trim().length < 3} onClick={() => setStep(5)}>Continue<ArrowRight size={16}/></button></div>
    </> : <>
     <h1>Your choices, before we start.</h1>
     <p className="muted">Two of these are needed to give you care. The third is entirely up to you.</p>
     {([['care', 'I agree to MyThuso arranging home visits and holding the health information from them.', true], ['popia', 'I have read how my information is used, stored and deleted under POPIA.', true], ['updates', 'Send me optional health tips and product news. (You can say no.)', false]] as const).map(([key, label, required]) =>
      <label className="checkbox" key={key}><input type="checkbox" checked={consents[key]} onChange={e => setConsents({ ...consents, [key]: e.target.checked })}/><span>{label}{required && <em className="required-mark"> Required</em>}</span></label>)}
     <div className="privacy-note"><ShieldCheck size={19}/>Consent is recorded with its version, wording and timestamp so you can see exactly what you agreed to, and withdraw it later.</div>
     <div className="button-row"><button className="secondary" onClick={() => setStep(4)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!consents.care || !consents.popia} onClick={onDone}>Enter MyThuso<ArrowRight size={16}/></button></div>
    </>}
   </div>
  </div>
 </div>;
}
const routes = [
 { id: 'sms', icon: Phone, title: 'Code to my registered number', body: 'Fastest, if you still have the SIM. A new code is sent to the number on the account.', wait: 'About 2 minutes' },
 { id: 'trusted', icon: Users, title: 'Ask my trusted contact', body: 'Nomsa Molefe confirms it’s you. She never sees your health records, and you both get told.', wait: 'Up to 24 hours' },
 { id: 'corner', icon: MapPin, title: 'In person at a Thuso Corner', body: 'Bring your ID to a community site. Used when a number and a trusted contact are both gone.', wait: 'Same day, during opening hours' }
];
function RecoverAccess({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
 const [route, setRoute] = useState('');
 const [submitted, setSubmitted] = useState(false);
 return <div className="onboarding">
  <div className="onboard-panel">
   <img src="/logo.svg" alt="MyThuso" className="onboard-brand"/>
   <h2>Getting you back in.</h2>
   <p className="muted">Losing a phone shouldn’t mean losing your health history. Pick the route that fits your situation.</p>
   <div className="onboard-note"><KeyRound size={17}/>Recovery never reveals your records to the person helping you.</div>
  </div>
  <div className="onboard-form"><div className="onboard-body">
   {submitted ? <>
    <div className="success-icon"><BadgeCheck size={30}/></div>
    <h1>We’ve started your recovery.</h1>
    <p className="muted">{routes.find(r => r.id === route)?.title}. You’ll be told the moment anything changes on your account.</p>
    <div className="review-line"><span>Reference</span><strong>REC-0042</strong></div>
    <div className="review-line"><span>Indicative wait</span><strong>{routes.find(r => r.id === route)?.wait}</strong></div>
    <div className="privacy-note"><ShieldCheck size={19}/>Recovery is rate-limited, audited, and reversible for a cooling-off period. Nobody can complete it while you are still able to say no.</div>
    <NotConnected of="accounts"/>
    <button className="primary full" onClick={onDone}>Continue<ArrowRight size={17}/></button>
   </> : <>
    <Pill>Account recovery</Pill>
    <h1>How can we reach you?</h1>
    <div className="choice-list">{routes.map(({ id, icon: Icon, title, body, wait }) =>
     <label key={id} className={`choice-row ${route === id ? 'selected' : ''}`}><input type="radio" name="route" checked={route === id} onChange={() => setRoute(id)}/><span className="service-icon"><Icon size={20}/></span><span><strong>{title}</strong><small>{body}</small><em>{wait}</em></span></label>)}</div>
    <div className="button-row"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!route} onClick={() => setSubmitted(true)}>Start recovery<ArrowRight size={16}/></button></div>
   </>}
  </div></div>
 </div>;
}

/* Signing out is real: the shell is gone and nothing about the account is reachable until you come
   back through here. With no identity service running this is the app's own door — memory only,
   like the rest of its state. With one running it is a real one-time code to a real number.

   `probed` exists because `live` is a boolean that means two things: not connected, and not asked
   yet. Defaulted to true so an existing caller is unchanged; pass false while the /api/health probe
   is in flight and the screen says nothing rather than flashing a notice on every load. */
export function SignIn({ live, probed = true, onSignIn, onCreate, onRecover }:
 { live: boolean; probed?: boolean; onSignIn: (person?: { phone: string }) => void; onCreate: () => void; onRecover: () => void }) {
 const [phone, setPhone] = useState('');
 const [challenge, setChallenge] = useState<{ id: string; hint?: string } | null>(null);
 const [code, setCode] = useState('');
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const phoneOk = /^0\d{9}$/.test(phone.replace(/\s/g, ''));
 const requestCode = async () => {
  setBusy(true); setError('');
  const started = await startSignIn(phone);
  setBusy(false);
  if (!started.ok) return setError(started.message);
  setChallenge({ id: started.challengeId, hint: started.developmentCode });
  setCode('');
 };
 const submitCode = async () => {
  if (!challenge) return;
  setBusy(true); setError('');
  const verified = await verifyCode(challenge.id, code);
  setBusy(false);
  if (!verified.ok) return setError(verified.message);
  onSignIn(verified.person);
 };
 return <div className="onboarding">
  <div className="onboard-panel">
   <img src="/logo.svg" alt="MyThuso — Help. Health. Home." className="onboard-brand"/>
   <h2>Welcome back.</h2>
   <p className="muted">Your visits, your records and your family’s care are behind this screen.</p>
   <div className="onboard-note"><ShieldCheck size={17}/>You are signed out. Nothing about the account is reachable until you sign in again.</div>
  </div>
  <div className="onboard-form"><div className="onboard-body">
   {!probed ? null : live ? <Pill>Identity service connected</Pill> : <NotConnected of="accounts"/>}
   <h1>Sign in to MyThuso</h1>
   {!live ? <>
    <p className="muted">Sign-in needs the identity service, which is not switched on yet. Carry on as Lerato Molefe to see what an account holds.</p>
    <button className="primary full" onClick={() => onSignIn()}><LogIn size={17}/>Continue as Lerato Molefe</button>
    <button className="secondary full" onClick={onCreate}><UserPlus size={16}/>Create an account</button>
    <button className="text-button" onClick={onRecover}>I’ve lost access to my account</button>
   </> : !challenge ? <>
    <p className="muted">We’ll send a one-time code. There is no password to remember, and none to lose.</p>
    <label>Mobile number<div className="phone-field"><span>+27</span>
     <input inputMode="numeric" autoFocus value={phone} aria-describedby="signin-help"
      onChange={e => { setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12)); setError(''); }} placeholder="082 000 0000"/>
    </div></label>
    <p className="helper" id="signin-help" role="status">{error || 'Standard network rates apply.'}</p>
    <button className="primary full" disabled={!phoneOk || busy} onClick={requestCode}>{busy ? 'Sending…' : <>Send my code<ArrowRight size={17}/></>}</button>
   </> : <>
    <p className="muted">We’ve sent a 6-digit code to <strong>+27 {phone.replace(/^0/, '')}</strong>.{challenge.hint ? <> The service is in development mode, so the code is <strong>{challenge.hint}</strong>.</> : null}</p>
    <label>Verification code</label>
    <CodeInput value={code} onChange={v => { setCode(v); setError(''); }} label="Verification code" describedBy="code-help" invalid={!!error} autoFocus/>
    <p className="helper" id="code-help" role="status">{error || 'The code lasts ten minutes and can be tried five times.'}</p>
    <div className="button-row">
     <button className="secondary" onClick={() => { setChallenge(null); setError(''); }}><ArrowLeft size={16}/>Change number</button>
     <button className="primary" disabled={code.length < 6 || busy} onClick={submitCode}>{busy ? 'Checking…' : 'Verify'}</button>
    </div>
   </>}
   <div className="privacy-note"><ShieldCheck size={19}/>{live
    ? 'The session lives in a cookie this page cannot read, expires when you stop using it, and ends the moment you sign out. No password is stored because none exists.'
    : 'Production sign-in uses a one-time code to a verified number, with step-up checks before records, sharing or export. No password is ever stored.'}</div>
  </div></div>
 </div>;
}
