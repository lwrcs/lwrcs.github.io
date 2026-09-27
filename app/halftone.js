// Port of the "Pixel Shaded.005" Blender material.
//
// Blender graph, decoded: lighting luminance (Principled -> Shader to RGB) is split
// into four constant bands, each filled with a screen-space pattern made from a
// 45-degree-rotated Manhattan Voronoi. In screen pixels those patterns are plain
// pixel-art dithers:
//   L <  0.386          black
//   0.386 <= L < 0.636  sparse dots (1 lit pixel in 8, diamond lattice)
//   0.636 <= L < 1.0    checkerboard
//   L >= 1.0            solid ink
// Ink is the emission blue, measured from the viewport render at #0000CE.
import * as THREE from 'three';

export const INK = 0x0000ce;

// One pixel-size uniform per renderer, so every material in a canvas shares it.
export function pixelUniform(cssPx = 2) {
  return { value: cssPx * Math.min(window.devicePixelRatio || 1, 2) };
}

export function halftoneMaterial({
  pixel,                    // shared { value } in device pixels
  ink = INK,
  paper = 0x000000,
  base = 0xd9d9d9,          // albedo feeding the lighting term
  bands = [0.386, 0.636, 1.0],
  gain = 1.0,               // global exposure on L
  lift = 0.0,               // added to L, so faces turned away from every light still read
  side = THREE.FrontSide,
} = {}) {
  const m = new THREE.MeshLambertMaterial({ color: base, side });
  m.userData.uniforms = {
    uPixel: pixel,
    uInk: { value: new THREE.Color(ink) },
    uPaper: { value: new THREE.Color(paper) },
    uBands: { value: new THREE.Vector3(...bands) },
    uGain: { value: gain },
    uLift: { value: lift },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, m.userData.uniforms);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uPixel; uniform vec3 uInk; uniform vec3 uPaper; uniform vec3 uBands; uniform float uGain; uniform float uLift;
        float htPattern(float L) {
          vec2 q = floor(gl_FragCoord.xy / uPixel);
          float checker = mod(q.x + q.y, 2.0);
          vec2 m4 = mod(q, 4.0);
          float sparse = ((m4.x < 0.5 && m4.y < 0.5) || (abs(m4.x - 2.0) < 0.5 && abs(m4.y - 2.0) < 0.5)) ? 1.0 : 0.0;
          if (L >= uBands.z) return 1.0;
          if (L >= uBands.y) return 1.0 - checker;
          if (L >= uBands.x) return sparse;
          return 0.0;
        }`)
      .replace('#include <opaque_fragment>', `
        float L = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)) * uGain + uLift;
        gl_FragColor = vec4(mix(uPaper, uInk, htPattern(L)), 1.0);`);
  };
  m.customProgramCacheKey = () => 'halftone';
  return m;
}

export function inkMaterial(color = 0x000000, side = THREE.FrontSide) {
  return new THREE.MeshBasicMaterial({ color, side });
}

// Inverted hull outline for meshes that relied on Grease Pencil Line Art in Blender.
export function hullMaterial(width = 0.012, color = 0x000000) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uHull = { value: width };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uHull;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(objectNormal) * uHull;');
  };
  m.customProgramCacheKey = () => 'hull' + width;
  return m;
}

// Swap the glTF materials (named after the Blender ones) for the web versions.
export function applyCharacterMaterials(root, pixel, opts = {}) {
  const shaded = halftoneMaterial({ pixel, ...opts });
  const outline = inkMaterial(opts.paper ?? 0x000000);
  const blue = inkMaterial(opts.ink ?? INK);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (mat) => {
      const n = mat.name || '';
      if (n.startsWith('Pixel Shaded')) return shaded;
      if (n === 'Red.002') return blue;
      return outline; // 'Red', 'Pixel Outline': the black solidify shells
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.frustumCulled = false;
  });
  return { shaded, outline, blue };
}
