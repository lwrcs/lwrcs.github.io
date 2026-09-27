// Entry point. Desk mode: a WebGL room is drawn over the DOM screen, with the monitor glass
// cut out so the real, clickable desktop shows through, warped onto the glass every frame.
// Screen mode (touch, small windows): the DOM screen is the page, with the character inside.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildRoom, updateKeyboard, updateCable, DESK_Y } from './room.js';
import { POV } from './pov.js';
import { InnerView } from './inner.js';
import { ScreenUI, SCREEN_W as W, SCREEN_H as H } from './screen.js';
import { Spring } from './springs.js';

const Q = new URLSearchParams(location.search);
const doc = document.documentElement;
const $ = (s) => document.querySelector(s);
const stage = $('#stage'), screenEl = $('#screen'), roomCanvas = $('#room'), innerCanvas = $('#inner');
const pcursor = $('#pcursor'), tagEl = $('#tag');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const other = (s) => (s === 'L' ? 'R' : 'L');
const HOME = { type: 'home' };

// Camera: behind and above the sitter's head. The fov is fitted so the monitor, the desk
// items on both sides and the keyboard stay in frame at any window shape.
const CAM = { pos: V(0, 1.5, 1.14), target: V(0, 0.955, -0.02) };
const FIT = { halfW: 0.45, halfH: 0.285 };

const deskQuery = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px) and (min-height: 540px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode = null;

const ui = new ScreenUI(screenEl);
const pointer = { x: innerWidth / 2, y: innerHeight * 0.4, inside: false, moved: false };
let inner = null, povChar = null, desk = null, glOK = true, booted = false;
let clock = 0;
const innerRect = { x: 0, y: 0, w: 1, h: 1 };

// ------------------------------------------------------------------ homography
// Maps the screen's layout box (W x H) onto four points on the page.
const Hm = { m: null, inv: null, css: '' };
function setQuad(p) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  const m = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
  const css = `matrix3d(${[m[0] / W, m[3] / W, 0, m[6] / W, m[1] / H, m[4] / H, 0, m[7] / H, 0, 0, 1, 0, m[2], m[5], 0, 1].map((v) => +v.toFixed(8)).join(',')})`;
  Hm.m = m; Hm.inv = inv3(m);
  if (css !== Hm.css) { Hm.css = css; screenEl.style.transform = css; }
  Hm.scale = Math.hypot(x1 - x0, y1 - y0) / W;
  doc.classList.add('placed');
}
function inv3([a, b, c, d, e, f, g, h, i]) {
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det];
}
// page px -> screen layout px (extrapolates outside the glass)
function toLayout(x, y, out = {}) {
  const n = Hm.inv; if (!n) return null;
  const w = n[6] * x + n[7] * y + n[8];
  out.x = ((n[0] * x + n[1] * y + n[2]) / w) * W;
  out.y = ((n[3] * x + n[4] * y + n[5]) / w) * H;
  return out;
}
function fittedQuad() {
  const s = Math.min(innerWidth / W, innerHeight / H) * 0.9;
  const x = (innerWidth - W * s) / 2, y = (innerHeight - H * s) / 2;
  return [[x, y], [x + W * s, y], [x + W * s, y + H * s], [x, y + H * s]];
}

// ------------------------------------------------------------------ boot
const bootP = ui.bootLine('LWRCS BIOS v2.6   (C) 1996-2026');
ui.bootLine('');
ui.bootLine('MEMORY TEST ........ 640K OK');
ui.bootLine('DETECTING DRIVES ... A: C:');
const loadLine = ui.bootLine('LOADING LIFETIME.GLB');

applyMode();
deskQuery.addEventListener('change', applyMode);
addEventListener('resize', onResize);
ui.load('data/projects.json');

try {
  const model = document.querySelector('meta[name="lwrcs-model"]')?.content || 'assets/models/lifetime.glb';
  const gltf = await loadModel(model, (f) => {
    loadLine.textContent = 'LOADING LIFETIME.GLB ' + String(Math.round(Math.min(1, f) * 100)).padStart(3) + '%';
  });
  povChar = cloneSkinned(gltf.scene);
  try { inner = new InnerView(innerCanvas, gltf.scene); } catch (err) { glOK = false; console.warn(err); }
} catch (err) {
  console.warn(err);
  glOK = false;
}
loadLine.textContent = glOK ? 'LOADING LIFETIME.GLB 100% OK' : 'LOADING LIFETIME.GLB ... NO 3D, TEXT MODE';
ui.bootLine('');
ui.bootLine('C:\\> VIEW.EXE');
if (!glOK) { doc.classList.add('no-gl'); applyMode(); }
if (mode === 'desk' && glOK) initDesk();
measureInner();
setTimeout(() => { booted = true; ui.booted(); doc.classList.remove('loading'); }, reduced ? 0 : 450);
requestAnimationFrame(loop);

// The model is fetched here rather than by GLTFLoader: sandboxed hosts (the preview artifact)
// refuse to fetch data: URIs, so a .gltf with its buffer embedded is repacked as a GLB first.
async function loadModel(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  let bytes;
  if (res.body && total) {
    const reader = res.body.getReader(), parts = [];
    let got = 0;
    for (let r; !(r = await reader.read()).done; ) { parts.push(r.value); got += r.value.length; onProgress(got / total); }
    bytes = new Uint8Array(got);
    let o = 0;
    for (const p of parts) { bytes.set(p, o); o += p.length; }
  } else bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder();
  if (text.decode(bytes.subarray(0, 4)) !== 'glTF') bytes = packGLB(JSON.parse(text.decode(bytes)));
  return new GLTFLoader().parseAsync(bytes.buffer, '');
}

// glTF JSON whose first buffer is a data: URI -> GLB bytes (JSON chunk + BIN chunk)
function packGLB(json) {
  const uri = json.buffers?.[0]?.uri;
  let bin = new Uint8Array(0);
  if (uri?.startsWith('data:')) {
    const s = atob(uri.slice(uri.indexOf(',') + 1));
    bin = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
    delete json.buffers[0].uri;
  }
  const js = new TextEncoder().encode(JSON.stringify(json));
  const jl = (js.length + 3) & ~3, bl = (bin.length + 3) & ~3;
  const out = new Uint8Array(20 + jl + (bl ? 8 + bl : 0));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20); out.fill(0x20, 20 + js.length, 20 + jl);
  if (bl) { dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004e4942, true); out.set(bin, 28 + jl); }
  return out;
}

// ------------------------------------------------------------------ modes
function applyMode() {
  const m = Q.get('mode') || (deskQuery.matches ? 'desk' : 'screen');
  const want = glOK ? m : 'screen';
  if (want === mode) return;
  mode = want;
  doc.classList.toggle('mode-desk', mode === 'desk');
  doc.classList.toggle('mode-screen', mode === 'screen');
  if (mode === 'desk') {
    if (povChar && !desk) initDesk();
    if (!desk) setQuad(fittedQuad());
  } else {
    screenEl.style.transform = ''; Hm.css = '';
    doc.classList.remove('zone-screen', 'zone-bezel', 'zone-item', 'zone-free');
  }
  onResize();
}

function onResize() {
  if (desk && mode === 'desk') resizeDesk();
  else if (mode === 'desk') setQuad(fittedQuad());
  measureInner();
}

// layout-space rect of the inner canvas inside #screen (transforms don't affect offsets)
function measureInner() {
  let x = 0, y = 0, el = innerCanvas;
  while (el && el !== screenEl) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
  Object.assign(innerRect, { x, y, w: innerCanvas.clientWidth || 1, h: innerCanvas.clientHeight || 1 });
  inner?.resize(mode === 'desk' && Hm.scale ? Hm.scale : 1);
}

// ------------------------------------------------------------------ desk
function initDesk() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: roomCanvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (err) { console.warn(err); glOK = false; applyMode(); return; }
  renderer.setClearColor(0x000000, 0);
  const pixel = { value: 2 };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.03, 20);
  const room = buildRoom(pixel);
  scene.add(room.group);
  const pov = new POV({ scene, charScene: povChar, room, camera, pixel });
  pov.onAction = onAction;
  const glow = makeGlow(room.screen);
  scene.add(glow);
  for (const it of room.items) it.rest = it.anchor();
  desk = {
    renderer, pixel, scene, camera, room, pov, glow,
    lamp: new Spring(1, 1.1), crt: new Spring(1, 2.5), lampOn: true, crtOn: true,
    zone: 'screen', item: null, side: 'R', intro: reduced ? 1 : 0, ray: new THREE.Raycaster(),
  };
  resizeDesk();
}

function resizeDesk() {
  const { renderer, camera, pov, pixel } = desk;
  const vw = innerWidth, vh = innerHeight;
  const rs = vw * vh > 2.6e6 ? 0.5 : 1;               // chunky pixels on very large windows
  renderer.setPixelRatio(rs);
  renderer.setSize(vw, vh, false);
  pixel.value = 2 * rs;
  camera.aspect = vw / vh;
  const d = CAM.pos.distanceTo(CAM.target);
  const tanV = Math.max(FIT.halfH / d, FIT.halfW / d / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanV));
  camera.position.copy(CAM.pos); camera.lookAt(CAM.target);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  desk.focal = (vh / 2) / tanV;
  // Seated shoulder height, pushed down if a tall window would otherwise show them:
  // the arms always reach in from below the frame.
  const dirB = V(0, -1, 0.5).unproject(camera).sub(camera.position).normalize();
  const anchor = V(0, 1.06, 0.64);
  const t = (anchor.z - camera.position.z) / dirB.z;
  anchor.y = Math.min(anchor.y, camera.position.y + dirB.y * t - 0.07);
  const right = V(1, 0, 0).applyQuaternion(camera.quaternion);
  pov.setFrame(anchor, right.cross(dirB));
  placeScreen(1);
}

function glassQuad() {
  const { camera, room } = desk, s = room.screen;
  const hw = s.w / 2 + 0.002, hh = s.h / 2 + 0.002, c = s.center;
  return [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map(([x, y]) => {
    const p = V(c.x + x, c.y + y, c.z).project(camera);
    return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
  });
}

function placeScreen(k) {
  const g = glassQuad();
  if (k >= 1) { setQuad(g); return; }
  const f = fittedQuad();
  setQuad(g.map((p, i) => [lerp(f[i][0], p[0], k), lerp(f[i][1], p[1], k)]));
}

// A soft blue spill of light from the glass onto the bezel.
function makeGlow(s) {
  const m = 0.06, cw = 160, ch = Math.round(cw * (s.h + 2 * m) / (s.w + 2 * m));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d'), img = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const wx = ((x + 0.5) / cw - 0.5) * (s.w + 2 * m), wy = ((y + 0.5) / ch - 0.5) * (s.h + 2 * m);
    const dx = Math.max(0, Math.abs(wx) - s.w / 2 - 0.012), dy = Math.max(0, Math.abs(wy) - s.h / 2 - 0.012);
    const d = Math.hypot(dx, dy), inside = Math.abs(wx) < s.w / 2 + 0.012 && Math.abs(wy) < s.h / 2 + 0.012;
    const a = inside ? 0 : Math.exp(-d / 0.014) * 0.55;
    const o = (y * cw + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x3a4cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 2 * m, s.h + 2 * m), mat);
  mesh.position.copy(s.center).add(V(0, 0, 0.004)); mesh.renderOrder = 2;
  return mesh;
}

// ------------------------------------------------------------------ zones
// screen: inside the glass. bezel: on the monitor face (hands stay home). item: near a desk
// item. free: anywhere else, the nearer hand follows the pointer.
const _L = {}, _ndc = new THREE.Vector2(), _p = new THREE.Vector3();
function updateZone() {
  const d = desk, room = d.room, s = room.screen, bz = s.bezel;
  if (!pointer.inside || !booted || d.intro < 1) return setZone('away', null);
  const L = toLayout(pointer.x, pointer.y, _L);
  const wx = s.center.x + (L.x / W - 0.5) * (s.w + 0.004);
  const wy = s.center.y - (L.y / H - 0.5) * (s.h + 0.004);
  const inGlass = L.x >= 0 && L.x <= W && L.y >= 0 && L.y <= H;
  const power = room.items.find((it) => it.id === 'power');
  const pd = Math.hypot(wx - power.rest.x, wy - power.rest.y);
  const wasMon = d.zone === 'screen' || d.zone === 'bezel';
  const lee = wasMon ? 0.035 : 0.015;
  const onBezel = Math.abs(wx - bz.center.x) < bz.w / 2 + lee && wy > bz.center.y - bz.h / 2 - lee && wy < bz.center.y + bz.h / 2 + lee;

  if (inGlass) return setZone('screen', null);
  if (pd < (d.item === power ? 0.032 : 0.022)) return setZone('item', power);
  if (onBezel) return setZone('bezel', null);

  // nearest desk item within its projected radius (a bit stickier once hovered)
  let best = null, bestD = Infinity;
  for (const it of room.items) {
    if (it === power) continue;
    const p = _p.copy(it.rest).project(d.camera);
    const px = ((p.x + 1) / 2) * innerWidth, py = ((1 - p.y) / 2) * innerHeight;
    const depth = _p.copy(it.rest).applyMatrix4(d.camera.matrixWorldInverse).z * -1;
    const r = ((it.radius || 0.06) * d.focal) / depth * (d.item === it ? 1.5 : 1);
    const dist = Math.hypot(pointer.x - px, pointer.y - py);
    if (dist < r && dist / r < bestD) { best = it; bestD = dist / r; }
  }
  if (best) return setZone('item', best);

  // free: a point under the pointer, hovering over the desk or in front of the wall
  _ndc.set((pointer.x / innerWidth) * 2 - 1, -(pointer.y / innerHeight) * 2 + 1);
  d.ray.setFromCamera(_ndc, d.camera);
  const r = d.ray.ray;
  let hit = r.intersectPlane(new THREE.Plane(V(0, 1, 0), -(DESK_Y + 0.1)), new THREE.Vector3());
  if (!hit || hit.z < -0.25) hit = r.intersectPlane(new THREE.Plane(V(0, 0, 1), 0.25), new THREE.Vector3()) || V(0, 1, -0.25);
  hit.x = THREE.MathUtils.clamp(hit.x, -0.85, 0.85);
  hit.y = THREE.MathUtils.clamp(hit.y, DESK_Y + 0.06, 1.35);
  hit.z = THREE.MathUtils.clamp(hit.z, -0.3, 0.45);
  if (d.zone !== 'free') d.side = wx < 0 ? 'L' : 'R';
  else if (Math.abs(wx) > 0.05) d.side = wx < 0 ? 'L' : 'R';
  d.freePoint = hit;
  setZone('free', null);
}

function setZone(zone, item) {
  const d = desk;
  if (zone !== d.zone) {
    doc.classList.remove('zone-' + d.zone);
    doc.classList.add('zone-' + zone);
  }
  if (item !== d.item) {
    if (d.item) d.item.hover = 0;
    if (item) item.hover = 1;
  }
  d.zone = zone; d.item = item;
  const pov = d.pov;
  if (zone === 'item') { pov.setIntent(item.hand, { type: 'item', item }); pov.setIntent(other(item.hand), HOME); }
  else if (zone === 'free') { pov.setIntent(d.side, { type: 'free', point: d.freePoint }); pov.setIntent(other(d.side), HOME); }
  else { pov.setIntent('L', HOME); pov.setIntent('R', HOME); }
  // label next to the pointer
  if (zone === 'item') {
    const h = pov.hands[item.hand];
    const txt = h.held ? 'put back' : item.id === 'power' ? (d.crtOn ? 'power off' : 'power on') : item.id === 'lamp' ? (d.lampOn ? 'lamp off' : 'lamp on') : item.label;
    if (tagEl.textContent !== txt) tagEl.textContent = txt;
    tagEl.style.transform = `translate(${pointer.x + 18}px, ${pointer.y + 20}px)`;
    tagEl.classList.add('show');
  } else tagEl.classList.remove('show');
}

// ------------------------------------------------------------------ actions
function onAction(item) {
  const d = desk;
  if (!d.crtOn && item.id !== 'power' && item.id !== 'lamp') setCrt(true);
  if (item.id === 'lamp') d.lampOn = !d.lampOn;
  else if (item.id === 'power') setCrt(!d.crtOn);
  else if (item.id === 'floppy') { ui.cd('projects'); d.driveBlink = 1.2; }
  else if (item.id === 'tape') ui.cd('music');
  else if (item.id === 'card') ui.cd('contact');
}

function setCrt(on) {
  desk.crtOn = on;
  ui.power(on);
  if (on) { screenEl.classList.add('powering'); setTimeout(() => screenEl.classList.remove('powering'), 800); }
}

// ------------------------------------------------------------------ input
const _cl = {};
function placeCursor() {
  if (mode !== 'desk' || !Hm.inv) return;
  const L = toLayout(pointer.x, pointer.y, _cl);
  const x = Math.min(W - 3, Math.max(0, L.x)), y = Math.min(H - 3, Math.max(0, L.y));
  pcursor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && mode === 'screen') return;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; pointer.moved = true;
  placeCursor();                                   // immediately: the on-screen cursor never lags
  const hot = e.target.closest?.('#screen a, #screen button, #screen li[data-i], #screen li[data-dir]');
  pcursor.classList.toggle('hand', !!hot);
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer.inside = false; });
addEventListener('blur', () => { pointer.inside = false; });

stage.addEventListener('pointerdown', (e) => {
  if (mode === 'screen') {
    if (inner && e.target === innerCanvas) { inner.setPointerClient(e.clientX, e.clientY); inner.poke(); }
    return;
  }
  if (!desk) return;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
  updateZone();
  const z = desk.zone;
  if (z === 'screen' || z === 'bezel') {
    desk.pov.click(true);
    if (z === 'screen' && e.target === innerCanvas) inner?.poke();
  } else if (z === 'item') desk.pov.activate(desk.item.hand);
});
addEventListener('pointerup', () => desk?.pov.click(false));

// touch in screen mode: the character follows your finger inside VIEW.EXE
innerCanvas.addEventListener('pointermove', (e) => { if (mode === 'screen') inner?.setPointerClient(e.clientX, e.clientY); }, { passive: true });

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
  const f = document.activeElement;
  if ((e.key === 'Enter' || e.key === ' ') && f?.matches?.('#screen li[tabindex]')) { f.click(); e.preventDefault(); return; }
  const handled = ui.key(e);
  if (desk && mode === 'desk') desk.pov.keyTap(e.code);
  if (handled && e.key !== 'Tab') e.preventDefault();
});

// ------------------------------------------------------------------ frame loop
let last = performance.now();
let innerOnScreen = true;
new IntersectionObserver(([en]) => { innerOnScreen = en.isIntersecting; }).observe(innerCanvas);

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  clock += dt;
  if (mode === 'desk' && desk) frameDesk(dt, clock);
  if (inner && innerOnScreen && !(desk && mode === 'desk' && !desk.crtOn && desk.crt.x < 0.02)) {
    if (mode === 'desk' && Hm.inv && pointer.inside) {
      const L = toLayout(pointer.x, pointer.y, _L);
      inner.setPointerNDC(((L.x - innerRect.x) / innerRect.w) * 2 - 1, -(((L.y - innerRect.y) / innerRect.h) * 2 - 1), pointer.moved);
    }
    pointer.moved = false;
    inner.update(dt, clock);
  }
}

function frameDesk(dt, t) {
  const d = desk, room = d.room;
  if (booted && d.intro < 1) {
    d.intro = Math.min(1, d.intro + dt / 1.8);
    const k = smooth(0, 1, d.intro);
    placeScreen(k);
    roomCanvas.style.opacity = k.toFixed(3);
    if (d.intro >= 1) { measureInner(); placeCursor(); }
  } else if (!booted) roomCanvas.style.opacity = '0';
  updateZone();
  if (d.zone === 'item') tagEl.style.transform = `translate(${pointer.x + 18}px, ${pointer.y + 20}px)`;

  // cursor position on the glass drives the mouse on the pad
  const L = toLayout(pointer.x, pointer.y, _L);
  const uv = L ? { x: Math.min(1, Math.max(0, L.x / W)), y: Math.min(1, Math.max(0, L.y / H)) } : null;
  d.pov.update(dt, t, d.zone === 'screen' || d.zone === 'bezel' ? uv : null);
  for (const it of room.items) {                      // hovered items light up a little
    it.glow = (it.glow || 0) + ((it.hover || 0) * 0.55 - (it.glow || 0)) * Math.min(1, dt * 10);
    for (const m of it.mats) m.userData.uniforms.uLift.value = it.glow;
  }
  updateKeyboard(room.keyboard, dt);
  updateCable(room.mouse);

  const lamp = d.lamp.update(d.lampOn ? 1 : 0, dt);
  room.lampLight.intensity = 3.5 * Math.max(0, lamp);
  room.bulb.material.color.setRGB(0.12 + 0.88 * lamp, 0.12 + 0.78 * lamp, 0.19 + 0.5 * lamp);
  const crt = Math.max(0, d.crt.update(d.crtOn ? 1 : 0, dt));
  room.screenLight.intensity = 0.8 * crt * (0.96 + 0.04 * Math.sin(t * 50));
  d.glow.material.opacity = crt;
  room.powerLed.material.color.setHex(d.crtOn ? 0x3cff6a : 0x0b2210);
  if (d.driveBlink > 0) { d.driveBlink -= dt; room.caseLed.material.color.setHex(Math.sin(t * 40) > 0 ? 0xffb43c : 0x3cff6a); }
  else room.caseLed.material.color.setHex(0x3cff6a);

  d.renderer.render(d.scene, d.camera);
}

// test hooks
window.__lwrcs = {
  itemsOnScreen: () => desk.room.items.map((it) => { const p = it.rest.clone().project(desk.camera); return [it.id, +((p.x + 1) / 2).toFixed(3), +((1 - p.y) / 2).toFixed(3)]; }),
  get desk() { return desk; }, get inner() { return inner; }, ui, pointer, toLayout, frameDesk, updateZone, CAM, FIT, resizeDesk: () => resizeDesk() };
