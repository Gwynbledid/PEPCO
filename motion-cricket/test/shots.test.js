import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTACT_Z, PACES } from '../src/game/config.js';
import { fieldPositions, resolveOutcome } from '../src/game/outcome.js';
import { LENGTHS, buildDelivery, launchVelocity, simulateShot } from '../src/game/physics.js';
import { shotFromSwing } from '../src/game/shots.js';

const still = () => 0.5; // no randomness
const REF = 100;
const deg = (a) => (a * Math.PI) / 180;

/** A swing: `dir` is the bat's direction on screen in degrees (0 = right, 90 = up, -90 = down). */
function swing(dir, { e = 0, peak = REF, hand = 1, contact = 'middle', follow = true } = {}) {
  const vx = Math.cos(deg(dir)) * peak;
  const vy = Math.sin(deg(dir)) * peak;
  return shotFromSwing({
    vx,
    vy,
    fx: follow ? vx * 0.1 : 0,
    fy: follow ? vy * 0.1 : 0,
    peak,
    ref: REF,
    e,
    hand,
    contact,
    rand: still,
  });
}

function play(shot, hand = 1) {
  const origin = { x: 0.1, y: 0.75, z: CONTACT_Z };
  const flight = simulateShot(origin, launchVelocity(shot.azimuth, shot.elevation, shot.speed));
  return { flight, out: resolveOutcome(flight, fieldPositions(hand), still) };
}

test('ball heights at the bat: nothing skids along the ground except yorkers', () => {
  const release = { x: 0.5, y: 2.15, z: -18.8 };
  const bands = { yorker: [0, 0.3], full: [0.2, 0.65], good: [0.5, 1.05], short: [0.8, 1.35], bouncer: [1.0, 1.9] };
  for (const [pace, [lo, hi]] of Object.entries(PACES)) {
    for (const [len, { z }] of Object.entries(LENGTHS)) {
      for (const speed of [lo, hi]) {
        for (const bounceZ of z) {
          for (const bounce of [0.66, 0.74]) {
            const d = buildDelivery(release, { speed, bounceZ, lineX: 0.1, swing: 0, seam: 0, bounce });
            const y = d.atContact.y;
            const [a, b] = bands[len];
            assert.ok(y >= a && y <= b, `${pace} ${len}: ${y.toFixed(2)} m at the bat`);
          }
        }
      }
    }
  }
});

test('a good-length ball has bounced and is rising or near its top at the bat', () => {
  const d = buildDelivery({ x: 0.5, y: 2.15, z: -18.8 }, { speed: 23, bounceZ: -6.5, lineX: 0.1, swing: 0, seam: 0, bounce: 0.7 });
  assert.ok(d.tBounce < d.tContact, 'pitched before reaching the bat');
  assert.ok(d.atContact.y > 0.6, `height ${d.atContact.y}`);
});

test('straight swings go straight, within a comfortable tolerance', () => {
  for (const dir of [-90, -75, -105, 90, 75, 105]) {
    const s = swing(dir);
    assert.ok(Math.abs(s.azimuth) < 6, `swing at ${dir}° went ${s.azimuth.toFixed(0)}°`);
    assert.match(s.name, /Straight drive/i);
  }
});

test('downward swing = ground shot, upward swing = lofted', () => {
  assert.equal(swing(-90).loft, false);
  assert.ok(swing(-90).elevation < 0, 'ground shots are hit into the turf');
  assert.equal(swing(90).loft, true);
  assert.ok(swing(90).elevation >= 30);
  assert.equal(swing(-20).loft, false, 'across and slightly down stays on the ground');
  assert.equal(swing(35).loft, true, 'across and up is lofted');
});

test('a well-timed straight drive along the ground runs away for four', () => {
  const { out } = play(swing(-90));
  assert.equal(out.type, 'four', JSON.stringify(out));
});

test('a well-timed lofted straight hit is a six, and a big one', () => {
  const { flight, out } = play(swing(90));
  assert.equal(out.type, 'six');
  assert.ok(flight.carry > 85, `carry ${flight.carry.toFixed(0)} m`);
});

test('the ball can go in every direction', () => {
  const seen = new Set();
  const cases = [];
  for (const dir of [-90, -60, -30, 0, 30, 60, 90, 120, 150, 180, -150, -120]) {
    for (const e of [-0.15, -0.08, 0, 0.08, 0.15, 0.2]) cases.push(swing(dir, { e }));
  }
  cases.push(swing(-90, { e: 0.1, contact: 'edge' }));
  cases.push(swing(-90, { e: -0.1, contact: 'edge' }));
  for (const s of cases) seen.add(Math.round((s.azimuth + 180) / 45) % 8);
  assert.equal(seen.size, 8, `octants reached: ${[...seen].sort()}`);
});

test('swinging right sends it right, swinging left sends it left', () => {
  assert.ok(swing(0).azimuth > 80, 'right');
  assert.ok(swing(180).azimuth < -80, 'left');
  assert.ok(swing(-45).azimuth > 25 && swing(-45).azimuth < 60, 'down-right drive');
});

test('timing bends the ball: early to the leg side, late to the off side', () => {
  assert.ok(swing(-90, { e: -0.12 }).azimuth < -25, 'early right-hander → leg side (left)');
  assert.ok(swing(-90, { e: 0.12 }).azimuth > 25, 'late right-hander → off side (right)');
  assert.ok(swing(-90, { e: 0.12, hand: -1 }).azimuth < -25, 'late left-hander → off side (left)');
  assert.ok(swing(0, { e: 0.16 }).azimuth > 120, 'late and across → behind square');
});

test('a slow push is a defensive block', () => {
  const s = swing(-90, { peak: 25 });
  assert.equal(s.defensive, true);
  assert.ok(s.speed < 8);
  const { out } = play(s);
  assert.equal(out.type, 'runs');
  assert.ok(out.runs <= 1);
});

test('mistiming costs power', () => {
  const good = swing(90);
  const late = swing(90, { e: 0.18 });
  assert.ok(late.speed < good.speed * 0.8, `${late.speed.toFixed(1)} vs ${good.speed.toFixed(1)}`);
});

test('lofted drives to the ring fielders are safe when hit hard, catchable when hit softly', () => {
  const soft = play(swing(60, { peak: 55 }));
  assert.ok(['caught', 'runs', 'four'].includes(soft.out.type));
  const hard = play(swing(60));
  assert.equal(hard.out.type, 'six');
});

test('a mistimed loft does not clear the rope', () => {
  for (const e of [-0.16, 0.16]) {
    const { out, flight } = play(swing(90, { e }));
    assert.notEqual(out.type, 'six', `e=${e}: carry ${flight.carry.toFixed(0)} m`);
  }
});

test('lofting to the deep fielder with a soft hit gets caught', () => {
  // Towards deep midwicket (right-hander's leg side), not hit hard.
  const s = swing(125, { peak: 62 });
  const { out } = play(s);
  assert.equal(out.type, 'caught', `${s.azimuth.toFixed(0)}° → ${out.type}`);
});
