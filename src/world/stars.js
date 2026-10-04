import * as THREE from 'three';

// Twinkling starfield. Reality wobbles it, Time freezes its twinkle,
// the snap fades it out.
export class Stars {
  constructor(scene, quality) {
    const n = quality.stars;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const size = new Float32Array(n);
    const c = new THREE.Color();
    const palette = [0xffffff, 0xcfe4ff, 0x9cc8ff, 0xffe2c0, 0xb6a0ff, 0x8ff0ff];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      const r = 120 + Math.random() * 380;
      pos.set([v.x * r, v.y * r, v.z * r], i * 3);
      c.set(palette[(Math.random() * palette.length) | 0]);
      col.set([c.r, c.g, c.b], i * 3);
      seed[i] = Math.random();
      size[i] = Math.pow(Math.random(), 6) * 5 + 0.7;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uWobble: { value: 0 },
      uOpacity: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uTintAmt: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: /* glsl */ `
        attribute float aSeed; attribute float aSize;
        uniform float uTime, uPixelRatio, uWobble;
        varying vec3 vColor; varying float vTw;
        void main(){
          vec3 p = position;
          p += uWobble * vec3(sin(uTime * 1.3 + p.y * 0.05), cos(uTime * 1.1 + p.x * 0.05), sin(uTime * 0.9 + p.z * 0.04)) * 12.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vTw = 0.65 + 0.35 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0);
          vColor = color;
          gl_PointSize = aSize * uPixelRatio * (1.0 + uWobble * 0.5);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity, uTintAmt; uniform vec3 uTint;
        varying vec3 vColor; varying float vTw;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          vec3 col = mix(vColor, uTint, uTintAmt);
          gl_FragColor = vec4(col * vTw * 1.6, a * uOpacity);
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
    scene.add(this.points);
  }

  update(simTime, camera, pixelRatio) {
    this.uniforms.uTime.value = simTime;
    this.uniforms.uPixelRatio.value = pixelRatio;
    this.points.position.copy(camera.position);
  }
}
