import { BOUNDARY_RADIUS, FIELD_CENTER } from '../game/config.js';
import { shotPos } from '../game/physics.js';

const $ = (id) => document.getElementById(id);
const METER_MAX = 120; // metres shown on the six meter

export class Hud {
  constructor() {
    this.el = $('hud');
    this.resultEl = $('result');
    this.hintEl = $('hint');
    this.toastEl = $('toast');
    this.radarEl = $('radar');
    this.radarCtx = this.radarEl.getContext('2d');
    this.flashEl = $('flash');
    this.fadeEl = $('fade');
    this.speedEl = $('speed');
    this.meterEl = $('sixMeter');
    this.overEl = $('overSummary');
    this.timers = {};
    this.meterShown = false;
  }

  show(on) {
    this.el.hidden = !on;
  }

  score(s) {
    $('sbRuns').textContent = `${s.runs}/${s.wkts}`;
    $('sbOvers').textContent = `${Math.floor(s.balls / 6)}.${s.balls % 6}`;
    $('sbRate').textContent = s.balls ? ((s.runs / s.balls) * 6).toFixed(2) : '0.00';
    const ticker = $('ticker');
    ticker.replaceChildren(
      ...s.over.map((b) => {
        const d = document.createElement('span');
        d.className = `ball ball-${b === 'W' ? 'w' : b === '4' ? 'four' : b === '6' ? 'six' : 'n'}`;
        d.textContent = b;
        return d;
      }),
    );
  }

  overDone(s) {
    const runs = s.over.reduce((a, b) => a + (Number(b) || 0), 0);
    this.overEl.querySelector('.big').textContent = `Over ${Math.floor(s.balls / 6)} done`;
    this.overEl.querySelector('.small').textContent = `${runs} run${runs === 1 ? '' : 's'} this over · ${s.runs}/${s.wkts}`;
    this.overEl.classList.add('show');
    clearTimeout(this.timers.over);
    this.timers.over = setTimeout(() => this.overEl.classList.remove('show'), 2600);
  }

  result(kind, big, small) {
    const el = this.resultEl;
    el.className = `result show kind-${kind}`;
    el.querySelector('.big').textContent = big;
    el.querySelector('.small').textContent = small || '';
    void el.offsetWidth;
    el.classList.add('pop');
    if (kind === 'six') this.confetti(80);
    if (kind === 'four') this.confetti(40);
  }

  clearResult() {
    this.resultEl.className = 'result';
    this.radarEl.classList.remove('show');
  }

  hint(text) {
    this.hintEl.textContent = text || '';
    this.hintEl.classList.toggle('show', !!text);
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.timers.toast);
    this.timers.toast = setTimeout(() => this.toastEl.classList.remove('show'), 1100);
  }

  speed(kmh) {
    this.speedEl.textContent = `${kmh} km/h`;
    this.speedEl.classList.add('show');
    clearTimeout(this.timers.speed);
    this.timers.speed = setTimeout(() => this.speedEl.classList.remove('show'), 1800);
  }

  /**
   * The six meter: live distance of a lofted hit, with the longest six so
   * far marked. `null` hides it; `final: true` locks in a six's distance.
   */
  sixMeter(m) {
    const el = this.meterEl;
    if (!m) {
      if (this.meterShown) {
        el.classList.remove('show', 'final');
        this.meterShown = false;
      }
      return;
    }
    this.meterShown = true;
    el.classList.add('show');
    el.classList.toggle('final', !!m.final);
    const d = Math.max(0, m.distance);
    el.querySelector('.meter-value').textContent = `${Math.round(d)} m`;
    el.querySelector('.meter-fill').style.width = `${Math.min(100, (d / METER_MAX) * 100)}%`;
    const best = el.querySelector('.meter-best');
    best.hidden = !m.best;
    if (m.best) {
      best.style.left = `${Math.min(100, (m.best / METER_MAX) * 100)}%`;
      best.title = `Longest six: ${m.best} m`;
      best.dataset.label = `${m.best} m`;
    }
    el.querySelector('.meter-label').textContent = m.final ? (!m.best || d > m.best ? 'NEW LONGEST SIX!' : 'SIX DISTANCE') : 'SIX METER';
  }

  flash() {
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  fade() {
    this.fadeEl.classList.remove('go');
    void this.fadeEl.offsetWidth;
    this.fadeEl.classList.add('go');
  }

  confetti(n) {
    const colors = ['#ffd23f', '#ff8a4c', '#2a73e8', '#18a999', '#ffffff', '#f06b8b'];
    const layer = $('confetti');
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      p.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      p.style.setProperty('--spin', `${Math.random() * 900}deg`);
      layer.appendChild(p);
      setTimeout(() => p.remove(), 3600);
    }
  }

  /** Top-down field map, so shots behind the batter can be followed. */
  radar(flight, t, fielders) {
    const cv = this.radarEl;
    cv.classList.add('show');
    const g = this.radarCtx;
    const S = cv.width;
    const R = S / 2 - 6;
    const k = R / (BOUNDARY_RADIUS + 4);
    const map = (p) => [S / 2 + (p.x - FIELD_CENTER.x) * k, S / 2 + (p.z - FIELD_CENTER.z) * k];
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(52,130,48,0.88)';
    g.beginPath();
    g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S / 2, S / 2, BOUNDARY_RADIUS * k, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#e0c088';
    g.fillRect(S / 2 - 3, S / 2 - 11 * k, 6, 22 * k);
    g.fillStyle = '#0b6e61';
    for (const f of fielders) {
      const [x, y] = map(f.pos);
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 2.5;
    g.beginPath();
    const steps = Math.ceil(t / flight.dt);
    for (let i = 0; i <= steps; i += 3) {
      const [x, y] = map(shotPos(flight, i * flight.dt));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    const [bx, by] = map(shotPos(flight, t));
    g.fillStyle = '#e02b2b';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(bx, by, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}
