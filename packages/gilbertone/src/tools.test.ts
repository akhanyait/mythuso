import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, type AllowedTool } from './tools.ts';
import access from '../../catalog/apis/access.json' with { type: 'json' };

/* The refusal sentences are the catalog's own — "tool-not-allowed" in the tool route's refusals,
   "tool-grant-required" among the engine's rules — read here so the registry and the catalog
   refuse in the same words. */
type CatalogRefusal = { id: string; statement: string };
type CatalogRoute = { path: string; refusals?: CatalogRefusal[] };

const toolRoute = (access.routes as unknown as CatalogRoute[]).find(
  (route) => route.path === '/v1/access/tools/{tool}',
);
const engineRefusals = access.refusals as unknown as CatalogRefusal[];

const sentenceOf = (id: string): string => {
  const refusal =
    toolRoute?.refusals?.find((entry) => entry.id === id) ??
    engineRefusals.find((entry) => entry.id === id);
  assert.ok(refusal, `apis/access.json should declare a "${id}" refusal`);
  return refusal.statement;
};

/* A small allow-list to ask against: one tool for a patient, one for staff, each standing behind
   its own grant. The registry knows nothing about either tool until it is handed them. */
const careVisits: AllowedTool = {
  name: 'care-visits',
  engine: 'care',
  route: '/v1/care/visits',
  purpose: "The visits on the caller's own care plan.",
  requiredGrants: ['care:read'],
  audiences: ['patient'],
};

const nurseQueue: AllowedTool = {
  name: 'nurse-queue',
  engine: 'access',
  route: '/v1/access/queue',
  purpose: 'The nurse queue, for staff who carry the grant.',
  requiredGrants: ['queue:read'],
  audiences: ['nurse', 'control-tower'],
};

const registry = new ToolRegistry([careVisits, nurseQueue]);

test('an empty registry allows nothing', () => {
  /* The safe default: the catalog has no explicit tool list yet, and a registry that has been
     handed nothing offers nothing. */
  const empty = new ToolRegistry();
  const check = empty.isAllowed('care-visits', 'patient', ['care:read']);
  assert.equal(check.allowed, false);
  assert.equal(check.refusal, sentenceOf('tool-not-allowed'));
  assert.deepEqual(empty.listForAudience('patient'), []);
  assert.equal(empty.resolve('care-visits'), null);
});

test('an unknown tool is refused in the route’s own sentence', () => {
  const check = registry.isAllowed('general-record-dump', 'patient', ['care:read']);
  assert.equal(check.allowed, false);
  assert.equal(check.refusal, sentenceOf('tool-not-allowed'));
});

test('a tool outside the caller’s audience is refused', () => {
  const check = registry.isAllowed('nurse-queue', 'patient', ['queue:read']);
  assert.equal(check.allowed, false);
  assert.equal(check.refusal, sentenceOf('tool-not-allowed'));
});

test('a tool whose grant the caller does not carry is refused in the grant sentence', () => {
  const withoutGrants = registry.isAllowed('nurse-queue', 'nurse', []);
  assert.equal(withoutGrants.allowed, false);
  assert.equal(withoutGrants.refusal, sentenceOf('tool-grant-required'));
  const withAnotherGrant = registry.isAllowed('nurse-queue', 'nurse', ['care:read']);
  assert.equal(withAnotherGrant.allowed, false);
  assert.equal(withAnotherGrant.refusal, sentenceOf('tool-grant-required'));
});

test('a known tool with the audience and the grant is allowed, and resolves', () => {
  const check = registry.isAllowed('nurse-queue', 'nurse', ['queue:read']);
  assert.equal(check.allowed, true);
  assert.equal(check.refusal, undefined);
  assert.deepEqual(registry.resolve('nurse-queue'), {
    engine: 'access',
    route: '/v1/access/queue',
  });
  /* an unknown name resolves to nothing rather than to a guess */
  assert.equal(registry.resolve('no-such-tool'), null);
});

test('listForAudience answers only the tools that audience may be offered', () => {
  assert.deepEqual(
    registry.listForAudience('patient').map((tool) => tool.name),
    ['care-visits'],
  );
  assert.deepEqual(
    registry.listForAudience('nurse').map((tool) => tool.name),
    ['nurse-queue'],
  );
  assert.deepEqual(
    registry.listForAudience('partner').map((tool) => tool.name),
    [],
  );
});

test('the registry keeps its own copy of the list it was handed', () => {
  const source = [careVisits];
  const own = new ToolRegistry(source);
  source.pop();
  assert.equal(own.listForAudience('patient').length, 1);
});
