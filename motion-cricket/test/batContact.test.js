import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointToSegment, sweptTouch } from '../src/game/batContact.js';

const bat = (x0, y0, x1, y1) => ({ top: { x: x0, y: y0 }, toe: { x: x1, y: y1 } });

test('distance to the bat and where along it', () => {
  const r = pointToSegment({ x: 1, y: 0.5 }, { x: 0, y: 0 }, { x: 2, y: 0 });
  assert.equal(r.dist, 0.5);
  assert.equal(r.u, 0.5);
});

test('a still bat in the ball\'s path touches it', () => {
  const b = bat(0, 0.5, 0, -0.5);
  const hit = sweptTouch(b, b, { x: 0.02, y: 0.3 }, { x: 0.01, y: 0.2 }, 0.05);
  assert.ok(hit && Math.abs(hit.u - 0.2) < 0.05);
});

test('a fast swing that passes right through the ball between frames still touches it', () => {
  // Last frame the bat was well left of the ball, this frame well right.
  const hit = sweptTouch(bat(-0.6, 0.5, -0.4, -0.5), bat(0.6, 0.5, 0.4, -0.5), { x: 0, y: -0.1 }, { x: 0, y: -0.1 }, 0.03);
  assert.ok(hit, 'touched');
  assert.ok(hit.k > 0.3 && hit.k < 0.7, `mid-frame (k ${hit.k})`);
});

test('a bat swung above the ball misses it', () => {
  const hit = sweptTouch(bat(-0.6, 0.9, -0.4, 0.3), bat(0.6, 0.9, 0.4, 0.3), { x: 0, y: -0.2 }, { x: 0, y: -0.25 }, 0.05);
  assert.equal(hit, null);
});
