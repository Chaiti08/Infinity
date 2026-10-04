import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Renderer, scene, camera, orbit controls, lighting and the image-based
// environment that gives the gold its cosmic reflections.
export class Stage {
  constructor(container, quality) {
    this.quality = quality;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxDpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.classList.add('webgl');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();

    // Background (nebula) is rendered into a low-resolution target each frame
    // and used as the main scene's screen-space background — the nebula is soft
    // so this is visually lossless and saves most of its fill cost.
    this.bgScene = new THREE.Scene();
    this.bgTarget = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.scene.background = this.bgTarget.texture;

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 2500);
    this.camera.position.set(0, 2.2, 12);

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.target.set(0, 0.15, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.7;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.64;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    this.controls = controls;
    this._idleTimer = 0;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      this._idleTimer = 0;
      this._userControlling = true;
    });
    controls.addEventListener('end', () => {
      this._userControlling = false;
    });

    this._buildLights();
    this._buildEnvironment();

    // Camera offsets (shake, sway, dolly) are layered on top of the orbit
    // controls each frame and removed before the controls update again.
    this.shake = 0;
    this.sway = 0;
    this.dolly = 0;
    this.roll = 0;
    this._offset = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._time = 0;

    this.fitDistance = 12;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x7fb0ff, 0x120a05, 0.18));

    // Warm key from upper right-front, like the poster's highlights.
    const key = new THREE.DirectionalLight(0xffe0b0, 2.0);
    key.position.set(4, 7, 7);
    s.add(key);

    // Cool cyan rim from behind-left and a violet kicker from behind-right.
    const rim = new THREE.DirectionalLight(0x3fd2ff, 2.6);
    rim.position.set(-6, 3, -6);
    s.add(rim);
    const rim2 = new THREE.DirectionalLight(0xb04cff, 1.4);
    rim2.position.set(6, 2, -5);
    s.add(rim2);

    // Stone-coloured glow light at the gauntlet, driven by the director.
    this.glowLight = new THREE.PointLight(0xffffff, 0, 12, 1.2);
    this.glowLight.position.set(0, 1.8, 4.2);
    s.add(this.glowLight);

    this.lights = { key, rim, rim2 };
  }

  _buildEnvironment() {
    // A small synthetic "studio in space": dark sky with coloured softboxes.
    // PMREM-filtered, it gives believable gold reflections without any HDR file.
    const env = new THREE.Scene();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `varying vec3 vDir; void main(){
        float y = vDir.y;
        vec3 c = mix(vec3(0.008,0.01,0.025), vec3(0.03,0.07,0.11), smoothstep(-0.4,0.3,-abs(y)+0.2));
        c += vec3(0.12,0.06,0.02) * smoothstep(0.2,1.0,y);
        gl_FragColor = vec4(c,1.0);
      }`,
    });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));

    const panel = (color, intensity, pos, size) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size[0], size[1]),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
      );
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(0xfff0d8, 6, [8, 14, 12], [12, 6]); // warm key softbox
    panel(0x46d8ff, 3.5, [-16, 4, -10], [5, 18]); // cyan rim
    panel(0xb050ff, 2.5, [16, 2, -12], [5, 14]); // violet rim
    panel(0xff8a30, 1.6, [-10, 16, 6], [8, 5]); // ember top-left
    panel(0x305cff, 0.8, [0, -14, 10], [16, 5]); // cool bounce from below

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(env, 0.035).texture;
    this.scene.environment = this.envMap;
    pmrem.dispose();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;

    // Fit the gauntlet plus its orbiting ring of stones on any aspect ratio;
    // on narrow (portrait) screens the ring tightens so the gauntlet stays big.
    const aspect = this.camera.aspect;
    this.ringRadius = aspect < 0.75 ? 2.3 : aspect < 1.1 ? 2.85 : 3.45;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfH = 3.3;
    const halfW = this.ringRadius + 0.85;
    const dist = Math.max(halfH / tanHalf, halfW / (tanHalf * this.camera.aspect));
    this.fitDistance = dist;
    this.controls.minDistance = dist * 0.62;
    this.controls.maxDistance = dist * 1.5;

    const dir = this._tmp
      ? this._tmp.copy(this.camera.position).sub(this.controls.target).normalize()
      : new THREE.Vector3(0, 0.07, 1).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.camera.updateProjectionMatrix();

    const pr = this.renderer.getPixelRatio();
    const s = this.quality.bgScale;
    this.bgTarget.setSize(Math.max(2, Math.round(w * pr * s)), Math.max(2, Math.round(h * pr * s)));
    this.onResize?.(w, h, pr);
  }

  update(dt, realTime) {
    this._time = realTime;
    const cam = this.camera;
    const controls = this.controls;

    // Remove last frame's offset so OrbitControls sees its own state.
    cam.position.sub(this._offset);

    if (!controls.autoRotate && !this._userControlling) {
      this._idleTimer += dt;
      if (this._idleTimer > 7) controls.autoRotate = true;
    }
    controls.update(dt);

    // Build this frame's offset.
    const off = this._offset.set(0, 0, 0);
    if (this.shake > 0.0001) {
      const s = this.shake;
      off.x += (Math.random() - 0.5) * s;
      off.y += (Math.random() - 0.5) * s;
      off.z += (Math.random() - 0.5) * s * 0.5;
    }
    if (this.sway > 0.0001) {
      const t = realTime;
      off.x += Math.sin(t * 0.9) * 0.35 * this.sway;
      off.y += Math.sin(t * 0.63 + 1.3) * 0.22 * this.sway;
    }
    if (Math.abs(this.dolly) > 0.0001) {
      const dir = this._tmp.copy(controls.target).sub(cam.position).normalize();
      off.addScaledVector(dir, this.dolly);
    }
    cam.position.add(off);
    cam.lookAt(controls.target);
    const roll = this.roll + (this.sway > 0 ? Math.sin(realTime * 0.7) * 0.03 * this.sway : 0);
    if (roll) cam.rotateZ(roll);
    cam.updateMatrixWorld();
  }

  noteInteraction() {
    this.controls.autoRotate = false;
    this._idleTimer = 0;
  }
}
