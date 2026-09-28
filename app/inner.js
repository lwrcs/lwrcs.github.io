// The character living inside VIEW.EXE. The window is a pane of glass with a small room
// behind it. He paces the back of the room, drifting toward wherever the cursor is; when the
// cursor comes onto the window he walks up to the glass and plants a hand on it under the cursor.
// Walk, idle and the nod/shake gestures are his Blender actions baked into the model (or, for a
// model without them, Mixamo clips retargeted onto his rig in assets/models/lifetime-moves.json);
// head tracking, leaning and the hand on the glass are layered on top every frame.
import * as THREE from 'three';
import { applyCharacterMaterials, hullMaterial, pixelUniform, blueU, INK, BAYER_GLSL } from './halftone.js';
import { Rig, POSES } from './rig.js';
import { Spring, Spring3, QuatFollow, noise1 } from './springs.js';

// Camera: an eye in front of the glass (z = 0) looking straight in. The window is exactly the
// glass, so a cursor on the window is a point on the glass. Slopes are dy per unit of distance.
const EYE_Y = 2.0, EYE_D = 1.25, TOP = 0.2, BOTTOM = -0.76;
const ORTHO_Y = [-0.15, 2.45];  // dev option: a level orthographic camera showing this band of heights
const PACE_Z = -1.6, PRESS_Z = -0.42, BACK_Z = -3.2;
const TURN_AHEAD = 0.3;        // how far short of the end of his pacing line he starts turning back
const REACH = 0.63;            // shoulder to palm centre, elbow slightly bent
const STRETCH = 0.67;          // ... and with the arm straight, reaching for a cursor further out
const HOLD = 1.0;              // with a hand on the glass, how far the cursor can go (across) before he steps over
const LOOK_AHEAD = 0.6;        // with the cursor off the glass, he looks at the point on its line this far in front of him
const CONTACT = -0.012;        // palm centre z when pressed flat on the glass

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

export class InnerView {
  // moves: { idle, walk, nod, shake }, each an AnimationClip or a clip in three's JSON form
  constructor(canvas, characterScene, { moves = null, pixelCss = 2 } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 1);
    this.pixel = pixelUniform(pixelCss);
    this.scene = new THREE.Scene();
    this.camera = this.persp = new THREE.PerspectiveCamera(40, 1, 0.05, 30);
    this.persp.position.set(0, EYE_Y, EYE_D);
    this.persp.updateMatrixWorld(true);
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 30);
    this.orthoCam.position.set(0, (ORTHO_Y[0] + ORTHO_Y[1]) / 2, EYE_D);
    this.orthoCam.updateMatrixWorld(true);
    this.ortho = false;

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
    for (const [name, m] of Object.entries(moves || {})) {
      clips[name] = m instanceof THREE.AnimationClip ? m : THREE.AnimationClip.parse({ name, duration: m.duration, tracks: m.tracks, uuid: THREE.MathUtils.generateUUID() });
    }
    this.clipSpeed = strideSpeed(this.char, clips.walk) || 1.59;
    // he paces at the speed his walk was animated for, so it plays here as it does in Blender,
    // and walks up to the glass a little quicker
    this.walkSpeed = this.clipSpeed;
    for (const name of ['idle', 'walk']) {
      if (!clips[name]) continue;
      const a = this.mixer.clipAction(clips[name]);
      a.play(); a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      this.act[name] = a;
    }
    // gestures play additively on the upper body only, so they mix with walking or pressing
    for (const name of ['nod', 'shake']) {
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
    // Animating on 2s, 3s, ...: every frame is simulated and drawn, but his pose only changes every
    // `step` frames of a `stepFps` clock (0 = every frame), like held drawings. His root (where he
    // stands and which way he faces) still moves every frame.
    this.step = 0; this.stepFps = 24; this._tick = null; this._held = null;
    this.lookAhead = LOOK_AHEAD;
    this.pos = new THREE.Vector2(0.3, PACE_Z);           // x, z on the floor
    this.heading = 0;                                     // 0 faces the glass
    this.speed = new Spring(0, 1.4);
    this.turn = new Spring(0, 2.2);
    this.target = new THREE.Vector2(0.3, PACE_Z);
    this.dir = 1; this.pause = 1.2; this.pauseFace = null; this.standX = null; this.committed = false;
    this.turnSign = 0; this.turnWant = 0; this.cruise = false;   // a turn in progress: which way, and whether he walks through it
    this.slide = new Spring(0, 1.6);                      // sidestep speed at the glass
    this.mode = 'pace';
    this.side = 'L';
    this.pressW = new Spring(0, 1.1);
    this.crouch = new Spring(0, 1.2);
    this.lean = new Spring(0, 1.2);
    this.far = new Spring(0, 1.0);                        // leaning out toward a far cursor, signed by side
    this.lookW = new Spring(0, 1.0);
    this.look = new Spring3(V(0, 1.9, 2), 2.4);
    this.yawU = 0; this.headYaw = new Spring(0, 2.5); this.headPitch = new Spring(0, 2.5);   // head turn, unwrapped goal and eased
    this.hand = {};
    for (const s of ['L', 'R']) {
      this.hand[s] = {
        w: new Spring(0, 1.6), palm: new Spring3(V(0, 1, 0), 2.8), q: new QuatFollow(undefined, 4),
        plant: null, pressed: false, knock: new Spring(0, 4), hold: false, used: false, elbow: new THREE.Vector3(),
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
    const n = this.persp.near;
    this.persp.projectionMatrix.makePerspective(-this.hs * n, this.hs * n, TOP * n, BOTTOM * n, n, this.persp.far);
    this.persp.projectionMatrixInverse.copy(this.persp.projectionMatrix).invert();
    // the orthographic one the same way: a fixed band of heights, as wide as the window
    const oh = (ORTHO_Y[1] - ORTHO_Y[0]) / 2;
    this.ohw = oh * (w / h);
    Object.assign(this.orthoCam, { left: -this.ohw, right: this.ohw, top: oh, bottom: -oh });
    this.orthoCam.updateProjectionMatrix();
  }

  setOrtho(on) { this.ortho = !!on; this.camera = this.ortho ? this.orthoCam : this.persp; }

  // visible half-width of the room at depth z
  _halfW(z) { return this.ortho ? this.ohw : this.hs * (EYE_D - z); }

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
    else this.gesture('shake');
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

  // ---------------------------------------------------------------- behaviour
  _decide(dt, t, active, inWin, gp) {
    const was = this.mode;
    this.mode = active && inWin ? 'press' : 'pace';
    let face = 0;
    if (this.mode === 'press') {
      // stand so the cursor is within easy reach; only move again when it leaves that reach
      const lim = this._halfW(PRESS_Z) - 0.22;
      // stand beside the cursor so it sits in front of one shoulder, not in front of his face
      const at = (side) => gp.x - (side === 'L' ? 0.28 : -0.28);
      const off = this.standX == null ? 0 : gp.x - this.standX;
      const rel = off * (this.side === 'L' ? 1 : -1);
      // A reach, once started, always lands: he stays put and stretches after the cursor. With
      // a hand on the glass he stays until the cursor is further than he can lean out to (it
      // crossing in front of him swaps hands). Before that, he steps again when the cursor
      // drifts in front of his face or out of easy reach.
      const landed = this.committed && this.hand[this.side].w.x > 0.9;
      const restand = was !== 'press' || this.standX == null
        || (!this.committed && (rel < 0.1 || rel > 0.58)) || (landed && Math.abs(off) > HOLD);
      if (restand) {
        this.committed = false;
        let side = this.pos.x < gp.x ? 'L' : 'R';
        // hemmed in by a wall, reach with the other hand rather than across his face
        if (Math.abs(at(side)) > lim + 0.08 && Math.abs(at(side === 'L' ? 'R' : 'L')) < Math.abs(at(side))) side = side === 'L' ? 'R' : 'L';
        this.side = side;
        this.standX = clamp(at(side), -lim, lim);
      }
      this.target.set(this.standX, PRESS_Z);
      this.pause = 0;
    } else {
      this.standX = null; this.committed = false;
      const lim = Math.max(0.2, this._halfW(PACE_Z) - 0.35);
      const mx = active ? clamp(this._pointerAt(PACE_Z).x, -lim, lim) : null;
      // a full-length line, slid over toward the cursor rather than cut short by the walls
      const half = mx == null ? lim : Math.min(0.6, lim);
      const centre = clamp(mx ?? 0, half - lim, lim - half);
      if (was === 'press') { this.dir = this.pos.x < centre ? 1 : -1; this.pause = 0; }
      this.target.set(centre + this.dir * half, PACE_Z);
      const d = this.pos.distanceTo(this.target);
      if (this.pause > 0) {
        if (active) this.pause = Math.min(this.pause, 1.5);  // a cursor out there cuts a long stop short
        this.pause -= dt;
        if (this.pause <= 0) this.dir = this.pos.x < centre ? 1 : -1;   // set off toward the far end
        this.target.copy(this.pos);
        face = mx != null ? Math.atan2(mx - this.pos.x, EYE_D - PACE_Z) * 0.8
          : this.pauseFace ?? noise1(t * 0.1, 9) * 0.5;
      } else if (d < TURN_AHEAD) {
        this.dir = -this.dir;                                // head back before arriving: a walking U-turn
      } else if (!active && d > 0.6 && this.speed.x > this.walkSpeed * 0.6 && Math.random() < dt * 0.12) {
        // now and then he stops: to look out through the glass for a good while, or just to stand
        // idle facing the way he was going, or off into the room
        const r = Math.random();
        if (r < 0.45) { this.pause = 5 + Math.random() * 10; this.pauseFace = null; }
        else {
          this.pause = 2.5 + Math.random() * 3.5;
          this.pauseFace = wrap((r < 0.8 ? this.heading : Math.PI) + (Math.random() - 0.5) * 0.9);
        }
      }
    }
    return face;
  }

  _locomote(dt, face) {
    const to = new THREE.Vector2().subVectors(this.target, this.pos);
    const dist = to.length();
    // at the glass, a short shuffle sideways is a sidestep, not a turn away and back
    const sidestep = this.mode === 'press' && dist < 0.45 && Math.abs(to.y) < 0.1;
    let want = face, vWant = 0;
    if (dist > 0.05 && !sidestep) {
      want = Math.atan2(to.x, to.y);
      vWant = this.walkSpeed * (this.mode === 'pace' ? 1 : 1.4 * smooth(0.02, 0.45, dist));
    }
    let dAng = wrap(want - this.heading);
    // a big turn keeps the direction it started in, so it can't dither between left and right.
    // Turning right round while walking along the room, he swings through facing the glass
    // rather than turning his back on it; otherwise he turns the short way.
    if (this.turnSign && Math.abs(wrap(want - this.turnWant)) > 0.6) this.turnSign = 0;   // new goal: decide afresh
    if (Math.abs(dAng) > 1.4 && !this.turnSign) {
      const along = Math.abs(this.heading) > 0.8 && Math.abs(this.heading) < 2.4;
      this.turnSign = Math.abs(dAng) > 2.2 && along ? -Math.sign(this.heading) : Math.sign(dAng);
      this.turnWant = want;
    }
    if (Math.abs(dAng) < 0.6) this.turnSign = 0;
    if (this.turnSign > 0 && dAng < 0) dAng += 2 * Math.PI;
    if (this.turnSign < 0 && dAng > 0) dAng -= 2 * Math.PI;
    // once walking he keeps walking through turns, slowing into a tight U; from a standstill he
    // turns toward where he's going first, then sets off
    if (this.speed.x > this.walkSpeed * 0.45) this.cruise = true; else if (this.speed.x < 0.1) this.cruise = false;
    vWant *= this.cruise ? 0.4 + 0.6 * smooth(-1, 1, Math.cos(dAng)) : smooth(0, 1, Math.cos(dAng));
    const wMax = this.cruise ? 3.1 : 2.6;
    const w = this.turn.update(clamp(dAng * 3.5, -wMax, wMax), dt);
    this.heading = wrap(this.heading + w * dt);
    const v = Math.max(0, this.speed.update(vWant, dt));
    this.pos.x += Math.sin(this.heading) * v * dt;
    this.pos.y += Math.cos(this.heading) * v * dt;
    const sv = this.slide.update(sidestep ? clamp(to.x * 2.5, -0.45, 0.45) : 0, dt);
    this.pos.x += sv * dt;
    this.pos.y = Math.min(this.pos.y, PRESS_Z);              // never walk into the glass
    return { v, w, sv, dist, dAng };
  }

  _animate(dt, v, w, sv = 0) {
    const { idle, walk } = this.act;
    if (idle && walk) {
      // shuffling feet while turning on the spot or stepping sideways
      const step = Math.max(smooth(0.3, 1.8, Math.abs(w)), smooth(0.03, 0.25, Math.abs(sv))) * 0.55;
      const ww = Math.max(smooth(0, this.walkSpeed * 0.45, v), step);
      walk.setEffectiveWeight(ww); idle.setEffectiveWeight(1 - ww);
      walk.timeScale = Math.max(v / this.clipSpeed, step * 0.5);
    }
    if (this.gest) {
      const g = this.gest, dur = g.a.getClip().duration;
      g.t += dt;
      g.a.setEffectiveWeight(smooth(0, 0.2, g.t) * smooth(dur, dur - 0.3, g.t));
      if (g.t > dur) { g.a.stop(); this.gest = null; }
    }
    this.mixer.update(dt);
    this.rig.keepClipPose();
  }

  update(dt, t) {
    dt = Math.min(dt, 0.05);
    this.clock = t;
    const rig = this.rig;
    const active = t - this.lastMove < 5;
    const inWin = Math.abs(this.pointer.x) <= 1 && Math.abs(this.pointer.y) <= 1;
    const gp = this._pointerAt(0);                            // cursor on the glass

    const face = this._decide(dt, t, active, inWin, gp);
    const { v, w, sv, dist, dAng } = this._locomote(dt, face);

    // ---- base pose: clips ----
    rig.reset();
    this.char.position.set(this.pos.x, 0, this.pos.y);
    this.char.rotation.set(0, this.heading, 0);
    this.char.updateMatrixWorld(true);
    this._animate(dt, v, w, sv);
    this.char.updateMatrixWorld(true);

    const atGlass = this.mode === 'press' && dist < 0.1 && Math.abs(dAng) < 0.35 && v < 0.2 && Math.abs(sv) < 0.15;
    if (atGlass) this.committed = true;                       // the reach has started (see _decide)
    const pw = this.pressW.update(this.mode === 'press' && this.committed ? 1 : 0, dt);
    const body = V(this.pos.x, 0, this.pos.y);

    // which hand: chosen when he picks where to stand; switch as soon as the cursor crosses his
    // body, so a hand never reaches across his face
    if (gp.x > body.x + 0.05) this.side = 'L'; else if (gp.x < body.x - 0.05) this.side = 'R';
    const main = this.side, other = main === 'L' ? 'R' : 'L';

    // ---- body: crouch for a low cursor; for one further out than his arm, lean right over to it:
    // hips over the leg on that side, the weight on it, the other leg lifting out the other way.
    // Feet stay where the clip put them, except the lifted one. ----
    const sgn = main === 'L' ? 1 : -1;
    const out = (gp.x - body.x) * sgn;                      // how far out to the reaching side
    const shY = rig.b('upper_arm.L').getWorldPosition(new THREE.Vector3()).y;
    const cr = this.crouch.update(pw * clamp(shY - 0.42 - gp.y, 0, 0.2), dt);
    const far = this.far.update(sgn * pw * smooth(0.3, HOLD, out), dt);   // signed: + leans to his left (+x)
    const ln = this.lean.update(pw * (0.07 + clamp(out - 0.2, 0, 0.3) * 0.25), dt);
    if (cr > 0.002 || Math.abs(far) > 0.002) {
      const feet = {};
      for (const s of ['L', 'R']) { const f = rig.b('foot.' + s); feet[s] = { p: f.getWorldPosition(new THREE.Vector3()), q: f.getWorldQuaternion(new THREE.Quaternion()) }; }
      this.char.position.y -= cr; this.char.updateMatrixWorld(true);
      const hips = rig.b('spine');
      const hp = hips.getWorldPosition(new THREE.Vector3()).add(rig.toWorldDir(V(far * 0.2, -Math.abs(far) * 0.05, 0)));
      hips.position.copy(hips.parent.worldToLocal(hp)); hips.updateMatrixWorld(true);
      rig.rotateRoot('spine', Z, -far * 0.3);
      const lift = Math.abs(far), away = -Math.sign(far);
      const tip = new THREE.Quaternion().setFromAxisAngle(rig.toWorldDir(Z.clone()), -far * 0.5);
      for (const s of ['L', 'R']) {
        const p = feet[s].p.clone(), q = feet[s].q.clone();
        if ((s === 'L' ? 1 : -1) === away) { p.add(rig.toWorldDir(V(away * 0.22 * lift, 0.28 * lift, 0))); q.premultiply(tip); }
        const knee = rig.b('thigh.' + s).getWorldPosition(new THREE.Vector3()).add(rig.toWorldDir(V(0, 0, 1)));
        rig.legIK(s, p, knee);
        rig.setWorldQuat(rig.b('foot.' + s), q);
      }
    }
    rig.rotateRoot('spine.001', X, ln * 0.5);
    rig.rotateRoot('spine.002', X, ln * 0.5);
    rig.rotateRoot('spine.001', Z, -far * 0.25);
    rig.rotateRoot('spine.002', Z, -far * 0.25);
    rig.rotateRoot('spine.005', Z, far * 0.25);             // head kept a little more upright

    // ---- head: look at the cursor (or where he's going) ----
    // on the glass he looks at the cursor itself; off it, at the point on the cursor's line of
    // sight a little in front of him, so his head turns toward where it shows on screen
    const lookT = active ? this._pointerAt(inWin ? 0 : Math.min(0, body.z + this.lookAhead))
      : V(body.x + Math.sin(this.heading) * 2, 1.85 + noise1(t * 0.2, 5) * 0.2, body.z + Math.cos(this.heading) * 2);
    const look = this.look.update(lookT, dt);
    const lw = this.lookW.update(active ? 1 : 0.5, dt);
    const head = rig.b('spine.006').getWorldPosition(new THREE.Vector3());
    const d = rig.toRootDir(look.clone().sub(head));
    // once the target is behind him, keep to the shoulder it went behind until it is well round
    // the other side, and ease off rather than crane round; the head then swings across instead
    // of flipping from one shoulder to the other in a frame
    this.yawU += wrap(Math.atan2(d.x, d.z) - this.yawU);
    if (Math.abs(this.yawU) > Math.PI + 0.6) this.yawU -= Math.sign(this.yawU) * 2 * Math.PI;
    const u = Math.abs(this.yawU);
    const turnTo = u < 1.15 ? u : Math.max(0.45, 1.15 - (u - 1.15) * 0.3);
    const yaw = this.headYaw.update(Math.sign(this.yawU) * turnTo * lw, dt);
    const pitch = this.headPitch.update(clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.5) * lw, dt);
    for (const [bone, k] of [['spine.004', 0.25], ['spine.005', 0.3], ['spine.006', 0.45]]) {
      rig.rotateRoot(bone, Y, yaw * k);
      rig.rotateRoot(bone, X, -pitch * k);
    }

    // ---- hands on the glass ----
    // The hand on the cursor's side goes to the cursor. The other keeps whatever hold it has,
    // without looking for a new spot, until he leans too far away from it to reach; with nothing
    // held yet, the right hand braces low while the left reaches.
    for (const s of ['L', 'R']) {
      const H = this.hand[s], sg = s === 'L' ? 1 : -1;
      const shoulder = rig.b('upper_arm.' + s).getWorldPosition(new THREE.Vector3());
      if (pw < 0.05) H.used = false;
      let goal = null;
      if (s === main) goal = gp.clone();
      else if (H.hold && H.plant) goal = H.plant.clone();
      else if (s === 'R' && pw > 0.8 && !H.used) goal = V(shoulder.x - 0.12, shoulder.y - 0.32, 0);
      // let go once he leans well over the other way, or it's out of reach
      if (goal && s !== main && (Math.abs(far) > 0.75 || goal.distanceTo(shoulder) > STRETCH + 0.01)) goal = null;
      H.hold = !!goal && pw > 0.05;
      if (H.hold) H.used = true;
      const hw = H.w.update(goal ? pw : 0, dt);
      const handBone = rig.b('hand.' + s);
      const animPalm = rig.palmWorld(s, new THREE.Vector3());
      const animQ = handBone.getWorldQuaternion(new THREE.Quaternion());
      if (!goal) { this._leave(H, s); if (hw < 0.01) H.plant = null; }
      else if (s === main) {
        // keep it where he can reach, and only re-plant when the cursor has moved off the hand
        const dz = -shoulder.z;
        const len = REACH + (STRETCH - REACH) * smooth(0.45, 0.8, out);
        const r = Math.sqrt(Math.max(0.01, len * len - dz * dz));
        const off = new THREE.Vector2(goal.x - shoulder.x, goal.y - shoulder.y);
        if (off.length() > r) off.setLength(r);
        goal.set(shoulder.x + off.x, shoulder.y + off.y, 0);
        if (!H.plant || H.plant.distanceTo(goal) > 0.09) { this._leave(H, s); H.plant = goal.clone(); }
      } else if (!H.plant) H.plant = goal.clone();
      if (hw < 0.01) { H.palm.snap(animPalm); H.q.snap(animQ); rig.b('forearm.' + s).getWorldPosition(H.elbow); continue; }
      const plant = H.plant || animPalm;
      const travel = Math.hypot(H.palm.x.x - plant.x, H.palm.x.y - plant.y);
      const lift = smooth(0.005, 0.06, travel);             // off the glass while moving, flat on it when there
      const knock = H.knock.update(0, dt);
      const palmT = plant.clone(); palmT.z = CONTACT - lift * 0.07 + knock * 0.05;
      const palm = H.palm.update(palmT, dt);
      // fingers carry on along the forearm (a straight wrist), the palm flat on the glass
      const fingers = V(palm.x - H.elbow.x, palm.y - H.elbow.y, 0);
      if (fingers.lengthSq() < 1e-4) fingers.set(0, 1, 0);
      fingers.normalize();
      H.pressed = hw > 0.9 && lift < 0.05 && knock > -0.1;
      if (H.pressed) H.stamp = { p: plant.clone(), side: s, dir: fingers.clone() };
      const qG = rig.handWorldQuat(s, fingers, Z);
      const q = H.q.update(animQ.clone().slerp(qG, hw), dt);
      const wristIK = rig.wristFor(s, palm, q, new THREE.Vector3());
      const animWrist = handBone.getWorldPosition(new THREE.Vector3());
      const wrist = animWrist.lerp(wristIK, hw);
      // the elbow drops under a high reach instead of sticking out, and goes out for a low one
      const up = smooth(-0.15, 0.35, wrist.y - shoulder.y);
      const pole = shoulder.clone().add(rig.toWorldDir(V(0.5 * sg * (1 - 0.8 * up), -0.6 - 0.5 * up, -0.45 + 0.25 * up)));
      rig.armIK(s, wrist, pole);
      rig.b('forearm.' + s).getWorldPosition(H.elbow);
      rig.setHand(s, q);
      rig.blendFingers(s, POSES.glass, hw);                   // from the clip's fingers to flat on the glass
    }

    this.room.shadow.value.set(body.x, body.z);
    this.prints.update(dt);
    if (this.step > 0) {
      const tick = Math.floor((t * this.stepFps) / this.step);
      if (tick !== this._tick || !this._held) { this._tick = tick; this._held = rig.capture(this._held); }
      else rig.restore(this._held);                           // hold the drawing; the root has moved on
    }
    this.renderer.render(this.scene, this.camera);
  }

  // a hand leaving the glass leaves a palm print behind
  _leave(H, s) {
    if (H.stamp) { this.prints.add(H.stamp.p, s, H.stamp.dir); H.stamp = null; }
  }
}

// ------------------------------------------------------------------ the room behind the glass
// A black box with a dithered grid on the floor and back wall, so depth reads in one colour.
// How fast the planted foot slides back in the in-place walk: the speed he has to travel at for
// his feet not to skate. Measured on the rig, so a walk edited in Blender keeps its footing.
function strideSpeed(root, clip) {
  const feet = ['footL', 'footR'].map((n) => root.getObjectByName(n));
  if (!clip || feet.some((f) => !f)) return null;
  const mixer = new THREE.AnimationMixer(root), a = mixer.clipAction(clip).play();
  const n = 60, inv = new THREE.Matrix4(), prev = [V(0, 0, 0), V(0, 0, 0)], cur = [V(0, 0, 0), V(0, 0, 0)];
  let dist = 0;
  for (let i = 0; i <= n; i++) {
    a.time = (i / n) * clip.duration; mixer.update(0); root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    feet.forEach((f, k) => cur[k].setFromMatrixPosition(f.matrixWorld).applyMatrix4(inv));
    if (i) { const k = cur[0].y < cur[1].y ? 0 : 1; dist += prev[k].z - cur[k].z; }
    prev.forEach((p, k) => p.copy(cur[k]));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  return Math.abs(dist) / clip.duration;
}

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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, -BACK_Z), mat('floor', 0.9));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, BACK_Z / 2);
  const floorBase = new THREE.Mesh(floor.geometry, black); floorBase.rotation.copy(floor.rotation); floorBase.position.copy(floor.position); floorBase.position.y -= 0.001;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), mat('wall', 0.55));
  wall.position.set(0, 2.5, BACK_Z);
  g.add(floorBase, floor, wall);
  return { group: g, shadow };
}

// ------------------------------------------------------------------ palm prints on the glass
function printTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  // blocky: a rectangle for the palm and one for each finger
  const bar = (cx, cy, w, h, a = 0) => { x.save(); x.translate(cx, cy); x.rotate(a); x.fillRect(-w / 2, -h / 2, w, h); x.restore(); };
  bar(30, 67, 32, 36);                                    // palm
  bar(15, 35, 8, 22, -0.12); bar(25, 28, 8, 26, -0.04); bar(35, 27, 8, 26, 0.04); bar(45, 32, 7, 22, 0.12);
  bar(52, 64, 9, 20, 0.7);                                // thumb (right hand, seen from outside)
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
  add(p, side, dir) {
    const slot = this.pool.reduce((a, b) => (b.age > a.age ? b : a));
    slot.age = 0; slot.mesh.visible = true;
    slot.mesh.position.set(p.x + dir.x * 0.03, p.y + dir.y * 0.03, -0.002);
    slot.mesh.rotation.z = Math.atan2(-dir.x, dir.y);   // fingers along the hand
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
