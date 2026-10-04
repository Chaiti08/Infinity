import * as THREE from 'three';
import { SIMPLEX3 } from '../core/glsl.js';

// Glow for one stone, built from layers (inspired by the film reference art):
//   1. a glassy gem that glows from inside (custom shader, no env reflections)
//   2. a small hot white core and a wide, smooth halo
//   3. a signature effect per stone: smoke (reality), stars (space),
//      lightning (power), a ring (time), sparkles (mind), light rays (soul)
// Everything is in the gem's local units (the gem is roughly 2 across) and is
// driven by world time, so the Time Stone freezes it like the rest of the scene.

export const KIND = { reality: 0, space: 1, mind: 2, soul: 3, time: 4, power: 5 };
const COUNTS = { high: 110, medium: 70, low: 40 };
const TILT = 1.0; // time-ring tilt (radians)

// ---------------------------------------------------------------- textures
let texCache = null;
function textures() {
  if (texCache) return texCache;
  const make = (w, h, fn) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = Math.max(0, Math.min(1, fn(x / (w - 1), y / (h - 1))));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  texCache = {
    // Smooth gaussian falloff that reaches exactly zero at the edge (no visible disc).
    halo: make(128, 128, (u, v) => {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      return Math.exp(-r * r * 3.2) * (1 - smooth(0.7, 1, r));
    }),
    // Thin ray: bright in the middle, long soft ends.
    streak: make(256, 32, (u, v) => {
      const x = Math.abs(u * 2 - 1);
      const y = (v - 0.5) * 2;
      return Math.pow(1 - x, 2.2) * Math.exp(-y * y * 14) * (1 - smooth(0.9, 1, x));
    }),
  };
  return texCache;
}

// -------------------------------------------------------------------- gem
export function makeGemMaterial(color, seed) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uBoost: { value: 1 },
      uSeed: { value: seed },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        vP = position;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uBoost, uSeed;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      ${SIMPLEX3}
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        float f = clamp(dot(n, v), 0.0, 1.0);
        float rim = pow(1.0 - f, 2.2);
        // Slow swirling depth inside the stone.
        float s1 = snoise(vP * 1.5 + vec3(0.0, uTime * 0.22, uSeed)) * 0.5 + 0.5;
        float s2 = snoise(vP * 3.3 - vec3(uTime * 0.18, uSeed, 0.0)) * 0.5 + 0.5;
        float depth = pow(f, 1.3);
        vec3 body = mix(uColor * 0.30, uColor * 1.15, depth * (0.5 + 0.5 * s1));
        body += uColor * s2 * s2 * 0.4 * depth;
        vec3 hot = mix(uColor, vec3(1.0), 0.45) * pow(f, 5.0) * 0.8;
        vec3 col = body + hot + uColor * rim * 1.2;
        // Glassy highlight from a fixed key light (camera space, so it never blotches).
        vec3 L = normalize(vec3(-0.45, 0.7, 0.85));
        float spec = pow(max(dot(reflect(-L, n), v), 0.0), 55.0);
        col += vec3(1.0) * spec * 0.85;
        gl_FragColor = vec4(col * uBoost, 1.0);
      }
    `,
  });
}

// --------------------------------------------------------------- particles
function makeParticles(kind, color, count) {
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = {
    uTime: { value: 0 },
    uKind: { value: kind },
    uColor: { value: color.clone() },
    uBoost: { value: 1 },
    uCalm: { value: 1 },
    uVis: { value: 1 },
    uViewH: { value: 800 },
    uWorldScale: { value: 0.25 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uKind, uCalm, uVis, uViewH, uWorldScale;
      varying float vA; varying float vTint;
      const float PI = 3.14159265;
      float hash(float x){ return fract(sin(x) * 43758.5453); }
      void main(){
        float t = uTime;
        vec4 s = aSeed;
        vec3 p = vec3(0.0);
        float size = 0.2;
        float a = 0.0;
        vTint = s.z;
        float life = fract(s.x + t * (0.12 + 0.2 * s.y));
        float env = sin(PI * life);
        vec3 d = normalize(s.xyz * 2.0 - 1.0 + 0.001);
        if (uKind < 0.5) {            // reality: smoke swirling around the gem
          float ang = s.z * 6.2832 + t * (0.2 + 0.35 * s.y) * (s.w > 0.5 ? 1.0 : -1.0);
          float rad = 0.95 + 1.2 * life;
          p = vec3(cos(ang) * rad, sin(ang) * rad * 0.85, (s.w - 0.5) * 0.8);
          size = 0.9 + 1.4 * s.y;
          a = env * 0.26;
        } else if (uKind < 1.5) {     // space: stars drifting inside
          float r = pow(s.w, 0.6) * 0.8;
          float ang = t * 0.18;
          vec3 q = d * r * vec3(1.0, 1.2, 0.6);
          p = vec3(q.x * cos(ang) - q.z * sin(ang), q.y, q.x * sin(ang) + q.z * cos(ang));
          size = 0.08 + 0.12 * s.z;
          a = (0.5 + 0.5 * sin(t * (2.0 + s.y * 5.0) + s.x * 40.0)) * 0.95;
        } else if (uKind < 2.5) {     // mind: sparkles rising
          float ang = s.z * 6.2832 + t * 0.3;
          float rad = 0.25 + 1.0 * s.w;
          p = vec3(cos(ang) * rad, -0.7 + life * 2.6, sin(ang) * rad * 0.6);
          p.x += sin(t * 1.3 + s.x * 30.0) * 0.12;
          size = 0.14 + 0.22 * s.y;
          a = env * (0.5 + 0.5 * sin(t * (4.0 + s.x * 6.0) + s.z * 20.0));
        } else if (uKind < 3.5) {     // soul: sparks flying outward
          float l = fract(s.x + t * (0.25 + 0.3 * s.y));
          p = d * (0.55 + l * 2.4) * vec3(1.0, 1.0, 0.7);
          size = (0.16 + 0.2 * s.w) * (1.0 - l * 0.6);
          a = pow(1.0 - l, 1.4) * 0.95;
        } else if (uKind < 4.5) {     // time: a ring of light
          float ang = s.x * 6.2832 + t * 0.7;
          float R = 1.6 + (s.y - 0.5) * 0.06;
          p = vec3(cos(ang) * R, sin(ang) * R * cos(${TILT.toFixed(3)}), sin(ang) * R * sin(${TILT.toFixed(3)}));
          size = 0.1 + 0.08 * s.z;
          float c = 0.5 + 0.5 * sin(ang * 2.0 - t * 2.5);
          a = 0.35 + 0.65 * c * c;
        } else {                       // power: crackling sparks
          float l = fract(s.x + t * (1.8 + 2.0 * s.y));
          p = d * (1.0 + 0.8 * s.w) * (1.0 + 0.3 * l);
          size = 0.1 + 0.12 * s.z;
          a = step(0.55, hash(floor(t * 14.0 + s.x * 100.0))) * (1.0 - l);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(size * uWorldScale * uViewH * 0.5 * projectionMatrix[1][1] / max(0.1, -mv.z), 160.0);
        vA = a * uCalm * uVis;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uKind, uBoost;
      varying float vA; varying float vTint;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float g = exp(-d * d * (uKind < 0.5 ? 2.6 : 5.0)) * (1.0 - smoothstep(0.8, 1.0, d));
        vec3 col = uColor * 1.6;
        if (uKind > 0.5 && uKind < 1.5) col = mix(vec3(0.85, 0.92, 1.0), uColor * 1.5, vTint);
        col = mix(col, vec3(1.0), g * g * (uKind < 0.5 ? 0.0 : 0.45));
        gl_FragColor = vec4(col, g * vA * min(uBoost, 2.5));
      }
    `,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ------------------------------------------------------------ lightning arcs
class Arcs {
  constructor(color, n = 4, segs = 14) {
    this.group = new THREE.Group();
    this.segs = segs;
    this.lines = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 3), 3));
      const m = new THREE.LineBasicMaterial({
        color: color.clone().multiplyScalar(3.0),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const l = new THREE.Line(g, m);
      l.frustumCulled = false;
      this.lines.push(l);
      this.group.add(l);
    }
    this.tick = -1;
  }

  update(time, boost, calm, vis) {
    const tick = Math.floor(time * 16);
    const h = (x) => {
      const v = Math.sin(x) * 43758.5453;
      return v - Math.floor(v);
    };
    const visible = calm < 1 ? 2 : this.lines.length;
    this.lines.forEach((l, i) => {
      l.visible = i < visible && vis > 0.01;
      l.material.opacity = Math.min(1, 0.55 * boost) * (0.55 + 0.45 * h(tick * 3.1 + i)) * calm * vis;
      if (!l.visible || tick === this.tick) return;
      const a = h(tick * 7.13 + i * 3.7) * 6.2832;
      const b = h(tick * 5.31 + i * 1.9) * 2 - 1;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - b * b), b, Math.sin(a) * Math.sqrt(1 - b * b));
      const start = dir.clone().multiplyScalar(0.8);
      const end = dir.clone().multiplyScalar(1.9 + h(tick + i * 9) * 0.9);
      end.x += (h(tick * 2.1 + i) - 0.5) * 1.4;
      end.y += (h(tick * 4.7 + i) - 0.5) * 1.4;
      const pos = l.geometry.attributes.position;
      for (let k = 0; k < this.segs; k++) {
        const u = k / (this.segs - 1);
        const amp = Math.sin(u * Math.PI) * 0.3;
        pos.setXYZ(
          k,
          THREE.MathUtils.lerp(start.x, end.x, u) + (h(tick * 11.3 + i * 17 + k) - 0.5) * amp,
          THREE.MathUtils.lerp(start.y, end.y, u) + (h(tick * 13.7 + i * 19 + k) - 0.5) * amp,
          THREE.MathUtils.lerp(start.z, end.z, u) + (h(tick * 17.9 + i * 23 + k) - 0.5) * amp
        );
      }
      pos.needsUpdate = true;
    });
    this.tick = tick;
  }
}

// ------------------------------------------------------------- stone glow
export class StoneGlow {
  constructor(def, color, quality, seed) {
    this.def = def;
    this.kind = KIND[def.id] ?? 0;
    this.group = new THREE.Group();
    const tex = textures();

    // Hot white core + wide smooth halo.
    this.coreMat = new THREE.SpriteMaterial({
      map: tex.halo,
      color: new THREE.Color(1, 1, 1).lerp(color, 0.6).multiplyScalar(1.2),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.7,
    });
    this.core = new THREE.Sprite(this.coreMat);
    this.core.scale.setScalar(1.5);
    this.group.add(this.core);

    this.haloMat = new THREE.SpriteMaterial({
      map: tex.halo,
      color: color.clone().multiplyScalar(1.5),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.55,
    });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(5.2);
    this.group.add(this.halo);

    this.particles = makeParticles(this.kind, color, COUNTS[quality.name] ?? 70);
    this.group.add(this.particles);

    const id = def.id;
    if (id === 'power') {
      this.arcs = new Arcs(color);
      this.group.add(this.arcs.group);
    }
    if (id === 'time') {
      this.ringMat = new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(2.0),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.64, 96), this.ringMat);
      this.ring.rotation.x = TILT;
      this.group.add(this.ring);
    }
    if (id === 'soul') {
      this.rays = [];
      for (let i = 0; i < 7; i++) {
        const m = new THREE.SpriteMaterial({
          map: tex.streak,
          color: color.clone().multiplyScalar(1.8),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.4,
        });
        const sp = new THREE.Sprite(m);
        sp.userData.base = (i / 7) * Math.PI + (seed % 1) * 0.5;
        this.rays.push(sp);
        this.group.add(sp);
      }
    }
    if (id === 'space') {
      this.hazeMat = new THREE.SpriteMaterial({
        map: tex.halo,
        color: new THREE.Color(0.45, 0.3, 1.0),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.22,
      });
      const haze = new THREE.Sprite(this.hazeMat);
      haze.scale.setScalar(3.6);
      this.group.add(haze);
    }
  }

  // boost: hover/pulse brightness; calm: <1 when socketed; vis: fade 0..1.
  update({ time, boost, calm, vis, worldScale, viewH }) {
    const u = this.particles.material.uniforms;
    u.uTime.value = time;
    u.uBoost.value = boost;
    u.uCalm.value = calm;
    u.uVis.value = vis;
    u.uViewH.value = viewH;
    u.uWorldScale.value = worldScale;

    this.coreMat.opacity = Math.min(1, 0.4 * boost) * vis * (0.9 + 0.1 * Math.sin(time * 3.0));
    this.haloMat.opacity = Math.min(1, 0.4 * boost * (calm < 1 ? 1.15 : 1)) * vis;
    this.halo.scale.setScalar(calm < 1 ? 4.4 : 5.2);

    this.arcs?.update(time, boost, calm, vis);
    if (this.ring) this.ringMat.opacity = (0.22 + 0.12 * Math.sin(time * 2.2)) * boost * calm * vis;
    if (this.hazeMat) this.hazeMat.opacity = 0.2 * boost * vis;
    if (this.rays) {
      this.rays.forEach((r, i) => {
        r.material.rotation = r.userData.base + time * 0.12;
        const len = 3.4 + 1.6 * Math.sin(time * 1.7 + i * 2.1);
        r.scale.set(len, 0.3, 1);
        r.material.opacity = (0.28 + 0.14 * Math.sin(time * 2.3 + i)) * Math.min(boost, 2) * calm * vis;
      });
    }
  }
}
