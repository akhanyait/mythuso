import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Ban, Check, CircleAlert, Fingerprint, KeyRound, MapPin, MessageSquare, Phone, ShieldCheck, Users } from 'lucide-react';
import { Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { locales, type LocaleCode } from '../lib/i18n';
import { startSignIn, verifyCode } from '../lib/auth';
/* With no identity service running, the code comes from the simulated one-time-code office rather
   than from a sentence typed into this screen. What it refuses is the interesting half: it will not
   be told a mobile number, it will not accept a code it did not produce, and it does not survive a
   restart — which is why signing in again after a reload starts from the beginning. */
import type { CodeAsk } from '../lib/simulation';
import { CodeInput } from '../components/Steps';
/* Sign-up and vetting must agree about what a valid identity number is, so the Luhn check digit
   validation lives in lib/identity.ts and is re-exported here for the screens that already use it. */
import { validateSaId } from '../lib/identity';
export { validateSaId };

/* The way in, as one object.
 *
 * Sign-in, the one-time code, recovery and first run are four moments of the same thing, and they
 * now stand on the same card: a sage aside carrying the mark, the promise and whatever is true about
 * this screen, and a column carrying the form. Before this they were a full-bleed two-column page
 * that left half of a 1440 screen saying nothing and clipped itself into a band at 390. surface/
 * door.css has the rest of the reasoning.
 *
 * The mark rather than the lockup. /logo.svg is the full horizontal lockup — icon, wordmark and the
 * tagline "Help. Health. Home." — and the 158px this slot gave it drew that tagline about four
 * pixels tall: not a small logo, an illegible one, and the first thing on the first screen.
 * /icon.svg is the icon out of the same artwork, which is the answer apps/ios reached for in
 * HomeView rather than drawing a second mark. */
function Door({ promise, steps, note, children }: {
 /** One line under the mark. What is behind this door, in the product's own voice. */
 promise: string;
 /** The sign-up rail. Absent on the screens that are a single step. */
 steps?: ReactNode;
 /** The disclosure that belongs to the screen rather than to the form. Icon and sentence. */
 note: ReactNode;
 children: ReactNode;
}) {
 return <div className="door patient-surface">
  <div className="patient-ground aurora m-light" aria-hidden="true"/>
  <div className="door-card glass lead">
   <aside className="door-aside">
    <img src="/brand/mythuso-mark.svg" alt="MyThuso" className="door-mark" width="512" height="512"/>
    <p className="door-promise">{promise}</p>
    {steps}
    <p className="door-note">{note}</p>
   </aside>
   <div className="door-main">{children}</div>
  </div>
 </div>;
}

const steps = ['Welcome', 'Your number', 'Verify', 'Identity', 'Recovery', 'Consent'] as const;
/* Pill rows, the same shape the navigation takes everywhere else, so six steps read as a place you
   are rather than six things you have not done. On a phone they wrap into a strip and only the
   current label is drawn — the rest are clipped rather than removed, so they are still announced. */
const StepRail = ({ step }: { step: number }) =>
 <ol className="door-steps" aria-label="Sign-up progress">
  {steps.map((s, i) =>
   <li key={s} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : i === step ? 'current' : ''}>
    <b aria-hidden="true">{i < step ? <Check size={12}/> : i + 1}</b><span>{s}</span>
   </li>)}
 </ol>;

type Props = { locale: LocaleCode; setLocale: (l: LocaleCode) => void; onDone: () => void; onSkip: () => void; recover?: boolean };
export function Onboarding({ locale, setLocale, onDone, onSkip, recover = false }: Props) {
 const [step, setStep] = useState(0);
 const [recovering, setRecovering] = useState(recover);
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
 return <Door
  promise="One account for your own care, and for the people you look after."
  steps={<StepRail step={step}/>}
  note={<><ShieldCheck size={15}/><span>Nothing you type here leaves your browser until you press the button that sends it.</span></>}>
  {step === 0 ? <>
   <h1>Care that comes to you.</h1>
   <p className="muted">Let’s set up your MyThuso account. It takes about two minutes, and you can stop at any point.</p>
   <NotConnected of="accounts"/>
   <fieldset className="locale-choice"><legend>Choose your language</legend>{locales.map(l => <label key={l.code} className={locale === l.code ? 'selected' : ''}><input type="radio" name="locale" checked={locale === l.code} onChange={() => setLocale(l.code)}/><span>{l.native}</span></label>)}</fieldset>
   <p className="helper">Navigation and the main actions are translated. Clinical wording stays in English until a clinical language review is complete.</p>
   <div className="door-actions"><button className="primary full" onClick={() => setStep(1)}>Create my account<ArrowRight size={17}/></button></div>
   <div className="door-alts"><div className="door-links">
    <button className="text-button" onClick={() => setRecovering(true)}>I’ve lost access to my account</button>
    <button className="text-button" onClick={onSkip}>Skip for now and look around</button>
   </div></div>
  </> : step === 1 ? <>
   <h1>What’s your number?</h1>
   <p className="muted">We’ll send a one-time code. Your number is how nurses reach you on the day of a visit.</p>
   <label>Mobile number<div className="phone-field"><span>+27</span><input inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))} placeholder="082 000 0000" aria-describedby="phone-help"/></div></label>
   <p className="helper" id="phone-help">{phone && !phoneOk ? 'Enter a 10-digit South African mobile number, starting with 0.' : 'Standard network rates apply. We never share your number with advertisers.'}</p>
   <div className="privacy-note"><ShieldCheck size={19}/><span>This step is rate-limited, and a code is bound to the one device that asked for it.</span></div>
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
   <div className="door-alts"><div className="door-links"><button className="text-button" onClick={() => setStep(1)}>Use a different number</button></div></div>
  </> : step === 3 ? <>
   <h1>Let’s confirm it’s you.</h1>
   <p className="muted">Your identity number lets a nurse confirm the right patient at the door, and keeps someone else’s records out of your account.</p>
   <label>South African ID number<input inputMode="numeric" value={idNumber} onBlur={() => setIdTouched(true)} onChange={e => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 13))} className={idTouched && idNumber && !idCheck.ok ? 'field-error' : ''} aria-invalid={idTouched && !!idNumber && !idCheck.ok} aria-describedby="id-help" placeholder="8001015009087"/></label>
   <p className="helper" id="id-help" role="status">{idNumber && idTouched && !idCheck.ok ? idCheck.reason : idCheck.ok ? `Checks out. Date of birth ${idCheck.birth}.` : 'Thirteen digits, as printed on the document.'}</p>
   <div className="privacy-note"><Fingerprint size={19}/><span>Verification runs against the Department of Home Affairs through an accredited provider, under a documented lawful basis. MyThuso never keeps a copy of the document itself.</span></div>
   <div className="button-row"><button className="secondary" onClick={() => setStep(2)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!idCheck.ok} onClick={() => setStep(4)}>Continue<ArrowRight size={16}/></button></div>
   <div className="door-alts"><div className="door-links"><button className="text-button" onClick={() => setStep(4)}>I don’t have an SA ID number</button></div></div>
  </> : step === 4 ? <>
   <h1>If you ever lose your phone.</h1>
   <p className="muted">Two ways back in, so a lost handset never means losing your health history.</p>
   <label>Trusted family contact<select value={trusted} onChange={e => setTrusted(e.target.value)}><option>Nomsa Molefe · Mother</option><option>Thabo Molefe · Son</option><option>I’ll add someone later</option></select></label>
   <label>Recovery word<input value={recoveryWord} onChange={e => setRecoveryWord(e.target.value.slice(0, 24))} placeholder="A word only you would know" autoComplete="off"/></label>
   <p className="helper">Choose something memorable that isn’t your name, birthday or a family name.</p>
   <div className="privacy-note"><Users size={19}/><span>A trusted contact can start recovery for you. They never see your records, and you are told every time recovery is attempted.</span></div>
   <div className="button-row"><button className="secondary" onClick={() => setStep(3)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={recoveryWord.trim().length < 3} onClick={() => setStep(5)}>Continue<ArrowRight size={16}/></button></div>
  </> : <>
   <h1>Your choices, before we start.</h1>
   <p className="muted">Two of these are needed to give you care. The third is entirely up to you.</p>
   {([['care', 'I agree to MyThuso arranging home visits and holding the health information from them.', true], ['popia', 'I have read how my information is used, stored and deleted under POPIA.', true], ['updates', 'Send me optional health tips and product news. (You can say no.)', false]] as const).map(([key, label, required]) =>
    <label className="checkbox" key={key}><input type="checkbox" checked={consents[key]} onChange={e => setConsents({ ...consents, [key]: e.target.checked })}/><span>{label}{required && <em className="required-mark"> Required</em>}</span></label>)}
   <div className="privacy-note"><ShieldCheck size={19}/><span>Consent is recorded with its version, wording and timestamp so you can see exactly what you agreed to, and withdraw it later.</span></div>
   <div className="button-row"><button className="secondary" onClick={() => setStep(4)}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!consents.care || !consents.popia} onClick={onDone}>Enter MyThuso<ArrowRight size={16}/></button></div>
  </>}
 </Door>;
}
const routes = [
 { id: 'sms', icon: Phone, title: 'Code to my registered number', body: 'Fastest, if you still have the SIM. A new code is sent to the number on the account.', wait: 'About 2 minutes' },
 { id: 'trusted', icon: Users, title: 'Ask my trusted contact', body: 'Nomsa Molefe confirms it’s you. She never sees your health records, and you both get told.', wait: 'Up to 24 hours' },
 { id: 'corner', icon: MapPin, title: 'In person at a Thuso Corner', body: 'Bring your ID to a community site. Used when a number and a trusted contact are both gone.', wait: 'Same day, during opening hours' }
];
function RecoverAccess({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
 const [route, setRoute] = useState('');
 const [submitted, setSubmitted] = useState(false);
 return <Door
  promise="Losing a phone shouldn’t mean losing your health history."
  note={<><KeyRound size={15}/><span>Recovery never reveals your records to the person helping you.</span></>}>
  {submitted ? <>
   <div className="success-icon"><BadgeCheck size={30}/></div>
   <h1>We’ve started your recovery.</h1>
   <p className="muted">{routes.find(r => r.id === route)?.title}. You’ll be told the moment anything changes on your account.</p>
   <NotConnected of="accounts"/>
   <div className="review-line"><span>Reference</span><strong>REC-0042</strong></div>
   <div className="review-line"><span>Indicative wait</span><strong>{routes.find(r => r.id === route)?.wait}</strong></div>
   <div className="privacy-note"><ShieldCheck size={19}/><span>Recovery is rate-limited, audited, and reversible for a cooling-off period. Nobody can complete it while you are still able to say no.</span></div>
   <div className="door-actions"><button className="primary full" onClick={onDone}>Continue<ArrowRight size={17}/></button></div>
  </> : <>
   <Pill>Account recovery</Pill>
   <h1>How can we reach you?</h1>
   <p className="muted">Pick the route that fits your situation. Each one takes a different length of time and asks a different thing of you.</p>
   <div className="choice-list">{routes.map(({ id, icon: Icon, title, body, wait }) =>
    <label key={id} className={`choice-row ${route === id ? 'selected' : ''}`}><input type="radio" name="route" checked={route === id} onChange={() => setRoute(id)}/><span className="service-icon"><Icon size={20}/></span><span><strong>{title}</strong><small>{body}</small><em>{wait}</em></span></label>)}</div>
   <div className="button-row"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/>Back</button><button className="primary" disabled={!route} onClick={() => setSubmitted(true)}>Start recovery<ArrowRight size={16}/></button></div>
  </>}
 </Door>;
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
 /* The simulated channel's side of this screen. `attempt` is what the office is seeded on and it is
    the only thing that crosses: a new attempt is a new message, which is also how a failed delivery
    is answered — the channel refuses to retry one, because a simulated failure is a chosen failure
    and sending the same message again until it works would unchoose it. */
 const [attempt, setAttempt] = useState(0);
 const [ask, setAsk] = useState<CodeAsk | null>(null);
 const phoneOk = /^0\d{9}$/.test(phone.replace(/\s/g, ''));
 /* The simulated channel arrives on a dynamic import when this screen opens on the simulated side, never with the
    patient's first load. lib/simulation carries apps/api/src/simulation and, behind it, every supplier door in
    packages/catalog/feeds.json, and each engine that adds a door would otherwise add it to the first load of a patient
    who only wanted to see her visits. It is loaded before anything can be pressed rather than awaited inside the press:
    a press that waited would leave the previous answer on the screen until the new one came, so a person asking for a
    new code would for a moment be shown the old one as if it still worked. Until it has loaded the buttons that ask it
    are not offered, and the refusal still arrives from the simulator in the capability's own words. */
 const [simulation, setSimulation] = useState<typeof import('../lib/simulation') | null>(null);
 useEffect(() => {
  if (live) return;
  let open = true;
  void import('../lib/simulation').then(loaded => { if (open) setSimulation(loaded); });
  return () => { open = false; };
 }, [live]);
 const askAgain = () => {
  if (!simulation) return;
  const next = attempt + 1; setAttempt(next); setCode(''); setError('');
  setAsk(simulation.askForCode(next));
 };
 const submitSimulatedCode = () => {
  if (!ask || ask.refused !== undefined || !simulation) return;
  const checked = simulation.checkCode(ask.challenge, code);
  if (checked.refused !== undefined) return setError(checked.refused);
  onSignIn({ phone });
 };
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
 /* The other two ways in, in one place and under both branches. They used to exist only on the
    simulated side, so the moment an identity service answered — which is the state the founder
    tests in — a person with no account had no way to make one and a person who had lost their
    phone had nowhere to go. */
 const otherWaysIn = <div className="door-alts">
  {!live ? <button className="secondary full" onClick={() => onSignIn()}>Continue as Lerato Molefe</button> : null}
  <div className="door-links">
   <button className="text-button" onClick={onCreate}>Create an account</button>
   <button className="text-button" onClick={onRecover}>I’ve lost access to my account</button>
  </div>
 </div>;
 return <Door
  promise="Your visits, your records and your family’s care are behind this screen."
  note={<><ShieldCheck size={15}/><span>You are signed out. Nothing about the account is reachable until you sign in again.</span></>}>
  {/* The service answering and the capability being connected are two different facts, and this
      line used to conflate them: when apps/api was reachable it showed a green "Identity service
      connected" and *dropped* the notice, so the screen went quiet at exactly the moment it had
      more to say. The contract's `a-simulation-says-so` forbids that in as many words — no screen
      may be quieter for being simulated than it was for being absent — and this is the first screen
      a person sees. The service running on this machine cannot send a message to a handset; that
      needs the SMS provider `accounts` is still blocked on. So the chip says what is true, and the
      notice stays either way. */}
  {probed && live ? <Pill>Identity service is answering on this machine</Pill> : null}
  <h1>Sign in to MyThuso</h1>
  {!live ? <>
   <p className="muted">The identity service is not switched on. A simulated channel produces the code here instead, so the whole of signing in can be walked — including the part where the message does not arrive.</p>
   {probed ? <NotConnected of="accounts"/> : null}
   <label>Mobile number<div className="phone-field"><span>+27</span>
    <input inputMode="numeric" value={phone} aria-describedby="sim-help" placeholder="082 000 0000"
     onChange={e => { setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12)); setError(''); }}/>
   </div></label>
   {/* The number is never handed to the simulator. It refuses to be told where to send — see the
       accounts capability's own first refusal — so what crosses is the ordinal of the attempt, and
       the number stays in this tab for the sole purpose of being shown back to the person who
       typed it. Nothing can leave the machine because nothing here knows anywhere to leave for. */}
   <p className="helper" id="sim-help" role="status">{error || 'Your number stays in this tab. The simulator is never told where to send, and refuses to be.'}</p>
   {!ask ? <div className="door-actions"><button className="primary full" disabled={!phoneOk || !simulation} onClick={askAgain}>Send my code<ArrowRight size={17}/></button></div> : null}
   {ask?.refused !== undefined ? <div className="privacy-note"><Ban size={19}/><span>{ask.refused}</span></div> : null}
   {ask && ask.refused === undefined && ask.status === 'failed' ? <>
    {/* The state the seam exists for. feeds.json says a provider reporting only success turns every
        silence into a success by default, and the silences are everybody who cannot sign in — so
        the failure is shown as what it is, with the code withheld, because a person whose message
        never arrived does not have one. */}
    <div className="privacy-note"><CircleAlert size={19}/><span>Your code did not arrive. {ask.failureReason} Nothing else has happened, and no code has been used up.</span></div>
    <div className="door-actions"><button className="primary full" onClick={askAgain}><MessageSquare size={16}/>Ask for a new code</button></div>
   </> : null}
   {ask && ask.refused === undefined && ask.code ? <>
    <div className="privacy-note"><KeyRound size={19}/><span>Your code is <strong>{ask.code}</strong>. It was made on this machine and no message left it.</span></div>
    <label>Verification code</label>
    <CodeInput value={code} onChange={v => { setCode(v); setError(''); }} label="Verification code" describedBy="sim-help" invalid={!!error} autoFocus/>
    <div className="button-row">
     <button className="secondary" onClick={askAgain}><MessageSquare size={16}/>Ask for a new code</button>
     <button className="primary" disabled={code.length < 6} onClick={submitSimulatedCode}>Verify</button>
    </div>
   </> : null}
  </> : !challenge ? <>
   <p className="muted">We’ll send a one-time code. There is no password to remember, and none to lose.</p>
   <NotConnected of="accounts"/>
   <label>Mobile number<div className="phone-field"><span>+27</span>
    <input inputMode="numeric" value={phone} aria-describedby="signin-help"
     onChange={e => { setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12)); setError(''); }} placeholder="082 000 0000"/>
   </div></label>
   <p className="helper" id="signin-help" role="status">{error || 'Standard network rates apply.'}</p>
   <div className="door-actions"><button className="primary full" disabled={!phoneOk || busy} onClick={requestCode}>{busy ? 'Sending…' : <>Send my code<ArrowRight size={17}/></>}</button></div>
  </> : <>
   <p className="muted">We’ve sent a 6-digit code to <strong>+27 {phone.replace(/^0/, '')}</strong>.{challenge.hint ? <> The service is in development mode, so the code is <strong>{challenge.hint}</strong>.</> : null}</p>
   <NotConnected of="accounts"/>
   <label>Verification code</label>
   <CodeInput value={code} onChange={v => { setCode(v); setError(''); }} label="Verification code" describedBy="code-help" invalid={!!error} autoFocus/>
   <p className="helper" id="code-help" role="status">{error || 'The code lasts ten minutes and can be tried five times.'}</p>
   <div className="button-row">
    <button className="secondary" onClick={() => { setChallenge(null); setError(''); }}><ArrowLeft size={16}/>Change number</button>
    <button className="primary" disabled={code.length < 6 || busy} onClick={submitCode}>{busy ? 'Checking…' : 'Verify'}</button>
   </div>
  </>}
  {otherWaysIn}
  <div className="privacy-note"><ShieldCheck size={19}/><span>{live
   ? 'The session lives in a cookie this page cannot read, expires when you stop using it, and ends the moment you sign out. No password is stored because none exists.'
   : 'Production sign-in uses a one-time code to a verified number, with step-up checks before records, sharing or export. No password is ever stored.'}</span></div>
 </Door>;
}
