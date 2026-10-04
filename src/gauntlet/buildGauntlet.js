import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getGauntletMaterials } from './materials.js';

// A procedurally modelled gauntlet: a closed left fist seen from the back of
// the hand, thumb on the viewer's right — matching the reference art.
// Units: roughly 4 tall, cuff bottom at y = -2.05, knuckles near y = 1.2.

const ZS = 0.8; // forearm cross-section is an ellipse (flattened front-to-back)

// Outer silhouette of the forearm cuff: [radius, y]
const CUFF = [
  [0.88, -2.05],
  [0.9, -1.95],
  [0.86, -1.85],
  [0.82, -1.55],
  [0.76, -1.15],
  [0.7, -0.75],
  [0.64, -0.45],
  [0.61, -0.3],
];

function cuffRadius(y) {
  if (y <= CUFF[0][1]) return CUFF[0][0];
  for (let i = 0; i < CUFF.length - 1; i++) {
    const [r0, y0] = CUFF[i];
    const [r1, y1] = CUFF[i + 1];
    if (y >= y0 && y <= y1) return THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0));
  }
  return CUFF[CUFF.length - 1][0];
}

// Rounded-rectangle cross-section in (dr, dy) used for bands and ridges.
function roundedProfile(thick, height, radius, steps = 4) {
  const pts = [];
  const r = Math.min(radius, thick / 2, height / 2);
  const corners = [
    [thick - r, height / 2 - r, 0], // top-outer
    [r, height / 2 - r, Math.PI / 2], // top-inner
    [r, -height / 2 + r, Math.PI], // bottom-inner
    [thick - r, -height / 2 + r, Math.PI * 1.5], // bottom-outer
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/**
 * A band that wraps the forearm, following its taper. `dip` pulls the front
 * of the band down into a chevron like layered armour plates.
 */
function wrapBand({ y, height, thick, dip = 0, inset = -0.01, segs = 96, radius = 0.025 }) {
  const prof = roundedProfile(thick, height, radius);
  const n = prof.length;
  const positions = [];
  const uvs = [];
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * Math.PI * 2;
    const front = Math.pow(Math.max(0, Math.cos(phi)), 1.6);
    const yc = y - dip * front;
    const base = cuffRadius(yc) + inset;
    for (let j = 0; j < n; j++) {
      const [dr, dy] = prof[j];
      const r = base + dr;
      positions.push(Math.sin(phi) * r, yc + dy, Math.cos(phi) * r * ZS);
      uvs.push(i / segs * 6, j / n);
    }
  }
  const index = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + j;
      const d = (i + 1) * n + ((j + 1) % n);
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function cuffBody() {
  // Closed lathe: outer silhouette up, then an inner wall back down.
  const pts = CUFF.map(([r, y]) => new THREE.Vector2(r, y));
  const inner = [...CUFF].reverse().map(([r, y]) => new THREE.Vector2(r - 0.07, y));
  inner[inner.length - 1].y += 0.02;
  const g = new THREE.LatheGeometry([...pts, ...inner, pts[0].clone()], 96);
  g.scale(1, 1, ZS);
  return g;
}

function taperedBox(w, h, d, r, { bottom = 1, top = 1, curve = 0, segs = 4 } = {}) {
  const g = new RoundedBoxGeometry(w, h, d, segs, r);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    const t = (y + h / 2) / h;
    const s = THREE.MathUtils.lerp(bottom, top, t);
    x *= s;
    if (curve && z > 0) {
      const hw = (w * s) / 2;
      z += curve * (1 - Math.min(1, (x / hw) ** 2)) * (z / (d / 2));
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeBoundingSphere();
  return g;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// A finger/thumb phalanx: a flattened capsule from a to b, its back face
// oriented toward `back`.
function segment(a, b, width, thick, mat, _radius, back = new THREE.Vector3(0, 0, 1)) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const r = thick / 2;
  const g = new THREE.CapsuleGeometry(r, Math.max(0.02, len - r * 0.4), 8, 24);
  g.scale(width / thick, 1, 1);
  const m = new THREE.Mesh(g, mat);
  // Build a basis: y along the bone, z toward `back`, x completes it.
  const z = back.clone().sub(dir.clone().multiplyScalar(back.dot(dir))).normalize();
  const x = new THREE.Vector3().crossVectors(dir, z).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, dir, z);
  m.quaternion.setFromRotationMatrix(basis);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  return m;
}

function jointCylinder(at, axis, radius, length, mat) {
  const g = new THREE.CylinderGeometry(radius, radius, length, 28, 1);
  const m = new THREE.Mesh(g, mat);
  m.quaternion.setFromUnitVectors(Y_AXIS, axis.clone().normalize());
  m.position.copy(at);
  return m;
}

// Socket: dark cup + polished bezel, oriented along `normal`.
function socket(group, pos, normal, radius, mats) {
  const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, normal.clone().normalize());
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 1.2, 0.07, 32), mats.socket);
  cup.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  cup.position.copy(pos).addScaledVector(normal, -0.035);
  group.add(cup);

  const bezel = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.2, radius * 0.2, 14, 48), mats.goldBright);
  bezel.quaternion.copy(q);
  bezel.position.copy(pos).addScaledVector(normal, 0.005);
  group.add(bezel);

  // Four little claws holding the stone.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const claw = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.16, 10, 8), mats.goldBright);
    const local = new THREE.Vector3(Math.cos(a) * radius * 1.2, Math.sin(a) * radius * 1.2, radius * 0.18);
    claw.position.copy(pos).add(local.applyQuaternion(q));
    group.add(claw);
  }
}

export function buildProceduralGauntlet() {
  const mats = getGauntletMaterials();
  const root = new THREE.Group();
  root.name = 'gauntlet';
  const add = (mesh) => {
    root.add(mesh);
    return mesh;
  };

  // ---------- Forearm cuff ----------
  add(new THREE.Mesh(cuffBody(), mats.gold));
  add(new THREE.Mesh(wrapBand({ y: -1.95, height: 0.22, thick: 0.07, radius: 0.03 }), mats.goldBright));
  add(new THREE.Mesh(wrapBand({ y: -1.78, height: 0.03, thick: 0.02, radius: 0.012 }), mats.goldDark));
  add(new THREE.Mesh(wrapBand({ y: -1.22, height: 0.2, thick: 0.035, dip: 0.3 }), mats.gold));
  add(new THREE.Mesh(wrapBand({ y: -0.68, height: 0.16, thick: 0.032, dip: 0.22 }), mats.gold));
  // Wrist rings
  add(new THREE.Mesh(wrapBand({ y: -0.36, height: 0.12, thick: 0.05, inset: 0.0 }), mats.goldBright));
  add(new THREE.Mesh(wrapBand({ y: -0.2, height: 0.12, thick: 0.05, inset: -0.03 }), mats.gold));

  // Vertical plate seams running down the forearm
  for (const phi of [-1.0, 1.0, Math.PI - 0.9, Math.PI + 0.9]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const y = THREE.MathUtils.lerp(-1.82, -0.46, i / 12);
      const r = cuffRadius(y) + 0.005;
      pts.push(new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r * ZS));
    }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 6, false), mats.goldDark));
  }

  // Rivets around the bottom rim
  const rivetGeo = new THREE.SphereGeometry(0.03, 12, 8);
  for (let i = 0; i < 20; i++) {
    const phi = (i / 20) * Math.PI * 2;
    const y = -1.95;
    const r = cuffRadius(y) + 0.075;
    const m = new THREE.Mesh(rivetGeo, mats.goldDark);
    m.position.set(Math.sin(phi) * r, y, Math.cos(phi) * r * ZS);
    add(m);
  }

  // ---------- Hand (scaled up slightly about the wrist) ----------
  const hand = new THREE.Group();
  root.add(hand);
  const HAND_SCALE = 1.14;
  const PIVOT_Y = -0.1;
  hand.scale.setScalar(HAND_SCALE);
  hand.position.y = PIVOT_Y - PIVOT_Y * HAND_SCALE;
  const addH = (mesh) => {
    hand.add(mesh);
    return mesh;
  };

  const back = addH(new THREE.Mesh(taperedBox(1.34, 1.32, 0.62, 0.15, { bottom: 0.78, top: 1, curve: 0.07 }), mats.gold));
  back.position.set(0, 0.54, 0);

  // Palm (slightly darker, mostly hidden)
  const palm = addH(new THREE.Mesh(taperedBox(1.26, 1.1, 0.3, 0.12, { bottom: 0.8 }), mats.goldDark));
  palm.position.set(0, 0.62, -0.26);

  // Knuckle bar under the knuckle caps
  const bar = addH(new THREE.Mesh(taperedBox(1.36, 0.3, 0.56, 0.12, { curve: 0.04 }), mats.goldDark));
  bar.position.set(0, 1.12, 0.0);

  // Mind-stone ornament: a U-shaped raised ridge and an outer ring.
  const uCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.52, 1.0, 0.335),
    new THREE.Vector3(-0.42, 0.45, 0.355),
    new THREE.Vector3(-0.2, 0.08, 0.37),
    new THREE.Vector3(0, 0.0, 0.375),
    new THREE.Vector3(0.2, 0.08, 0.37),
    new THREE.Vector3(0.42, 0.45, 0.355),
    new THREE.Vector3(0.52, 1.0, 0.335),
  ]);
  addH(new THREE.Mesh(new THREE.TubeGeometry(uCurve, 80, 0.035, 12, false), mats.goldBright));
  const vCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.3, 0.98, 0.36),
    new THREE.Vector3(-0.15, 0.78, 0.385),
    new THREE.Vector3(0, 0.74, 0.39),
  ]);
  const vCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 0.98, 0.36),
    new THREE.Vector3(0.15, 0.78, 0.385),
    new THREE.Vector3(0, 0.74, 0.39),
  ]);
  addH(new THREE.Mesh(new THREE.TubeGeometry(vCurveL, 24, 0.022, 8, false), mats.goldBright));
  addH(new THREE.Mesh(new THREE.TubeGeometry(vCurveR, 24, 0.022, 8, false), mats.goldBright));
  const mindRing = addH(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 12, 64), mats.goldBright));
  mindRing.position.set(0, 0.44, 0.37);
  const mindPlate = addH(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.05, 48), mats.goldDark));
  mindPlate.rotation.x = Math.PI / 2;
  mindPlate.position.set(0, 0.44, 0.355);

  // ---------- Fingers ----------
  // Viewer left → right: pinky, ring, middle, index.
  const fingers = [
    { x: -0.47, w: 0.3, dl: -0.06, stone: 'soul' },
    { x: -0.157, w: 0.33, dl: 0.02, stone: 'reality' },
    { x: 0.157, w: 0.34, dl: 0.05, stone: 'space' },
    { x: 0.47, w: 0.32, dl: 0.0, stone: 'power' },
  ];
  const sockets = {};
  const xAxis = new THREE.Vector3(1, 0, 0);
  for (const f of fingers) {
    const P0 = new THREE.Vector3(f.x, 1.22, 0.05);
    const P1 = new THREE.Vector3(f.x, 1.56 + f.dl, 0.02);
    const P2 = new THREE.Vector3(f.x, 1.62 + f.dl, -0.3);
    const P3 = new THREE.Vector3(f.x, 1.4 + f.dl * 0.5, -0.46);
    const backDir = new THREE.Vector3(0, 0, 1);
    addH(segment(P0, P1, f.w * 0.96, 0.3, mats.gold, 0, backDir));
    addH(segment(P1, P2, f.w * 0.93, 0.28, mats.gold, 0, new THREE.Vector3(0, 1, 0)));
    addH(segment(P2, P3, f.w * 0.88, 0.25, mats.gold, 0, new THREE.Vector3(0, 0, -1)));
    addH(jointCylinder(P1, xAxis, 0.12, f.w * 1.0, mats.goldDark));
    addH(jointCylinder(P2, xAxis, 0.11, f.w * 0.96, mats.goldDark));
    // Raised ridge along the back of the proximal phalanx
    const ridgeCurve = new THREE.CatmullRomCurve3([
      P0.clone().add(new THREE.Vector3(0, 0.12, 0.14)),
      P0.clone().lerp(P1, 0.5).add(new THREE.Vector3(0, 0, 0.152)),
      P1.clone().add(new THREE.Vector3(0, 0.0, 0.142)),
      P1.clone().lerp(P2, 0.35).add(new THREE.Vector3(0, 0.135, 0.03)),
    ]);
    addH(new THREE.Mesh(new THREE.TubeGeometry(ridgeCurve, 24, 0.018, 8, false), mats.goldBright));

    // Knuckle cap holding the stone
    const cap = addH(new THREE.Mesh(taperedBox(f.w * 0.98, 0.3, 0.28, 0.1, { curve: 0.03 }), mats.gold));
    cap.position.set(f.x, 1.15, 0.16);
    cap.rotation.x = -0.22;
    const n = new THREE.Vector3(0, 0.22, 1).normalize();
    const pos = new THREE.Vector3(f.x, 1.16, 0.31);
    socket(hand, pos, n, 0.1, mats);
    sockets[f.stone] = { position: pos.clone().addScaledVector(n, 0.02), normal: n, radius: 0.1 };
  }

  // ---------- Thumb (viewer's right) ----------
  const T0 = new THREE.Vector3(0.6, 0.22, 0.04);
  const T1 = new THREE.Vector3(0.9, 0.78, 0.02);
  const T2 = new THREE.Vector3(0.78, 1.08, -0.3);
  const T3 = new THREE.Vector3(0.48, 1.16, -0.52);
  const thumbBack = new THREE.Vector3(0.75, -0.25, 0.6).normalize();
  const thenar = addH(new THREE.Mesh(taperedBox(0.42, 0.66, 0.48, 0.13), mats.gold));
  thenar.position.set(0.56, 0.38, 0.0);
  thenar.rotation.z = -0.45;
  addH(segment(T0, T1, 0.33, 0.29, mats.gold, 0.09, thumbBack));
  addH(segment(T1, T2, 0.3, 0.27, mats.gold, 0.085, new THREE.Vector3(1, 0.3, 0.2)));
  addH(segment(T2, T3, 0.27, 0.25, mats.gold, 0.08, new THREE.Vector3(0.2, 1, -0.2)));
  addH(jointCylinder(T1, new THREE.Vector3(-0.6, 0.2, -0.75), 0.15, 0.31, mats.gold));
  addH(jointCylinder(T2, new THREE.Vector3(-0.3, 0.9, -0.3), 0.13, 0.27, mats.gold));
  {
    const mid = T0.clone().lerp(T1, 0.52);
    const n = thumbBack.clone();
    const pos = mid.clone().addScaledVector(n, 0.15);
    socket(hand, pos, n, 0.105, mats);
    sockets.time = { position: pos.clone().addScaledVector(n, 0.02), normal: n, radius: 0.105 };
  }

  // ---------- Mind socket (back of hand) ----------
  {
    const n = new THREE.Vector3(0, 0.04, 1).normalize();
    const pos = new THREE.Vector3(0, 0.44, 0.39);
    socket(hand, pos, n, 0.19, mats);
    sockets.mind = { position: pos.clone().addScaledVector(n, 0.03), normal: n, radius: 0.19 };
  }

  // Socket positions are authored in hand space; bring them into root space.
  hand.updateMatrix();
  for (const sk of Object.values(sockets)) sk.position.applyMatrix4(hand.matrix);
  for (const sk of Object.values(sockets)) sk.radius *= HAND_SCALE;

  root.traverse((o) => {
    if (o.isMesh) o.userData.gauntletPart = true;
  });

  return { root, sockets };
}
