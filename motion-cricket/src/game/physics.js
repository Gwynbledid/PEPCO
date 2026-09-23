import * as THREE from 'three';
import { BOUNDARY_RADIUS, FIELD_CENTER } from './stadium.js';

export const G = 9.81;
export const BALL_RADIUS = 0.036;
// The plane (z) where the bat meets the ball: a front-foot contact point
// about a metre in front of the popping crease.
export const HIT_PLANE_Z = -2.4;
const DT = 1 / 120;

const PACES = {
  slow: [22, 26], // ~80-95 km/h: best while learning, it hides camera lag
  medium: [27, 32], // ~97-115 km/h
  fast: [33, 38], // ~120-137 km/h
};

/** Random delivery plan: speed, line, length and seam movement. */
export function planDelivery(pace, rand = Math.random) {
  const [lo, hi] = PACES[pace] || PACES.medium;
  const r = rand();
  // Mostly good length, some full, some short.
  const length = r < 0.18 ? 'full' : r < 0.78 ? 'good' : r < 0.93 ? 'short' : 'yorker';
  const bounceZ = {
    yorker: -0.9 - rand() * 0.5,
    full: -3.0 - rand() * 1.2,
    good: -4.8 - rand() * 1.8,
    short: -8.0 - rand() * 2.0,
  }[length];
  return {
    speed: lo + rand() * (hi - lo),
    lineX: -0.25 + rand() * 0.6, // where it would pass the stumps (x)
    bounceZ,
    seam: (rand() - 0.5) * 0.9, // sideways m/s gained off the pitch
    length,
  };
}

/**
 * Builds the path of a delivery from the release point. Returns a sampler
 * plus the time it crosses the hit plane and whether it would hit the stumps.
 */
export function buildDelivery(release, plan) {
  const target = new THREE.Vector3(plan.lineX, 0, 0);
  const flat = new THREE.Vector3(target.x - release.x, 0, target.z - release.z).normalize();
  const toBounce = (plan.bounceZ - release.z) / flat.z;
  const bounce = new THREE.Vector3(release.x + flat.x * toBounce, BALL_RADIUS, plan.bounceZ);
  const vh = plan.speed;
  const tb = toBounce / vh;
  const vy0 = (BALL_RADIUS - release.y + 0.5 * G * tb * tb) / tb;
  const v0 = new THREE.Vector3(flat.x * vh, vy0, flat.z * vh);
  const vyImpact = vy0 - G * tb;
  // Off the pitch: loses some pace, bounces up, and moves off the seam.
  const e = 0.52;
  const v1 = new THREE.Vector3(v0.x * 0.9 + plan.seam, -vyImpact * e, v0.z * 0.9);

  const posAt = (t, out = new THREE.Vector3()) => {
    if (t <= tb) {
      return out.set(release.x + v0.x * t, release.y + v0.y * t - 0.5 * G * t * t, release.z + v0.z * t);
    }
    const u = t - tb;
    const y = Math.max(BALL_RADIUS, bounce.y + v1.y * u - 0.5 * G * u * u);
    return out.set(bounce.x + v1.x * u, y, bounce.z + v1.z * u);
  };
  const velAt = (t, out = new THREE.Vector3()) => {
    if (t <= tb) return out.set(v0.x, v0.y - G * t, v0.z);
    return out.set(v1.x, v1.y - G * (t - tb), v1.z);
  };

  const timeAtZ = (z) => {
    if (z <= bounce.z) return (z - release.z) / v0.z;
    return tb + (z - bounce.z) / v1.z;
  };
  const tHit = timeAtZ(HIT_PLANE_Z);
  const tStumps = timeAtZ(0);
  const atStumps = posAt(tStumps);
  const hitsStumps = Math.abs(atStumps.x) < 0.108 + 0.018 + BALL_RADIUS && atStumps.y < 0.72 + BALL_RADIUS;
  return { posAt, velAt, tHit, tStumps, tBounce: tb, bounce, hitsStumps, atHit: posAt(tHit), plan };
}

/**
 * Simulates a struck ball: flight, bounces and roll, stopping at the rope.
 * Returns samples every DT seconds with the moment it crossed the rope.
 */
export function simulateShot(origin, velocity) {
  const p = origin.clone();
  const v = velocity.clone();
  const samples = [];
  let bounced = false;
  let firstBounce = null;
  let boundary = null;
  let t = 0;
  let rolling = false;
  for (let i = 0; i < 12 / DT; i++) {
    samples.push({ t, p: p.clone(), bounced });
    const dx = p.x - FIELD_CENTER.x;
    const dz = p.z - FIELD_CENTER.z;
    if (Math.hypot(dx, dz) >= BOUNDARY_RADIUS) {
      boundary = { t, six: !bounced, p: p.clone() };
      break;
    }
    if (rolling) {
      const sp = Math.hypot(v.x, v.z);
      const ns = Math.max(0, sp - 5.0 * DT);
      if (ns < 0.3) break;
      v.x *= ns / sp;
      v.z *= ns / sp;
    } else {
      v.y -= G * DT;
      // Light air drag keeps the big hits believable.
      v.multiplyScalar(1 - 0.012 * DT * v.length() * 0.1);
    }
    p.addScaledVector(v, DT);
    if (!rolling && p.y <= BALL_RADIUS) {
      p.y = BALL_RADIUS;
      if (!bounced) firstBounce = p.clone();
      bounced = true;
      v.y = -v.y * 0.42;
      v.x *= 0.72;
      v.z *= 0.72;
      if (v.y < 1.2) {
        v.y = 0;
        rolling = true;
      }
    }
    t += DT;
  }
  const last = samples[samples.length - 1];
  return { samples, boundary, firstBounce, dt: DT, duration: last.t, end: last.p };
}

/** Linear interpolation into a shot's samples. */
export function shotPosAt(shot, t, out = new THREE.Vector3()) {
  const s = shot.samples;
  const f = t / shot.dt;
  const i = Math.floor(f);
  if (i >= s.length - 1) return out.copy(s[s.length - 1].p);
  if (i < 0) return out.copy(s[0].p);
  return out.copy(s[i].p).lerp(s[i + 1].p, f - i);
}
