import * as THREE from 'three';
import { STONES, STONE_BY_ID } from '../data/stones.js';
import { sharedUniforms } from '../gauntlet/materials.js';

// How long each stone's full-strength "event" lasts before it settles into a
// lighter, lasting change to the world.
const DURATION = { space: 4.8, mind: 4.6, reality: 5.0, power: 3.4, time: 5.6, soul: 6.0 };
const ULTIMATE_DELAY = 2.4;
const CHARGE = 3.4;

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const BASE_GLOW = new THREE.Color(0x48c8ff);
const WHITE_GOLD = new THREE.Color(1.0, 0.85, 0.55);

export class Director {
  constructor(c) {
    this.c = c;
    this.phase = 'play';
    this.phaseT = 0;
    this.simTime = 0;
    this.timeScale = 1;
    this.bigMul = 1;
    this.fx = {};
    for (const s of STONES) this.fx[s.id] = { t: -1, big: 0, lasting: 0, target: 0, inserted: false, timer: 0 };
    this.pendingUltimate = -1;
    this.fresh = 0;
    this.galaxyForm = 0;
    this.galaxyOpacity = 0;
    this.dissolve = 0;
    this.dim = 0;
    this.flash = 0;
    this.ultimateGlow = 0;
    this.snapProgress = 0;
    this.fade = 0;
    this.shakeImpulse = 0;
    this.crackleTimer = 0;
    this.ambientBoltTimer = 0;

    this._glow = new THREE.Color();
    this._tmpColor = new THREE.Color();
    this._v = new THREE.Vector3();
    this._center = new THREE.Vector3();
    this._screen = new THREE.Vector2();
    this.anchors = [
      [-0.75, -1.3, 0.55],
      [0.72, -0.9, 0.5],
      [0.0, -1.85, 0.78],
      [-0.6, 0.55, 0.35],
      [0.55, 0.0, 0.32],
      [0.0, -0.4, 0.6],
    ].map((a) => new THREE.Vector3(...a));
  }

  get insertedIds() {
    return STONES.filter((s) => this.fx[s.id].inserted).map((s) => s.id);
  }

  get interactive() {
    return this.phase === 'play';
  }

  // ---------------------------------------------------------------- events

  stoneInserted(id) {
    const f = this.fx[id];
    const wasInserted = f.inserted;
    f.inserted = true;
    f.target = 1;
    const { audio, ui, bursts, stones, gauntlet } = this.c;
    const color = STONE_BY_ID[id].color;
    const pos = gauntlet.socketWorldPosition(id, new THREE.Vector3());
    stones.byId[id].pulse = 1;
    audio.socket(110 * Math.pow(2, STONES.findIndex((s) => s.id === id) / 6));
    bursts.emit({ origin: pos, color, count: 160, speed: 2.6, life: 1.4, simTime: this.simTime });
    for (let i = 0; i < 3; i++) this._riseBolt(id, { len: 2.4 + Math.random() * 2, life: 0.7 + Math.random() * 0.5, width: 0.05 });
    ui.setProgress(this.insertedIds);

    if (!wasInserted) {
      f.t = 0;
      f.timer = 0;
      audio.stone(id);
      ui.caption(STONE_BY_ID[id]);
      this._onTrigger(id);
    }
    audio.setCharge(this.insertedIds.length / 6);

    if (this.insertedIds.length === 6) this.pendingUltimate = ULTIMATE_DELAY;
  }

  stoneRemoved(id) {
    const f = this.fx[id];
    if (!f.inserted) return;
    f.inserted = false;
    f.target = 0;
    if (f.t >= 0) f.t = Math.max(f.t, DURATION[id] - 1.2); // let the event fade out
    this.pendingUltimate = -1;
    this.c.ui.setProgress(this.insertedIds);
    this.c.audio.setCharge(this.insertedIds.length / 6);
    this.c.audio.drop();
  }

  _onTrigger(id) {
    const { shocks, post, bursts, stage } = this.c;
    const center = this._gauntletCenter();
    const color = STONE_BY_ID[id].color;
    const screen = this._screenPos(center);
    switch (id) {
      case 'power':
        this.shakeImpulse = this.c.reducedMotion ? 0.06 : 0.5;
        shocks.fire({ center, color, size: 18, duration: 1.4 });
        setTimeout(() => shocks.fire({ center, color, size: 12, duration: 1.1, billboard: true }), 120);
        post.ripple(screen, color, 1.4, 1.3);
        bursts.emit({ origin: center, color, count: 420, speed: 7, life: 2.0, simTime: this.simTime });
        break;
      case 'mind':
        post.ripple(screen, color, 0.8, 2.2);
        break;
      case 'reality':
        bursts.emit({ origin: center, color: '#ff2030', count: 220, speed: 3.5, life: 2.4, simTime: this.simTime });
        break;
      case 'space':
        post.ripple(screen, color, 0.6, 1.6);
        break;
      case 'soul':
        post.ripple(screen, color, 0.5, 2.6);
        break;
      case 'time':
        break;
    }
    stage.noteInteraction();
  }

  startUltimate() {
    this.pendingUltimate = -1;
    this.phase = 'charge';
    this.phaseT = 0;
    this.c.stones.setLocked(true);
    this.c.ui.setLocked(true);
    this.c.ui.message('All six stones', 'The universe holds its breath…');
    this.c.audio.ultimateCharge();
  }

  snap() {
    if (this.phase !== 'ascended') return;
    this.phase = 'snap';
    this.phaseT = 0;
    this.c.ui.showSnap(false);
    this.c.ui.hideMessage();
    this.c.audio.snap();
    this.flash = 0.35;
    this.shakeImpulse = this.c.reducedMotion ? 0.02 : 0.12;
  }

  reset() {
    if (this.phase === 'resetting' || this.phase === 'snap' || this.phase === 'void' || this.phase === 'restore') return;
    this.phase = 'resetting';
    this.phaseT = 0;
  }

  // ------------------------------------------------------------- helpers

  _gauntletCenter() {
    return this.c.gauntlet.group.localToWorld(this._center.set(0, 0.3, 0));
  }

  _screenPos(world) {
    const p = this._v.copy(world).project(this.c.stage.camera);
    return this._screen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5).clone();
  }

  _riseBolt(id, { len = 3, width = 0.045, life = 0.5, intensity = 1, color } = {}) {
    const g = this.c.gauntlet;
    const lateral = new THREE.Vector3((Math.random() - 0.5) * 1.8, 0, (Math.random() - 0.3) * 1.0);
    this.c.lightning.spawn({
      startFn: (out) => g.socketWorldPosition(id, out),
      endOffset: new THREE.Vector3(0, len, 0).add(lateral),
      color: color || STONE_BY_ID[id].color,
      width,
      life,
      intensity,
      rough: 0.2,
    });
  }

  _arc(color, intensity = 0.9) {
    const g = this.c.gauntlet;
    const inserted = this.insertedIds;
    const a = this.anchors[(Math.random() * this.anchors.length) | 0].clone();
    g.root.localToWorld(a);
    let b;
    if (inserted.length && Math.random() < 0.6) {
      b = g.socketWorldPosition(inserted[(Math.random() * inserted.length) | 0], new THREE.Vector3());
    } else {
      b = this.anchors[(Math.random() * this.anchors.length) | 0].clone();
      g.root.localToWorld(b);
    }
    if (a.distanceTo(b) < 0.3) return;
    this.c.lightning.spawn({ start: a, end: b, color, width: 0.025, life: 0.35, intensity, rough: 0.3 });
  }

  _hardReset() {
    const c = this.c;
    for (const s of STONES) Object.assign(this.fx[s.id], { t: -1, big: 0, lasting: 0, target: 0, inserted: false, timer: 0 });
    this.pendingUltimate = -1;
    this.fresh = 0;
    this.galaxyForm = 0;
    this.galaxyOpacity = 0;
    this.ultimateGlow = 0;
    this.bigMul = 1;
    this.timeScale = 1;
    c.lightning.clear();
    c.bursts.clear();
    c.snapDust.dispose();
    c.stones.setLocked(false);
    c.ui.setLocked(false);
    c.ui.setProgress([]);
    c.ui.showSnap(false);
    c.ui.hideMessage();
    c.audio.setCharge(0);
    c.stage.dolly = 0;
  }

  // -------------------------------------------------------------- update

  update(dt, realTime) {
    const c = this.c;
    this.phaseT += dt;

    // ----- per-stone envelopes (real time, so they progress while frozen)
    let maxBig = 0;
    for (const s of STONES) {
      const f = this.fx[s.id];
      const D = DURATION[s.id];
      if (f.t >= 0) {
        f.t += dt;
        f.big = smooth(0, 0.35, f.t) * (1 - smooth(D - 1.4, D, f.t)) * this.bigMul;
        if (f.t >= D) {
          f.t = -1;
          f.big = 0;
        }
      } else f.big = 0;
      const canSettle = f.t < 0 || f.t > D * 0.45;
      if (canSettle) f.lasting += (f.target - f.lasting) * Math.min(1, dt * 0.9);
      maxBig = Math.max(maxBig, f.big);
    }
    const F = this.fx;
    const big = (id) => F[id].big;
    const last = (id) => F[id].lasting;

    // ----- ultimate scheduling & phases
    if (this.pendingUltimate > 0) {
      this.pendingUltimate -= dt;
      if (this.pendingUltimate <= 0) this.startUltimate();
    }

    let chargeK = 0;
    if (this.phase === 'charge') {
      chargeK = Math.min(1, this.phaseT / CHARGE);
      this.bigMul = Math.max(0, 1 - chargeK * 2);
      c.stage.dolly = smooth(0, 1, chargeK) * 2.2 * (c.reducedMotion ? 0.3 : 1);
      this.shakeImpulse = Math.max(this.shakeImpulse, chargeK * chargeK * (c.reducedMotion ? 0.01 : 0.09));
      this.ultimateGlow = chargeK;
      // Every stone throws lightning skyward — the reference image.
      if (Math.random() < dt * (6 + chargeK * 24)) {
        const id = STONES[(Math.random() * 6) | 0].id;
        this._riseBolt(id, { len: 3 + Math.random() * 3.5, width: 0.04 + chargeK * 0.04, life: 0.5 + Math.random() * 0.4, intensity: 1 + chargeK });
      }
      if (Math.random() < dt * 10 * chargeK) this._arc('#fff2c0', 1.2);
      if (this.phaseT >= CHARGE) {
        this.phase = 'flash';
        this.phaseT = 0;
        this.flash = 1;
        c.audio.ultimateFlash();
        const center = this._gauntletCenter();
        c.shocks.fire({ center, color: '#ffe6a8', size: 40, duration: 2.2 });
        c.shocks.fire({ center, color: '#ffffff', size: 22, duration: 1.6, billboard: true });
        c.post.ripple(this._screenPos(center), '#ffe6a8', 2, 2.0);
        c.ui.hideMessage();
      }
    } else if (this.phase === 'flash') {
      // Under full white: rebuild the universe.
      if (this.phaseT > 0.2 && this.fresh < 1) {
        // The stones stay in the gauntlet, but their individual changes to
        // the world give way to the new universe.
        for (const s of STONES) {
          F[s.id].lasting = 0;
          F[s.id].target = 0;
          F[s.id].t = -1;
        }
        this.fresh = 1;
        this.galaxyOpacity = 1;
        this.galaxyForm = 0;
        this.bigMul = 0;
        c.lightning.clear();
        c.stage.dolly = 0;
        this.shakeImpulse = 0;
        c.bursts.emit({ origin: this._gauntletCenter(), color: '#ffd890', count: 600, speed: 9, life: 3, simTime: this.simTime });
      }
      this.ultimateGlow = 1;
      if (this.phaseT > 1.6) {
        this.phase = 'ascended';
        this.phaseT = 0;
        c.ui.message('Balance', 'A new universe, remade by your hand.');
      }
    } else if (this.phase === 'ascended') {
      this.ultimateGlow = 1;
      if (this.phaseT > 4.5 && !c.ui.snapVisible) {
        c.ui.showSnap(true);
        c.ui.hideMessage();
      }
      if (Math.random() < dt * 1.6) {
        const id = STONES[(Math.random() * 6) | 0].id;
        this._riseBolt(id, { len: 1.8 + Math.random() * 2, width: 0.035, life: 0.45, intensity: 0.8, color: '#ffe2a0' });
      }
    } else if (this.phase === 'snap') {
      const t = this.phaseT;
      if (t > 0.7 && !c.snapDust.points) {
        const right = this._v.set(1, 0, 0).applyQuaternion(c.stage.camera.quaternion).setY(0).normalize();
        sharedUniforms.uSweepDir.value.copy(right);
        sharedUniforms.uSweepCenter.value.copy(c.gauntlet.group.position);
        sharedUniforms.uSweepRange.value = 5.2;
        c.snapDust.uniforms.uWind.value.copy(right).add(new THREE.Vector3(0, 0.35, -0.2));
        c.snapDust.prepare(c.gauntlet.meshes, c.stones.list);
        c.audio.dissolve();
      }
      this.snapProgress = Math.max(0, (t - 0.7) / 4.2) * 1.85;
      this.dissolve = Math.min(1, this.snapProgress);
      this.dim = smooth(0.45, 1.35, this.snapProgress);
      this.galaxyOpacity = 1 - smooth(0.2, 1.1, this.snapProgress);
      this.ultimateGlow = 1 - smooth(0.0, 0.8, this.snapProgress);
      if (t > 6.2) {
        this.phase = 'void';
        this.phaseT = 0;
        c.ui.message('Perfectly balanced', 'As all things should be.');
      }
    } else if (this.phase === 'void') {
      if (this.phaseT > 3.2) {
        c.ui.hideMessage();
        this._hardReset();
        c.stones.scatterAndReturn();
        c.audio.restore();
        this.phase = 'restore';
        this.phaseT = 0;
      }
    } else if (this.phase === 'restore') {
      const k = smooth(0, 2.5, this.phaseT);
      this.dim = 1 - k;
      this.dissolve = 1 - smooth(0.3, 2.6, this.phaseT);
      this.snapProgress = 0;
      if (this.phaseT > 2.8) {
        this.dissolve = 0;
        this.dim = 0;
        this.phase = 'play';
        this.phaseT = 0;
      }
    } else if (this.phase === 'resetting') {
      this.fade = smooth(0, 0.45, this.phaseT);
      if (this.phaseT > 0.5 && !this._resetDone) {
        this._resetDone = true;
        this._hardReset();
        this.dissolve = 0;
        this.dim = 0;
        for (const s of c.stones.list) {
          s.fly = null;
          s.mode = 'orbit';
          s.scale = 0.25;
          s.visibility = 1;
        }
      }
      if (this.phaseT > 0.5) this.fade = 1 - smooth(0.5, 1.3, this.phaseT);
      if (this.phaseT > 1.3) {
        this.fade = 0;
        this._resetDone = false;
        this.phase = 'play';
        this.phaseT = 0;
      }
    }

    // ----- world time (Time Stone)
    let ts = THREE.MathUtils.lerp(1, 0.5, last('time'));
    const T = F.time;
    if (T.t >= 0 && this.bigMul > 0) {
      const t = T.t;
      const settle = THREE.MathUtils.lerp(1, 0.5, T.lasting);
      if (t < 0.6) ts = 1 - smooth(0, 0.6, t);
      else if (t < 3.0) ts = 0;
      else if (t < 4.3) ts = -1.7 * Math.sin((Math.PI * (t - 3.0)) / 1.3);
      else ts = settle * smooth(4.3, 5.3, t);
    }
    if (this.fresh) ts = 1;
    this.timeScale = ts;
    const simDt = dt * ts;
    this.simTime += simDt;

    // ----- per-stone ambient behaviour
    for (const s of STONES) {
      const f = F[s.id];
      if (!f.inserted || this.phase !== 'play') continue;
      f.timer -= dt;
      if (f.big > 0.2 && f.timer <= 0) {
        f.timer = 0.12 + Math.random() * 0.25;
        this._riseBolt(s.id, { len: 2 + Math.random() * 2.8, life: 0.45 + Math.random() * 0.3, width: 0.045, intensity: 1.1 });
      } else if (f.timer <= 0) {
        f.timer = 2.2 + Math.random() * 3.5;
        this._riseBolt(s.id, { len: 1.0 + Math.random() * 1.6, life: 0.35, width: 0.03, intensity: 0.75 });
      }
    }
    // Power's lasting crackle over the metal.
    if (this.phase === 'play' && (last('power') > 0.3 || big('power') > 0.2)) {
      this.crackleTimer -= simDt;
      if (this.crackleTimer <= 0) {
        this.crackleTimer = big('power') > 0.2 ? 0.08 : 0.9 + Math.random() * 1.4;
        this._arc(STONE_BY_ID.power.color, 0.9);
      }
    }

    // ----- drive the world
    const nu = c.nebula.uniforms;
    nu.uReality.value = Math.max(big('reality'), last('reality') * 0.35);
    nu.uSoul.value = Math.max(big('soul'), last('soul') * 0.42);
    nu.uSpace.value = Math.max(big('space'), last('space') * 0.4);
    nu.uPower.value = Math.max(big('power'), last('power') * 0.35);
    nu.uMind.value = Math.max(big('mind'), last('mind') * 0.3);
    nu.uTimeStone.value = Math.max(big('time') * (T.t < 4.3 ? 1 : 0.4), last('time') * 0.22);
    nu.uFresh.value = this.fresh;
    nu.uUltimate.value = this.phase === 'charge' ? chargeK : this.phase === 'flash' ? 1 - Math.min(1, this.phaseT / 1.6) : 0;
    nu.uDim.value = this.dim;

    c.water.setOpacity(Math.max(big('soul'), last('soul') * 0.65) * (1 - this.dim));

    // Space: hyperspace, then the portal.
    const sp = F.space;
    let warp = last('space') * 0.04;
    let portal = last('space') * 0.28;
    if (sp.t >= 0) {
      warp = Math.max(warp, smooth(0.0, 0.8, sp.t) * (1 - smooth(1.6, 2.4, sp.t)) * this.bigMul);
      portal = Math.max(portal, smooth(1.7, 2.6, sp.t) * (1 - smooth(DURATION.space - 1.2, DURATION.space, sp.t) * 0.72) * this.bigMul);
    }
    c.warp.update(realTime, warp * (1 - this.dim));
    const center = this._gauntletCenter().clone();
    c.portal.update(realTime, portal * (1 - this.dim), c.stage.camera, center);
    c.rings.update(realTime, big('time'), last('time') * (1 - this.dim), c.stage.camera, c.gauntlet.group.position);
    c.aether.update(this.simTime, Math.max(big('reality'), last('reality') * 0.3) * (1 - this.dim), c.pixelRatio, c.gauntlet.group.position);
    c.stars.uniforms.uWobble.value = big('reality') * 0.8 + last('reality') * 0.05;
    c.stars.uniforms.uOpacity.value = 1 - this.dim;
    c.stars.uniforms.uTintAmt.value = big('time') * 0.6;
    c.stars.uniforms.uTint.value.set(0.4, 1, 0.6);
    c.dust.uniforms.uOpacity.value = (1 - this.dim) * (1 - big('soul') * 0.5);
    c.dust.uniforms.uSwirl.value = big('mind') * 0.6 + big('power') * 0.4;
    c.galaxy.uniforms.uOpacity.value = this.galaxyOpacity;
    if (this.galaxyOpacity > 0 && this.phase !== 'snap') this.galaxyForm = Math.min(1, this.galaxyForm + dt / 5);
    c.galaxy.uniforms.uForm.value = this.galaxyForm;

    // ----- post
    const u = c.post.u;
    const rnd = Math.random();
    const R = F.reality;
    const glitchSpike = R.t >= 0 && R.t < 2.4 ? 1 : 0.3;
    u.uGlitch.value = big('reality') * glitchSpike * (0.4 + 0.6 * rnd) + last('reality') * (rnd < 0.03 ? 0.25 : 0);
    u.uChroma.value = 0.0012 + big('reality') * 0.006 + big('mind') * 0.004 + warp * 0.006 + last('reality') * 0.0008;
    u.uWave.value = big('mind') * 1.3 + last('mind') * 0.12;
    const frozen = T.t >= 0.4 && T.t < 3.0 ? 1 : 0;
    u.uDesat.value = big('time') * (0.2 + frozen * 0.25);
    u.uTint.value.set(0.55, 1.0, 0.7);
    u.uTintAmt.value = big('time') * (0.2 + frozen * 0.15);
    this.flash = Math.max(0, this.flash - dt * (this.phase === 'flash' && this.phaseT < 0.35 ? 0 : 0.9));
    u.uFlash.value = this.flash * this.flash;
    u.uFade.value = this.fade;
    c.post.bloom.strength =
      c.post.baseBloom + this.insertedIds.length * 0.03 + maxBig * 0.2 + chargeK * 0.35 + this.flash * 1.5 + this.ultimateGlow * 0.1;

    // ----- camera feel
    this.shakeImpulse *= Math.exp(-dt * 4.5);
    c.stage.shake = this.shakeImpulse;
    c.stage.sway = (big('mind') + last('mind') * 0.22) * (c.reducedMotion ? 0.15 : 1);
    if (this.phase !== 'charge') c.stage.dolly *= Math.exp(-dt * 3);

    // ----- gauntlet glow: a blend of the socketed stones' colours
    const glow = this._glow.set(0, 0, 0);
    let wsum = 0;
    for (const s of STONES) {
      const f = F[s.id];
      const w = (f.inserted ? 1 : 0) * f.lasting + f.big * 4;
      if (w <= 0) continue;
      glow.add(this._tmpColor.set(s.color).multiplyScalar(w));
      wsum += w;
    }
    if (wsum > 0) glow.multiplyScalar(1 / wsum);
    const baseW = Math.max(0, 1 - wsum);
    glow.lerp(BASE_GLOW, baseW / (baseW + 1));
    glow.lerp(WHITE_GOLD, this.ultimateGlow);
    const strength =
      Math.min(0.9, 0.12 + this.insertedIds.length * 0.04 + maxBig * 0.45 + this.ultimateGlow * 0.2 + chargeK * chargeK * 0.4) * (1 - this.dim);
    c.gauntlet.setGlow(glow, strength);
    sharedUniforms.uDissolve.value = this.dissolve;
    c.stage.glowLight.color.copy(glow);
    c.stage.glowLight.intensity = (0.8 + this.insertedIds.length * 0.35 + maxBig * 2.0 + this.ultimateGlow * 1.2) * (1 - this.dim);

    // stones fade out with the dissolve
    if (this.phase === 'snap') {
      for (const s of c.stones.list) {
        const sw = THREE.MathUtils.clamp(
          s.group.position.clone().sub(sharedUniforms.uSweepCenter.value).dot(sharedUniforms.uSweepDir.value) / 5.2 + 0.5,
          0,
          1
        );
        const start = (sw * 0.72 + 0.14 + 0.12) / 1.25;
        s.visibility = 1 - smooth(start, start + 0.1, this.snapProgress);
      }
    }
    c.snapDust.update(this.snapProgress, c.pixelRatio);
    c.ui.setTrail(big('mind') + last('mind') * 0.3);

    return simDt;
  }
}
