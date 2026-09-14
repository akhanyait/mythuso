/**
 * What the gateway reads out of the catalogue, typed, in one place.
 *
 * Record categories are packages/catalog/records.json's, so a grant's scope is never a free-text
 * promise and "protected" means the same thing here as it does on every screen. The resource set,
 * the sealed rule, break-glass and every sentence are packages/catalog/passport-gateway.json's. The
 * eight recipient roles are the local fixture's until consent.json carries `grants`.
 */
import gateway from '../../../packages/catalog/passport-gateway.json' with { type: 'json' };
import records from '../../../packages/catalog/records.json' with { type: 'json' };
import { GRANT_ROLES_FIXTURE, type GrantRole } from './grant-roles.fixture.ts';

export { refusalOf } from './config.ts';
export const GATEWAY = gateway;

export type ResourceRule = { type: string; categories: readonly string[]; writable: boolean };
export type StatementId = keyof typeof gateway.statements;

const SENSITIVITY = new Map(records.records.map(record => [record.id, record.sensitivity] as const));

export const knownCategory = (category: string): boolean => SENSITIVITY.has(category);
export const sensitivityOf = (category: string): string | null => SENSITIVITY.get(category) ?? null;
export const isProtectedCategory = (category: string): boolean => SENSITIVITY.get(category) === gateway.sealed.sensitivity;
export const resourceRule = (type: string): ResourceRule | null => gateway.resources.find(rule => rule.type === type) ?? null;
export const roleRule = (id: string): GrantRole | null => GRANT_ROLES_FIXTURE.find(role => role.id === id) ?? null;
export const statement = (id: StatementId): string => gateway.statements[id];
