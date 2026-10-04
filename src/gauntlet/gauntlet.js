import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildProceduralGauntlet } from './buildGauntlet.js';
import { MODEL_CONFIG } from './modelConfig.js';
import { getGauntletMaterials, enhanceMaterial, sharedUniforms } from './materials.js';

export class Gauntlet {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'gauntlet-anchor';
    scene.add(this.group);

    const { root, sockets } = buildProceduralGauntlet();
    this._setModel(root, sockets);

    this.glowColor = new THREE.Color(0x48c8ff);
    this.glowStrength = 0.35;
    this._tmpV = new THREE.Vector3();
    this._tmpQ = new THREE.Quaternion();
  }

  _setModel(root, sockets) {
    if (this.root) this.group.remove(this.root);
    this.root = root;
    this.sockets = sockets;
    this.group.add(root);
    this.meshes = [];
    root.traverse((o) => {
      if (o.isMesh) this.meshes.push(o);
    });
  }

  // Optionally swap in a downloaded .glb (see modelConfig.js).
  async loadCustomModel() {
    const cfg = MODEL_CONFIG;
    if (!cfg.url) return false;
    try {
      const gltf = await new GLTFLoader().loadAsync(cfg.url);
      const model = gltf.scene;
      model.rotation.set(...cfg.rotation);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = cfg.height / size.y;
      const wrapper = new THREE.Group();
      wrapper.add(model);
      model.scale.multiplyScalar(s);
      model.updateMatrixWorld(true);
      box.setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.z -= c.z;
      model.position.y += -2.05 - box.min.y;

      const { gold, surface } = getGauntletMaterials();
      // ?gauntletMaterial=gold|textured-gold|original overrides the config (handy for comparing).
      const mode = new URLSearchParams(location.search).get('gauntletMaterial') || cfg.material;
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.gauntletPart = true;
        const src = o.material;
        if (mode === 'gold') {
          o.material = gold;
        } else if (mode === 'textured-gold') {
          // Real metal: the model's painted texture supplies grime and variation,
          // the procedural surface adds brushed streaks, wear and scratches.
          const micro = surface.clone();
          micro.repeat.set(cfg.surfaceRepeat ?? 3, cfg.surfaceRepeat ?? 3);
          micro.needsUpdate = true;
          o.material = enhanceMaterial(
            new THREE.MeshPhysicalMaterial({
              map: src.map,
              color: new THREE.Color(cfg.tint ?? '#ffcf7a'),
              metalness: cfg.metalness ?? 1,
              roughness: cfg.roughness ?? 0.38,
              roughnessMap: micro,
              bumpMap: micro,
              bumpScale: cfg.bumpScale ?? 0.25,
              clearcoat: 0.35,
              clearcoatRoughness: 0.22,
              envMapIntensity: cfg.envMapIntensity ?? 1.4,
            })
          );
        } else {
          o.material = src.clone();
          o.material.metalness = cfg.metalness ?? o.material.metalness;
          o.material.roughness = cfg.roughness ?? o.material.roughness;
          o.material.envMapIntensity = cfg.envMapIntensity ?? o.material.envMapIntensity;
          enhanceMaterial(o.material);
        }
      });

      // Socket markers authored in Blender: Socket_<id> = stone centre,
      // SocketN_<id> = centre + normal * stone radius.
      model.updateMatrixWorld(true);
      const markers = {};
      model.traverse((o) => {
        const m = /^(Socket|SocketN)_(\w+)$/.exec(o.name);
        if (m) (markers[m[2]] ||= {})[m[1]] = o.getWorldPosition(new THREE.Vector3());
      });

      const sockets = {};
      for (const [id, mk] of Object.entries(markers)) {
        if (!mk.Socket || !mk.SocketN) continue;
        const d = mk.SocketN.clone().sub(mk.Socket);
        sockets[id] = { position: mk.Socket.clone(), normal: d.clone().normalize(), radius: d.length() };
      }
      for (const [id, sk] of Object.entries(cfg.sockets)) {
        sockets[id] = {
          position: new THREE.Vector3(...sk.position),
          normal: new THREE.Vector3(...sk.normal).normalize(),
          radius: sk.radius ?? 0.1,
        };
      }
      const missing = ['soul', 'reality', 'space', 'power', 'time', 'mind'].filter((k) => !sockets[k]);
      if (missing.length) {
        console.warn(`[gauntlet] Custom model has no sockets for: ${missing.join(', ')}. Using procedural positions for those.`);
        for (const k of missing) sockets[k] = this.sockets[k];
      }
      this._setModel(wrapper, sockets);
      this.isCustom = true;
      return true;
    } catch (err) {
      console.warn('[gauntlet] Could not load custom model, using the procedural gauntlet.', err);
      return false;
    }
  }

  // Gem mounts for a custom model: a recessed dark cup, a gold bezel rim shaped
  // to each stone's oval, and four claws. `stoneModels` (from loadStoneModels)
  // gives each gem's size so the mount fits it; missing ones use a default oval.
  addSocketMounts(stoneModels) {
    if (!this.isCustom || this._mounts) return;
    const { socket: cupMat } = getGauntletMaterials();
    const rimMat = enhanceMaterial(
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#c8923f'),
        metalness: 0.9,
        roughness: 0.33,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1.0,
      })
    );
    const Z = new THREE.Vector3(0, 0, 1);
    this._mounts = new THREE.Group();
    this._mounts.name = 'socket-mounts';
    for (const [id, sk] of Object.entries(this.sockets)) {
      const size = stoneModels?.[id]?.coreSize ?? new THREE.Vector3(2, 1.64, 1.24);
      const r = sk.radius;
      const a = (size.x / 2) * r; // gem half-width
      const b = (size.y / 2) * r; // gem half-height
      const d = (size.z / 2) * r; // gem half-depth
      const tube = Math.min(a, b) * 0.21;
      const m = new THREE.Group();
      m.position.copy(sk.position);
      m.quaternion.setFromUnitVectors(Z, sk.normal);

      // Dark cup the gem sinks into.
      const cupGeo = new THREE.CylinderGeometry(1, 0.86, 1, 48, 1, false);
      cupGeo.rotateX(Math.PI / 2);
      const cup = new THREE.Mesh(cupGeo, cupMat);
      cup.scale.set(a * 1.06, b * 1.06, d * 1.3);
      cup.position.z = -d * 0.75;
      m.add(cup);

      // Bezel rim: an elliptical tube of even thickness.
      const pts = [];
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * (a + tube * 0.9), Math.sin(t) * (b + tube * 0.9), -d * 0.12));
      }
      const rim = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, tube, 12, true),
        rimMat
      );
      m.add(rim);

      // Four claws leaning over the gem's edge.
      const clawGeo = new THREE.SphereGeometry(1, 14, 10);
      for (const t of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
        const claw = new THREE.Mesh(clawGeo, rimMat);
        claw.position.set(Math.cos(t) * a * 0.92, Math.sin(t) * b * 0.92, d * 0.2);
        claw.scale.set(tube * 1.1, tube * 1.1, tube * 1.9);
        // Point the long axis back into the setting (local space; lookAt would use world space).
        claw.quaternion.setFromUnitVectors(Z, new THREE.Vector3(0, 0, -d).sub(claw.position).normalize());
        m.add(claw);
      }
      m.traverse((o) => {
        if (o.isMesh) {
          o.userData.gauntletPart = true;
          this.meshes.push(o);
        }
      });
      this._mounts.add(m);
    }
    this.root.add(this._mounts);
  }

  socketWorldPosition(id, target = new THREE.Vector3()) {
    return target.copy(this.sockets[id].position).applyMatrix4(this.root.matrixWorld);
  }

  socketWorldNormal(id, target = new THREE.Vector3()) {
    this.root.getWorldQuaternion(this._tmpQ);
    return target.copy(this.sockets[id].normal).applyQuaternion(this._tmpQ).normalize();
  }

  socketRadius(id) {
    return this.sockets[id].radius;
  }

  hit(raycaster) {
    return raycaster.intersectObjects(this.meshes, false)[0] || null;
  }

  setGlow(color, strength) {
    sharedUniforms.uRimColor.value.copy(color);
    sharedUniforms.uRimStrength.value = strength;
  }

  // Idle hover — runs on world (sim) time so the Time Stone can freeze it.
  update(simTime) {
    const g = this.group;
    g.position.y = Math.sin(simTime * 0.7) * 0.07;
    g.rotation.y = Math.sin(simTime * 0.23) * 0.12;
    g.rotation.z = Math.sin(simTime * 0.31 + 1.0) * 0.025;
    g.updateMatrixWorld(true);
  }
}
