import * as THREE from 'three';
import { SIMPLEX3, HASH } from '../core/glsl.js';

// ---------------------------------------------------------------------------
// Space: hyperspace streaks, attached to the camera.
// ---------------------------------------------------------------------------
export class Warp {
  constructor(camera, count = 600) {
    const pos = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.pow(Math.random(), 0.6) * 40;
      const z0 = Math.random() * 300;
      for (let k = 0; k < 2; k++) {
        pos.set([Math.cos(a) * r, Math.sin(a) * r, z0], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.uniforms = { uTime: { value: 0 }, uIntensity: { value: 0 } };
    this.lines = new THREE.LineSegments(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aEnd;
          uniform float uTime, uIntensity;
          varying float vA;
          void main(){
            float speed = 40.0 + uIntensity * 260.0;
            float z = -305.0 + mod(position.z + uTime * speed, 300.0);
            float len = 1.0 + uIntensity * 45.0;
            vec3 p = vec3(position.xy, z - aEnd * len);
            vA = smoothstep(-300.0, -200.0, z) * smoothstep(-2.0, -25.0, z) * (1.0 - aEnd * 0.85);
            gl_Position = projectionMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uIntensity;
          varying float vA;
          void main(){ gl_FragColor = vec4(vec3(0.55, 0.75, 1.0) * 2.2, vA * uIntensity); }
        `,
      })
    );
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    camera.add(this.lines);
  }

  update(realTime, intensity) {
    this.uniforms.uTime.value = realTime;
    this.uniforms.uIntensity.value = intensity;
    this.lines.visible = intensity > 0.003;
  }
}

// ---------------------------------------------------------------------------
// Space: a swirling portal that opens behind the gauntlet.
// ---------------------------------------------------------------------------
export class Portal {
  constructor(scene) {
    this.uniforms = { uTime: { value: 0 }, uOpen: { value: 0 } };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uOpen;
          varying vec2 vUv;
          ${SIMPLEX3}
          void main(){
            vec2 p = (vUv - 0.5) * 2.0;
            float r = length(p);
            float a = atan(p.y, p.x);
            float R = 0.72 * uOpen;
            float swirl = snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, r * 3.0 - uTime * 0.8 + a * 0.5));
            float ring = exp(-pow((r - R - swirl * 0.04) * 11.0, 2.0));
            float halo = exp(-pow((r - R) * 4.0, 2.0)) * 0.35;
            float inside = smoothstep(R, R * 0.2, r);
            float spiral = 0.5 + 0.5 * sin(a * 3.0 + r * 14.0 - uTime * 3.0 + swirl * 2.0);
            vec3 col = vec3(0.25, 0.55, 1.0) * ring * 1.3 + vec3(0.1, 0.3, 1.0) * halo * 0.5;
            col += vec3(0.03, 0.1, 0.45) * inside * (0.3 + 0.7 * spiral) * uOpen;
            float sparks = step(0.97, fract(sin(dot(floor(p * 60.0), vec2(12.9898, 78.233))) * 43758.5453));
            col += vec3(0.6, 0.8, 1.0) * sparks * inside * 0.5;
            float alpha = clamp(ring + halo + inside * 0.4, 0.0, 1.0) * smoothstep(0.0, 0.05, uOpen);
            gl_FragColor = vec4(col, alpha);
          }
        `,
      })
    );
    this.mesh.visible = false;
    scene.add(this.mesh);
    this._v = new THREE.Vector3();
  }

  update(realTime, open, camera, center) {
    this.uniforms.uTime.value = realTime;
    this.uniforms.uOpen.value = open;
    this.mesh.visible = open > 0.003;
    if (!this.mesh.visible) return;
    const dir = this._v.copy(camera.position).sub(center).normalize();
    this.mesh.position.copy(center).addScaledVector(dir, -4.5);
    this.mesh.quaternion.copy(camera.quaternion);
  }
}

// ---------------------------------------------------------------------------
// Time: glowing rune rings (procedural glyphs, not any specific emblem).
// ---------------------------------------------------------------------------
const ringFrag = /* glsl */ `
  uniform float uOpacity, uInner, uOuter, uSeed, uTicks;
  uniform vec3 uColor;
  varying vec2 vPos;
  ${HASH}
  void main(){
    float r = length(vPos);
    float a = atan(vPos.y, vPos.x) / 6.28318 + 0.5;
    float rn = (r - uInner) / (uOuter - uInner);
    float w = fwidth(rn) * 1.5;
    float lines = 0.0;
    lines += 1.0 - smoothstep(0.0, w * 2.0, abs(rn - 0.04));
    lines += 1.0 - smoothstep(0.0, w * 2.0, abs(rn - 0.96));
    lines += (1.0 - smoothstep(0.0, w * 1.5, abs(rn - 0.62))) * 0.7;
    // Tick marks in the outer band.
    float tk = fract(a * uTicks);
    lines += (1.0 - smoothstep(0.0, 0.08, abs(tk - 0.5))) * step(0.66, rn) * step(rn, 0.92) * 0.8;
    // Glyph cells in the inner band.
    float cells = uTicks * 0.25;
    float cell = floor(a * cells);
    float ca = fract(a * cells);
    float h = hash12(vec2(cell, uSeed));
    float gx = ca;
    float gy = (rn - 0.1) / 0.48;
    float glyph = 0.0;
    if (gy > 0.0 && gy < 1.0) {
      float dot1 = 1.0 - smoothstep(0.08, 0.12, length(vec2(gx - 0.5, gy - 0.5) * vec2(2.0, 1.0)));
      float arc = 1.0 - smoothstep(0.0, 0.07, abs(length(vec2(gx - 0.5, gy - 0.2)) - 0.3));
      float vbar = (1.0 - smoothstep(0.0, 0.05, abs(gx - 0.5))) * step(0.15, gy) * step(gy, 0.85);
      float hbar = (1.0 - smoothstep(0.0, 0.05, abs(gy - 0.5))) * step(0.2, gx) * step(gx, 0.8);
      if (h < 0.25) glyph = dot1 + vbar;
      else if (h < 0.5) glyph = arc;
      else if (h < 0.75) glyph = vbar + hbar;
      else glyph = arc * step(0.5, gy) + dot1;
      glyph *= step(0.06, ca) * step(ca, 0.94);
    }
    float v = clamp(lines + glyph * 0.9, 0.0, 1.0) * step(0.0, rn) * step(rn, 1.0);
    gl_FragColor = vec4(uColor * v * 1.1 * uOpacity, v * uOpacity);
  }
`;

export class TimeRings {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const color = new THREE.Color(0.15, 1.0, 0.35);
    const make = (inner, outer, ticks, seed) => {
      const uniforms = {
        uOpacity: { value: 0 },
        uInner: { value: inner },
        uOuter: { value: outer },
        uSeed: { value: seed },
        uTicks: { value: ticks },
        uColor: { value: color },
      };
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 160, 1),
        new THREE.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          vertexShader: /* glsl */ `varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
          fragmentShader: ringFrag,
        })
      );
      m.userData.u = uniforms;
      this.group.add(m);
      return m;
    };
    this.wrist = make(1.05, 1.42, 72, 3);
    this.wrist.rotation.x = -Math.PI / 2;
    this.wrist.position.y = -0.3;
    this.halo = make(2.3, 3.0, 96, 7);
    this.tilted = make(1.6, 1.95, 64, 11);
    this.tilted.rotation.set(1.1, 0.4, 0);
    this.tilted.position.y = 0.6;
    this.rings = [this.wrist, this.halo, this.tilted];
    this.group.visible = false;
  }

  update(realTime, big, lasting, camera, center) {
    const show = Math.max(big, lasting * 0.35);
    this.group.visible = show > 0.003;
    if (!this.group.visible) return;
    this.group.position.copy(center);
    const open = 0.6 + 0.4 * Math.min(1, show * 1.5);
    this.wrist.rotation.z = realTime * 0.35;
    this.wrist.userData.u.uOpacity.value = Math.max(big, lasting * 0.45);
    this.wrist.scale.setScalar(open);
    // The big ring hangs behind the gauntlet, facing the viewer.
    this.halo.position.copy(camera.position).sub(center).normalize().multiplyScalar(-1.6);
    this.halo.quaternion.copy(camera.quaternion);
    this.halo.rotateZ(-realTime * 0.18);
    this.halo.userData.u.uOpacity.value = big * 0.75;
    this.halo.scale.setScalar(0.75 + 0.35 * big);
    this.tilted.rotation.z = realTime * 0.5;
    this.tilted.userData.u.uOpacity.value = big * 0.6;
  }
}

// ---------------------------------------------------------------------------
// Reality: Aether — crimson tendrils coiling around the gauntlet.
// ---------------------------------------------------------------------------
export class Aether {
  constructor(scene, count) {
    const tendrils = 14;
    const per = Math.floor(count / tendrils);
    const n = tendrils * per;
    const pos = new Float32Array(n * 3);
    const data = new Float32Array(n * 3);
    for (let t = 0; t < tendrils; t++) {
      for (let k = 0; k < per; k++) {
        const i = t * per + k;
        data.set([t, k / per, Math.random()], i * 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(data, 3));
    this.uniforms = { uTime: { value: 0 }, uIntensity: { value: 0 }, uPixelRatio: { value: 1 } };
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec3 aData;
          uniform float uTime, uIntensity, uPixelRatio;
          varying float vA; varying float vK;
          void main(){
            float id = aData.x, k = aData.y, rnd = aData.z;
            float t = uTime * 0.5 - k * 1.8 + id * 7.13;
            float dirn = mod(id, 2.0) < 0.5 ? 1.0 : -1.0;
            float R = 1.4 + 0.8 * sin(t * 0.7 + id * 2.0) + (1.0 - uIntensity) * 1.5;
            float th = t * 1.2 * dirn + id;
            float y = 0.1 + 1.9 * sin(t * 0.55 + id * 1.7);
            vec3 p = vec3(cos(th) * R, y, sin(th) * R * 0.85);
            p += (vec3(fract(rnd * 13.1), fract(rnd * 71.7), fract(rnd * 37.3)) - 0.5) * (0.08 + k * 0.35);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vK = k;
            vA = (1.0 - k) * uIntensity;
            gl_PointSize = (14.0 * (1.0 - k * 0.7) + rnd * 6.0) * uPixelRatio * (1.0 / -mv.z) * 4.0;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vA; varying float vK;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            vec3 col = mix(vec3(1.0, 0.12, 0.08), vec3(0.35, 0.0, 0.03), vK);
            gl_FragColor = vec4(col * 1.6, a * a * vA * 0.35);
          }
        `,
      })
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  update(simTime, intensity, pixelRatio, center) {
    this.uniforms.uTime.value = simTime;
    this.uniforms.uIntensity.value = intensity;
    this.uniforms.uPixelRatio.value = pixelRatio;
    this.points.visible = intensity > 0.003;
    this.points.position.copy(center);
  }
}

// ---------------------------------------------------------------------------
// Power (and the ultimate): expanding shock rings.
// ---------------------------------------------------------------------------
export class Shockwaves {
  constructor(scene) {
    this.waves = [];
    for (let i = 0; i < 4; i++) {
      const uniforms = { uProgress: { value: 0 }, uColor: { value: new THREE.Color() }, uStrength: { value: 0 } };
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
          fragmentShader: /* glsl */ `
            uniform float uProgress, uStrength; uniform vec3 uColor;
            varying vec2 vUv;
            void main(){
              float r = length(vUv - 0.5) * 2.0;
              float R = uProgress;
              float w = 0.02 + uProgress * 0.06;
              float ring = exp(-pow((r - R) / w, 2.0));
              float inner = smoothstep(R, 0.0, r) * 0.15 * (1.0 - uProgress);
              float a = (ring + inner) * (1.0 - uProgress) * uStrength;
              gl_FragColor = vec4(uColor * 3.0 * a, a);
            }
          `,
        })
      );
      m.visible = false;
      m.userData.u = uniforms;
      scene.add(m);
      this.waves.push({ mesh: m, t: 1, duration: 1, size: 1, billboard: false });
    }
  }

  fire({ center, color, size = 14, duration = 1.3, billboard = false, strength = 1 }) {
    const w = this.waves.find((x) => x.t >= 1) || this.waves[0];
    w.t = 0;
    w.duration = duration;
    w.size = size;
    w.billboard = billboard;
    w.mesh.position.copy(center);
    w.mesh.userData.u.uColor.value.set(color);
    w.mesh.userData.u.uStrength.value = strength;
    w.mesh.scale.setScalar(size / 2);
    if (!billboard) w.mesh.rotation.set(-Math.PI / 2, 0, 0);
    w.mesh.visible = true;
  }

  update(dt, camera) {
    for (const w of this.waves) {
      if (w.t >= 1) continue;
      w.t = Math.min(1, w.t + dt / w.duration);
      const eased = 1 - Math.pow(1 - w.t, 3);
      w.mesh.userData.u.uProgress.value = eased;
      if (w.billboard) w.mesh.quaternion.copy(camera.quaternion);
      if (w.t >= 1) w.mesh.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Spark bursts — a pooled GPU particle system on world time.
// ---------------------------------------------------------------------------
export class Bursts {
  constructor(scene, capacity = 3000) {
    this.capacity = capacity;
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.attrs = {
      position: new THREE.BufferAttribute(new Float32Array(capacity * 3), 3),
      aVel: new THREE.BufferAttribute(new Float32Array(capacity * 3), 3),
      aColor: new THREE.BufferAttribute(new Float32Array(capacity * 3), 3),
      aSpawn: new THREE.BufferAttribute(new Float32Array(capacity).fill(-1e6), 1),
      aLife: new THREE.BufferAttribute(new Float32Array(capacity).fill(1), 1),
    };
    for (const [k, a] of Object.entries(this.attrs)) {
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a);
    }
    this.uniforms = { uTime: { value: 0 }, uPixelRatio: { value: 1 } };
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec3 aVel; attribute vec3 aColor; attribute float aSpawn; attribute float aLife;
          uniform float uTime, uPixelRatio;
          varying vec3 vColor; varying float vA;
          void main(){
            float age = uTime - aSpawn;
            if (age < 0.0 || age > aLife) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
            float k = 2.2;
            vec3 p = position + aVel * (1.0 - exp(-k * age)) / k;
            p.y -= 0.25 * age * age;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float l = age / aLife;
            vA = (1.0 - l) * (1.0 - l);
            vColor = aColor;
            gl_PointSize = (3.0 + 4.0 * (1.0 - l)) * uPixelRatio * (8.0 / -mv.z);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor; varying float vA;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vColor * 3.0 + vec3(0.6) * a, a * a * vA);
          }
        `,
      })
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
  }

  emit({ origin, color, count = 200, speed = 3, life = 1.6, spread = 1, simTime, up = 0 }) {
    const a = this.attrs;
    this._c.set(color);
    for (let i = 0; i < count; i++) {
      const j = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const v = this._v.randomDirection().multiplyScalar(speed * (0.3 + Math.random() * 0.7) * spread);
      v.y += up;
      a.position.setXYZ(j, origin.x, origin.y, origin.z);
      a.aVel.setXYZ(j, v.x, v.y, v.z);
      const w = Math.random() * 0.4;
      a.aColor.setXYZ(j, this._c.r + w, this._c.g + w, this._c.b + w);
      a.aSpawn.setX(j, simTime);
      a.aLife.setX(j, life * (0.5 + Math.random() * 0.5));
    }
    for (const attr of Object.values(a)) attr.needsUpdate = true;
  }

  clear() {
    this.attrs.aSpawn.array.fill(-1e6);
    this.attrs.aSpawn.needsUpdate = true;
  }

  update(simTime, pixelRatio) {
    this.uniforms.uTime.value = simTime;
    this.uniforms.uPixelRatio.value = pixelRatio;
  }
}
