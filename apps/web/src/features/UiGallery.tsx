/* The shared components, laid out to be looked at: every component in apps/web/src/ui, every variant and
   size, and each state — rest, hover and focus forced by class, disabled, loading, invalid, with an icon —
   once on the light theme and once on the dark, side by side, so a change to a token is seen on both
   grounds before a screen wears it.

   Development builds only. App.tsx reaches this behind `import.meta.env.DEV` and a dynamic import, so a
   production build never emits it and the patient's first view never pays for it. It is what
   tests/ui.spec.ts opens. Nothing on it is a screen a patient will see, and every sentence on it is
   sample text rather than anybody's record.

   Each half carries its theme's nineteen semantic colours from tokens.json itself, as custom properties
   on its own wrapper. The generated stylesheet sets them on :root only — which is all a product screen
   needs — and a gallery that switched the whole page's theme could show one half at a time. Reading
   them from the token source rather than typing them keeps the gallery as unable to drift as the
   stylesheet is. The root is pinned to light while the gallery is open so an operating system in dark
   mode cannot turn the light half dark. */
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Bell, Clock, Download, Plus, Search, X } from 'lucide-react';
import tokens from '../../../../packages/design-tokens/tokens.json' with { type: 'json' };
import {
 Alert, Avatar, AvatarFallback, AvatarImage, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
 Checkbox, Divider, Field, IconButton, Input, MetricCard, MyThusoDashboardIcon, MyThusoHealthIcon, MyThusoMessagesIcon,
 MyThusoVisitIcon, NavigationItem, Select, Spinner, StatusIndicator, Tab, TabsList, Textarea,
 type BadgeVariant, type ButtonSize, type ButtonVariant,
} from '../ui';
import './ui-gallery.css';

type Mode = 'light' | 'dark';
const semantic = tokens.semantic as unknown as { names: string[] } & Record<Mode, Record<string, { hex: string }>>;
const kebab = (name: string) => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const themeOf = (mode: Mode) => Object.fromEntries(semantic.names.map(role => [`--color-${kebab(role)}`, semantic[mode][role].hex])) as CSSProperties;

const VARIANTS: ButtonVariant[] = ['primary', 'accent', 'secondary', 'ghost', 'destructive'];
const SIZES: Exclude<ButtonSize, 'icon'>[] = ['sm', 'md', 'lg'];
const BADGES: BadgeVariant[] = ['neutral', 'primary', 'accent', 'success', 'warning', 'danger'];
const BADGE_WORDS: Record<BadgeVariant, string> = { neutral: 'Draft', primary: 'Booked', accent: 'Selected', success: 'Verified', warning: 'Waiting', danger: 'Refused' };
const DESTINATIONS = [
 { key: 'overview', label: 'Overview', Icon: MyThusoDashboardIcon, count: undefined },
 { key: 'visits', label: 'My visits', Icon: MyThusoVisitIcon, count: 2 },
 { key: 'messages', label: 'Messages', Icon: MyThusoMessagesIcon, count: 5 },
] as const;

function Specimen({ state, children, wide = false }: { state: string; children: ReactNode; wide?: boolean }) {
 return <figure className={`ui-gallery-specimen${wide ? ' is-wide' : ''}`} data-state={state}>
  <div className="ui-gallery-specimen-body">{children}</div>
  <figcaption>{state}</figcaption>
 </figure>;
}

function Section({ name, note, children }: { name: string; note?: string; children: ReactNode }) {
 return <section className="ui-gallery-section" data-component={name}>
  <h3>{name}</h3>
  {note && <p className="ui-gallery-note">{note}</p>}
  {children}
 </section>;
}

/* One row of specimens under a component: a variant, a size, a set of states. */
function Row({ label, children }: { label?: string; children: ReactNode }) {
 return <div className="ui-gallery-group">
  {label && <p className="ui-gallery-group-label">{label}</p>}
  <div className="ui-gallery-row">{children}</div>
 </div>;
}

function Pane({ mode }: { mode: Mode }) {
 const id = (s: string) => `${mode}-${s}`;
 const [tab, setTab] = useState('summary');
 const [destination, setDestination] = useState('overview');
 return <div className="ui-gallery-pane" data-theme={mode} data-theme-pane={mode} style={themeOf(mode)}>
  <h2>{mode === 'light' ? 'Light' : 'Dark'}</h2>

  <Section name="Button" note="five variants at size md in each state, then the three sizes with an icon">
   {VARIANTS.map(variant => <Row key={variant} label={`variant="${variant}"`}>
    <Specimen state="default"><Button variant={variant}>Open record</Button></Specimen>
    <Specimen state="hover"><Button variant={variant} className="is-hover">Open record</Button></Specimen>
    <Specimen state="focus-visible"><Button variant={variant} className="is-focus">Open record</Button></Specimen>
    <Specimen state="disabled"><Button variant={variant} disabled>Open record</Button></Specimen>
    <Specimen state="loading"><Button variant={variant} loading>Saving</Button></Specimen>
   </Row>)}
   <Row label="sizes">
    {SIZES.map(size => <Specimen key={size} state={`size ${size}`}><Button size={size} data-size={size} leadingIcon={<Plus aria-hidden="true"/>}>Book a visit</Button></Specimen>)}
    <Specimen state="trailing icon"><Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>}>Continue</Button></Specimen>
   </Row>
  </Section>
  <Section name="IconButton" note="label is required and becomes the accessible name">
   <Row>
   {SIZES.map(size => <Specimen key={size} state={`size ${size}`}><IconButton size={size} data-size={size} label="Search" variant="secondary"><Search/></IconButton></Specimen>)}
   <Specimen state="ghost"><IconButton label="Close" variant="ghost"><X/></IconButton></Specimen>
   <Specimen state="focus-visible"><IconButton label="Download" variant="secondary" className="is-focus"><Download/></IconButton></Specimen>
   <Specimen state="disabled"><IconButton label="Notifications" variant="secondary" disabled><Bell/></IconButton></Specimen>
   </Row>
  </Section>

  <Section name="Card" note="default, elevated, interactive; padding none with header and content">
   <Row>
   <Specimen state="default" wide><Card>
    <CardHeader><CardTitle>Visit summary</CardTitle><CardDescription>What the nurse recorded at the door.</CardDescription></CardHeader>
    <CardContent><p className="ui-gallery-copy">Blood pressure taken twice, five minutes apart. A doctor reviews it before anything is decided.</p></CardContent>
   </Card></Specimen>
   <Specimen state="elevated"><Card variant="elevated" padding="md"><p className="ui-gallery-copy">Raised on the one larger shadow.</p></Card></Specimen>
   <Specimen state="interactive, hover"><Card variant="interactive" padding="md" className="is-hover"><p className="ui-gallery-copy">Its border answers a pointer.</p></Card></Specimen>
   <Specimen state="padding sm"><Card padding="sm"><p className="ui-gallery-copy">Sixteen inside.</p></Card></Specimen>
   <Specimen state="padding lg"><Card padding="lg"><p className="ui-gallery-copy">Twenty-four inside.</p></Card></Specimen>
   </Row>
  </Section>
  <Section name="MetricCard">
   <Row>
   <Specimen state="with trend and icon" wide><MetricCard label="Visits this week" value="12" trend="Three more than last week" icon={<Clock aria-hidden="true"/>}/></Specimen>
   <Specimen state="value only"><MetricCard label="Readings" value="48"/></Specimen>
   </Row>
  </Section>

  <Section name="Field" note="label, hint, error and required, wired by id">
   <Row>
   <Specimen state="default, with hint" wide><Field label="Street address" htmlFor={id('address')} hint="The nurse's route starts here."><Input id={id('address')} placeholder="12 Example Street"/></Field></Specimen>
   <Specimen state="required, invalid" wide><Field label="Mobile number" htmlFor={id('mobile')} required error="Enter the ten digits of a South African mobile number."><Input id={id('mobile')} defaultValue="082 55" inputMode="tel"/></Field></Specimen>
   </Row>
  </Section>
  <Section name="Input">
   <Row>
   <Specimen state="default" wide><Input aria-label="Search services" placeholder="Search services"/></Specimen>
   <Specimen state="focus-visible" wide><Input aria-label="Suburb" className="is-focus" defaultValue="Soweto"/></Specimen>
   <Specimen state="disabled" wide><Input aria-label="Account number" disabled defaultValue="Set by the clinic"/></Specimen>
   <Specimen state="invalid" wide><Input aria-label="Postal code" invalid defaultValue="20A1"/></Specimen>
   </Row>
  </Section>
  <Section name="Textarea">
   <Row>
   <Specimen state="default" wide><Textarea aria-label="Notes for the nurse" placeholder="Anything the nurse should know before arriving"/></Specimen>
   <Specimen state="invalid" wide><Textarea aria-label="Reason" invalid defaultValue="Too short"/></Specimen>
   </Row>
  </Section>
  <Section name="Select" note="native, with the chevron drawn over it">
   <Row>
   <Specimen state="default" wide><Select aria-label="Language" defaultValue="en"><option value="en">English</option><option value="zu">isiZulu</option><option value="xh">isiXhosa</option></Select></Specimen>
   <Specimen state="disabled" wide><Select aria-label="Province" disabled><option>Gauteng</option></Select></Specimen>
   <Specimen state="invalid" wide><Select aria-label="Time of day" invalid defaultValue=""><option value="">Choose a time</option><option>Morning</option></Select></Specimen>
   </Row>
  </Section>
  <Section name="Checkbox">
   <Row>
   <Specimen state="unchecked" wide><Checkbox label="Send me a reminder the day before"/></Specimen>
   <Specimen state="checked" wide><Checkbox label="The patient agreed to this visit" defaultChecked/></Specimen>
   <Specimen state="focus-visible" wide><Checkbox label="Share the result with my doctor" className="is-focus"/></Specimen>
   <Specimen state="disabled" wide><Checkbox label="Set by your medical scheme" disabled defaultChecked/></Specimen>
   </Row>
  </Section>

  <Section name="Alert">
   <Row>
   <Specimen state="info" wide><Alert variant="info" title="This is a preview">No visit is booked and nobody is sent.</Alert></Specimen>
   <Specimen state="success" wide><Alert variant="success" title="Your details are saved">They stay on this device until you close it.</Alert></Specimen>
   <Specimen state="warning" wide><Alert variant="warning" title="Your nurse is running late">The new time is on the visit.</Alert></Specimen>
   <Specimen state="danger" wide><Alert variant="danger" title="Your bank sent it back">It is still owed to you.</Alert></Specimen>
   </Row>
  </Section>
  <Section name="Badge" note="six variants at both sizes, and with a dot">
   {(['md', 'sm'] as const).map(size => <Row key={size} label={`size ${size}`}>
    {BADGES.map(variant => <Specimen key={variant} state={variant}><Badge variant={variant} size={size}>{BADGE_WORDS[variant]}</Badge></Specimen>)}
    <Specimen state="dot"><Badge variant="success" size={size} dot>Verified</Badge></Specimen>
   </Row>)}
  </Section>
  <Section name="StatusIndicator" note="never colour alone: the label is required">
   <Row>
   <Specimen state="online"><StatusIndicator status="online" label="Available"/></Specimen>
   <Specimen state="busy"><StatusIndicator status="busy" label="On a visit"/></Specimen>
   <Specimen state="offline"><StatusIndicator status="offline" label="Off shift"/></Specimen>
   </Row>
  </Section>

  <Section name="Tabs" note="arrow keys move and select; one Tab stop">
   <Row>
   <Specimen state="default" wide><TabsList aria-label={`Patient views, ${mode}`}>
    {[['summary', 'Summary'], ['timeline', 'Timeline'], ['results', 'Results']].map(([key, label]) =>
     <Tab key={key} active={tab === key} onClick={() => setTab(key)}>{label}</Tab>)}
   </TabsList></Specimen>
   <Specimen state="hover and focus-visible" wide><TabsList aria-label={`Forced states, ${mode}`}>
    <Tab active>Selected</Tab><Tab className="is-hover">Hover</Tab><Tab className="is-focus">Focus</Tab><Tab disabled>Disabled</Tab>
   </TabsList></Specimen>
   </Row>
  </Section>
  <Section name="NavigationItem" note="aria-current on the active destination">
   <Row>
   <Specimen state="rail" wide><nav className="ui-gallery-rail" aria-label={`Sample rail, ${mode}`}>
    {DESTINATIONS.map(({ key, label, Icon, count }) =>
     <NavigationItem key={key} icon={<Icon/>} active={destination === key} count={count} onClick={() => setDestination(key)}>{label}</NavigationItem>)}
    <NavigationItem className="is-hover">Hover</NavigationItem>
    <NavigationItem className="is-focus">Focus</NavigationItem>
    <NavigationItem disabled>Disabled</NavigationItem>
   </nav></Specimen>
   </Row>
  </Section>
  <Section name="MyThusoHealthIcon" note="the family's icon for a health destination, at the size a rail wears it">
   <Row>
   <Specimen state="default"><span className="ui-gallery-icon"><MyThusoHealthIcon/> My health</span></Specimen>
   </Row>
  </Section>

  <Section name="Avatar" note="initials, or an organisation's mark — never a stranger's photograph">
   <Row>
   {(['sm', 'md', 'lg'] as const).map(size => <Specimen key={size} state={`size ${size}`}><Avatar size={size}><AvatarFallback initials="ND"/></Avatar></Specimen>)}
   <Specimen state="image"><Avatar size="lg"><AvatarImage src="/icon.svg" alt="MyThuso"/></Avatar></Specimen>
   </Row>
  </Section>
  <Section name="Divider">
   <Row>
   <Specimen state="horizontal" wide><div className="ui-gallery-stack"><span>Before</span><Divider/><span>After</span></div></Specimen>
   <Specimen state="vertical"><div className="ui-gallery-inline"><span>Left</span><Divider orientation="vertical"/><span>Right</span></div></Specimen>
   </Row>
  </Section>
  <Section name="Spinner" note="turns once as it arrives, then rests; announced as a status">
   <Row>
   {(['sm', 'md', 'lg'] as const).map(size => <Specimen key={size} state={`size ${size}`}><Spinner size={size} label="Loading the visit"/></Specimen>)}
   <Specimen state="accent"><Spinner tone="accent" label="Loading readings"/></Specimen>
   <Specimen state="current"><span className="ui-gallery-current"><Spinner tone="current" size="sm" label="Loading messages"/></span></Specimen>
   </Row>
  </Section>
 </div>;
}

export function UiGallery() {
 /* Pinned to light for as long as the gallery is open, and put back as it was on the way out. */
 useEffect(() => {
  const root = document.documentElement;
  const before = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  return () => { if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before); };
 }, []);
 return <section className="ui-gallery" aria-labelledby="ui-gallery-heading" data-ui-gallery>
  <h1 id="ui-gallery-heading">Shared components</h1>
  <p className="helper">Development only. Every component in apps/web/src/ui, each variant, size and state, on the light theme and the dark. Nothing on this page is a screen a patient will see.</p>
  <div className="ui-gallery-panes">
   <Pane mode="light"/>
   <Pane mode="dark"/>
  </div>
 </section>;
}
