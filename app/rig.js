// Procedural control for the lifetime character's rig (Blender metarig export).
// Every frame starts from the rest pose, then layers posture, IK and finger curls,
// so nothing accumulates and every input is continuous.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _qs = new THREE.Quaternion();

const FINGERS = ['thumb', 'f_index', 'f_middle', 'f_ring', 'f_pinky'];
const key = (n) => n.replace(/[.\s]/g, '');

export class Rig {
  constructor(root) {
    this.root = root;
    this.bones = {};
    root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.rest = new Map();
    for (const b of Object.values(this.bones)) this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
    root.updateMatrixWorld(true);
    this.hands = { L: this._handFrame('L'), R: this._handFrame('R') };
  }

  b(name) { const bone = this.bones[key(name)]; if (!bone) throw new Error('missing bone ' + name); return bone; }

  reset() {
    for (const [bone, r] of this.rest) { bone.quaternion.copy(r.q); bone.position.copy(r.p); }
    this.root.updateMatrixWorld(true);
  }

  // ---------- world-space helpers ----------
  rootQuat(out = new THREE.Quaternion()) { return this.root.getWorldQuaternion(out); }
  toWorldDir(vRoot, out = new THREE.Vector3()) { return out.copy(vRoot).applyQuaternion(this.rootQuat(_q3)); }
  toRootDir(vWorld, out = new THREE.Vector3()) { return out.copy(vWorld).applyQuaternion(this.rootQuat(_q3).invert()); }

  setWorldQuat(bone, qWorld) {
    bone.parent.getWorldQuaternion(_qs);
    bone.quaternion.copy(_qs.invert().multiply(qWorld));
    bone.updateMatrixWorld(true);
  }

  rotateWorld(bone, axisWorld, angle) {
    if (!angle) return;
    bone.getWorldQuaternion(_q);
    _q2.setFromAxisAngle(axisWorld, angle);
    this.setWorldQuat(bone, _q2.multiply(_q));
  }

  // Rotate a bone about an axis given in the character's root space.
  rotateRoot(name, axisRoot, angle) {
    if (!angle) return;
    this.rotateWorld(this.b(name), this.toWorldDir(axisRoot, _e).normalize(), angle);
  }

  // ---------- two-bone IK ----------
  twoBone(upper, lower, end, target, pole) {
    const a = upper.getWorldPosition(_a), b = lower.getWorldPosition(_b), c = end.getWorldPosition(_c);
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    _t.subVectors(target, a);
    const dist = THREE.MathUtils.clamp(_t.length(), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    const dir = _t.normalize();
    const bend = _p.subVectors(pole, a); bend.addScaledVector(dir, -bend.dot(dir));
    if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0); bend.normalize();
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = _d.copy(a).addScaledVector(dir, l1 * cosA).addScaledVector(bend, l1 * sinA);
    // aim upper at elbow
    _q.setFromUnitVectors(_e.subVectors(b, a).normalize(), _p.subVectors(elbow, a).normalize());
    upper.getWorldQuaternion(_q2); this.setWorldQuat(upper, _q.multiply(_q2));
    // aim lower at the (reach-clamped) target
    lower.getWorldPosition(_b); end.getWorldPosition(_c);
    const goal = _p.copy(a).addScaledVector(dir, dist);
    _q.setFromUnitVectors(_e.subVectors(_c, _b).normalize(), goal.sub(_b).normalize());
    lower.getWorldQuaternion(_q2); this.setWorldQuat(lower, _q.multiply(_q2));
  }

  armIK(side, wristWorld, poleWorld) {
    this.twoBone(this.b('upper_arm.' + side), this.b('forearm.' + side), this.b('hand.' + side), wristWorld, poleWorld);
  }
  legIK(side, ankleWorld, poleWorld) {
    this.twoBone(this.b('thigh.' + side), this.b('shin.' + side), this.b('foot.' + side), ankleWorld, poleWorld);
  }

  // ---------- hands ----------
  // Rest frame of a hand in root space: finger direction, palm normal, palm centre.
  _handFrame(side) {
    const hand = this.b('hand.' + side);
    const rootInv = this.rootQuat(new THREE.Quaternion()).invert();
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const knuckle = this.b('f_middle.01.' + side).getWorldPosition(new THREE.Vector3());
    const index = this.b('f_index.01.' + side).getWorldPosition(new THREE.Vector3());
    const pinky = this.b('f_pinky.01.' + side).getWorldPosition(new THREE.Vector3());
    const f = knuckle.clone().sub(wrist).applyQuaternion(rootInv).normalize();
    const across = index.clone().sub(pinky).applyQuaternion(rootInv).normalize();
    let n = new THREE.Vector3().crossVectors(f, across).normalize();
    if (n.y > 0) n.negate();                          // T-pose palms face down
    const basis = basisQuat(f, n);
    const handQ = hand.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv);
    const palmW = wrist.clone().lerp(knuckle, 0.55).add(n.clone().applyQuaternion(this.rootQuat(new THREE.Quaternion())).multiplyScalar(0.02));
    const palmLocal = palmW.sub(wrist).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()).invert());
    const fingers = {};
    const nW = this.toWorldDir(n, new THREE.Vector3());
    for (const fn of FINGERS) {
      fingers[fn] = [1, 2, 3].map((i) => {
        const bone = this.b(`${fn}.0${i}.${side}`);
        const bq = bone.getWorldQuaternion(new THREE.Quaternion());
        const dirW = new THREE.Vector3(0, 1, 0).applyQuaternion(bq);
        const axisW = new THREE.Vector3().crossVectors(dirW, nW).normalize();
        return { bone, rest: this.rest.get(bone).q.clone(), axis: axisW.applyQuaternion(bq.clone().invert()).normalize() };
      });
    }
    const spread = {};
    for (let i = 1; i <= 4; i++) {
      const bone = this.b(`palm.0${i}.${side}`);
      const bq = bone.getWorldQuaternion(new THREE.Quaternion());
      spread[i] = { bone, rest: this.rest.get(bone).q.clone(), axis: nW.clone().applyQuaternion(bq.invert()).normalize() };
    }
    const restRel = hand.quaternion.clone();
    return { basis, handQ, palmLocal, fingers, spread, restRel, n0: n, f0: f };
  }

  // World rotation that gives the hand a finger direction and palm normal (world vectors).
  handWorldQuat(side, fingerDirW, palmNormalW, out = new THREE.Quaternion()) {
    const H = this.hands[side];
    const f = this.toRootDir(fingerDirW, new THREE.Vector3()).normalize();
    const n = this.toRootDir(palmNormalW, new THREE.Vector3()).normalize();
    const want = basisQuat(f, n);
    out.copy(want).multiply(_q.copy(H.basis).invert()).multiply(H.handQ); // root space
    return out.premultiply(this.rootQuat(_q2));
  }

  // Wrist position that puts the palm centre at palmWorld for the given hand rotation.
  wristFor(side, palmWorld, handWorldQ, out = new THREE.Vector3()) {
    return out.copy(this.hands[side].palmLocal).applyQuaternion(handWorldQ).negate().add(palmWorld);
  }

  // Orient the hand, sharing half of the forearm twist with the forearm to avoid a pinched wrist.
  setHand(side, handWorldQ) {
    const hand = this.b('hand.' + side), fore = this.b('forearm.' + side);
    fore.getWorldQuaternion(_q);
    const rel = _q.invert().multiply(handWorldQ).multiply(_q2.copy(this.hands[side].restRel).invert());
    const twist = _q3.set(0, rel.y, 0, rel.w).normalize();
    fore.quaternion.multiply(_q.identity().slerp(twist, 0.5));
    fore.updateMatrixWorld(true);
    this.setWorldQuat(hand, handWorldQ);
  }

  // pose: { thumb:[a,b,c], f_index:[...], ..., spread: s } angles in radians
  setFingers(side, pose) {
    const H = this.hands[side];
    for (const fn of FINGERS) {
      const angles = pose[fn]; if (!angles) continue;
      H.fingers[fn].forEach((j, i) => { j.bone.quaternion.copy(j.rest).multiply(_q.setFromAxisAngle(j.axis, angles[i])); });
    }
    const s = pose.spread || 0;
    const k = { 1: -1.1, 2: -0.35, 3: 0.35, 4: 1.1 };
    for (let i = 1; i <= 4; i++) {
      const sp = H.spread[i];
      sp.bone.quaternion.copy(sp.rest).multiply(_q.setFromAxisAngle(sp.axis, s * k[i] * (side === 'L' ? 1 : -1)));
    }
    this.b('hand.' + side).updateMatrixWorld(true);
  }

  palmWorld(side, out = new THREE.Vector3()) {
    const hand = this.b('hand.' + side);
    return out.copy(this.hands[side].palmLocal).applyQuaternion(hand.getWorldQuaternion(_q)).add(hand.getWorldPosition(_a));
  }
  fingertipWorld(side, finger = 'f_index', out = new THREE.Vector3()) {
    const bone = this.b(`${finger}.03.${side}`);
    bone.getWorldPosition(out);
    return out.add(_a.set(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(_q)).multiplyScalar(0.03));
  }
}

function basisQuat(f, n) {
  const x = f.clone().normalize();
  const y = n.clone().addScaledVector(x, -n.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
}

// Finger poses (curl radians per joint, spread factor). Blended by the caller.
export const POSES = {
  relaxed: { thumb: [0.15, 0.25, 0.2], f_index: [0.3, 0.4, 0.25], f_middle: [0.35, 0.45, 0.3], f_ring: [0.4, 0.5, 0.3], f_pinky: [0.45, 0.55, 0.35], spread: 0.05 },
  flat:    { thumb: [0.1, 0.05, 0.0], f_index: [0.03, 0.03, 0.02], f_middle: [0.03, 0.03, 0.02], f_ring: [0.04, 0.04, 0.03], f_pinky: [0.05, 0.05, 0.03], spread: 0.25 },
  grip:    { thumb: [0.35, 0.25, 0.15], f_index: [0.25, 0.35, 0.25], f_middle: [0.3, 0.4, 0.3], f_ring: [0.55, 0.6, 0.4], f_pinky: [0.65, 0.7, 0.45], spread: 0.02 },
  point:   { thumb: [0.55, 0.5, 0.35], f_index: [0.05, 0.08, 0.05], f_middle: [1.25, 1.35, 0.9], f_ring: [1.3, 1.4, 0.9], f_pinky: [1.3, 1.4, 0.9], spread: 0.0 },
  open:    { thumb: [-0.05, 0.05, 0.05], f_index: [0.05, 0.1, 0.1], f_middle: [0.08, 0.12, 0.1], f_ring: [0.1, 0.15, 0.1], f_pinky: [0.12, 0.15, 0.12], spread: 0.3 },
  grab:    { thumb: [0.6, 0.55, 0.45], f_index: [0.95, 1.1, 0.8], f_middle: [1.0, 1.15, 0.85], f_ring: [1.05, 1.2, 0.85], f_pinky: [1.1, 1.2, 0.9], spread: -0.05 },
  type:    { thumb: [0.2, 0.2, 0.1], f_index: [0.55, 0.65, 0.4], f_middle: [0.55, 0.7, 0.45], f_ring: [0.6, 0.7, 0.45], f_pinky: [0.6, 0.7, 0.45], spread: 0.08 },
};

// Continuously blended finger pose: each joint angle follows its target with a spring.
export class FingerBlend {
  constructor(pose = POSES.relaxed, hz = 5) {
    this.hz = hz;
    this.cur = clonePose(pose); this.vel = zeroPose();
  }
  update(target, dt) {
    const w = 2 * Math.PI * this.hz, e = Math.exp(-w * dt);
    for (const fn of FINGERS) for (let i = 0; i < 3; i++) {
      const x0 = this.cur[fn][i] - target[fn][i], k = this.vel[fn][i] + w * x0;
      this.cur[fn][i] = target[fn][i] + (x0 + k * dt) * e; this.vel[fn][i] = (this.vel[fn][i] - w * k * dt) * e;
    }
    const x0 = this.cur.spread - target.spread, k = this.vel.spread + w * x0;
    this.cur.spread = target.spread + (x0 + k * dt) * e; this.vel.spread = (this.vel.spread - w * k * dt) * e;
    return this.cur;
  }
}

export function mixPose(a, b, t) {
  const o = {};
  for (const fn of FINGERS) o[fn] = a[fn].map((v, i) => v + (b[fn][i] - v) * t);
  o.spread = a.spread + (b.spread - a.spread) * t;
  return o;
}
function clonePose(p) { const o = {}; for (const fn of FINGERS) o[fn] = p[fn].slice(); o.spread = p.spread; return o; }
function zeroPose() { const o = {}; for (const fn of FINGERS) o[fn] = [0, 0, 0]; o.spread = 0; return o; }
