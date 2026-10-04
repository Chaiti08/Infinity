import { STONES } from '../data/stones.js';

const $ = (sel) => document.querySelector(sel);

export class UI {
  constructor({ onToggleStone, onReset, onSnap, onMute, muted }) {
    this.tray = $('#tray');
    this.count = $('#count');
    this.hint = $('#hint');
    this.captionEl = $('#caption');
    this.tooltipEl = $('#tooltip');
    this.messageEl = $('#message');
    this.snapBtn = $('#snap');
    this.muteBtn = $('#mute');
    this.resetBtn = $('#reset');
    this.snapVisible = false;
    this.placedOnce = false;

    // Stone pips: also an accessible way to place/remove stones.
    this.pips = {};
    for (const s of STONES) {
      const b = document.createElement('button');
      b.className = 'pip';
      b.style.setProperty('--c', s.color);
      b.setAttribute('aria-label', `${s.name} — press ${s.key} to place or remove`);
      b.title = `${s.name} (${s.key})`;
      b.innerHTML = '<span></span>';
      b.addEventListener('click', () => onToggleStone(s.id));
      this.tray.querySelector('.pips').appendChild(b);
      this.pips[s.id] = b;
    }

    this.resetBtn.addEventListener('click', onReset);
    this.snapBtn.addEventListener('click', onSnap);
    this.setMuted(muted);
    this.muteBtn.addEventListener('click', () => {
      const m = this.muteBtn.getAttribute('aria-pressed') !== 'true';
      this.setMuted(m);
      onMute(m);
    });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const s = STONES.find((x) => x.key === e.key);
      if (s) onToggleStone(s.id);
      else if (e.key === 'r' || e.key === 'R') onReset();
      else if ((e.key === ' ' || e.key === 'Enter') && this.snapVisible) {
        e.preventDefault();
        onSnap();
      } else if (e.key === 'm' || e.key === 'M') this.muteBtn.click();
    });

    this._initTrail();
  }

  setMuted(m) {
    this.muteBtn.setAttribute('aria-pressed', String(m));
    this.muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
    this.muteBtn.classList.toggle('off', m);
  }

  loaderProgress(p, label) {
    const bar = $('#loader .bar i');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    if (label) $('#loader .label').textContent = label;
  }

  hideLoader() {
    const l = $('#loader');
    l.classList.add('done');
    setTimeout(() => l.remove(), 1200);
    document.body.classList.add('ready');
  }

  setProgress(ids) {
    for (const s of STONES) this.pips[s.id].classList.toggle('on', ids.includes(s.id));
    this.count.textContent = `${ids.length} / 6`;
    if (ids.length && !this.placedOnce) {
      this.placedOnce = true;
      this.hint.classList.add('quiet');
    }
    if (ids.length === 0 && this.placedOnce) this.hint.classList.remove('quiet');
    this.hint.textContent =
      ids.length === 6
        ? 'The gauntlet is complete.'
        : ids.length
          ? `${6 - ids.length} more to go — drag a stone back out to remove it.`
          : 'Drag a stone into the gauntlet';
  }

  caption(def) {
    const el = this.captionEl;
    el.style.setProperty('--c', def.color);
    el.querySelector('.name').textContent = def.name;
    el.querySelector('.fx').textContent = def.effect;
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
    clearTimeout(this._capT);
    this._capT = setTimeout(() => el.classList.remove('show'), 3800);
  }

  tooltip(def, pos) {
    const el = this.tooltipEl;
    if (!def) {
      el.classList.remove('show');
      return;
    }
    el.style.setProperty('--c', def.color);
    el.querySelector('.name').textContent = def.name;
    el.querySelector('.line').textContent = def.tagline;
    const x = Math.min(window.innerWidth - 250, pos.x + 18);
    const y = Math.max(10, pos.y - 70);
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.classList.add('show');
  }

  dragging(on) {
    document.body.classList.toggle('is-dragging', on);
  }

  dropHint(def) {
    if (def) {
      this.hint.dataset.prev = this.hint.textContent;
      this.hint.textContent = `Release to set the ${def.name}`;
      this.hint.classList.add('drop');
      this.hint.style.setProperty('--c', def.color);
    } else if (this.hint.classList.contains('drop')) {
      this.hint.classList.remove('drop');
      this.hint.textContent = this.hint.dataset.prev || '';
    }
  }

  message(title, sub) {
    this.captionEl.classList.remove('show');
    this.messageEl.querySelector('h2').textContent = title;
    this.messageEl.querySelector('p').textContent = sub;
    this.messageEl.classList.add('show');
  }

  hideMessage() {
    this.messageEl.classList.remove('show');
  }

  showSnap(on) {
    this.snapVisible = on;
    this.snapBtn.classList.toggle('show', on);
    this.snapBtn.tabIndex = on ? 0 : -1;
    if (on) setTimeout(() => this.snapBtn.focus({ preventScroll: true }), 50);
  }

  setLocked(on) {
    document.body.classList.toggle('locked', on);
  }

  // ---- Mind Stone cursor trail
  _initTrail() {
    const c = $('#trail');
    this.trailCtx = c.getContext('2d');
    this.trailCanvas = c;
    this.trailPts = [];
    this.trailLevel = 0;
    const resize = () => {
      const pr = Math.min(window.devicePixelRatio, 2);
      c.width = window.innerWidth * pr;
      c.height = window.innerHeight * pr;
      this.trailCtx.setTransform(pr, 0, 0, pr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', (e) => {
      if (this.trailLevel > 0.01) this.trailPts.push({ x: e.clientX, y: e.clientY, life: 1 });
    });
  }

  setTrail(v) {
    this.trailLevel = v;
  }

  update(dt) {
    const g = this.trailCtx;
    const pts = this.trailPts;
    if (!pts.length && this._trailClear) return;
    g.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
    this._trailClear = !pts.length;
    for (const p of pts) p.life -= dt * 1.4;
    while (pts.length && pts[0].life <= 0) pts.shift();
    if (pts.length > 160) pts.splice(0, pts.length - 160);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const l = b.life * Math.min(1, this.trailLevel * 1.5);
      g.strokeStyle = `rgba(255, 200, 40, ${0.5 * l})`;
      g.lineWidth = 2 + 10 * l;
      g.shadowColor = 'rgba(255, 190, 30, 0.9)';
      g.shadowBlur = 18 * l;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
  }
}
