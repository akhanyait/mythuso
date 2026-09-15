/* Devices on the engine runtime: the registry and its health, readings asked for and linked to the record,
 * wearable link requests, and kits.
 *
 * NO VALUE IS EVER HERE. packages/catalog/devices.json whereValuesLive. POST /v1/devices/readings@2 carries
 * everything about a reading but its value; every refusal is decided on that; the capturer then writes the
 * value to the Health Passport through its consent gateway, under their own grant, and names the Observation
 * on POST /v1/devices/readings/{readingRef}/observation@1. No table below has a column a value could be written
 * into, and scripts/check-boundaries.mjs holds the schema to that.
 *
 * PUBLISHED ONLY WITH CLINICAL WEIGHT. reading.ingested@1 goes out when a reading is linked and carries
 * clinical weight as it stands then — packages/engines/src/devices/domain/readings.ts carriesWeight(), the one
 * answer. A consumer device's reading, a simulated one, a poor sample, a reading from a recalled device and one
 * taken to guide a conversation are kept with their marks and published on nothing, because every engine that
 * hears reading.ingested@1 raises, reviews or escalates and the event cannot tell them apart. device.stale@1 is
 * announced only for a certified device, once for each silence, because it justifies an alert to Core.
 * device.recalled@1 is published on every recall.
 *
 * HEARD: nothing. Devices subscribes to no event. The subscribers the three events list were declared in Wave 2;
 * none of them binds a handler for a device event today, and the Devices lead's report says so.
 *
 * A RECALL MARKS AND NEVER DELETES. reading_marks is added to and never updated or removed, and a recall adds a
 * recalled mark to every reading from the device taken at or after the moment it took effect.
 *
 * A LOSS CHARGES NOBODY, AND A DEPOSIT IS RECORDED AND NOT TAKEN. kit_audit is added to and never edited. Money
 * is Wave 5's.
 *
 * SETTINGS. The stale interval, the calibration due window and the kit deposit are read in force from this
 * engine's own history whenever something is worked out, and a kit keeps the deposit and version it was issued
 * under. The routes are bound through packages/engines/src/settings.
 *
 * Nothing here is a real service: no instrument, phone or watch is contacted, and every device is fictional.
 */
import { randomUUID } from 'node:crypto';
import { defineEngine, instant, ok, refuse, type EngineContext, type HandlerRequest } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, historyOf, settingsRoutes } from '../settings/routes.ts';
import type { DeviceClassId, MarkId } from './domain/contract.ts';
import { healthOf, recall, register, staleToAnnounce, synced, type Device } from './domain/registry.ts';
import { ask, clinicalUseOf, link, readingsToMarkForRecall, type Reading } from './domain/readings.ts';
import { LINK_STATE, requestLink, withdrawLink, withdrawnFor, type Link } from './domain/links.ts';
import { issueKit, reportLoss, returnKit, type Kit, type KitAct } from './domain/kits.ts';
import { devicesInForce, devicesSettings } from './domain/settings.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS devices (',
 ' device_ref TEXT PRIMARY KEY,',
 ' serial TEXT NOT NULL UNIQUE,',
 ' model TEXT NOT NULL,',
 ' firmware TEXT NOT NULL,',
 ' device_class TEXT NOT NULL,',
 ' instrument_kind TEXT,',
 ' calibrated_on TEXT,',
 ' battery_percent INTEGER,',
 ' last_sync_at INTEGER,',
 ' registered_at INTEGER NOT NULL,',
 ' recall_reason_code TEXT,',
 ' recall_effective_from INTEGER,',
 ' recall_recorded_at INTEGER,',
 ' stale_announced_for INTEGER',
 ');',
 'CREATE TABLE IF NOT EXISTS readings (',
 ' reading_ref TEXT PRIMARY KEY,',
 ' subject_ref TEXT NOT NULL,',
 ' device_ref TEXT NOT NULL,',
 ' device_class TEXT NOT NULL,',
 ' metric TEXT NOT NULL,',
 ' unit TEXT NOT NULL,',
 ' taken_at INTEGER NOT NULL,',
 ' source TEXT NOT NULL,',
 ' quality_code TEXT NOT NULL,',
 ' consent_state TEXT NOT NULL,',
 ' intended_use TEXT NOT NULL,',
 ' simulated INTEGER NOT NULL,',
 ' asked_at INTEGER NOT NULL,',
 ' asked_by_role TEXT NOT NULL,',
 ' asked_by_ref TEXT,',
 ' settings_version INTEGER NOT NULL,',
 ' observation_ref TEXT,',
 ' linked_at INTEGER,',
 ' published INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS reading_marks (',
 ' reading_ref TEXT NOT NULL,',
 ' mark_code TEXT NOT NULL,',
 ' marked_at INTEGER NOT NULL,',
 ' PRIMARY KEY (reading_ref, mark_code)',
 ');',
 'CREATE TABLE IF NOT EXISTS wearable_links (',
 ' link_ref TEXT PRIMARY KEY,',
 ' subject_ref TEXT NOT NULL,',
 ' platform TEXT NOT NULL,',
 ' consent_version INTEGER NOT NULL,',
 ' metric_codes TEXT NOT NULL,',
 ' requested_at INTEGER NOT NULL,',
 ' withdrawn_at INTEGER',
 ');',
 'CREATE TABLE IF NOT EXISTS kits (',
 ' kit_ref TEXT PRIMARY KEY,',
 ' kit_serial TEXT NOT NULL,',
 ' holder_ref TEXT NOT NULL,',
 ' device_refs TEXT NOT NULL,',
 ' deposit_cents INTEGER NOT NULL,',
 ' settings_version INTEGER NOT NULL,',
 ' issued_at INTEGER NOT NULL,',
 ' closed_code TEXT,',
 ' closed_at INTEGER,',
 ' closed_reason_code TEXT',
 ');',
 'CREATE TABLE IF NOT EXISTS kit_audit (',
 ' kit_ref TEXT NOT NULL,',
 ' act TEXT NOT NULL,',
 ' reason_code TEXT,',
 ' by_role TEXT NOT NULL,',
 ' by_ref TEXT,',
 ' at INTEGER NOT NULL',
 ');',
 SETTINGS_SCHEMA
].join('\n');

const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const at = (ms: number) => instant(new Date(ms));
const text = (value: unknown) => typeof value === 'string' ? value : '';
const settingsOf = (ctx: EngineContext) => devicesInForce(historyOf(ctx.store));

/* ── The store ────────────────────────────────────────────────────────────────────────────────────── */

type DeviceRow = {
 device_ref: string; serial: string; model: string; firmware: string; device_class: string; instrument_kind: string | null; calibrated_on: string | null;
 battery_percent: number | null; last_sync_at: number | null; registered_at: number; recall_reason_code: string | null; recall_effective_from: number | null;
 recall_recorded_at: number | null; stale_announced_for: number | null;
};
const deviceFrom = (row: DeviceRow): Device => ({
 deviceRef: row.device_ref, serial: row.serial, model: row.model, firmware: row.firmware, deviceClass: row.device_class as DeviceClassId,
 instrumentKind: row.instrument_kind, calibratedOn: row.calibrated_on, batteryPercent: row.battery_percent, lastSyncAt: row.last_sync_at,
 registeredAt: row.registered_at,
 recall: row.recall_reason_code === null ? null : { reasonCode: row.recall_reason_code, effectiveFrom: row.recall_effective_from!, recordedAt: row.recall_recorded_at! }
});
const DEVICE_COLUMNS = 'device_ref, serial, model, firmware, device_class, instrument_kind, calibrated_on, battery_percent, last_sync_at, registered_at, recall_reason_code, recall_effective_from, recall_recorded_at, stale_announced_for';
const deviceRowByRef = (ctx: EngineContext, ref: unknown) => ctx.store.prepare(`SELECT ${DEVICE_COLUMNS} FROM devices WHERE device_ref = ?`).get(String(ref)) as DeviceRow | undefined;
const deviceByRef = (ctx: EngineContext, ref: unknown) => { const row = deviceRowByRef(ctx, ref); return row ? deviceFrom(row) : undefined; };
const allDeviceRows = (ctx: EngineContext) => ctx.store.prepare(`SELECT ${DEVICE_COLUMNS} FROM devices ORDER BY registered_at, device_ref`).all() as DeviceRow[];
const putDevice = (ctx: EngineContext, d: Device) => {
 ctx.store.prepare('UPDATE devices SET firmware = ?, battery_percent = ?, last_sync_at = ?, recall_reason_code = ?, recall_effective_from = ?, recall_recorded_at = ? WHERE device_ref = ?')
  .run(d.firmware, d.batteryPercent, d.lastSyncAt, d.recall?.reasonCode ?? null, d.recall?.effectiveFrom ?? null, d.recall?.recordedAt ?? null, d.deviceRef);
};

type ReadingRow = {
 reading_ref: string; subject_ref: string; device_ref: string; device_class: string; metric: string; unit: string; taken_at: number; source: string;
 quality_code: string; consent_state: string; intended_use: string; simulated: number; asked_at: number; asked_by_role: string; asked_by_ref: string | null;
 settings_version: number; observation_ref: string | null; linked_at: number | null; published: number;
};
const READING_COLUMNS = 'reading_ref, subject_ref, device_ref, device_class, metric, unit, taken_at, source, quality_code, consent_state, intended_use, simulated, asked_at, asked_by_role, asked_by_ref, settings_version, observation_ref, linked_at, published';
const marksOf = (ctx: EngineContext, readingRef: string) =>
 (ctx.store.prepare('SELECT mark_code FROM reading_marks WHERE reading_ref = ? ORDER BY marked_at, rowid').all(readingRef) as { mark_code: string }[]).map(m => m.mark_code as MarkId);
const readingFrom = (ctx: EngineContext, row: ReadingRow): Reading => ({
 readingRef: row.reading_ref, subjectRef: row.subject_ref, deviceRef: row.device_ref, deviceClass: row.device_class as DeviceClassId, metric: row.metric, unit: row.unit,
 takenAt: row.taken_at, source: row.source, quality: row.quality_code, consentState: row.consent_state, intendedUse: row.intended_use, simulated: row.simulated === 1,
 askedAt: row.asked_at, askedByRole: row.asked_by_role, askedByRef: row.asked_by_ref, settingsVersion: row.settings_version,
 marks: marksOf(ctx, row.reading_ref), observationRef: row.observation_ref, linkedAt: row.linked_at, published: row.published === 1
});
const readingByRef = (ctx: EngineContext, ref: unknown) => {
 const row = ctx.store.prepare(`SELECT ${READING_COLUMNS} FROM readings WHERE reading_ref = ?`).get(String(ref)) as ReadingRow | undefined;
 return row ? readingFrom(ctx, row) : undefined;
};
const readingsOfDevice = (ctx: EngineContext, deviceRef: string) =>
 (ctx.store.prepare(`SELECT ${READING_COLUMNS} FROM readings WHERE device_ref = ? ORDER BY taken_at`).all(deviceRef) as ReadingRow[]).map(row => readingFrom(ctx, row));
/* A mark is added and never taken away: INSERT OR IGNORE keeps the first time a reading was given it. */
const addMark = (ctx: EngineContext, readingRef: string, mark: MarkId, markedAt: number) =>
 ctx.store.prepare('INSERT OR IGNORE INTO reading_marks (reading_ref, mark_code, marked_at) VALUES (?, ?, ?)').run(readingRef, mark, markedAt);

type LinkRow = { link_ref: string; subject_ref: string; platform: string; consent_version: number; metric_codes: string; requested_at: number; withdrawn_at: number | null };
const linkFrom = (row: LinkRow): Link => ({
 linkRef: row.link_ref, subjectRef: row.subject_ref, platform: row.platform, consentVersion: row.consent_version,
 metrics: JSON.parse(row.metric_codes) as string[], requestedAt: row.requested_at, withdrawnAt: row.withdrawn_at
});
const allLinks = (ctx: EngineContext) => (ctx.store.prepare('SELECT link_ref, subject_ref, platform, consent_version, metric_codes, requested_at, withdrawn_at FROM wearable_links ORDER BY requested_at').all() as LinkRow[]).map(linkFrom);

type KitRow = { kit_ref: string; kit_serial: string; holder_ref: string; device_refs: string; deposit_cents: number; settings_version: number; issued_at: number; closed_code: string | null; closed_at: number | null; closed_reason_code: string | null };
const kitFrom = (row: KitRow): Kit => ({
 kitRef: row.kit_ref, kitSerial: row.kit_serial, holderRef: row.holder_ref, deviceRefs: JSON.parse(row.device_refs) as string[],
 depositCents: row.deposit_cents, settingsVersion: row.settings_version, issuedAt: row.issued_at,
 closed: row.closed_code === null ? null : { code: row.closed_code as 'returned' | 'lost', at: row.closed_at!, reasonCode: row.closed_reason_code }
});
const KIT_COLUMNS = 'kit_ref, kit_serial, holder_ref, device_refs, deposit_cents, settings_version, issued_at, closed_code, closed_at, closed_reason_code';
const kitByRef = (ctx: EngineContext, ref: unknown) => { const row = ctx.store.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE kit_ref = ?`).get(String(ref)) as KitRow | undefined; return row ? kitFrom(row) : undefined; };
const openKits = (ctx: EngineContext) => (ctx.store.prepare(`SELECT ${KIT_COLUMNS} FROM kits WHERE closed_code IS NULL ORDER BY issued_at`).all() as KitRow[]).map(kitFrom);
const audit = (ctx: EngineContext, kitRef: string, act: KitAct, reasonCode: string | null, when: number) =>
 ctx.store.prepare('INSERT INTO kit_audit (kit_ref, act, reason_code, by_role, by_ref, at) VALUES (?, ?, ?, ?, ?, ?)').run(kitRef, act, reasonCode, ctx.caller.role, ctx.caller.ref, when);
const closeKit = (ctx: EngineContext, kit: Kit) =>
 ctx.store.prepare('UPDATE kits SET closed_code = ?, closed_at = ?, closed_reason_code = ? WHERE kit_ref = ? AND closed_code IS NULL').run(kit.closed!.code, kit.closed!.at, kit.closed!.reasonCode, kit.kitRef);

/* ── The routes ───────────────────────────────────────────────────────────────────────────────────── */

function recallRoute(request: HandlerRequest, ctx: EngineContext) {
 const device = deviceByRef(ctx, request.fields.deviceRef);
 if (!device) return refuse('device-not-registered');
 const now = nowOf(ctx);
 const recalled = recall(device, { reasonCode: request.fields.reasonCode, effectiveFrom: request.fields.effectiveFrom }, now);
 if (!recalled.ok) return refuse(recalled.refusal.id);
 putDevice(ctx, recalled.value);
 const marked = readingsToMarkForRecall(readingsOfDevice(ctx, device.deviceRef), recalled.value);
 for (const r of marked) addMark(ctx, r.readingRef, 'recalled', now);
 const holding = openKits(ctx).filter(k => k.deviceRefs.includes(device.deviceRef)).length;
 /* The device is the subject: Devices keeps no holder's token on the bus, and who holds it is read from the registry. */
 ctx.publish('device.recalled@1', { deviceRef: device.deviceRef, reasonCode: recalled.value.recall!.reasonCode }, { subjectRef: device.deviceRef });
 return ok({ recalledAt: at(now), marksAdded: marked.length, kitsHolding: holding });
}

export const engine = defineEngine({
 id: 'devices',
 store: { schema },
 routes: {
  'POST /v1/devices/registry@2': (request, ctx) => {
   const now = nowOf(ctx);
   const serial = text(request.fields.serial);
   const taken = ctx.store.prepare('SELECT 1 AS found FROM devices WHERE serial = ?').get(serial) !== undefined;
   const registered = register({
    deviceRef: 'device-' + randomUUID(), serial, model: text(request.fields.model), firmware: text(request.fields.firmware),
    deviceClass: request.fields.deviceClass, instrumentKind: request.fields.instrumentKind, calibratedOn: request.fields.calibratedOn
   }, taken, now);
   if (!registered.ok) return refuse(registered.refusal.id);
   const d = registered.value;
   ctx.store.prepare(`INSERT INTO devices (${DEVICE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.deviceRef, d.serial, d.model, d.firmware, d.deviceClass, d.instrumentKind, d.calibratedOn, d.batteryPercent, d.lastSyncAt, d.registeredAt, null, null, null, null);
   return ok({ deviceRef: d.deviceRef, registeredAt: at(now) });
  },

  'POST /v1/devices/registry/{deviceRef}/recall@2': recallRoute,

  'GET /v1/devices/registry/{deviceRef}/health@2': (request, ctx) => {
   const device = deviceByRef(ctx, request.fields.deviceRef);
   if (!device) return refuse('device-not-registered');
   const health = healthOf(device, nowOf(ctx), settingsOf(ctx));
   return ok({
    stateCode: health.stateCode, deviceClass: health.deviceClass, stale: health.stale, recalled: health.recalled,
    calibrationStateCode: health.calibration.stateCode, firmware: health.firmware, settingsVersion: health.settingsVersion,
    ...(health.lastSyncAt === null ? {} : { lastSyncAt: at(health.lastSyncAt) }),
    ...(health.recalledFrom === null ? {} : { recalledFrom: at(health.recalledFrom) }),
    ...(health.calibration.dueOn === null ? {} : { calibrationDueOn: health.calibration.dueOn }),
    ...(health.batteryPercent === null ? {} : { batteryPercent: health.batteryPercent })
   });
  },

  /* The value is not a declared field, so the binder never hands it over: a request that sends one is refused
     here rather than silently dropped, because a phone that believes Devices kept its value is a phone that
     never writes it to the record. */
  'POST /v1/devices/readings@2': (request, ctx) => {
   if (request.undeclared.length) return refuse('reading-without-source-and-quality');
   const now = nowOf(ctx);
   const device = deviceByRef(ctx, request.fields.deviceRef);
   const subjectRef = text(request.fields.subjectRef);
   const asked = ask({
    readingRef: 'reading-' + randomUUID(), subjectRef, deviceRef: text(request.fields.deviceRef),
    metric: request.fields.metric, unit: request.fields.unit, takenAt: request.fields.takenAt,
    source: request.fields.source, quality: request.fields.quality, consentState: request.fields.consentState,
    intendedUse: request.fields.intendedUse, simulated: request.fields.simulated,
    askedByRole: ctx.caller.role, askedByRef: ctx.caller.ref
   }, { device, withdrawnForSubject: withdrawnFor(allLinks(ctx), subjectRef, now), now, settings: settingsOf(ctx) });
   if (!asked.ok) return refuse(asked.refusal.id);
   const r = asked.value;
   ctx.store.prepare(`INSERT INTO readings (${READING_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(r.readingRef, r.subjectRef, r.deviceRef, r.deviceClass, r.metric, r.unit, r.takenAt, r.source, r.quality, r.consentState, r.intendedUse, r.simulated ? 1 : 0,
     r.askedAt, r.askedByRole, r.askedByRef, r.settingsVersion, null, null, 0);
   for (const mark of r.marks) addMark(ctx, r.readingRef, mark, now);
   putDevice(ctx, synced(device!, now, request.fields.batteryPercent));
   return ok({ readingRef: r.readingRef, clinicalUseCode: clinicalUseOf(r), markCodes: [...r.marks], askedAt: at(now) });
  },

  'POST /v1/devices/readings/{readingRef}/observation@1': (request, ctx) => {
   const reading = readingByRef(ctx, request.fields.readingRef);
   if (!reading) return refuse('reading-not-waiting');
   const now = nowOf(ctx);
   const linked = link(reading, { observationRef: text(request.fields.observationRef), byRef: ctx.caller.ref, withdrawnForSubject: withdrawnFor(allLinks(ctx), reading.subjectRef, now) }, now);
   if (!linked.ok) return refuse(linked.refusal.id);
   const { reading: after, publish } = linked.value;
   ctx.store.prepare('UPDATE readings SET observation_ref = ?, linked_at = ?, published = ? WHERE reading_ref = ? AND observation_ref IS NULL')
    .run(after.observationRef, after.linkedAt, publish ? 1 : 0, after.readingRef);
   if (publish) {
    ctx.publish('reading.ingested@1', {
     readingRef: after.readingRef, deviceRef: after.deviceRef, metric: after.metric, qualityCode: after.quality, observationRef: after.observationRef
    }, { subjectRef: after.subjectRef });
   }
   return ok({ ingestedAt: at(now), clinicalUseCode: clinicalUseOf(after), published: publish });
  },

  'POST /v1/devices/wearable-links@2': (request, ctx) => {
   const now = nowOf(ctx);
   const requested = requestLink({
    linkRef: 'link-' + randomUUID(), subjectRef: ctx.caller.ref, platform: request.fields.platform,
    consentVersion: request.fields.consentVersion, metrics: request.fields.metrics
   }, allLinks(ctx), now);
   if (!requested.ok) return refuse(requested.refusal.id);
   const l = requested.value;
   ctx.store.prepare('INSERT INTO wearable_links (link_ref, subject_ref, platform, consent_version, metric_codes, requested_at, withdrawn_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(l.linkRef, l.subjectRef, l.platform, l.consentVersion, JSON.stringify(l.metrics), l.requestedAt, null);
   return ok({ linkRef: l.linkRef, stateCode: LINK_STATE, requestedAt: at(now) });
  },

  'POST /v1/devices/wearable-links/{linkRef}/withdraw@1': (request, ctx) => {
   const found = allLinks(ctx).find(l => l.linkRef === request.fields.linkRef);
   if (!found) return refuse('link-not-found');
   const now = nowOf(ctx);
   const withdrawn = withdrawLink(found, ctx.caller.ref, now);
   if (!withdrawn.ok) return refuse(withdrawn.refusal.id);
   ctx.store.prepare('UPDATE wearable_links SET withdrawn_at = ? WHERE link_ref = ? AND withdrawn_at IS NULL').run(now, found.linkRef);
   return ok({ withdrawnAt: at(now) });
  },

  'POST /v1/devices/kits@2': (request, ctx) => {
   const now = nowOf(ctx);
   const issued = issueKit({
    kitRef: 'kit-' + randomUUID(), kitSerial: text(request.fields.kitSerial), holderRef: text(request.fields.holderRef), deviceRefs: request.fields.deviceRefs
   }, { deviceOf: ref => deviceByRef(ctx, ref), openKits: openKits(ctx), settings: settingsOf(ctx), now });
   if (!issued.ok) return refuse(issued.refusal.id);
   const k = issued.value;
   ctx.store.prepare(`INSERT INTO kits (${KIT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(k.kitRef, k.kitSerial, k.holderRef, JSON.stringify(k.deviceRefs), k.depositCents, k.settingsVersion, k.issuedAt, null, null, null);
   audit(ctx, k.kitRef, 'issued', null, now);
   return ok({ kitRef: k.kitRef, depositCents: k.depositCents, settingsVersion: k.settingsVersion });
  },

  'POST /v1/devices/kits/{kitRef}/return@2': (request, ctx) => {
   const now = nowOf(ctx);
   const returned = returnKit(kitByRef(ctx, request.fields.kitRef), now);
   if (!returned.ok) return refuse(returned.refusal.id);
   closeKit(ctx, returned.value);
   audit(ctx, returned.value.kitRef, 'returned', null, now);
   return ok({ returnedAt: at(now) });
  },

  'POST /v1/devices/kits/{kitRef}/loss@2': (request, ctx) => {
   const now = nowOf(ctx);
   const lost = reportLoss(kitByRef(ctx, request.fields.kitRef), { reasonCode: request.fields.reasonCode, byRole: ctx.caller.role, byRef: ctx.caller.ref }, now);
   if (!lost.ok) return refuse(lost.refusal.id);
   closeKit(ctx, lost.value);
   audit(ctx, lost.value.kitRef, 'lost', lost.value.closed!.reasonCode, now);
   return ok({ recordedAt: at(now) });
  },

  ...settingsRoutes(devicesSettings, { read: 'GET /v1/devices/settings@1', change: 'POST /v1/devices/setting-changes@1' })
 },
 subscriptions: {},
 /* Each tick, a certified device silent for longer than the interval in force is announced once for that
    silence. The interval is read now, so a change reaches the next silence; one already announced is not
    announced again because the interval moved. */
 tick: ctx => {
  const now = nowOf(ctx);
  const settings = settingsOf(ctx);
  for (const row of allDeviceRows(ctx)) {
   const device = deviceFrom(row);
   if (!staleToAnnounce(device, now, settings.staleAfterMinutes, row.stale_announced_for)) continue;
   ctx.store.prepare('UPDATE devices SET stale_announced_for = ? WHERE device_ref = ?').run(device.lastSyncAt, device.deviceRef);
   ctx.publish('device.stale@1', { deviceRef: device.deviceRef, lastSyncAt: at(device.lastSyncAt!) }, { subjectRef: device.deviceRef, purposeOfUse: 'treatment' });
  }
 }
});
