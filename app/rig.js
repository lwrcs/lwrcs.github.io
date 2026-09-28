// Procedural control for the lifetime character's rig (Blender metarig export).
// Every frame starts from the rest pose (or the pose the clips set), then layers posture, IK and finger curls,
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
    // the side each arm bone bends toward at the elbow, in the bone's own frame (see measureElbows)
    this.elbows = { L: { upper: new THREE.Vector3(0, 0, 1), fore: new THREE.Vector3(0, 0, 1) }, R: { upper: new THREE.Vector3(0, 0, 1), fore: new THREE.Vector3(0, 0, 1) } };
  }

  b(name) { const bone = this.bones[key(name)]; if (!bone) throw new Error('missing bone ' + name); return bone; }

  // Back to the rest pose, or, once keepClipPose() has been called, to the pose the clips last set.
  // three.js only writes a track when its value changes, so a key held for a while (or a clip's
  // constant posture) would otherwise be wiped here and never come back.
  reset() { this.restore(this.clip || this.rest); }

  // Call right after the mixer updates, before any procedural layer.
  keepClipPose() { this.clip = this.capture(this.clip); }

  // every bone's local transform, into (or back out of) a Map
  capture(into) {
    into ??= new Map();
    for (const bone of this.rest.keys()) {
      let c = into.get(bone);
      if (!c) into.set(bone, (c = { q: new THREE.Quaternion(), p: new THREE.Vector3() }));
      c.q.copy(bone.quaternion); c.p.copy(bone.position);
    }
    return into;
  }
  restore(from) {
    for (const [bone, c] of from) { bone.quaternion.copy(c.q); bone.position.copy(c.p); }
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

  // Arms bend like an elbow: a hinge, so both bones also keep the roll it gives them (the upper arm
  // turns with the bend, the forearm's twist starts from neutral and the hand shares it, setHand).
  armIK(side, wristWorld, poleWorld) {
    const up = this.b('upper_arm.' + side), fore = this.b('forearm.' + side), E = this.elbows[side];
    const g = this.armFrame(side, wristWorld, poleWorld);
    aimRoll(this, up, g.u, g.B, E.upper);
    aimRoll(this, fore, _t.subVectors(g.reach, fore.getWorldPosition(_p)).normalize(), g.A, E.fore);
    return g;
  }

  // Where the elbow goes for a wrist target and a pole, without moving anything: the elbow, the
  // upper arm's direction u and the side it bends toward B, the forearm's direction f, and A,
  // the side the forearm bends toward (toward the shoulder).
  armFrame(side, wristWorld, poleWorld, shoulder) {
    const a = shoulder || this.b('upper_arm.' + side).getWorldPosition(new THREE.Vector3());
    const L = this._armLen || (this._armLen = {});
    if (!L[side]) {
      const s = this.b('upper_arm.' + side).getWorldPosition(new THREE.Vector3()), e = this.b('forearm.' + side).getWorldPosition(new THREE.Vector3());
      L[side] = [s.distanceTo(e), e.distanceTo(this.b('hand.' + side).getWorldPosition(new THREE.Vector3()))];
    }
    const [l1, l2] = L[side];
    const dir = new THREE.Vector3().subVectors(wristWorld, a);
    const dist = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    dir.normalize();
    const bend = new THREE.Vector3().subVectors(poleWorld, a); bend.addScaledVector(dir, -bend.dot(dir));
    if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0).addScaledVector(dir, -dir.y);
    bend.normalize();
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(bend, l1 * sinA);
    const reach = a.clone().addScaledVector(dir, dist);
    return {
      elbow, reach, bend,
      u: dir.clone().multiplyScalar(cosA).addScaledVector(bend, sinA),
      B: dir.clone().multiplyScalar(sinA).addScaledVector(bend, -cosA),
      f: reach.clone().sub(elbow).normalize(),
      A: bend.clone().multiplyScalar(-(dist - l1 * cosA)).addScaledVector(dir, -l1 * sinA).normalize(),
    };
  }

  // Measure which way the clips bend each elbow, in the bones' own frames. Call once per sampled
  // clip pose, then again with done = true.
  measureElbows(acc, done) {
    for (const side of ['L', 'R']) {
      const a = acc[side] || (acc[side] = { upper: new THREE.Vector3(), fore: new THREE.Vector3() });
      const E = this.elbows[side];
      if (done) {
        for (const k of ['upper', 'fore']) if (a[k].lengthSq() > 1e-6) E[k].copy(a[k].setY(0).normalize());
        continue;
      }
      const up = this.b('upper_arm.' + side), fore = this.b('forearm.' + side);
      const s = up.getWorldPosition(new THREE.Vector3()), e = fore.getWorldPosition(new THREE.Vector3()), w = this.b('hand.' + side).getWorldPosition(new THREE.Vector3());
      const u = e.clone().sub(s).normalize(), f = w.clone().sub(e).normalize();
      const B = w.clone().sub(e); B.addScaledVector(u, -B.dot(u));
      const A = s.clone().sub(e); A.addScaledVector(f, -A.dot(f));
      if (B.length() < 0.03 || A.length() < 0.03) continue;           // too straight to tell
      a.upper.add(B.normalize().applyQuaternion(up.getWorldQuaternion(new THREE.Quaternion()).invert()));
      a.fore.add(A.normalize().applyQuaternion(fore.getWorldQuaternion(new THREE.Quaternion()).invert()));
    }
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
        // how far the modelled hand already bends this joint toward the palm (for the thumb's
        // first joint: how far it dips below the plane of the palm)
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
        const curl = fn === 'thumb' && i === 1 ? Math.asin(THREE.MathUtils.clamp(dirW.dot(nW), -1, 1))
          : Math.atan2(new THREE.Vector3().crossVectors(up, dirW).dot(axisW), up.dot(dirW));
        const inv = bq.clone().invert();
        return { bone, rest: this.rest.get(bone).q.clone(), axis: axisW.applyQuaternion(inv).normalize(), normal: nW.clone().applyQuaternion(inv).normalize(), curl };
      });
    }
    const spread = {};
    for (let i = 1; i <= 4; i++) {
      const bone = this.b(`palm.0${i}.${side}`);
      const bq = bone.getWorldQuaternion(new THREE.Quaternion());
      spread[i] = { bone, rest: this.rest.get(bone).q.clone(), axis: nW.clone().applyQuaternion(bq.invert()).normalize() };
    }
    const restRel = hand.quaternion.clone();
    const handInv = handQ.clone().invert();
    return { basis, handQ, palmLocal, fingers, spread, restRel, n0: n, f0: f, fLocal: f.clone().applyQuaternion(handInv), nLocal: n.clone().applyQuaternion(handInv) };
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

  // How a hand rotation sits on a forearm (direction f, bending toward A), as a real wrist would
  // measure it: twist, the forearm turning the palm away from neutral (thumb toward A), + turning
  // it up toward the elbow's inside (supination); ext, bent back (+) or toward the palm (−); dev,
  // toward the thumb (+) or the little finger (−). Palm normal and fingers come back in p and d.
  wristAngles(side, handWorldQ, f, A, palmNormal) {
    const H = this.hands[side];
    const d = H.fLocal.clone().applyQuaternion(handWorldQ);
    const p = palmNormal ? palmNormal.clone() : H.nLocal.clone().applyQuaternion(handWorldQ);
    const M = new THREE.Vector3().crossVectors(f, A).multiplyScalar(side === 'L' ? 1 : -1);  // neutral palm
    const pf = THREE.MathUtils.clamp(p.dot(f), -1, 1);
    const ext = Math.asin(pf);
    const pt = p.clone().addScaledVector(f, -pf);
    if (pt.lengthSq() < 1e-10) pt.copy(M); pt.normalize();
    const twist = Math.atan2(pt.dot(A), pt.dot(M));
    const tt = A.clone().multiplyScalar(Math.cos(twist)).addScaledVector(M, -Math.sin(twist));
    const d0 = f.clone().multiplyScalar(Math.cos(ext)).addScaledVector(pt, -Math.sin(ext));
    return { twist, ext, dev: Math.atan2(d.dot(tt), d.dot(d0)), M, d, p };
  }

  // wristAngles kept within what a wrist can do: [twist, ext, dev]. A twist past its range goes to
  // whichever limit is nearer round the circle.
  wristLimited(side, handWorldQ, f, A) {
    const w = this.wristAngles(side, handWorldQ, f, A), c = THREE.MathUtils.clamp;
    let t = w.twist;
    if (t > WRIST.supinate || t < -WRIST.pronate) {
      const gap = (x) => Math.abs(Math.atan2(Math.sin(t - x), Math.cos(t - x)));
      t = gap(WRIST.supinate) < gap(-WRIST.pronate) ? WRIST.supinate : -WRIST.pronate;
    }
    return [t, c(w.ext, -WRIST.flex, WRIST.extend), c(w.dev, -WRIST.ulnar, WRIST.radial)];
  }

  // The hand rotation for wrist angles (as wristAngles measures them) on a forearm f bending toward A.
  handFromAngles(side, twist, ext, dev, f, A, out = new THREE.Quaternion()) {
    const M = new THREE.Vector3().crossVectors(f, A).multiplyScalar(side === 'L' ? 1 : -1);
    const pt = M.clone().multiplyScalar(Math.cos(twist)).addScaledVector(A, Math.sin(twist));
    const tt = A.clone().multiplyScalar(Math.cos(twist)).addScaledVector(M, -Math.sin(twist));
    const p = pt.clone().multiplyScalar(Math.cos(ext)).addScaledVector(f, Math.sin(ext));
    const d = f.clone().multiplyScalar(Math.cos(ext)).addScaledVector(pt, -Math.sin(ext)).multiplyScalar(Math.cos(dev)).addScaledVector(tt, Math.sin(dev));
    return this.handWorldQuat(side, d, p, out);
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

  // Turn the fingers from wherever they are now (the clip's pose) toward `pose` by t. Angles are
  // absolute here, whatever curl the hand was modelled with: 0 is each joint straight in line
  // with the one before it, and the thumb's first angle is its tilt out of the plane of the palm.
  // thumbOut swings the thumb away from the index finger within that plane.
  blendFingers(side, pose, t) {
    const H = this.hands[side];
    for (const fn of FINGERS) {
      const angles = pose[fn]; if (!angles) continue;
      H.fingers[fn].forEach((j, i) => {
        _q2.copy(j.rest);
        if (fn === 'thumb' && i === 0 && pose.thumbOut) _q2.multiply(_q.setFromAxisAngle(j.normal, pose.thumbOut * (side === 'L' ? 1 : -1)));
        _q2.multiply(_q.setFromAxisAngle(j.axis, angles[i] - j.curl));
        j.bone.quaternion.slerp(_q2, t);
      });
    }
    const k = { 1: -1.1, 2: -0.35, 3: 0.35, 4: 1.1 };
    for (let i = 1; i <= 4; i++) {
      const sp = H.spread[i];
      _q2.copy(sp.rest).multiply(_q.setFromAxisAngle(sp.axis, -(pose.spread || 0) * k[i] * (side === 'L' ? 1 : -1)));
      sp.bone.quaternion.slerp(_q2, t);
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

// Wrist limits (radians). Twist from neutral (thumb toward the inside of the elbow): 106° turning
// the palm down (pronation), 74° up, 180° in all. Bending: 60° back, 69° toward the palm, 20°
// toward the thumb, 30° toward the little finger.
export const WRIST = { pronate: 1.85, supinate: 1.29, extend: 1.05, flex: 1.2, radial: 0.35, ulnar: 0.52 };

// Point a bone's length (local +Y) along y, turning it about that axis so its local `sideLocal`
// faces `side` (world).
const _mL = new THREE.Matrix4(), _mW = new THREE.Matrix4();
function aimRoll(rig, bone, y, side, sideLocal) {
  const lx = sideLocal, ly = _a.set(0, 1, 0), lz = _b.crossVectors(lx, ly);
  _mL.makeBasis(lx, ly, lz);
  const wx = _c.copy(side).addScaledVector(y, -side.dot(y)).normalize(), wz = _d.crossVectors(wx, y);
  _mW.makeBasis(wx, y, wz);
  _q.setFromRotationMatrix(_mW.multiply(_mL.transpose()));
  rig.setWorldQuat(bone, _q);
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
  // for blendFingers: absolute finger bends, flat against a pane of glass
  glass:   { thumb: [-0.03, 0.05, 0.05], thumbOut: 0.5, f_index: [0.04, 0.06, 0.04], f_middle: [0.04, 0.06, 0.04], f_ring: [0.07, 0.08, 0.05], f_pinky: [0.1, 0.1, 0.06], spread: 0.1 },
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
