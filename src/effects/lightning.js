import * as THREE from 'three';

// Camera-facing ribbon lightning, regenerated on world time (so it freezes
// with the Time Stone). Each bolt = one main channel + up to two forks.

const MAIN = 33; // 2^5 + 1 points
const FORK = 17;
const STRIPS = [MAIN, FORK, FORK];
const TOTAL = MAIN + FORK * 2;

const vertexShader = /* glsl */ `
  attribute float aSide;
  attribute float aFade;
  varying float vSide;
  varying float vFade;
  void main(){
    vSide = aSide;
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vSide;
  varying float vFade;
  void main(){
    float core = 1.0 - abs(vSide);
    float glow = core * core;
    vec3 col = uColor * glow * 2.2 + vec3(1.0) * pow(core, 7.0) * 2.5;
    gl_FragColor = vec4(col * uIntensity * vFade, glow * vFade * uIntensity);
  }
`;

function displace(points, a, b, i0, i1, rough, rand) {
  if (i1 - i0 < 2) return;
  const mid = (i0 + i1) >> 1;
  const p = points[mid].copy(points[i0]).lerp(points[i1], 0.5);
  const len = points[i0].distanceTo(points[i1]);
  rand.randomDirection();
  p.addScaledVector(rand, len * rough * (Math.random() * 0.9 + 0.1));
  displace(points, a, b, i0, mid, rough, rand);
  displace(points, a, b, mid, i1, rough, rand);
}

class Bolt {
  constructor(parent) {
    const verts = TOTAL * 2;
    this.positions = new Float32Array(verts * 3);
    const side = new Float32Array(verts);
    this.fade = new Float32Array(verts);
    for (let i = 0; i < TOTAL; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    const index = [];
    let base = 0;
    for (const n of STRIPS) {
      for (let i = 0; i < n - 1; i++) {
        const a = (base + i) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      base += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(index);
    this.uniforms = { uColor: { value: new THREE.Color() }, uIntensity: { value: 0 } };
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);

    this.pts = Array.from({ length: TOTAL }, () => new THREE.Vector3());
    this.widths = new Float32Array(TOTAL);
    this.forks = 0;
    this.active = false;
    this.life = 0;
    this.maxLife = 0;
    this.regenTimer = 0;
    this.start = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.width = 0.05;
    this.intensity = 1;
    this.rough = 0.22;
    this.follow = null;
  }

  regen() {
    const rand = new THREE.Vector3();
    const P = this.pts;
    P[0].copy(this.start);
    P[MAIN - 1].copy(this.end);
    displace(P, this.start, this.end, 0, MAIN - 1, this.rough, rand);
    for (let i = 0; i < MAIN; i++) this.widths[i] = this.width * (1 - (i / MAIN) * 0.75);

    this.forks = Math.random() < 0.85 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    for (let f = 0; f < 2; f++) {
      const off = MAIN + f * FORK;
      if (f >= this.forks) {
        for (let i = 0; i < FORK; i++) {
          P[off + i].copy(P[0]);
          this.widths[off + i] = 0;
        }
        continue;
      }
      const from = 4 + ((Math.random() * (MAIN - 10)) | 0);
      const s = P[from];
      const dir = P[Math.min(MAIN - 1, from + 4)].clone().sub(s).normalize();
      dir.add(rand.randomDirection().multiplyScalar(0.9)).normalize();
      const len = this.start.distanceTo(this.end) * (0.2 + Math.random() * 0.3);
      P[off].copy(s);
      P[off + FORK - 1].copy(s).addScaledVector(dir, len);
      displace(P, null, null, off, off + FORK - 1, this.rough * 1.1, rand);
      const w0 = this.widths[from] * 0.6;
      for (let i = 0; i < FORK; i++) this.widths[off + i] = w0 * (1 - i / FORK);
    }
    this.flicker = 0.6 + Math.random() * 0.4;
  }

  // Build the camera-facing ribbon.
  layout(camPos) {
    const P = this.pts;
    const pos = this.positions;
    const tan = new THREE.Vector3();
    const view = new THREE.Vector3();
    const side = new THREE.Vector3();
    let base = 0;
    for (const n of STRIPS) {
      for (let i = 0; i < n; i++) {
        const k = base + i;
        const a = P[base + Math.max(0, i - 1)];
        const b = P[base + Math.min(n - 1, i + 1)];
        tan.copy(b).sub(a).normalize();
        view.copy(camPos).sub(P[k]).normalize();
        side.crossVectors(tan, view).normalize().multiplyScalar(this.widths[k]);
        pos[k * 6] = P[k].x - side.x;
        pos[k * 6 + 1] = P[k].y - side.y;
        pos[k * 6 + 2] = P[k].z - side.z;
        pos[k * 6 + 3] = P[k].x + side.x;
        pos[k * 6 + 4] = P[k].y + side.y;
        pos[k * 6 + 5] = P[k].z + side.z;
        const t = i / (n - 1);
        const fade = Math.min(1, t * 8) * (1 - Math.pow(t, 3));
        this.fade[k * 2] = this.fade[k * 2 + 1] = fade;
      }
      base += n;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aFade.needsUpdate = true;
  }
}

export class Lightning {
  constructor(scene, count = 18) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bolts = Array.from({ length: count }, () => new Bolt(this.group));
    this._v = new THREE.Vector3();
  }

  /**
   * Fire a bolt. `startFn(out)` / `endFn(out)` may be provided to track moving
   * anchors (e.g. a socket on the hovering gauntlet).
   */
  spawn({ start, end, color, width = 0.05, life = 0.6, intensity = 1, rough = 0.22, startFn, endOffset }) {
    let b = this.bolts.find((x) => !x.active);
    if (!b) b = this.bolts.reduce((m, x) => (x.life > m.life ? x : m), this.bolts[0]);
    b.active = true;
    b.life = 0;
    b.maxLife = life;
    b.width = width;
    b.intensity = intensity;
    b.rough = rough;
    b.startFn = startFn || null;
    b.endOffset = endOffset ? endOffset.clone() : null;
    if (start) b.start.copy(start);
    if (b.startFn) b.startFn(b.start);
    if (end) b.end.copy(end);
    else if (b.endOffset) b.end.copy(b.start).add(b.endOffset);
    b.uniforms.uColor.value.set(color);
    b.regen();
    b.regenTimer = 0;
    b.mesh.visible = true;
    return b;
  }

  clear() {
    for (const b of this.bolts) {
      b.active = false;
      b.mesh.visible = false;
    }
  }

  update(simDt, camPos) {
    for (const b of this.bolts) {
      if (!b.active) continue;
      // Lifetime and flicker follow world time — frozen when time stops.
      b.life += Math.max(0, simDt);
      if (b.life >= b.maxLife) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      b.regenTimer += Math.max(0, simDt);
      if (b.regenTimer > 0.055 + Math.random() * 0.04) {
        b.regenTimer = 0;
        if (b.startFn) {
          b.startFn(b.start);
          if (b.endOffset) b.end.copy(b.start).add(b.endOffset);
        }
        b.regen();
      }
      const p = b.life / b.maxLife;
      const env = Math.min(1, p * 10) * (1 - Math.pow(p, 4));
      b.uniforms.uIntensity.value = b.intensity * env * b.flicker;
      b.layout(camPos);
    }
  }
}
