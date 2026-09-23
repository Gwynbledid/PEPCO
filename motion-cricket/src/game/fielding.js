import * as THREE from 'three';
import { createCharacter, poseCelebrate, poseReady, poseRun, poseSquat } from './character.js';
import { shotPosAt } from './physics.js';

// Field for a right-hander: angle from straight down the ground (degrees,
// + = off side) and distance from the striker's stumps (m). Mirrored for
// left-handers.
const FIELD = [
  { name: 'Keeper', a: 180, r: 11, keeper: true },
  { name: 'Slip', a: 160, r: 14 },
  { name: 'Point', a: 95, r: 27 },
  { name: 'Cover', a: 55, r: 32 },
  { name: 'Mid-off', a: 16, r: 38 },
  { name: 'Mid-on', a: -16, r: 38 },
  { name: 'Midwicket', a: -58, r: 33 },
  { name: 'Square leg', a: -95, r: 27 },
  { name: 'Fine leg', a: -150, r: 47 },
  { name: 'Deep cover', a: 62, r: 55 },
];

const REACH = 1.7;
const CATCH_HEIGHT = 2.6;

export const polar = (deg, r, hand = 1) => {
  const a = (deg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * r * hand, 0, -Math.cos(a) * r);
};

export class Fielders {
  constructor(scene) {
    this.list = FIELD.map((f) => {
      const c = createCharacter({
        headwear: f.keeper ? 'helmet' : 'cap',
        capColor: 0x0d6b73,
        accent: 0x1b2a5a,
        gloves: f.keeper,
        pads: f.keeper,
        skin: [0xb97a4f, 0x8d5a3b, 0xd29a6c, 0xa8704a][Math.floor(Math.random() * 4)],
      });
      scene.add(c.root);
      return { ...f, c, home: new THREE.Vector3(), pos: new THREE.Vector3(), target: null, state: 'ready', phase: Math.random() * 6 };
    });
    this.setHand(1);
  }

  setHand(hand) {
    this.hand = hand;
    for (const f of this.list) {
      f.home.copy(polar(f.a, f.r, hand));
      this.resetOne(f);
    }
  }

  resetOne(f) {
    f.pos.copy(f.home);
    f.state = 'ready';
    f.target = null;
    f.c.root.position.copy(f.pos);
    f.c.root.lookAt(0, 0, -10);
  }

  reset() {
    this.list.forEach((f) => this.resetOne(f));
  }

  /**
   * Decides the outcome of a struck ball: the earliest fielder who can get
   * to it (a catch if it hasn't bounced yet), or the rope.
   */
  resolve(shot, extras = []) {
    const fielders = [
      ...this.list.map((f) => ({ f, pos: f.home, speed: f.keeper ? 4.5 : 7.2, reaction: f.keeper ? 0.1 : 0.3 })),
      ...extras,
    ];
    const s = shot.samples;
    const tail = 7;
    const steps = s.length + Math.round(tail / shot.dt);
    let best = null;
    for (const fl of fielders) {
      for (let i = 0; i < steps; i++) {
        const t = i * shot.dt;
        if (best && t >= best.t) break;
        if (shot.boundary && t >= shot.boundary.t) break;
        const smp = s[Math.min(i, s.length - 1)];
        const p = smp.p;
        const catchable = !smp.bounced && p.y <= CATCH_HEIGHT && t > 0.15;
        const stoppable = smp.bounced && p.y <= 1.3;
        if (!catchable && !stoppable) continue;
        const dist = Math.hypot(p.x - fl.pos.x, p.z - fl.pos.z) - REACH;
        if (dist <= fl.speed * Math.max(0, t - fl.reaction)) {
          best = { t, fielder: fl, catch: catchable, point: p.clone(), run: Math.max(0, dist) };
          break;
        }
      }
    }
    if (shot.boundary && (!best || shot.boundary.t <= best.t)) {
      return { type: shot.boundary.six ? 'six' : 'four', runs: shot.boundary.six ? 6 : 4, t: shot.boundary.t };
    }
    if (!best) return { type: 'runs', runs: 1, t: shot.duration };
    if (best.catch) {
      const dropChance = 0.06 + Math.min(0.3, best.run / 40) + (best.fielder.f?.keeper ? 0 : 0.04);
      if (Math.random() > dropChance) {
        return { type: 'caught', runs: 0, t: best.t, fielder: best.fielder.f, point: best.point };
      }
      return { ...fieldedRuns(best), dropped: true };
    }
    return fieldedRuns(best);
  }

  /** Sends the chasing fielder towards the ball. */
  chase(outcome, shot) {
    const f = outcome.fielder;
    if (!f || !outcome.point || !this.list.includes(f)) return;
    f.state = 'chase';
    f.target = outcome.point.clone();
    f.target.y = 0;
    f.arrive = outcome.t;
    f.shot = shot;
  }

  update(dt, t, shotTime) {
    for (const f of this.list) {
      f.phase += dt * 11;
      if (f.state === 'chase' && f.target) {
        const to = new THREE.Vector3().subVectors(f.target, f.pos);
        to.y = 0;
        const d = to.length();
        const remaining = Math.max(0.05, f.arrive - shotTime);
        const speed = Math.min(8, d / remaining);
        if (d > 0.3 && shotTime < f.arrive + 0.05) {
          f.pos.addScaledVector(to.normalize(), Math.min(d, speed * dt));
          f.c.root.position.copy(f.pos);
          const look = f.pos.clone().add(to);
          f.c.root.lookAt(look.x, 0, look.z);
          poseRun(f.c, f.phase, Math.min(1, speed / 5));
        } else {
          if (f.shot) {
            const ball = shotPosAt(f.shot, shotTime);
            f.c.root.lookAt(ball.x, 0, ball.z);
          }
          poseReady(f.c, t);
        }
      } else if (f.state === 'celebrate') {
        poseCelebrate(f.c, t);
      } else if (f.keeper) {
        poseSquat(f.c);
      } else {
        poseReady(f.c, t + f.phase);
      }
    }
  }

  celebrate(f) {
    if (f) f.state = 'celebrate';
  }
}

function fieldedRuns(best) {
  // Time the batters get: until the fielder gathers it plus the throw back.
  const p = best.point;
  const throwDist = Math.min(Math.hypot(p.x, p.z), Math.hypot(p.x, p.z + 20.12));
  const T = best.t + throwDist / 28;
  const runs = Math.max(0, Math.min(3, Math.floor((T - 0.5) / 2.6)));
  return { type: 'runs', runs, t: best.t, fielder: best.fielder.f, point: p };
}
