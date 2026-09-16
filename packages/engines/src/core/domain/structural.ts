/* What Core's protocol registry and ratify route read, and from where (Wave 6). Kept apart from
 * ./contract.ts on purpose: that file is bundled into the web preview (apps/web/src/lib/sentinel.ts
 * imports it), and neither route has a screen, so keeping their reads out of it keeps this JSON out of
 * a bundle that never asked for it. The permission check's cross-engine scope matrix is not here
 * either: it reads every other engine's own API contract, which this directory's own build rule
 * refuses a file for naming, on the honest grounds that this directory copies no other engine's
 * timing — so it lives under packages/engines/src/runtime, imported through runtime/index.ts as
 * roleServesPurpose and capabilitiesOf, the same way the runtime's own binder already reads every
 * engine's contract to admit a caller. Nothing here types a role or a refusal sentence: both are read
 * from packages/catalog, as ./contract.ts's own rule already asks. */
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };
import protocols from '../../../../catalog/protocols.json' with { type: 'json' };
import coreApi from '../../../../catalog/apis/core.json' with { type: 'json' };

/* ── The protocol registry ────────────────────────────────────────────────────────────────────────────
 *
 * GET /v1/core/protocols/{protocolVersionId}@1 reads one row of packages/catalog/protocols.json — the
 * register, and nothing else: twelve names and version numbers, never a threshold, a dose or a word of
 * clinical content. Core holds no copy; it reads the same file the registry is. */
export const protocolVersions: readonly { id: string; name: string; version: number; status: string; contentRef: string | null }[] = protocols.protocols;

/* ── Why POST /v1/core/protocols/{protocolId}/ratify@1 never ratifies anything ──────────────────────
 *
 * Its one caller, read from the route rather than typed here (Core types no role, in its code or on
 * the Control Tower), is a role packages/catalog/vetting.json has never cleared anybody into: there is
 * no governance board sitting, no Medical Director signed on, and protocols.json's own
 * _whyEveryOneIsDraft says as much. A ratification borrows a named role's authority, and there is
 * nobody today whose authority that could honestly be — so the route refuses every attempt with the
 * registry's own sentence for a ratification with no name behind it, unsigned-ratification, rather
 * than inventing the role to make one succeed. That is a vetting decision, not a route's to take, so
 * it is asserted here rather than decided: the day the register does gain the role, this throws, and
 * the route needs a real ratification path rather than a permanent refusal that quietly stayed wrong. */
const ratifyRoute = (coreApi.routes as readonly { method: string; path: string; withdrawn?: unknown; callers: readonly string[] }[])
 .find(r => r.method === 'POST' && !r.withdrawn && r.path.endsWith('/ratify'));
if (!ratifyRoute || ratifyRoute.callers.length !== 1) throw new Error('packages/catalog/apis/core.json no longer gives the protocol ratification route exactly one caller, so the assumption that nobody on the vetting register holds it needs checking afresh, not assuming.');
const ratifyCaller: string = ratifyRoute.callers[0]!;
export const nobodyHoldsMedicalDirector: boolean = !vetting.roles.some((r: { id: string }) => r.id === ratifyCaller);
if (!nobodyHoldsMedicalDirector) throw new Error(`packages/catalog/vetting.json now clears somebody into ${ratifyCaller}. POST /v1/core/protocols/{protocolId}/ratify@1 assumes nobody does and refuses every call on that assumption alone; it needs an honest ratification path now, not a permanent refusal.`);
