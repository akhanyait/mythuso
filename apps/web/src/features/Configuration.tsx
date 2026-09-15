import { useId, useState, type FormEvent } from 'react';
import { CircleAlert, ShieldAlert, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import {
 reviewStateOf, settingsContract, settingsScreen, snapshotOf,
 type Change, type Limits, type Provenance, type Refusal, type Setting, type SettingsBlock, type Snapshot, type Window
} from '../../../../packages/engines/src/settings/shape.ts';
import { adminOnDuty, applyChange, engineIds, previewChange, settingsEngineOf, useSettingsHistories } from '../lib/settings';
import { whoIs } from '../lib/roles';

/* Configuration, on the back office: every setting every engine works to, in one place.
 *
 * The founder instructed on 15 September 2026 that the questions the programme kept asking become admin
 * settings. So this screen is drawn entirely from the contracts: packages/catalog/settings.json gives the
 * words and the shape, and each engine's own contract gives its settings. Nothing about a particular
 * setting is written here — not a name, not a minute, not a range — so the day a lead adds a setting to
 * their engine's contract it appears on this screen with its default, its provenance, its limits and its
 * history, and a renderer per type draws and edits it.
 *
 * READ BEFORE IT IS CHANGED. Each setting shows what is in force, the default and who decided it (or that
 * nobody has), what an admin may set it to — itself a proposal, and it says so — what a change reaches,
 * what no value may do, whether it waits on a clinical review, and every change made to it. Nothing on
 * the screen edits or removes a row of that history.
 *
 * A CHANGE IS REVIEWED, THEN CONFIRMED. The review asks the engines' own rules the same question the
 * change does, so a value outside its limits, a missing reason or a stale version is refused in the
 * contract's sentence before anybody is asked to confirm anything, and the confirmation says in the
 * setting's own words what the change will and will not reach. A clinical review is confirmed by the
 * capability's holder through the engine's review route, never from this screen: the back office opens
 * as an admin, and an admin does not confirm a clinical review.
 *
 * Held in memory by lib/settings.ts and nowhere else. The preview sentence at the top says what that
 * means: no phone, desk or patient is told, and a reload puts the defaults back.
 */
const say = settingsScreen;
const fill = (sentence: string, values: Readonly<Record<string, string>>) => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
const ZONE = 'Africa/Johannesburg';
const dayOf = (on: string) => new Date(`${on}T12:00:00+02:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONE });
const clockOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE });
const whenOf = (at: number) => `${new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: ZONE })}, ${clockOf(at)}`;
const roleName = (id: string) => vetting.roles.find(role => role.id === id)?.name ?? id;
const capabilityName = (id: string) => vetting.capabilities.find(capability => capability.id === id)?.name.toLowerCase() ?? id;
const personOf = (ref: string) => ref === adminOnDuty() ? `${whoIs(ref, '').subject.name} · ${ref}` : ref;
const dayName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
const NUMBERS = new Set(['minutes', 'count', 'moneyCents', 'percentage']);
const itemsOf = (limits: Limits): Limits => ({ ...limits, type: limits.of!, of: undefined, items: undefined });

/* ---- How a value reads ---------------------------------------------------------------------------- */

function amount(limits: Limits, value: string): string {
 switch (limits.type) {
  case 'minutes': return fill(say.values.minutes, { value });
  case 'count': return fill(say.values.count, { value, unit: limits.unit ?? '' });
  case 'percentage': return fill(say.values.percentage, { value });
  default: return value;
 }
}

export function valueText(limits: Limits, value: unknown): string {
 if (value === undefined || value === null) return say.values.empty;
 switch (limits.type) {
  case 'minutes': case 'count': case 'percentage': return amount(limits, String(value));
  case 'moneyCents': return fill(say.values.moneyCents, { rand: (Number(value) / 100).toFixed(2) });
  case 'boolean': return limits.allowed?.find(choice => choice.value === value)?.label ?? (value ? say.values.on : say.values.off);
  case 'enum': return limits.allowed?.find(choice => choice.value === value)?.label ?? String(value);
  case 'text': return `“${String(value)}”`;
  case 'roleList': {
   const roles = value as readonly string[];
   return roles.length ? roles.map(roleName).join(', ') : say.values.noRoles;
  }
  case 'schedule': {
   const windows = value as readonly Window[];
   return windows.length ? windows.map(w => fill(say.values.window, {
    post: limits.posts?.find(post => post.id === w.post)?.label ?? w.post,
    days: w.days.length === settingsContract.days.length ? say.values.everyDay : w.days.map(dayName).join(', '),
    from: w.from, to: w.to
   })).join('; ') : say.values.noWindows;
  }
  case 'list': {
   const items = value as readonly unknown[];
   const of = itemsOf(limits);
   if (!items.length) return say.values.empty;
   /* A list of minutes reads as its numbers and then the unit once, the way a nurse reads her steps. */
   return NUMBERS.has(of.type) && of.type !== 'moneyCents' ? amount(of, items.join(', ')) : items.map(item => valueText(of, item)).join(', ');
  }
  case 'record': return (limits.parts ?? []).map(part => `${part.label} ${valueText(part, (value as Record<string, unknown>)[part.key])}`).join(' · ');
 }
}

function limitsText(limits: Limits): string {
 switch (limits.type) {
  case 'minutes': case 'count': case 'moneyCents': case 'percentage':
   return limits.bounds ? fill(say.range, { lowest: valueText(limits, limits.bounds.lowest.value), highest: valueText(limits, limits.bounds.highest.value) }) : '';
  case 'boolean': case 'enum': return limits.allowed ? fill(say.choices, { values: limits.allowed.map(choice => choice.label).join(', ') }) : '';
  case 'text': return limits.maxLength ? fill(say.maxLength, { count: String(limits.maxLength.value) }) : '';
  case 'roleList': return [fill(say.roles, { roles: (limits.allowedRoles?.roles ?? []).map(roleName).join(', ') }), limits.items ? fill(say.listLength, { lowest: String(limits.items.lowest.value), highest: String(limits.items.highest.value) }) : ''].filter(Boolean).join(' · ');
  case 'schedule': return fill(say.posts, { posts: (limits.posts ?? []).map(post => post.role === null ? fill(say.postWithoutRole, { post: post.label }) : post.label).join(', ') });
  case 'list': return [limitsText(itemsOf(limits)), limits.items ? fill(say.listLength, { lowest: String(limits.items.lowest.value), highest: String(limits.items.highest.value) }) : ''].filter(Boolean).join(' · ');
  case 'record': return (limits.parts ?? []).map(part => `${part.label}: ${limitsText(part)}`).join(' · ');
 }
}

/* Every bound, allowed value, maximum and allowed role list a setting carries, so the screen can say
   whether what an admin may set was ever decided or is still somebody's proposal. */
const limitProvenance = (limits: Limits): Provenance[] => [
 limits.bounds?.lowest, limits.bounds?.highest, limits.maxLength, limits.allowedRoles, limits.items?.lowest, limits.items?.highest,
 ...(limits.allowed ?? []), ...(limits.parts ?? []).flatMap(limitProvenance)
].filter((entry): entry is Provenance => entry !== undefined);

const provenanceText = (entry: Provenance) => entry.decidedBy && entry.decidedOn
 ? fill(say.decided, { who: entry.decidedBy, on: dayOf(entry.decidedOn) })
 : `${say.undecided}${entry.proposedBy ? ` · ${fill(say.proposedBy, { who: entry.proposedBy })}` : ''}`;

/* ---- How a value is edited ------------------------------------------------------------------------ */

/* What the form holds while an admin types: the text of a number rather than the number, so that a blank
   or a word reaches the rules as what it is and is refused in the contract's sentence, rather than this
   form deciding what the admin meant. */
type Raw = unknown;

function rawOf(limits: Limits, value: unknown): Raw {
 switch (limits.type) {
  case 'minutes': case 'count': case 'percentage': return String(value);
  case 'moneyCents': return (Number(value) / 100).toFixed(2);
  case 'list': return (value as readonly unknown[]).map(item => rawOf(itemsOf(limits), item)).join(', ');
  case 'record': return Object.fromEntries((limits.parts ?? []).map(part => [part.key, rawOf(part, (value as Record<string, unknown>)[part.key])]));
  case 'roleList': return [...(value as readonly string[])];
  case 'schedule': return (value as readonly Window[]).map(w => ({ ...w, days: [...w.days] }));
  default: return value;
 }
}

function valueOf(limits: Limits, raw: Raw): unknown {
 const number = (text: string) => text.trim() === '' ? Number.NaN : Number(text.trim().replace(',', '.'));
 switch (limits.type) {
  case 'minutes': case 'count': case 'percentage': return String(raw).trim() === '' ? undefined : number(String(raw));
  case 'moneyCents': return String(raw).trim() === '' ? undefined : Math.round(number(String(raw)) * 100);
  case 'list': return String(raw).split(',').map(part => NUMBERS.has(limits.of ?? '') ? valueOf(itemsOf(limits), part) ?? Number.NaN : part.trim());
  case 'record': return Object.fromEntries((limits.parts ?? []).map(part => [part.key, valueOf(part, (raw as Record<string, Raw>)[part.key])]));
  default: return raw;
 }
}

const editorLabel = (limits: Limits) => fill(say.editors[limits.type as keyof typeof say.editors] ?? say.editors.record, { unit: limits.unit ?? '' });

function Editor({ limits, raw, onRaw, id, label, disabled }: { limits: Limits; raw: Raw; onRaw: (raw: Raw) => void; id: string; label: string; disabled: boolean }) {
 switch (limits.type) {
  case 'minutes': case 'count': case 'percentage': case 'moneyCents': case 'list':
   return <>
    <label htmlFor={id}>{label}</label>
    <input id={id} inputMode={limits.type === 'list' ? 'text' : limits.type === 'moneyCents' ? 'decimal' : 'numeric'} value={String(raw)} disabled={disabled} onChange={event => onRaw(event.target.value)}/>
   </>;
  case 'text':
   return <>
    <label htmlFor={id}>{label}</label>
    <textarea id={id} rows={4} value={String(raw)} disabled={disabled} aria-describedby={id + '-limit'} onChange={event => onRaw(event.target.value)}/>
    <p className="helper" id={id + '-limit'}>{limitsText(limits)}</p>
   </>;
  case 'boolean': case 'enum': {
   const choices = limits.allowed ?? [{ value: true, label: say.values.on }, { value: false, label: say.values.off }];
   return <fieldset className="cf-choices" disabled={disabled}>
    <legend>{label}</legend>
    {choices.map(choice => <label className="cf-choice" key={String(choice.value)}>
     <input type="radio" name={id} checked={raw === choice.value} onChange={() => onRaw(choice.value)}/>{choice.label}
    </label>)}
   </fieldset>;
  }
  case 'roleList': {
   const chosen = raw as string[];
   return <fieldset className="cf-choices" disabled={disabled}>
    <legend>{label}</legend>
    {(limits.allowedRoles?.roles ?? []).map(role => <label className="cf-choice" key={role}>
     <input type="checkbox" checked={chosen.includes(role)} onChange={event => onRaw(event.target.checked ? [...chosen, role] : chosen.filter(r => r !== role))}/>{roleName(role)}
    </label>)}
   </fieldset>;
  }
  case 'schedule': {
   const windows = raw as Window[];
   const put = (i: number, next: Partial<Window>) => onRaw(windows.map((w, j) => j === i ? { ...w, ...next } : w));
   /* A post no role on the register holds is not offered: nobody could be on it, and the rules refuse a
      window for it anyway. The limits line above says it is on the rota and why it has no hours. */
   const held = (limits.posts ?? []).filter(post => post.role !== null);
   return <fieldset className="cf-choices" disabled={disabled}>
    <legend>{label}</legend>
    {windows.map((w, i) => <div className="cf-window" key={i}>
     <label htmlFor={`${id}-${i}-post`}>{say.editors.post}</label>
     <select id={`${id}-${i}-post`} value={w.post} onChange={event => put(i, { post: event.target.value })}>
      {held.map(post => <option key={post.id} value={post.id}>{post.label}</option>)}
     </select>
     <fieldset className="cf-choices cf-days"><legend>{say.editors.days}</legend>
      {settingsContract.days.map(day => <label className="cf-choice" key={day}>
       <input type="checkbox" checked={w.days.includes(day)} onChange={event => put(i, { days: event.target.checked ? settingsContract.days.filter(d => d === day || w.days.includes(d)) : w.days.filter(d => d !== day) })}/>{dayName(day)}
      </label>)}
     </fieldset>
     <div className="cf-hours">
      <label>{say.editors.from}<input inputMode="numeric" value={w.from} onChange={event => put(i, { from: event.target.value })}/></label>
      <label>{say.editors.to}<input inputMode="numeric" value={w.to} onChange={event => put(i, { to: event.target.value })}/></label>
     </div>
     <button type="button" className="secondary" onClick={() => onRaw(windows.filter((_, j) => j !== i))}>{say.editors.removeWindow}</button>
    </div>)}
    <button type="button" className="secondary" onClick={() => onRaw([...windows, { post: held[0]?.id ?? '', days: [...settingsContract.days], from: '', to: '' }])}>{say.editors.addWindow}</button>
   </fieldset>;
  }
  case 'record': {
   const parts = raw as Record<string, Raw>;
   return <fieldset className="cf-choices" disabled={disabled}>
    <legend>{label}</legend>
    {(limits.parts ?? []).map(part => <Editor key={part.key} limits={part} raw={parts[part.key]} id={`${id}-${part.key}`} label={part.unit ? `${part.label} (${part.unit})` : part.label} disabled={disabled}
     onRaw={next => onRaw({ ...parts, [part.key]: next })}/>)}
   </fieldset>;
  }
 }
}

/* ---- The screen ----------------------------------------------------------------------------------- */

export function Configuration({ engine, onEngine }: { engine: string; onEngine: (engine: string) => void }) {
 const histories = useSettingsHistories();
 const id = useId();
 const [query, setQuery] = useState('');
 const blocks = engineIds.map(e => settingsEngineOf(e).block);
 const total = blocks.reduce((sum, block) => sum + block.items.length, 0);
 const words = query.trim().toLowerCase();
 const matches = (block: SettingsBlock, setting: Setting) => !words || [setting.label, setting.help, setting.key, block.heading, block.intro].join(' ').toLowerCase().includes(words);
 const groups = blocks.filter(block => !engine || block.engine === engine)
  .map(block => ({ block, items: block.items.filter(setting => matches(block, setting)) }))
  .filter(group => group.items.length);
 const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
 return <div className="cf-area">
  <div className="privacy-note"><SlidersHorizontal size={19}/>{say.intro}</div>
  <div className="privacy-note alert"><CircleAlert size={19}/>{say.preview}</div>
  <div className="cf-tools" role="search">
   <div>
    <label htmlFor={id + '-query'}>{say.search}</label>
    <input id={id + '-query'} type="search" value={query} aria-describedby={id + '-query-help'} onChange={event => setQuery(event.target.value)}/>
    <p className="helper" id={id + '-query-help'}>{say.searchHelp}</p>
   </div>
   <div>
    <label htmlFor={id + '-engine'}>{say.engine}</label>
    <select id={id + '-engine'} value={engine} onChange={event => onEngine(event.target.value)}>
     <option value="">{say.everyEngine}</option>
     {blocks.map(block => <option key={block.engine} value={block.engine}>{block.heading}</option>)}
    </select>
   </div>
  </div>
  <p className="ss-version" role="status">{fill(say.shown, { shown: String(shown), total: String(total) })}</p>
  {groups.length
   ? groups.map(group => <EngineGroup key={group.block.engine} block={group.block} items={group.items} history={histories[group.block.engine] ?? []}/>)
   : <p className="helper">{say.noMatch}</p>}
 </div>;
}

function EngineGroup({ block, items, history }: { block: SettingsBlock; items: readonly Setting[]; history: readonly Change[] }) {
 const id = useId();
 const [open, setOpen] = useState<string | null>(null);
 const [applied, setApplied] = useState<Change | null>(null);
 const snapshot = snapshotOf(block, history);
 return <section className="ss-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{block.heading}</h2></div>
  <p className="helper">{block.intro}</p>
  <p className="ss-version" role="status">{fill(say.version, { version: String(snapshot.settingsVersion) })}{applied ? ` · ${fill(say.applied, { version: String(applied.settingsVersion), at: clockOf(applied.at) })}` : ''}</p>
  <ol className="panel ss-timings">{items.map(setting => <SettingItem key={setting.key} engine={block.engine} setting={setting} snapshot={snapshot}
   history={history.filter(change => change.setting === setting.key)} open={open === setting.key}
   onOpen={() => { setOpen(setting.key); setApplied(null); }} onClose={() => setOpen(null)} onApplied={change => { setApplied(change); setOpen(null); }}/>)}</ol>
 </section>;
}

function SettingItem({ engine, setting, snapshot, history, open, onOpen, onClose, onApplied }: {
 engine: string; setting: Setting; snapshot: Snapshot; history: readonly Change[]; open: boolean; onOpen: () => void; onClose: () => void; onApplied: (change: Change) => void;
}) {
 const inForce = snapshot.values[setting.key];
 const last = history.at(-1);
 const review = reviewStateOf(setting, snapshot, []);
 const limits = limitsText(setting);
 const bounds = limitProvenance(setting);
 return <li className="ss-timing">
  <div className="ss-timing-head">
   <strong>{setting.label}</strong>
   <span className="ss-in-force"><small>{say.inForce}</small><b>{valueText(setting, inForce)}</b></span>
  </div>
  <p className="ss-help">{setting.help}</p>
  {review.required && (review.reviewed
   ? <span className="pill cf-review"><ShieldCheck size={15}/>{fill(say.reviewed, { who: review.reviewed.byRef, on: review.reviewed.on ? dayOf(review.reviewed.on) : review.reviewed.at === null ? '' : whenOf(review.reviewed.at) })}</span>
   : <span className="pill cf-review is-unreviewed"><ShieldAlert size={15}/>{say.notReviewed}</span>)}
  <p className="ss-meta">{fill(say.defaultIs, { value: valueText(setting, setting.default.value) })} · {provenanceText(setting.default)}</p>
  {/* Limits that carry no provenance — a rota's posts — were never decided by anybody, so they read as a
      proposal rather than borrowing the word "decided" from an empty list. */}
  {limits && <p className="ss-meta">{limits}. {bounds.every(entry => entry.decidedBy === null) ? say.limitsAreProposals : say.limitsDecided}</p>}
  <dl className="cf-rules">
   <div><dt>{say.appliesTo}</dt><dd>{setting.appliesTo}</dd></div>
   {setting.guardrail && <div><dt>{say.guardrail}</dt><dd>{setting.guardrail.statement}</dd></div>}
   {review.required && !review.reviewed && <div><dt>{say.notReviewed}</dt><dd>{fill(say.reviewWaitsOn, { capability: capabilityName(review.required) })}</dd></div>}
  </dl>
  <p className="ss-meta">{last ? fill(say.lastChanged, { who: personOf(last.byRef), when: whenOf(last.at) }) : say.neverChanged}</p>
  <details className="cf-history">
   <summary>{say.historyHeading} ({history.length})</summary>
   {history.length
    ? <div className="table-scroll"><table className="result-table admin-table ss-history">
      <caption>{say.historyNeverEdited}</caption>
      <thead><tr><th scope="col">{say.when}</th><th scope="col">{say.who}</th><th scope="col">{say.from}</th><th scope="col">{say.to}</th><th scope="col">{say.why}</th></tr></thead>
      <tbody>{history.map(change => <tr key={change.settingsVersion}>
       <td>{whenOf(change.at)}</td><td>{personOf(change.byRef)}</td><td>{valueText(setting, change.from)}</td><td>{valueText(setting, change.to)}</td><td>{change.reason}</td>
      </tr>)}</tbody>
     </table></div>
    : <p className="helper">{say.historyEmpty} {say.historyNeverEdited}</p>}
  </details>
  {open
   ? <ChangeForm engine={engine} setting={setting} expectedVersion={snapshot.settingsVersion} from={inForce} onClose={onClose} onApplied={onApplied}/>
   : <button className="secondary" onClick={onOpen}>{say.change}<span className="visually-hidden"> {setting.label}</span></button>}
 </li>;
}

function ChangeForm({ engine, setting, expectedVersion, from, onClose, onApplied }: {
 engine: string; setting: Setting; expectedVersion: number; from: unknown; onClose: () => void; onApplied: (change: Change) => void;
}) {
 const id = useId();
 const [raw, setRaw] = useState<Raw>(() => rawOf(setting, from));
 const [reason, setReason] = useState('');
 const [review, setReview] = useState<Change | null>(null);
 const [refused, setRefused] = useState<Refusal | null>(null);
 const request = () => ({ setting: setting.key, value: valueOf(setting, raw), reason, expectedVersion });
 const check = (event: FormEvent) => {
  event.preventDefault();
  const result = previewChange(engine, request());
  setRefused(result.ok ? null : result.refusal);
  setReview(result.ok ? result.change : null);
 };
 const confirm = () => {
  const result = applyChange(engine, request());
  if (!result.ok) { setRefused(result.refusal); setReview(null); return; }
  onApplied(result.change);
 };
 return <form className="ss-form" onSubmit={check} aria-label={`${say.change} ${setting.label}`}>
  <Editor limits={setting} raw={raw} id={id + '-value'} label={editorLabel(setting)} disabled={!!review} onRaw={next => { setRaw(next); setRefused(null); }}/>
  <label htmlFor={id + '-reason'}>{say.reason}</label>
  <textarea id={id + '-reason'} value={reason} rows={3} disabled={!!review} aria-describedby={id + '-help'}
   onChange={event => { setReason(event.target.value); setRefused(null); }}/>
  <p className="helper" id={id + '-help'}>{say.reasonHelp}</p>
  {refused && <p className="fs-refused" role="alert">{refused.statement}</p>}
  {review
   ? <div className="ss-confirm" role="group" aria-labelledby={id + '-confirm'}>
     <strong id={id + '-confirm'}>{fill(say.confirmQuestion, { setting: setting.label, from: valueText(setting, from), to: valueText(setting, review.to) })}</strong>
     <p>{setting.appliesTo}</p>
     {setting.reviewRequired && <p>{say.notReviewed}. {fill(say.reviewWaitsOn, { capability: capabilityName(setting.reviewRequired) })}</p>}
     <div className="button-row">
      <button type="button" className="secondary" onClick={() => setReview(null)}>{say.cancel}</button>
      <button type="button" className="primary" autoFocus onClick={confirm}>{say.confirm}</button>
     </div>
    </div>
   : <div className="button-row">
     <button type="button" className="secondary" onClick={onClose}>{say.cancel}</button>
     <button type="submit" className="primary">{say.review}</button>
    </div>}
 </form>;
}
