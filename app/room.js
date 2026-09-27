// The desk: a beige CRT on a desktop case, keyboard, mouse and a few things you can reach for.
// Everything is built from primitives and shaded with the same dither as the character.
// Units are metres; the viewer sits at +Z looking toward -Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { halftoneMaterial, inkMaterial } from './halftone.js';

export const DESK_Y = 0.74;

const BEIGE = 0xcfc6a8;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildRoom(pixel) {
  const g = new THREE.Group();
  const mat = (ink, opts = {}) => { const m = halftoneMaterial({ pixel, ink, gain: 2.4, tone: true, ...opts }); m.userData.args = [ink, opts]; return m; };
  const M = {
    desk: mat(0x3a3f8f, { base: 0xbbbbbb }),
    beige: mat(BEIGE),
    beigeDark: mat(0x9d967f),
    black: mat(0x3a3a4a),
    key: mat(0xd8d0b4),
    floppy: mat(0x2c3fd8),
    label: mat(0xe8e8e8),
    tape: mat(0xd9d9e8),
    lamp: mat(0xb0b8d8),
    card: mat(0xf0ead8),
    ink: inkMaterial(0x000000),
  };
  const box = (w, h, d, m, r = 0.004) => new THREE.Mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
  const at = (o, x, y, z) => { o.position.set(x, y, z); g.add(o); return o; };

  // ---- desk and wall ----
  at(box(2.2, 0.035, 1.0, M.desk, 0.01), 0, DESK_Y - 0.0175, -0.12);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), mat(0x1c2060, { base: 0x888888 }));
  at(wall, 0, 1.2, -0.75);

  // ---- desktop case ----
  const caseH = 0.105, caseY = DESK_Y + caseH / 2;
  at(box(0.48, caseH, 0.42, M.beige, 0.008), 0, caseY, -0.2);
  at(box(0.15, 0.011, 0.01, M.ink, 0), 0.08, caseY + 0.012, 0.011);         // floppy slot
  const caseLed = at(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.004), new THREE.MeshBasicMaterial({ color: 0x3cff6a })), 0.19, caseY - 0.022, 0.012);
  at(box(0.03, 0.03, 0.01, M.beigeDark, 0.004), -0.18, caseY - 0.012, 0.012);   // case power

  // ---- CRT ----
  const crt = new THREE.Group(); g.add(crt);
  const monBottom = caseY + caseH / 2 + 0.012;
  const bezel = { w: 0.46, h: 0.4, d: 0.07 };
  const bezelCY = monBottom + bezel.h / 2;
  const front = 0.035;                                                       // z of the bezel face
  const stand = box(0.2, 0.012, 0.18, M.beigeDark, 0.004); stand.position.set(0, monBottom - 0.006, -0.12); crt.add(stand);
  const face = box(bezel.w, bezel.h, bezel.d, M.beige, 0.012); face.position.set(0, bezelCY, front - bezel.d / 2); crt.add(face);
  const back = box(0.38, 0.33, 0.3, M.beige, 0.03); back.position.set(0, bezelCY + 0.005, front - bezel.d - 0.14); crt.add(back);
  const neck = box(0.2, 0.18, 0.12, M.beigeDark, 0.02); neck.position.set(0, bezelCY + 0.01, front - bezel.d - 0.33); crt.add(neck);

  // glass: 4:3 visible area, a little above centre (thicker chin for the controls)
  const glass = { w: 0.34, h: 0.255 };
  const glassCY = bezelCY + 0.02;
  const glassZ = front + 0.0015;
  // recessed black surround so the screen reads as sunk into the bezel
  const surround = new THREE.Mesh(new THREE.PlaneGeometry(glass.w + 0.024, glass.h + 0.024), inkMaterial(0x05060c));
  surround.position.set(0, glassCY, glassZ - 0.0004); crt.add(surround);
  // The glass itself is a hole: it clears the canvas to transparent so the DOM screen shows through.
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(glass.w, glass.h), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.NoBlending }));
  hole.position.set(0, glassCY, glassZ); hole.renderOrder = 1; crt.add(hole);

  // chin details
  const powerBtn = box(0.026, 0.016, 0.012, M.beigeDark, 0.003);
  const powerRest = V(bezel.w / 2 - 0.045, monBottom + 0.032, front + 0.002);
  powerBtn.position.copy(powerRest); crt.add(powerBtn);
  const powerLed = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.003), new THREE.MeshBasicMaterial({ color: 0x3cff6a }));
  powerLed.position.set(bezel.w / 2 - 0.07, monBottom + 0.032, front + 0.002); crt.add(powerLed);
  const knobs = [];
  for (let i = 0; i < 4; i++) { const k = box(0.012, 0.008, 0.006, M.beigeDark, 0.002); k.position.set(-bezel.w / 2 + 0.05 + i * 0.022, monBottom + 0.03, front + 0.001); crt.add(k); knobs.push(k); }
  // badge
  const badge = box(0.05, 0.008, 0.002, M.beigeDark, 0); badge.position.set(-bezel.w / 2 + 0.06, bezelCY + bezel.h / 2 - 0.022, front + 0.001); crt.add(badge);

  // ---- keyboard ----
  const kb = new THREE.Group(); kb.position.set(-0.03, DESK_Y, 0.12); g.add(kb);
  const kbBody = box(0.46, 0.028, 0.165, M.beige, 0.006); kbBody.position.y = 0.014; kbBody.rotation.x = 0.06; kb.add(kbBody);
  const keyGeo = new RoundedBoxGeometry(0.0155, 0.01, 0.0155, 1, 0.002);
  const rows = [14, 14, 13, 12]; const keyCount = rows.reduce((a, b) => a + b, 0) + 1;
  const keys = new THREE.InstancedMesh(keyGeo, M.key, keyCount);
  const keyRest = []; let ki = 0; const m4 = new THREE.Matrix4();
  rows.forEach((n, r) => {
    for (let c = 0; c < n; c++) {
      const x = -0.205 + c * 0.0195 + r * 0.006, z = -0.055 + r * 0.021;
      keyRest.push(V(x, 0.033 - r * 0.0012, z)); m4.makeTranslation(x, 0.033 - r * 0.0012, z); keys.setMatrixAt(ki++, m4);
    }
  });
  // space bar
  const spaceIdx = ki; keyRest.push(V(-0.02, 0.028, 0.03)); m4.compose(V(-0.02, 0.028, 0.03), new THREE.Quaternion(), V(6.5, 1, 1)); keys.setMatrixAt(ki++, m4);
  kb.add(keys);
  const keyboard = { group: kb, keys, keyRest, spaceIdx, press: new Float32Array(keyCount) };

  // ---- mouse pad + mouse ----
  const pad = { center: V(0.33, DESK_Y + 0.002, 0.12), w: 0.2, d: 0.17 };
  at(new THREE.Mesh(new THREE.BoxGeometry(pad.w, 0.004, pad.d), mat(0x2b2f6e)), pad.center.x, DESK_Y + 0.002, pad.center.z);
  const mouse = new THREE.Group(); mouse.position.copy(pad.center).add(V(0, 0.002, 0)); g.add(mouse);
  const mBody = box(0.058, 0.03, 0.1, M.beige, 0.014); mBody.position.set(0, 0.015, 0.005); mouse.add(mBody);
  const btnL = box(0.027, 0.008, 0.038, M.beige, 0.003); btnL.position.set(-0.0145, 0.031, -0.028); mouse.add(btnL);
  const btnR = box(0.027, 0.008, 0.038, M.beige, 0.003); btnR.position.set(0.0145, 0.031, -0.028); mouse.add(btnR);
  const cableMat = new THREE.LineBasicMaterial({ color: 0x9d967f });
  const cableGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
  const cable = new THREE.Line(cableGeo, cableMat); cable.frustumCulled = false; g.add(cable);
  const cableEnd = V(0.2, DESK_Y + 0.03, -0.18);
  const mouseRig = { group: mouse, btnL, btnR, pad, cable, cableEnd };

  // ---- items ----
  const items = [];

  // Right: desk lamp with a push switch on the base (button)
  const lamp = new THREE.Group(); lamp.position.set(0.44, DESK_Y, -0.24); lamp.scale.setScalar(0.85); g.add(lamp);
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 20), M.lamp); lb.position.y = 0.0125; lamp.add(lb);
  const arm1 = box(0.018, 0.3, 0.018, M.lamp, 0.006); arm1.position.set(0, 0.16, 0); arm1.rotation.z = 0.25; lamp.add(arm1);
  const arm2 = box(0.018, 0.26, 0.018, M.lamp, 0.006); arm2.position.set(-0.08, 0.36, 0.06); arm2.rotation.set(0.6, 0, 0.9); lamp.add(arm2);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.11, 20, 1, true), M.lamp); shade.position.set(-0.2, 0.42, 0.14); shade.rotation.set(0.5, 0, 0.7); lamp.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0x202030 })); bulb.position.set(-0.19, 0.4, 0.14); lamp.add(bulb);
  const lampSwitch = box(0.03, 0.014, 0.03, M.beigeDark, 0.004); lampSwitch.position.set(-0.035, 0.03, 0.045); lamp.add(lampSwitch);
  const lampLight = new THREE.SpotLight(0xffe6b0, 0, 2.2, 0.9, 0.6, 1.2);
  lampLight.position.set(0.28, DESK_Y + 0.36, -0.12); lampLight.target.position.set(0.05, DESK_Y, 0.1); g.add(lampLight, lampLight.target);
  items.push({ id: 'lamp', group: lamp, kind: 'button', hand: 'R', label: 'lamp', radius: 0.05, mesh: lampSwitch, restPos: lampSwitch.position.clone(), normal: V(0, 1, 0), anchor: () => lampSwitch.getWorldPosition(new THREE.Vector3()) });

  // Right: floppy disks (object) -> projects
  const flop = new THREE.Group(); flop.position.set(0.35, DESK_Y, -0.04); flop.rotation.y = -0.35; g.add(flop);
  const disks = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Group(); d.position.set(i * 0.004, 0.0015 + i * 0.0032, -i * 0.003); d.rotation.y = i * 0.12;
    d.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.003, 0.094), i === 2 ? M.floppy : M.black));
    const lab = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.0032, 0.05), M.label); lab.position.set(0, 0.0002, 0.018); d.add(lab);
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0034, 0.03), M.lamp); shutter.position.set(0.005, 0.0002, -0.03); d.add(shutter);
    flop.add(d); disks.push(d);
  }
  items.push({ id: 'floppy', group: flop, kind: 'object', hand: 'R', label: 'projects', radius: 0.065, mesh: disks[2], anchor: () => disks[2].getWorldPosition(new THREE.Vector3()) });

  // Left: cassette "lifetime" (object) -> music
  const tape = new THREE.Group(); tape.position.set(-0.34, DESK_Y + 0.009, 0.02); tape.rotation.y = 0.4; g.add(tape);
  const shell = box(0.1, 0.016, 0.064, M.tape, 0.003); tape.add(shell);
  const tapeLabel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.0165, 0.034), M.floppy); tapeLabel.position.set(0, 0.0002, -0.004); tape.add(tapeLabel);
  for (const x of [-0.022, 0.022]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.017, 10), M.ink); h.position.set(x, 0.0004, -0.004); tape.add(h); }
  items.push({ id: 'tape', group: tape, kind: 'object', hand: 'L', label: 'music', radius: 0.065, mesh: tape, anchor: () => tape.getWorldPosition(new THREE.Vector3()) });

  // Left: business cards in a holder (object) -> contact
  const holder = new THREE.Group(); holder.position.set(-0.38, DESK_Y, -0.16); holder.rotation.y = 0.5; g.add(holder);
  const hb = box(0.1, 0.03, 0.05, M.black, 0.004); hb.position.set(0, 0.015, 0); holder.add(hb);
  const cards = [];
  for (let i = 0; i < 2; i++) { const c = box(0.09, 0.052, 0.002, M.card, 0.001); c.position.set(0, 0.045, -0.006 + i * 0.006); c.rotation.x = -0.12; holder.add(c); cards.push(c); }
  items.push({ id: 'card', group: holder, kind: 'object', hand: 'L', label: 'contact', radius: 0.06, mesh: cards[1], anchor: () => cards[1].getWorldPosition(new THREE.Vector3()) });

  // Left: pencil cup (decor)
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 16, 1, true), M.black); cup.position.set(-0.45, DESK_Y + 0.05, -0.34); g.add(cup);
  for (let i = 0; i < 4; i++) { const p = box(0.008, 0.16, 0.008, i % 2 ? M.floppy : M.label, 0.002); p.position.set(-0.45 + (i - 1.5) * 0.012, DESK_Y + 0.1, -0.34 + (i % 2) * 0.01); p.rotation.z = (i - 1.5) * 0.12; g.add(p); }

  // Monitor power button, and the first chin knob switches blue mode (buttons)
  items.push({ id: 'power', group: powerBtn, kind: 'button', hand: 'R', label: 'power', mesh: powerBtn, restPos: powerRest.clone(), normal: V(0, 0, 1), anchor: () => powerBtn.getWorldPosition(new THREE.Vector3()), small: true });
  items.push({ id: 'color', group: knobs[0], kind: 'button', hand: 'L', label: 'colour', mesh: knobs[0], restPos: knobs[0].position.clone(), normal: V(0, 0, 1), anchor: () => knobs[0].getWorldPosition(new THREE.Vector3()), small: true });

  // Each item gets its own copies of its materials, so hovering can light just that item.
  for (const it of items) {
    it.mats = [];
    const own = new Map();
    it.group.traverse((o) => {
      const args = o.isMesh && o.material.userData.args;
      if (!args) return;
      if (!own.has(o.material)) { const m = mat(...args); own.set(o.material, m); it.mats.push(m); }
      o.material = own.get(o.material);
    });
  }

  // ---- lights ----
  const screenLight = new THREE.PointLight(0x9aa6ff, 1.6, 2.2, 1.0);
  screenLight.position.set(0, glassCY - 0.05, glassZ + 0.42); g.add(screenLight);
  const hemi = new THREE.HemisphereLight(0x8090ff, 0x10123a, 1.3); g.add(hemi);
  const moon = new THREE.DirectionalLight(0xaab4ff, 0.8); moon.position.set(-1, 2, 1); g.add(moon);

  return {
    group: g,
    screen: { hole, center: V(0, glassCY, glassZ), w: glass.w, h: glass.h, bezel: { center: V(0, bezelCY, front), w: bezel.w, h: bezel.h } },
    keyboard, mouse: mouseRig, items, lampLight, screenLight, hemi, caseLed, powerLed, bulb,
  };
}

// keyboard key presses decay back up
export function updateKeyboard(kbd, dt) {
  const m4 = new THREE.Matrix4(); let dirty = false;
  for (let i = 0; i < kbd.press.length; i++) {
    if (kbd.press[i] <= 0) continue;
    kbd.press[i] = Math.max(0, kbd.press[i] - dt * 7); dirty = true;
    const p = kbd.keyRest[i].clone(); p.y -= 0.004 * Math.sin(Math.min(1, kbd.press[i]) * Math.PI / 2);
    if (i === kbd.spaceIdx) m4.compose(p, new THREE.Quaternion(), V(6.5, 1, 1)); else m4.makeTranslation(p.x, p.y, p.z);
    kbd.keys.setMatrixAt(i, m4);
  }
  if (dirty) kbd.keys.instanceMatrix.needsUpdate = true;
}

export function updateCable(m) {
  const a = m.group.position.clone().add(V(0, 0.012, -0.05)), b = m.cableEnd;
  const mid1 = a.clone().add(V(0, 0.0, -0.08)); mid1.y = DESK_Y + 0.003;
  const mid2 = a.clone().lerp(b, 0.6); mid2.y = DESK_Y + 0.004;
  const curve = new THREE.CatmullRomCurve3([a, mid1, mid2, b]);
  const pos = m.cable.geometry.attributes.position;
  for (let i = 0; i < 24; i++) { const p = curve.getPoint(i / 23); pos.setXYZ(i, p.x, p.y, p.z); }
  pos.needsUpdate = true;
}
