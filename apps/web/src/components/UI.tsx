import { useEffect, useRef, type ReactNode } from 'react';
import { services } from '../lib/catalog';
import { Activity, ArrowUpRight, Baby, Bandage, Droplets, FileText, Flower2, Heart, ShieldCheck, Syringe, Users, X } from 'lucide-react';
export const serviceIcons = { heart: Heart, bandage: Bandage, baby: Baby, drop: Droplets, syringe: Syringe, flower: Flower2, shield: ShieldCheck, people: Users, file: FileText };
export function ServiceIcon({ name, size=23 }: { name:string; size?:number }) { const Icon = serviceIcons[name as keyof typeof serviceIcons] || Activity; return <Icon size={size} strokeWidth={1.7}/>; }
export function Pill({children, tone='teal'}:{children:ReactNode;tone?:string}) {return <span className={`pill ${tone}`}>{children}</span>;}
export function SectionTitle({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}) {return <div className="section-title"><h2>{title}</h2>{action && <button className="text-button" onClick={onClick}>{action}<ArrowUpRight size={16}/></button>}</div>;}
/* `surface` is additive and optional. A dialog is rendered into the top layer rather than inside the
   shell that opened it, so it cannot inherit the surface it belongs to — the patient app passes its
   own classes here and the clinical shells, which do not, are unchanged. */
export function Modal({title,children,onClose,surface=''}:{title:string;children:ReactNode;onClose:()=>void;surface?:string}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current; const previous=document.activeElement as HTMLElement; d?.showModal(); const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{d?.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
 return <dialog ref={ref} aria-label={title} className={`modal${surface?` ${surface}`:''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></div>{children}</dialog>;
}
export function EmptyNote({children}:{children:ReactNode}) {return <div className="empty-note">{children}</div>;}
/* A service's tint is its category's, and the category's is its place in the catalogue's own order of
   first appearance — so the same four tints mean the same four kinds of care on the home and in the
   catalogue, and a tint never comes from where a card happens to sit on a screen. Tests & screening is
   lavender because lavender is the readings' ground (tokens.json#contrast, "health readings"). Every tint
   is a ground only: each rule that paints one sets its own ink, measured in tokens.json#contrast. */
const tintOrder = ['mint', 'peach', 'lime', 'lavender'] as const;
const categoryOrder = [...new Set(services.map(s => s.category))];
export const tintOf = (category: string) => tintOrder[categoryOrder.indexOf(category) % tintOrder.length] ?? 'mint';
