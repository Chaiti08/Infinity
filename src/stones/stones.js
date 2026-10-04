import * as THREE from 'three';
import { STONES } from '../data/stones.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ORBIT_SCALE = 0.25;

function haloTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Polished oval cabochon, flatter along Z (the axis that faces out of a socket).
function gemGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 28);
  g.scale(1, 0.82, 0.62);
  return g;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

class Stone {
  constructor(def, index, shared, quality) {
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

    this.shellMat = new THREE.MeshPhysicalMaterial({
      color: this.color.clone().multiplyScalar(0.9),
      emissive: this.color.clone(),
      emissiveIntensity: 0.55,
      metalness: 0.05,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 2.2,
      specularIntensity: 1,
    });
    this.shell = new THREE.Mesh(shared.gemGeo, this.shellMat);
    group.add(this.shell);

    this.coreMat = new THREE.MeshBasicMaterial({
      color: this.color.clone().multiplyScalar(3.2),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.core = new THREE.Mesh(shared.coreGeo, this.coreMat);
    this.core.scale.setScalar(0.6);
    group.add(this.core);

    this.haloMat = new THREE.SpriteMaterial({
      map: shared.halo,
      color: this.color.clone().multiplyScalar(1.4),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.6,
    });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.scale.setScalar(4.2);
    group.add(this.halo);

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
      this.light = new THREE.PointLight(this.color, 0, 3.2, 1.8);
      group.add(this.light);
    }

    this.scale = ORBIT_SCALE;
    this.group.scale.setScalar(this.scale);
    this.spin = Math.random() * Math.PI * 2;
    this.fly = null;
  }
}

export class Stones {
  constructor(scene, gauntlet, quality) {
    this.scene = scene;
    this.gauntlet = gauntlet;
    this.ringAngle = 0;
    this.ringCenter = new THREE.Vector3(0, 0.05, 0);
    this.ringRadius = 3.45;
    this.ringTilt = 0.32;

    const shared = {
      gemGeo: gemGeometry(),
      coreGeo: new THREE.SphereGeometry(1, 20, 14).scale(0.9, 0.75, 0.55),
      hitGeo: new THREE.SphereGeometry(1, 12, 8),
      halo: haloTexture(),
    };
    this.list = STONES.map((def, i) => new Stone(def, i, shared, quality));
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
    const r = this.ringRadius;
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
      const shimmer = 0.85 + Math.sin(simTime * 3 + s.index) * 0.15;
      s.shellMat.emissiveIntensity = 0.5 + s.hover * 0.5 + s.pulse * 2;
      s.coreMat.color.copy(s.color).multiplyScalar((2.6 + s.hover * 1.5 + s.pulse * 6) * shimmer);
      s.haloMat.opacity = (socketed ? 0.75 : 0.5) * vis + s.hover * 0.3 + s.pulse * 0.6;
      s.halo.scale.setScalar(socketed ? 3.4 + s.pulse * 4 : 4.2 + s.hover * 1.2);
      if (s.light) s.light.intensity = (socketed ? 2.2 : 0.7) * vis + s.pulse * 6;
    }
  }
}
