import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STONES } from '../data/stones.js';
import { MODEL_CONFIG } from '../gauntlet/modelConfig.js';
import { StoneGlow, makeGemMaterial } from './stoneGlow.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ORBIT_SCALE = 0.25;

// Polished oval cabochon, flatter along Z (the axis that faces out of a socket).
function gemGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 28);
  g.scale(1, 0.82, 0.62);
  return g;
}

// Loads stones.glb (see modelConfig.js): per stone id, the gem geometry,
// centred on the origin and sized so the gem is roughly 2 units across (the same footprint as the procedural gem). Resolves to null
// if the file is missing, in which case the procedural gems are used.
export async function loadStoneModels() {
  const url = MODEL_CONFIG.stonesUrl;
  if (!url) return null;
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const out = {};
    for (const def of STONES) {
      const core = gltf.scene.getObjectByName(`${def.id}_core`);
      if (!core?.geometry) continue;
      const cb = new THREE.Box3().setFromBufferAttribute(core.geometry.attributes.position);
      const coreSize = cb.getSize(new THREE.Vector3());
      out[def.id] = { coreGeo: core.geometry, coreSize };
    }
    return Object.keys(out).length ? out : null;
  } catch (err) {
    console.warn('[stones] Could not load stones.glb, using the procedural stones.', err);
    return null;
  }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

class Stone {
  constructor(def, index, shared, quality, model) {
    this.def = def;
    this.id = def.id;
    this.index = index;
    this.color = new THREE.Color(def.color);
    this.mode = 'orbit';
    this.hover = 0;
    this.hoverTarget = 0;
    this.pulse = 0;
    this.locked = false;
    this.visibility = 1;

    const group = new THREE.Group();
    group.name = `stone-${def.id}`;
    this.group = group;

    // Glassy gem that glows from inside, plus the layered glow (see stoneGlow.js).
    this.gemMat = makeGemMaterial(this.color, index * 7.31);
    this.shell = new THREE.Mesh(model ? model.coreGeo : shared.gemGeo, this.gemMat);
    group.add(this.shell);

    this.glow = new StoneGlow(def, this.color, quality, index * 7.31);
    group.add(this.glow.group);

    // Invisible, generous hit target (bigger on touch screens).
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.hitMesh = new THREE.Mesh(
      shared.hitGeo,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitMesh.scale.setScalar(coarse ? 2.2 : 1.6);
    this.hitMesh.userData.stone = this;
    group.add(this.hitMesh);

    if (quality.stoneLights) {
      // Sits a little in front of the gem (local units scale with the stone)
      // so a socketed stone lights the metal around it without hot spots.
      this.light = new THREE.PointLight(this.color, 0, 3.2, 1.8);
      this.light.position.z = 3;
      group.add(this.light);
    }

    this.scale = ORBIT_SCALE;
    this.group.scale.setScalar(this.scale);
    this.spin = Math.random() * Math.PI * 2;
    this.fly = null;
  }
}

export class Stones {
  constructor(scene, gauntlet, quality, stage, models = null) {
    this.scene = scene;
    this.stage = stage;
    this.maxDpr = quality.maxDpr ?? 2;
    this.gauntlet = gauntlet;
    this.ringAngle = 0;
    this.ringCenter = new THREE.Vector3(0, 0.05, 0);
    this.ringRadius = 3.45;
    this.ringTilt = 0.32;

    const shared = {
      gemGeo: gemGeometry(),
      coreGeo: new THREE.SphereGeometry(1, 20, 14).scale(0.9, 0.75, 0.55),
      hitGeo: new THREE.SphereGeometry(1, 12, 8),
    };
    this.list = STONES.map((def, i) => new Stone(def, i, shared, quality, models?.[def.id]));
    this.byId = Object.fromEntries(this.list.map((s) => [s.id, s]));
    this.hitMeshes = this.list.map((s) => s.hitMesh);
    for (const s of this.list) {
      this.orbitPosition(s, s.group.position);
      scene.add(s.group);
    }

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._simTime = 0;
  }

  orbitPosition(stone, out) {
    const a = this.ringAngle + (stone.index / this.list.length) * Math.PI * 2;
    const r = this.stage?.ringRadius ?? this.ringRadius;
    out.set(Math.sin(a) * r, 0, Math.cos(a) * r * 0.92);
    // Tilt the ring so stones dip in front and rise behind.
    const y = -Math.cos(a) * r * Math.sin(this.ringTilt) * 0.55;
    out.y = y + Math.sin(this._simTime * 1.3 + stone.index * 1.7) * 0.09;
    return out.add(this.ringCenter);
  }

  pick(raycaster) {
    const hits = raycaster.intersectObjects(this.hitMeshes, false);
    for (const h of hits) {
      const s = h.object.userData.stone;
      if (s.visibility > 0.5) return s;
    }
    return null;
  }

  // Animate a stone to a moving target; `targetFn(outVec)` → returns scale.
  _flyTo(stone, targetFn, duration, onDone, arc = 0.8) {
    stone.fly = {
      t: 0,
      duration,
      from: stone.group.position.clone(),
      fromScale: stone.scale,
      fromQuat: stone.group.quaternion.clone(),
      targetFn,
      onDone,
      arc,
    };
  }

  sendToSocket(stone, onArrive) {
    stone.mode = 'fly';
    this._flyTo(
      stone,
      (out, outQuat) => {
        this.gauntlet.socketWorldPosition(stone.id, out);
        const n = this.gauntlet.socketWorldNormal(stone.id, this._n);
        outQuat.setFromUnitVectors(Z_AXIS, n);
        return this.gauntlet.socketRadius(stone.id);
      },
      0.55,
      () => {
        stone.mode = 'socket';
        onArrive?.(stone);
      },
      0.35
    );
  }

  sendToOrbit(stone, duration = 0.8, onDone) {
    stone.mode = 'fly';
    this._flyTo(
      stone,
      (out, outQuat) => {
        this.orbitPosition(stone, out);
        outQuat.identity();
        return ORBIT_SCALE;
      },
      duration,
      () => {
        stone.mode = 'orbit';
        onDone?.(stone);
      },
      0.6
    );
  }

  // Put every stone far away, then fly them back into the ring.
  scatterAndReturn() {
    for (const s of this.list) {
      const dir = new THREE.Vector3().randomDirection();
      s.group.position.copy(dir.multiplyScalar(40));
      s.visibility = 1;
      s.locked = false;
      this.sendToOrbit(s, 2.2 + s.index * 0.15);
    }
  }

  setLocked(locked) {
    for (const s of this.list) s.locked = locked;
  }

  update(simDt, simTime, dt) {
    this._simTime = simTime;
    this.ringAngle += simDt * 0.16;

    for (const s of this.list) {
      s.hover += (s.hoverTarget - s.hover) * Math.min(1, dt * 12);
      s.pulse = Math.max(0, s.pulse - dt * 0.9);
      s.spin += simDt * (s.mode === 'socket' ? 0.0 : 0.6);

      let targetScale = s.scale;
      if (s.mode === 'orbit') {
        this.orbitPosition(s, s.group.position);
        s.group.quaternion.setFromAxisAngle(this._v.set(0.2, 1, 0.1).normalize(), s.spin);
        targetScale = ORBIT_SCALE;
      } else if (s.mode === 'socket') {
        this.gauntlet.socketWorldPosition(s.id, s.group.position);
        const n = this.gauntlet.socketWorldNormal(s.id, this._n);
        s.group.quaternion.setFromUnitVectors(Z_AXIS, n);
        targetScale = this.gauntlet.socketRadius(s.id);
      } else if (s.mode === 'fly' && s.fly) {
        const f = s.fly;
        f.t += dt / f.duration;
        const t = easeInOut(Math.min(1, f.t));
        const end = this._v2;
        const q = this._q;
        const endScale = f.targetFn(end, q);
        // Quadratic bezier with a lift so the motion arcs.
        const ctrl = this._v.copy(f.from).lerp(end, 0.5);
        ctrl.y += f.arc;
        const a = 1 - t;
        s.group.position.set(
          a * a * f.from.x + 2 * a * t * ctrl.x + t * t * end.x,
          a * a * f.from.y + 2 * a * t * ctrl.y + t * t * end.y,
          a * a * f.from.z + 2 * a * t * ctrl.z + t * t * end.z
        );
        s.group.quaternion.slerpQuaternions(f.fromQuat, q, t);
        s.scale = THREE.MathUtils.lerp(f.fromScale, endScale, t);
        targetScale = s.scale;
        if (f.t >= 1) {
          s.fly = null;
          f.onDone?.();
        }
      } else if (s.mode === 'drag') {
        s.group.quaternion.setFromAxisAngle(this._v.set(0.2, 1, 0.1).normalize(), s.spin);
        targetScale = ORBIT_SCALE * 1.15;
      }
      if (s.mode !== 'fly') s.scale += (targetScale - s.scale) * Math.min(1, dt * 10);

      const hoverBoost = 1 + s.hover * 0.18;
      const vis = s.visibility;
      s.group.scale.setScalar(Math.max(0.0001, s.scale * hoverBoost * vis));
      s.group.visible = vis > 0.001;

      const socketed = s.mode === 'socket';
      const boost = 0.9 + s.hover * 0.4 + s.pulse * 2.2;
      s.gemMat.uniforms.uTime.value = simTime;
      s.gemMat.uniforms.uBoost.value = boost;
      s.glow.update({
        time: simTime,
        boost,
        calm: socketed ? 0.55 : 1,
        vis,
        worldScale: s.group.scale.x,
        viewH: innerHeight * Math.min(devicePixelRatio || 1, this.maxDpr),
      });
      if (s.light) s.light.intensity = (socketed ? 0.7 : 0.5) * vis + s.pulse * 3;
    }
  }
}
