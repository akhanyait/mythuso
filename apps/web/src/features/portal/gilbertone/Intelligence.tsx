import levels from '../../../../../../packages/catalog/intelligence-levels.json' with { type: 'json' };
import { g1 } from '../../../lib/gilbertone-admin';
import { Empty, Region, RovingList } from '../Parts';
import { GatedAction, Locked } from './Controls';

/* GilbertOne · Intelligence (§7.5): the five reasoning levels and which conversation may reach which,
 * from packages/catalog/intelligence-levels.json.
 *
 * Read-only, because the selector is gated: there is no tenant to set a level or a ceiling for and no
 * clinician session to test the clinical-assist lock against (G31). So the levels, the defaults and the
 * ceilings are drawn as what the contract holds, the one control is disabled beside its gate, and the
 * plan's invariants are drawn in the contract's words where a reader can see them. No number here is
 * typed: every level, default and ceiling is the contract's, and the estimators say that no price and
 * no latency has been recorded rather than showing the wireframe's figures. */

const levelName = (id: number) => {
 const found = levels.levels.find(l => l.id === id);
 if (!found) throw new Error(`packages/catalog/intelligence-levels.json has no level ${id}.`);
 return `Level ${found.id} — ${found.name}`;
};

export function IntelligenceScreen() {
 const words = g1.intelligence;
 return <>
  <Locked title={levelName(levels.levels[0]!.id)}>{levels.lockedToLevel0.sentence}</Locked>

  <Region title={words.levelsHeading} count={levels.levels.length}>
   <RovingList label={`${levels.levels.length} levels`} rows={levels.levels.map(l => ({
    key: String(l.id),
    content: <><strong>{levelName(l.id)}</strong>
     <span className="g1-tag">{!l.modelCall ? words.noModel : l.requiresClinician ? `${words.clinicianRequired}${l.requiresRecordedPurpose ? ` ${words.purposeRequired}` : ''}` : l.clinicalBoundary}</span>
     <span>{l.changes} {l.clinicalBoundary}</span></>
   }))}/>
  </Region>

  <Region title={words.typesHeading} count={levels.conversationTypes.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{levels._conversationTypesWhy}</caption>
    <thead><tr><th scope="col">Conversation</th><th scope="col">Default</th><th scope="col">Ceiling</th><th scope="col">{words.ceilingWithClinicianLabel}</th><th scope="col">Why</th></tr></thead>
    <tbody>{levels.conversationTypes.map(t => {
     const withClinician = 'ceilingWithClinician' in t ? t.ceilingWithClinician : undefined;
     return <tr key={t.id}>
      <th scope="row">{t.label}</th>
      <td>{levelName(t.defaultLevel)}</td>
      <td>{levelName(t.ceiling)}</td>
      <td>{withClinician !== undefined ? levelName(withClinician) : '—'}</td>
      <td>{t.why}</td>
     </tr>;
    })}</tbody>
   </table></div>
   <GatedAction id="set-level"/>
  </Region>

  <Region title="The ceiling and the clinician lock">
   <Locked title={`Platform maximum: ${levelName(levels.platformMaximum)}`}>{levels.hardCeiling.sentence}</Locked>
   <Locked title="The clinician lock">{levels.clinicianLock.sentence}</Locked>
  </Region>

  <Region title="Cost and latency">
   <Empty heading={levels.refusals.find(r => r.id === 'no-estimate-without-a-recorded-price')!.statement}>{levels.estimators.cost.today} {levels.estimators.latency.today}</Empty>
  </Region>

  <Region title="Recorded per turn">
   <Empty>{levels.auditPerTurn.today}</Empty>
  </Region>

  <Region title="The invariants" count={levels.refusals.length}>
   <ul className="pt-refusals">{levels.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}
