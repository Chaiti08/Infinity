import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dissolveSweep } from '../gauntlet/materials.js';

// The snap: ash particles peel off the gauntlet's surface in the same sweep
// as the dissolve shader eats it away, and drift off on a cosmic wind.
export class SnapDust {
  constructor(scene, quality) {
    this.scene = scene;
    this.count = quality.snapDust;
    this.points = null;
    this.uniforms = {
      uProgress: { value: 0 },
      uPixelRatio: { value: 1 },
      uWind: { value: new THREE.Vector3(1, 0.35, -0.2) },
    };
  }

  // Sample the gauntlet (and socketed stones) as they are at snap time.
  prepare(meshes, stones) {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
    }
    const geos = [];
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', m.geometry.attributes.position.clone());
      if (m.geometry.index) g.setIndex(m.geometry.index.clone());
      g.applyMatrix4(m.matrixWorld);
      geos.push(g.index ? g.toNonIndexed() : g);
    }
    const merged = mergeGeometries(geos, false);
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build();

    const n = this.count;
    const stoneShare = Math.floor(n * 0.08);
    const pos = new Float32Array(n * 3);
    const delay = new Float32Array(n);
    const rnd = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const ash = [new THREE.Color(0.55, 0.42, 0.24), new THREE.Color(0.3, 0.24, 0.18), new THREE.Color(0.85, 0.65, 0.3)];
    for (let i = 0; i < n; i++) {
      if (i < stoneShare && stones.length) {
        const s = stones[i % stones.length];
        p.copy(s.group.position).add(new THREE.Vector3().randomDirection().multiplyScalar(s.scale * 0.8));
        c.copy(s.color);
      } else {
        sampler.sample(p);
        c.copy(ash[(Math.random() * ash.length) | 0]);
        if (Math.random() < 0.06) c.setRGB(1.6, 0.6, 0.15); // embers
      }
      pos.set([p.x, p.y, p.z], i * 3);
      delay[i] = dissolveSweep(p) * 0.72 + Math.random() * 0.28;
      rnd.set([Math.random(), Math.random(), Math.random()], i * 3);
      col.set([c.r, c.g, c.b], i * 3);
    }
    merged.dispose();
    geos.forEach((g) => g.dispose());

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aDelay; attribute vec3 aRnd; attribute vec3 aColor;
        uniform float uProgress, uPixelRatio; uniform vec3 uWind;
        varying vec3 vColor; varying float vA;
        void main(){
          // uProgress runs 0 → 1.25; the dissolve cut is (progress*1.25 - 0.12).
          float start = (aDelay + 0.12) / 1.25;
          float age = (uProgress - start) * 4.0;
          if (age < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          vec3 p = position;
          vec3 wind = normalize(uWind + (aRnd - 0.5) * 0.9);
          p += wind * age * (1.2 + aRnd.x * 2.5) + vec3(0.0, 1.0, 0.0) * age * age * 0.25;
          p += vec3(sin(age * 3.0 + aRnd.y * 20.0), cos(age * 2.3 + aRnd.z * 20.0), sin(age * 2.0 + aRnd.x * 9.0)) * 0.15 * age;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.6, 2.4, age));
          vColor = aColor;
          gl_PointSize = (1.5 + aRnd.z * 2.5) * uPixelRatio * (9.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          if (dot(c, c) > 0.25) discard;
          gl_FragColor = vec4(vColor, vA);
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(progress, pixelRatio) {
    this.uniforms.uProgress.value = progress;
    this.uniforms.uPixelRatio.value = pixelRatio;
    if (this.points) this.points.visible = progress > 0 && progress < 1.9;
  }

  dispose() {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points = null;
  }
}
