/* ThusoIQ's engine API contracts, written out for the web app and both native apps by a machine.

   packages/catalog/apis.json lists the twelve engine files under packages/catalog/apis/. This reads
   every one of them and emits, for each live route, one constant carrying its method, path, version,
   engine, callers, purposes, idempotency and status, and one request and one response shape typed
   from the route's fields — into apps/web/src/lib/apis.generated.ts, Swift and Kotlin.

   WHAT IS DELIBERATELY NOT EMITTED. The refusal sentences and their reasoning. A screen that renders a
   refusal reads it from the answer the route gave, which is the contract's own sentence; a second copy
   compiled into a phone is the one nobody updates. Withdrawn routes are not emitted either: a route
   that may not be called should not be something an app can name.

   NAMES. A route's name is its method and its path's words — POST /v1/care/visits/{appointmentRef}/start
   is postCareVisitsByAppointmentRefStart — so two routes cannot share a name without sharing a method
   and a path, and the generator refuses the day they do. A Passport §26 path is named under its engine,
   and its mounted path is emitted beside it.

   OBJECT FIELDS. packages/catalog/feeds.json has no object type, so a field whose value is a JSON object
   keeps the nearest type and says "object": true. It is typed here as an object — never as the string
   its type column says — because a client that believes it will receive text is a client that breaks.

   `routeFingerprint` and `loadApis` are exported for scripts/check-boundaries.mjs and for whoever
   appends a line to packages/catalog/apis.lock. The fingerprint covers the method, path, version and
   every request and response field's name, type, requiredness and object flag — the shape a client is
   built against — and nothing else. Its arithmetic is never changed, because every line in apis.lock was
   written by it. What it leaves out — a route's refusals, its callers and the inside of its objects — is
   frozen by the three locks in scripts/api-locks.mjs instead. `npm run apis -- --seed-new` appends a line
   to every API lock for a route version that has none, and `npm run apis -- --record-narrowing` records a
   route whose callers were narrowed; neither ever rewrites a line.

   Escaping: Swift needs its quotes escaped; Kotlin needs backslash, quote and dollar, because a lone $
   starts a template. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = 'packages/catalog/apis.json';

const swift = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const kotlin = value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;

export function loadApis(root = '') {
 const contract = JSON.parse(readFileSync(root + SOURCE, 'utf8'));
 const engines = contract.engineFiles.map(file => ({ file, doc: JSON.parse(readFileSync(root + file, 'utf8')) }));
 const routes = engines.flatMap(({ file, doc }) => doc.routes.map(route => ({ ...route, engine: doc.engine, file })));
 return { contract, engines, routes };
}

export const routeKey = route => `${route.method} ${route.path}@${route.version}`;
const shape = fields => (fields ?? []).map(f => [f.field, f.type, f.required === true, f.object === true]);
export const routeFingerprint = route => createHash('sha256')
 .update(JSON.stringify({ method: route.method, path: route.path, version: route.version, request: shape(route.request), response: shape(route.response) }))
 .digest('hex').slice(0, 16);

const words = text => String(text).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w.toLowerCase());
const pascal = list => list.map(w => w[0].toUpperCase() + w.slice(1)).join('');

export function routeName(route) {
 const segments = route.path.split('/').filter(Boolean);
 const parts = route.path.startsWith('/v1/') ? segments.slice(1) : [route.engine, ...segments];
 const spelled = parts.flatMap(segment => {
  const param = segment.match(/^\{(.+)\}$/);
  return param ? ['by', ...words(param[1])] : words(segment);
 });
 return route.method.toLowerCase() + pascal(spelled) + (route.version > 1 ? `V${route.version}` : '');
}
export const mountedPath = (contract, route) => (contract.conventions.passportPaths.paths.includes(route.path) ? contract.conventions.passportPaths.mount + route.path : route.path);

const liveRoutes = root => {
 const { contract, routes } = loadApis(root);
 const live = routes.filter(route => !route.withdrawn);
 const seen = new Map();
 for (const route of live) {
  const name = routeName(route);
  if (seen.has(name)) throw new Error(`${routeKey(route)} and ${seen.get(name)} would share the generated name ${name}. Two routes are one name only if they are one route.`);
  seen.set(name, routeKey(route));
 }
 return { contract, live };
};

/* ---- TypeScript ---------------------------------------------------------------------------------- */
const identifier = name => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));
const tsType = f => {
 if (f.object) return f.type === 'list' ? 'ReadonlyArray<Readonly<Record<string, unknown>>>' : 'Readonly<Record<string, unknown>>';
 return { string: 'string', integer: 'number', number: 'number', boolean: 'boolean', instant: 'string', 'iso-date': 'string', coordinate: 'number', list: 'readonly string[]' }[f.type];
};
const tsShape = (name, fields) => (fields?.length
 ? `export interface ${name} {\n${fields.map(f => ` readonly ${identifier(f.field)}${f.required ? '' : '?'}: ${tsType(f)};`).join('\n')}\n}`
 : `export type ${name} = Record<string, never>;`);

/* ---- Swift ---------------------------------------------------------------------------------------- */
const SWIFT_RESERVED = new Set(['associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init', 'inout', 'internal', 'let', 'open', 'operator', 'private', 'protocol', 'public', 'rethrows', 'static', 'struct', 'subscript', 'typealias', 'var', 'break', 'case', 'continue', 'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return', 'switch', 'where', 'while', 'as', 'Any', 'catch', 'false', 'is', 'nil', 'super', 'self', 'Self', 'throw', 'throws', 'true', 'try', 'Type']);
const swiftName = name => (SWIFT_RESERVED.has(name) ? `\`${name}\`` : name);
const swiftType = f => {
 const base = f.object ? (f.type === 'list' ? '[[String: Any]]' : '[String: Any]')
  : { string: 'String', integer: 'Int', number: 'Double', boolean: 'Bool', instant: 'String', 'iso-date': 'String', coordinate: 'Double', list: '[String]' }[f.type];
 return f.required ? base : `${base}?`;
};
const swiftShape = (name, fields) => (fields?.length
 ? `    struct ${name} {\n${fields.map(f => `        let ${swiftName(f.field)}: ${swiftType(f)}`).join('\n')}\n    }`
 : `    struct ${name} {}`);

/* ---- Kotlin --------------------------------------------------------------------------------------- */
const KOTLIN_RESERVED = new Set(['as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while']);
const kotlinName = name => (KOTLIN_RESERVED.has(name) ? `\`${name}\`` : name);
const kotlinType = f => {
 const base = f.object ? (f.type === 'list' ? 'List<Map<String, Any?>>' : 'Map<String, Any?>')
  : { string: 'String', integer: 'Int', number: 'Double', boolean: 'Boolean', instant: 'String', 'iso-date': 'String', coordinate: 'Double', list: 'List<String>' }[f.type];
 return f.required ? base : `${base}? = null`;
};
const kotlinShape = (name, fields) => (fields?.length
 ? `    data class ${name}(\n${fields.map(f => `        val ${kotlinName(f.field)}: ${kotlinType(f)}`).join(',\n')}\n    )`
 : `    class ${name}`);
const upperSnake = name => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

export function emitApis(root = '') {
 const { contract, live } = liveRoutes(root);
 const banner = [
  `Generated by scripts/emit-apis.mjs from ${SOURCE} and the engine files it lists.`,
  'Do not edit by hand — run `npm run apis`. The build fails if this file and its sources disagree,',
  'so an edit here is lost rather than merely wrong.',
  '',
  'One constant per live route and a typed request and response for each. Nothing here calls a route:',
  'every engine but the identity service and the Passport P0 is a proposal, answered only by the',
  'development mock in packages/mock-api, on loopback, with synthetic data.'
 ];
 const tsBanner = banner.map(line => (line ? `// ${line}` : '//')).join('\n');

 const tsFile = `${tsBanner}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRoute {
 readonly name: string;
 readonly method: ApiMethod;
 readonly path: string;
 readonly mountedPath: string;
 readonly version: number;
 readonly engine: string;
 readonly callers: readonly string[];
 readonly purpose: readonly string[];
 readonly idempotent: boolean;
 readonly status: 'proposed' | 'built';
}

${live.map(route => {
 const type = pascal(words(routeName(route)));
 return `${tsShape(`${type}Request`, route.request)}\n${tsShape(`${type}Response`, route.response)}`;
}).join('\n\n')}

export const apiRoutes = {
${live.map(route => ` ${routeName(route)}: { name: ${JSON.stringify(routeName(route))}, method: ${JSON.stringify(route.method)}, path: ${JSON.stringify(route.path)}, mountedPath: ${JSON.stringify(mountedPath(contract, route))}, version: ${route.version}, engine: ${JSON.stringify(route.engine)}, callers: ${JSON.stringify(route.callers)}, purpose: ${JSON.stringify(route.purpose)}, idempotent: ${route.idempotent === true}, status: ${JSON.stringify(route.status)} }`).join(',\n')}
} as const satisfies Record<string, ApiRoute>;
`;

 const swiftFile = `${tsBanner}

import Foundation

enum ApisData {
    struct Route: Identifiable {
        let id: String
        let method: String
        let path: String
        let mountedPath: String
        let version: Int
        let engine: String
        let callers: [String]
        let purpose: [String]
        let idempotent: Bool
        let status: String
    }

${live.map(route => `    static let ${routeName(route)} = Route(id: ${swift(routeName(route))}, method: ${swift(route.method)}, path: ${swift(route.path)}, mountedPath: ${swift(mountedPath(contract, route))}, version: ${route.version}, engine: ${swift(route.engine)}, callers: [${route.callers.map(swift).join(', ')}], purpose: [${route.purpose.map(swift).join(', ')}], idempotent: ${route.idempotent === true}, status: ${swift(route.status)})`).join('\n')}

    static let routes: [Route] = [
${live.map(route => `        ${routeName(route)}`).join(',\n')}
    ]

${live.map(route => {
 const type = pascal(words(routeName(route)));
 return `${swiftShape(`${type}Request`, route.request)}\n${swiftShape(`${type}Response`, route.response)}`;
}).join('\n')}
}
`;

 const kotlinFile = `${tsBanner}

package za.co.mythuso.model

object ApisData {
    data class Route(
        val name: String,
        val method: String,
        val path: String,
        val mountedPath: String,
        val version: Int,
        val engine: String,
        val callers: List<String>,
        val purpose: List<String>,
        val idempotent: Boolean,
        val status: String
    )

${live.map(route => `    val ${upperSnake(routeName(route))} = Route(${kotlin(routeName(route))}, ${kotlin(route.method)}, ${kotlin(route.path)}, ${kotlin(mountedPath(contract, route))}, ${route.version}, ${kotlin(route.engine)}, listOf(${route.callers.map(kotlin).join(', ')}), listOf(${route.purpose.map(kotlin).join(', ')}), ${route.idempotent === true}, ${kotlin(route.status)})`).join('\n')}

    val routes = listOf(
${live.map(route => `        ${upperSnake(routeName(route))}`).join(',\n')}
    )

${live.map(route => {
 const type = pascal(words(routeName(route)));
 return `${kotlinShape(`${type}Request`, route.request)}\n${kotlinShape(`${type}Response`, route.response)}`;
}).join('\n')}
}
`;

 return [
  { path: 'apps/web/src/lib/apis.generated.ts', content: tsFile },
  { path: 'apps/ios/MyThuso/Models/ApisData.swift', content: swiftFile },
  { path: 'apps/android/app/src/main/java/za/co/mythuso/model/ApisData.kt', content: kotlinFile }
 ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const flags = process.argv.slice(2);
 if (flags.length > 1 || flags.some(flag => !['--seed-new', '--record-narrowing'].includes(flag))) {
  console.error(`npm run apis takes nothing, -- --seed-new or -- --record-narrowing, not ${flags.join(' ')}.`);
  process.exit(2);
 }
 /* Appending to the locks is a separate act from emitting the clients: it never regenerates a file, and
    emitting never appends a line, so running the generators cannot freeze anything by accident. */
 if (flags.length) import('./api-locks.mjs').then(locks => { process.exitCode = flags[0] === '--seed-new' ? locks.seedNew() : locks.recordNarrowing(); });
 else for (const file of emitApis()) {
  writeFileSync(file.path, file.content);
  console.log(`apis → ${file.path}`);
 }
}
