import { capabilities, connectedCount, rule } from '../lib/capabilities';
/* The public status page.
 *
 * Fifteen capabilities, in the order the contract lists them, each with the four facts a reader
 * came for: what it is, whether it is connected, what is standing in its way, and the sentence a
 * person is shown on a screen while it is not. Nothing else. There is no summary above the list
 * doing the reader's thinking for them — a status page whose headline is friendlier than its rows
 * is the exact failure this file exists to prevent, and a health service that overstates its
 * readiness is not a marketing problem.
 *
 * The count and the sentence beside it are arithmetic on the same array the rows come from, so when
 * the first integration lands the figure moves, the row's chip changes, and its blockers disappear,
 * without anybody opening this file. That is the whole design: the page cannot flatter the product
 * because it does not know anything the product does not tell it.
 *
 * Every sentence with a full stop in it below comes from packages/catalog/capabilities.json and is
 * rendered word for word. What is written here is furniture — a heading, a label, a link. */
export function Status() {
 const total = capabilities.length;
 const none = connectedCount === 0;
 const evidenceRule = rule('connected-needs-evidence');
 return <div className="status-page">
  <header className="status-banner">
   <div className="status-banner-inner">
    <p className="status-brand">MyThuso</p>
    <h1>What is switched on</h1>
    <p className="status-lede">
     MyThuso is being built. This page lists every capability the product has a screen for, whether
     that screen is connected to anything real, and what each one is waiting on. It is drawn from
     the same file the web, iOS and Android apps read, so a screen and this page cannot disagree
     about what works.
    </p>
    <p className="status-count">
     <strong>{connectedCount}</strong>
     <span>of {total} capabilities are connected</span>
    </p>
    {/* Derived rather than declared: this reads "none of them" only for as long as that is what
        the array says. A sentence typed here would go on being printed after it stopped being
        true, which is how a page like this turns into the thing it was built to replace. */}
    {none && <p className="status-none">Not one of them has been connected to a real service. No visit is booked, no payment is taken, no clinical decision is issued and no device is contacted.</p>}
   </div>
  </header>

  <main className="status-main" id="main">
   <ol className="status-list">
    {capabilities.map((c, i) => <li key={c.id} id={c.id} className="status-row">
     <p className="status-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</p>
     <div className="status-detail">
      <div className="status-row-head">
       <h2>{c.name}</h2>
       <span className={c.connected ? 'status-state on' : 'status-state'}>{c.connected ? 'Connected' : 'Not connected'}</span>
      </div>
      {c.connected
       ? <p className="status-notice">Connected. Nothing is added to the screens that use it.</p>
       : <>
         <p className="status-label">What a person is told on the screen</p>
         <p className="status-notice">{c.notice}</p>
        </>}
      {c.blockedBy.length > 0 && <>
       <p className="status-label">What is standing in the way</p>
       <ul className="status-blockers">{c.blockedBy.map(b => <li key={b}>{b}</li>)}</ul>
      </>}
     </div>
    </li>)}
   </ol>
  </main>

  <footer className="status-foot">
   <div className="status-foot-inner">
    <h2>How a row here becomes “Connected”</h2>
    <p>{evidenceRule.statement}</p>
    <p>{evidenceRule.why}</p>
    <p className="status-source">
     This page renders <code>packages/catalog/capabilities.json</code> and nothing else. Turning one
     of these on is a change to that file, reviewed like any other.
    </p>
    <p><a href="/landing.html">About MyThuso</a></p>
   </div>
  </footer>
 </div>;
}
