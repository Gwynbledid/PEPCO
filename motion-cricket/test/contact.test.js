import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickStroke } from '../src/game/contact.js';
import { STROKE_PROFILES, StrokeDetector } from '../src/tracking/strokeDetector.js';

const FPS = 30;
const mj = (a, b, d) => (t) => {
  const u = Math.max(0, Math.min(1, t / d));
  const s = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
};

/** Feeds a movement into the detector; returns the end time. */
function feed(det, t0, segments) {
  let t = t0;
  for (const [d, fn] of segments) {
    const n = Math.max(1, Math.round(d * FPS));
    for (let i = 0; i < n; i++) {
      t += 1 / FPS;
      const p = fn((i + 1) / FPS);
      det.push(t, p.x, p.y);
    }
  }
  return t;
}

const hold = (p) => () => p;
const A = { x: 0, y: 0 };
const TOP = { x: -3, y: 6 };
const END = { x: 6, y: -4 };

// The ball reaches the bat at T = 2.0 s. With 0.1 s latency, a perfect swing peaks at 2.1 (measured).
const T = 2.0;
const LAT = 0.1;
const params = (det, now) => ({ T, latency: LAT, now, vOn: det.vOn, onsetToPeak: 0.1 });

function swingPeakingAt(peakTime, { backliftAt = null } = {}) {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  // The downswing lasts 0.2 s, so it starts 0.1 s before its peak.
  const start = peakTime - 0.1;
  const segs = [];
  let t = 0;
  if (backliftAt !== null) {
    segs.push([backliftAt, hold(A)], [0.25, mj(A, TOP, 0.25)]);
    t = backliftAt + 0.25;
    segs.push([Math.max(0.03, start - t), hold(TOP)]);
  } else {
    segs.push([start, hold(TOP)]);
  }
  segs.push([0.2, mj(TOP, END, 0.2)], [0.6, hold(END)]);
  feed(det, 0, segs);
  return det;
}

test('a perfectly timed swing is a hit with ~zero timing error', () => {
  const det = swingPeakingAt(T + LAT);
  const res = pickStroke(det.since(0), params(det, 3));
  assert.ok(res && res.stroke, 'hit');
  assert.ok(Math.abs(res.e) < 0.04, `e = ${res.e.toFixed(3)}`);
  assert.ok(res.stroke.vy < 0, 'the downswing');
});

test('the backlift before the ball arrives does not use up the swing', () => {
  const det = swingPeakingAt(T + LAT, { backliftAt: 1.2 });
  const res = pickStroke(det.since(0), params(det, 3));
  assert.ok(res && res.stroke, 'hit');
  assert.ok(res.stroke.vy < 0, 'picked the downswing, not the backlift');
  assert.ok(Math.abs(res.e) < 0.04);
});

test('a swing long before the ball is "too early"', () => {
  const det = swingPeakingAt(T + LAT - 0.6);
  const res = pickStroke(det.since(0), params(det, 3));
  assert.equal(res.early, true);
  assert.ok(res.e < -0.4);
});

test('early and late swings get negative and positive timing', () => {
  const early = swingPeakingAt(T + LAT - 0.12);
  const late = swingPeakingAt(T + LAT + 0.12);
  const re = pickStroke(early.since(0), params(early, 3));
  const rl = pickStroke(late.since(0), params(late, 3));
  assert.ok(re.e < -0.08 && re.e > -0.16, `early e ${re.e}`);
  assert.ok(rl.e > 0.08 && rl.e < 0.16, `late e ${rl.e}`);
});

test('a swing still under way when the ball arrives counts, provisionally', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  // Swing started 60 ms before the moment we decide; it's still accelerating.
  const decide = T;
  feed(det, 0, [
    [decide - 0.07, hold(TOP)],
    [0.07, mj(TOP, END, 0.2)],
  ]);
  const res = pickStroke(det.since(0), params(det, decide));
  assert.ok(res && res.stroke, 'hit');
  assert.equal(res.provisional, true);
});

test('holding still: no stroke at all', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  feed(det, 0, [[3, hold(A)]]);
  assert.equal(pickStroke(det.since(0), params(det, 3)), null);
});
