// The studio's behaviour. Text goes into the page as text, never as HTML; results are shown through
// <img> and <video>, which run nothing inside a file. Nothing is written to any browser storage.
const IDEAS = {
  drawing: ['How to wash your hands, in five steps', 'A nurse arriving at a home in a township', 'A healthy plate for someone with diabetes'],
  picture: ['A nurse and a grandmother laughing on a stoep in the Eastern Cape', 'A calm clinic waiting room in the morning sun'],
  video: ['Explain what happens on a MyThuso home visit', 'Why we drink water on a hot day, for children'],
};
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
let contract = null, chosen = 'drawing', polling = null;

function choose(id) {
  chosen = id;
  for (const b of $('kinds').children) b.setAttribute('aria-pressed', String(b.dataset.kind === id));
  const k = contract.kinds.find((x) => x.id === id);
  const [lo, hi] = k.typicalSeconds;
  $('meaning').textContent = `${k.meaning} Usually ${Math.round(lo / 60) || 1} to ${Math.round(hi / 60)} minutes.`;
  $('words').maxLength = k.maxPromptCharacters;
  $('chips').replaceChildren(...IDEAS[id].map((idea) => {
    const b = el('button', 'chip', idea); b.type = 'button';
    b.addEventListener('click', () => { $('words').value = idea; ready(); });
    return b;
  }));
}

function ready() { $('make').disabled = Boolean(polling) || !$('words').value.trim(); }

function show(node) { $('out').replaceChildren(node); }

function waiting(text) {
  const card = el('div', 'card'); const row = el('div', 'step');
  row.append(el('span', 'spinner'), el('span', null, text)); card.append(row); show(card);
}

function said(sentence, refused) {
  const card = el('div', refused ? 'card refused' : 'card'); card.append(el('p', null, sentence)); show(card);
}

function result(job) {
  const card = el('div', 'card result');
  if (job.mime === 'video/mp4') {
    const v = el('video'); v.src = job.file; v.controls = true; v.playsInline = true; v.preload = 'metadata'; card.append(v);
  } else {
    const img = el('img'); img.src = job.file; img.alt = job.title || 'Made by GilbertOne'; card.append(img);
  }
  card.append(el('p', null, contract.labels[job.kind]));
  const actions = el('div', 'actions');
  const save = el('a', null, 'Save'); save.href = job.file; save.download = '';
  const open = el('a', null, 'Open on its own'); open.href = job.file; open.target = '_blank'; open.rel = 'noopener';
  actions.append(save, open); card.append(actions); show(card);
}

async function poll(id) {
  const r = await fetch(`jobs/${id}`, { cache: 'no-store' });
  const job = await r.json();
  if (!r.ok) { stop(); return said(job.sentence, true); }
  if (job.state === 'queued') return waiting(job.position > 1 ? `Waiting: ${job.position - 1} ahead of you` : 'Next in line');
  if (job.state === 'working') return waiting(job.step || 'Working');
  stop();
  if (job.state === 'done') return result(job);
  said(job.sentence, true);
}

function stop() { clearInterval(polling); polling = null; ready(); }

async function make() {
  const words = $('words').value.trim();
  if (!words || polling) return;
  $('make').disabled = true;
  waiting('Checking your words');
  const r = await fetch('jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: chosen, words }) });
  const body = await r.json().catch(() => ({ sentence: 'The studio did not answer.' }));
  if (r.status !== 202) { ready(); return said(body.sentence, true); }
  polling = setInterval(() => poll(body.id).catch(() => undefined), 2500);
  poll(body.id).catch(() => undefined);
}

async function start() {
  contract = await (await fetch('contract', { cache: 'no-store' })).json();
  $('preview').textContent = contract.preview;
  $('keeping').textContent = contract.keeping;
  for (const k of contract.kinds) {
    const b = el('button', 'kind'); b.type = 'button'; b.dataset.kind = k.id;
    b.append(el('b', null, k.label), el('small', null, k.id === 'picture' && !contract.pictures ? 'Not switched on yet' : k.id === 'video' ? 'Animated drawings' : k.id === 'picture' ? 'Painted, slow' : 'Fastest'));
    if (k.id === 'picture' && !contract.pictures) b.disabled = true;
    b.addEventListener('click', () => choose(k.id));
    $('kinds').append(b);
  }
  choose('drawing');
  $('words').addEventListener('input', ready);
  $('make').addEventListener('click', make);
}

start().catch(() => said('The studio could not load. Is the media service running?', true));
