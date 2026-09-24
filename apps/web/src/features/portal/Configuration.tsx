import { useState } from 'react';
import capabilities from '../../../../../packages/catalog/capabilities.json' with { type: 'json' };
import { Configuration as Settings } from '../Configuration';
import { adminTabBlurb } from '../Admin';
import { fill, portalContract } from '../../lib/portal';
import { roles } from '../../lib/roles';
import { usePortal } from './context';
import { Frame } from './Frame';
import { Empty, Region, RovingList, Status, Tree } from './Parts';

/* Configuration as the tenant-admin home (§6.2): a tree of sites, wards, beds, staff, roles, branding
 * and integrations, each with its own screen and its own written empty state, and the settings screen
 * that was the whole of the old Configuration tab as the tree's first node — so nothing that was on
 * that tab moved away from it.
 *
 * Six of the eight nodes are empty, and each says why in packages/catalog/control-tower-portal.json's
 * words: there is no site registry, so there are no wards or beds; there is no tenant, so there is no
 * staff directory, no per-tenant brand and no admin role. What each can show without inventing
 * anything, it shows — the vetting register's parties under Staff, the six preview roles under Roles,
 * every capability's state under Integrations — read from where they live. */

type Node = (typeof portalContract.configuration.tree)[number] & { body?: string; emptyState?: string };
const nodes = portalContract.configuration.tree as readonly Node[];

export function ConfigurationCategory() {
 const { settingsEngine, setSettingsEngine } = usePortal();
 const [selected, setSelected] = useState(nodes[0]!.id);
 const node = nodes.find(n => n.id === selected) ?? nodes[0]!;
 return <Frame blurb={adminTabBlurb.Configuration}>
  <div className="pt-config">
   <Tree label="Configuration" nodes={nodes} selected={node.id} onSelect={setSelected} panelId="pt-config-node"/>
   <section className="pt-config-node" id="pt-config-node" aria-labelledby="pt-config-heading">
    <h2 id="pt-config-heading">{node.label}</h2>
    {node.body === 'settings' ? <Settings engine={settingsEngine} onEngine={setSettingsEngine}/> : <NodeBody node={node}/>}
   </section>
  </div>
 </Frame>;
}

function NodeBody({ node }: { node: Node }) {
 const { vetting, go } = usePortal();
 const empty = node.emptyState ?? '';
 if (node.id === 'staff') return <>
  <Empty>{empty}</Empty>
  <p className="helper">{vetting.subjects.length} parties are on the vetting register.</p>
  <button type="button" className="secondary" onClick={() => go('vetting')}>Open Vetting</button>
 </>;
 if (node.id === 'roles') return <>
  <Empty>{empty}</Empty>
  <Region title="Preview roles" count={roles.length}>
   <RovingList label={`${roles.length} preview roles`} rows={roles.map(r => ({ key: r.id, content: <><strong>{r.label}</strong><span>{r.opensTo}</span></> }))}/>
  </Region>
 </>;
 if (node.id === 'integrations') {
  const all = capabilities.capabilities;
  const connected = all.filter(c => c.connected).length;
  return <>
   <Empty>{fill(empty, { connected, total: all.length })}</Empty>
   <Region title="Capabilities" count={all.length}>
    <RovingList label={`${all.length} capabilities`} rows={all.map(c => ({
     key: c.id, content: <><strong>{c.name}</strong><Status id={c.connected ? 'connected' : 'not-configured'}/></>
    }))}/>
   </Region>
  </>;
 }
 return <Empty>{empty}</Empty>;
}
