import type { Audience } from './engine.ts';
import access from '../../catalog/apis/access.json' with { type: 'json' };

/* The allow-listed tool registry, grounded in the catalog's tool gateway.

   packages/catalog/apis.json declares GilbertOne's tool gateway as id "tool-gateway", engine
   "access", path /v1/access/tools/{tool}, and packages/catalog/apis/access.json declares that
   route: a patient-facing model reaches only named actions on an allow-list (§15D), never a
   general-purpose record tool. The catalog has no explicit tool list yet — when it does, this
   registry is what loads it — so the constructor takes the list and an empty registry is a
   registry that allows nothing, which is the safe default: an unknown tool, a tool outside the
   caller's audience, and a tool whose grants the caller does not carry are all refused, in the
   catalog's own sentences, read from apis/access.json rather than typed here.

   Two refusals, two homes, both in apis/access.json. "tool-not-allowed" is the tool route's own
   refusal, frozen with the route. "tool-grant-required" is declared at the engine level beside
   access.json's other rules, because the grant check is this registry's and not the route's: no
   route answers it. The lookup takes the route's refusals first and the engine's after. */

export interface AllowedTool {
  name: string;
  engine: string;
  route: string;
  purpose: string;
  requiredGrants: string[];
  audiences: Audience[];
}

export interface ToolCheckResult {
  allowed: boolean;
  refusal?: string;
}

type CatalogRefusal = { id: string; statement: string };
type CatalogRoute = { path: string; refusals?: CatalogRefusal[] };

/* Resolved from the catalog module-level, without a throw: the module stays a pure declaration
   until a caller asks it something. A sentence that is missing is refused at the call rather
   than defaulted, because a refusal nobody can read is not a refusal. */
const toolsRoute = (access.routes as unknown as CatalogRoute[]).find(
  (route) => route.path === '/v1/access/tools/{tool}',
);
const engineRefusals = access.refusals as unknown as CatalogRefusal[];

const sentence = (id: string): string => {
  const refusal =
    toolsRoute?.refusals?.find((entry) => entry.id === id) ??
    engineRefusals.find((entry) => entry.id === id);
  if (!refusal)
    throw new Error(
      `packages/catalog/apis/access.json declares no "${id}", neither in the tool route's refusals nor among the engine's. The sentence lives in the catalog, not here.`,
    );
  return refusal.statement;
};

export class ToolRegistry {
  private tools: AllowedTool[];

  constructor(tools: AllowedTool[] = []) {
    this.tools = [...tools];
  }

  /** Whether this caller may reach this tool: known, offered to the audience, grants carried. */
  isAllowed(toolName: string, audience: Audience, grants: string[]): ToolCheckResult {
    const tool = this.tools.find((entry) => entry.name === toolName);
    if (!tool) return { allowed: false, refusal: sentence('tool-not-allowed') };
    if (!tool.audiences.includes(audience))
      return { allowed: false, refusal: sentence('tool-not-allowed') };
    if (!tool.requiredGrants.every((grant) => grants.includes(grant)))
      return { allowed: false, refusal: sentence('tool-grant-required') };
    return { allowed: true };
  }

  /** The engine and route a tool name stands for, or null — the gateway's own lookup. */
  resolve(toolName: string): { engine: string; route: string } | null {
    const tool = this.tools.find((entry) => entry.name === toolName);
    return tool ? { engine: tool.engine, route: tool.route } : null;
  }

  /** Every tool offered to an audience, in the order the list was loaded. */
  listForAudience(audience: Audience): AllowedTool[] {
    return this.tools.filter((tool) => tool.audiences.includes(audience));
  }
}
