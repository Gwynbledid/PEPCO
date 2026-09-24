import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BatPose } from '../src/game/batPose.js';

const still = { vOn: 10, ref: 90, current: () => null };
const inp = (gx, gy, angle) => ({ tracked: true, gx, gy, angle, ratio: 0.8 });

test('follow mode: the bat copies the tracked hands and stick', () => {
  const pose = new BatPose();
  let s;
  for (let i = 0; i < 20; i++) s = pose.update(1 / 60, still, inp(-0.7, 0.4, 2.2), 1);
  assert.ok(Math.abs(s.gx + 0.7) < 1e-6 && Math.abs(s.gy - 0.4) < 1e-6 && Math.abs(s.angle - 2.2) < 1e-6);
  // Move the hands: the bat moves with them, the same frame.
  s = pose.update(1 / 60, still, inp(0.5, -0.2, -1.2), 1);
  assert.ok(Math.abs(s.gx - 0.5) < 1e-6 && Math.abs(s.angle + 1.2) < 1e-6);
});

test('follow mode: lost tracking eases back to the backlift', () => {
  const pose = new BatPose();
  for (let i = 0; i < 20; i++) pose.update(1 / 60, still, inp(0, 0, -1.57), 1);
  let s;
  for (let i = 0; i < 60; i++) s = pose.update(1 / 60, still, { tracked: false, gx: 0, gy: 0, angle: -1.57 }, 1);
  assert.ok(s.gy > 1 && s.gx > 0.9, 'raised up to the side');
});

test('follow mode: a swing that blurs the stick is carried through in its direction', () => {
  const pose = new BatPose();
  const stroke = { onset: 1, peak: 80, vx: 1, vy: -0.2 };
  const det = { vOn: 10, ref: 90, current: () => stroke };
  let s;
  for (let i = 0; i < 12; i++) s = pose.update(1 / 60, det, inp(-0.5, 0.8, 2.4), 1); // frozen angle
  assert.ok(pose.anim, 'animating');
  for (let i = 0; i < 6; i++) s = pose.update(1 / 60, det, inp(-0.5, 0.8, 2.4), 1);
  assert.ok(s.gx > 0, `swung to the right (gx ${s.gx.toFixed(2)})`);
});

test('backlift mode: the bat waits raised to the side', () => {
  const pose = new BatPose();
  pose.setMode('backlift');
  const s = pose.update(1 / 60, still, inp(0, -1, -1.57), -1);
  assert.ok(s.gx < -0.7 && s.gy > 0.8);
});
