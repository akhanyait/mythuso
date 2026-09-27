import { Suspense, lazy, type ComponentType } from 'react';
import { G1Mark } from '../../components/G1Mark';
import { portalContract, portalRefusal } from '../../lib/portal';
import { usePortal } from './context';
import { Frame } from './Frame';
import { BuildWord, Loading } from './Parts';

/* GilbertOne API Administration (docs/PROMPT-CONTROL-TOWER-UI.md §7, Phase 4): the category, its mark,
 * and its seven sub-screens as tabs — the engine's overview, Speech settings (the Voice screen folded into
 * it on 28 September 2026), Model Providers, Intelligence, Knowledge, the engine's compliance and API
 * Registry, in packages/catalog/control-tower-portal.json's order.
 *
 * Each sub-screen is a dynamic import of its own inside this category's own dynamic import, so opening
 * GilbertOne fetches the tab asked for and nothing else, and a patient fetches none of it. This file
 * imports nothing the Phase 3 placeholder did not, on purpose: the patient's first load carries the
 * list of files every dynamic import it can reach needs, and a new static import here puts whatever it
 * shares with other screens on that list.
 *
 * What the whole category will not do is said once, above every sub-screen, in the contract's words:
 * it administers nothing but what the founder decided. The assistant is live in production; every action
 * below is drawn disabled beside the gate that holds it, live on the founder's dated record, or enabled
 * only inside the founder's signed-in session, and scripts/check-boundaries.mjs fails the build if one is
 * drawn any other way. */

const lazySub = <T extends Record<string, ComponentType>>(load: () => Promise<T>, name: keyof T) =>
 lazy(() => load().then(m => ({ default: m[name] as ComponentType })));
const subScreens: Record<string, ComponentType> = {
 overview: lazySub(() => import('./gilbertone/EngineOverview'), 'EngineOverview'),
 speech: lazySub(() => import('./gilbertone/SpeechSettings'), 'SpeechSettingsScreen'),
 'model-providers': lazySub(() => import('./gilbertone/ModelProviders'), 'ModelProvidersScreen'),
 intelligence: lazySub(() => import('./gilbertone/Intelligence'), 'IntelligenceScreen'),
 knowledge: lazySub(() => import('./gilbertone/Knowledge'), 'KnowledgeScreen'),
 compliance: lazySub(() => import('./gilbertone/Compliance'), 'ComplianceScreen'),
 'api-registry': lazySub(() => import('./gilbertone/ApiRegistry'), 'ApiRegistryScreen')
};

export function GilbertOneCategory() {
 const { place } = usePortal();
 const g1 = portalContract.gilbertone;
 const Screen = subScreens[place.tab];
 if (!Screen) throw new Error(`GilbertOne API Administration has no sub-screen "${place.tab}".`);
 /* The category's state is the head's status line (Frame, PageHead) rather than a card of its own above
    every sub-screen, so the seven screens start with their own work the way every other settings page does. */
 return <Frame status={<div className="pt-g1-state">
   <G1Mark className="pt-g1-large" title="GilbertOne"/>
   <div><BuildWord id={g1.status}/><p>{g1.sentence}</p><p className="helper">{portalRefusal('no-gilbertone-action-while-its-gate-is-open')}</p></div>
  </div>}>
  <Suspense key={place.tab} fallback={<Loading/>}><Screen/></Suspense>
 </Frame>;
}
