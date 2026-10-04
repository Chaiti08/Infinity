import * as THREE from 'three';
import { VALUE_NOISE3 } from '../core/glsl.js';

// Uniforms shared by every material that can glow (rim light in the stones'
// colour) or dissolve into dust during the snap.
export const sharedUniforms = {
  uRimColor: { value: new THREE.Color(0x48c8ff) },
  uRimStrength: { value: 0.12 },
  uRimPower: { value: 2.6 },
  uDissolve: { value: 0 },
  uSweepDir: { value: new THREE.Vector3(1, 0, 0) },
  uSweepCenter: { value: new THREE.Vector3(0, 0, 0) },
  uSweepRange: { value: 5.0 },
  uEdgeColor: { value: new THREE.Color(3.0, 1.2, 0.35) },
};

// Mirrors the GLSL threshold so CPU-side dust particles leave the surface at
// the same moment the surface under them is eaten away.
export function dissolveSweep(worldPos) {
  const u = sharedUniforms;
  const d = worldPos.clone().sub(u.uSweepCenter.value).dot(u.uSweepDir.value);
  return THREE.MathUtils.clamp(d / u.uSweepRange.value + 0.5, 0, 1);
}

/**
 * Inject rim glow + dissolve into a built-in lit material.
 * opts.rim: apply the stone-coloured rim light (gauntlet only).
 */
export function enhanceMaterial(material, opts = {}) {
  const rim = opts.rim !== false;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform vec3 uRimColor; uniform float uRimStrength; uniform float uRimPower;
        uniform float uDissolve; uniform vec3 uSweepDir; uniform vec3 uSweepCenter; uniform float uSweepRange;
        uniform vec3 uEdgeColor;
        ${VALUE_NOISE3}
        float dissolveField(){
          float s = clamp(dot(vWPos - uSweepCenter, uSweepDir) / uSweepRange + 0.5, 0.0, 1.0);
          return s * 0.72 + vnoise(vWPos * 7.0) * 0.28;
        }`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float dField = dissolveField();
        float dCut = uDissolve * 1.25 - 0.12;
        if (uDissolve > 0.0 && dField < dCut) discard;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${
          rim
            ? `float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPower);
               totalEmissiveRadiance += uRimColor * fres * uRimStrength;`
            : ''
        }
        if (uDissolve > 0.0) {
          float edge = 1.0 - smoothstep(0.0, 0.06, dField - dCut);
          totalEmissiveRadiance += uEdgeColor * edge * 2.5;
        }`
      );
  };
  material.customProgramCacheKey = () => (rim ? 'enh-rim' : 'enh');
  return material;
}

// Procedural micro-surface: brushed streaks, wear and scratches, so the gold
// catches light unevenly like real worked metal.
function makeSurfaceTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(205,205,205)';
  g.fillRect(0, 0, size, size);

  // soft blotches (wear)
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    const v = 150 + Math.random() * 100;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // brushed streaks
  g.globalAlpha = 0.08;
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * size;
    const v = Math.random() > 0.5 ? 255 : 120;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = Math.random() * 1.5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(size, y + (Math.random() - 0.5) * 6);
    g.stroke();
  }
  // fine scratches
  g.globalAlpha = 0.35;
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * Math.PI;
    const l = 6 + Math.random() * 40;
    const v = Math.random() > 0.5 ? 255 : 90;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let cache = null;
export function getGauntletMaterials() {
  if (cache) return cache;
  const surface = makeSurfaceTexture();

  // Gold tinted toward the poster: warm, slightly bronzed, with cool cyan
  // reflections coming from the environment rather than the albedo.
  const gold = enhanceMaterial(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#c99442'),
      metalness: 1,
      roughness: 0.32,
      roughnessMap: surface,
      bumpMap: surface,
      bumpScale: 0.35,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.0,
    })
  );
  const goldDark = enhanceMaterial(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#7a5420'),
      metalness: 1,
      roughness: 0.42,
      roughnessMap: surface,
      envMapIntensity: 0.9,
    })
  );
  const goldBright = enhanceMaterial(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#e2b660'),
      metalness: 1,
      roughness: 0.18,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.2,
    })
  );
  const socket = enhanceMaterial(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#2a1d0f'),
      metalness: 0.9,
      roughness: 0.55,
    }),
    { rim: false }
  );
  cache = { gold, goldDark, goldBright, socket, surface };
  return cache;
}
