import * as THREE from 'three';

// Golden sparkles drifting around the gauntlet (the glitter in the poster).
// Fully GPU-animated from world time, so they hang in the air when time stops
// and fall back down when it rewinds.
export class Dust {
  constructor(scene, quality) {
    const n = quality.dust;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.pow(Math.random(), 0.7) * 6.5;
      pos.set([Math.cos(a) * r, -4 + Math.random() * 9, Math.sin(a) * r], i * 3);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uColorA: { value: new THREE.Color(1.0, 0.75, 0.35) },
      uColorB: { value: new THREE.Color(0.45, 0.85, 1.0) },
      uOpacity: { value: 1 },
      uSwirl: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uPixelRatio, uSwirl;
        varying float vA; varying float vMix;
        void main(){
          vec3 p = position;
          float t = uTime;
          float rise = mod(p.y + 4.0 + t * (0.12 + aSeed.x * 0.25), 9.0) - 4.0;
          float ang = atan(p.z, p.x) + t * (0.04 + aSeed.y * 0.06) * (1.0 + uSwirl * 4.0);
          float r = length(p.xz) * (1.0 - uSwirl * 0.25);
          vec3 q = vec3(cos(ang) * r, rise, sin(ang) * r);
          q.x += sin(t * 0.7 + aSeed.z * 20.0) * 0.15;
          q.z += cos(t * 0.6 + aSeed.w * 20.0) * 0.15;
          vec4 mv = modelViewMatrix * vec4(q, 1.0);
          gl_Position = projectionMatrix * mv;
          float edge = smoothstep(-4.0, -3.0, rise) * smoothstep(5.0, 3.5, rise);
          vA = edge * (0.4 + 0.6 * pow(0.5 + 0.5 * sin(t * (2.0 + aSeed.w * 5.0) + aSeed.x * 50.0), 3.0));
          vMix = aSeed.z;
          gl_PointSize = (2.0 + aSeed.y * 5.0) * uPixelRatio * (6.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA, uColorB; uniform float uOpacity;
        varying float vA; varying float vMix;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 col = mix(uColorA, uColorB, step(0.72, vMix));
          gl_FragColor = vec4(col * 2.0, a * a * vA * uOpacity);
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(simTime, pixelRatio) {
    this.uniforms.uTime.value = simTime;
    this.uniforms.uPixelRatio.value = pixelRatio;
  }
}
