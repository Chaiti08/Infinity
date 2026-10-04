import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// Soul World: a calm, mirror-like amber sea beneath the gauntlet.
const WaterShader = {
  name: 'SoulWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uReflect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWPos;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime, uOpacity, uReflect;
    varying vec4 vUv;
    varying vec3 vWPos;
    void main(){
      vec2 p = vWPos.xz;
      float d = length(p);
      // Slow concentric swell from the gauntlet + a few crossing ripples.
      vec2 off = vec2(0.0);
      off += normalize(p + 1e-4) * sin(d * 2.4 - uTime * 1.2) * 0.012 / (1.0 + d * 0.2);
      off += vec2(sin(p.y * 1.7 + uTime * 0.7), cos(p.x * 1.3 - uTime * 0.6)) * 0.004;
      vec4 uv = vUv;
      uv.xy += off * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 deep = vec3(0.35, 0.09, 0.015);
      vec3 sheen = vec3(1.0, 0.55, 0.18);
      vec3 viewDir = normalize(cameraPosition - vWPos);
      float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
      vec3 col = mix(deep, sheen, fres * 0.8) * 0.6 + refl * mix(0.35, 0.95, fres) * uReflect * color;
      float rings = smoothstep(0.02, 0.0, abs(sin(d * 2.4 - uTime * 1.2))) * 0.12 / (1.0 + d * 0.5);
      col += sheen * rings;
      float fade = smoothstep(42.0, 6.0, d);
      gl_FragColor = vec4(col, uOpacity * fade);
    }
  `,
};

export class Water {
  constructor(scene, quality, renderer) {
    this.quality = quality;
    const geo = new THREE.CircleGeometry(60, 64);
    if (quality.reflections) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      this.mesh = new Reflector(geo, {
        shader: WaterShader,
        textureWidth: Math.round(size.x * 0.5),
        textureHeight: Math.round(size.y * 0.5),
        clipBias: 0.003,
        color: 0xffc89a,
        multisample: 0,
      });
      this.uniforms = this.mesh.material.uniforms;
    } else {
      const uniforms = THREE.UniformsUtils.clone(WaterShader.uniforms);
      uniforms.color.value = new THREE.Color(0xffc89a);
      uniforms.tDiffuse.value = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      uniforms.tDiffuse.value.needsUpdate = true;
      uniforms.textureMatrix.value = new THREE.Matrix4();
      uniforms.uReflect.value = 0;
      this.mesh = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: WaterShader.vertexShader,
          fragmentShader: WaterShader.fragmentShader,
        })
      );
      this.uniforms = uniforms;
    }
    this.mesh.material.transparent = true;
    this.mesh.material.depthWrite = false;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -2.75;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setOpacity(v) {
    this.uniforms.uOpacity.value = v;
    this.mesh.visible = v > 0.002;
  }

  update(simTime) {
    this.uniforms.uTime.value = simTime;
  }
}
