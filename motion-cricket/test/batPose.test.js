import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BatPose } from '../src/game/batPose.js';
import { BatInput } from '../src/tracking/batInput.js';

const inp = (o) => ({ tracked: true, gx: 0, gy: 0, angle: -1.57, ratio: 0.8, vgx: 0, vgy: 0, vangle: 0, ...o });

test('the bat is exactly where the tracked stick is, the same frame', () => {
  const pose = new BatPose();
  let s = pose.update(inp({ gx: -0.7, gy: 0.4, angle: 2.2 }));
  assert.deepEqual([s.gx, s.gy, s.angle], [-0.7, 0.4, 2.2]);
  s = pose.update(inp({ gx: 0.5, gy: -0.2, angle: -1.2 }));
  assert.deepEqual([s.gx, s.gy, s.angle], [0.5, -0.2, -1.2]);
});

test('holding still: small jitter is never amplified', () => {
  const pose = new BatPose();
  const s = pose.update(inp({ gx: 0.1, vgx: 0.2, vangle: 0.5 }), 0.03);
  assert.equal(s.gx, 0.1);
  assert.equal(s.angle, -1.57);
});

test('moving fast: the bat is drawn ahead along the motion, making up the camera delay', () => {
  const pose = new BatPose();
  pose.setLead(80);
  const s = pose.update(inp({ angle: 1, vangle: -12, gx: 0, vgx: 3 }), 0);
  assert.ok(Math.abs(s.angle - (1 - 12 * 0.08)) < 1e-9, `angle ${s.angle}`);
  assert.ok(Math.abs(s.gx - 0.24) < 1e-9);
});

test('touch input moves the bat with no smoothing, and reports its rates', () => {
  const input = new BatInput();
  input.mode = 'touch';
  input.setPointer(-0.5, 0.5);
  input.processPointer(1);
  input.setPointer(0.5, -0.5);
  input.processPointer(1 + 1 / 60);
  const s = input.state;
  assert.ok(Math.abs(s.gx - 0.5 * 0.55) < 1e-9);
  assert.ok(s.vgx > 10, `vgx ${s.vgx}`);
});
