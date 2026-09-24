// A calm, synthesized soundscape: soft pad and wind in the background,
// wooden "tok" and bells for the bat, singing bowls instead of alarms, and
// chimes on a D major pentatonic scale, so nothing ever clashes.
// No audio files: everything is generated with Web Audio.

const NOTE = {
  D3: 146.83,
  A3: 220.0,
  D4: 293.66,
  E4: 329.63,
  'F#4': 369.99,
  A4: 440.0,
  B4: 493.88,
  D5: 587.33,
  E5: 659.26,
  'F#5': 739.99,
  A5: 880.0,
  B5: 987.77,
  D6: 1174.66,
  E6: 1318.51,
};
const CHIME_NOTES = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6'];
// Pad voicings that drift slowly between each other.
const PAD_CHORDS = [
  ['D3', 'A3', 'E4', 'F#4'],
  ['D3', 'A3', 'D4', 'B4'],
  ['A3', 'D4', 'E4', 'A4'],
  ['D3', 'F#4', 'A4', 'B4'],
];

export class ZenAudio {
  constructor() {
    this.ctx = null;
    this.fxLevel = 0.8;
    this.ambientLevel = 0.55;
    this.chimesOn = true;
    this.enabled = true;
  }

  /** Must run from a user gesture (browsers block audio until then). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setLevels({ fx = this.fxLevel, ambient = this.ambientLevel, chimes = this.chimesOn, enabled = this.enabled } = {}) {
    this.fxLevel = fx;
    this.ambientLevel = ambient;
    this.chimesOn = chimes;
    this.enabled = enabled;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(enabled ? 0.9 : 0, t, 0.1);
    this.fxBus.gain.setTargetAtTime(fx, t, 0.1);
    this.ambBus.gain.setTargetAtTime(ambient, t, 0.3);
  }

  // ---------------------------------------------------------------------
  // Graph

  _build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.4;
    this.master.connect(limiter).connect(ctx.destination);

    this.fxBus = ctx.createGain();
    this.fxBus.gain.value = this.fxLevel;
    this.fxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.ambientLevel;
    this.ambBus.connect(this.master);

    // A long, soft hall.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.4);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.5;
    this.reverbIn.connect(this.reverb).connect(this.master);

    this.noise = this._noiseBuffer();
    this._startPad();
    this._startAir();
    this._scheduleChime();
  }

  _impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Low-passed noise with an exponential tail: warm, not metallic.
        lp = lp * 0.72 + (Math.random() * 2 - 1) * 0.28;
        d[i] = lp * Math.pow(1 - t, 3.2) * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  _noiseBuffer() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Pink-ish noise (softer than white).
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2 + w * 0.02) * 1.6;
    }
    return buf;
  }

  _startPad() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    // Slow breathing of the filter.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    filter.connect(out);
    out.connect(this.ambBus);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    out.connect(send).connect(this.reverbIn);

    this.padVoices = PAD_CHORDS[0].map((n, i) => {
      const g = ctx.createGain();
      g.gain.value = 0.22;
      const trem = ctx.createOscillator();
      trem.frequency.value = 0.06 + i * 0.023;
      const tremGain = ctx.createGain();
      tremGain.gain.value = 0.09;
      trem.connect(tremGain).connect(g.gain);
      trem.start();
      const oscs = [0, 1].map((k) => {
        const o = ctx.createOscillator();
        o.type = k ? 'triangle' : 'sine';
        o.frequency.value = NOTE[n];
        o.detune.value = k ? 6 : -4;
        const og = ctx.createGain();
        og.gain.value = k ? 0.25 : 0.75;
        o.connect(og).connect(g);
        o.start();
        return o;
      });
      g.connect(filter);
      return { oscs, gain: g };
    });
    this.chord = 0;
    this.padTimer = setInterval(() => this._nextChord(), 18000);
  }

  _nextChord() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.chord = (this.chord + 1) % PAD_CHORDS.length;
    const t = this.ctx.currentTime;
    PAD_CHORDS[this.chord].forEach((n, i) => {
      for (const o of this.padVoices[i].oscs) o.frequency.setTargetAtTime(NOTE[n], t, 2.5);
    });
  }

  _startAir() {
    const ctx = this.ctx;
    // Soft wind.
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.07;
    const wlg = ctx.createGain();
    wlg.gain.value = 0.025;
    wl.connect(wlg).connect(wg.gain);
    wl.start();
    wind.connect(wf).connect(wg).connect(this.ambBus);
    wind.start();
    // A distant crowd murmur, which swells after big shots.
    const crowd = ctx.createBufferSource();
    crowd.buffer = this.noise;
    crowd.loop = true;
    crowd.playbackRate.value = 0.8;
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 620;
    cf.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.03;
    crowd.connect(cf).connect(this.crowdGain).connect(this.ambBus);
    const cs = ctx.createGain();
    cs.gain.value = 0.4;
    this.crowdGain.connect(cs).connect(this.reverbIn);
    crowd.start(0, 1.3);
  }

  _scheduleChime() {
    clearTimeout(this.chimeTimer);
    this.chimeTimer = setTimeout(() => {
      if (this.chimesOn && this.ctx && this.ctx.state === 'running') {
        const n = CHIME_NOTES[Math.floor(Math.random() * CHIME_NOTES.length)];
        this._bell(NOTE[n], { gain: 0.035, decay: 4, bus: this.ambBus, send: 0.8 });
        if (Math.random() < 0.5) {
          const m = CHIME_NOTES[Math.floor(Math.random() * CHIME_NOTES.length)];
          this._bell(NOTE[m], { gain: 0.025, decay: 4, when: 0.35 + Math.random() * 0.4, bus: this.ambBus, send: 0.8 });
        }
      }
      this._scheduleChime();
    }, 7000 + Math.random() * 11000);
  }

  // ---------------------------------------------------------------------
  // Voices

  _env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Soft bell: a few gently inharmonic partials with a long tail. */
  _bell(freq, { gain = 0.1, decay = 2.5, when = 0, partials = [1, 2.01, 3.02, 4.23], send = 0.5, bus = this.fxBus } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(bus);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      out.connect(s).connect(this.reverbIn);
    }
    partials.forEach((p, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * p;
      const g = ctx.createGain();
      this._env(g, t, gain / (1 + i * 1.6), 0.004, decay / (1 + i * 0.7));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.1);
    });
  }

  /** Singing bowl: deep, slowly beating partials. Used where a game would buzz. */
  _bowl(freq, { gain = 0.12, decay = 5, when = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const out = ctx.createGain();
    out.connect(this.fxBus);
    const s = ctx.createGain();
    s.gain.value = 0.7;
    out.connect(s).connect(this.reverbIn);
    [
      [1, 1],
      [2.76, 0.45],
      [5.4, 0.18],
    ].forEach(([p, a], i) => {
      for (const beat of [-0.6, 0.6]) {
        const o = ctx.createOscillator();
        o.frequency.value = freq * p + beat * (i + 1);
        const g = ctx.createGain();
        this._env(g, t, (gain * a) / 2, 0.02 + i * 0.01, decay / (1 + i * 0.5));
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.2);
      }
    });
  }

  /** Marimba-like note: warm and short. */
  _mallet(freq, { gain = 0.08, when = 0, send = 0.25 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const out = ctx.createGain();
    out.connect(this.fxBus);
    const s = ctx.createGain();
    s.gain.value = send;
    out.connect(s).connect(this.reverbIn);
    [
      [1, 1, 0.45],
      [3.99, 0.12, 0.08],
    ].forEach(([p, a, d]) => {
      const o = ctx.createOscillator();
      o.frequency.value = freq * p;
      const g = ctx.createGain();
      this._env(g, t, gain * a, 0.003, d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    });
  }

  _noiseHit({ freq = 1000, q = 1, type = 'bandpass', gain = 0.1, attack = 0.004, decay = 0.08, when = 0, sweep = 0, send = 0.2 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, gain, attack, decay);
    src.connect(f).connect(g).connect(this.fxBus);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverbIn);
    }
    src.start(t, Math.random() * 2);
    src.stop(t + attack + decay + 0.05);
  }

  /** Wooden "tok": a short pitched knock. */
  _wood(freq, { gain = 0.25, when = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.018);
    const g = ctx.createGain();
    this._env(g, t, gain, 0.002, 0.11);
    const o2 = ctx.createOscillator();
    o2.frequency.value = freq * 2.32;
    const g2 = ctx.createGain();
    this._env(g2, t, gain * 0.3, 0.002, 0.05);
    o.connect(g).connect(this.fxBus);
    o2.connect(g2).connect(this.fxBus);
    const s = ctx.createGain();
    s.gain.value = 0.25;
    g.connect(s).connect(this.reverbIn);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.2);
    o2.stop(t + 0.1);
    this._noiseHit({ freq: 2400, q: 1.2, gain: gain * 0.25, decay: 0.012, when, send: 0 });
  }

  _swell(level, seconds = 3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.03 + 0.16 * level, t + 0.5);
    g.linearRampToValueAtTime(0.03 + 0.08 * level, t + seconds * 0.5);
    g.linearRampToValueAtTime(0.03, t + seconds);
  }

  // ---------------------------------------------------------------------
  // Game events

  click() {
    this._mallet(NOTE.A4, { gain: 0.07 });
  }

  tick() {
    this._bell(NOTE.E5, { gain: 0.05, decay: 1.2 });
  }

  stepDone() {
    ['D5', 'F#5', 'A5'].forEach((n, i) => this._bell(NOTE[n], { gain: 0.06, decay: 1.8, when: i * 0.09 }));
  }

  calibrationDone() {
    ['D5', 'E5', 'F#5', 'A5', 'D6'].forEach((n, i) => this._bell(NOTE[n], { gain: 0.06, decay: 2.4, when: i * 0.1 }));
    this._bowl(NOTE.D4, { gain: 0.08, decay: 4, when: 0.5 });
  }

  /** Airy swish for a registered swing, louder for faster swings. */
  swing(ratio = 1) {
    const r = Math.max(0.2, Math.min(1.3, ratio));
    this._noiseHit({ freq: 500, q: 0.8, gain: 0.05 + 0.07 * r, attack: 0.05, decay: 0.22, sweep: 2.4, send: 0.3 });
  }

  release() {
    this._noiseHit({ freq: 700, q: 0.7, gain: 0.03, attack: 0.03, decay: 0.18, sweep: 1.8, send: 0.2 });
  }

  pitch() {
    this._noiseHit({ freq: 240, type: 'lowpass', gain: 0.12, attack: 0.002, decay: 0.06, send: 0.1 });
  }

  /** Bat on ball. Better timing rings a higher, clearer bell. */
  hit(power = 1, quality = 1, edge = false) {
    if (edge) {
      this._wood(420, { gain: 0.12 });
      this._bell(NOTE.B5, { gain: 0.03, decay: 0.6, partials: [1, 2.4] });
      return;
    }
    this._wood(170 + 70 * Math.min(1.2, power), { gain: 0.18 + 0.14 * Math.min(1, power) });
    const n = quality > 0.95 ? 'A5' : quality > 0.8 ? 'F#5' : 'D5';
    this._bell(NOTE[n], { gain: 0.05 + 0.06 * Math.min(1, power) * quality, decay: 2.2 });
  }

  runs(n) {
    const seq = ['D5', 'F#5', 'A5'];
    for (let i = 0; i < n; i++) this._mallet(NOTE[seq[i % 3]], { gain: 0.06, when: i * 0.14 });
  }

  dot() {
    this._mallet(NOTE.D4, { gain: 0.04 });
  }

  four() {
    this._bell(NOTE.A5, { gain: 0.08, decay: 2.6 });
    this._bell(NOTE.D6, { gain: 0.07, decay: 3, when: 0.16 });
    this._swell(0.55, 3);
  }

  six() {
    this._bowl(NOTE.D4, { gain: 0.1, decay: 5 });
    ['D5', 'F#5', 'A5', 'B5', 'D6', 'E6'].forEach((n, i) => this._bell(NOTE[n], { gain: 0.065, decay: 3, when: 0.12 + i * 0.09 }));
    this._swell(1, 4.5);
  }

  wicket() {
    this._bowl(NOTE.D3 * 2, { gain: 0.13, decay: 4.5 });
    this._mallet(NOTE['F#4'], { gain: 0.05, when: 0.35, send: 0.4 });
    this._mallet(NOTE.D4, { gain: 0.05, when: 0.6, send: 0.4 });
    this._swell(0.35, 2.5);
  }

  stumps() {
    this._wood(520, { gain: 0.12 });
    this._wood(610, { gain: 0.09, when: 0.05 });
  }

  dispose() {
    clearInterval(this.padTimer);
    clearTimeout(this.chimeTimer);
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}
