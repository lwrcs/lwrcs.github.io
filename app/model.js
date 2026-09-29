// Loading the character.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The model is fetched here rather than by GLTFLoader: sandboxed hosts (the preview artifact)
// refuse to fetch data: URIs, so a .gltf with its buffer embedded is repacked as a GLB first.
export async function loadModel(url, onProgress = () => {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  let bytes;
  if (res.body && total) {
    const reader = res.body.getReader(), parts = [];
    let got = 0;
    for (let r; !(r = await reader.read()).done; ) { parts.push(r.value); got += r.value.length; onProgress(got / total); }
    bytes = new Uint8Array(got);
    let o = 0;
    for (const p of parts) { bytes.set(p, o); o += p.length; }
  } else bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder();
  if (text.decode(bytes.subarray(0, 4)) !== 'glTF') bytes = packGLB(JSON.parse(text.decode(bytes)));
  return new GLTFLoader().parseAsync(bytes.buffer, '');
}

// glTF JSON whose first buffer is a data: URI -> GLB bytes (JSON chunk + BIN chunk)
function packGLB(json) {
  const uri = json.buffers?.[0]?.uri;
  let bin = new Uint8Array(0);
  if (uri?.startsWith('data:')) {
    const s = atob(uri.slice(uri.indexOf(',') + 1));
    bin = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
    delete json.buffers[0].uri;
  }
  const js = new TextEncoder().encode(JSON.stringify(json));
  const jl = (js.length + 3) & ~3, bl = (bin.length + 3) & ~3;
  const out = new Uint8Array(20 + jl + (bl ? 8 + bl : 0));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20); out.fill(0x20, 20 + js.length, 20 + jl);
  if (bl) { dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004e4942, true); out.set(bin, 28 + jl); }
  return out;
}
