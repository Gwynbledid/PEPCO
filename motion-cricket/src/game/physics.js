import { BALL_RADIUS, BOUNDARY_RADIUS, CONTACT_Z, FIELD_CENTER, G, PACES, standHeight } from './config.js';

// Plain {x, y, z} vectors, so the physics runs (and is tested) without a renderer.
const DT = 1 / 120;
const DRAG = 0.0055; // quadratic air drag, 1/m (a leather ball loses ~25% of its range)

// Where the ball pitches (metres in front of the batter's stumps) for each
// length, and how often each is bowled. Real lengths: a good-length ball
// climbs to thigh/waist height by the time it reaches the bat.
export const LENGTHS = {
  yorker: { p: 0.06, z: [-1.9, -2.4] },
  full: { p: 0.2, z: [-3.9, -4.8] },
  good: { p: 0.5, z: [-6.0, -7.3] },
  short: { p: 0.18, z: [-7.8, -9.0] },
  bouncer: { p: 0.06, z: [-9.6, -10.8] },
};

const lerp = (a, b, t) => a + (b - a) * t;

/** A random delivery: speed, line, length, swing and seam. */
export function planDelivery(pace, hand = 1, rand = Math.random) {
  const [lo, hi] = PACES[pace] || PACES.medium;
  let r = rand();
  let length = 'good';
  for (const [name, { p }] of Object.entries(LENGTHS)) {
    if (r < p) {
      length = name;
      break;
    }
    r -= p;
  }
  const [z0, z1] = LENGTHS[length].z;
  return {
    speed: lerp(lo, hi, rand()),
    length,
    bounceZ: lerp(z0, z1, rand()),
    // Line where it would pass the stumps: mostly at the stumps or just outside off.
    lineX: hand * lerp(-0.18, 0.32, rand()),
    swing: (rand() - 0.5) * 1.2, // sideways m/s² in the air
    seam: (rand() - 0.5) * 0.9, // sideways m/s gained off the pitch
    bounce: lerp(0.66, 0.74, rand()),
  };
}

/**
 * Flight of a delivery from the release point, as functions of time since
 * release, plus the key moments: when it pitches, reaches the bat and
 * reaches the stumps.
 */
export function buildDelivery(release, plan) {
  const vh = plan.speed;
  // Aim straight at the line, ignoring swing (swing and seam then move it).
  const dirX = plan.lineX - release.x;
  const dirZ = -release.z;
  const l = Math.hypot(dirX, dirZ);
  const fx = dirX / l;
  const fz = dirZ / l;
  const toBounce = (plan.bounceZ - release.z) / fz;
  const tb = toBounce / vh;
  const vy0 = (BALL_RADIUS - release.y + 0.5 * G * tb * tb) / tb;
  const a = plan.swing;
  const v0 = { x: fx * vh, y: vy0, z: fz * vh };
  const bounce = { x: release.x + v0.x * tb + 0.5 * a * tb * tb, y: BALL_RADIUS, z: plan.bounceZ };
  const vyImpact = vy0 - G * tb;
  const v1 = {
    x: (v0.x + a * tb) * 0.9 + plan.seam,
    y: -vyImpact * plan.bounce,
    z: v0.z * 0.88,
  };

  const posAt = (t, out = { x: 0, y: 0, z: 0 }) => {
    if (t <= tb) {
      out.x = release.x + v0.x * t + 0.5 * a * t * t;
      out.y = release.y + v0.y * t - 0.5 * G * t * t;
      out.z = release.z + v0.z * t;
      return out;
    }
    const u = t - tb;
    out.x = bounce.x + v1.x * u;
    out.y = Math.max(BALL_RADIUS, bounce.y + v1.y * u - 0.5 * G * u * u);
    out.z = bounce.z + v1.z * u;
    return out;
  };
  const velAt = (t, out = { x: 0, y: 0, z: 0 }) => {
    if (t <= tb) {
      out.x = v0.x + a * t;
      out.y = v0.y - G * t;
      out.z = v0.z;
    } else {
      out.x = v1.x;
      out.y = v1.y - G * (t - tb);
      out.z = v1.z;
    }
    return out;
  };
  const timeAtZ = (z) => (z <= bounce.z ? (z - release.z) / v0.z : tb + (z - bounce.z) / v1.z);

  const tContact = timeAtZ(CONTACT_Z);
  const tStumps = timeAtZ(0);
  const atStumps = posAt(tStumps);
  const hitsStumps = Math.abs(atStumps.x) < 0.114 + BALL_RADIUS && atStumps.y < 0.71 + BALL_RADIUS;
  return {
    plan,
    release: { ...release },
    posAt,
    velAt,
    tBounce: tb,
    bounce,
    tContact,
    tStumps,
    atContact: posAt(tContact),
    atStumps,
    hitsStumps,
  };
}

/** Launch velocity from a shot direction. Azimuth: 0 = straight back past the bowler, + = to +x. */
export function launchVelocity(azimuthDeg, elevationDeg, speed) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return {
    x: Math.sin(az) * Math.cos(el) * speed,
    y: Math.sin(el) * speed,
    z: -Math.cos(az) * Math.cos(el) * speed,
  };
}

const distFromCenter = (p) => Math.hypot(p.x - FIELD_CENTER.x, p.z - FIELD_CENTER.z);

/**
 * Flight of a struck ball: through the air (with drag), bouncing and
 * rolling, until it stops, crosses the rope, or (a six) lands in the crowd.
 * Samples are every 1/120 s.
 */
export function simulateShot(origin, velocity) {
  const p = { ...origin };
  const v = { ...velocity };
  const samples = [];
  let bounced = false;
  let rolling = false;
  let boundary = null;
  let firstBounce = null;
  let t = 0;
  for (let i = 0; i < 14 / DT; i++) {
    samples.push({ t, x: p.x, y: p.y, z: p.z, bounced });
    const r = distFromCenter(p);
    if (!boundary && r >= BOUNDARY_RADIUS) {
      boundary = { t, six: !bounced, x: p.x, y: p.y, z: p.z };
      if (bounced) break; // a four: it's in the rope
    }
    // A six keeps flying until it lands in the stands.
    if (boundary && boundary.six && p.y <= Math.max(BALL_RADIUS, standHeight(r))) break;
    if (rolling) {
      const sp = Math.hypot(v.x, v.z);
      const ns = sp - 2.6 * DT; // a fast outfield
      if (ns < 0.25) break;
      v.x *= ns / sp;
      v.z *= ns / sp;
    } else {
      const sp = Math.hypot(v.x, v.y, v.z);
      v.x -= DRAG * sp * v.x * DT;
      v.y -= (G + DRAG * sp * v.y) * DT;
      v.z -= DRAG * sp * v.z * DT;
    }
    p.x += v.x * DT;
    p.y += v.y * DT;
    p.z += v.z * DT;
    if (!rolling && p.y <= BALL_RADIUS && !(boundary && boundary.six)) {
      p.y = BALL_RADIUS;
      if (!bounced) firstBounce = { x: p.x, z: p.z, t };
      bounced = true;
      v.y = -v.y * 0.42;
      v.x *= 0.85;
      v.z *= 0.85;
      if (v.y < 1.2) {
        v.y = 0;
        rolling = true;
      }
    }
    t += DT;
  }
  const last = samples[samples.length - 1];
  return {
    samples,
    dt: DT,
    duration: last.t,
    boundary,
    firstBounce,
    end: { x: last.x, y: last.y, z: last.z },
    carry: carryDistance(origin, velocity),
  };
}

/**
 * How far the ball would carry on the full (to ground level) from where it
 * was hit: the distance shown on the six meter.
 */
export function carryDistance(origin, velocity) {
  const p = { ...origin };
  const v = { ...velocity };
  for (let i = 0; i < 12 / DT; i++) {
    const sp = Math.hypot(v.x, v.y, v.z);
    v.x -= DRAG * sp * v.x * DT;
    v.y -= (G + DRAG * sp * v.y) * DT;
    v.z -= DRAG * sp * v.z * DT;
    p.x += v.x * DT;
    p.y += v.y * DT;
    p.z += v.z * DT;
    if (p.y <= 0 && v.y < 0) break;
  }
  return Math.hypot(p.x - origin.x, p.z - origin.z);
}

/** Position along a struck ball's flight at time t. */
export function shotPos(shot, t, out = { x: 0, y: 0, z: 0 }) {
  const s = shot.samples;
  const f = t / shot.dt;
  const i = Math.floor(f);
  if (i >= s.length - 1) {
    const e = s[s.length - 1];
    out.x = e.x;
    out.y = e.y;
    out.z = e.z;
    return out;
  }
  const a = s[Math.max(0, i)];
  const b = s[Math.max(0, i) + 1];
  const k = Math.max(0, f - i);
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.z = a.z + (b.z - a.z) * k;
  return out;
}

/** Horizontal distance travelled from the start of the shot at time t. */
export function shotDistance(shot, t) {
  const p = shotPos(shot, t);
  const o = shot.samples[0];
  return Math.hypot(p.x - o.x, p.z - o.z);
}
