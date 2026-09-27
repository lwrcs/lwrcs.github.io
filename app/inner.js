// The character living inside VIEW.EXE. The window is a pane of glass with a small room
// behind it. He paces the back of the room, drifting toward wherever the cursor is; when the
// cursor comes onto the window he walks up to the glass and plants a hand on it under the cursor.
// Walk and idle are Mixamo clips retargeted onto his rig (assets/models/lifetime-moves.json);
// head tracking, leaning and the hand on the glass are layered on top every frame.
import * as THREE from 'three';
import { applyCharacterMaterials, hullMaterial, pixelUniform, blueU, INK, BAYER_GLSL } from './halftone.js';
import { Rig, POSES, FingerBlend, mixPose } from './rig.js';
import { Spring, Spring3, QuatFollow, noise1 } from './springs.js';

// Camera: an eye in front of the glass (z = 0) looking straight in. The window is exactly the
// glass, so a cursor on the window is a point on the glass. Slopes are dy per unit of distance.
const EYE_Y = 2.0, EYE_D = 1.25, TOP = 0.2, BOTTOM = -0.76;
const PACE_Z = -1.6, PRESS_Z = -0.42, BACK_Z = -3.2;
const CLIP_SPEED = 1.59;       // stride speed of the walk clip at timeScale 1, measured when baking
const WALK = 1.05;             // his walking speed
const REACH = 0.63;            // shoulder to palm centre, elbow slightly bent
const CONTACT = -0.012;        // palm centre z when pressed flat on the glass

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

export class InnerView {
  constructor(canvas, characterScene, { moves = null, pixelCss = 2 } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 1);
    this.pixel = pixelUniform(pixelCss);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 30);
    this.camera.position.set(0, EYE_Y, EYE_D);
    this.camera.updateMatrixWorld(true);

    // Lighting tuned so the four dither bands all show on the torso.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.05));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-3, 3, 3); this.scene.add(key);
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

    this.room = buildInterior(this.pixel);
    this.scene.add(this.room.group);
    this.prints = new Prints(this.pixel, this.scene);

    // ---- clips ----
    this.mixer = new THREE.AnimationMixer(this.char);
    this.act = {};
    const clips = {};
    for (const [name, m] of Object.entries(moves || {})) clips[name] = THREE.AnimationClip.parse({ name, duration: m.duration, tracks: m.tracks, uuid: THREE.MathUtils.generateUUID() });
    for (const name of ['idle', 'walk']) {
      if (!clips[name]) continue;
      const a = this.mixer.clipAction(clips[name]);
      a.play(); a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      this.act[name] = a;
    }
    // gestures play additively on the upper body only, so they mix with walking or pressing
    for (const name of ['agree', 'headShake']) {
      if (!clips[name]) continue;
      const upper = clips[name].tracks.filter((t) => !/^(spine|thigh[LR]|shin[LR]|foot[LR]|toe[LR])\./.test(t.name));
      const clip = THREE.AnimationUtils.makeClipAdditive(new THREE.AnimationClip(name, clips[name].duration, upper));
      const a = this.mixer.clipAction(clip);
      a.blendMode = THREE.AdditiveAnimationBlendMode;
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
      this.act[name] = a;
    }
    this.gest = null;

    // ---- state ----
    this.pointer = new THREE.Vector2(0, 0);
    this.lastMove = -10;
    this.clock = 0;
    this.pos = new THREE.Vector2(0.3, PACE_Z);           // x, z on the floor
    this.heading = 0;                                     // 0 faces the glass
    this.speed = new Spring(0, 1.4);
    this.turn = new Spring(0, 2.2);
    this.target = new THREE.Vector2(0.3, PACE_Z);
    this.dir = 1; this.pause = 1.2; this.standX = null;
    this.mode = 'pace';
    this.side = 'L';
    this.pressW = new Spring(0, 1.1);
    this.crouch = new Spring(0, 1.2);
    this.lean = new Spring(0, 1.2);
    this.lookW = new Spring(0, 1.0);
    this.look = new Spring3(V(0, 1.9, 2), 2.4);
    this.hand = {};
    for (const s of ['L', 'R']) {
      this.hand[s] = {
        w: new Spring(0, 1.6), palm: new Spring3(V(0, 1, 0), 2.8), q: new QuatFollow(undefined, 4),
        fingers: new FingerBlend(POSES.relaxed, 4), plant: null, pressed: false, knock: new Spring(0, 4),
      };
    }

    this._ray = new THREE.Raycaster();
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
    // off-axis frustum: the window shows a fixed band of heights, and as much width as it has room for
    this.hs = ((TOP - BOTTOM) / 2) * (w / h);
    const n = this.camera.near;
    this.camera.projectionMatrix.makePerspective(-this.hs * n, this.hs * n, TOP * n, BOTTOM * n, n, this.camera.far);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  // visible half-width of the room at depth z
  _halfW(z) { return this.hs * (EYE_D - z); }

  // Pointer in the canvas' normalised device coords. Values past +-1 are fine: he looks toward them.
  setPointerNDC(x, y, moved = true) {
    this.pointer.set(x, y);
    if (moved) this.lastMove = this.clock;
  }
  setPointerClient(cx, cy, moved = true) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.setPointerNDC(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1), moved);
  }

  // A click on the window: knock on the glass if a hand is on it, otherwise shake his head.
  poke() {
    this.lastMove = this.clock;
    const h = this.hand[this.side];
    if (this.mode === 'press' && h.w.x > 0.6) h.knock.v -= 2.4;
    else this.gesture('headShake');
  }
  gesture(name) {
    const a = this.act[name];
    if (!a || (this.gest && this.gest.t < this.gest.a.getClip().duration * 0.7)) return;
    if (this.gest) this.gest.a.stop();
    a.reset().play(); a.setEffectiveWeight(0);
    this.gest = { a, t: 0 };
  }

  // where the pointer's ray meets the plane z = const
  _pointerAt(z, out = new THREE.Vector3()) {
    this._ray.setFromCamera(this.pointer, this.camera);
    const r = this._ray.ray, t = (z - r.origin.z) / (r.direction.z || -1e-6);
    return out.copy(r.origin).addScaledVector(r.direction, Math.max(0, t));
  }

  _glassQuat(side, palm, body) {
    const s = side === 'L' ? 1 : -1;
    // fingers up and a little outward, palm flat on the glass; tilt more toward the edges
    const up = V(0.3 * s + (palm.x - body.x - s * 0.25) * 0.5, 1, 0).normalize();
    return this.rig.handWorldQuat(side, up, V(0, 0, 1));
  }

  // ---------------------------------------------------------------- behaviour
  _decide(dt, t, active, inWin, gp) {
    const was = this.mode;
    this.mode = active && inWin ? 'press' : 'pace';
    let face = 0;
    if (this.mode === 'press') {
      // stand so the cursor is within easy reach; only move again when it leaves that reach
      const lim = this._halfW(PRESS_Z) - 0.22;
      // stand beside the cursor so it sits in front of one shoulder, not in front of his face
      const off = (x) => gp.x - (this.side === 'L' ? 0.28 : -0.28) - x;
      if (was !== 'press' || this.standX == null || Math.abs(off(this.standX)) > 0.3) {
        this.side = this.pos.x < gp.x ? 'L' : 'R';
        this.standX = clamp(gp.x - (this.side === 'L' ? 0.28 : -0.28), -lim, lim);
      }
      this.target.set(this.standX, PRESS_Z);
      this.pause = 0;
    } else {
      this.standX = null;
      const lim = Math.max(0.2, this._halfW(PACE_Z) - 0.35);
      const mx = active ? clamp(this._pointerAt(PACE_Z).x, -lim, lim) : null;
      const centre = mx ?? 0, half = mx == null ? lim : Math.min(0.28, lim);
      if (was === 'press') { this.dir = this.pos.x < centre ? 1 : -1; this.pause = 0; }
      this.target.set(clamp(centre + this.dir * half, -lim, lim), PACE_Z);
      const d = this.pos.distanceTo(this.target);
      if (this.pause > 0) {
        this.pause -= dt;
        this.target.copy(this.pos);
        face = mx == null ? noise1(t * 0.1, 9) * 0.5 : Math.atan2(mx - this.pos.x, EYE_D - PACE_Z) * 0.8;
      } else if (d < 0.12 && Math.abs(this.pos.y - PACE_Z) < 0.15) {
        this.dir = -this.dir;
        if (!active && Math.random() < 0.4) this.pause = 1.5 + Math.random() * 2.5;
      }
    }
    return face;
  }

  _locomote(dt, face) {
    const to = new THREE.Vector2().subVectors(this.target, this.pos);
    const dist = to.length();
    let want = face, vWant = 0;
    if (dist > 0.05) { want = Math.atan2(to.x, to.y); vWant = WALK * smooth(0.02, 0.45, dist); }
    const dAng = wrap(want - this.heading);
    vWant *= Math.max(0, Math.cos(dAng)) ** 3;                // slow right down to turn
    const w = this.turn.update(clamp(dAng * 3.5, -2.6, 2.6), dt);
    this.heading = wrap(this.heading + w * dt);
    const v = Math.max(0, this.speed.update(vWant, dt));
    this.pos.x += Math.sin(this.heading) * v * dt;
    this.pos.y += Math.cos(this.heading) * v * dt;
    this.pos.y = Math.min(this.pos.y, PRESS_Z);              // never walk into the glass
    return { v, w, dist, dAng };
  }

  _animate(dt, v, w) {
    const { idle, walk } = this.act;
    if (idle && walk) {
      const step = smooth(0.3, 1.8, Math.abs(w)) * 0.55;      // shuffling feet while turning on the spot
      const ww = Math.max(smooth(0, WALK * 0.45, v), step);
      walk.setEffectiveWeight(ww); idle.setEffectiveWeight(1 - ww);
      walk.timeScale = Math.max(v / CLIP_SPEED, step * 0.5);
    }
    if (this.gest) {
      const g = this.gest, dur = g.a.getClip().duration;
      g.t += dt;
      g.a.setEffectiveWeight(smooth(0, 0.2, g.t) * smooth(dur, dur - 0.3, g.t));
      if (g.t > dur) { g.a.stop(); this.gest = null; }
    }
    this.mixer.update(dt);
  }

  update(dt, t) {
    dt = Math.min(dt, 0.05);
    this.clock = t;
    const rig = this.rig;
    const active = t - this.lastMove < 5;
    const inWin = Math.abs(this.pointer.x) <= 1 && Math.abs(this.pointer.y) <= 1;
    const gp = this._pointerAt(0);                            // cursor on the glass

    const face = this._decide(dt, t, active, inWin, gp);
    const { v, w, dist, dAng } = this._locomote(dt, face);

    // ---- base pose: clips ----
    rig.reset();
    this.char.position.set(this.pos.x, 0, this.pos.y);
    this.char.rotation.set(0, this.heading, 0);
    this.char.updateMatrixWorld(true);
    this._animate(dt, v, w);
    this.char.updateMatrixWorld(true);

    const atGlass = this.mode === 'press' && dist < 0.1 && Math.abs(dAng) < 0.35 && v < 0.2;
    const pw = this.pressW.update(atGlass ? 1 : 0, dt);
    const body = V(this.pos.x, 0, this.pos.y);

    // which hand: chosen when he picks where to stand; switch only if the cursor crosses his body
    if (gp.x > body.x + 0.12) this.side = 'L'; else if (gp.x < body.x - 0.12) this.side = 'R';
    const main = this.side, other = main === 'L' ? 'R' : 'L';

    // ---- crouch for low targets (feet stay where the clip put them) ----
    const shY = rig.b('upper_arm.L').getWorldPosition(new THREE.Vector3()).y;
    const cr = this.crouch.update(pw * clamp(shY - 0.42 - gp.y, 0, 0.2), dt);
    if (cr > 0.002) {
      const feet = {};
      for (const s of ['L', 'R']) { const f = rig.b('foot.' + s); feet[s] = { p: f.getWorldPosition(new THREE.Vector3()), q: f.getWorldQuaternion(new THREE.Quaternion()) }; }
      this.char.position.y -= cr; this.char.updateMatrixWorld(true);
      for (const s of ['L', 'R']) {
        const knee = rig.b('thigh.' + s).getWorldPosition(new THREE.Vector3()).add(rig.toWorldDir(V(0, 0, 1)));
        rig.legIK(s, feet[s].p, knee);
        rig.setWorldQuat(rig.b('foot.' + s), feet[s].q);
      }
    }

    // ---- lean into the glass, bend toward the reaching hand ----
    const sgn = main === 'L' ? 1 : -1;
    const reachX = clamp((gp.x - body.x) * sgn - 0.2, 0, 0.3);
    const ln = this.lean.update(pw * (0.07 + reachX * 0.25), dt);
    rig.rotateRoot('spine.001', X, ln * 0.5);
    rig.rotateRoot('spine.002', X, ln * 0.5);
    rig.rotateRoot('spine.002', Z, -sgn * pw * reachX * 0.35);

    // ---- head: look at the cursor (or where he's going) ----
    const lookT = active ? this._pointerAt(inWin ? 0.6 : 0.9) : V(body.x + Math.sin(this.heading) * 2, 1.85 + noise1(t * 0.2, 5) * 0.2, body.z + Math.cos(this.heading) * 2);
    const look = this.look.update(lookT, dt);
    const lw = this.lookW.update(active ? 1 : 0.5, dt);
    const head = rig.b('spine.006').getWorldPosition(new THREE.Vector3());
    const d = rig.toRootDir(look.clone().sub(head));
    const yaw = clamp(Math.atan2(d.x, d.z), -1.15, 1.15) * lw;
    const pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.5) * lw;
    for (const [bone, k] of [['spine.004', 0.25], ['spine.005', 0.3], ['spine.006', 0.45]]) {
      rig.rotateRoot(bone, Y, yaw * k);
      rig.rotateRoot(bone, X, -pitch * k);
    }

    // ---- hands on the glass ----
    for (const s of ['L', 'R']) {
      const H = this.hand[s], sg = s === 'L' ? 1 : -1;
      const shoulder = rig.b('upper_arm.' + s).getWorldPosition(new THREE.Vector3());
      // the reaching hand goes under the cursor; the right hand braces low while the left reaches
      let goal = null;
      if (s === main) goal = gp.clone();
      else if (s === 'R' && pw > 0.8) goal = V(shoulder.x - 0.12, shoulder.y - 0.32, 0);
      const wTarget = goal ? pw * (s === main ? 1 : 0.9) : 0;
      const hw = H.w.update(wTarget, dt);
      const handBone = rig.b('hand.' + s);
      const animPalm = rig.palmWorld(s, new THREE.Vector3());
      const animQ = handBone.getWorldQuaternion(new THREE.Quaternion());
      if (!goal) { this._leave(H, s); if (hw < 0.01) H.plant = null; }
      else {
        // keep it where he can reach, and only re-plant when the cursor has moved off the hand
        const dz = -shoulder.z;
        const r = Math.sqrt(Math.max(0.01, REACH * REACH - dz * dz));
        const off = new THREE.Vector2(goal.x - shoulder.x, goal.y - shoulder.y);
        if (off.length() > r) off.setLength(r);
        goal.set(shoulder.x + off.x, shoulder.y + off.y, 0);
        if (!H.plant || H.plant.distanceTo(goal) > (s === main ? 0.09 : 0.2)) { this._leave(H, s); H.plant = goal.clone(); }
      }
      if (hw < 0.01) { H.palm.snap(animPalm); H.q.snap(animQ); H.fingers.update(POSES.relaxed, dt); rig.setFingers(s, H.fingers.cur); continue; }
      const plant = H.plant || animPalm;
      const travel = Math.hypot(H.palm.x.x - plant.x, H.palm.x.y - plant.y);
      const lift = smooth(0.005, 0.06, travel);             // off the glass while moving, flat on it when there
      const knock = H.knock.update(0, dt);
      const palmT = plant.clone(); palmT.z = CONTACT - lift * 0.07 + knock * 0.05;
      const palm = H.palm.update(palmT, dt);
      H.pressed = hw > 0.9 && lift < 0.05 && knock > -0.1;
      if (H.pressed) H.stamp = { p: plant.clone(), side: s, roll: 0 };
      const qG = this._glassQuat(s, palm, body);
      const q = H.q.update(animQ.clone().slerp(qG, hw), dt);
      const wristIK = rig.wristFor(s, palm, q, new THREE.Vector3());
      const animWrist = handBone.getWorldPosition(new THREE.Vector3());
      const wrist = animWrist.lerp(wristIK, hw);
      const pole = shoulder.clone().add(rig.toWorldDir(V(0.5 * sg, -0.6, -0.45)));
      rig.armIK(s, wrist, pole);
      rig.setHand(s, q);
      rig.setFingers(s, H.fingers.update(mixPose(POSES.relaxed, POSES.flat, hw), dt));
    }

    this.room.shadow.value.set(body.x, body.z);
    this.prints.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // a hand leaving the glass leaves a palm print behind
  _leave(H, s) {
    if (H.stamp) { this.prints.add(H.stamp.p, s); H.stamp = null; }
  }
}

// ------------------------------------------------------------------ the room behind the glass
// A black box with a dithered grid on the floor and back wall, so depth reads in one colour.
function buildInterior(pixel) {
  const g = new THREE.Group();
  const shadow = { value: new THREE.Vector2(0, -1) };
  const mat = (plane, strength) => new THREE.ShaderMaterial({
    uniforms: { uPixel: pixel, uBlue: blueU, uInk: { value: new THREE.Color(INK) }, uShadow: shadow, uStrength: { value: strength } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uPixel; uniform float uBlue; uniform vec3 uInk; uniform vec2 uShadow; uniform float uStrength;
      varying vec3 vW;
      ${BAYER_GLSL}
      void main() {
        vec2 p = ${plane === 'floor' ? 'vW.xz' : 'vW.xy'} / 0.4;
        vec2 fw = fwidth(p) * uPixel;
        vec2 dl = abs(fract(p - 0.5) - 0.5);
        float line = max(step(dl.x, fw.x * 0.5), step(dl.y, fw.y * 0.5));
        line *= clamp(1.4 - max(fw.x, fw.y) * 2.5, 0.0, 1.0);            // fade where lines crowd together
        float depth = clamp(1.0 + vW.z / 3.4, 0.0, 1.0);
        float I = line * uStrength * (0.3 + 0.7 * depth);
        ${plane === 'floor' ? 'I *= smoothstep(0.22, 0.5, distance(vW.xz, uShadow));' : ''}
        if (I <= bayer4(floor(gl_FragCoord.xy / uPixel))) discard;
        gl_FragColor = vec4(mix(uInk, vec3(0.0, 0.0, 1.0), uBlue), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, -BACK_Z), mat('floor', 0.9));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, BACK_Z / 2);
  const floorBase = new THREE.Mesh(floor.geometry, black); floorBase.rotation.copy(floor.rotation); floorBase.position.copy(floor.position); floorBase.position.y -= 0.001;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), mat('wall', 0.55));
  wall.position.set(0, 2.5, BACK_Z);
  g.add(floorBase, floor, wall);
  return { group: g, shadow };
}

// ------------------------------------------------------------------ palm prints on the glass
function printTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  const blob = (cx, cy, rx, ry, a = 0) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, a, 0, Math.PI * 2); x.fill(); };
  blob(30, 66, 17, 20);                                   // palm
  blob(14, 34, 4.5, 11, -0.15); blob(25, 26, 4.8, 13, -0.05); blob(36, 25, 4.8, 13, 0.05); blob(46, 31, 4.3, 11, 0.15);
  blob(52, 64, 5, 11, 0.7);                               // thumb (right hand, seen from outside)
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

class Prints {
  constructor(pixel, scene) {
    this.tex = printTexture();
    this.pool = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uPixel: pixel, uBlue: blueU, uInk: { value: new THREE.Color(INK) }, uTex: { value: this.tex }, uFade: { value: 0 }, uFlip: { value: 1 } },
        vertexShader: `varying vec2 vUv; uniform float uFlip; void main() { vUv = vec2(uFlip > 0.0 ? uv.x : 1.0 - uv.x, uv.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uPixel; uniform float uBlue; uniform vec3 uInk; uniform sampler2D uTex; uniform float uFade;
          varying vec2 vUv;
          ${BAYER_GLSL}
          void main() {
            float a = texture2D(uTex, vUv).r * uFade * 0.45;
            if (a <= bayer4(floor(gl_FragCoord.xy / uPixel))) discard;
            gl_FragColor = vec4(mix(uInk, vec3(0.0, 0.0, 1.0), uBlue), 1.0);
            #include <colorspace_fragment>
          }`,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.225), m);
      mesh.visible = false; mesh.renderOrder = 2;
      scene.add(mesh);
      this.pool.push({ mesh, m, age: 99 });
    }
  }
  add(p, side) {
    const slot = this.pool.reduce((a, b) => (b.age > a.age ? b : a));
    slot.age = 0; slot.mesh.visible = true;
    slot.mesh.position.set(p.x, p.y + 0.03, -0.002);
    slot.mesh.rotation.z = side === 'L' ? -0.3 : 0.3;
    slot.m.uniforms.uFlip.value = side === 'L' ? -1 : 1;
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      s.m.uniforms.uFade.value = smooth(0, 0.25, s.age) * smooth(7, 1.5, s.age);
      if (s.age > 7) s.mesh.visible = false;
    }
  }
}
