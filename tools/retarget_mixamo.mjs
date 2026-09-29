// Retarget Mixamo clips onto the lifetime rig and bake them to assets/models/lifetime-moves.json.
//
//   npm i three@0.170.0
//   curl -O https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/Xbot.glb
//   node tools/retarget_mixamo.mjs Xbot.glb assets/models/lifetime.glb assets/models/lifetime-moves.json
//
// Xbot carries Mixamo's idle, walk, agree and headShake (saved here as idle, walk, nod, shake). Each mapped bone gets the source's
// world-space rotation change from its rest pose, applied on top of a target rest pose that is
// first bent to point where the source's bones point (lifetime's arms rest lower than a T-pose).
// Hips keep their vertical bob; the page moves him across the floor itself.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fs from 'fs';

const [srcPath, dstPath, outPath] = process.argv.slice(2);
const load = (p) => {
  const b = fs.readFileSync(p);
  return new Promise((res, rej) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
};
const src = await load(srcPath), dst = await load(dstPath);
const S = {}, T = {};
src.scene.traverse((o) => { if (o.isBone) S[o.name.replace('mixamorig', '')] = o; });
dst.scene.traverse((o) => { if (o.isBone) T[o.name] = o; });
src.scene.updateMatrixWorld(true); dst.scene.updateMatrixWorld(true);

// [source, target, source child, target child] (children give each bone's direction)
const MAP = [
  ['Hips', 'spine', 'Spine', 'spine001'],
  ['Spine', 'spine001', 'Spine1', 'spine002'],
  ['Spine1', 'spine002', 'Spine2', 'spine003'],
  ['Spine2', 'spine003', 'Neck', 'spine004'],
  ['Neck', 'spine004', 'Head', 'spine006'],
  ['Head', 'spine006', null, null],
];
for (const [s, t] of [['Left', 'L'], ['Right', 'R']]) MAP.push(
  [s + 'Shoulder', 'shoulder' + t, s + 'Arm', 'upper_arm' + t],
  [s + 'Arm', 'upper_arm' + t, s + 'ForeArm', 'forearm' + t],
  [s + 'ForeArm', 'forearm' + t, s + 'Hand', 'hand' + t],
  [s + 'Hand', 'hand' + t, s + 'HandMiddle1', 'f_middle01' + t],
  [s + 'UpLeg', 'thigh' + t, s + 'Leg', 'shin' + t],
  [s + 'Leg', 'shin' + t, s + 'Foot', 'foot' + t],
  [s + 'Foot', 'foot' + t, s + 'ToeBase', 'toe' + t],
  [s + 'ToeBase', 'toe' + t, null, null],
);

const wq = (b) => b.getWorldQuaternion(new THREE.Quaternion());
const wp = (b) => b.getWorldPosition(new THREE.Vector3());
const depth = (b) => { let d = 0; while (b.parent) { b = b.parent; d++; } return d; };
const ref = MAP.map(([s, t, sc, tc]) => {
  const C = new THREE.Quaternion();
  if (sc) C.setFromUnitVectors(wp(T[tc]).sub(wp(T[t])).normalize(), wp(S[sc]).sub(wp(S[s])).normalize());
  return { s: S[s], t: T[t], Qs0inv: wq(S[s]).invert(), QtRef: C.multiply(wq(T[t])) };
}).sort((a, b) => depth(a.t) - depth(b.t));

const hips = T.spine, hips0 = hips.position.clone(), srcHip0 = wp(S.Hips);
const hipScale = wp(hips).y / srcHip0.y;
const rest = new Map(Object.values(T).map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
const reset = () => { for (const [b, r] of rest) { b.quaternion.copy(r.q); b.position.copy(r.p); } dst.scene.updateMatrixWorld(true); };
const parentQ = hips.parent.getWorldQuaternion(new THREE.Quaternion()), parentS = hips.parent.getWorldScale(new THREE.Vector3());

const FPS = { idle: 15, walk: 30, agree: 20, headShake: 20 };
const NAME = { idle: 'idle', walk: 'walk', agree: 'nod', headShake: 'shake' };
const mixer = new THREE.AnimationMixer(src.scene), out = {}, q = new THREE.Quaternion();
for (const name of Object.keys(FPS)) {
  const clip = src.animations.find((a) => a.name === name);
  mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
  const n = Math.round(clip.duration * FPS[name]), times = [], rot = new Map(ref.map((r) => [r.t.name, []])), bob = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * clip.duration; times.push(+t.toFixed(4));
    mixer.setTime(t); src.scene.updateMatrixWorld(true); reset();
    const d = wp(S.Hips).sub(srcHip0).multiplyScalar(hipScale);
    if (name === 'walk') { d.x = 0; d.z = 0; }                       // walking in place
    hips.position.copy(hips0).add(d.applyQuaternion(parentQ.clone().invert()).divide(parentS));
    hips.updateMatrixWorld(true);
    for (const r of ref) {
      r.t.parent.getWorldQuaternion(q);
      r.t.quaternion.copy(q.invert().multiply(wq(r.s).multiply(r.Qs0inv).multiply(r.QtRef)));
      r.t.updateMatrixWorld(true);
      rot.get(r.t.name).push(...r.t.quaternion.toArray().map((v) => +v.toFixed(4)));
    }
    bob.push(...hips.position.toArray().map((v) => +v.toFixed(4)));
  }
  const tracks = [...rot].map(([bone, values]) => ({ name: bone + '.quaternion', type: 'quaternion', times, values }));
  tracks.push({ name: 'spine.position', type: 'vector', times, values: bob });
  out[NAME[name]] = { duration: clip.duration, tracks };
}
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes');
