import * as THREE from 'three';
import { SIMPLEX3 } from '../core/glsl.js';

// The deep-space backdrop from the poster — teal, violet and ember clouds with
// a bright glow behind the gauntlet — plus every stone's "reality" variant,
// blended by uniforms the director animates.
export class Nebula {
  constructor(bgScene, quality) {
    this.uniforms = {
      uTime: { value: 0 },
      uReality: { value: 0 },
      uSoul: { value: 0 },
      uSpace: { value: 0 },
      uPower: { value: 0 },
      uMind: { value: 0 },
      uTimeStone: { value: 0 },
      uUltimate: { value: 0 },
      uFresh: { value: 0 },
      uDim: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      defines: { OCT: quality.nebulaOctaves },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uReality, uSoul, uSpace, uPower, uMind, uTimeStone, uUltimate, uFresh, uDim;
        varying vec3 vDir;
        ${SIMPLEX3}
        float fbm(vec3 p){
          float a = 0.5, s = 0.0;
          for (int i = 0; i < OCT; i++) { s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
          return s;
        }
        float fbm2(vec3 p){ return 0.6 * snoise(p) + 0.3 * snoise(p * 2.1 + 3.0); }

        void main(){
          vec3 d = normalize(vDir);
          float t = uTime * 0.012;

          // Domain warp — gentle normally, liquid under the Reality Stone.
          vec3 q = d * 1.7;
          float warpAmt = 0.4 + uReality * 1.5 + uMind * 0.25;
          vec3 w = vec3(fbm2(q + vec3(t, 0.0, 0.0)), fbm2(q + vec3(5.2, 1.3, -t)), fbm2(q + vec3(2.1, t * 1.3, 7.7)));
          w += uReality * vec3(sin(uTime * 0.6 + d.y * 4.0), cos(uTime * 0.5 + d.x * 3.0), 0.0) * 0.35;
          vec3 p = q + w * warpAmt;

          float n1 = fbm(p * 1.25);
          float n2 = fbm(p * 2.3 + 11.0);
          float n3 = fbm(p * 0.8 - 4.0);

          // Base: the poster's palette.
          vec3 behindDir = normalize(vec3(-0.12, 0.12, -1.0));
          float behind = pow(max(dot(d, behindDir), 0.0), 2.2);
          vec3 col = vec3(0.002, 0.004, 0.012);
          vec3 teal = vec3(0.03, 0.42, 0.62);
          vec3 violet = vec3(0.3, 0.05, 0.55);
          vec3 ember = vec3(0.7, 0.22, 0.04);
          float lanes = smoothstep(-0.55, 0.25, n3);            // dark dust lanes
          col += teal * pow(smoothstep(0.0, 0.85, n1), 1.6) * (0.05 + behind * 1.1) * lanes;
          col += violet * pow(smoothstep(0.1, 0.9, n2), 1.8) * 0.32 * (0.5 + 0.5 * (1.0 - behind));
          col += ember * pow(smoothstep(0.15, 0.85, n3), 2.0) * smoothstep(-0.1, 0.7, d.y) * smoothstep(0.2, -0.6, d.x) * 0.45;
          col += vec3(0.06, 0.4, 0.65) * pow(behind, 4.0) * 0.45;
          col *= 0.75 + 0.35 * smoothstep(-0.4, 0.6, n1 + n2 * 0.5);

          // Space: deep blue, the clouds lean toward a cold electric hue.
          col = mix(col, col * vec3(0.4, 0.75, 1.6) + vec3(0.02, 0.08, 0.35) * smoothstep(0.0, 0.8, n1), uSpace * 0.75);

          // Power: violet storm with pulsing veins.
          float veins = pow(1.0 - abs(snoise(p * 3.0 + uTime * 0.2)), 8.0);
          col = mix(col, col * vec3(1.1, 0.5, 1.5) + vec3(0.25, 0.04, 0.5) * veins * (0.6 + 0.4 * sin(uTime * 3.0)), uPower * 0.8);

          // Mind: golden interference bands.
          float bands = pow(0.5 + 0.5 * sin(n1 * 10.0 + uTime * 1.4), 12.0);
          col += vec3(0.9, 0.62, 0.08) * bands * uMind * 0.12 * (0.4 + behind);
          col = mix(col, col * vec3(1.15, 1.0, 0.7), uMind * 0.4);

          // Reality: a crimson liquid sky.
          vec3 red = mix(vec3(0.03, 0.0, 0.004), vec3(0.75, 0.03, 0.06), smoothstep(-0.25, 0.8, n1));
          red += vec3(1.0, 0.25, 0.15) * pow(smoothstep(0.35, 0.95, n2), 3.0) * 0.8;
          red *= 0.6 + 0.6 * behind;
          col = mix(col, red, uReality * 0.9);

          // Soul: an amber sky over a still horizon.
          float h = d.y;
          vec3 sky = mix(vec3(0.55, 0.2, 0.035), vec3(0.08, 0.02, 0.006), smoothstep(0.0, 0.7, h));
          sky += vec3(0.7, 0.42, 0.16) * exp(-abs(h) * 12.0) * 0.6;
          sky *= 0.55 + 0.6 * smoothstep(-0.3, 0.8, n1 + 0.3 * n3);
          sky = mix(sky, vec3(0.05, 0.012, 0.004), smoothstep(0.0, -0.35, h));
          col = mix(col, sky, uSoul);

          // Time: drained, green-shifted world.
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(lum) * vec3(0.45, 1.25, 0.65), uTimeStone * 0.6);

          // The reborn cosmos after all six stones.
          vec3 fresh = vec3(0.006, 0.004, 0.022);
          fresh += vec3(0.95, 0.62, 0.25) * pow(smoothstep(0.05, 0.85, n1), 1.5) * (0.05 + behind * 0.55) * lanes;
          fresh += vec3(0.5, 0.14, 0.55) * pow(smoothstep(0.15, 0.95, n2), 1.8) * 0.3;
          fresh += vec3(0.08, 0.3, 0.7) * pow(smoothstep(0.25, 0.95, n3), 1.5) * 0.3;
          fresh += vec3(1.0, 0.85, 0.6) * pow(behind, 8.0) * 0.3;
          col = mix(col, fresh, uFresh);

          col += vec3(1.0, 0.78, 0.4) * uUltimate * (0.04 + pow(behind, 3.0) * 0.6);
          // Soft-clip so the sky never blooms into a haze.
          col = col / (1.0 + max(max(col.r, col.g), col.b) * 0.9);
          col *= 1.0 - uDim;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
    this.mesh.frustumCulled = false;
    bgScene.add(this.mesh);
  }

  update(simTime, camera) {
    this.uniforms.uTime.value = simTime;
    this.mesh.position.copy(camera.position);
  }
}
