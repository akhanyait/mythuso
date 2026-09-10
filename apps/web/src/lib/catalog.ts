import catalog from '../../../../packages/catalog/services.json' with { type: 'json' };
import model from '../../../../packages/catalog/business-model.json';
export type Service = typeof catalog[number];
export const services: Service[] = catalog;
/* Phase one is what a nurse can actually be dispatched to do today. The rest of the menu is shown
   with its phase so the preview never implies a service is bookable before it exists. */
export const liveServices = services.filter(s => s.phase === 1);
export const businessModel = model;
export const money = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
export const bigMoney = (n: number) => n >= 1_000_000 ? `R${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}m` : n >= 1000 ? `R${Math.round(n / 1000)}k` : `R${n}`;
/* The platform's cut of one visit, after the nurse and the payment provider are paid. */
export const platformMargin = (service: Service) => service.price - service.nurseShare - model.unitEconomics.worked.paymentCost;
export const modules = [
 ['Thuso Nurse','Home visits and nurse dispatch','Phase 1'],['Thuso Doctor','Telehealth and clinical review','Phase 1'],['Thuso Kit','Connected diagnostic capture','Phase 1'],['Thuso AI','Decision support with doctor sign-off','Phase 1–3'],['Thuso Pass','Health Passport and access sharing','Phase 2'],['Thuso Screen','Screening programmes and referrals','Phase 2–3'],['Thuso Wear','Apple Health and Health Connect','Phase 2'],['Thuso Pharmacy','Prescription fulfilment','Phase 2'],['Thuso Labs','Collection, tests and results','Phase 2'],['Thuso Routine','Subscriptions and ongoing care','Phase 2–3'],['Thuso Family','Household and sponsored care','Phase 2'],['Thuso Wallet','Credits, vouchers and sponsorship','Phase 2'],['Thuso SOS','Urgent care and escalation','Phase 2–4'],['Thuso Corner','Community screening locations','Phase 2'],['Thuso Work','Employer wellness programmes','Phase 3'],['Thuso Locum','Vetted nurse shift marketplace','Phase 2'],['Thuso Academy','Training and CPD','Phase 3'],['Thuso Money','Partner-provided nurse finance','Phase 3'],['Thuso Cover','Partner-provided insurance','Phase 4'],['Thuso Devices','Pod, Band, Home and Lab','Phase 3–4'],['Control Tower','Dispatch, vetting and quality','Phase 1']
];
