import vitals from '../../../../../packages/catalog/vitals.json' with { type: 'json' };
import devices from '../../../../../packages/catalog/devices.json' with { type: 'json' };
import pairing from '../../../../../packages/catalog/devices/pairing-paths.json' with { type: 'json' };
import indicators from '../../../../../packages/catalog/devices/health-indicators.json' with { type: 'json' };
import thresholds from '../../../../../packages/catalog/devices/thresholds.json' with { type: 'json' };
import trust from '../../../../../packages/catalog/devices/trust-model.json' with { type: 'json' };
import { fill, portalContract, portalRefusal } from '../../lib/portal';
import { usePortal } from './context';
import { Frame } from './Frame';
import { BuildWord, Empty, Region, RovingList } from './Parts';

/* Devices & Fleet (§5.4): the fleet overview, the provisioning wizard and the device-class allowlist.
 *
 * Every fact on these three screens is read from the contract that owns it and none is typed here —
 * how many real devices are allowlisted and whether the DPIA is done from packages/catalog/vitals.json,
 * the classes from devices.json, the tiers and transports from devices/pairing-paths.json, what a fleet
 * view would watch from devices/health-indicators.json, the thresholds from devices/thresholds.json.
 * scripts/check-boundaries.mjs fails this file if it types a device count or the assessment's state,
 * because the day the allowlist gains a device these screens have to change by themselves.
 *
 * And nothing here acts. There is no Enable, no Pair, no Assign and no Start: §5.4 says a class cannot
 * be enabled at a site until the DPIA covers it, and that is a gate, not a delay. */

const facts = () => {
 const dpiaWords = portalContract.devices.dpiaWords as Record<string, string>;
 return { real: vitals.deviceAllowlist.real.length, dpia: dpiaWords[vitals.darkForRealDevices.dpiA] ?? vitals.darkForRealDevices.dpiA };
};

export function DevicesCategory() {
 const { place } = usePortal();
 return <Frame>{place.tab === 'provisioning' ? <Provisioning/> : place.tab === 'allowlist' ? <Allowlist/> : <Fleet/>}</Frame>;
}

function Fleet() {
 const words = portalContract.devices;
 const f = facts();
 return <>
  <Empty heading={portalRefusal('no-device-class-enabled')}>{fill(words.fleetEmpty, f)}</Empty>
  <Region title="Needs attention">
   <Empty>{words.attentionEmpty}</Empty>
  </Region>
  <Region title="Cohorts">
   <Empty>{fill(words.cohortEmpty, f)}</Empty>
   <p className="helper">{words.bulkRefusal}</p>
  </Region>
  <Region title={words.indicatorsHeading} count={indicators.indicators.length}>
   <RovingList label={`${indicators.indicators.length} indicators a fleet view would watch`} rows={indicators.indicators.map(i => ({
    key: i.id,
    content: <><strong>{i.label}</strong><BuildWord id={i.builtToday ? 'built' : 'proposed'}/><span>{i.thresholdBehaviour}</span></>
   }))}/>
  </Region>
  <p className="helper">{words.synthetic}</p>
  <p className="helper">{indicators.preview}</p>
 </>;
}

function Provisioning() {
 const words = portalContract.devices;
 const f = facts();
 const detail = (readsFrom: string) => {
  if (readsFrom === 'transports') return <ol className="pt-bullets">{pairing.transports.map(t => <li key={t.id}><strong>{t.label}</strong> — {t.possessionProofSentence}</li>)}</ol>;
  if (readsFrom === 'pairingRefusals') return <ul className="pt-bullets">{pairing.refusals.map(r => <li key={r.id}>{r.statement}</li>)}</ul>;
  if (readsFrom === 'tiers') return <ul className="pt-bullets">{pairing.deviceTiers.map(t => <li key={t.id}><strong>{t.label}</strong> — {t.why}</li>)}</ul>;
  return <p>{trust.builtToday.sentence}</p>;
 };
 return <>
  <Empty heading={words.startRefusal}>{fill(words.provisioningEmpty, f)}</Empty>
  <Region title="The four steps" count={words.steps.length}>
   <ol className="pt-steps" aria-label="Discover, pair, assign and verify">
    {words.steps.map((step, i) => <li key={step.id} className="pt-step">
     <span className="pt-step-n" aria-hidden="true">{i + 1}</span>
     <div><h3>{step.label}</h3><p>{step.sentence}</p>{detail(step.readsFrom)}</div>
    </li>)}
   </ol>
  </Region>
  <p className="helper">{pairing.builtToday.sentence}</p>
  <p className="helper">{trust.consumerDisclosure.sentence} {trust.hardRule.statement}</p>
 </>;
}

function Allowlist() {
 const words = portalContract.devices;
 const f = facts();
 return <>
  <Empty heading={words.gate}>{fill(words.allowlistEmpty, f)}</Empty>
  <Region title="Allowlisted real devices" count={vitals.deviceAllowlist.real.length}>
   <Empty>{vitals.deviceAllowlist.why}</Empty>
  </Region>
  <Region title="Device classes the registry knows" count={devices.deviceClasses.length}>
   <RovingList label={`${devices.deviceClasses.length} device classes`} rows={devices.deviceClasses.map(c => ({
    key: c.id,
    content: <><strong>{c.label}</strong><span>{c.carriesClinicalWeight ? 'May carry clinical weight.' : 'Never carries clinical weight.'} {c.why}</span></>
   }))}/>
  </Region>
  <Region title="What adding a class requires" count={words.addingAClassRequires.length}>
   <ol className="pt-bullets">{words.addingAClassRequires.map(r => <li key={r}>{r}</li>)}</ol>
   <p className="helper">{words.enableRefusal}</p>
  </Region>
  <Region title="Thresholds" count={thresholds.thresholds.length}>
   <Empty>{words.thresholdsEmpty}</Empty>
   <p className="helper">{thresholds.preview}</p>
  </Region>
 </>;
}
