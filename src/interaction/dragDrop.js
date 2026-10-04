import * as THREE from 'three';

// Pointer interaction: hover, pick up, drag, drop into the gauntlet (anywhere
// on it — the stone finds its own socket), or drag a socketed stone back out.
// Works the same for mouse, pen and touch.
export class DragDrop {
  constructor({ stage, stones, gauntlet, director, audio, ui }) {
    Object.assign(this, { stage, stones, gauntlet, director, audio, ui });
    this.el = stage.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragging = null;
    this.hovered = null;
    this.overGauntlet = false;
    this.plane = new THREE.Plane();
    this._v = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._lastClient = { x: 0, y: 0 };

    // Registered before OrbitControls handles the same events, so a press on
    // a stone can switch the orbit off first.
    this.el.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.el.addEventListener('pointerleave', () => this.setHover(null));
  }

  _setPointer(e) {
    const r = this.el.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    this._lastClient.x = e.clientX;
    this._lastClient.y = e.clientY;
  }

  setHover(stone) {
    if (this.hovered === stone) return;
    if (this.hovered) this.hovered.hoverTarget = 0;
    this.hovered = stone;
    if (stone) {
      stone.hoverTarget = 1;
      this.audio.hover();
    }
    this.el.style.cursor = stone ? 'grab' : '';
    this.ui.tooltip(stone ? stone.def : null, this._lastClient);
  }

  onDown(e) {
    this.audio.unlock();
    if (!this.director.interactive) return;
    if (e.button !== undefined && e.button !== 0) return;
    this._setPointer(e);
    const stone = this.stones.pick(this.raycaster);
    if (!stone || stone.locked || stone.mode === 'fly') return;

    // Claim the gesture before OrbitControls sees it.
    e.stopImmediatePropagation();
    e.preventDefault();
    this.stage.controls.enabled = false;
    this.el.setPointerCapture?.(e.pointerId);
    this.pointerId = e.pointerId;

    this.dragging = stone;
    this.fromSocket = stone.mode === 'socket';
    stone.mode = 'drag';
    stone.fly = null;
    stone.hoverTarget = 1;
    this.el.style.cursor = 'grabbing';
    this.ui.tooltip(null);
    this.ui.dragging(true);
    this.audio.pickup();
    this.stage.noteInteraction();

    // Drag on a plane through the stone, facing the camera.
    const n = this._v.copy(this.stage.camera.position).sub(stone.group.position).normalize();
    this.plane.setFromNormalAndCoplanarPoint(n, stone.group.position);
    this._grabOffset = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.plane, this._hit)) {
      this._grabOffset.copy(stone.group.position).sub(this._hit);
      // Pull the stone a little toward the camera so it reads as "in hand".
      this._grabOffset.multiplyScalar(0.5);
    }
  }

  onMove(e) {
    if (this.dragging) {
      if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
      this._setPointer(e);
      this._updateDrag();
      return;
    }
    if (e.target !== this.el) return;
    this._setPointer(e);
    if (!this.director.interactive || e.pointerType === 'touch') {
      this.setHover(null);
      return;
    }
    const s = this.stones.pick(this.raycaster);
    this.setHover(s && !s.locked ? s : null);
    if (this.hovered) this.ui.tooltip(this.hovered.def, this._lastClient);
  }

  _updateDrag() {
    const s = this.dragging;
    if (this.raycaster.ray.intersectPlane(this.plane, this._hit)) {
      const target = this._hit.add(this._grabOffset);
      s.group.position.lerp(target, 0.6);
    }
    // Is the stone (or the pointer) over the gauntlet?
    const direct = this.gauntlet.hit(this.raycaster);
    const p = s.group.position;
    const gp = this.gauntlet.group.position;
    const dy = THREE.MathUtils.clamp(p.y - gp.y, -2.0, 1.8);
    const axisDist = Math.hypot(p.x - gp.x, p.z - gp.z, p.y - gp.y - dy);
    const over = !!direct || axisDist < 1.05;
    if (over !== this.overGauntlet) {
      this.overGauntlet = over;
      this.ui.dropHint(over ? s.def : null);
    }
  }

  onUp(e, cancelled = false) {
    if (!this.dragging) return;
    if (this.pointerId !== undefined && e.pointerId !== this.pointerId) return;
    const s = this.dragging;
    this.dragging = null;
    this.pointerId = undefined;
    this.stage.controls.enabled = true;
    this.el.style.cursor = '';
    this.ui.dragging(false);
    this.ui.dropHint(null);
    s.hoverTarget = 0;

    if (this.overGauntlet && !cancelled && this.director.interactive) {
      this.stones.sendToSocket(s, () => this.director.stoneInserted(s.id));
    } else {
      if (this.fromSocket) this.director.stoneRemoved(s.id);
      else this.audio.drop();
      this.stones.sendToOrbit(s);
    }
    this.overGauntlet = false;
  }

  // Keyboard / button alternative: toggle a stone in or out of the gauntlet.
  toggle(id) {
    if (!this.director.interactive) return;
    this.audio.unlock();
    const s = this.stones.byId[id];
    if (!s || s.locked || s.mode === 'fly' || s.mode === 'drag') return;
    if (s.mode === 'socket') {
      this.director.stoneRemoved(id);
      this.stones.sendToOrbit(s);
    } else {
      this.audio.pickup();
      this.stones.sendToSocket(s, () => this.director.stoneInserted(id));
    }
  }
}
