/* Whether a pharmacy or a laboratory reads who prescribed: the founder's answer as the default, the admin's change as
 * what a partner's screen reads next, and the queue a partner is sent no wider for either.
 *
 * The founder decided on 2 October 2026, "Pharmacist sees the prescriber — yes, but make this a decision on the system
 * admin." So the answer is a setting rather than a constant, and what these hold is the three things that make that
 * honest: the default is the founder's and says so; a change an admin confirms is what partnerSeesPrescriberOf answers
 * from then on, and only a real yes is a yes; and the setting draws on a partner's screen without the queue route
 * carrying a field more than medicines.json#partnerQueue.carries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import medicines from '../../../../catalog/medicines.json' with { type: 'json' };
import api from '../../../../catalog/apis/medicines.json' with { type: 'json' };
import { proposeChange, snapshotOf } from '../../settings/shape.ts';
import { medicinesBlock, medicinesDefaults, medicinesSettings, partnerSeesPrescriberOf } from './settings.ts';

const KEY = 'partner-sees-prescriber-identity';
const setting = medicinesBlock.items.find(s => s.key === KEY)!;
const change = (value: unknown) => proposeChange(medicinesSettings, [], { setting: KEY, value, reason: 'The pharmacies asked for the standing alone while the identity service is not connected.', expectedVersion: 1, byRole: 'admin', byRef: 'A-901' }, 0);

test('the default is the founder’s yes, decided on the day, and an admin may say either', () => {
 assert.equal(setting.type, 'boolean');
 assert.equal(setting.changedBy, 'admin');
 assert.equal(setting.reviewRequired, undefined, 'who prescribed is not a clinical setting');
 assert.equal(setting.default.value, true);
 assert.equal(setting.default.decidedBy, 'Founder');
 assert.equal((setting.default as { decidedOn?: string }).decidedOn, '2026-10-02');
 assert.deepEqual((setting.allowed ?? []).map(choice => choice.value).sort(), [false, true]);
 assert.deepEqual(partnerSeesPrescriberOf(medicinesDefaults), { sees: true, settingsVersion: 1 });
});

test('the admin’s change is what a partner’s screen reads next, and nothing but true is a yes', () => {
 const off = change(false);
 assert.ok(off.ok);
 assert.deepEqual(partnerSeesPrescriberOf(snapshotOf(medicinesBlock, [off.value.change])), { sees: false, settingsVersion: 2 });
 for (const value of setting.guardrail!.forbids) assert.equal(change(value).ok, false, `${JSON.stringify(value)} is refused`);
});

test('the setting widens what a partner is drawn and never what the queue route carries', () => {
 const whenSet = medicines.partnerQueue.carriesWhenSet.find(entry => entry.setting === KEY)!;
 assert.ok(whenSet, 'partnerQueue says what the setting adds');
 const queue = api.routes.find(route => route.method === 'GET' && route.path === '/v1/medicines/orders' && route.version === 2)!;
 const carried = (queue.response.find(field => field.field === 'orders') as unknown as { fields: { field: string }[] }).fields.map(field => field.field);
 assert.deepEqual([...carried].sort(), [...medicines.partnerQueue.carries].sort());
 for (const field of whenSet.fields) assert.ok(!carried.includes(field), `${field} is drawn on a partner's screen through the setting, and never carried on the queue`);
 assert.ok(medicines.partnerQueue.neverCarries.includes('prescriberRef'), 'the platform’s own reference for the prescriber reaches no partner either way');
});
