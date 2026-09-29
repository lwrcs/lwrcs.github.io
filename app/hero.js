// The hero version of the site: VIEW.EXE across the top of an ordinary portfolio page. lifetime
// lives behind its glass as he does on the desk (app/inner.js), framed smaller and wider; the
// rest of the page is plain HTML filled in from data/projects.json.
import { InnerView } from './inner.js';
import { devPanel } from './devpanel.js';
import { blueU } from './halftone.js';
import { loadModel } from './model.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#inner'), doingEl = $('#doing'), whereEl = $('#where');
const pointer = { x: 0, y: 0, seen: false };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ytId = (url) => (String(url || '').match(/(?:v=|youtu\.be\/)([\w-]{11})/) || [])[1];
blueU.value = 1;                                  // the desk's blue mode: black and #0000FF only

// ------------------------------------------------------------------ lifetime
// How much of the glass the window shows, from the floor line up (m). The eye is level with the
// middle of that and far enough back to keep the perspective gentle, so changing it only zooms.
// At 3.2 m he stands about 60% of the window's height at the glass, a little under half pacing.
const SPAN = 3.2;
const framing = (span) => ({ low: 0, high: span, eyeY: span * 0.5, eyeD: span * 1.35 });
let inner = null;
startLifetime();
async function startLifetime() {
  try {
    const url = document.querySelector('meta[name="lwrcs-model"]')?.content || 'assets/models/lifetime.glb';
    const gltf = await loadModel(url, (f) => { doingEl.textContent = 'LOADING LIFETIME.GLB ' + String(Math.round(Math.min(1, f) * 100)).padStart(3) + '%'; });
    let moves = Object.fromEntries(gltf.animations.filter((c) => c.name.startsWith('lifetime_')).map((c) => [c.name.slice(9), c]));
    if (!moves.idle) moves = await fetch('assets/models/lifetime-moves.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    inner = new InnerView(canvas, gltf.scene, { moves, frame: framing(SPAN) });
    devPanel(inner);
    window.__hero = inner;                       // test hook
    sizeControl();
    if (pointer.seen) inner.setPointerClient(pointer.x, pointer.y, false);
  } catch (err) {
    console.warn(err);
    document.documentElement.classList.add('no-gl');
    doingEl.textContent = 'NO 3D HERE';
  }
}

// the pointer anywhere on the page: on the glass he comes and puts a hand under it; off it, he
// paces near it and looks toward it
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  Object.assign(pointer, { x: e.clientX, y: e.clientY, seen: true });
  inner?.setPointerClient(e.clientX, e.clientY);
}, { passive: true });
// scrolling moves the glass under a still cursor
addEventListener('scroll', () => { if (pointer.seen) inner?.setPointerClient(pointer.x, pointer.y, false); }, { passive: true });
// touch: a tap or a sideways drag on the glass
canvas.addEventListener('pointerdown', (e) => { inner?.setPointerClient(e.clientX, e.clientY); inner?.poke(); });
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') inner?.setPointerClient(e.clientX, e.clientY); }, { passive: true });
new ResizeObserver(() => inner?.resize()).observe(canvas);

let onScreen = true, last = performance.now(), clock = 0, said = 0;
new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; }).observe(canvas);
requestAnimationFrame(function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  clock += dt;
  if (!inner || !onScreen) return;
  inner.update(dt, clock);
  if (clock - said > 0.1) { said = clock; status(); }
});

// the status bar: what he's up to, and where the cursor is on the glass
function status() {
  const on = Math.max(inner.hand.L.w.x, inner.hand.R.w.x) > 0.6;
  const doing = inner.mode === 'press'
    ? (on ? (Math.abs(inner.far.x) > 0.4 ? 'LEANING OUT TO YOU' : 'HAND ON THE GLASS') : 'COMING TO THE GLASS')
    : inner.speed.x > 0.1 ? 'PACING' : 'STANDING';
  if (doingEl.textContent !== doing) doingEl.textContent = doing;
  const p = inner.pointer, inWin = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
  let where = matchMedia('(hover: hover)').matches ? 'CURSOR OFF THE GLASS' : 'TAP THE GLASS';
  if (inWin) { const g = inner._pointerAt(0); where = `GLASS X ${(g.x >= 0 ? '+' : '') + g.x.toFixed(2)} M  Y ${g.y.toFixed(2)} M`; }
  if (whereEl.textContent !== where) whereEl.textContent = where;
}

// dev panel (#dev): how big he is, as how much of the glass the window shows
function sizeControl() {
  const panel = document.querySelector('#devpanel');
  if (!panel || !inner) return;
  let span = SPAN;
  try { span = +localStorage.getItem('lwrcs-hero-span') || SPAN; } catch {}
  const label = document.createElement('label');
  label.innerHTML = 'size <output></output><input type="range" min="2.2" max="6" step="0.1" id="dev-span">';
  panel.querySelector('[data-reset]').before(label);
  const out = label.querySelector('output'), input = label.querySelector('input');
  const apply = () => {
    input.value = span; out.textContent = `${span.toFixed(1)} m of glass`;
    inner.setFrame(framing(span));
    try { localStorage.setItem('lwrcs-hero-span', span); } catch {}
  };
  input.addEventListener('input', () => { span = +input.value; apply(); });
  panel.querySelector('[data-reset]').addEventListener('click', () => { span = SPAN; apply(); });
  apply();
}

// ------------------------------------------------------------------ the rest of the page
const KINDS = [['all', 'All'], ['mv', 'Music videos'], ['anim', 'Animation'], ['promo', 'Promo'], ['personal', 'Personal']];
const SERVICES = { spotify: 'Spotify', appleMusic: 'Apple Music', soundcloud: 'SoundCloud', youtube: 'YouTube', tidal: 'Tidal', deezer: 'Deezer' };
const kindOf = (p) => (p.tags.includes('mv') ? 'Music video' : p.tags.includes('promo') ? 'Promo' : p.tags.includes('logo') ? 'Logo' : 'Animation');
let projects = [];
try { projects = await (await fetch('data/projects.json')).json(); } catch { /* the page still reads without it */ }
const shown = projects.filter((p) => p.visible !== false && !p.tags?.includes('mymusic'));

// clients, most frequent first
const count = {};
for (const p of shown) if (p.name && p.name !== 'lwrcs' && p.tags.includes('comm')) count[p.name] = (count[p.name] || 0) + 1;
const clients = Object.keys(count).sort((a, b) => count[b] - count[a]);
if (clients.length) $('#clients').textContent = clients.join(', ');

const grid = $('#grid'), filters = $('#filters');
const FIRST = 12;                                 // shown before "Show all": fills rows of 2, 3 or 4
let kind = 'all', all = false;
function renderWork() {
  const every = shown.filter((p) => kind === 'all' || p.tags.includes(kind));
  const list = all ? every : every.slice(0, FIRST);
  $('#more').hidden = list.length === every.length;
  $('#more-btn').textContent = `Show all ${every.length}`;
  grid.innerHTML = list.map((p) => {
    const yt = ytId(p.links?.youtube), href = p.links?.youtube || p.links?.vimeo || '';
    const thumb = p.poster || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : '');
    const body = `
      <div class="thumb${thumb ? '' : ' none'}">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ''}<span class="kind">${href.includes('vimeo') ? 'Vimeo' : yt ? 'YouTube' : 'Video'}</span></div>
      <p class="meta"><span>${esc(p.name || 'lwrcs')}</span><span>${kindOf(p)}</span></p>
      <h3>${esc(p.title)}</h3>
      ${p.roles ? `<p class="roles">${esc(p.roles)}</p>` : ''}`;
    return `<li class="card">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${body}</a>` : `<div>${body}</div>`}</li>`;
  }).join('');
  // a picture that won't load (YouTube's are blocked in some previews) falls back to the dot screen
  for (const img of grid.querySelectorAll('img')) img.addEventListener('error', () => img.parentElement.classList.add('none'), { once: true });
}
filters.innerHTML = KINDS.map(([k, name]) => {
  const n = shown.filter((p) => k === 'all' || p.tags.includes(k)).length;
  return n ? `<button type="button" data-k="${k}" aria-pressed="${k === kind}">${name}<span class="n">${n}</span></button>` : '';
}).join('');
filters.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  kind = b.dataset.k; all = false;
  for (const x of filters.children) x.setAttribute('aria-pressed', x === b);
  renderWork();
});
$('#more-btn').addEventListener('click', () => { all = true; renderWork(); });
renderWork();

// his own music
const song = projects.find((p) => p.tags?.includes('mymusic') && p.visible !== false);
if (song) {
  const title = song.title.replace(/"/g, '').replace(/ \[visualizer\]| visual$/i, '');
  $('#release').innerHTML = `
    <figure class="cover"><img src="${esc(song.poster)}" alt="${esc(title)} cover" loading="lazy"></figure>
    <div>
      <h3>${esc(title)}</h3>
      <p class="what">Single and visualizer, by lwrcs</p>
      <ul class="stream">${Object.entries(song.links || {}).map(([k, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener"><span>${SERVICES[k] || k}</span><span>Listen ↗</span></a></li>`).join('')}</ul>
    </div>`;
}

$('#copy').addEventListener('click', async (e) => {
  const b = e.currentTarget, text = $('#email').textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
  catch { getSelection().selectAllChildren($('#email')); b.textContent = 'Selected'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1600);
});
