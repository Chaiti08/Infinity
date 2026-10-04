import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HASH } from './glsl.js';

// Final screen-space pass: lens/stone effects that operate on the whole image
// (chromatic aberration, reality glitch, mind waves, shock ripples, tinting,
// flash, vignette and film grain). Runs in linear HDR before tone mapping.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uChroma: { value: 0.0015 },
    uGlitch: { value: 0 },
    uWave: { value: 0 },
    uRipple: { value: 0 },
    uRippleStrength: { value: 0 },
    uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRippleColor: { value: new THREE.Color(1, 1, 1) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uDesat: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1.0, 0.86, 0.6) },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.018 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uChroma, uGlitch, uWave, uRipple, uRippleStrength;
    uniform float uTintAmt, uDesat, uFlash, uVignette, uGrain, uFade;
    uniform vec2 uRippleCenter, uResolution;
    uniform vec3 uRippleColor, uTint, uFlashColor;
    varying vec2 vUv;
    ${HASH}
    void main(){
      vec2 uv = vUv;

      // Mind: slow psychic waves.
      if (uWave > 0.0) {
        uv += uWave * 0.007 * vec2(
          sin(uv.y * 16.0 + uTime * 2.1) + 0.5 * sin(uv.y * 41.0 - uTime * 3.3),
          cos(uv.x * 13.0 + uTime * 1.7));
      }

      // Shock / time ripple.
      float rippleGlow = 0.0;
      if (uRippleStrength > 0.0) {
        vec2 d = uv - uRippleCenter;
        d.x *= uAspect;
        float dist = length(d);
        float r = uRipple * 1.6;
        float band = exp(-pow((dist - r) * 9.0, 2.0));
        vec2 n = d / max(dist, 1e-4);
        uv -= vec2(n.x / uAspect, n.y) * band * uRippleStrength * 0.035;
        rippleGlow = band * uRippleStrength * (1.0 - uRipple);
      }

      // Reality: horizontal tearing.
      if (uGlitch > 0.0) {
        float t = floor(uTime * 14.0);
        float burst = step(0.55, hash11(floor(uTime * 5.0) + 3.0));
        float row = floor(uv.y * 22.0);
        float r = hash12(vec2(row, t));
        if (r < uGlitch * 0.22 * burst) uv.x += (hash12(vec2(row, t + 7.0)) - 0.5) * 0.09 * uGlitch;
        float big = floor(uv.y * 5.0);
        if (hash12(vec2(big, t * 0.5)) < uGlitch * 0.08 * burst) uv.y += (hash12(vec2(big, t)) - 0.5) * 0.03;
      }

      vec2 cdir = uv - 0.5;
      float ca = uChroma + uGlitch * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + cdir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - cdir * ca).b;

      if (uGlitch > 0.0) {
        float t = floor(uTime * 20.0);
        float burst2 = step(0.55, hash11(floor(uTime * 5.0) + 3.0));
        float scan = step(0.995 - uGlitch * 0.008, hash12(vec2(floor(uv.y * 200.0), t)));
        col += vec3(1.0, 0.1, 0.15) * scan * uGlitch * 0.35 * burst2;
      }

      col += uRippleColor * rippleGlow * 0.7;

      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(l), uDesat);
      col = mix(col, uTint * l * 1.6 + col * 0.25, uTintAmt);

      col += uFlashColor * uFlash * 4.0;

      vec2 vq = (vUv - 0.5) * vec2(uAspect * 0.85, 1.0);
      float v = smoothstep(0.95, 0.2, length(vq));
      col *= mix(1.0, v, uVignette);
      col *= 1.0 - uFade;
      col += (hash12(vUv * uResolution + fract(uTime) * 100.0) - 0.5) * uGrain * (1.0 - uFade);

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export class Post {
  constructor(stage, quality) {
    this.stage = stage;
    const { renderer, scene, camera } = stage;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomScale = quality.bloomScale;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * this.bloomScale, size.y * this.bloomScale), 0.8, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.baseBloom = 0.8;

    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms;

    this._ripple = null;
  }

  resize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * this.bloomScale, h * pr * this.bloomScale);
    this.u.uAspect.value = w / h;
    this.u.uResolution.value.set(w * pr, h * pr);
  }

  // Launch a screen-space ripple from a screen position (0..1 uv).
  ripple(center, color, strength = 1, duration = 1.4) {
    this._ripple = { t: 0, duration, strength };
    this.u.uRippleCenter.value.copy(center);
    this.u.uRippleColor.value.set(color);
  }

  update(dt, realTime) {
    this.u.uTime.value = realTime;
    if (this._ripple) {
      const r = this._ripple;
      r.t += dt;
      const p = r.t / r.duration;
      if (p >= 1) {
        this._ripple = null;
        this.u.uRippleStrength.value = 0;
      } else {
        this.u.uRipple.value = p;
        this.u.uRippleStrength.value = r.strength * (1 - p * 0.6);
      }
    }
  }

  render() {
    this.composer.render();
  }
}
