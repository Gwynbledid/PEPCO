import { shotPosAt } from '../game/physics.js';
import { BOUNDARY_RADIUS, FIELD_CENTER } from '../game/stadium.js';

const $ = (id) => document.getElementById(id);

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
    this.toastTimer = null;
    this.speedTimer = null;
  }

  show(on) {
    this.el.hidden = !on;
  }

  score(s) {
    $('sbRuns').textContent = `${s.runs}/${s.wkts}`;
    $('sbOvers').textContent = `${Math.floor(s.balls / 6)}.${s.balls % 6}`;
    $('sbRate').textContent = s.balls ? ((s.runs / s.balls) * 6).toFixed(2) : '0.00';
    const ticker = $('ticker');
    ticker.innerHTML = '';
    for (const b of s.last) {
      const d = document.createElement('span');
      d.className = `ball ball-${b === 'W' ? 'w' : b === '4' ? 'four' : b === '6' ? 'six' : 'n'}`;
      d.textContent = b;
      ticker.appendChild(d);
    }
  }

  result(kind, big, small) {
    const el = this.resultEl;
    el.className = `result show kind-${kind}`;
    el.querySelector('.big').textContent = big;
    el.querySelector('.small').textContent = small || '';
    // Restart the pop animation.
    void el.offsetWidth;
    el.classList.add('pop');
    if (kind === 'six' || kind === 'four') this.confetti(kind === 'six' ? 90 : 50);
  }

  clearResult() {
    this.resultEl.className = 'result';
    this.radarEl.classList.remove('show');
  }

  hint(text) {
    if (text) {
      this.hintEl.textContent = text;
      this.hintEl.classList.add('show');
    } else {
      this.hintEl.classList.remove('show');
    }
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1100);
  }

  speed(kmh) {
    this.speedEl.textContent = `${kmh} km/h`;
    this.speedEl.classList.add('show');
    clearTimeout(this.speedTimer);
    this.speedTimer = setTimeout(() => this.speedEl.classList.remove('show'), 1800);
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
    const colors = ['#ffd23f', '#ff6b35', '#1f5fd1', '#18a999', '#ffffff', '#e84545'];
    const layer = $('confetti');
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      p.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      p.style.setProperty('--spin', `${Math.random() * 900}deg`);
      layer.appendChild(p);
      setTimeout(() => p.remove(), 3200);
    }
  }

  /** Top-down field map, so shots behind the batter can be followed too. */
  radar(shot, t, fielders) {
    const cv = this.radarEl;
    cv.classList.add('show');
    const g = this.radarCtx;
    const S = cv.width;
    const R = S / 2 - 6;
    const k = R / (BOUNDARY_RADIUS + 4);
    // Bowler's end at the top of the map.
    const map = (p) => [S / 2 + (p.x - FIELD_CENTER.x) * k, S / 2 + (p.z - FIELD_CENTER.z) * k];
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(40,120,40,0.85)';
    g.beginPath();
    g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S / 2, S / 2, BOUNDARY_RADIUS * k, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d8b476';
    g.fillRect(S / 2 - 3, S / 2 - 12 * k, 6, 24 * k);
    g.fillStyle = '#0d6b73';
    for (const f of fielders) {
      const [x, y] = map(f.pos);
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
    // Ball path so far.
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 2.5;
    g.beginPath();
    const steps = Math.ceil(t / shot.dt);
    for (let i = 0; i <= steps; i += 3) {
      const p = shotPosAt(shot, i * shot.dt);
      const [x, y] = map(p);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    const [bx, by] = map(shotPosAt(shot, t));
    g.fillStyle = '#e02b2b';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(bx, by, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}
