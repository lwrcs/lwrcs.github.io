// The character living inside VIEW.EXE: presses his hands against the glass toward the
// cursor, follows it with his head, and idles when nobody is around.
import * as THREE from 'three';
import { applyCharacterMaterials, hullMaterial, pixelUniform } from './halftone.js';
import { Rig, POSES, FingerBlend, mixPose } from './rig.js';
import { Spring, Spring3, QuatFollow, noise1 } from './springs.js';

const GLASS = 0.5;          // glass plane (z) in character space
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class InnerView {
  constructor(canvas, characterScene, { pixelCss = 2, background = 0x000000, handScale = 1.5, fingerLength = 1.45 } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
    this.renderer.setClearColor(background, 1);
    this.pixel = pixelUniform(pixelCss);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 20);
    // framing: close to the glass so the pressed hands loom over the body behind them
    this.view = { camY: 1.78, camZ: 0.92, lookY: 1.64, halfW: 0.36, minHalfH: 0.3 };

    // Lighting tuned so the four dither bands all show on the torso.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.05));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-3, 2.5, 2.5); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(3, 1, -1); this.scene.add(fill);

    this.char = characterScene;
    applyCharacterMaterials(this.char, this.pixel, { gain: 3.0 });
    this.char.traverse((o) => {
      if (o.isSkinnedMesh && o.parent && /head/i.test(o.parent.name + o.name) && !o.userData.hull) {
        const hull = new THREE.SkinnedMesh(o.geometry, hullMaterial(0.012));
        hull.bind(o.skeleton, o.bindMatrix); hull.userData.hull = true; hull.frustumCulled = false;
        o.parent.add(hull);
      }
    });
    this.scene.add(this.char);
    this.rig = new Rig(this.char);
    this.rig.setHandScale(handScale);
    this.rig.setFingerLength(fingerLength);

    // planted feet
    this.feet = { L: this.rig.b('foot.L').getWorldPosition(new THREE.Vector3()), R: this.rig.b('foot.R').getWorldPosition(new THREE.Vector3()) };
    this.footQ = { L: this.rig.b('foot.L').getWorldQuaternion(new THREE.Quaternion()), R: this.rig.b('foot.R').getWorldQuaternion(new THREE.Quaternion()) };

    // state
    this.pointer = new THREE.Vector2(0, 0.2);
    this.lastMove = -10;
    this.clock = 0;
    this.aim = new Spring3(V(0, 1.7, GLASS), 2.2);
    this.engage = new Spring(0, 0.9);
    this.nearFace = new Spring(0, 1.2);
    this.lean = new Spring(0, 1.5);
    this.knock = { L: new Spring(0, 4), R: new Spring(0, 4) };
    this.palm = { L: new Spring3(V(0.33, 1.0, 0.1), 2.6), R: new Spring3(V(-0.33, 1.0, 0.1), 2.6) };
    this.glassW = { L: new Spring(0, 2.2), R: new Spring(0, 2.2) };
    this.handQ = { L: new QuatFollow(undefined, 3.5), R: new QuatFollow(undefined, 3.5) };
    this.fingers = { L: new FingerBlend(POSES.relaxed, 4), R: new FingerBlend(POSES.relaxed, 4) };
    this.look = new Spring3(V(0, 1.7, 2), 2.8);
    this.handQ.L.snap(this._hangQuat('L')); this.handQ.R.snap(this._hangQuat('R'));

    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -GLASS);
    this.resize();
  }

  // displayScale: how much the page shrinks the canvas on screen (the CRT homography), so the
  // backing store matches real device pixels and the dither stays one cell per 2 screen pixels.
  resize(displayScale = this.displayScale || 1) {
    this.displayScale = displayScale;
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 400;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr * displayScale);
    this.renderer.setSize(w, h, false);
    this.pixel.value = 2 * dpr;
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Keep ~1.1 units of glass across, but never crop the head in landscape.
    const { camY, camZ, lookY, halfW, minHalfH } = this.view, dist = camZ - GLASS;
    const halfH = Math.max(halfW / aspect, minHalfH);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfH / dist));
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, camY, camZ);
    this.camera.lookAt(0, lookY, 0);
  }

  // Pointer in the canvas' normalised device coords. Values past +-1 are fine: he reaches toward them.
  setPointerNDC(x, y, moved = true) {
    this.pointer.set(x, y);
    if (moved) this.lastMove = this.clock;
  }
  setPointerClient(cx, cy, moved = true) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.setPointerNDC(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), moved);
  }
  poke() {
    const side = this.aim.x.x >= 0 ? 'L' : 'R';
    this.knock[side].v -= 2.2;           // palm pulls back, then taps the glass
    this.lastMove = this.clock;
  }

  _glassPoint(out) {
    this._ray.setFromCamera(this.pointer, this.camera);
    if (!this._ray.ray.intersectPlane(this._plane, out)) out.set(0, 1.6, GLASS);
    out.x = THREE.MathUtils.clamp(out.x, -1.4, 1.4);
    out.y = THREE.MathUtils.clamp(out.y, 0.7, 2.5);
    return out;
  }

  _hangQuat(side) {
    const s = side === 'L' ? 1 : -1;
    return this.rig.handWorldQuat(side, V(0.08 * s, -1, 0.05), V(-s, 0, 0.1));
  }
  _glassQuat(side, palm) {
    const s = side === 'L' ? 1 : -1;
    // fingers up and a little outward, palm facing the glass; tilt more as the hand goes low
    const up = V(0.35 * s + (palm.x - s * 0.3) * 0.4, 1, 0.05).normalize();
    return this.rig.handWorldQuat(side, up, V(0, 0, 1));
  }

  update(dt, t) {
    dt = Math.min(dt, 0.05);
    this.clock = t;
    const rig = this.rig;
    const idleFor = t - this.lastMove;
    const engaged = idleFor < 4 ? 1 : 0;
    const e = this.engage.update(engaged, dt);

    const gp = this._glassPoint(new THREE.Vector3());
    // idle: attention drifts around on its own
    const drift = V(noise1(t * 0.23, 1) * 0.5, 1.65 + noise1(t * 0.19, 2) * 0.25, GLASS);
    const aimTarget = gp.clone().lerp(drift, 1 - e);
    const aim = this.aim.update(aimTarget, dt);
    const onScreen = Math.abs(this.pointer.x) < 1 && Math.abs(this.pointer.y) < 1 ? 1 : 0;
    const face = this.nearFace.update(onScreen * e * smooth(0.55, 0.1, Math.hypot(aim.x, aim.y - 1.75)), dt);

    const wL = e * smooth(-0.05, 0.22, aim.x);          // cursor on screen-right: his left hand
    const wR = e * smooth(0.05, -0.22, aim.x);          // cursor on screen-left: his right hand
    const wC = e * (1 - wL - wR);                        // centre: both hands up on the glass

    rig.reset();
    const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

    // ---- hips and spine ----
    const breathe = Math.sin(t * 1.35) * 0.5 + 0.5;
    const spine = rig.b('spine');
    const hipShift = (-wL + wR) * 0.045 + noise1(t * 0.3, 3) * 0.015 * (1 - e);
    spine.position.x += hipShift;
    spine.position.y -= 0.015 * wR + 0.01 * face;
    rig.rotateRoot('spine', Y, (wL - wR) * 0.12 + noise1(t * 0.2, 4) * 0.05 * (1 - e));
    const lean = this.lean.update(0.06 * e + 0.1 * face + 0.05 * wR, dt);
    rig.rotateRoot('spine.002', X, lean * 0.5 + breathe * 0.01);
    rig.rotateRoot('spine.003', X, lean * 0.6 - breathe * 0.015);
    rig.rotateRoot('spine.002', Z, (wR * 0.07 - wL * 0.1));                 // asymmetric side bend
    rig.rotateRoot('spine.003', Y, Math.atan2(aim.x, 1.4) * 0.35 * e);

    // ---- planted feet ----
    for (const s of ['L', 'R']) {
      const thigh = rig.b('thigh.' + s).getWorldPosition(new THREE.Vector3());
      rig.legIK(s, this.feet[s], thigh.add(V(0, 0, 1)));
      rig.setWorldQuat(rig.b('foot.' + s), this.footQ[s]);
    }

    // ---- arms ----
    const reach = aim.clone(); reach.z = GLASS;
    const targets = {
      L: [
        [V(0.33, 1.0, 0.1), 1 - e, 0],                         // idle, hanging
        [reach, wL, 1],                                         // reaching toward the cursor
        [V(0.3, 1.98, GLASS), wC, 1],                           // centre: both hands up
        [V(0.2, 1.42, GLASS), wR, 1],                           // bracing low while the right hand reaches
      ],
      R: [
        [V(-0.33, 1.0, 0.1), 1 - e, 0],
        [reach, wR, 1],
        [V(-0.31, 1.92, GLASS), wC, 1],
        [V(-0.3, 1.02, 0.14), wL, 0],                           // drops off the glass when the left reaches
      ],
    };
    for (const s of ['L', 'R']) {
      const sgn = s === 'L' ? 1 : -1;
      let tw = 0, glass = 0; const p = V(0, 0, 0);
      for (const [pos, w, g] of targets[s]) { p.addScaledVector(pos, w); tw += w; glass += g * w; }
      p.divideScalar(tw || 1); glass /= tw || 1;
      // keep glass contacts reachable: limit distance from shoulder
      const shoulder = rig.b('upper_arm.' + s).getWorldPosition(new THREE.Vector3());
      const off = p.clone().sub(shoulder); const maxR = 0.66;
      if (off.length() > maxR) p.copy(shoulder).addScaledVector(off.normalize(), maxR);
      if (glass > 0.5) p.z = Math.min(p.z, GLASS - 0.012);
      const kz = this.knock[s].update(0, dt);
      p.z += kz * 0.06;

      const palm = this.palm[s].update(p, dt);
      const gw = this.glassW[s].update(glass, dt);
      const qGlass = this._glassQuat(s, palm), qHang = this._hangQuat(s);
      const q = this.handQ[s].update(qHang.clone().slerp(qGlass, gw), dt);
      const wrist = rig.wristFor(s, palm, q, new THREE.Vector3());
      const pole = shoulder.clone().add(V(0.55 * sgn, -0.7, -0.35 + gw * 0.1));
      rig.armIK(s, wrist, pole);
      rig.setHand(s, q);
      const pose = mixPose(POSES.relaxed, POSES.flat, gw);
      rig.setFingers(s, this.fingers[s].update(pose, dt));
    }

    // ---- head ----
    const lookT = aim.clone(); lookT.z = GLASS + 1.2 * e + 0.6;
    const look = this.look.update(lookT, dt);
    const head = rig.b('spine.006').getWorldPosition(new THREE.Vector3()).add(V(0, 0.12, 0));
    const d = look.clone().sub(head);
    const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.1, 1.1);
    const pitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.55);
    const tilt = (wL - wR) * 0.12 + noise1(t * 0.4, 7) * 0.04;
    for (const [bone, k] of [['spine.004', 0.2], ['spine.005', 0.3], ['spine.006', 0.5]]) {
      rig.rotateRoot(bone, Y, yaw * k);
      rig.rotateRoot(bone, X, -pitch * k);
      rig.rotateRoot(bone, Z, -tilt * k);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
