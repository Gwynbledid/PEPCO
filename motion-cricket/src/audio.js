// Synthesized sound effects (no audio files needed): bat crack, stumps,
// crowd ambience and cheers. Drop-in samples can replace these later.
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.noise = this._noiseBuffer();
      this._startCrowd();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noise({ freq = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, decay = 0.2, when = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + attack + decay + 0.05);
    return { g, f };
  }

  _tone(freq, { gain = 0.4, decay = 0.1, type = 'sine', when = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + decay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  _startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.6;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    src.connect(f).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  hit(power = 1, edge = false) {
    if (edge) {
      this._tone(2400, { gain: 0.25, decay: 0.05, type: 'triangle' });
      this._noise({ freq: 3500, q: 3, gain: 0.3, decay: 0.06 });
      return;
    }
    // Willow "tock": a short resonant knock plus a bright crack.
    this._tone(620, { gain: 0.6 * power + 0.2, decay: 0.09, type: 'triangle', slide: 0.7 });
    this._tone(1150, { gain: 0.25, decay: 0.05 });
    this._noise({ freq: 2200, q: 1.5, gain: 0.7 * power + 0.2, decay: 0.08 });
  }

  stumps() {
    for (let i = 0; i < 4; i++) {
      this._tone(900 + Math.random() * 700, { gain: 0.35, decay: 0.07, type: 'triangle', when: i * 0.045 });
    }
    this._noise({ freq: 1800, q: 2, gain: 0.4, decay: 0.15 });
  }

  cheer(level = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.05 + 0.5 * level, t + 0.35);
    g.linearRampToValueAtTime(0.05 + 0.25 * level, t + 1.6);
    g.linearRampToValueAtTime(0.05, t + 3.2);
    this._noise({ freq: 1600, q: 0.8, gain: 0.25 * level, attack: 0.3, decay: 1.8, type: 'bandpass' });
  }

  groan() {
    if (!this.ctx) return;
    this._noise({ freq: 400, q: 1.2, gain: 0.35, attack: 0.15, decay: 1.2 });
    this._tone(220, { gain: 0.05, decay: 0.9, type: 'sawtooth', slide: 0.7 });
  }

  click() {
    this._tone(880, { gain: 0.15, decay: 0.05, type: 'triangle' });
  }

  success() {
    [660, 880, 1320].forEach((f, i) => this._tone(f, { gain: 0.18, decay: 0.15, when: i * 0.08 }));
  }
}
