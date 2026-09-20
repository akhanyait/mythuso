import { readFileSync } from 'node:fs';
const contract = JSON.parse(readFileSync(new URL('../packages/catalog/assistant-public.json', import.meta.url), 'utf8'));
const destinations = new Set(['/#how', '/#services', '/#plans', '/#nurses', '/#safety', '/status/']);
const ids = new Set(), aliases = new Set();
for (const question of contract.questions) {
 if (!destinations.has(question.href)) throw new Error('Public assistant must link only to approved MyThuso website sections.');
 if (ids.has(question.id)) throw new Error('Public assistant question ids must be unique.');
 ids.add(question.id);
 if (!question.answer || !question.aliases.length) throw new Error('Public assistant questions need approved answers and aliases.');
 for (const alias of question.aliases) {
  if (aliases.has(alias)) throw new Error('Public assistant aliases must have a single answer.');
  aliases.add(alias);
 }
}
for (const file of ['apps/web/src/features/PublicAssistant.tsx', 'apps/web/src/lib/public-assistant.ts']) {
 const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
 if (/\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/.test(source)) throw new Error('The public assistant must not transmit or persist a conversation.');
}
