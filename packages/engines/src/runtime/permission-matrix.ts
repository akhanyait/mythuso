/**
 * The role x scope x purpose matrix POST /v1/core/permission-checks@1 answers from, read fresh rather
 * than restated: every engine's own API file, imported as the plain JSON it is, so a role admitted to
 * a route the moment it is declared is a role this check already answers for, with nothing here to
 * keep in step by hand.
 *
 * It lives under the runtime rather than in core/'s own directory. An engine's own code imports its own
 * directory, the runtime and the catalog (scripts/check-boundaries.mjs's store-isolation rule): reading
 * every other engine's route declarations for a generic matrix is exactly the runtime's own kind of
 * work, the same shape as the runtime binder already reading every engine's contract to admit a
 * caller — never Core copying a fact about Safety it should read from Safety's own settings instead,
 * which is the narrower thing packages/engines/src/core's own build rule refuses (a copied grace
 * window or panic timing), and which importing route *declarations* rather than a *setting's value* is
 * not. Thirteen imports rather than a loop over apis.engineFiles because a JSON import is what this
 * runtime, and — elsewhere in this codebase — a browser bundle, can both read; neither can loop over a
 * file list with node:fs.
 */
import apis from '../../../catalog/apis.json' with { type: 'json' };
import vetting from '../../../catalog/vetting.json' with { type: 'json' };
import coreApi from '../../../catalog/apis/core.json' with { type: 'json' };
import accessApi from '../../../catalog/apis/access.json' with { type: 'json' };
import pulseApi from '../../../catalog/apis/pulse.json' with { type: 'json' };
import careApi from '../../../catalog/apis/care.json' with { type: 'json' };
import clinicalApi from '../../../catalog/apis/clinical.json' with { type: 'json' };
import safetyApi from '../../../catalog/apis/safety.json' with { type: 'json' };
import movementApi from '../../../catalog/apis/movement.json' with { type: 'json' };
import trustApi from '../../../catalog/apis/trust.json' with { type: 'json' };
import recordApi from '../../../catalog/apis/record.json' with { type: 'json' };
import medicinesApi from '../../../catalog/apis/medicines.json' with { type: 'json' };
import devicesApi from '../../../catalog/apis/devices.json' with { type: 'json' };
import moneyApi from '../../../catalog/apis/money.json' with { type: 'json' };
import assistantApi from '../../../catalog/apis/assistant.json' with { type: 'json' };

type MatrixRoute = { readonly callers: readonly string[]; readonly purpose: readonly string[]; readonly withdrawn?: unknown };
const everyEngineApi: readonly { routes: readonly MatrixRoute[] }[] = [coreApi, accessApi, pulseApi, careApi, clinicalApi, safetyApi, movementApi, trustApi, recordApi, medicinesApi, devicesApi, moneyApi, assistantApi];
if (everyEngineApi.length !== apis.engineFiles.length) throw new Error('packages/catalog/apis.json#engineFiles no longer names thirteen engines; runtime/permission-matrix.ts imports one engine file short or one too many.');
const routesAcrossEveryEngine: readonly MatrixRoute[] = everyEngineApi.flatMap(doc => doc.routes);

/* The callers the runtime binder refuses before it ever reaches a route — runtime.ts's binderCannotAdmit,
 * the same five core/domain/contract.ts's cannotOwn already filters out of ownerRoles. A route may *name*
 * one of these as a caller, and every public /assistant route names anonymous, but the binder never
 * admits it, so it can never actually act for any purpose. Deriving the matrix over such a caller would
 * answer allowed:true for someone the binder turns away at the door: the assistant routes naming
 * anonymous + treatment were widening roleServesPurpose to say exactly that. So the matrix is derived
 * only over callers the binder admits, read from the one list the binder itself reads, and the two can
 * never disagree about who gets through. */
const binderCannotAdmit = new Set<string>(apis.engineRuntime.binderCannotAdmit);

/** Whether roleId may act for purposeOfUse at all: a caller the binder admits, and a live route, on any
 * engine, that names both. A role in binderCannotAdmit serves no purpose here whatever a route's callers
 * list says, because the binder refuses it before it could reach a route to serve it. */
export const roleServesPurpose = (roleId: string, purposeOfUse: string): boolean =>
 !binderCannotAdmit.has(roleId) &&
 routesAcrossEveryEngine.some(r => !r.withdrawn && r.callers.includes(roleId) && r.purpose.includes(purposeOfUse));

/** The capabilities packages/catalog/vetting.json grants roleId; empty for a role the register never grants one to. */
export const capabilitiesOf = (roleId: string): ReadonlySet<string> =>
 new Set<string>((vetting.roles.find((r: { id: string }) => r.id === roleId)?.grants ?? []).map((g: { capability: string }) => g.capability));

/* Every role a permission check may be asked about: the vetting register's own roles plus every caller
 * apis.json names, which between them are every role a route anywhere admits. A permission check is
 * asked about a role, including one nobody may ever act as, and unknown-role is what says a role is
 * not that either. */
export const scopeMatrixRoles = new Set<string>([...vetting.roles.map((r: { id: string }) => r.id), ...apis.callers.map((c: { id: string }) => c.id)]);
