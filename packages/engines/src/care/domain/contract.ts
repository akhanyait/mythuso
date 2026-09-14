/* The contracts Care is computed from, read once and typed.
 *
 * Every sentence a Care act refuses with is looked up here by the route it belongs to and the id the
 * route contract gives it, and the lookup throws when either is missing. That is deliberate: a
 * refusal that silently rendered as nothing would be a gate that stopped saying why it was shut, and
 * a reworded or removed refusal in packages/catalog/apis/care.json has to stop this engine loudly
 * rather than leave it refusing in words the contract no longer says.
 *
 * The contract is a value rather than a module-level constant the acts reach for, so a test can hand
 * an act a contract with a role the vetting register does not have yet — which is the only way the
 * supervised-carer refusal can be exercised before a carer exists. */
import careApi from '../../../../catalog/apis/care.json' with { type: 'json' };
import apis from '../../../../catalog/apis.json' with { type: 'json' };
import care from '../../../../catalog/care.json' with { type: 'json' };
import services from '../../../../catalog/services.json' with { type: 'json' };
import protocols from '../../../../catalog/protocols.json' with { type: 'json' };
import trust from '../../../../catalog/trust.json' with { type: 'json' };
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };
import capture from '../../../../catalog/capture.json' with { type: 'json' };
import scheduling from '../../../../catalog/scheduling.json' with { type: 'json' };
import type { Refusal } from './outcome.ts';

export type ServiceRow = { readonly id: string; readonly name: string; readonly phase: number; readonly duration: number };
export type Requirement = {
 readonly serviceId: string;
 readonly roles: readonly string[];
 readonly scope: string | null;
 readonly protocolIds: readonly string[];
 readonly supervisedBy?: string;
};
export type ProtocolRow = { readonly id: string; readonly name: string; readonly engine: string; readonly version: number; readonly status: string };
export type ConflictRow = { readonly id: string; readonly name: string; readonly resolution: string; readonly detail: string };
type RouteRefusal = { id: string; status: number; statement: string };
type Route = { method: string; path: string; version: number; purpose: string[]; refusals: RouteRefusal[] };

export type CareContract = {
 readonly timezone: string;
 readonly seedPhase: number;
 readonly services: readonly ServiceRow[];
 readonly requirements: readonly Requirement[];
 readonly offerExpiresAfterMinutes: number;
 readonly protocols: readonly ProtocolRow[];
 readonly badgeTiers: readonly string[];
 readonly conflicts: readonly ConflictRow[];
 readonly routes: readonly Route[];
 readonly sharedRefusals: readonly RouteRefusal[];
 /** The refusals the care engine declares for itself rather than on one route. */
 readonly engineRefusals: readonly RouteRefusal[];
 /** The engine's own sentences that belong to no route: packages/catalog/care.json. */
 readonly sentences: {
  readonly outsideScope: string;
  readonly noBase: string;
  readonly declined: string;
  readonly lapsed: string;
  readonly noProtocol: string;
  readonly draftCarriesNothing: string;
 };
};

const nurseRole = vetting.roles.find(role => role.id === 'nurse');
if (!nurseRole?.scope) throw new Error('packages/catalog/vetting.json has lost the nurse role or its scope, which Care matches every visit against.');
const withheld = (id: string) => {
 const found = care.withheld.find(w => w.id === id);
 if (!found) throw new Error(`packages/catalog/care.json has lost the withheld reason "${id}".`);
 return found;
};
const draftRefusal = protocols.refusals.find(r => r.id === 'a-draft-carries-nothing');
if (!draftRefusal) throw new Error('packages/catalog/protocols.json has lost the refusal "a-draft-carries-nothing".');

export const careContract: CareContract = {
 timezone: scheduling.timezone,
 seedPhase: care.seedPhase,
 services: services as ServiceRow[],
 requirements: care.services as Requirement[],
 offerExpiresAfterMinutes: care.offers.expiresAfterMinutes,
 protocols: protocols.protocols as ProtocolRow[],
 badgeTiers: trust.tiers.map(tier => tier.id),
 conflicts: capture.conflicts as ConflictRow[],
 routes: careApi.routes as Route[],
 sharedRefusals: apis.sharedRefusals as RouteRefusal[],
 engineRefusals: careApi.refusals as RouteRefusal[],
 sentences: {
  outsideScope: nurseRole.scope.note,
  noBase: withheld('no-base-to-measure-from').statement!,
  declined: care.offers.declined,
  lapsed: care.offers.lapsed,
  noProtocol: care.checklist.noProtocol,
  draftCarriesNothing: draftRefusal.statement
 }
};

/* The route every act names, as the lock names it. Written once here so an act cannot name a route
   the contract does not hold: `routeOf` throws on a path it does not find. */
export const ROUTES = {
 offer: '/v1/care/offers',
 accept: '/v1/care/offers/{offerRef}/accept',
 decline: '/v1/care/offers/{offerRef}/decline',
 start: '/v1/care/visits/{appointmentRef}/start',
 checklist: '/v1/care/visits/{appointmentRef}/checklist',
 capture: '/v1/care/visits/{appointmentRef}/capture',
 handover: '/v1/care/visits/{appointmentRef}/handover',
 complete: '/v1/care/visits/{appointmentRef}/complete',
 sync: '/v1/care/sync-batches'
} as const;
export type RoutePath = typeof ROUTES[keyof typeof ROUTES];

export function routeOf(contract: CareContract, path: RoutePath): Route {
 const found = contract.routes.find(route => route.path === path && route.method === 'POST');
 if (!found) throw new Error(`packages/catalog/apis/care.json has no POST ${path}.`);
 return found;
}

/** The refusal a route declares, or one every route inherits from packages/catalog/apis.json. */
export function refuse(contract: CareContract, path: RoutePath, id: string): Refusal {
 const route = routeOf(contract, path);
 const found = route.refusals.find(r => r.id === id) ?? contract.sharedRefusals.find(r => r.id === id);
 if (!found) throw new Error(`POST ${path}@${route.version} declares no refusal "${id}", and no route inherits one by that id.`);
 return { ok: false, route: `${route.method} ${route.path}@${route.version}`, id: found.id, status: found.status, statement: found.statement };
}

/** The route's first purpose of use, which every event an act on it publishes carries. */
export const purposeOf = (contract: CareContract, path: RoutePath): string => routeOf(contract, path).purpose[0]!;

export const requirementFor = (contract: CareContract, serviceId: string): Requirement | null =>
 contract.requirements.find(r => r.serviceId === serviceId) ?? null;
export const serviceFor = (contract: CareContract, serviceId: string): ServiceRow | null =>
 contract.services.find(s => s.id === serviceId) ?? null;
