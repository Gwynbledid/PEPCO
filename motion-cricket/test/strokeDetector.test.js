import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STROKE_PROFILES, StrokeDetector } from '../src/tracking/strokeDetector.js';
import { rng } from './helpers/scene.js';

const FPS = 30;

// Minimum-jerk move from a to b over d seconds (how hands really move).
const mj = (a, b, d) => (t) => {
  const u = Math.max(0, Math.min(1, t / d));
  const s = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
};

/** Plays a list of [duration, fn(t)] segments into the detector. */
function play(det, segments, { t0 = 0, noise = 0.08, seed = 1, drop = () => false } = {}) {
  const r = rng(seed);
  let t = t0;
  for (const [d, fn] of segments) {
    const n = Math.max(1, Math.round(d * FPS));
    for (let i = 0; i < n; i++) {
      t += 1 / FPS;
      const p = fn((i + 1) / FPS);
      if (drop(t)) det.miss(t);
      else det.push(t, p.x + (r() - 0.5) * noise, p.y + (r() - 0.5) * noise);
    }
  }
  return t;
}

const hold = (p) => () => p;
const STANCE = { x: 0, y: 0 };
const TOP = { x: -3, y: 6 };
const FINISH = { x: 6, y: -3 };

function swingCycle(peakSpeedScale = 1) {
  return [
    [0.4, hold(STANCE)],
    [0.22, mj(STANCE, TOP, 0.22)], // backlift, ~57 hand sizes/s: fast enough to pass as a swing on its own
    [0.1, hold(TOP)],
    [0.18 / peakSpeedScale, mj(TOP, FINISH, 0.18 / peakSpeedScale)], // the swing, ~135/s peak
    [0.25, hold(FINISH)],
    [0.5, mj(FINISH, STANCE, 0.5)], // back to the stance, slowly
    [0.5, hold(STANCE)],
  ];
}

test('three swings with backlifts count as three swings, not six', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  let t = 0;
  for (let i = 0; i < 3; i++) t = play(det, swingCycle(), { t0: t, seed: i + 1 });
  const swings = det.countedSwings(0, t + 1);
  assert.equal(swings.length, 3, `counted ${swings.length}`);
  for (const s of swings) {
    assert.ok(s.vy < 0 && s.vx > 0, 'the counted stroke is the downswing, not the pick-up');
    assert.ok(s.peak > 100 && s.peak < 170, `peak ${s.peak.toFixed(0)}`);
  }
  assert.ok(det.strokes.some((s) => s.backlift), 'the backlifts were recognised');
});

test('backlift flowing straight into the swing, without a pause', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  const t = play(det, [
    [0.3, hold(STANCE)],
    [0.28, mj(STANCE, TOP, 0.28)],
    [0.18, mj(TOP, FINISH, 0.18)],
    [0.6, hold(FINISH)],
  ]);
  const swings = det.countedSwings(0, t + 1);
  assert.equal(swings.length, 1);
  assert.ok(swings[0].vy < 0, 'downswing counted');
});

test('nudging the bat sideways is not a swing', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  const t = play(det, [
    [0.3, hold(STANCE)],
    [0.25, mj(STANCE, { x: 1.4, y: 0 }, 0.25)],
    [0.4, hold({ x: 1.4, y: 0 })],
    [0.2, mj({ x: 1.4, y: 0 }, { x: -0.6, y: 0.4 }, 0.2)], // a quick twitch back
    [0.5, hold({ x: -0.6, y: 0.4 })],
  ]);
  assert.equal(det.countedSwings(0, t + 1).length, 0);
  assert.ok(det.strokes.every((s) => !s.valid), 'no valid stroke');
});

test('holding still with tracking jitter produces no strokes', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  play(det, [[3, hold(STANCE)]], { noise: 0.5 });
  assert.equal(det.strokes.length, 0);
  assert.equal(det.current(), null);
});

test('a swing survives a few frames of lost tracking (motion blur)', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  const t = play(
    det,
    [
      [0.3, hold(STANCE)],
      [0.2, mj(STANCE, { x: 8, y: -6 }, 0.2)],
      [0.6, hold({ x: 8, y: -6 })],
    ],
    { drop: (t) => t > 0.37 && t < 0.45 },
  );
  const valid = det.strokes.filter((s) => s.valid);
  assert.equal(valid.length, 1, `valid strokes ${valid.length}`);
  const truePeak = (1.875 * 10) / 0.2;
  assert.ok(valid[0].peak > 0.6 * truePeak, `peak ${valid[0].peak.toFixed(0)} vs ${truePeak}`);
  assert.ok(det.countedSwings(0, t + 1).length === 1);
});

test('peak time is accurate to a frame', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  play(det, [
    [0.5, hold(STANCE)],
    [0.2, mj(STANCE, { x: 0, y: -12 }, 0.2)],
    [0.5, hold({ x: 0, y: -12 })],
  ], { noise: 0.02 });
  const s = det.strokes.find((x) => x.valid);
  // Minimum-jerk peak is at the middle of the move: 0.5 + 0.1 s.
  assert.ok(Math.abs(s.tPeak - 0.6) < 1 / FPS, `tPeak ${s.tPeak.toFixed(3)}`);
  assert.ok(s.vy < 0 && Math.abs(s.vx) < 0.2 * Math.abs(s.vy), 'straight down');
});

test('direction and follow-through of a lofted (upward) swing', () => {
  const det = new StrokeDetector(STROKE_PROFILES.stick);
  play(det, [
    [0.4, hold({ x: 0, y: -3 })],
    [0.22, mj({ x: 0, y: -3 }, { x: 1, y: 9 }, 0.22)],
    [0.5, hold({ x: 1, y: 9 })],
  ]);
  const s = det.strokes.find((x) => x.valid);
  assert.ok(s.vy > 0 && s.fy > 0, 'moving up at and after the peak');
});
