import type { ReactNode } from 'react';
import { Badge, Card } from '../ui';
import './office-identity.css';

/* The furniture of the partner and back-office screens, drawn once (wave 4d). Every piece is the shared
   components plus office-identity.css; nothing here is a control of its own, so the keyboard, the focus
   ring and the targets are the components'. Imported only by screens that arrive behind a dynamic import,
   so neither the patient's first view nor the landing page carries it. */

/* A screen's head: the eyebrow is chrome, the title is the page, the lead is what it is for. */
export function OfficeHead({ eyebrow, title, lead, level = 1, children }: { eyebrow?: string; title: string; lead?: ReactNode; level?: 1 | 2; children?: ReactNode }) {
 const Heading = level === 1 ? 'h1' : 'h2';
 return <header className="oi-head">
  {eyebrow && <p className="oi-eyebrow">{eyebrow}</p>}
  <Heading className="oi-title">{title}</Heading>
  {lead && <p className="oi-lead">{lead}</p>}
  {children}
 </header>;
}

/* A section heading with, where there is one, a count or a sentence on the same line. */
export function OfficeSection({ title, note, children, level = 2, id }: { title: string; note?: ReactNode; children?: ReactNode; level?: 2 | 3; id?: string }) {
 const Heading = level === 2 ? 'h2' : 'h3';
 return <section className="oi-section" aria-labelledby={id}>
  <div className="oi-section-head"><Heading className="oi-section-title" id={id}>{title}</Heading>{note && <p className="oi-section-note">{note}</p>}</div>
  {children}
 </section>;
}

/* A figure and what it is measured against. `flagged` is a Badge in words, never a recoloured card. */
export function OfficeFigure({ label, value, note, flagged, visual, lead, className }: { label: string; value: string; note: ReactNode; flagged?: boolean; visual?: ReactNode; lead?: boolean; className?: string }) {
 return <Card padding="md" className={['ui-metric', 'oi-figure', lead ? 'oi-figure--lead' : '', className ?? ''].filter(Boolean).join(' ')}>
  <div className="ui-metric__head"><span className="ui-metric__label">{label}</span>{flagged && <Badge variant="danger" size="sm" dot>Needs attention</Badge>}</div>
  <div className="oi-figure__body"><p className="ui-metric__value">{value}</p>{visual}</div>
  <p className="oi-figure__note">{note}</p>
 </Card>;
}

/* One of the honesty lines. `refusal` is for a sentence that refuses something: its mark takes the
   danger ink, and the words already say it is a refusal, so colour is never the only thing that does. */
export function OfficeNote({ icon, refusal, children, role, className }: { icon?: ReactNode; refusal?: boolean; children: ReactNode; role?: string; className?: string }) {
 return <p className={['oi-note', refusal ? 'oi-note--refusal' : '', className ?? ''].filter(Boolean).join(' ')} role={role}>{icon}<span>{children}</span></p>;
}

/* Label and value, a column of them. */
export function OfficeFacts({ facts, className }: { facts: readonly (readonly [ReactNode, ReactNode, string?] | null | false | undefined)[]; className?: string }) {
 return <dl className={['oi-facts', className ?? ''].filter(Boolean).join(' ')}>{facts.filter(Boolean).map((fact, i) => {
  const [label, value, extra] = fact as readonly [ReactNode, ReactNode, string?];
  return <div key={i} className={extra}><dt>{label}</dt><dd>{value}</dd></div>;
 })}</dl>;
}

/* A bar of this many out of that many, in the progress colour. The words beside it carry the count. */
export function OfficeProgress({ part, whole, label }: { part: number; whole: number; label: string }) {
 return <div className="oi-progress" role="img" aria-label={label}><span style={{ width: `${whole ? (part / whole) * 100 : 0}%` }}/></div>;
}
