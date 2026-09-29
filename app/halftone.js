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

// Blue mode: every pixel is either black or pure #0000FF. One shared uniform flips all materials.
export const blueU = { value: 0 };

// 4x4 ordered-dither threshold for a pixel cell, in [0, 1).
export const BAYER_GLSL = `
  const float BAYER4[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  float bayer4(vec2 q) {
    ivec2 m = ivec2(mod(q, 4.0));
    return (BAYER4[m.x + m.y * 4] + 0.5) / 16.0;
  }`;

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
  tone = false,             // blue mode: keep light and dark objects apart by scaling L with the ink's brightness
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
    uBlue: blueU,
    uTone: { value: tone ? 1 : 0 },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, m.userData.uniforms);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uPixel; uniform vec3 uInk; uniform vec3 uPaper; uniform vec3 uBands; uniform float uGain; uniform float uLift;
        uniform float uBlue; uniform float uTone;
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
        float inkLum = dot(uInk, vec3(0.2126, 0.7152, 0.0722));
        L *= mix(1.0, 0.3 + 1.4 * sqrt(inkLum), uBlue * uTone);
        vec3 ink = mix(uInk, vec3(0.0, 0.0, 1.0), uBlue);
        gl_FragColor = vec4(mix(uPaper * (1.0 - uBlue), ink, htPattern(L)), 1.0);`);
  };
  m.customProgramCacheKey = () => 'halftone2';
  return m;
}

// Flat colour. Anything that isn't black turns pure blue in blue mode.
export function inkMaterial(color = 0x000000, side = THREE.FrontSide) {
  const m = new THREE.MeshBasicMaterial({ color, side });
  if (!color) return m;
  m.onBeforeCompile = (s) => {
    s.uniforms.uBlue = blueU;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBlue;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0, 0.0, 1.0), uBlue);');
  };
  m.customProgramCacheKey = () => 'ink-blue';
  return m;
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
      if ((mat.name || '').startsWith('Pixel Shaded')) return shaded;
      const e = mat.emissive;
      if (e && e.b > 0.5 && e.r < 0.5 && e.g < 0.5) return blue;   // his blue-emission materials
      return outline; // 'Red', 'Pixel Outline': the black solidify shells
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.frustumCulled = false;
  });
  return { shaded, outline, blue };
}
