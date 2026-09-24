import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkFrame } from '../src/tracking/frame.js';
import { StickTracker, angDiff } from '../src/tracking/stickTracker.js';
import { DARK_SKIN, NAVY_SHIRT, SKIN, WHITE_SHIRT, WOOD, drawBatter } from './helpers/scene.js';

const DEG = Math.PI / 180;

function frameOf(scene) {
  return new WorkFrame(scene.w, scene.h).load(scene.rgba);
}

/** Calibration: the stick held upright for a moment. */
function learn(tracker, opts = {}) {
  tracker.beginLearning();
  for (let i = 0; i < 12; i++) {
    const scene = drawBatter({ ...opts, stickAngle: -90 + (i % 5) * 4 - 8, seed: 100 + i });
    tracker.learnFrame(frameOf(scene), scene.hands);
  }
  return tracker.finishLearning();
}

function track(tracker, opts, t = 1) {
  const scene = drawBatter(opts);
  const res = tracker.update(frameOf(scene), scene.hands, t);
  return { scene, res };
}

function expectStick(res, scene, angleDeg, label) {
  assert.ok(res.found, `${label}: stick not found`);
  const err = angDiff(res.angle, angleDeg * DEG) / DEG;
  assert.ok(err < 7, `${label}: angle off by ${err.toFixed(1)}°`);
  const tipErr = Math.hypot(res.tip.x - scene.tip.x, res.tip.y - scene.tip.y) / scene.s;
  assert.ok(tipErr < 1.3, `${label}: tip off by ${tipErr.toFixed(2)} hand sizes`);
}

test('learns a grey newspaper roll against a white curtain', () => {
  const t = new StickTracker();
  const model = learn(t);
  assert.ok(model, 'model learned');
  assert.ok(model.lengthRel > 4.5 && model.lengthRel < 6.5, `length ${model.lengthRel}`);
  assert.notEqual(model.quality, 'poor', `contrast ${model.contrast}`);
  assert.equal(model.skinSuppress, true);
});

test('follows the stick in every direction, never the forearm', () => {
  const t = new StickTracker();
  learn(t);
  // Forearms point down-right / down-left; the stick goes everywhere else.
  for (let a = -180; a < 180; a += 20) {
    if (angDiff(a * DEG, 110 * DEG) < 55 * DEG || angDiff(a * DEG, 70 * DEG) < 55 * DEG) continue;
    t.reset();
    const { scene, res } = track(t, { stickAngle: a, seed: 500 + a });
    expectStick(res, scene, a, `stick at ${a}°`);
  }
});

test('the pose from the player screenshot: stick out to the side, arm below', () => {
  const t = new StickTracker();
  learn(t);
  t.reset();
  // One hand, stick pointing right, forearm down-left, white curtain.
  const { scene, res } = track(t, { stickAngle: -5, forearm: 145, twoHands: false, seed: 9 });
  expectStick(res, scene, -5, 'side stick');
});

test('no stick in hand: the arm is never taken for the bat', () => {
  const t = new StickTracker();
  learn(t);
  for (const [forearm, seed] of [
    [110, 1],
    [150, 2],
    [60, 3],
    [180, 4],
  ]) {
    t.reset();
    const { res } = track(t, { stickAngle: null, forearm, forearm2: forearm - 30, seed });
    assert.ok(!res.found || res.conf < 0.3, `arm at ${forearm}° mistaken for a stick (angle ${(res.angle / DEG).toFixed(0)}°)`);
  }
});

test('works without calibration too (model-free)', () => {
  const t = new StickTracker();
  const { scene, res } = track(t, { stickAngle: -60, seed: 21 });
  expectStick(res, scene, -60, 'model-free');
});

test('white stick and white long sleeves', () => {
  const t = new StickTracker();
  learn(t, { stickColor: [238, 238, 234], background: 'wall', armColor: WHITE_SHIRT, shirt: NAVY_SHIRT });
  t.reset();
  const { scene, res } = track(t, {
    stickColor: [238, 238, 234],
    background: 'wall',
    armColor: WHITE_SHIRT,
    stickAngle: -15,
    forearm: 60,
    forearm2: 90,
    seed: 31,
  });
  expectStick(res, scene, -15, 'white on white sleeves');
});

test('wooden (skin-coloured) stick is not suppressed as skin', () => {
  const t = new StickTracker();
  const model = learn(t, { stickColor: WOOD, background: 'curtain', skin: DARK_SKIN, armColor: DARK_SKIN });
  assert.ok(model, 'model learned');
  t.reset();
  const { scene, res } = track(t, { stickColor: WOOD, skin: DARK_SKIN, armColor: DARK_SKIN, stickAngle: -120, seed: 41 });
  expectStick(res, scene, -120, 'wooden stick');
});

test('motion-blurred stick in a fast swing', () => {
  const t = new StickTracker();
  learn(t);
  t.reset();
  const { scene, res } = track(t, { stickAngle: -150, stickAlpha: 0.65, stickWidthRel: 0.7, seed: 51 });
  expectStick(res, scene, -150, 'blurred');
});

test('keeps tracking through a swing, frame by frame', () => {
  const t = new StickTracker();
  learn(t);
  t.reset();
  // Sweep from overhead (-90°) round to the right and down (+30°) in 6 frames.
  for (let i = 0; i <= 6; i++) {
    const a = -90 + i * 20;
    const { scene, res } = track(t, { stickAngle: a, forearm: 150, forearm2: 130, seed: 70 + i }, 1 + i / 30);
    expectStick(res, scene, a, `swing frame ${i}`);
  }
});

test('reports poor contrast when the stick matches the background', () => {
  const t = new StickTracker();
  const grey = [160, 160, 156];
  const model = learn(t, { stickColor: grey, background: 'gray', shirt: grey, skin: grey, armColor: grey, print: 0 });
  assert.ok(!model || model.quality === 'poor', `expected poor contrast, got ${model && model.quality}`);
});

test('skin-coloured hands next to a light stick', () => {
  const t = new StickTracker();
  learn(t, { skin: SKIN, background: 'wall' });
  t.reset();
  const { scene, res } = track(t, { background: 'wall', stickAngle: -110, seed: 61 });
  expectStick(res, scene, -110, 'beige wall');
});

test('batting stance: bat hanging down in front of the body', () => {
  const t = new StickTracker();
  learn(t);
  for (const [a, seed] of [
    [95, 81],
    [80, 82],
    [120, 83],
  ]) {
    t.reset();
    const { scene, res } = track(t, { stickAngle: a, forearm: -150, forearm2: -30, seed });
    expectStick(res, scene, a, `stance ${a}°`);
  }
});

test('fast enough for every camera frame', () => {
  const t = new StickTracker();
  learn(t);
  const scenes = [0, 1, 2, 3].map((i) => {
    const sc = drawBatter({ stickAngle: -60 + i * 25, seed: 90 + i });
    return { frame: frameOf(sc), hands: sc.hands };
  });
  const t0 = performance.now();
  const N = 40;
  for (let i = 0; i < N; i++) {
    const { frame, hands } = scenes[i % 4];
    t.update(frame, hands, i / 30);
  }
  const ms = (performance.now() - t0) / N;
  assert.ok(ms < 8, `update took ${ms.toFixed(2)} ms`);
});
