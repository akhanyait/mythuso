/* The HL7 v2 bridge's two Record settings, read as the bridge uses them (Wave 5).
 *
 * A message reads them once, when it arrives: the clock skew it is judged against, and — if it is quarantined — how long
 * its record is kept, which the quarantine row keeps with the settings version, so a change afterwards moves no deletion
 * day already given. The retention is the Information Officer's to confirm (D-8).
 *
 * WHY A FILE OF ITS OWN. ./settings.ts is on the patient's first load in the web preview, because the share links'
 * settings are read there. Readers only the Passport and the bridge's lazy screens need live here, so none of their bytes
 * ride on that first load.
 */
import { snapshotOf, type Change, type Snapshot } from '../../settings/shape.ts';
import { recordBlock } from './settings.ts';

export type InboundInForce = {
 readonly settingsVersion: number;
 readonly quarantineRetentionDays: number;
 readonly clockSkewMinutes: number;
};

export const inboundSettingsOf = (snapshot: Snapshot): InboundInForce => Object.freeze({
 settingsVersion: snapshot.settingsVersion,
 quarantineRetentionDays: snapshot.values['hl7-quarantine-retention-days'] as number,
 clockSkewMinutes: snapshot.values['hl7-clock-skew-minutes'] as number
});

/** The settings in force after a history of accepted changes. An empty history is the contract's defaults. */
export const inboundInForce = (history: readonly Change[]): InboundInForce => inboundSettingsOf(snapshotOf(recordBlock, history));
