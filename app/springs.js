// Critically damped springs. Exact closed-form step, so any frame time is stable
// and nothing ever overshoots or jumps: values can only arrive late, never teleport.
import * as THREE from 'three';

export function springStep(x, v, target, omega, dt) {
  const x0 = x - target;
  const e = Math.exp(-omega * dt);
  const k = v + omega * x0;
  return [target + (x0 + k * dt) * e, (v - omega * k * dt) * e];
}

export class Spring {
  constructor(value = 0, hz = 3) {
    this.x = value; this.v = 0; this.omega = 2 * Math.PI * hz;
  }
  set hz(h) { this.omega = 2 * Math.PI * h; }
  update(target, dt) {
    [this.x, this.v] = springStep(this.x, this.v, target, this.omega, dt);
    return this.x;
  }
  snap(value) { this.x = value; this.v = 0; }
}

export class Spring3 {
  constructor(value = new THREE.Vector3(), hz = 3) {
    this.x = value.clone(); this.v = new THREE.Vector3(); this.omega = 2 * Math.PI * hz;
  }
  set hz(h) { this.omega = 2 * Math.PI * h; }
  update(target, dt) {
    const w = this.omega, e = Math.exp(-w * dt);
    for (const c of ['x', 'y', 'z']) {
      const x0 = this.x[c] - target[c];
      const k = this.v[c] + w * x0;
      this.x[c] = target[c] + (x0 + k * dt) * e;
      this.v[c] = (this.v[c] - w * k * dt) * e;
    }
    return this.x;
  }
  snap(value) { this.x.copy(value); this.v.set(0, 0, 0); }
}

// Quaternion follower: exponential slerp toward the target (frame-rate independent).
export class QuatFollow {
  constructor(q = new THREE.Quaternion(), hz = 3) { this.q = q.clone(); this.hz = hz; }
  update(target, dt) {
    const t = 1 - Math.exp(-2 * Math.PI * this.hz * dt);
    this.q.slerp(target, t);
    return this.q;
  }
  snap(q) { this.q.copy(q); }
}

// Smooth value noise for idle motion (deterministic, cheap).
export function noise1(t, seed = 0) {
  const i = Math.floor(t), f = t - i;
  const h = (n) => { const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}
