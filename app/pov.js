// First-person arms: the same character, seen from his own eyes.
// Right hand drives the mouse; left hand rests on the keyboard. Either hand leaves home to
// follow the pointer outside the monitor, hovers items, presses buttons and picks things up.
// Every target goes through springs, so hands can lag but never jump.
import * as THREE from 'three';
import { applyCharacterMaterials } from './halftone.js';
import { Rig, POSES, FingerBlend, mixPose } from './rig.js';
import { Spring, Spring3, QuatFollow } from './springs.js';
import { DESK_Y } from './room.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const S = 0.95;                          // character scale for a believable reach

// The camera sits behind and above the (invisible) head, like an over-the-shoulder shot with
// the torso hidden, so the arms always enter from the bottom edge of the frame.
// `anchor` is where the midpoint between the shoulders rests, `keepOut` the normal of the
// frame's bottom plane: leaning never pushes the shoulders up into view.
export class POV {
  constructor({ scene, charScene, room, camera, pixel }) {
    this.room = room; this.camera = camera;
    this.root = new THREE.Group(); scene.add(this.root);
    this.char = charScene; charScene.scale.setScalar(S); this.root.add(charScene);
    applyCharacterMaterials(charScene, pixel, { gain: 1.9, lift: 0.22 });
    charScene.traverse((o) => {
      if (!o.isMesh) return;
      const n = (o.name + ' ' + (o.parent?.name || '')).toLowerCase();
      if (!n.includes('arms')) o.visible = false;
    });
    this.root.rotation.set(0, Math.PI, 0); this.root.updateMatrixWorld(true);
    this.rig = new Rig(charScene);
    const shL = this.rig.b('upper_arm.L').getWorldPosition(new THREE.Vector3());
    const shR = this.rig.b('upper_arm.R').getWorldPosition(new THREE.Vector3());
    this.shMid = shL.clone().add(shR).multiplyScalar(0.5);              // relative to root, facing -Z
    this.shOff = { L: shL.sub(this.shMid), R: shR.sub(this.shMid) };
    this.anchor = V(0, 0.95, 0.6); this.keepOut = V(0, 1, 0);
    this.shoulderRest = { L: V(0, 0, 0), R: V(0, 0, 0) };
    this.setFrame(this.anchor, this.keepOut);

    this.lean = new Spring3(V(0, 0, 0), 1.4);
    this.yaw = new Spring(0, 1.4);
    this.hands = {};
    for (const s of ['L', 'R']) {
      this.hands[s] = {
        side: s, intent: { type: 'home' }, phase: 'home', item: null, held: null, lock: false,
        palm: new Spring3(this._homePalm(s), 3.2), q: new QuatFollow(this._homeQuat(s), 4.5),
        fingers: new FingerBlend(s === 'R' ? POSES.grip : POSES.type, 6), press: new Spring(0, 9),
        tap: new Spring(0, 12), tapFinger: 'f_index', t0: 0, fired: false,
      };
    }
    this.mouseTarget = room.mouse.group.position.clone();
    this.mouseVel = new Spring3(this.mouseTarget, 14);
    this.onAction = () => {};
    this.settling = [];
    this.clickS = new Spring(0, 16);
    this.t = 0;
  }

  setFrame(anchor, keepOut) {
    this.anchor.copy(anchor); this.keepOut.copy(keepOut).normalize();
    for (const s of ['L', 'R']) this.shoulderRest[s].copy(anchor).add(this.shOff[s]);
    this._place(this.lean?.x ?? V(0, 0, 0), this.yaw?.x ?? 0);
  }

  _place(lean, yaw) {
    this.root.rotation.set(0, Math.PI + yaw, 0);
    const mid = this.shMid.clone().applyAxisAngle(Y, yaw);
    this.root.position.copy(this.anchor).add(lean).sub(mid);
    this.root.updateMatrixWorld(true);
  }

  // ---- home poses ----
  _mouseGrip(out = new THREE.Vector3()) { return out.copy(this.room.mouse.group.position).add(V(0, 0.05, 0.02)); }
  _homePalm(s) {
    if (s === 'R') return this._mouseGrip();
    return this.room.keyboard.group.position.clone().add(V(-0.08, 0.075, 0.03));
  }
  _homeQuat(s) {
    const r = this._rig();
    if (!r) return new THREE.Quaternion();
    const sg = s === 'L' ? -1 : 1;                                        // world x of that hand's side
    return r.handWorldQuat(s, V(-0.05 * sg, -0.35, -1).normalize(), V(0.15 * sg, -1, 0.1).normalize());
  }
  _rig() { return this.rig; }

  // Pointer went down inside the monitor: click the mouse.
  click(down) { this.clickDown = down; }
  // A real key was pressed: tap a finger of the left hand and sink a key.
  keyTap(code) {
    const kb = this.room.keyboard;
    const h = this.hands.L;
    if (h.phase !== 'home') return;
    const fingers = ['f_pinky', 'f_ring', 'f_middle', 'f_index'];
    let idx = Math.abs(hash(code)) % (kb.keyRest.length - 1);
    if (code === 'Space') idx = kb.spaceIdx;
    kb.press[idx] = 1;
    h.tapFinger = code === 'Space' ? 'thumb' : fingers[Math.abs(hash(code + 'f')) % 4];
    h.tap.v += 200;
  }

  // intents: { type:'home' } | { type:'free', point } | { type:'item', item }
  setIntent(side, intent) { this.hands[side].intent = intent; }
  // A click while hovering an item.
  activate(side) {
    const h = this.hands[side];
    if (!h.item) return;
    if (h.item.kind === 'button' && h.phase === 'hover') { h.phase = 'press'; h.t0 = this.t; }
    else if (h.item.kind === 'object' && h.phase === 'hover') { h.phase = 'reach'; h.t0 = this.t; }
    else if (h.item.kind === 'object' && h.phase === 'hold') { h.phase = 'return'; h.t0 = this.t; }
  }

  update(dt, t, cursorUV) {
    this.t = t; dt = Math.min(dt, 0.05);
    const rig = this.rig, room = this.room;

    // ---- mouse follows the cursor, but only while the hand is on it ----
    const pad = room.mouse.pad;
    if (cursorUV) this.mouseTarget.set(pad.center.x + (cursorUV.x - 0.5) * pad.w * 0.8, pad.center.y + 0.002, pad.center.z + (cursorUV.y - 0.5) * pad.d * 0.8);
    const R = this.hands.R;
    if (R.lock) this.mouseVel.update(this.mouseTarget, dt);
    room.mouse.group.position.copy(this.mouseVel.x);
    const clickDepth = this.clickS.update(this.clickDown && R.lock ? 1 : 0, dt);
    room.mouse.btnL.position.y = 0.031 - 0.0025 * clickDepth;

    // ---- per-hand targets ----
    const want = {};
    for (const s of ['L', 'R']) want[s] = this._handTarget(this.hands[s], dt);

    // ---- lean toward far targets (the body is invisible, so lean freely below the frame) ----
    const leanT = V(0, 0, 0); let yawT = 0;
    for (const s of ['L', 'R']) {
      const h = this.hands[s]; if (h.phase === 'home') continue;
      const d = want[s].palm.clone().sub(this.shoulderRest[s]);
      const excess = Math.max(0, d.length() - 0.48);
      leanT.addScaledVector(d.normalize(), Math.min(excess, 0.4));
      yawT += -Math.atan2(want[s].palm.x - this.anchor.x, this.anchor.z - want[s].palm.z) * 0.35;
    }
    const up = leanT.dot(this.keepOut);
    if (up > 0) leanT.addScaledVector(this.keepOut, -up);
    const lean = this.lean.update(leanT, dt), yaw = this.yaw.update(yawT, dt);
    this._place(lean, yaw);

    // ---- solve arms ----
    rig.reset();
    for (const s of ['L', 'R']) {
      const h = this.hands[s], w = want[s];
      let palm;
      if (w.exact) { palm = w.palm; h.palm.snap(palm); } else palm = h.palm.update(w.palm, dt);
      const hq = h.q.update(w.quat, dt);
      const sgn = s === 'L' ? -1 : 1;
      const sh = rig.b('upper_arm.' + s).getWorldPosition(new THREE.Vector3());
      const pole = sh.clone().add(V(0.55 * sgn, -0.5, 0.25));
      rig.armIK(s, rig.wristFor(s, palm, hq, new THREE.Vector3()), pole);
      rig.setHand(s, hq);
      const pose = h.fingers.update(w.pose, dt);
      const tap = Math.max(0, h.tap.update(0, dt));
      const tapped = { ...pose, [h.tapFinger]: pose[h.tapFinger].map((a, i) => a + tap * [0.35, 0.25, 0.15][i]) };
      if (s === 'R' && R.lock) tapped.f_index = pose.f_index.map((a, i) => a + clickDepth * [0.22, 0.12, 0.06][i]);
      rig.setFingers(s, tapped);
    }
    // put-back objects ease into their exact resting pose
    const k = 1 - Math.exp(-dt * 10);
    this.settling = this.settling.filter(({ obj, pos, quat }) => {
      obj.position.lerp(pos, k); obj.quaternion.slerp(quat, k);
      return obj.position.distanceToSquared(pos) > 1e-8;
    });
  }

  _handTarget(h, dt) {
    const s = h.side, it = h.intent, room = this.room, rig = this.rig;
    const sgn = s === 'L' ? -1 : 1;
    // choose phase from intent
    if (h.phase === 'home' || h.phase === 'free' || h.phase === 'hover') {
      if (it.type === 'item' && (!h.held || h.item === it.item)) { h.item = it.item; h.phase = h.held ? 'hold' : 'hover'; }
      else if (it.type === 'free' && !h.held) { h.phase = 'free'; h.item = null; }
      else if (!h.held) { h.phase = 'home'; h.item = null; }
    }
    if (h.phase === 'hold' && it.type !== 'item' && s === 'R') { h.phase = 'return'; h.t0 = this.t; }
    if (h.phase !== 'home') h.lock = false;

    const out = { palm: null, quat: null, pose: POSES.relaxed, exact: false };
    const cur = h.palm.x;
    if (h.phase === 'home') {
      out.palm = this._homePalm(s);
      out.quat = this._homeQuat(s);
      out.pose = s === 'R' ? POSES.grip : POSES.type;
      if (s === 'R') {
        if (!h.lock && cur.distanceTo(out.palm) < 0.012) h.lock = true;
        if (h.lock) out.exact = true;
      }
    } else if (h.phase === 'free') {
      out.palm = it.point.clone();
      const dir = out.palm.clone().sub(this.shoulderRest[s]).normalize();
      out.quat = rig.handWorldQuat(s, V(dir.x, dir.y * 0.5 - 0.2, dir.z).normalize(), V(0.25 * sgn, -1, 0.2).normalize());
      out.pose = POSES.open;
    } else {
      const item = h.item, a = item.anchor();
      if (item.kind === 'button') {
        const n = item.normal.clone();
        const tipDir = n.clone().negate().lerp(V(0, -0.2, -1).normalize(), n.y > 0.5 ? 0.35 : 0.1).normalize();
        const pressing = h.phase === 'press';
        const tip = a.clone().addScaledVector(n, pressing ? 0.004 : 0.035);
        out.palm = tip.clone().addScaledVector(tipDir, -0.1 * S);
        const palmN = n.y > 0.5 ? V(0.1 * sgn, -1, 0.3) : V(0.3 * sgn, -1, 0.2);
        out.quat = rig.handWorldQuat(s, tipDir, palmN.normalize());
        out.pose = POSES.point;
        if (pressing) {
          const tipNow = rig.fingertipWorld(s, 'f_index');
          if (tipNow.distanceTo(tip) < 0.012 || this.t - h.t0 > 0.6) {
            if (!h.fired) { h.fired = true; this.onAction(item); item.mesh.position.copy(item.restPos).addScaledVector(n, -0.004); }
          }
          if (this.t - h.t0 > 0.75) { h.phase = 'hover'; h.fired = false; item.mesh.position.copy(item.restPos); }
        }
      } else {
        // objects: hover above, reach down and grab, lift to look at it, put back
        const above = a.clone().add(V(0, 0.075, 0.015));
        const grasp = a.clone().add(V(0, 0.038, 0.01));
        const palmDown = rig.handWorldQuat(s, V(-0.15 * sgn, -0.25, -1).normalize(), V(0.1 * sgn, -1, 0.1).normalize());
        if (h.phase === 'hover') { out.palm = above; out.quat = palmDown; out.pose = POSES.open; }
        else if (h.phase === 'reach') {
          out.palm = grasp; out.quat = palmDown; out.pose = POSES.open;
          if (cur.distanceTo(grasp) < 0.015 || this.t - h.t0 > 1.2) { h.phase = 'grab'; h.t0 = this.t; }
        } else if (h.phase === 'grab') {
          out.palm = grasp; out.quat = palmDown; out.pose = POSES.grab;
          if (this.t - h.t0 > 0.22 && !h.held) this._attach(h, item);
          if (this.t - h.t0 > 0.3) { h.phase = 'hold'; h.t0 = this.t; this.onAction(item); }
        } else if (h.phase === 'hold') {
          out.palm = this.anchor.clone().add(this.lean.x).add(V(0.2 * sgn, 0.02, -0.3));  // held up, off to the side
          out.quat = rig.handWorldQuat(s, V(-0.6 * sgn, 0.35, -0.6).normalize(), V(-0.4 * sgn, 0.3, 0.8).normalize());
          out.pose = POSES.grab;
        } else if (h.phase === 'return') {
          out.palm = h.graspRest ?? grasp; out.quat = palmDown; out.pose = POSES.grab;
          if (cur.distanceTo(out.palm) < 0.015 || this.t - h.t0 > 1.6) { this._detach(h); h.phase = 'release'; h.t0 = this.t; }
        } else if (h.phase === 'release') {
          out.palm = above; out.quat = palmDown; out.pose = POSES.open;
          if (this.t - h.t0 > 0.25) { h.phase = 'hover'; }
        }
      }
    }
    // arc: lift the hand while it travels so it never drags through the desk
    const travel = cur.distanceTo(out.palm);
    if (!out.exact) out.palm = out.palm.clone().add(V(0, 0.07 * smooth(0.02, 0.25, travel), 0));
    out.palm.y = Math.max(out.palm.y, DESK_Y + 0.03);
    return out;
  }

  _attach(h, item) {
    const obj = item.mesh;
    h.held = { obj, parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() };
    h.graspRest = h.palm.x.clone();
    this.rig.b('hand.' + h.side).attach(obj);
  }
  _detach(h) {
    if (!h.held) return;
    const { obj, parent, pos, quat, scale } = h.held;
    parent.attach(obj);                       // keeps its world pose; it settles back below
    obj.scale.copy(scale);
    this.settling.push({ obj, pos, quat });
    h.held = null;
  }

  // Where the hands currently point for the monitor view: used by the screen character.
  isHolding(side) { return !!this.hands[side].held; }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
