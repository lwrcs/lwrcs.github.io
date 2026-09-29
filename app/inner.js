// The character living inside VIEW.EXE. The window is a pane of glass with a small room
// behind it. He paces the back of the room, drifting toward wherever the cursor is; when the
// cursor comes onto the window he walks up to the glass and plants a hand on it under the cursor.
// Walk, idle and the nod/shake gestures are his Blender actions baked into the model (or, for a
// model without them, Mixamo clips retargeted onto his rig in assets/models/lifetime-moves.json);
// head tracking, leaning and the hand on the glass are layered on top every frame.
import * as THREE from 'three';
import { applyCharacterMaterials, hullMaterial, pixelUniform, blueU, INK, BAYER_GLSL } from './halftone.js';
import { Rig, POSES, WRIST } from './rig.js';
import { Spring, Spring3, noise1 } from './springs.js';

// Camera: an eye in front of the glass (z = 0) looking straight in. The window is exactly the
// glass, so a cursor on the window is a point on the glass. The eye is `eyeD` in front of it at
// height `eyeY`, and the window always shows the glass from height `low` to `high` (m), as wide as
// it is. This is the desk's VIEW.EXE; a page can frame him differently (the `frame` option).
const FRAME = { eyeY: 2.0, eyeD: 1.25, low: 1.05, high: 2.25 };
const ORTHO_Y = [-0.15, 2.45];  // dev option: a level orthographic camera showing this band of heights
const PACE_Z = -1.6, PRESS_Z = -0.42, BACK_Z = -3.2;
const TURN_AHEAD = 0.3;        // how far short of the end of his pacing line he starts turning back
const REACH = 0.63;            // shoulder to palm centre, elbow slightly bent
const STRETCH = 0.67;          // ... and with the arm straight, reaching for a cursor further out
const LEAN_OUT = 1.0;          // cursor this far across from where he stands: leaning right over, arm at full stretch
const HOLD = 1.9;              // with a hand on the glass, how far the cursor can go (across) before he steps over
const CROUCH = 0.5;            // deepest crouch (how far his hips drop)
const CROUCH_COST = 1.0;       // how much he'd rather stand tall than crouch, against straining his arms
const LET_GO = 0.6;            // how strained a hand holding on can get before it lets go
// Shoulder limits: the upper arm reaches back at most 35° behind his side (back is its sine), and
// turns about itself 90° in and 69° out (radians) from how it would be raised straight there from
// hanging. The elbow also stays below the shoulder or the hand, whichever is higher, and never
// swings in past straight ahead of the shoulder, 90° round from his side (_armCost).
const SHOULDER = { back: 0.57, inward: Math.PI / 2, outward: 1.2 };
const SIDESTEP = 0.5;          // fastest sidestep along the glass (m/s)
const STEP_T = 0.3;            // one foot's sidestep, lift to landing (s)
const STRIDE = 0.5;            // furthest a stepped foot gets from where the clip has it (m)
const STEP_UP = 0.1;           // and how high it lifts
const LEG_MAX = 0.9;           // hip to ankle with the knee all but straight
const MID = 0.14;              // each hand keeps at least this far to its own side of his middle
const GAP = 0.3;               // and this far from the other hand; the one already there moves over
const LOOK_AHEAD = 0.6;        // with the cursor off the glass, he looks at the point on its line this far in front of him
const CONTACT = -0.012;        // palm centre z when pressed flat on the glass

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

export class InnerView {
  // moves: { idle, walk, nod, shake }, each an AnimationClip or a clip in three's JSON form
  constructor(canvas, characterScene, { moves = null, pixelCss = 2, frame = null } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 1);
    this.pixel = pixelUniform(pixelCss);
    this.scene = new THREE.Scene();
    this.camera = this.persp = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 60);
    this.ortho = false;
    this.frame = { ...FRAME, ...frame };

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
    measureElbows(this.char, [clips.walk, clips.idle], this.rig);
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
    this.stepW = new Spring(0, 2.5);                      // his feet stepping (_step) rather than as the clip has them
    this.feet = { L: { at: null, from: null, t: 1 }, R: { at: null, from: null, t: 1 } };   // where each is planted; a step under way runs t 0 to 1
    this.mode = 'pace';
    this.side = 'L';
    this.pressW = new Spring(0, 1.1);
    this.crouch = new Spring(0, 1.2); this.crouchT = 0; this.crouchAge = 1; this._strain = {};   // eased; how low he means to go, see _crouchFor
    this.lean = new Spring(0, 1.2);
    this.far = new Spring(0, 1.0);                        // leaning out toward a far cursor, signed by side
    this.lookW = new Spring(0, 1.0);
    this.look = new Spring3(V(0, 1.9, 2), 2.4);
    this.yawU = 0; this.headYaw = new Spring(0, 2.5); this.headPitch = new Spring(0, 2.5);   // head turn, unwrapped goal and eased
    this.hand = {};
    for (const s of ['L', 'R']) {
      this.hand[s] = {
        w: new Spring(0, 1.6), palm: new Spring3(V(0, 1, 0), 2.8), q: new THREE.Quaternion(),   // q: the hand as last set
        plant: null, pressed: false, knock: new Spring(0, 4), hold: false, used: false,
        bend: 0, fresh: true,                                // how far the elbow has turned from the clip's
        wa: [new Spring(0, 4), new Spring(0, 4), new Spring(0, 4)],   // wrist twist, bend back, bend sideways
      };
    }

    this._ray = new THREE.Raycaster();
    this.setFrame();
  }

  // frame: any of { eyeY, eyeD, low, high }, see FRAME
  setFrame(frame = {}) {
    const f = Object.assign(this.frame, frame);
    this.persp.position.set(0, f.eyeY, f.eyeD);
    this.persp.updateMatrixWorld(true);
    this.orthoCam.position.set(0, (ORTHO_Y[0] + ORTHO_Y[1]) / 2, f.eyeD);
    this.orthoCam.updateMatrixWorld(true);
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
    // (slopes: height per unit of distance from the eye)
    const f = this.frame, top = (f.high - f.eyeY) / f.eyeD, bottom = (f.low - f.eyeY) / f.eyeD;
    this.hs = ((top - bottom) / 2) * (w / h);
    const n = this.persp.near;
    this.persp.projectionMatrix.makePerspective(-this.hs * n, this.hs * n, top * n, bottom * n, n, this.persp.far);
    this.persp.projectionMatrixInverse.copy(this.persp.projectionMatrix).invert();
    // the orthographic one the same way: a fixed band of heights, as wide as the window
    const oh = (ORTHO_Y[1] - ORTHO_Y[0]) / 2;
    this.ohw = oh * (w / h);
    Object.assign(this.orthoCam, { left: -this.ohw, right: this.ohw, top: oh, bottom: -oh });
    this.orthoCam.updateProjectionMatrix();
  }

  setOrtho(on) { this.ortho = !!on; this.camera = this.ortho ? this.orthoCam : this.persp; }

  // visible half-width of the room at depth z
  _halfW(z) { return this.ortho ? this.ohw : this.hs * (this.frame.eyeD - z); }

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
      // crossing in front of him swaps hands), then sidesteps over to it without letting go.
      // Before that, he steps again when the cursor drifts in front of his face or out of easy reach.
      const landed = this.committed && this.hand[this.side].w.x > 0.9;
      const over = landed && Math.abs(off) > HOLD;
      const restand = was !== 'press' || this.standX == null
        || (!this.committed && (rel < 0.1 || rel > 0.58)) || over;
      if (restand) {
        if (!over) this.committed = false;
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
        face = mx != null ? Math.atan2(mx - this.pos.x, this.frame.eyeD - PACE_Z) * 0.8
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
    // at the glass, a short shuffle sideways is a sidestep, not a turn away and back, and so is
    // any move along it with his hands on it
    const sidestep = this.mode === 'press' && (dist < 0.45 || this.committed) && Math.abs(to.y) < 0.1;
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
    const sv = this.slide.update(sidestep ? clamp(to.x * 2.5, -SIDESTEP, SIDESTEP) : 0, dt);
    this.pos.x += sv * dt;
    this.pos.y = Math.min(this.pos.y, PRESS_Z);              // never walk into the glass
    return { v, w, sv, dist, dAng, sidestep };
  }

  _animate(dt, v, w) {
    const { idle, walk } = this.act;
    if (idle && walk) {
      // shuffling feet while turning on the spot (sidesteps are stepped out in _step)
      const step = smooth(0.3, 1.8, Math.abs(w)) * 0.55;
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
    const { v, w, sv, dist, dAng, sidestep } = this._locomote(dt, face);

    // ---- base pose: clips ----
    rig.reset();
    this.char.position.set(this.pos.x, 0, this.pos.y);
    this.char.rotation.set(0, this.heading, 0);
    this.char.updateMatrixWorld(true);
    this._animate(dt, v, w);
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
    // Feet stay where the clip put them, except the lifted one, or step when he sidesteps. ----
    const sgn = main === 'L' ? 1 : -1;
    const out = (gp.x - body.x) * sgn;                      // how far out to the reaching side
    const feet = {};
    for (const s of ['L', 'R']) { const f = rig.b('foot.' + s); feet[s] = { p: f.getWorldPosition(new THREE.Vector3()), q: f.getWorldQuaternion(new THREE.Quaternion()) }; }
    // his own feet only while he's sidestepping along the glass: once he turns or walks off, the clip has them
    const stepping = this._step(dt, sv, feet, sidestep && v < 0.1 && Math.abs(w) < 0.5);
    const sw = this.stepW.x;
    // knees bend as far as it takes for his hands to lie flat where they go without straining his
    // arms (worked out below, from the pose last frame)
    const cr = this.crouch.update(pw * this.crouchT, dt);
    // sidestepping over to a far cursor he mostly straightens up, and reaches out with his arm
    const far = this.far.update(sgn * pw * smooth(0.3, LEAN_OUT, out) * (1 - 0.85 * smooth(0.05, 0.3, Math.abs(sv))), dt);   // signed: + leans to his left (+x)
    const ln = this.lean.update(pw * (0.07 + clamp(out - 0.2, 0, 0.3) * 0.25), dt);
    if (cr > 0.002 || Math.abs(far) > 0.002 || sw > 0.002) {
      this.char.position.y -= cr - stepping.bob * sw; this.char.updateMatrixWorld(true);
      const hips = rig.b('spine');
      const hp = hips.getWorldPosition(new THREE.Vector3()).add(rig.toWorldDir(V(far * 0.2 + stepping.sway * sw, -Math.abs(far) * 0.05, 0)));
      hips.position.copy(hips.parent.worldToLocal(hp)); hips.updateMatrixWorld(true);
      rig.rotateRoot('spine', Z, -far * 0.3 + stepping.tilt * sw);
      rig.rotateRoot('spine.001', Z, -stepping.tilt * sw);    // the hips hitch up on the lifting side, not his chest
      const lift = Math.abs(far) * (1 - sw), away = -Math.sign(far);
      const tip = new THREE.Quaternion().setFromAxisAngle(rig.toWorldDir(Z.clone()), -far * 0.5 * (1 - sw));
      const at = {};
      for (const s of ['L', 'R']) {
        at[s] = { p: feet[s].p.clone().lerp(stepping[s], sw), q: feet[s].q.clone() };
        if ((s === 'L' ? 1 : -1) === away) { at[s].p.add(rig.toWorldDir(V(away * 0.22 * lift, 0.28 * lift, 0))); at[s].q.premultiply(tip); }
      }
      // with the feet spread wide, the knees bend and the hips drop rather than a leg over-reaching
      let drop = 0;
      for (const s of ['L', 'R']) {
        const d = at[s].p.clone().sub(rig.b('thigh.' + s).getWorldPosition(new THREE.Vector3())), across = Math.hypot(d.x, d.z);
        if (across < LEG_MAX) drop = Math.max(drop, -d.y - Math.sqrt(LEG_MAX * LEG_MAX - across * across));
      }
      if (drop > 0) { this.char.position.y -= drop; this.char.updateMatrixWorld(true); }
      for (const s of ['L', 'R']) {
        const { p, q } = at[s];
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
    // held yet, the right hand braces low while the left reaches. Each hand stays on its own side
    // of him, and when the reaching hand comes in close, the other moves over to make room.
    const side = (x, sg) => (sg > 0 ? Math.max(x, body.x + MID) : Math.min(x, body.x - MID));
    const mainAt = side(gp.x, sgn);
    const reachLen = REACH + (STRETCH - REACH) * smooth(0.45, 0.8, out);
    const shoulders = {}, chest = {};
    for (const s of ['L', 'R']) { shoulders[s] = rig.b('upper_arm.' + s).getWorldPosition(new THREE.Vector3()); chest[s] = this._chest(s); }
    // how low to crouch next: for the reaching hand at the cursor and the other at its hold
    // (20 times a second is plenty: the crouch eases in far slower than that)
    this.crouchAge += dt;
    if (main !== this._mainWas) { this._mainWas = main; this.crouchAge = 1; }   // each hand's strain is for its own job
    if (pw < 0.05) { this.crouchT = 0; this._strain = {}; } else if (this.crouchAge >= 0.05) {
      this.crouchAge = 0;
      const goals = [{ s: main, palm: V(mainAt, gp.y, 0), shoulder: shoulders[main], ch: chest[main], len: reachLen }];
      const Ho = this.hand[other];
      if (Ho.hold && Ho.plant) goals.push({ s: other, palm: Ho.plant, shoulder: shoulders[other], ch: chest[other], len: STRETCH, cap: LET_GO });
      this.crouchT = this._crouchFor(goals, cr, this.crouchT);
    }
    const strain = this._strain;
    const slideW = smooth(0.05, 0.2, Math.abs(sv));          // sidestepping: the hands slide along the glass with him
    for (const s of ['L', 'R']) {
      const H = this.hand[s], sg = s === 'L' ? 1 : -1;
      const shoulder = shoulders[s], ch = chest[s];
      if (pw < 0.05) H.used = false;
      let goal = null;
      if (s === main) goal = gp.clone();
      else if (H.hold && H.plant) goal = H.plant.clone();
      // with nothing held yet, the right hand braces beside the left, about as high
      else if (s === 'R' && pw > 0.8 && !H.used) goal = V(shoulder.x - 0.12, clamp(gp.y, shoulder.y - 0.25, shoulder.y + 0.1), 0);
      if (goal) goal.x = side(goal.x, sg);
      if (goal && s !== main && H.hold && slideW > 0) { H.plant.x += sv * dt; goal.x = H.plant.x; }
      if (goal && s !== main && (goal.x - mainAt) * sg < GAP) goal.x = mainAt + sg * (GAP + 0.1);
      // let go once he leans well over the other way, or it's out of reach or no longer comfortable
      if (goal && s !== main && (Math.abs(far) > 0.75 || goal.distanceTo(shoulder) > STRETCH + 0.01 || strain[s] > LET_GO)) goal = null;
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
        const r = Math.sqrt(Math.max(0.01, reachLen * reachLen - dz * dz));
        const off = new THREE.Vector2(goal.x - shoulder.x, goal.y - shoulder.y);
        if (off.length() > r) off.setLength(r);
        goal.set(shoulder.x + off.x, shoulder.y + off.y, 0);
        if (H.plant && slideW > 0 && hw > 0.9) H.plant.copy(goal);
        else if (!H.plant || H.plant.distanceTo(goal) > 0.09) { this._leave(H, s); H.plant = goal.clone(); }
      } else if (!H.plant || H.plant.distanceTo(goal) > 0.05) { this._leave(H, s); H.plant = goal.clone(); }
      if (hw < 0.01) { H.palm.snap(animPalm); H.q.copy(animQ); H.bend = 0; H.fresh = true; continue; }
      const plant = H.plant || animPalm;
      const travel = Math.hypot(H.palm.x.x - plant.x, H.palm.x.y - plant.y);
      const lift = smooth(0.005, 0.06, travel) * (1 - slideW);   // off the glass while moving, flat on it when there
      const knock = H.knock.update(0, dt);
      const palmT = plant.clone(); palmT.z = CONTACT - lift * 0.07 + knock * 0.05;
      const palm = H.palm.update(palmT, dt);
      // The elbow drops under a high reach instead of sticking out, and goes out for a low one;
      // then it swings round as far as it must for the palm to lie flat on the glass, fingers
      // carrying on along the forearm, without the wrist bending or twisting further than a
      // wrist can. It turns round the shoulder-to-wrist line from where the clip has it; H.bend
      // is how far, eased, so it never jumps the other way round.
      const wrist0 = rig.wristFor(s, palm, H.q, new THREE.Vector3());   // where the wrist was
      const axis0 = wrist0.clone().sub(shoulder).normalize();
      const clipBend = rig.b('forearm.' + s).getWorldPosition(new THREE.Vector3()).sub(shoulder);
      const turned = (a) => square(clipBend, axis0).applyAxisAngle(axis0, a);
      const want = this._elbowFor(s, shoulder, palm, wrist0, this._pole(s, shoulder, palm.y), turned(H.bend), ch);
      H.bend += wrap(angleAbout(turned(0), want, axis0) - H.bend) * (1 - Math.exp(-12 * dt));
      const flat = this._flatHand(s, palm, shoulder, turned(H.bend), wrist0);
      H.pressed = hw > 0.9 && lift < 0.05 && knock > -0.1;
      if (H.pressed) H.stamp = { p: plant.clone(), side: s, dir: flat.d.clone() };
      const wrist = handBone.getWorldPosition(new THREE.Vector3()).lerp(wrist0, hw);
      const axis = wrist.clone().sub(shoulder).normalize();
      const g = rig.armIK(s, wrist, shoulder.clone().add(square(clipBend, axis).applyAxisAngle(axis, H.bend * hw).multiplyScalar(0.5)));
      // The hand turns from the clip's pose to flat on the glass the way a wrist does, through its
      // twist and bends, each kept within what a wrist can do, so it never swings round the back.
      const a = rig.wristLimited(s, animQ, g.f, g.A), b = rig.wristLimited(s, flat.q, g.f, g.A);
      if (H.fresh) { H.fresh = false; for (let i = 0; i < 3; i++) H.wa[i].snap(a[i]); }
      const q = rig.handFromAngles(s, ...H.wa.map((sp, i) => sp.update(a[i] + (b[i] - a[i]) * hw, dt)), g.f, g.A);
      H.q.copy(q);
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

  // Sidestepping: each foot stays planted while he moves on over it, then lifts and swings out to
  // where it will be under him and a little ahead, one foot at a time, the leading one first and
  // never across the other; when he stops, they step back under him. `clip` is where the clip has
  // each foot. Returns where each foot goes, and how far the hips bob, tilt and sway over the planted foot.
  _step(dt, vx, clip, on) {
    const F = this.feet, speed = on ? Math.abs(vx) : 0, dirn = Math.sign(vx);
    const home = (s) => clip[s].p;
    for (const s of ['L', 'R']) if (!F[s].at) F[s].at = home(s).clone();
    const off = (s) => F[s].at.x - home(s).x;                // + is to his left of where it would be
    const err = (s) => Math.hypot(off(s), F[s].at.z - home(s).z);
    const swinging = F.L.t < 1 ? 'L' : F.R.t < 1 ? 'R' : null;
    const settled = !swinging && err('L') < 0.03 && err('R') < 0.03;
    // off (turning, walking, not at the glass): no new steps, and the feet go back to the clip
    const w = this.stepW.update(on && (speed > 0.02 || !settled) ? 1 : 0, dt);
    if (w < 0.002 && (settled || !on)) {
      F.L.at = F.R.at = null; F.L.t = F.R.t = 1;
      return { L: home('L'), R: home('R'), bob: 0, tilt: 0, sway: 0 };
    }
    // where a foot lands: the spot under him once it's down, a little ahead in the way he's going,
    // and at least a foot's width from the other one, on its own side
    const aim = (s, t) => {
      const p = home(s).clone(); p.x += vx * STEP_T * (1 - t) + vx * STEP_T * 0.7;
      const o = F[s === 'L' ? 'R' : 'L'].at.x;
      p.x = s === 'L' ? clamp(p.x, o + 0.14, o + 0.6) : clamp(p.x, o - 0.6, o - 0.14);
      return p;
    };
    if (!swinging && on) {
      // the foot furthest behind where it would be under him goes next (the leading one, if it's close);
      // one that has drifted forward or back of it steps back under him too
      const moving = speed > 0.02, lead = dirn > 0 ? 'L' : 'R';
      const behind = (s) => (moving ? Math.max(-off(s) * dirn, Math.abs(F[s].at.z - home(s).z)) : err(s));
      let s = behind('L') > behind('R') ? 'L' : 'R';
      if (moving && Math.abs(behind('L') - behind('R')) < 0.02) s = lead;
      if (Math.max(behind('L'), behind('R')) > (moving ? Math.max(0.05, speed * STEP_T * 0.7) : 0.03)) { F[s].from = F[s].at.clone(); F[s].t = 0; }
    }
    const res = { bob: -0.06, tilt: 0, sway: 0 };            // knees a little bent, so the feet can spread
    for (const s of ['L', 'R']) {
      const f = F[s];
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / STEP_T);
        const to = aim(s, f.t), e = smooth(0, 1, f.t), up = Math.sin(Math.PI * f.t);
        res[s] = f.from.clone().lerp(to, e); res[s].y += STEP_UP * up;
        // the body rises over the planted foot as the other lifts, and settles as it lands
        res.bob += 0.022 * up; res.tilt = (s === 'L' ? 1 : -1) * 0.07 * up; res.sway = (s === 'L' ? -1 : 1) * 0.035 * up;
        if (f.t >= 1) f.at = to;
      } else res[s] = f.at.clone();
      // never further from where the clip has it than a stride: past that it gives, rather than his leg
      const d = res[s].clone().sub(home(s)); d.y = 0;
      if (d.length() > STRIDE) res[s].sub(d.multiplyScalar(1 - STRIDE / d.length()));
    }
    return res;
  }

  // His chest's axes, for side s: up the spine, forward and out to that side (unit vectors).
  _chest(s) {
    const up = Y.clone().applyQuaternion(this.rig.b('spine.003').getWorldQuaternion(_qa));
    const fwd = this.rig.toWorldDir(Z.clone()); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const out = new THREE.Vector3().crossVectors(up, fwd).multiplyScalar(s === 'L' ? 1 : -1);
    return { up, down: up.clone().negate(), fwd, out };
  }

  // The preferred side for the elbow, off the shoulder: out and back for a low hand, dropping
  // underneath as the hand goes up past the shoulder.
  _pole(s, shoulder, palmY) {
    const up = smooth(-0.15, 0.35, palmY - 0.05 - shoulder.y), sg = s === 'L' ? 1 : -1;
    return shoulder.clone().add(this.rig.toWorldDir(V(0.5 * sg * (1 - 0.8 * up), -0.6 - 0.5 * up, -0.45 + 0.25 * up)));
  }

  // How far an arm goes past what an arm does, with the palm flat at `palm` and the elbow pointing
  // `bend` (in squared radians, roughly; 0 when it's all within reach): the wrist twisting or bending
  // back too far; at the shoulder, the elbow lifting above both the shoulder and the hand, reaching
  // far behind him or in across his chest, or the upper arm turned about itself further than it goes.
  _armCost(s, shoulder, palm, bend, wrist0, ch) {
    const rig = this.rig, lim = 0.06;                        // aim a little inside the wrist's limits
    const h = this._flatHand(s, palm, shoulder, bend, wrist0);
    const w = rig.wristAngles(s, h.q, h.g.f, h.g.A, Z);
    const wr = Math.max(0, w.twist - WRIST.supinate + lim) + Math.max(0, -WRIST.pronate + lim - w.twist) + Math.max(0, w.ext - WRIST.extend + lim);
    const e = h.g.elbow.clone().sub(shoulder), l1 = e.length(), u = e.clone().divideScalar(l1);
    const high = Math.max(0, e.dot(ch.up) - Math.max(0, _va.subVectors(h.wrist, shoulder).dot(ch.up)) - 0.03) / l1;
    const back = Math.max(0, -u.dot(ch.fwd) - SHOULDER.back);
    const across = Math.max(0, -e.dot(ch.out));              // swung in past straight ahead of the shoulder
    // the upper arm's turn about itself, from how it would be if raised straight there from hanging
    // with the forearm pointing forward; + turns the forearm in toward his middle
    const ref = ch.fwd.clone().applyQuaternion(_qa.setFromUnitVectors(ch.down, u));
    const fp = h.g.f.clone().addScaledVector(u, -h.g.f.dot(u));
    const turn = smooth(0.15, 0.4, fp.length()) * (s === 'L' ? 1 : -1) * Math.atan2(_va.crossVectors(ref, fp).dot(u), ref.dot(fp));
    const rot = Math.max(0, turn - SHOULDER.inward) + Math.max(0, -SHOULDER.outward - turn);
    // and, well within those, he'd rather not have the hand bent right back or the fingers hanging down
    const ease = 3 * Math.max(0, w.ext - 0.7) ** 2 + 1.5 * Math.max(0, -h.d.y - 0.3) ** 2;
    return { cost: 40 * (wr * wr + high * high + back * back + rot * rot) + 1000 * across * across + ease, h, w, turn };
  }

  // Which way the elbow should point (a unit vector off the shoulder-to-wrist line) for a palm flat
  // on the glass: the preferred side, pole0, turned only as far as the arm's limits need, and a
  // little reluctant to leave where it is.
  _elbowFor(s, shoulder, palm, wrist0, pole0, now, ch) {
    const n = 48;
    const dir = wrist0.clone().sub(shoulder).normalize();
    const b0 = pole0.clone().sub(shoulder); b0.addScaledVector(dir, -b0.dot(dir)).normalize();
    const b1 = new THREE.Vector3().crossVectors(dir, b0);
    const at = (k) => b0.clone().multiplyScalar(Math.cos(k * 2 * Math.PI / n)).addScaledVector(b1, Math.sin(k * 2 * Math.PI / n));
    const cost = [];
    let best = 0;
    for (let i = 0; i < n; i++) {
      const k = i - n / 2, b = at(k);
      const phi = k * 2 * Math.PI / n, from = Math.acos(THREE.MathUtils.clamp(b.dot(now), -1, 1));
      cost[i] = this._armCost(s, shoulder, palm, b, wrist0, ch).cost + 0.1 * phi * phi + 0.05 * from * from;
      if (cost[i] < cost[best]) best = i;
    }
    // between samples: the bottom of a parabola through the best one and its neighbours
    const c0 = cost[(best + n - 1) % n], c1 = cost[best], c2 = cost[(best + 1) % n];
    const den = c0 - 2 * c1 + c2;
    return at(best - n / 2 + (den > 1e-9 ? THREE.MathUtils.clamp(0.5 * (c0 - c2) / den, -0.5, 0.5) : 0));
  }

  // The least an arm can strain (as _armCost, plus a little for the elbow off its preferred side)
  // putting the palm flat at `palm` from a shoulder at `shoulder`, over a coarse turn of the elbow.
  _armBest(s, shoulder, palm, ch) {
    const n = 16, pole0 = this._pole(s, shoulder, palm.y);
    const wrist0 = palm.clone().addScaledVector(_va.subVectors(shoulder, palm).normalize(), 0.09);
    const dir = wrist0.clone().sub(shoulder).normalize();
    const b0 = pole0.sub(shoulder); b0.addScaledVector(dir, -b0.dot(dir)).normalize();
    const b1 = new THREE.Vector3().crossVectors(dir, b0), b = new THREE.Vector3();
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const phi = (i - n / 2) * 2 * Math.PI / n;
      b.copy(b0).multiplyScalar(Math.cos(phi)).addScaledVector(b1, Math.sin(phi));
      best = Math.min(best, this._armCost(s, shoulder, palm, b, wrist0, ch).cost + 0.1 * phi * phi);
    }
    return best;
  }

  // How low to crouch: the depth that leaves the arms least strained, reaching each hand's spot on
  // the glass (goals: { s, palm, shoulder, ch, len, cap }, shoulders as posed now, crouched `now`),
  // with a spot out of reach counting against it, and standing tall preferred. A hand that can let
  // go strains no more than `cap`: past that, it lets go instead (see _strain).
  _crouchFor(goals, now, was) {
    const n = 6, cost = [], each = [];
    let best = 0;
    for (let i = 0; i < n; i++) {
      const c = (i / (n - 1)) * CROUCH, sh = new THREE.Vector3(), palm = new THREE.Vector3();
      let sum = CROUCH_COST * (0.3 * c + c * c) + 0.5 * (c - was) * (c - was);
      each[i] = {};
      for (const g of goals) {
        sh.copy(g.shoulder); sh.y += now - c;
        palm.copy(g.palm);
        const r = Math.sqrt(Math.max(0.01, g.len * g.len - sh.z * sh.z)), off = Math.hypot(palm.x - sh.x, palm.y - sh.y);
        let a = 0;
        if (off > r) { palm.x = sh.x + (palm.x - sh.x) * r / off; palm.y = sh.y + (palm.y - sh.y) * r / off; a = 20 * (off - r) * (off - r); }
        sum += Math.min(g.cap ?? Infinity, each[i][g.s] = a + this._armBest(g.s, sh, palm, g.ch));
      }
      cost[i] = sum;
      if (sum < cost[best]) best = i;
    }
    const c0 = cost[Math.max(0, best - 1)], c1 = cost[best], c2 = cost[Math.min(n - 1, best + 1)];
    const den = c0 - 2 * c1 + c2;
    const k = best > 0 && best < n - 1 && den > 1e-9 ? THREE.MathUtils.clamp(0.5 * (c0 - c2) / den, -0.5, 0.5) : 0;
    this._crouchCost = cost; this._strain = each[best];   // how strained each arm is there
    return ((best + k) / (n - 1)) * CROUCH;
  }

  // The hand flat on the glass with its palm centre at `palm` and the fingers carrying on along
  // the forearm, for an elbow pointing `bend`: the hand's rotation, the wrist, the fingers'
  // direction and the arm (solved together, twice round, starting from wrist0).
  _flatHand(s, palm, shoulder, bend, wrist0) {
    const rig = this.rig, pole = shoulder.clone().addScaledVector(bend, 0.5), q = new THREE.Quaternion();
    let wrist = wrist0, g, d;
    for (let i = 0; i < 2; i++) {
      g = rig.armFrame(s, wrist, pole, shoulder);
      d = V(g.f.x, g.f.y, 0);
      if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
      rig.handWorldQuat(s, d.normalize(), Z, q);
      wrist = rig.wristFor(s, palm, q, new THREE.Vector3());
    }
    return { q, wrist, g, d };
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

// `v` made square to the axis, as a unit vector (straight down, if it lies along the axis).
const _qa = new THREE.Quaternion(), _va = new THREE.Vector3();

function square(v, axis) {
  const o = v.clone().addScaledVector(axis, -v.dot(axis));
  if (o.lengthSq() < 1e-8) o.set(0, -1, 0).addScaledVector(axis, axis.y);
  return o.normalize();
}

// Signed angle from `a` round `axis` to `b` (both taken square to the axis).
function angleAbout(a, b, axis) {
  const p = a.clone().addScaledVector(axis, -a.dot(axis)), q = b.clone().addScaledVector(axis, -b.dot(axis));
  return Math.atan2(new THREE.Vector3().crossVectors(p, q).dot(axis), p.dot(q));
}

// Which way his elbows bend, from the clips themselves (the rig keeps it at a fixed roll).
function measureElbows(root, clips, rig) {
  const acc = {};
  for (const clip of clips) {
    if (!clip) continue;
    const mixer = new THREE.AnimationMixer(root), a = mixer.clipAction(clip).play();
    for (let i = 0; i < 24; i++) { a.time = (i / 24) * clip.duration; mixer.update(0); root.updateMatrixWorld(true); rig.measureElbows(acc); }
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  }
  rig.measureElbows(acc, true);
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, -BACK_Z), mat('floor', 0.9));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, BACK_Z / 2);
  const floorBase = new THREE.Mesh(floor.geometry, black); floorBase.rotation.copy(floor.rotation); floorBase.position.copy(floor.position); floorBase.position.y -= 0.001;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), mat('wall', 0.55));
  wall.position.set(0, 4, BACK_Z);
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
