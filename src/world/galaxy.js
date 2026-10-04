import * as THREE from 'three';

// The "fresh cosmos" that forms after all six stones: a spiral galaxy that
// condenses out of scattered light behind the gauntlet.
export class Galaxy {
  constructor(scene, quality) {
    const n = quality.galaxy;
    const target = new Float32Array(n * 3);
    const start = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const arms = 4;
    const R = 34;
    const core = new THREE.Color(1.0, 0.86, 0.6);
    const armA = new THREE.Color(0.45, 0.6, 1.0);
    const armB = new THREE.Color(1.0, 0.45, 0.75);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const r = Math.pow(Math.random(), 1.6) * R;
      const arm = (i % arms) / arms * Math.PI * 2;
      const twist = r * 0.19;
      const spread = (Math.random() - 0.5) * (0.5 + (1 - r / R) * 0.9);
      const a = arm + twist + spread;
      const y = (Math.random() - 0.5) * (1.6 * Math.exp(-r / 8) + 0.25);
      target.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
      // Condenses from a wide, diffuse disc of light.
      const sa = a + (Math.random() - 0.5) * 2.5;
      const sr = r * 1.8 + 15 + Math.random() * 25;
      start.set([Math.cos(sa) * sr, (Math.random() - 0.5) * 12, Math.sin(sa) * sr], i * 3);
      const k = r / R;
      c.copy(core).lerp(Math.random() > 0.5 ? armA : armB, Math.min(1, k * 1.6));
      if (Math.random() < 0.04) c.set(1.0, 0.5, 0.8);
      col.set([c.r, c.g, c.b], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(target, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uForm: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: /* glsl */ `
        attribute vec3 aStart; attribute float aSeed;
        uniform float uTime, uForm, uPixelRatio;
        varying vec3 vColor; varying float vA;
        void main(){
          vec3 p = position;
          float r = length(p.xz);
          float rot = uTime * 0.6 / (1.0 + r * 0.12);
          float cs = cos(rot), sn = sin(rot);
          p.xz = mat2(cs, -sn, sn, cs) * p.xz;
          float f = clamp(uForm * 1.3 - aSeed * 0.3, 0.0, 1.0);
          f = 1.0 - pow(1.0 - f, 3.0);
          vec3 q = mix(aStart, p, f);
          vec4 mv = modelViewMatrix * vec4(q, 1.0);
          gl_Position = projectionMatrix * mv;
          vColor = color;
          vA = (0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 30.0)) * 0.5 + 0.5;
          gl_PointSize = min((1.2 + aSeed * 2.8) * (60.0 / -mv.z), 5.0) * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * 1.3, a * a * vA * uOpacity * 0.85);
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.position.set(0, 4, -70);
    this.points.rotation.set(0.95, 0.2, -0.25);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  update(realTime, pixelRatio) {
    this.uniforms.uTime.value = realTime;
    this.uniforms.uPixelRatio.value = pixelRatio;
    this.points.visible = this.uniforms.uOpacity.value > 0.001;
  }
}
