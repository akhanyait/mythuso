import { createElement, isValidElement, type ComponentType, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import './patient-export.css';

/* The export's page header for the patient screens it draws and the live app did not have: a way back to
   the page this one belongs under, an icon tile, the title and one sentence under it, and room on the right
   for the page's one action.

   It keeps the class every patient page's intro already has, so the type is the same 28/32px display face
   and the same measure as the rest of the patient space; what it adds is the tile and the back link. The
   back link is a full 44px target because on a page no sidebar row lights up for, it is the way out. */
export function PatientHeader({ icon, eyebrow, title, lead, back, action }: {
 /** Drawn at 22px inside the tile: a Lucide glyph or one of the MyThuso family, as a component or an element. */
 icon: ComponentType<{ size?: number; strokeWidth?: number }> | ReactNode;
 eyebrow?: string;
 title: string;
 lead: string;
 back?: { label: string; go: () => void };
 action?: ReactNode;
}) {
 return <div className="page-intro ps-head">
  {back && <button type="button" className="text-button ps-back" onClick={back.go}><ArrowLeft size={16} aria-hidden="true"/>{back.label}</button>}
  <div className="ps-head-row">
   <span className="ps-head-icon" aria-hidden="true">{isValidElement(icon) ? icon : createElement(icon as ComponentType<{ size?: number; strokeWidth?: number }>, { size: 22, strokeWidth: 1.8 })}</span>
   <div className="ps-head-text">
    {eyebrow && <div className="eyebrow">{eyebrow}</div>}
    <h1>{title}</h1>
    <p>{lead}</p>
   </div>
   {action && <div className="ps-head-action">{action}</div>}
  </div>
 </div>;
}
