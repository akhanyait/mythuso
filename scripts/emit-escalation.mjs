/* GilbertOne's escalation ruleset, written out for two native apps, by a machine.

   WHY IT EXISTS. On 1 October 2026 the web and the service began to answer what the escalation ruleset
   (packages/gilbertone/src/escalation.ts) finds — "my throat is swelling", "sudden weakness on one
   side", "I don’t want to live anymore", presentations no emergency term names — and the phones did not:
   they carried the terms and nothing else, so the same sentence raised the ambulance numbers in a
   browser and met "I can't assess that" on a phone. This generator closes that gap without a second
   copy anybody could edit.

   It imports escalation.ts itself (Node strips its types) and writes ESCALATION_RULES out — every rule's
   id, severity and action, and every pattern, in the order checkEscalation() tries them, because first
   match wins and the order is the triage order. Not the rules' approved sentences: a match on a phone is
   answered with the conversation's one emergency answer, as the web's panel answers it, and a sentence
   nothing shows is a copy of the crisis line's number (the self-harm rule names it) beside the one
   CrisisLinesData already carries — which the build refuses. escalation.ts is a locked Tier 1
   artefact whose code hash packages/catalog/gilbert-clinical-core.json pins; this file reads it and
   never writes to it, and a ratified change to it reaches the phones the next time this runs, or the
   build fails because the generated files are older than it or disagree with it.

   A pattern is written in JavaScript's dialect, and the phones read ICU's (NSRegularExpression) and
   Java's (kotlin.text.Regex). They agree on most of it and disagree on exactly the things a safety net
   must not leave to chance, so every pattern is translated into the part all three read the same way:
     - \w, \d and \s are JavaScript's: ASCII letters, digits and underscore; 0-9; and JavaScript's own
       list of spaces. ICU's \w is every alphabet's, Java's \s is six characters.
     - \b is written out as the ASCII boundary JavaScript means, because ICU's word boundary is
       Unicode's: "chokeé" is a choke to JavaScript and not to ICU.
     - An escaped slash is a slash; a dot outside a class is JavaScript's dot.
   Anything else — an anchor, a backreference, a lookbehind, a named group, a nested class, a flag other
   than i — stops the generator rather than being guessed at. Then the translation is proved: every
   translated pattern is run, in JavaScript, beside its original over every shared fixture, and the two
   must find the same thing or nothing is written. The phones prove the rest by replaying the same
   fixtures (fixtures.escalation in packages/catalog/assistant.json) against their own engines.

   One thing is not a pattern: JavaScript counts an emoji as two characters and ICU and Java count it as
   one, so a `[^.]{0,24}` window holds fewer emoji in a browser. The native matchers count the way
   JavaScript does, by reading each half of such a character as a placeholder; see Models/Escalation.swift.

   The fold the patterns read — matcher.normalisation's apostrophes, invisible characters and curly
   quotes in packages/catalog/assistant.json, the same three lists packages/gilbertone/src/fold.ts reads —
   and crisis-lines.json's showsWhen.escalationRules are written beside the rules, so the native port is
   one self-contained pair of files.

   Escaping: Swift needs its backslashes and quotes escaped; Kotlin needs backslash, quote and dollar,
   because a lone $ starts a template. Characters a reader cannot see are written as escapes. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESCALATION_RULES, checkEscalation } from '../packages/gilbertone/src/escalation.ts';

const SOURCE = 'packages/gilbertone/src/escalation.ts';
const ASSISTANT = 'packages/catalog/assistant.json';
const CRISIS = 'packages/catalog/crisis-lines.json';

/* The visible-or-not test: controls, the spaces and joiners, the soft hyphen, the byte-order mark. */
const unseen = /[\u0000-\u001f\u007f-\u00a0\u00ad\u1680\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]/;
const hex = c => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const literal = (value, escapeOf, dollar) => {
 let out = '';
 for (const c of String(value)) {
  if (c === '\\') out += '\\\\';
  else if (c === '"') out += '\\"';
  else if (c === '$' && dollar) out += '\\$';
  else if (c === '\n') out += '\\n';
  else if (c === '\t') out += '\\t';
  else if (unseen.test(c)) out += escapeOf(c);
  else out += c;
 }
 return `"${out}"`;
};
const swift = value => literal(value, c => `\\u{${hex(c)}}`, false);
const kotlin = value => literal(value, c => `\\u${hex(c)}`, true);
const swiftList = items => `[${items.map(swift).join(', ')}]`;
const kotlinList = items => (items.length ? `listOf(${items.map(kotlin).join(', ')})` : 'emptyList()');

/* JavaScript's \s, written out: what fold.ts collapses and what a pattern's \s reads. */
export const JS_SPACE = '\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF';
const WORD = 'A-Za-z0-9_';
const BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
const DOT = '[^\\n\\r\\u2028\\u2029]';

/* A JavaScript pattern (no u flag) into the dialect ICU and Java read identically. Throws on anything
   it does not know how to carry exactly. */
export function portable(source, where = 'a pattern') {
 const refuse = what => {
  throw new Error(`${where} uses ${what} (${source}). scripts/emit-escalation.mjs carries only the JavaScript syntax it can translate exactly; teach it this, with a fixture, before the phones read the pattern.`);
 };
 let out = '';
 let inClass = false;
 for (let i = 0; i < source.length; i++) {
  const c = source[i];
  if (c === '\\') {
   const e = source[++i];
   if (e === undefined) refuse('a trailing backslash');
   if (inClass) {
    if (e === 'd') out += '0-9';
    else if (e === 'w') out += WORD;
    else if (e === 's') out += JS_SPACE;
    else if (e === '/') out += '/';
    else if ('.-]\\^['.includes(e)) out += `\\${e}`;
    else refuse(`\\${e} inside a class`);
   } else {
    if (e === 'd') out += '[0-9]';
    else if (e === 'D') out += '[^0-9]';
    else if (e === 'w') out += `[${WORD}]`;
    else if (e === 'W') out += `[^${WORD}]`;
    else if (e === 's') out += `[${JS_SPACE}]`;
    else if (e === 'S') out += `[^${JS_SPACE}]`;
    else if (e === 'b') out += BOUNDARY;
    else if (e === '/') out += '/';
    else if ('.\\()[]{}?*+|^$-'.includes(e)) out += `\\${e}`;
    else refuse(`\\${e}`);
   }
   continue;
  }
  if (inClass) {
   if (c === ']') inClass = false;
   else if (c === '[') refuse('"[" inside a class, which Java and ICU read as a nested class');
   else if (c === '&' && source[i + 1] === '&') refuse('"&&" inside a class, which Java and ICU read as an intersection');
   out += c;
   continue;
  }
  if (c === '[') {
   inClass = true;
   out += c;
   if (source[i + 1] === '^') out += source[++i];
   if (source[i + 1] === ']') refuse('an empty or "]"-first class');
   continue;
  }
  if (c === '.') { out += DOT; continue; }
  if (c === '^' || c === '$') refuse('an anchor');
  if (c === ']' || c === '}') refuse(`a bare "${c}"`);
  if (c === '{') {
   const quantifier = /^\{\d+(?:,\d*)?\}/.exec(source.slice(i));
   if (!quantifier) refuse('a "{" that is not a quantifier');
   out += quantifier[0];
   i += quantifier[0].length - 1;
   continue;
  }
  if (c === '(' && source[i + 1] === '?' && !(source[i + 2] === ':' || source[i + 2] === '=' || source[i + 2] === '!'))
   refuse('a group other than (?: (?= or (?!');
  out += c;
 }
 if (inClass) refuse('an unclosed class');
 return out;
}

const read = (root, file) => JSON.parse(readFileSync(root + file, 'utf8'));

/* The fold fold.ts applies, restated here only to prove the translation over folded text; the phones
   get the lists, not this function. */
const foldWith = n => text => {
 let folded = text.normalize('NFKC');
 for (const mark of n.invisible) folded = folded.split(mark).join('');
 for (const mark of n.apostrophes) folded = folded.split(mark).join("'");
 for (const mark of n.quotes) folded = folded.split(mark).join('"');
 return folded.toLowerCase().replace(/\s+/g, ' ').trim();
};

export function emitEscalation(root = '') {
 const assistant = read(root, ASSISTANT);
 const crisis = read(root, CRISIS);
 const normalisation = assistant.matcher.normalisation;
 const fixtures = assistant.fixtures.escalation;
 if (!Array.isArray(fixtures) || !fixtures.length)
  throw new Error(`${ASSISTANT} has no fixtures.escalation. The phones' port of the escalation ruleset is held to that list on all three platforms; without it nothing proves the port reads what the web reads.`);

 const rules = ESCALATION_RULES.map(rule => ({
  id: rule.id,
  severity: rule.severity,
  action: rule.action,
  patterns: rule.patterns.map((pattern, index) => {
   if (pattern.flags !== 'i' && pattern.flags !== '')
    throw new Error(`${SOURCE}'s rule ${rule.id}, pattern ${index + 1}, carries the flags "${pattern.flags}". The phones' port carries only the case-insensitive flag; a global or sticky pattern is not safe to share, and a unicode one reads a different language.`);
   return { source: portable(pattern.source, `${SOURCE}'s rule ${rule.id}, pattern ${index + 1}`), ignoresCase: pattern.flags === 'i', original: pattern };
  }),
 }));

 for (const id of crisis.showsWhen.escalationRules)
  if (!rules.some(r => r.id === id && r.severity === 'emergency'))
   throw new Error(`${CRISIS} shows the crisis lines for the escalation rule "${id}", which ${SOURCE} does not carry as an emergency.`);

 /* The proof. Every translated pattern finds, in JavaScript, exactly what its original finds, over
    every shared fixture folded as the phones fold it, and the fixtures' own expectations hold. */
 const fold = foldWith(normalisation);
 const corpus = [
  ...fixtures.map(f => f.says),
  ...assistant.fixtures.messages.map(f => f.says),
  ...assistant.fixtures.stems.map(f => f.says),
 ];
 for (const rule of rules)
  for (const pattern of rule.patterns) {
   const translated = new RegExp(pattern.source, pattern.ignoresCase ? 'i' : '');
   for (const text of corpus) {
    const folded = fold(text);
    const was = pattern.original.exec(folded)?.[0] ?? null;
    const now = translated.exec(folded)?.[0] ?? null;
    if (was !== now)
     throw new Error(`The translation of ${rule.id}'s pattern ${pattern.original} reads ${JSON.stringify(text)} as ${JSON.stringify(now)}, and the original as ${JSON.stringify(was)}. Fix portable() in scripts/emit-escalation.mjs; the phones must read what the web reads.`);
   }
  }
 for (const fixture of fixtures) {
  const found = checkEscalation(fold(fixture.says))?.rule.id ?? null;
  if (found !== fixture.rule)
   throw new Error(`${ASSISTANT}'s escalation fixture ${JSON.stringify(fixture.says)} expects ${fixture.rule ?? 'no rule'}, and ${SOURCE} finds ${found ?? 'none'}. A fixture is what all three platforms are held to; it says what the ruleset does.`);
 }

 const banner = [
  `Generated by scripts/emit-escalation.mjs from ${SOURCE}, with the fold's characters from`,
  `${ASSISTANT} (matcher.normalisation) and the crisis rules from ${CRISIS}.`,
  'Do not edit by hand — run `npm run escalation`. The build fails if this file and its sources',
  'disagree, so an edit here is lost rather than merely wrong.',
  '',
  'Tier 1: escalation.ts is locked (packages/catalog/gilbert-clinical-core.json), and this is a',
  'translation of it, not a copy anybody may change. Rules are tried in this order and the first match',
  'wins. The patterns are written in the dialect ICU and Java read the same way as JavaScript; see the',
  'generator. Not reviewed by a clinician yet; required before real patients.',
 ].map(line => (line ? `// ${line}` : '//')).join('\n');

 const swiftFile = `${banner}

import Foundation

enum EscalationData {
    /// ESCALATION_RULES, in checkEscalation()'s order.
    static let rules: [EscalationRule] = [
${rules.map(r => `        EscalationRule(id: ${swift(r.id)}, severity: ${swift(r.severity)}, action: ${swift(r.action)}, patterns: [
${r.patterns.map(p => `            EscalationPattern(source: ${swift(p.source)}, ignoresCase: ${p.ignoresCase})`).join(',\n')}
        ])`).join(',\n')}
    ]
    /// crisis-lines.json's showsWhen.escalationRules: an emergency under one of these carries the crisis lines.
    static let crisisRules: [String] = ${swiftList(crisis.showsWhen.escalationRules)}

    /* fold.ts's characters, from matcher.normalisation. */
    static let apostrophes: [Unicode.Scalar] = ${swiftList(normalisation.apostrophes)}
    static let invisible: [Unicode.Scalar] = ${swiftList(normalisation.invisible)}
    static let quotes: [Unicode.Scalar] = ${swiftList(normalisation.quotes)}

    /// fixtures.escalation: what the ruleset finds in each sentence, on all three platforms.
    static let fixtures: [EscalationFixture] = [
${fixtures.map(f => `        EscalationFixture(says: ${swift(f.says)}, rule: ${f.rule === null ? 'nil' : swift(f.rule)})`).join(',\n')}
    ]
}
`;

 const kotlinFile = `${banner}

package za.co.mythuso.model

object EscalationData {
    /** ESCALATION_RULES, in checkEscalation()'s order. */
    val rules = listOf(
${rules.map(r => `        EscalationRule(${kotlin(r.id)}, ${kotlin(r.severity)}, ${kotlin(r.action)}, listOf(
${r.patterns.map(p => `            EscalationPattern(${kotlin(p.source)}, ${p.ignoresCase})`).join(',\n')}
        ))`).join(',\n')}
    )
    /** crisis-lines.json's showsWhen.escalationRules: an emergency under one of these carries the crisis lines. */
    val crisisRules = ${kotlinList(crisis.showsWhen.escalationRules)}

    /* fold.ts's characters, from matcher.normalisation. */
    val apostrophes = ${kotlinList(normalisation.apostrophes)}
    val invisible = ${kotlinList(normalisation.invisible)}
    val quotes = ${kotlinList(normalisation.quotes)}

    /** fixtures.escalation: what the ruleset finds in each sentence, on all three platforms. */
    val fixtures = listOf(
${fixtures.map(f => `        EscalationFixture(${kotlin(f.says)}, ${f.rule === null ? 'null' : kotlin(f.rule)})`).join(',\n')}
    )
}
`;

 return [
  { path: 'apps/ios/MyThuso/Models/EscalationData.swift', content: swiftFile },
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/EscalationData.kt', content: kotlinFile },
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 for (const file of emitEscalation()) {
  writeFileSync(file.path, file.content);
  console.log(`escalation → ${file.path}`);
 }
}
