import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickStroke } from '../src/game/contact.js';
import { shotFromSwing } from '../src/game/shots.js';
import { BatInput, defaultCalibration } from '../src/tracking/batInput.js';
import { WorkFrame } from '../src/tracking/frame.js';
import { drawBatter } from './helpers/scene.js';

// End to end, minus MediaPipe: drawn camera frames of a player holding a
// newspaper roll → stick tracker → swing detector → contact → shot.

const W = 448;
const H = 252;
const FPS = 30;

function feedFrame(input, t, opts) {
  const scene = drawBatter({ w: W, h: H, ...opts });
  const frame = new WorkFrame(W, H).load(scene.rgba);
  const landmarks = scene.hands.map((lm) => lm.map((p) => ({ x: p.x / W, y: p.y / H })));
  input.processCamera(t, frame, landmarks);
  return scene;
}

function calibrated() {
  const input = new BatInput();
  input.mode = 'stick';
  input.setCalibration(defaultCalibration('stick'));
  input.stick.beginLearning();
  for (let i = 0; i < 12; i++) {
    const scene = drawBatter({ w: W, h: H, stickAngle: -90 + (i % 5) * 4 - 8, seed: 200 + i });
    const frame = new WorkFrame(W, H).load(scene.rgba);
    input.stick.learnFrame(frame, scene.hands);
  }
  const model = input.stick.finishLearning();
  input.setCalibration({ ...defaultCalibration('stick'), stick: model, ref: 60 });
  return input;
}

const ease = (u) => 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;

/**
 * A full shot in image angles (un-mirrored, y down): stance with the bat
 * down (90°), slow backlift to up-left (-130°), pause, then the downswing
 * through to the other side (+30°). The grip travels a little too.
 */
function swing(input, { downDur = 0.2 } = {}) {
  let t = 1;
  const frames = [];
  const at = (angle, gx, gy) => {
    t += 1 / FPS;
    frames.push(feedFrame(input, t, { stickAngle: angle, grip: { x: gx, y: gy }, forearm: 150, forearm2: 125, seed: Math.round(t * 1000) }));
  };
  for (let i = 0; i < 12; i++) at(90, 224, 150);
  const backlift = Math.round(0.5 * FPS);
  for (let i = 1; i <= backlift; i++) {
    const u = ease(i / backlift);
    at(90 + (-220) * u, 224 + 10 * u, 150 - 20 * u);
  }
  for (let i = 0; i < 4; i++) at(-130, 234, 130);
  const down = Math.round(downDur * FPS);
  const tDown = t;
  for (let i = 1; i <= down; i++) {
    const u = ease(i / down);
    at(-130 + 160 * u, 234 - 30 * u, 130 + 25 * u);
  }
  for (let i = 0; i < 10; i++) at(30, 204, 155);
  return { tDownStart: tDown, tEnd: t, frames };
}

test('the stick (not the arm) is tracked through a whole shot', () => {
  const input = calibrated();
  let found = 0;
  let total = 0;
  let t = 1;
  for (const a of [90, 60, 0, -60, -120, -150, -100, -30, 30]) {
    t += 1 / FPS;
    const scene = feedFrame(input, t, { stickAngle: a, forearm: 150, forearm2: 125, seed: 7 + a });
    total++;
    if (!input.raw.tip) continue;
    // The tip the game sees is the drawn stick's tip (mirrored), not the elbow.
    const tip = { x: (1 - input.raw.tip.x) * W, y: input.raw.tip.y * H };
    const err = Math.hypot(tip.x - scene.tip.x, tip.y - scene.tip.y) / scene.s;
    assert.ok(err < 1.5, `stick at ${a}°: tip off by ${err.toFixed(2)} hand sizes`);
    found++;
  }
  assert.ok(found >= total - 1, `found the stick in ${found}/${total} frames`);
});

test('backlift + downswing: one swing, the downswing, and it hits', () => {
  const input = calibrated();
  const { tDownStart, tEnd } = swing(input);
  const strokes = input.detector.strokes.filter((s) => s.valid && !s.backlift);
  assert.ok(strokes.length >= 1, 'a valid swing was detected');
  const s = strokes[strokes.length - 1];
  assert.ok(s.onset >= tDownStart - 0.1, `the counted swing is the downswing (onset ${s.onset.toFixed(2)} vs ${tDownStart.toFixed(2)})`);
  assert.ok(s.vy < 0, 'moving down: a ground shot');
  const counted = input.detector.countedSwings(0, tEnd + 1);
  assert.equal(counted.length, 1, `counted ${counted.length} swings`);

  // Ball arrives at the peak (latency 0.1): a clean hit along the ground.
  const pick = pickStroke(input.detector.since(0), {
    T: s.tPeak - 0.1,
    latency: 0.1,
    now: tEnd,
    vOn: input.detector.vOn,
    onsetToPeak: 0.12,
  });
  assert.ok(pick && pick.stroke === s, 'picked the downswing');
  const shot = shotFromSwing({ ...s, ref: input.calib.ref, e: pick.e, hand: 1, rand: () => 0.5 });
  assert.equal(shot.loft, false);
  assert.ok(!shot.defensive, `power ${shot.power.toFixed(2)}`);
});

test('holding the stick still gives no swings, even with tracking noise', () => {
  const input = calibrated();
  let t = 1;
  for (let i = 0; i < 45; i++) {
    t += 1 / FPS;
    feedFrame(input, t, { stickAngle: 90 + (i % 3) - 1, grip: { x: 224 + (i % 2), y: 150 }, seed: 400 + i });
  }
  assert.equal(input.detector.strokes.filter((s) => s.valid).length, 0);
});

test('a swing is still caught when the stick blurs away mid-swing (hands take over)', () => {
  const input = calibrated();
  let t = 1;
  const at = (angle, gx, gy, stickAlpha = 1) => {
    t += 1 / FPS;
    feedFrame(input, t, { stickAngle: angle, grip: { x: gx, y: gy }, forearm: 150, forearm2: 125, stickAlpha, seed: Math.round(t * 1000) });
  };
  for (let i = 0; i < 10; i++) at(-130, 234, 130);
  const down = 6;
  for (let i = 1; i <= down; i++) {
    const u = ease(i / down);
    // The middle frames: the stick is a blur the tracker can't see.
    at(-130 + 160 * u, 234 - 40 * u, 130 + 35 * u, i >= 2 && i <= 5 ? 0 : 1);
  }
  for (let i = 0; i < 10; i++) at(30, 194, 165);
  const swings = input.detector.strokes.filter((s) => s.valid);
  assert.ok(swings.length >= 1, 'swing detected through the blur');
  assert.ok(swings[swings.length - 1].vy < 0, 'downward');
});
