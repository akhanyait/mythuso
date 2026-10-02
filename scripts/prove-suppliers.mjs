/* Proves each rule in scripts/check-suppliers.mjs fires, by handing the module a broken copy of one file
   through `read` and expecting the named refusal — then the unbroken tree, expecting none. Run with
   `node scripts/prove-suppliers.mjs`; it is not part of the build, because a proof that ran on every build
   would be the build proving itself. Nothing on disk is changed. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { checkSuppliers } from "./check-suppliers.mjs";

const readDisk = (f) => readFileSync(f, "utf8");
const files = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => { const p = `${dir}/${n}`; return statSync(p).isDirectory() ? files(p) : [p]; }) : []);
const run = (patch) => checkSuppliers({ read: (f) => (patch[f] !== undefined ? patch[f] : readDisk(f)), files, exists: (f) => (patch[f] === null ? false : existsSync(f)) });
const json = (f, edit) => { const d = JSON.parse(readDisk(f)); edit(d); return JSON.stringify(d); };
const text = (f, from, to) => { const s = readDisk(f); if (!s.includes(from)) throw new Error(`${f} does not contain ${from}`); return s.replace(from, to); };
const REG = "packages/catalog/suppliers.json";
const SHOP = "packages/catalog/shop.json";
const SCREEN = "apps/web/src/features/portal/Suppliers.tsx";
const DOC = "docs/procurement/SUPPLIERS.md";
const sup = (d, id) => d.suppliers.find((s) => s.id === id);
const offer = (d, n) => d.suppliers.flatMap((s) => s.offers).find((o) => o.number === n);
const req = (d, id) => d.requirements.find((r) => r.id === id);

const proofs = [
  ["a supplier with no legal name", { [REG]: json(REG, (d) => { sup(d, "viatom").legalName = ""; }) }, /has no legalName/],
  ["the two ZCS names no longer kept apart", { [REG]: json(REG, (d) => { delete sup(d, "zcs-8").distinctFrom; }) }, /one name but for capitals/],
  ["a manufacturer without the badge", { [REG]: json(REG, (d) => { sup(d, "megastek").type = "manufacturer"; }) }, /Only that badge makes a supplier a manufacturer/],
  ["the trading firm not recorded as one", { [REG]: json(REG, (d) => { sup(d, "shanwei").type = "not-stated"; }) }, /legal name says it trades/],
  ["a supplier recorded twice", { [REG]: json(REG, (d) => { d.suppliers.push({ ...sup(d, "eview"), id: "eview-2", offers: [] }); }) }, /has no offer|appears twice|one name but for capitals/],
  ["a rating out of ten", { [REG]: json(REG, (d) => { sup(d, "bioland").rating.score = 9; }) }, /not a score out of five/],
  ["an item the catalogue states and the register dropped", { [REG]: json(REG, (d) => { d.source.statedItems = 51; }) }, /states 51 items/],
  ["an offer renumbered", { [REG]: json(REG, (d) => { offer(d, 50).number = 51; }) }, /not numbered 1 to 50/],
  ["a product ID with a path in it", { [REG]: json(REG, (d) => { offer(d, 23).productId = "1600979355890/x"; }) }, /not a run of digits/],
  ["a fit typed on an offer", { [REG]: json(REG, (d) => { offer(d, 23).saFit.fit = "paperwork"; }) }, /types its own fit/],
  ["a radio nobody named", { [REG]: json(REG, (d) => { offer(d, 9).wireless.push("Zigbee"); }) }, /lists "Zigbee" among its radios/],
  ["a radio requirement named by an offer", { [REG]: json(REG, (d) => { offer(d, 9).saFit.alsoNeeds.push("icasa-type-approval"); }) }, /not a requirement an offer names for itself/],
  ["a radio's requirement no longer a radio's", { [REG]: json(REG, (d) => { req(d, "rica").appliesWhen = "named"; }) }, /A radio's requirements are named by the radio/],
  ["a requirement with no source", { [REG]: json(REG, (d) => { req(d, "nrcs-loa").source = "nrcs"; }) }, /cites no https source/],
  ["a requirement marked in place", { [REG]: json(REG, (d) => { req(d, "icasa-type-approval").inPlace = true; }) }, /marked in place with no evidence/],
  ["a requirement nobody needs", { [REG]: json(REG, (d) => { d.requirements.push({ ...req(d, "clinical-scope"), id: "unused" }); }) }, /Requirement unused applies to no offer/],
  ["a class the shop does not define", { [REG]: json(REG, (d) => { offer(d, 19).saFit.sahpraClass = "B2"; }) }, /not one the shop's contract defines/],
  ["a shop candidate in another class than its listing", { [REG]: json(REG, (d) => { offer(d, 23).saFit.sahpraClass = "C"; }) }, /read in the listing's class/],
  ["a mapped shop id the shop does not have", { [REG]: json(REG, (d) => { offer(d, 23).scope.shopProduct = "ring-oximeter"; }) }, /which packages\/catalog\/shop\.json does not list/],
  ["the shop renaming a mapped id", { [SHOP]: json(SHOP, (d) => { d.products.find((p) => p.id === "fall-pendant").id = "pendant"; }) }, /could supply the shop's "fall-pendant"/],
  ["a supplement put forward for the shop", { [REG]: json(REG, (d) => { offer(d, 40).scope = { id: "shop", shopProduct: "oximeter", mismatch: "x" }; }) }, /supplement scoped as/],
  ["a device scoped with no reason", { [REG]: json(REG, (d) => { offer(d, 25).scope.why = ""; }) }, /does not say why/],
  ["an offer marked verified", { [REG]: json(REG, (d) => { offer(d, 23).verification.verdict = "verified"; }) }, /not recorded as unverified/],
  ["a check with no day", { [REG]: json(REG, (d) => { offer(d, 23).verification.checkedOn = null; }) }, /checks without a day/],
  ["a supplier check with no source", { [REG]: json(REG, (d) => { sup(d, "viatom").verification.checks[0].source = ""; }) }, /records a check with no https source/],
  ["a cloud device without its POPIA transfer", { [REG]: json(REG, (d) => { d.requirements = d.requirements.filter((r) => r.id !== "popia-transfer"); }) }, /has no POPIA transfer/],
  ["the notice no longer saying an AI prepared it", { [REG]: json(REG, (d) => { d.notice.sentence = d.notice.sentence.replace("an AI prepared", "a consultant prepared"); }) }, /no longer says AI/],
  ["a link pattern to another host", { [REG]: json(REG, (d) => { d.source.urlPattern = "https://example.com/p/{productId}"; }) }, /not Alibaba's public product address/],
  ["a supplier named on the web shop", { "apps/web/src/features/Shop.tsx": readDisk("apps/web/src/features/Shop.tsx") + "\n// stocked from Viatom\n" }, /names "Viatom"/],
  ["a brand in the shop's contract", { [SHOP]: json(SHOP, (d) => { d.products.find((p) => p.id === "oximeter").does += " Like a Wellue."; }) }, /names "Wellue"/],
  ["a supplier named on the iPhone's shop", { "apps/ios/MyThuso/Features/ShopView.swift": readDisk("apps/ios/MyThuso/Features/ShopView.swift") + "\n// Bioland\n" }, /names "Bioland"/],
  ["a supplier named on the Android shop", { "apps/android/app/src/main/java/za/co/mythuso/ui/ShopScreens.kt": readDisk("apps/android/app/src/main/java/za/co/mythuso/ui/ShopScreens.kt") + "\n// Eview pendant\n" }, /names "Eview"/],
  ["the shop importing the register", { "apps/web/src/features/Shop.tsx": "import r from '../../../../packages/catalog/suppliers.json';\n" + readDisk("apps/web/src/features/Shop.tsx") }, /reaches the supplier register|names "/],
  ["a shop file the list names gone", { "apps/web/src/features/MarketOrder.tsx": null }, /listed as drawing the shop and does not exist/],
  ["a flagged claim in a specification", { [REG]: json(REG, (d) => { offer(d, 14).specs += " AI-assisted detection of AFib, bradycardia and PVCs."; }) }, /specification carries the flagged claim/],
  ["a flagged claim on the shop", { [SHOP]: json(SHOP, (d) => { d.products.find((p) => p.id === "fall-pendant").does += " Automatic fall detection."; }) }, /carries "Automatic fall detection"/],
  ["a claim drawn as copy on the screen", { [SCREEN]: text(SCREEN, "<dd>{offer.specs}</dd>", "<dd>{offer.specs} {claims.map(claim => <span>{claim.claim}</span>)}</dd>") }, /draws a flagged claim 2 times/],
  ["the screen fetching", { [SCREEN]: text(SCREEN, "export function SuppliersScreen() {", "export function SuppliersScreen() {\n void fetch('/x');") }, /reaches out or keeps something \(fetch\(\)/],
  ["the screen keeping a filter", { [SCREEN]: text(SCREEN, "export function SuppliersScreen() {", "export function SuppliersScreen() {\n sessionStorage.setItem('f', '1');") }, /reaches out or keeps something \(sessionStorage\)/],
  ["an enquiry button", { [SCREEN]: text(SCREEN, " </article>;\n}\n\nexport function SuppliersScreen", " <button type=\"button\">Inquire</button>\n </article>;\n}\n\nexport function SuppliersScreen") }, /draws a form or a button/],
  ["a second handler", { [SCREEN]: text(SCREEN, "<article className=\"pt-card sp-offer\" aria-labelledby={titleId}>", "<article className=\"pt-card sp-offer\" aria-labelledby={titleId} onMouseEnter={() => undefined}>") }, /carries 2 handlers/],
  ["a link that keeps its opener", { [SCREEN]: text(SCREEN, "href={linkOf(contract, offer)} target=\"_blank\" rel=\"noopener noreferrer\"", "href={linkOf(contract, offer)} target=\"_blank\" rel=\"noreferrer\"") }, /without target="_blank", rel="noopener noreferrer"/],
  ["a link to a typed address", { [SCREEN]: text(SCREEN, "href={linkOf(contract, offer)}", "href={`https://www.alibaba.com/product-detail/_${offer.productId}.html`}") }, /A listing.s address is linkOf\(\).s/],
  ["the POPIA flag no longer drawn", { [SCREEN]: text(SCREEN, "{contract.popia.flagSentence} {contract.popia.acceptableOnlyIf}", "{contract.popia.acceptableOnlyIf}") }, /no longer draws contract\.popia\.flagSentence/],
  ["the screen loaded statically", { "apps/web/src/features/portal/BackOffice.tsx": text("apps/web/src/features/portal/BackOffice.tsx", "const SuppliersScreen = lazy(() => import('./Suppliers').then(m => ({ default: m.SuppliersScreen })));", "import { SuppliersScreen } from './Suppliers';") }, /dynamic import of its own/],
  ["the tab gone from the portal", { "packages/catalog/control-tower-portal.json": json("packages/catalog/control-tower-portal.json", (d) => { const k = d.categories.find((x) => x.id === "catalogue"); k.tabs = k.tabs.filter((t) => t.id !== "suppliers"); }) }, /no Suppliers & OEMs tab/],
  ["the summary retyping a price", { [DOC]: text(DOC, "| US$55–99 |", "| US$45–99 |") }, /row for #23 does not carry "US\$55–99"/],
  ["the summary naming the wrong supplier", { [DOC]: text(DOC, "| #24 | Fall-detection pendant | Shenzhen Eview GPS Technology |", "| #24 | Fall-detection pendant | Megastek Technologies Electronics (ShenZhen) Co., Ltd. |") }, /row for #24 does not name its supplier/],
  ["the journey no longer the Control Tower's", { "tests/suppliers.spec.ts": readDisk("tests/suppliers.spec.ts").replaceAll("role=control-tower", "role=patient") }, /no longer opens the screen as the Control Tower/],
  ["the map row gone", { "docs/FEATURE-MAP.md": readDisk("docs/FEATURE-MAP.md").replaceAll("suppliers.json", "register") }, /has no row for the supplier register/]
];

let failed = 0;
for (const [name, patch, expected] of proofs) {
  try {
    await run(patch);
    console.log(`✗ ${name}: the check passed a broken tree`);
    failed++;
  } catch (error) {
    if (expected.test(error.message)) console.log(`✓ ${name}`);
    else { console.log(`✗ ${name}: refused for the wrong reason — ${error.message.slice(0, 220)}`); failed++; }
  }
}
try { console.log(`✓ the unbroken tree passes: ${(await run({})).slice(0, 90)}…`); } catch (error) { console.log(`✗ the unbroken tree fails: ${error.message}`); failed++; }
console.log(failed ? `${failed} of ${proofs.length + 1} proofs did not hold.` : `All ${proofs.length + 1} proofs hold.`);
process.exit(failed ? 1 : 0);
