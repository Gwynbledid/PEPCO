// Where the fielders stand and what happens to a struck ball: caught,
// stopped (and how many runs were taken), or the boundary.

// Field for a right-hander: angle from straight down the ground (degrees,
// + = off side) and distance from the striker's stumps. Mirrored for
// left-handers. Straight down the ground is open, so a well-timed straight
// drive can reach the rope between mid-off and mid-on.
export const FIELD = [
  { name: 'Keeper', a: 180, r: 9.5, keeper: true },
  { name: 'Slip', a: 163, r: 12 },
  { name: 'Point', a: 95, r: 25 },
  { name: 'Cover', a: 55, r: 29 },
  { name: 'Mid-off', a: 17, r: 27 },
  { name: 'Mid-on', a: -17, r: 27 },
  { name: 'Midwicket', a: -58, r: 29 },
  { name: 'Square leg', a: -96, r: 24 },
  { name: 'Fine leg', a: -150, r: 54 },
  { name: 'Deep midwicket', a: -50, r: 60 },
];

const REACH = 1.5; // how far a fielder can stretch or dive
const CATCH_HEIGHT = 2.7; // highest catchable ball
const THROW_SPEED = 26;

export function polar(deg, r, hand = 1) {
  const a = (deg * Math.PI) / 180;
  return { x: Math.sin(a) * r * hand, z: -Math.cos(a) * r };
}

/** Fielders ready for resolveOutcome: position, running speed and reaction time. */
export function fieldPositions(hand = 1) {
  return FIELD.map((f) => ({
    ...f,
    pos: polar(f.a, f.r, hand),
    speed: f.keeper ? 4.5 : 6.3,
    reaction: f.keeper ? 0.12 : 0.42,
  }));
}

/**
 * The first fielder who can get to the ball (a catch if it hasn't bounced),
 * or the rope if it gets there first.
 *
 * @param shot   result of simulateShot()
 * @param fielders  [{name, pos:{x,z}, speed, reaction, keeper}]
 * @returns {{type:'six'|'four'|'caught'|'runs', runs:number, t:number, fielder?:object, point?:object, dropped?:boolean}}
 */
export function resolveOutcome(shot, fielders, rand = Math.random) {
  const s = shot.samples;
  const tail = Math.round(6 / shot.dt); // after the ball stops, fielders still walk to it
  let best = null;
  for (const f of fielders) {
    for (let i = 0; i < s.length + tail; i++) {
      const t = i * shot.dt;
      if (best && t >= best.t) break;
      if (shot.boundary && t >= shot.boundary.t) break;
      const smp = s[Math.min(i, s.length - 1)];
      const catchable = !smp.bounced && smp.y <= CATCH_HEIGHT && t > 0.18;
      const stoppable = smp.bounced && smp.y <= 1.4;
      if (!catchable && !stoppable) continue;
      const need = Math.hypot(smp.x - f.pos.x, smp.z - f.pos.z) - REACH;
      if (need <= f.speed * Math.max(0, t - f.reaction)) {
        best = { t, fielder: f, catch: catchable, point: { x: smp.x, y: smp.y, z: smp.z }, run: Math.max(0, need) };
        break;
      }
    }
  }
  if (shot.boundary && (!best || shot.boundary.t <= best.t)) {
    const six = shot.boundary.six;
    return { type: six ? 'six' : 'four', runs: six ? 6 : 4, t: shot.boundary.t };
  }
  if (!best) return { type: 'runs', runs: 1, t: shot.duration };
  if (best.catch) {
    // Running and diving catches go down more often.
    const drop = 0.06 + Math.min(0.3, best.run / 40);
    if (rand() > drop) return { type: 'caught', runs: 0, t: best.t, fielder: best.fielder, point: best.point };
    return { ...runsFor(best), dropped: true };
  }
  return runsFor(best);
}

function runsFor(best) {
  // The batters run until the ball is back at a set of stumps.
  const p = best.point;
  const back = Math.min(Math.hypot(p.x, p.z), Math.hypot(p.x, p.z + 20.12));
  const T = best.t + back / THROW_SPEED;
  const runs = Math.max(0, Math.min(3, Math.floor((T - 0.6) / 2.7)));
  return { type: 'runs', runs, t: best.t, fielder: best.fielder, point: p };
}
