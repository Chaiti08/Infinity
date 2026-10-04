import './style.css';
import * as THREE from 'three';
import { detectQuality, prefersReducedMotion } from './core/quality.js';
import { Stage } from './core/stage.js';
import { Post } from './core/post.js';
import { Gauntlet } from './gauntlet/gauntlet.js';
import { Stones, loadStoneModels } from './stones/stones.js';
import { Nebula } from './world/nebula.js';
import { Stars } from './world/stars.js';
import { Dust } from './world/dust.js';
import { Galaxy } from './world/galaxy.js';
import { Water } from './world/water.js';
import { Lightning } from './effects/lightning.js';
import { Warp, Portal, TimeRings, Aether, Shockwaves, Bursts } from './effects/fx.js';
import { SnapDust } from './effects/snapDust.js';
import { Director } from './effects/director.js';
import { DragDrop } from './interaction/dragDrop.js';
import { Audio } from './audio/audio.js';
import { UI } from './ui/ui.js';

const params = new URLSearchParams(location.search);

function fatal(msg) {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.innerHTML = msg;
  document.body.appendChild(el);
  document.getElementById('loader')?.remove();
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function boot() {
  if (!hasWebGL()) {
    fatal('Your browser or device doesn’t support WebGL, which this 3D experience needs.<br/>Try a recent Chrome, Edge, Firefox or Safari.');
    return;
  }

  const quality = detectQuality();
  const reducedMotion = prefersReducedMotion();
  const audio = new Audio();
  let director;
  let dragDrop;

  const ui = new UI({
    muted: audio.muted,
    onToggleStone: (id) => dragDrop?.toggle(id),
    onReset: () => director?.reset(),
    onSnap: () => {
      audio.unlock();
      director?.snap();
    },
    onMute: (m) => {
      audio.unlock();
      audio.setMuted(m);
    },
  });
  ui.loaderProgress(0.1, 'Forging the gauntlet');
  await nextFrame();

  const stage = new Stage(document.getElementById('app'), quality);
  const post = new Post(stage, quality);
  const { scene, bgScene, camera, renderer } = stage;
  scene.add(camera); // camera-attached effects (hyperspace)

  const gauntlet = new Gauntlet(scene);
  await gauntlet.loadCustomModel();
  ui.loaderProgress(0.35, 'Gathering the stones');
  await nextFrame();

  const stoneModels = await loadStoneModels();
  const stones = new Stones(scene, gauntlet, quality, stage, stoneModels);
  const nebula = new Nebula(bgScene, quality);
  const stars = new Stars(scene, quality);
  const dust = new Dust(scene, quality);
  const galaxy = new Galaxy(scene, quality);
  const water = new Water(scene, quality, renderer);
  const lightning = new Lightning(scene, 22);
  const warp = new Warp(camera, quality.name === 'low' ? 350 : 650);
  const portal = new Portal(scene);
  const rings = new TimeRings(scene);
  const aether = new Aether(scene, quality.aether);
  const shocks = new Shockwaves(scene);
  const bursts = new Bursts(scene, 3500);
  const snapDust = new SnapDust(scene, quality);

  const ctx = {
    stage,
    post,
    gauntlet,
    stones,
    nebula,
    stars,
    dust,
    galaxy,
    water,
    lightning,
    warp,
    portal,
    rings,
    aether,
    shocks,
    bursts,
    snapDust,
    audio,
    ui,
    quality,
    reducedMotion,
    pixelRatio: renderer.getPixelRatio(),
  };
  director = new Director(ctx);
  dragDrop = new DragDrop({ stage, stones, gauntlet, director, audio, ui });

  stage.onResize = (w, h, pr) => {
    post.resize(w, h, pr);
    ctx.pixelRatio = pr;
  };
  stage.resize();

  // Warm up every shader up front (including effects that start hidden) so
  // the first stone doesn't hitch.
  ui.loaderProgress(0.6, 'Bending light');
  await nextFrame();
  const hidden = [warp.lines, portal.mesh, rings.group, aether.points, galaxy.points, water.mesh, ...lightning.bolts.map((b) => b.mesh)];
  hidden.forEach((o) => (o.visible = true));
  try {
    if (renderer.compileAsync) {
      await renderer.compileAsync(scene, camera);
      await renderer.compileAsync(bgScene, camera);
    } else {
      renderer.compile(scene, camera);
      renderer.compile(bgScene, camera);
    }
  } catch (e) {
    console.warn('Shader warm-up skipped', e);
  }
  hidden.forEach((o) => (o.visible = false));
  ui.loaderProgress(0.9, 'Opening the cosmos');

  // ?calibrate — click the model to print socket coordinates (for custom models).
  if (params.has('calibrate')) {
    const rc = new THREE.Raycaster();
    renderer.domElement.addEventListener('pointerdown', (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = gauntlet.hit(rc);
      if (!hit) return;
      const local = gauntlet.root.worldToLocal(hit.point.clone());
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const inv = gauntlet.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      n.applyQuaternion(inv);
      const f = (v) => v.toArray().map((x) => +x.toFixed(3));
      console.log(`{ position: [${f(local)}], normal: [${f(n)}], radius: 0.1 },`);
    });
    console.info('[calibrate] Click on the gauntlet to print socket entries for modelConfig.js');
  }

  if (params.has('debug')) window.__gauntlet = { director, stones, dragDrop, stage, gauntlet };

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let realTime = 0;
  let frames = 0;
  let fpsTime = 0;
  let adapted = false;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    realTime += dt;

    const simDt = director.update(dt, realTime);
    const simTime = director.simTime;
    const pr = ctx.pixelRatio;

    gauntlet.update(simTime);
    stones.update(simDt, simTime, dt);
    stage.update(dt, realTime);
    nebula.update(simTime, camera);
    stars.update(simTime, camera, pr);
    dust.update(simTime, pr);
    galaxy.update(realTime, pr);
    water.update(simTime);
    lightning.update(simDt, camera.position);
    shocks.update(dt, camera);
    bursts.update(simTime, pr);
    post.update(dt, realTime);
    ui.update(dt);

    renderer.setRenderTarget(stage.bgTarget);
    renderer.render(bgScene, camera);
    renderer.setRenderTarget(null);
    post.render();

    // One-time adaptive step: if the device is struggling, render fewer pixels.
    if (!adapted && realTime > 2) {
      frames++;
      fpsTime += dt;
      if (fpsTime > 3) {
        adapted = true;
        const fps = frames / fpsTime;
        if (fps < 34 && renderer.getPixelRatio() > 1) {
          renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.7));
          stage.resize();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Reveal once the first frames are on screen.
  await nextFrame();
  await nextFrame();
  ui.loaderProgress(1);
  setTimeout(() => ui.hideLoader(), 250);

  // Audio can only start after a user gesture.
  const unlock = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

boot().catch((err) => {
  console.error(err);
  fatal('Something went wrong while starting the experience.<br/>Please refresh the page.');
});
