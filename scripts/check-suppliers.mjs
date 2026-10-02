/* The OEM and supplier register — 2 October 2026. The founder handed over a sourcing catalogue an AI had
   prepared from Alibaba listings and asked to "have this on the OEM/Supplier so that we know who these are
   from". The register is packages/catalog/suppliers.json, read by Catalogue · Suppliers & OEMs in the Control
   Tower. This holds it to what it is allowed to be, and is a module of its own so each check can be proven to
   fire by handing it a broken file through `read` (scripts/prove-suppliers.mjs does exactly that).
   scripts/check-boundaries.mjs calls it with the same `read` and `files` it uses everywhere else.

   WHAT IS HELD.
   1. Every record is complete. A supplier says who it is, where the catalogue puts it, its years, badges and
      rating as stated and on which day, and whether it makes or trades — a Verified Manufacturer badge and
      nothing else makes it a manufacturer. Two names that differ only in capitals are refused unless each
      names the other and says why they are kept apart. The fifty offers are numbered as the catalogue
      numbers them, each with its price, minimum order, claimed certifications and a product ID of digits.
   2. Every offer has its South African fit, its scope and its verification. The fit is worked out by the
      lib's own functions and never typed; every requirement says where it comes from; a radio word nobody
      recognised fails rather than bringing nothing; a shop candidate's class is the listing's class. Every
      record is unverified, and an attempt is recorded only as one of the contract's attempts.
   3. Every shop product the register maps to exists in packages/catalog/shop.json, so a renamed id fails
      here loudly. Supplements are never put forward for the shop.
   4. No supplier's name, short name or brand appears in any file that draws the shop, and nothing the
      patient's app or either phone reaches imports the register.
   5. A flagged claim is never product copy: not in an offer's specification, not in any file that draws
      the shop, and on the screen only inside the claim's own quotation.
   6. The screen reaches nothing: no request, no window, no storage, no form and no button; its links open
      in a new tab without opener or referrer and go only to the addresses the contract holds; it says the
      notice in the contract's words and draws the POPIA flag; it arrives on a dynamic import of its own.
   7. The journey, the map row and the founder's summary, whose prices and minimum orders are the
      contract's. */

const REGISTER = "packages/catalog/suppliers.json";
const SHOP = "packages/catalog/shop.json";
const SCREEN = "apps/web/src/features/portal/Suppliers.tsx";
const LIB = "apps/web/src/lib/suppliers.ts";
const BACK_OFFICE = "apps/web/src/features/portal/BackOffice.tsx";
const PORTAL = "packages/catalog/control-tower-portal.json";
const JOURNEY = "tests/suppliers.spec.ts";
const MAP = "docs/FEATURE-MAP.md";
const SUMMARY = "docs/procurement/SUPPLIERS.md";
/* The files that draw the shop on three platforms, besides any web file that imports the shop's contract. */
const SHOP_SURFACES = [
  "packages/catalog/shop.json",
  "apps/web/src/features/Shop.tsx",
  "apps/web/src/features/WelcomeDevice.tsx",
  "apps/web/src/features/MarketOrder.tsx",
  "apps/web/src/lib/shop-catalogue.ts",
  "apps/ios/MyThuso/Features/ShopView.swift",
  "apps/ios/MyThuso/Models/ShopData.swift",
  "apps/android/app/src/main/java/za/co/mythuso/ui/ShopScreens.kt",
  "apps/android/app/src/main/java/za/co/mythuso/model/ShopData.kt"
];
/* Words a catalogue uses beside a radio that bring no requirement of their own: satellite receivers, wires,
   and the catalogue's phrasing. A word in neither list fails, so a new radio cannot slip through unnamed. */
const NOT_RADIOS = new Set(["GPS", "Ethernet", "PoE", "USB", "module", "ready", "app", "cloud", "sync", "dual-band"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function checkSuppliers({ read, files, exists }) {
  const fail = (why) => { throw new Error(`Suppliers & OEMs: ${why}`); };
  const c = JSON.parse(read(REGISTER));
  const shop = JSON.parse(read(SHOP));
  const { needsOf, fitOf, radiosOf, linkOf, popiaFlagged } = await import("../apps/web/src/lib/suppliers.ts");
  const strip = (source) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const text = (s) => typeof s === "string" && s.trim().length > 0;
  const ids = (list) => new Set(list.map((x) => x.id));
  const offers = c.suppliers.flatMap((s) => s.offers);

  /* ---- 1. Complete records -------------------------------------------------------------------------- */
  if (c.decided?.by !== "Founder" || !DAY.test(c.decided?.on ?? "") || !text(c.decided?.words))
    fail(`${REGISTER} has lost who asked for it, when, and in what words.`);
  for (const [k, words] of [["AI", /\bAI\b/], ["not verified", /none has been verified/], ["nothing ordered", /Nothing has been ordered/], ["no contact", /no supplier has been contacted/]])
    if (!words.test(c.notice?.sentence ?? "")) fail(`${REGISTER}#notice.sentence no longer says ${k}. The page's notice says the catalogue is AI-prepared, the facts unverified, nothing ordered and no supplier contacted.`);
  if (!/AI-prepared/.test(c.source?.preparedBy ?? "") || c.source?.platform !== "Alibaba.com" || !DAY.test(c.source?.suppliedOn ?? ""))
    fail(`${REGISTER}#source no longer says the catalogue was AI-prepared, from Alibaba.com, on a day.`);
  if (c.source.statedItems !== offers.length)
    fail(`The catalogue states ${c.source.statedItems} items and the register holds ${offers.length} offers. Every item is recorded, or the register says why one is not.`);
  const numbers = offers.map((o) => o.number).sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1)) fail(`The offers are not numbered 1 to ${offers.length} as the catalogue numbers them, each once.`);
  const supplierIds = ids(c.suppliers);
  if (supplierIds.size !== c.suppliers.length) fail("Two suppliers share an id.");
  const fold = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const s of c.suppliers) {
    for (const f of ["legalName", "shortName", "typeWhy", "statedIn"]) if (!text(s[f])) fail(`Supplier ${s.id} has no ${f}.`);
    if (!text(s.place?.from) || s.place?.country !== "China") fail(`Supplier ${s.id} does not say where the catalogue puts it, or on what the place rests.`);
    if (s.platform !== "Alibaba.com" || !Number.isInteger(s.yearsOnPlatform) || s.yearsOnPlatform < 1 || !Array.isArray(s.badges) || !s.badges.length || !DAY.test(s.statedOn))
      fail(`Supplier ${s.id} has lost its platform, years, badges or the day they were stated.`);
    if (s.rating !== null && (typeof s.rating?.score !== "number" || s.rating.score < 0 || s.rating.score > 5 || !Number.isInteger(s.rating.reviews)))
      fail(`Supplier ${s.id}'s rating is not a score out of five with a count of reviews, as stated.`);
    const manufacturer = s.badges.includes("Verified Manufacturer");
    if ((s.type === "manufacturer") !== manufacturer || !["manufacturer", "trading-firm", "not-stated"].includes(s.type))
      fail(`Supplier ${s.id} is recorded as "${s.type}" and ${manufacturer ? "carries" : "does not carry"} the Verified Manufacturer badge. Only that badge makes a supplier a manufacturer here, and only as stated.`);
    if (/trading/i.test(s.legalName) && s.type !== "trading-firm") fail(`Supplier ${s.id}'s legal name says it trades and the register does not.`);
    if (!s.offers?.length) fail(`Supplier ${s.id} has no offer. A supplier is recorded because of something it offered.`);
    for (const t of c.suppliers) {
      if (t === s || fold(t.legalName) !== fold(s.legalName)) continue;
      if (s.distinctFrom?.supplier !== t.id || t.distinctFrom?.supplier !== s.id || !text(s.distinctFrom?.why))
        fail(`"${s.legalName}" and "${t.legalName}" are one name but for capitals and punctuation. Either they are one supplier, recorded once, or each names the other in distinctFrom and says why they are kept apart.`);
    }
    if (s.distinctFrom && !supplierIds.has(s.distinctFrom.supplier)) fail(`Supplier ${s.id} is kept apart from ${s.distinctFrom.supplier}, which is not in the register.`);
  }
  if (new Set(c.suppliers.map((s) => s.legalName)).size !== c.suppliers.length) fail("A legal name appears twice. A supplier with three offers is one record with three offers.");

  /* ---- 2. Fit, scope and verification on every offer ------------------------------------------------ */
  const categoryIds = ids(c.categories), scopeIds = ids(c.scopes), severities = ids(c.claimSeverities);
  const uploadIds = ids(c.uploads), attemptIds = ids(c.verification.attempts), outcomeIds = ids(c.verification.outcomes);
  const requirementIds = ids(c.requirements), levelIds = ids(c.saFitLevels);
  const classes = new Set(shop.regulatory?.classes?.map((k) => k.id) ?? []);
  if (c.deviceClassesFrom !== "packages/catalog/shop.json#regulatory.classes" || classes.size < 3)
    fail(`${REGISTER} no longer reads its SAHPRA classes from the shop's contract, or the shop's contract has none to read.`);
  for (const r of c.requirements) {
    for (const f of ["label", "authority", "instrument", "what", "missing", "confidence"]) if (!text(r[f])) fail(`Requirement ${r.id} has no ${f}.`);
    if (!/^https:\/\//.test(r.source ?? "")) fail(`Requirement ${r.id} cites no https source. A requirement says where it comes from.`);
    if (r.inPlace !== false && !text(r.evidence)) fail(`Requirement ${r.id} is marked in place with no evidence. MyThuso holds none of these today.`);
  }
  const fromRadios = new Set(c.radios.flatMap((r) => r.needs));
  for (const r of c.requirements)
    if ((r.appliesWhen === "radio") !== fromRadios.has(r.id)) fail(`Requirement ${r.id} applies when "${r.appliesWhen}" and ${fromRadios.has(r.id) ? "a radio brings it" : "no radio brings it"}. A radio's requirements are named by the radio and nowhere else.`);
  for (const id of fromRadios) if (!requirementIds.has(id)) fail(`A radio brings the requirement "${id}", which ${REGISTER} does not define.`);
  const used = new Set();
  for (const o of offers) {
    const at = `Offer #${o.number}`;
    for (const f of ["title", "specs", "productId"]) if (!text(o[f])) fail(`${at} has no ${f}.`);
    if (!categoryIds.has(o.category)) fail(`${at}'s category "${o.category}" is not one of the register's.`);
    const supplement = o.category === "supplements";
    if ((o.kind === "supplement") !== supplement) fail(`${at} is a ${o.kind} in the ${o.category} category.`);
    if (!(o.priceUsd?.low > 0) || !(o.priceUsd.high >= o.priceUsd.low) || !text(o.priceUsd.per)) fail(`${at}'s price is not a range in dollars per something, as stated.`);
    if (!(o.moq?.quantity > 0) || !text(o.moq.unit)) fail(`${at} has no minimum order as stated.`);
    if (!Array.isArray(o.certificationsClaimed)) fail(`${at} does not record the certifications it claims, even as none.`);
    if (!/^\d{8,16}$/.test(o.productId)) fail(`${at}'s product ID "${o.productId}" is not a run of digits; a link is built from nothing else.`);
    const fit = o.saFit;
    if (!fit || !Array.isArray(fit.claims) || !Array.isArray(fit.alsoNeeds)) fail(`${at} has no South African fit.`);
    for (const k of ["fit", "level", "needs", "missing"]) if (k in fit) fail(`${at} types its own ${k}. The fit and the checklist are worked out from the register's rules, never written on an offer.`);
    if (supplement) {
      if (fit.sahpraClass !== null || fit.uploads !== null || !text(o.dosageForm) || !text(o.targetFunction) || !text(o.oemOdm))
        fail(`${at} is a supplement with a device's class or upload, or without its form, function and own-label terms.`);
    } else {
      if (!classes.has(fit.sahpraClass) || !text(fit.classWhy)) fail(`${at}'s SAHPRA class "${fit.sahpraClass}" is not one the shop's contract defines, or says nothing about why.`);
      if (!uploadIds.has(fit.uploads) || !text(fit.uploadsStated)) fail(`${at} does not say where its data goes, in the register's words and the catalogue's.`);
      if (!Array.isArray(o.wireless)) fail(`${at} records no radios, even as none.`);
      const matched = new Set(c.radios.flatMap((r) => r.matches));
      for (const word of o.wireless.flatMap((w) => w.split(/[\s/]+/)))
        if (!matched.has(word) && !NOT_RADIOS.has(word) && !/^[\d.]+$/.test(word))
          fail(`${at} lists "${word}" among its radios, which neither a radio in ${REGISTER} nor the words that bring nothing recognise. A radio nobody named would bring no ICASA approval.`);
      if (o.wireless.some((w) => /\b(GSM|LTE|4G|5G|BT|Wi-Fi|LoRa|NFC)\b/.test(w)) && !radiosOf(c, o).length)
        fail(`${at} has a radio and the register's matches find none.`);
    }
    for (const claim of fit.claims)
      if (!text(claim.claim) || !severities.has(claim.severity) || !text(claim.why)) fail(`${at} flags a claim without the words, a severity from the register, or the reason.`);
    for (const id of fit.alsoNeeds) {
      const r = c.requirements.find((x) => x.id === id);
      if (!r || r.appliesWhen !== "named") fail(`${at} names "${id}" in alsoNeeds, which is not a requirement an offer names for itself.`);
    }
    const needs = needsOf(c, o);
    for (const r of needs) used.add(r.id);
    if (!needs.length) fail(`${at} would need nothing to be sold in South Africa. Every device and supplement here needs something.`);
    if (popiaFlagged(c, o) && !needs.some((r) => r.id === "popia-transfer")) fail(`${at} sends readings to its supplier's cloud and its checklist has no POPIA transfer.`);
    if (!levelIds.has(fitOf(c, o))) fail(`${at}'s fit works out to a level the register does not define.`);
    /* Scope. */
    const sc = o.scope;
    if (!scopeIds.has(sc?.id)) fail(`${at} has no scope from the register's four.`);
    if (supplement !== (sc.id === "supplements-not-stocked")) fail(`${at} is ${supplement ? "a supplement scoped as" : "a device scoped as"} "${sc.id}". The twenty supplements are not stocked, and the founder decides.`);
    if (sc.id === "shop") {
      const product = shop.products.find((p) => p.id === sc.shopProduct);
      if (!product) fail(`${at} could supply the shop's "${sc.shopProduct}", which ${SHOP} does not list. A shop id that moved is a mapping to fix, not a candidate to keep.`);
      if (!text(sc.mismatch)) fail(`${at} is a shop candidate and does not say how it differs from the listing.`);
      if (product.sahpra !== undefined && product.sahpra !== fit.sahpraClass)
        fail(`${at} is read as SAHPRA "${fit.sahpraClass}" and would supply "${product.id}", which the shop lists as "${product.sahpra}". A candidate is read in the listing's class, or it is not a candidate for that listing.`);
    } else if (sc.id === "nurse-kit") { if (!text(sc.use)) fail(`${at} is for the nurse's kit and does not say what for.`); }
    else if (!text(sc.why)) fail(`${at} is ${sc.id} and does not say why.`);
    /* Verification. */
    const v = o.verification;
    if (v?.verdict !== "unverified" || v.status !== c.verification.status) fail(`${at} is not recorded as unverified in the register's words. ${c.refusals.find((r) => r.id === "nothing-verified-by-reading").statement}`);
    if (!Array.isArray(v.checks) || (v.checkedOn === null) !== (v.checks.length === 0) || (v.checkedOn !== null && !DAY.test(v.checkedOn)))
      fail(`${at}'s verification has checks without a day, or a day without checks.`);
    for (const ch of v.checks) if (!attemptIds.has(ch.attempt) || !outcomeIds.has(ch.outcome)) fail(`${at} records a check that is not one of the register's attempts or outcomes.`);
  }
  for (const s of c.suppliers) {
    const v = s.verification;
    if (v?.verdict !== "unverified" || v.status !== c.verification.status) fail(`Supplier ${s.id} is not recorded as unverified in the register's words.`);
    for (const ch of v.checks) if (!attemptIds.has(ch.attempt) || !outcomeIds.has(ch.outcome) || !/^https:\/\//.test(ch.source ?? "")) fail(`Supplier ${s.id} records a check with no https source, or not one of the register's attempts.`);
  }
  for (const r of c.requirements) if (!used.has(r.id)) fail(`Requirement ${r.id} applies to no offer. A requirement nobody needs is a sentence nobody reads.`);
  if (!/^https:\/\/www\.alibaba\.com\/product-detail\/_\{productId\}\.html$/.test(c.source.urlPattern)) fail(`${REGISTER}#source.urlPattern is not Alibaba's public product address with the ID as its only part.`);
  for (const o of offers) if (linkOf(c, o) !== c.source.urlPattern.replace("{productId}", o.productId)) fail(`Offer #${o.number}'s link is not the pattern's.`);

  /* ---- 3 and 4. The shop: ids exist, and no supplier is named there -------------------------------- */
  const webShop = files("apps/web/src").filter((f) => /\.(tsx?|css)$/.test(f) && f !== LIB && /shop\.json|shop-catalogue/.test(read(f)));
  const surfaces = [...new Set([...SHOP_SURFACES, ...webShop])];
  for (const f of SHOP_SURFACES) if (!exists(f)) fail(`${f} is listed as drawing the shop and does not exist. The list moves with the shop.`);
  const names = c.suppliers.flatMap((s) => [s.legalName, s.shortName]).concat(offers.flatMap((o) => o.brands ?? []));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const f of surfaces) {
    const body = read(f);
    for (const name of names)
      if (new RegExp(`(?<![A-Za-z0-9])${escape(name)}(?![A-Za-z0-9])`, "i").test(body))
        fail(`${f} names "${name}", from the supplier register. ${c.refusals.find((r) => r.id === "register-is-back-office").statement} The shop is unbranded on purpose.`);
  }
  const reachers = [...files("apps/web/src"), ...files("apps/ios/MyThuso"), ...files("apps/android/app/src/main")]
    .filter((f) => /\.(tsx?|swift|kt)$/.test(f) && f !== LIB && f !== SCREEN && /suppliers\.json|lib\/suppliers'|SuppliersData/.test(read(f)));
  if (reachers.length) fail(`${reachers.join(", ")} reach${reachers.length === 1 ? "es" : ""} the supplier register. It is read by the Control Tower's screen alone, through its lib.`);

  /* ---- 5. A flagged claim is never product copy ---------------------------------------------------- */
  const claims = offers.flatMap((o) => o.saFit.claims.map((cl) => cl.claim));
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9%+]+/g, " ").trim();
  for (const o of offers)
    for (const claim of claims)
      if (norm(o.specs).includes(norm(claim))) fail(`Offer #${o.number}'s specification carries the flagged claim "${claim}". A flagged claim is set beside the specification with its reason, never inside it.`);
  for (const f of surfaces) {
    const body = norm(read(f));
    for (const claim of claims) if (body.includes(norm(claim))) fail(`${f} carries "${claim}", a claim the supplier register flags. ${c.refusals.find((r) => r.id === "flagged-claims-never-copy").statement}`);
  }
  const screen = strip(read(SCREEN));
  const drawn = screen.match(/\{claim\.claim\}/g) ?? [];
  if (drawn.length !== 1 || !/<q className="sp-claim">\{claim\.claim\}<\/q>/.test(screen))
    fail(`${SCREEN} draws a flagged claim ${drawn.length} times, or outside its own quotation. A claim is shown once, quoted, beside its severity and reason.`);

  /* ---- 6. The screen reaches nothing and says what it is ------------------------------------------- */
  for (const f of [SCREEN, LIB]) {
    const code = strip(read(f));
    const reach = code.match(/\bfetch\(|XMLHttpRequest|sendBeacon|window\.open\(|new WebSocket|EventSource|location\.(?:assign|href|replace)|localStorage|sessionStorage|indexedDB/);
    if (reach) fail(`${f} reaches out or keeps something (${reach[0]}). ${c.refusals.find((r) => r.id === "no-contact").statement}`);
  }
  if (/<form\b|<button\b|<Button\b|\bonClick=|\bonSubmit=/.test(screen)) fail(`${SCREEN} draws a form or a button. The register's only controls are its three filters; nothing on it sends, saves or orders.`);
  const handlers = screen.match(/\bon[A-Z]\w*=/g) ?? [];
  if (handlers.length !== 1 || !/onChange=\{set\(key\)\}/.test(screen)) fail(`${SCREEN} carries ${handlers.length} handlers. It has one, the filters' change, and another is a control nobody decided on.`);
  const anchors = screen.match(/<a\b[^>]*>/g) ?? [];
  if (!anchors.length) fail(`${SCREEN} draws no link to a listing.`);
  for (const a of anchors) {
    if (!/target="_blank"/.test(a) || !/rel="noopener noreferrer"/.test(a) || !/referrerPolicy="no-referrer"/.test(a))
      fail(`${SCREEN} draws a link without target="_blank", rel="noopener noreferrer" and no referrer: ${a.slice(0, 80)}`);
    const href = a.match(/href=\{([^}]+)\}/)?.[1];
    if (!["linkOf(contract, offer)", "r.source", "c.source"].includes(href))
      fail(`${SCREEN} links to ${href ?? "a typed address"}. A listing's address is linkOf()'s, and the only other links are the sources the contract cites.`);
  }
  if (!/linkOf\(contract, offer\)/.test(screen)) fail(`${SCREEN} no longer links each offer to its listing through linkOf().`);
  for (const needle of ["contract.notice.sentence", "contract.notice.linkSentence", "contract.popia.flagSentence", "contract.popia.acceptableOnlyIf", "popiaFlagged(contract, offer)", "missingOf(contract, offer)", "fitOf(contract, offer)"])
    if (!screen.includes(needle)) fail(`${SCREEN} no longer draws ${needle}.`);
  const backOffice = read(BACK_OFFICE);
  if (!/lazy\(\(\) => import\('\.\/Suppliers'\)/.test(backOffice) || /^\s*import (?!type\b)[^;]*from '\.\/Suppliers'/m.test(backOffice))
    fail(`${BACK_OFFICE} does not reach Catalogue's Suppliers & OEMs on a dynamic import of its own.`);
  const portal = JSON.parse(read(PORTAL));
  if (!portal.categories.find((k) => k.id === "catalogue")?.tabs.some((t) => t.id === "suppliers" && t.label === "Suppliers & OEMs"))
    fail(`${PORTAL} has no Suppliers & OEMs tab under Catalogue.`);

  /* ---- 7. The journey, the map row and the founder's summary --------------------------------------- */
  const journey = exists(JOURNEY) ? read(JOURNEY) : "";
  if (!/role=control-tower/.test(journey) || !/suppliers\.json/.test(journey)) fail(`${JOURNEY} is missing, or no longer opens the screen as the Control Tower and reads the register.`);
  if (!/suppliers\.json/.test(read(MAP))) fail(`${MAP} has no row for the supplier register.`);
  if (!exists(SUMMARY)) fail(`${SUMMARY} is missing.`);
  const summary = read(SUMMARY);
  const money = (n) => n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  let rows = 0;
  for (const line of summary.split("\n")) {
    const m = line.match(/^\|\s*#(\d+)\s*\|/);
    if (!m) continue;
    rows++;
    const o = offers.find((x) => x.number === Number(m[1]));
    if (!o) fail(`${SUMMARY} lists #${m[1]}, which the register does not have.`);
    const price = o.priceUsd.low === o.priceUsd.high ? `US$${money(o.priceUsd.low)}` : `US$${money(o.priceUsd.low)}–${money(o.priceUsd.high)}`;
    const moq = `${o.moq.quantity.toLocaleString("en-GB")} ${o.moq.unit}`;
    if (!line.includes(price) || !line.includes(moq))
      fail(`${SUMMARY}'s row for #${o.number} does not carry "${price}" and "${moq}" as the register states them. The summary is read from the register, never retyped.`);
    if (!line.includes(c.suppliers.find((s) => s.offers.includes(o)).legalName)) fail(`${SUMMARY}'s row for #${o.number} does not name its supplier as the register does.`);
  }
  if (rows < 5) fail(`${SUMMARY} has ${rows} rows naming an offer; its shortlist names every candidate.`);

  const byScope = Object.fromEntries(c.scopes.map((s) => [s.id, offers.filter((o) => o.scope.id === s.id).length]));
  const byFit = Object.fromEntries(c.saFitLevels.map((l) => [l.id, offers.filter((o) => fitOf(c, o) === l.id).length]));
  const cloud = offers.filter((o) => popiaFlagged(c, o)).length;
  return `Suppliers & OEMs · ${c.suppliers.length} suppliers and ${offers.length} offers from the founder's AI-prepared catalogue, every one unverified and saying so; ${byScope.shop} shop candidates, ${byScope["nurse-kit"]} for the nurse's kit, ${byScope["out-of-scope"]} out of scope and ${byScope["supplements-not-stocked"]} supplements not stocked; fit worked out, never typed (${byFit.paperwork} paperwork first, ${byFit.conditions} conditional, ${byFit["not-as-offered"]} not as offered); ${cloud} sending readings to a supplier's cloud and flagged under POPIA; every mapped shop id exists, no supplier named on ${surfaces.length} shop files, no flagged claim in a specification or on the shop; the screen reaches nothing and arrives on its own dynamic import.`;
}
