import { Suspense, lazy, useId, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Search, ShieldAlert, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import vetting from '../../../../packages/catalog/vetting.json' with { type: 'json' };
import {
 reviewStateOf, settingsContract, settingsScreen, snapshotOf,
 type Change, type Limits, type Provenance, type Refusal, type Setting, type SettingsBlock, type Snapshot, type Window
} from '../../../../packages/engines/src/settings/shape.ts';
import { adminOnDuty, applyChange, doctorOnDuty, engineIds, previewChange, reviewsOf, settingsEngineOf, useSettingsHistories, useSettingsReviews } from '../lib/settings';
import { whoIs } from '../lib/roles';
import { useFounderGate } from '../lib/founder-gate';
import { useWideLayout } from '../lib/layout';

/* The founder's sign-in, drawn where the editor would be while the gate is shut, on a dynamic import so
   nobody who does not open a settings screen downloads it. */
const FounderGatePanel = lazy(() => import('./portal/gilbertone/founder/FounderAccess').then(m => ({ default: m.FounderGatePanel })));
import { ChoiceChips, RangeSlider, Switch } from './portal/Fields';

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
const personOf = (ref: string) => ref === adminOnDuty() || ref === doctorOnDuty() ? `${whoIs(ref, '').subject.name} · ${ref}` : ref;
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

/* What the setting being changed brings to its editor: its name, the value in force, its default and what
   no value may do. Only the top-level editor has one; a record's parts are read inside their record. */
type Context = { readonly label: string; readonly from: unknown; readonly defaultValue: unknown; readonly guardrail?: string };

/* A bound is "near" inside the outer tenth of the way between the two. Not a contract number — nothing is
   refused or allowed by it — only where the screen starts saying what no value may do, so that an admin
   dragging towards an edge reads the edge's reason before arriving at it rather than after. */
const NEAR = 0.1;

/* What the value on the slider means, under it, in the contract's own words and nothing else: the change
   it would make, asked as the confirmation will ask it, or that it is the value in force; and, near or
   past a bound, what an admin may set and what no value may do. Its first line is not live — the slider
   already announces its value on every step, and a sentence read again with it would double every
   keypress. The second line is polite and live, and its words change only when a bound is reached or
   left, so a screen reader hears the guardrail once, on the way in. */
function Meaning({ id, limits, typed, context }: { id: string; limits: Limits; typed: number; context: Context }) {
 const bounds = limits.bounds;
 if (!Number.isFinite(typed) || !bounds) return null;
 const value = limits.type === 'moneyCents' ? Math.round(typed * 100) : typed;
 const span = bounds.highest.value - bounds.lowest.value;
 const near = span > 0 && (value - bounds.lowest.value <= span * NEAR || bounds.highest.value - value <= span * NEAR);
 const inForce = value === context.from;
 return <div className="fc-meaning" id={id}>
  <p className={inForce ? 'is-same' : 'is-change'}>{inForce
   ? <><b>{say.inForce}</b> · {valueText(limits, value)}</>
   : fill(say.confirmQuestion, { setting: context.label, from: valueText(limits, context.from), to: valueText(limits, value) })}</p>
  <p className="fc-meaning-edge" aria-live="polite">{near && <>
   <span className="fc-edge-mark" aria-hidden="true"/>
   <span>{limitsText(limits)}.{context.guardrail ? <> <b>{say.guardrail}:</b> {context.guardrail}</> : ''}</span>
  </>}</p>
 </div>;
}

function Editor({ limits, raw, onRaw, id, label, disabled, context }: { limits: Limits; raw: Raw; onRaw: (raw: Raw) => void; id: string; label: string; disabled: boolean; context?: Context }) {
 switch (limits.type) {
  /* A number with bounds is a slider beside its exact field. The field is still the value: the slider
     writes into it and reads from it, so what reaches the rules is exactly what it was before — the text
     of a number — and a value typed outside the bounds, a nought or a word is refused in the contract's
     sentence as it always was. The slider cannot go outside the bounds; the field can, on purpose. */
  case 'minutes': case 'count': case 'percentage': case 'moneyCents': {
   const cents = limits.type === 'moneyCents';
   const field = <input id={id} className="fc-number" inputMode={cents ? 'decimal' : 'numeric'} value={String(raw)} disabled={disabled} onChange={event => onRaw(event.target.value)}/>;
   const bounds = limits.bounds;
   if (!bounds) return <><label htmlFor={id}>{label}</label>{field}</>;
   const scale = (value: number) => cents ? value / 100 : value;
   const [low, high] = [scale(bounds.lowest.value), scale(bounds.highest.value)];
   const typed = String(raw).trim() === '' ? Number.NaN : Number(String(raw).trim().replace(',', '.'));
   const at = Number.isFinite(typed) ? Math.min(high, Math.max(low, typed)) : low;
   /* The ticks: both bounds, and the default where the setting has a single number for one. */
   const byDefault = typeof context?.defaultValue === 'number' ? context.defaultValue : null;
   const marks = [
    { value: low, label: valueText(limits, bounds.lowest.value) },
    ...(byDefault !== null && byDefault > bounds.lowest.value && byDefault < bounds.highest.value ? [{ value: scale(byDefault), label: fill(say.defaultIs, { value: valueText(limits, byDefault) }) }] : []),
    { value: high, label: valueText(limits, bounds.highest.value) }
   ];
   return <>
    <label htmlFor={id}>{label}</label>
    <div className="fc-slide-pair">
     <RangeSlider label={`${label}, ${limitsText(limits)}`} min={low} max={high} step={cents ? 0.01 : 1} value={at} disabled={disabled} marks={marks}
      describedBy={context && !disabled ? id + '-meaning' : undefined}
      valueText={valueText(limits, cents ? Math.round(at * 100) : at)} onChange={next => onRaw(cents ? next.toFixed(2) : String(next))}/>
     {field}
    </div>
    {context && !disabled && <Meaning id={id + '-meaning'} limits={limits} typed={typed} context={context}/>}
   </>;
  }
  case 'list':
   return <>
    <label htmlFor={id}>{label}</label>
    <input id={id} inputMode="text" value={String(raw)} disabled={disabled} onChange={event => onRaw(event.target.value)}/>
   </>;
  case 'text':
   return <>
    <label htmlFor={id}>{label}</label>
    <textarea id={id} rows={4} value={String(raw)} disabled={disabled} aria-describedby={id + '-limit'} onChange={event => onRaw(event.target.value)}/>
    <p className="helper" id={id + '-limit'}>{limitsText(limits)}</p>
   </>;
  /* A boolean with no words of its own is a switch. Every boolean the contracts hold today names its two
     choices in sentences — "Words only", "Photos allowed, once the preview has them" — and a switch would
     make an admin guess which of those is "on", so those are chips, like an enum. */
  case 'boolean': case 'enum': {
   if (limits.type === 'boolean' && !limits.allowed)
    return <Switch label={label} checked={raw === true} disabled={disabled} stateText={raw === true ? say.values.on : say.values.off} onChange={checked => onRaw(checked)}/>;
   const choices = limits.allowed ?? [];
   return <ChoiceChips legend={label} name={id} disabled={disabled} className="cf-choices"
    chips={choices.map(choice => ({ key: String(choice.value), label: choice.label, checked: raw === choice.value, onChange: () => onRaw(choice.value) }))}/>;
  }
  case 'roleList': {
   const chosen = raw as string[];
   return <ChoiceChips legend={label} kind="checkbox" disabled={disabled} className="cf-choices"
    chips={(limits.allowedRoles?.roles ?? []).map(role => ({ key: role, label: roleName(role), checked: chosen.includes(role),
     onChange: checked => onRaw(checked ? [...chosen, role] : chosen.filter(r => r !== role)) }))}/>;
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
     <select id={`${id}-${i}-post`} className="fc-select" value={w.post} onChange={event => put(i, { post: event.target.value })}>
      {held.map(post => <option key={post.id} value={post.id}>{post.label}</option>)}
     </select>
     <ChoiceChips legend={say.editors.days} kind="checkbox" className="cf-choices cf-days"
      chips={settingsContract.days.map(day => ({ key: day, label: dayName(day), checked: w.days.includes(day),
       onChange: checked => put(i, { days: checked ? settingsContract.days.filter(d => d === day || w.days.includes(d)) : w.days.filter(d => d !== day) }) }))}/>
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

/* The value in force, as the card's figure. A single number is set large with its unit small beside it,
   and both halves are cut from the contract's own words for the type — "{value} min", "R{rand}",
   "{value} {unit}" — so no unit is typed here and the figure reads exactly as the history and the
   confirmation do. Anything that is not one number (a choice, a rota, a list, a sentence) is words, and
   words are not set as a numeral. */
function Figure({ limits, value }: { limits: Limits; value: unknown }) {
 const text = valueText(limits, value);
 const number = typeof value !== 'number' || !NUMBERS.has(limits.type) ? null : limits.type === 'moneyCents' ? (value / 100).toFixed(2) : String(value);
 const at = number === null ? -1 : text.indexOf(number);
 if (number === null || at < 0) return <b className="ss-figure is-words">{text}</b>;
 return <b className="ss-figure">
  {at > 0 && <span className="ss-figure-unit">{text.slice(0, at)}</span>}
  <span className="ss-figure-n">{number}</span>
  <span className="ss-figure-unit">{text.slice(at + number.length)}</span>
 </b>;
}

/* ---- The screen ----------------------------------------------------------------------------------- */

/* `fixed` draws the screen over one engine's settings with no engine chooser: the GilbertOne category's Speech
   settings screen embeds this component that way, so an administrator changes the assistant's settings there
   through exactly the editor, the rules and the history the Configuration tab has, rather than a copy of any of
   them. Everything else — the search, the review-then-confirm form, the refusals in the contract's words — is the
   same component. */
export function Configuration({ engine, onEngine, fixed = false }: { engine: string; onEngine: (engine: string) => void; fixed?: boolean }) {
 const histories = useSettingsHistories();
 /* The founder's gate, 28 September 2026: the editor opens only when the service says the founder is signed
    in, or as a preview where founder access is dark or nothing answers. lib/founder-gate.ts decides. */
 const gate = useFounderGate();
 /* Embedded (fixed), the editor is the narrower of two columns on a wide screen, where a card's two halves
    never sit side by side — so each card's default and limits start folded there, as on a phone, and the
    column beside the editor carries what is in force. */
 const wide = useWideLayout() && !fixed;
 /* A doctor's confirmation changes what a setting says about its review, so the screen redraws on one. */
 useSettingsReviews();
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
 /* What an administrator came to do comes first (the founder, 28 September 2026): the gate — which is the
    sign-in while it is shut, and says the screen is a preview while it is open — then the search, then
    the settings. The two sentences about the screen as a whole follow the search rather than lead it, side
    by side where there is room, and still above every setting: the preview sentence is the screen saying a
    change reaches nobody, and it is never below a Change button. */
 return <div className="cf-area" data-layout={wide ? 'wide' : 'narrow'}>
  <div className="cf-work">
  <Suspense fallback={null}><FounderGatePanel sentence={gate.sentence} phase={gate.phase}/></Suspense>
  {/* One bar, two fields: what a setting is called and which engine owns it. Each keeps its own visible
      label, and the bar is only how they sit together — so a phone stacks them without losing either. */}
  <div className="cf-tools" role="search">
   <div className="cf-bar">
    <div className="cf-bar-field cf-bar-query">
     <label htmlFor={id + '-query'}>{say.search}</label>
     <span className="cf-bar-input"><Search size={18} aria-hidden="true"/>
      <input id={id + '-query'} type="search" value={query} aria-describedby={id + '-query-help'} onChange={event => setQuery(event.target.value)}/>
     </span>
    </div>
    {!fixed && <div className="cf-bar-field cf-bar-engine">
     <label htmlFor={id + '-engine'}>{say.engine}</label>
     <select id={id + '-engine'} value={engine} onChange={event => onEngine(event.target.value)}>
      <option value="">{say.everyEngine}</option>
      {blocks.map(block => <option key={block.engine} value={block.engine}>{block.heading}</option>)}
     </select>
    </div>}
   </div>
   <p className="helper" id={id + '-query-help'}>{say.searchHelp}</p>
  </div>
  </div>
  <div className="cf-notes">
   <div className="privacy-note"><SlidersHorizontal size={19}/>{say.intro}</div>
   <div className="privacy-note alert"><CircleAlert size={19}/>{say.preview}</div>
  </div>
  {/* The count's share of every setting is drawn as a bar under its words (--cf-share), so a search that
      narrows the list is seen narrowing it. The words say the same, so the bar is decoration beside them. */}
  <p className="ss-version" role="status" style={{ '--cf-share': total ? shown / total : 0 } as CSSProperties}>{fill(say.shown, { shown: String(shown), total: String(total) })}</p>
  {groups.length
   ? groups.map(group => <EngineGroup key={group.block.engine} block={group.block} items={group.items} history={histories[group.block.engine] ?? []} locked={gate.locked} wide={wide}/>)
   : <p className="helper">{say.noMatch}</p>}
 </div>;
}

function EngineGroup({ block, items, history, locked, wide }: { block: SettingsBlock; items: readonly Setting[]; history: readonly Change[]; locked: boolean; wide: boolean }) {
 const id = useId();
 const [open, setOpen] = useState<string | null>(null);
 const [applied, setApplied] = useState<Change | null>(null);
 const snapshot = snapshotOf(block, history);
 return <section className="ss-panel" aria-labelledby={id + '-title'}>
  <div className="section-title"><h2 id={id + '-title'}>{block.heading}</h2></div>
  <p className="helper">{block.intro}</p>
  <p className="ss-version" role="status">{fill(say.version, { version: String(snapshot.settingsVersion) })}{applied ? ` · ${fill(say.applied, { version: String(applied.settingsVersion), at: clockOf(applied.at) })}` : ''}</p>
  <ol className="panel ss-timings">{items.map(setting => <SettingItem key={setting.key} engine={block.engine} setting={setting} snapshot={snapshot} locked={locked} wide={wide}
   history={history.filter(change => change.setting === setting.key)} open={open === setting.key && !locked}
   onOpen={() => { setOpen(setting.key); setApplied(null); }} onClose={() => setOpen(null)} onApplied={change => { setApplied(change); setOpen(null); }}/>)}</ol>
 </section>;
}

/* A card's ground says where the setting stands, never where it sits on the page: waiting on a clinical
   review, changed from its default, or neither. The words say the same on every card — the review pill,
   "Last changed by" or "Not changed from the default" — so the tint is never the only difference. */
const standingOf = (waitsOnReview: boolean, changed: boolean) => waitsOnReview ? 'review' : changed ? 'changed' : 'default';

/* A card in two halves, on the founder's instruction of 28 September 2026 that what an administrator can
   change comes first. The first half is the setting as somebody deciding whether to change it reads it:
   its name, what it decides, the value in force, where it stands — the review pill and "Last changed by"
   or "Not changed from the default", the words that say what the card's tint says — and the Change button,
   or the form once it is open. The second half is what is merely in force around it: the default and who
   decided it, what an admin may set, what a change reaches and what no value may do, and the history.

   Beside the first half where the card is wide enough (a container query in portal.css), under it where it
   is not; and on a narrow screen the default, the limits and the rules fold into a disclosure that starts
   closed, so a phone shows forty settings as forty short cards rather than forty long ones. Nothing is
   left out of either: a closed disclosure is one press from every word it holds, and the standing words
   never fold, because a tint with its words folded away would be colour saying something alone. */
function SettingItem({ engine, setting, snapshot, history, open, locked, wide, onOpen, onClose, onApplied }: {
 engine: string; setting: Setting; snapshot: Snapshot; history: readonly Change[]; open: boolean; locked: boolean; wide: boolean; onOpen: () => void; onClose: () => void; onApplied: (change: Change) => void;
}) {
 const inForce = snapshot.values[setting.key];
 const last = history.at(-1);
 const review = reviewStateOf(setting, snapshot, reviewsOf(engine));
 const limits = limitsText(setting);
 const bounds = limitProvenance(setting);
 const numeral = typeof inForce === 'number' && NUMBERS.has(setting.type);
 return <li className="ss-timing" data-standing={standingOf(!!review.required && !review.reviewed, !!last)} data-figure={numeral ? 'number' : 'words'}>
  <div className="ss-timing-main">
   <div className="ss-timing-head">
    <div className="ss-timing-name">
     <strong>{setting.label}</strong>
     <p className="ss-help">{setting.help}</p>
    </div>
    {/* Keyed by the setting's own last change, so the figure arrives anew when — and only when — the value
        in force is a different one: a confirmed change is seen landing where the old value stood. */}
    <span className="ss-in-force"><small>{say.inForce}</small><Figure key={last?.settingsVersion ?? 0} limits={setting} value={inForce}/></span>
   </div>
   <div className="ss-standing">
    {review.required && (review.reviewed
     ? <span className="pill cf-review"><ShieldCheck size={15}/>{fill(say.reviewed, { who: review.reviewed.byRef, on: review.reviewed.on ? dayOf(review.reviewed.on) : review.reviewed.at === null ? '' : whenOf(review.reviewed.at) })}</span>
     : <span className="pill cf-review is-unreviewed"><ShieldAlert size={15}/>{say.notReviewed}</span>)}
    <p className="ss-meta">{last ? fill(say.lastChanged, { who: personOf(last.byRef), when: whenOf(last.at) }) : say.neverChanged}</p>
   </div>
   {/* While the founder's gate is shut there is no Change button at all: the gate's own panel at the top of
       the screen says why and carries the sign-in, so nothing here explains an absence twice. */}
   {locked ? null : open
    ? <ChangeForm engine={engine} setting={setting} expectedVersion={snapshot.settingsVersion} from={inForce} onClose={onClose} onApplied={onApplied}/>
    : <button className="secondary m-press cf-open" onClick={onOpen}>{say.change}<span className="visually-hidden"> {setting.label}</span></button>}
  </div>
  <div className="ss-timing-side">
   <details className="cf-about" open={wide}>
    <summary>{say.about}</summary>
    <p className="ss-meta">{fill(say.defaultIs, { value: valueText(setting, setting.default.value) })} · {provenanceText(setting.default)}</p>
    {/* Limits that carry no provenance — a rota's posts — were never decided by anybody, so they read as a
        proposal rather than borrowing the word "decided" from an empty list. A mix is said as a mix: Record's lifetimes
        take the founder's grant ceiling for their highest bound and a proposal for their lowest, and calling the pair
        decided would tell an admin somebody agreed to a limit nobody has. */}
    {limits && <p className="ss-meta">{limits}. {bounds.every(entry => entry.decidedBy === null) ? say.limitsAreProposals
     : bounds.some(entry => entry.decidedBy === null) ? say.limitsPartlyDecided : say.limitsDecided}</p>}
    <dl className="cf-rules">
     <div><dt>{say.appliesTo}</dt><dd>{setting.appliesTo}</dd></div>
     {setting.guardrail && <div><dt>{say.guardrail}</dt><dd>{setting.guardrail.statement}</dd></div>}
     {review.required && !review.reviewed && <div><dt>{say.notReviewed}</dt><dd>{fill(say.reviewWaitsOn, { capability: capabilityName(review.required) })}</dd></div>}
    </dl>
   </details>
   <details className="cf-history">
    <summary>{say.historyHeading} ({history.length})</summary>
    {history.length
     ? <div className="table-scroll"><table className="result-table admin-table ss-history cf-timeline">
       <caption>{say.historyNeverEdited}</caption>
       <thead><tr><th scope="col">{say.when}</th><th scope="col">{say.who}</th><th scope="col">{say.from}</th><th scope="col">{say.to}</th><th scope="col">{say.why}</th></tr></thead>
       <tbody>{history.map(change => <tr key={change.settingsVersion}>
        <td>{whenOf(change.at)}</td><td>{personOf(change.byRef)}</td><td>{valueText(setting, change.from)}</td><td>{valueText(setting, change.to)}</td><td>{change.reason}</td>
       </tr>)}</tbody>
      </table></div>
     : <p className="helper">{say.historyEmpty} {say.historyNeverEdited}</p>}
   </details>
  </div>
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
  {/* Where the change is in its two steps — the value and its reason, then the confirmation — as two
      segments, the second filling when the review is asked for. The buttons and the confirmation already
      say which step this is in words, so the segments are hidden from a screen reader rather than said twice. */}
  <div className="cf-steps" aria-hidden="true" data-step={review ? 'confirm' : 'change'}><i/><i/></div>
  <Editor limits={setting} raw={raw} id={id + '-value'} label={editorLabel(setting)} disabled={!!review} onRaw={next => { setRaw(next); setRefused(null); }}
   context={{ label: setting.label, from, defaultValue: setting.default.value, guardrail: setting.guardrail?.statement }}/>
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
      <button type="button" className="secondary m-press" onClick={() => setReview(null)}>{say.cancel}</button>
      <button type="button" className="primary m-press" autoFocus onClick={confirm}>{say.confirm}<Go/></button>
     </div>
    </div>
   : <div className="button-row">
     <button type="button" className="secondary m-press" onClick={onClose}>{say.cancel}</button>
     <button type="submit" className="primary m-press">{say.review}<Go/></button>
    </div>}
 </form>;
}

/* The primary's arrow, the landing's: a mark in a disc beside the word, never a word itself, so it is
   hidden from a screen reader and the button's name stays exactly the contract's sentence. */
const Go = () => <span className="cf-go" aria-hidden="true"><ArrowRight size={16} strokeWidth={2.25}/></span>;
