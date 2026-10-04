// All sound is synthesised live with the Web Audio API — no audio files.

const STORE_KEY = 'gauntlet-muted';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(STORE_KEY) === '1';
    } catch {
      /* storage unavailable */
    }
  }

  // Must be called from a user gesture (autoplay policy).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // Shared reverb (synthetic impulse) for space and depth.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.4);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.45;
    this.reverb.connect(this.wet).connect(this.master);

    this.noiseBuf = this._noiseBuffer(2);
    this._startAmbience();
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem(STORE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _out(gain = 1, wet = 0.4) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    if (wet > 0) {
      const s = this.ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.reverb);
    }
    return g;
  }

  _env(param, t, a, peak, d, end = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(end, t + a + d);
  }

  _tone({ type = 'sine', freq = 440, to = null, dur = 1, attack = 0.01, gain = 0.3, wet = 0.4, at = 0, detune = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    o.detune.value = detune;
    const g = this.ctx.createGain();
    this._env(g.gain, t, attack, gain, dur);
    o.connect(g).connect(this._out(1, wet));
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  _noise({ dur = 1, attack = 0.01, gain = 0.3, type = 'bandpass', freq = 1000, to = null, q = 1, wet = 0.4, at = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this._env(g.gain, t, attack, gain, dur);
    src.connect(f).connect(g).connect(this._out(1, wet));
    src.start(t);
    src.stop(t + attack + dur + 0.05);
  }

  _startAmbience() {
    const ctx = this.ctx;
    const out = this._out(0.0, 0.6);
    out.gain.setTargetAtTime(0.11, ctx.currentTime, 2.5);
    this.ambience = out;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    filt.Q.value = 0.7;
    filt.connect(out);
    this.ambFilter = filt;
    for (const [f, type, gain] of [
      [55, 'sawtooth', 0.35],
      [55.4, 'sawtooth', 0.35],
      [82.4, 'triangle', 0.4],
      [110.2, 'sine', 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(filt);
      o.start();
    }
    // Slow filter breathing.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(filt.frequency);
    lfo.start();
  }

  // Tilt the drone's colour as stones accumulate; 0..1.
  setCharge(v) {
    if (!this.ctx) return;
    this.ambFilter.frequency.setTargetAtTime(420 + v * 900, this.ctx.currentTime, 0.8);
    this.ambience.gain.setTargetAtTime(0.11 + v * 0.06, this.ctx.currentTime, 0.8);
  }

  setAmbienceLevel(v) {
    if (!this.ctx) return;
    this.ambience.gain.setTargetAtTime(v, this.ctx.currentTime, 0.4);
  }

  hover() {
    this._tone({ type: 'sine', freq: 1320, dur: 0.18, gain: 0.04, wet: 0.5 });
  }

  pickup() {
    this._noise({ dur: 0.35, gain: 0.12, freq: 600, to: 2400, q: 2, wet: 0.3 });
    this._tone({ type: 'sine', freq: 520, to: 780, dur: 0.3, gain: 0.07 });
  }

  drop() {
    this._noise({ dur: 0.3, gain: 0.08, freq: 1800, to: 500, q: 2, wet: 0.3 });
  }

  // Metal "clunk" + resonant chord when a stone locks in.
  socket(freq = 220) {
    this._tone({ type: 'sine', freq: 90, to: 45, dur: 0.35, gain: 0.5, wet: 0.15 });
    this._noise({ dur: 0.08, gain: 0.25, type: 'highpass', freq: 3000, q: 0.5, wet: 0.2 });
    for (const [m, g] of [
      [1, 0.12],
      [1.5, 0.08],
      [2, 0.07],
      [3.01, 0.04],
    ]) {
      this._tone({ type: 'sine', freq: freq * m, dur: 2.8, attack: 0.02, gain: g, wet: 0.7 });
    }
  }

  stone(id) {
    switch (id) {
      case 'space':
        this._noise({ dur: 2.2, attack: 0.3, gain: 0.25, freq: 200, to: 6000, q: 3, wet: 0.6 });
        this._tone({ type: 'sawtooth', freq: 80, to: 640, dur: 2, attack: 0.2, gain: 0.06, wet: 0.6 });
        this._tone({ type: 'sine', freq: 330, dur: 3, attack: 0.5, gain: 0.08, wet: 0.8 });
        break;
      case 'mind':
        for (let i = 0; i < 5; i++) {
          this._tone({ type: 'sine', freq: 880 * Math.pow(1.122, i), dur: 1.4, attack: 0.01, gain: 0.06, wet: 0.8, at: i * 0.11 });
        }
        this._tone({ type: 'sine', freq: 110, dur: 3.5, attack: 0.8, gain: 0.12, wet: 0.7, detune: 8 });
        break;
      case 'reality':
        for (let i = 0; i < 9; i++) {
          this._tone({ type: 'square', freq: 100 + Math.random() * 900, dur: 0.07, gain: 0.05, wet: 0.2, at: Math.random() * 1.2 });
        }
        this._tone({ type: 'sawtooth', freq: 60, to: 30, dur: 3, attack: 0.3, gain: 0.12, wet: 0.5 });
        this._noise({ dur: 2.5, attack: 0.4, gain: 0.1, freq: 300, q: 8, wet: 0.6 });
        break;
      case 'power':
        this._tone({ type: 'sine', freq: 120, to: 28, dur: 1.4, attack: 0.005, gain: 0.8, wet: 0.3 });
        this._noise({ dur: 1.4, attack: 0.005, gain: 0.45, type: 'lowpass', freq: 2500, to: 120, q: 0.7, wet: 0.5 });
        this._tone({ type: 'sawtooth', freq: 55, dur: 2.2, attack: 0.05, gain: 0.08, wet: 0.5 });
        break;
      case 'time':
        for (let i = 0; i < 6; i++) this._noise({ dur: 0.04, gain: 0.18, type: 'highpass', freq: 4000, q: 1, wet: 0.3, at: i * 0.5 });
        // the "rewind" — a reverse swell
        this._noise({ dur: 1.2, attack: 1.1, gain: 0.2, freq: 3000, to: 300, q: 4, wet: 0.5, at: 2.9 });
        this._tone({ type: 'sine', freq: 392, dur: 4, attack: 0.4, gain: 0.07, wet: 0.8 });
        this._tone({ type: 'sine', freq: 587, dur: 4, attack: 0.6, gain: 0.05, wet: 0.8 });
        break;
      case 'soul':
        for (const f of [220, 277.2, 329.6, 440]) {
          this._tone({ type: 'triangle', freq: f, dur: 4.5, attack: 1.2, gain: 0.06, wet: 0.9, detune: Math.random() * 10 - 5 });
        }
        this._noise({ dur: 4, attack: 1.5, gain: 0.05, type: 'lowpass', freq: 500, q: 0.5, wet: 0.9 });
        break;
    }
  }

  ultimateCharge() {
    this._tone({ type: 'sawtooth', freq: 55, to: 220, dur: 3.2, attack: 0.5, gain: 0.12, wet: 0.6 });
    this._noise({ dur: 3.2, attack: 2.5, gain: 0.25, freq: 200, to: 5000, q: 1.5, wet: 0.6 });
  }

  ultimateFlash() {
    this._tone({ type: 'sine', freq: 70, to: 30, dur: 2.5, attack: 0.005, gain: 0.9, wet: 0.4 });
    this._noise({ dur: 3, attack: 0.005, gain: 0.4, type: 'lowpass', freq: 6000, to: 200, q: 0.5, wet: 0.8 });
    for (const f of [261.6, 329.6, 392, 523.3, 659.3]) {
      this._tone({ type: 'sine', freq: f, dur: 6, attack: 0.6, gain: 0.07, wet: 0.9, at: 0.3 });
    }
  }

  snap() {
    // A dry, close snap — then silence pulls in.
    this._noise({ dur: 0.05, attack: 0.001, gain: 0.9, type: 'highpass', freq: 1800, q: 0.7, wet: 0.5 });
    this._tone({ type: 'sine', freq: 180, to: 60, dur: 0.12, attack: 0.001, gain: 0.4, wet: 0.3 });
    this.setAmbienceLevel(0.0);
  }

  dissolve() {
    this._noise({ dur: 5, attack: 1.2, gain: 0.16, freq: 900, to: 300, q: 0.6, wet: 0.7 });
  }

  restore() {
    this.setAmbienceLevel(0.11);
    for (const [f, at] of [
      [196, 0],
      [246.9, 0.15],
      [293.7, 0.3],
    ]) {
      this._tone({ type: 'sine', freq: f, dur: 3, attack: 0.4, gain: 0.06, wet: 0.8, at });
    }
  }
}
