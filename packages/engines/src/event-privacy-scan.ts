/* The privacy scan: reads engine source the way the bus reads a payload.
 *
 * packages/catalog/events.json declares, in neverInEnvelope, the names a field may never carry: an
 * identity number, a name, a phone, a reading, a diagnosis, a Trust Score under any of its words. The bus
 * refuses a payload field carrying one of them when a handler publishes (./runtime/bus.ts), and
 * scripts/check-boundaries.mjs holds every declared event's payload to the same list. Neither can see the
 * third place the rule can break: the engine code that builds an emission by hand — a payload object
 * written into a domain file, or a publish() call with the fields typed out beside it. A field named
 * reading or value added there reaches the bus and is refused at runtime, which is a fault nobody sees
 * until the route is called.
 *
 * So this module reads the two static shapes an emission takes — an object literal naming a type and
 * version (or a key) with a payload of its own, and a call passing a literal event key with a payload
 * object beside it — and answers the two questions the bus would answer at publish time: does the event
 * exist and is it live, and is every field the payload names one the event declares. Together with the
 * never list, those are the bus's refusals, read before anything runs.
 *
 * ── What it will not do ──────────────────────────────────────────────────────────────────────────────
 *
 * It does not guess, and it does not read prose. A payload assembled through a variable — { ...held },
 * payload: assembled, a key concatenated from a type and a version — cannot be read statically, so it is
 * passed over and left to the bus, which refuses it at runtime if it is wrong; a site with an unreadable
 * payload is still checked for the event it names. Comments and string bodies are tokenized away before
 * anything is matched, because a domain file discussing a name ("the code that was entered, right or
 * wrong") is not an event carrying it. The first draft of this check searched raw text and refused a
 * comment; the tokenizer exists so that mistake cannot be made twice.
 *
 * It is used from two places and must agree with both: scripts/emit-event-privacy-tests.mjs runs it over
 * the engines as it generates, and the generated suite runs it over the same sources on every test run.
 */
import { namedLike, type ContractEvent, type NeverEntry } from './runtime/contract.ts';

export type ScanToken = { kind: 'name' | 'string' | 'number' | 'punct' | 'template' | 'regex'; value: string; line: number; index: number };
/* One emission this scan can read: where it is, the event it names, and the fields its payload names.
   fields is what the scan could read; unreadable is true when part of the payload was built through a
   variable, and a site with fields: [] and unreadable: false simply has an empty payload. */
export type ScanSite = { line: number; key: string; fields: string[]; unreadable: boolean };

/* Tokens, not text: comments dropped, strings and template literals reduced to single tokens, so nothing
   inside prose can be mistaken for code. */
function tokenize(source: string): ScanToken[] {
 const tokens: ScanToken[] = [];
 const n = source.length;
 let i = 0;
 let line = 1;
 const push = (token: Omit<ScanToken, 'index'>) => {
  tokens.push({ ...token, index: tokens.length });
 };
 /* A quoted string, consumed whole; its body is kept, because an event key and a property name are
    string bodies and the scan reads them. */
 const skipQuoted = (): string => {
  const quote = source[i]!;
  i += 1;
  let value = '';
  while (i < n && source[i] !== quote) {
   if (source[i] === '\\') { value += source[i + 1]; i += 2; continue; }
   if (source[i] === '\n') line += 1;
   value += source[i];
   i += 1;
  }
  i += 1;
  return value;
 };
 /* A regex literal, consumed whole and thrown away: /'\\''/g holds a quote and /[{}()]/ holds brackets,
    and either would tear the token stream apart if it were read as code. */
 const skipRegex = () => {
  i += 1;
  let inClass = false;
  while (i < n) {
   const ch = source[i]!;
   if (ch === '\\') { i += 2; continue; }
   if (ch === '\n') { line += 1; i += 1; continue; }
   if (ch === '[') inClass = true;
   else if (ch === ']') inClass = false;
   else if (ch === '/' && !inClass) { i += 1; break; }
   i += 1;
  }
  while (i < n && /[a-z]/i.test(source[i]!)) i += 1;
 };
 const skipLineComment = () => {
  while (i < n && source[i] !== '\n') i += 1;
 };
 const skipBlockComment = () => {
  i += 2;
  while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') line += 1; i += 1; }
  i += 2;
 };
 /* A template literal is one token: what is inside it is a string, except the expressions in ${ },
    which are code — code that can hold strings, regexes and templates of its own, as Care's sql helper
    does with `'${value.replace(/'/g, "''")}'`. So the expressions are walked with the same rules
    rather than skipped over, and the token ends where the template does. */
 const skipTemplate = () => {
  i += 1;
  while (i < n) {
   const ch = source[i]!;
   if (ch === '\\') { i += 2; continue; }
   if (ch === '\n') { line += 1; i += 1; continue; }
   if (ch === '`') { i += 1; return; }
   if (ch === '$' && source[i + 1] === '{') { i += 2; skipExpression(); continue; }
   i += 1;
  }
 };
 const skipExpression = () => {
  let depth = 1;
  while (i < n && depth > 0) {
   const ch = source[i]!;
   if (ch === '\n') { line += 1; i += 1; continue; }
   if (ch === '\\') { i += 2; continue; }
   if (ch === "'" || ch === '"') { skipQuoted(); continue; }
   if (ch === '`') { skipTemplate(); continue; }
   if (ch === '{') { depth += 1; i += 1; continue; }
   if (ch === '}') { depth -= 1; i += 1; continue; }
   if (ch === '/' && source[i + 1] === '/') { skipLineComment(); continue; }
   if (ch === '/' && source[i + 1] === '*') { skipBlockComment(); continue; }
   if (ch === '/') {
    /* Inside an expression the scanner reads the character before the slash rather than the token
       before it — the one place it settles for less than the token stream. A pattern opens after an
       opening bracket, an operator, or nothing at all; after a name or a closing bracket, it divides. */
    let j = i - 1;
    while (j >= 0 && /\s/.test(source[j]!)) j -= 1;
    const before = j >= 0 ? source[j]! : '';
    if (before === '' || '(,=:[!&|?;+-*%<>~^{'.includes(before)) { skipRegex(); continue; }
    i += 1;
    continue;
   }
   i += 1;
  }
 };
 while (i < n) {
  const c = source[i]!;
  if (c === '\n') { line += 1; i += 1; continue; }
  if (c === ' ' || c === '\t' || c === '\r') { i += 1; continue; }
  if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i += 1; continue; }
  if (c === '/' && source[i + 1] === '*') {
   i += 2;
   while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') line += 1; i += 1; }
   i += 2;
   continue;
  }
  if (c === '/') {
   /* A regex literal is code the tokenizer must swallow whole: /'\''/g holds a quote, and /[{}()]/
      holds brackets. Whether a slash opens one is the usual reading — after a name, number, string or a
      closing bracket it divides; after anything else, including a keyword like return or case, it opens
      a pattern. Consuming it whole keeps its quotes and brackets from tearing the token stream apart. */
   const previous = tokens[tokens.length - 1];
   const keyword = previous && previous.kind === 'name' && ['return', 'typeof', 'case', 'delete', 'void', 'new', 'in', 'of', 'instanceof', 'do', 'else', 'yield', 'await', 'throw'].includes(previous.value);
   const opens = !previous ? true
    : previous.kind === 'punct' ? ![')', ']', '}'].includes(previous.value)
    : previous.kind === 'name' ? !!keyword
    : false;
   if (opens) {
    const at = line;
    skipRegex();
    push({ kind: 'regex', value: '', line: at });
    continue;
   }
  }
  if (c === "'" || c === '"') {
   const at = line;
   const value = skipQuoted();
   push({ kind: 'string', value, line: at });
   continue;
  }
  if (c === '`') {
   const at = line;
   skipTemplate();
   push({ kind: 'template', value: '', line: at });
   continue;
  }
  if (c >= '0' && c <= '9') {
   let j = i;
   while (j < n && /[0-9_]/.test(source[j]!)) j += 1;
   push({ kind: 'number', value: source.slice(i, j), line });
   i = j;
   continue;
  }
  if (/[A-Za-z_$]/.test(c)) {
   let j = i;
   while (j < n && /[A-Za-z0-9_$]/.test(source[j]!)) j += 1;
   push({ kind: 'name', value: source.slice(i, j), line });
   i = j;
   continue;
  }
  if (c === '.' && source[i + 1] === '.' && source[i + 2] === '.') {
   push({ kind: 'punct', value: '...', line });
   i += 3;
   continue;
  }
  push({ kind: 'punct', value: c, line });
  i += 1;
 }
 return tokens;
}

/* Every emission in one file's source. */
export function scanEmissions(source: string): ScanSite[] {
 const tokens = tokenize(source);
 const matching = new Map<number, number>();
 const stack: number[] = [];
 for (let i = 0; i < tokens.length; i += 1) {
  const t = tokens[i]!;
  if (t.kind !== 'punct') continue;
  if (t.value === '(' || t.value === '[' || t.value === '{') stack.push(i);
  else if (t.value === ')' || t.value === ']' || t.value === '}') {
   const open = stack.pop();
   const closes: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
   if (open !== undefined && tokens[open]!.value && t.value === closes[tokens[open]!.value]) matching.set(open, i);
  }
 }
 /* The members of a group — a call's arguments, an object's entries — split on the commas and semicolons
    that sit at the group's own depth rather than inside a nested one. */
 type Member = { tokens: ScanToken[]; separator: string | null };
 const members = (open: number, close: number): Member[] => {
  const out: Member[] = [];
  let current: ScanToken[] = [];
  let depth = 0;
  for (let i = open + 1; i < close; i += 1) {
   const t = tokens[i]!;
   if (t.kind === 'punct' && (t.value === '(' || t.value === '[' || t.value === '{')) depth += 1;
   else if (t.kind === 'punct' && (t.value === ')' || t.value === ']' || t.value === '}')) depth -= 1;
   else if (t.kind === 'punct' && depth === 0 && (t.value === ',' || t.value === ';')) { out.push({ tokens: current, separator: t.value }); current = []; continue; }
   current.push(t);
  }
  if (current.length) out.push({ tokens: current, separator: null });
  return out;
 };
 /* The fields a payload object literal names: properties, shorthand properties, and the fields of every
    branch of a conditional spread. A spread of anything else is not readable statically and is recorded
    as such rather than guessed at. */
 const keysOf = (open: number): { fields: string[]; gaps: string[] } => {
  const fields: string[] = [];
  const gaps: string[] = [];
  for (const member of members(open, matching.get(open)!)) {
   const ts = member.tokens;
   if (ts.length === 0) continue;
   if (ts[0]!.kind === 'punct' && ts[0]!.value === '...') {
    let found = false;
    for (const t of ts) {
     const closing = matching.get(t.index);
     if (t.kind === 'punct' && t.value === '{' && closing !== undefined && closing <= ts[ts.length - 1]!.index) { fields.push(...keysOf(t.index).fields); found = true; }
    }
    if (!found) gaps.push('a spread this scan cannot read');
    continue;
   }
   if ((ts[0]!.kind === 'name' || ts[0]!.kind === 'string') && ts[1]?.kind === 'punct' && ts[1]!.value === ':') { fields.push(ts[0]!.value); continue; }
   if (ts[0]!.kind === 'string' || ts[0]!.kind === 'name') { fields.push(ts[0]!.value); continue; }
   if (ts[0]!.kind === 'punct' && ts[0]!.value === '[') { gaps.push('a computed key'); continue; }
   gaps.push('a member this scan cannot read');
  }
  return { fields, gaps };
 };
 /* One object literal: an event, or not an event. It is one when it names a type beside a version, or a
    key, and carries a payload; a type written down — readonly members, optional markers, semicolons
    between members — is a shape somebody declared, not an emission, and the runtime's own event unions
    take exactly that form. */
 const named = (open: number): ScanSite | null => {
  const close = matching.get(open)!;
  const properties = new Map<string, ScanToken[] | null>();
  let typeLevel = false;
  for (const member of members(open, close)) {
   const ts = member.tokens;
   if (ts.length === 0) continue;
   if (member.separator === ';') typeLevel = true;
   if (ts[0]!.kind === 'name' && ts[0]!.value === 'readonly') { typeLevel = true; continue; }
   if (ts[0]!.kind === 'punct' && ts[0]!.value === '...') continue;
   if ((ts[0]!.kind === 'name' || ts[0]!.kind === 'string') && ts[1]?.kind === 'punct' && ts[1]!.value === '?') { typeLevel = true; continue; }
   if ((ts[0]!.kind === 'name' || ts[0]!.kind === 'string') && ts[1]?.kind === 'punct' && ts[1]!.value === ':') { properties.set(ts[0]!.value, ts.slice(2)); continue; }
   if (ts[0]!.kind === 'name' && ts.length === 1) { properties.set(ts[0]!.value, null); continue; }
   return null;
  }
  if (typeLevel) return null;
  if (!properties.has('payload')) return null;
  const typeTokens = properties.get('type');
  const versionTokens = properties.get('version');
  const keyTokens = properties.get('key');
  const type = typeTokens && typeTokens.length === 1 && typeTokens[0]!.kind === 'string' && /^[a-z_]+(\.[a-z_]+)+$/.test(typeTokens[0]!.value) ? typeTokens[0]!.value : null;
  const version = versionTokens && versionTokens.length === 1 && versionTokens[0]!.kind === 'number' ? versionTokens[0]!.value : null;
  const key = keyTokens && keyTokens.length === 1 && keyTokens[0]!.kind === 'string' && /^[a-z_]+(\.[a-z_]+)+@[0-9]+$/.test(keyTokens[0]!.value) ? keyTokens[0]!.value : null;
  const eventKey = type && version ? `${type}@${version}` : key;
  if (!eventKey) return null;
  const at = (typeTokens?.[0] ?? keyTokens?.[0] ?? tokens[open]!).line;
  const payloadTokens = properties.get('payload');
  const shorthand = payloadTokens === null || payloadTokens === undefined || payloadTokens.length === 0;
  if (shorthand) return { line: at, key: eventKey, fields: [], unreadable: true };
  let payloadOpen: number | null = null;
  for (const t of payloadTokens) {
   if (t.kind === 'punct' && t.value === '{') { payloadOpen = t.index; break; }
  }
  if (payloadOpen === null || matching.get(payloadOpen) !== payloadTokens[payloadTokens.length - 1]!.index) return { line: at, key: eventKey, fields: [], unreadable: true };
  const payload = keysOf(payloadOpen);
  return { line: at, key: eventKey, fields: payload.fields, unreadable: payload.gaps.length > 0 };
 };
 const sites: ScanSite[] = [];
 const isEventKey = (t: ScanToken | undefined): boolean => !!t && t.kind === 'string' && /^[a-z_]+(\.[a-z_]+)+@[0-9]+$/.test(t.value);
 /* Every call: an argument that is one literal event key, and an object literal after it. That is how
    every publish in the engines is written — ctx.publish('x@1', { ... }), publishFor(engine, 'x@1',
    { ... }), Core's publish(ctx, loop, 'x@1', { ... }), Money's emit('x@1', { ... }, subjectRef). */
 for (const [open, close] of matching) {
  if (tokens[open]!.value !== '(') continue;
  const args = members(open, close);
  for (let a = 0; a < args.length; a += 1) {
   const argument = args[a]!;
   if (argument.tokens.length !== 1 || !isEventKey(argument.tokens[0])) continue;
   for (let b = a + 1; b < args.length; b += 1) {
    const ts = args[b]!.tokens;
    if (ts.length >= 2 && ts[0]!.kind === 'punct' && ts[0]!.value === '{' && matching.get(ts[0]!.index) === ts[ts.length - 1]!.index) {
     const payload = keysOf(ts[0]!.index);
     sites.push({ line: argument.tokens[0]!.line, key: argument.tokens[0]!.value, fields: payload.fields, unreadable: payload.gaps.length > 0 });
     break;
    }
   }
  }
 }
 for (const [open] of matching) {
  if (tokens[open]!.value !== '{') continue;
  const site = named(open);
  if (site) sites.push(site);
 }
 sites.sort((a, b) => a.line - b.line || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.fields.join(' ') < b.fields.join(' ') ? -1 : 1));
 return sites;
}

/* The reading the bus itself gives a publish, done statically: the event must be declared and live, a
   payload field must be one the event declares — the bus's not-the-frozen-shape refusal — and no field
   may be a name the never list refuses, under its own words or an alias, at its own match. */
export function privacyFindings(sites: (ScanSite & { file: string })[], events: Map<string, ContractEvent>, neverOnBus: NeverEntry[]): string[] {
 const findings: string[] = [];
 const refused = (field: string) => {
  for (const entry of neverOnBus) {
   const hit = entry.names.find((name) => namedLike(field, name, entry.match));
   if (hit) return `the bus refuses it as "${hit}": ${entry.why}`;
  }
  return null;
 };
 for (const site of sites) {
  const where = `${site.file}:${site.line}`;
  const event = events.get(site.key);
  if (!event) { findings.push(`${where} emits ${site.key}, which no source file named in packages/catalog/events.json declares.`); continue; }
  if (event.withdrawn) { findings.push(`${where} emits ${site.key}, which was withdrawn on ${(event.withdrawn as { on: string }).on}: ${(event.withdrawn as { why: string }).why} Use ${(event.withdrawn as { supersededBy: string }).supersededBy}.`); continue; }
  const declared = new Set(event.payload.map((field) => field.field));
  for (const field of site.fields) {
   const refusedWhy = refused(field);
   if (!declared.has(field)) findings.push(refusedWhy
    ? `${where} emits ${site.key} with "${field}", which ${site.key} does not declare, and ${refusedWhy}`
    : `${where} emits ${site.key} with "${field}", which ${site.key} does not declare; at publish time the bus refuses the body as not the frozen shape.`);
   else if (refusedWhy) findings.push(`${where} emits ${site.key} with "${field}", and ${refusedWhy}`);
  }
 }
 return findings;
}

/* Every declared field of every live event in the catalog, held to the never list — the reading
   scripts/check-boundaries.mjs gives the same declarations at build time. */
export function declaredFindings(events: Map<string, ContractEvent>, neverOnBus: NeverEntry[]): string[] {
 const findings: string[] = [];
 for (const [key, event] of events) {
  if (event.withdrawn) continue;
  for (const field of event.payload) {
   for (const entry of neverOnBus) {
    const hit = entry.names.find((name) => namedLike(field.field, name, entry.match));
    if (hit) findings.push(`packages/catalog declares ${key} with "${field.field}", and the bus refuses it as "${hit}": ${entry.why}`);
   }
  }
 }
 return findings;
}
