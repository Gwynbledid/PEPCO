import * as THREE from 'three';
import { aimBat, createBat } from './batModel.js';
import {
  RELEASE_U,
  createCharacter,
  poseBowl,
  poseCatch,
  poseCelebrate,
  poseIdle,
  poseReady,
  poseRun,
  poseSquat,
  poseUmpire,
} from './characters.js';
import { fieldPositions } from './outcome.js';
import { shotPos } from './physics.js';

// Bowler, fielders, umpire and non-striker.

const SKIN_TONES = [0xb97a4f, 0x8d5a3b, 0xd29a6c, 0xa8704a, 0x7a4a2c];

const START_Z = -32;
const STRIDE_Z = -21.3;
const CREASE_Z = -19.35;
const RUN_T = 2.0;
const DELIVER_T = 0.62;
const FOLLOW_T = 1.1;

export class Bowler {
  constructor(scene, ballMesh) {
    this.c = createCharacter({ headwear: 'cap', capColor: 0x0b6e61, accent: 0x1b2a5a, skin: 0xa8704a, scale: 0.95 });
    scene.add(this.c.root);
    this.held = ballMesh.clone();
    this.held.scale.setScalar(0.85);
    this.c.armR.wrist.add(this.held);
    this.held.position.set(0, -0.09, 0.03);
    this.lane = 0.55;
    this.fieldPos = new THREE.Vector3(3.2, 0, -15.8);
    this.reset();
  }

  setHand(batterHand) {
    // Over the wicket to a right-hander; the follow-through clears the line.
    this.fieldPos.set(3.2 * batterHand, 0, -15.8);
  }

  reset() {
    this.state = 'idle';
    this.t = 0;
    this.phase = 0;
    this.held.visible = true;
    this.c.root.position.set(this.lane, 0, START_Z);
    this.c.root.rotation.set(0, 0, 0);
  }

  startRunUp() {
    this.reset();
    this.state = 'runup';
  }

  get busy() {
    return this.state === 'runup' || this.state === 'deliver';
  }

  /** Returns the release point on the frame the ball leaves the hand. */
  update(dt, time) {
    const c = this.c;
    const root = c.root;
    this.t += dt;
    let release = null;
    if (this.state === 'idle') {
      poseIdle(c, time, 0.5);
      root.lookAt(this.lane, 0, 0);
    } else if (this.state === 'runup') {
      const s = Math.min(1, this.t / RUN_T);
      root.position.z = START_Z + (STRIDE_Z - START_Z) * (0.35 * s + 0.65 * s * s);
      const speed = ((STRIDE_Z - START_Z) / RUN_T) * (0.35 + 1.3 * s);
      this.phase += dt * speed * 1.85;
      poseRun(c, this.phase, 0.7 + 0.3 * s);
      if (s >= 1) {
        this.state = 'deliver';
        this.t = 0;
      }
    } else if (this.state === 'deliver') {
      const u = Math.min(1, this.t / DELIVER_T);
      root.position.z = STRIDE_Z + (CREASE_Z - STRIDE_Z) * Math.sin((u * Math.PI) / 2);
      poseBowl(c, u);
      if (this.held.visible && u >= RELEASE_U) {
        root.updateMatrixWorld(true);
        release = new THREE.Vector3();
        this.held.getWorldPosition(release);
        this.held.visible = false;
      }
      if (u >= 1) {
        this.state = 'follow';
        this.t = 0;
      }
    } else if (this.state === 'follow') {
      const s = Math.min(1, this.t / FOLLOW_T);
      const e = 1 - (1 - s) * (1 - s);
      root.position.x = this.lane + (this.fieldPos.x - this.lane) * e;
      root.position.z = CREASE_Z + (this.fieldPos.z - CREASE_Z) * e;
      root.rotation.y = -0.5 * e * Math.sign(this.fieldPos.x || 1);
      this.phase += dt * (1 - s) * 12;
      poseRun(c, this.phase, 1 - s);
      if (s >= 1) this.state = 'field';
    } else {
      poseReady(c, time, 0.3);
    }
    return release;
  }
}

export class Fielders {
  constructor(scene) {
    this.list = fieldPositions(1).map((f, i) => {
      const c = createCharacter({
        headwear: f.keeper ? 'helmet' : 'cap',
        capColor: f.keeper ? 0x1b2a5a : 0x0b6e61,
        accent: 0x1b2a5a,
        gloves: f.keeper,
        pads: f.keeper,
        shortSleeves: !f.keeper && i % 3 === 0,
        skin: SKIN_TONES[i % SKIN_TONES.length],
        beard: i % 2 === 0,
        scale: 0.9 + (i % 4) * 0.02,
      });
      scene.add(c.root);
      return { ...f, c, home: new THREE.Vector3(), pos: new THREE.Vector3(), state: 'ready', phase: i * 1.7 };
    });
    this.setHand(1);
  }

  setHand(hand) {
    const plan = fieldPositions(hand);
    this.list.forEach((f, i) => {
      Object.assign(f, { pos: f.pos, name: plan[i].name, speed: plan[i].speed, reaction: plan[i].reaction });
      f.home.set(plan[i].pos.x, 0, plan[i].pos.z);
    });
    this.reset();
  }

  /** Plain data for resolveOutcome (home positions). */
  plan() {
    return this.list.map((f) => ({ name: f.name, keeper: f.keeper, pos: { x: f.home.x, z: f.home.z }, speed: f.speed, reaction: f.reaction, ref: f }));
  }

  reset() {
    for (const f of this.list) {
      f.pos.copy(f.home);
      f.state = 'ready';
      f.target = null;
      f.c.root.position.copy(f.pos);
      f.c.root.lookAt(0, 0, -2);
    }
  }

  /** Sends the fielder who gets there first towards the ball. */
  chase(fielder, point, arrive, shot, isCatch) {
    if (!fielder) return;
    fielder.state = 'chase';
    fielder.target = new THREE.Vector3(point.x, 0, point.z);
    fielder.arrive = arrive;
    fielder.shot = shot;
    fielder.catching = isCatch;
  }

  celebrate(fielder) {
    for (const f of this.list) if (f === fielder || Math.random() < 0.5) f.state = 'celebrate';
  }

  update(dt, t, shotTime) {
    for (const f of this.list) {
      f.phase += dt * 11;
      const c = f.c;
      if (f.state === 'chase' && f.target) {
        const to = new THREE.Vector3().subVectors(f.target, f.pos);
        to.y = 0;
        const d = to.length();
        const remaining = Math.max(0.05, f.arrive - shotTime);
        const speed = Math.min(8, d / remaining);
        if (d > 0.25 && shotTime < f.arrive + 0.05) {
          f.pos.addScaledVector(to.normalize(), Math.min(d, speed * dt));
          c.root.position.copy(f.pos);
          c.root.lookAt(f.pos.x + to.x, 0, f.pos.z + to.z);
          poseRun(c, f.phase, Math.min(1, speed / 5));
        } else {
          if (f.shot) {
            const b = shotPos(f.shot, shotTime);
            c.root.lookAt(b.x, 0, b.z);
          }
          if (f.catching) poseCatch(c);
          else poseReady(c, t, f.phase);
        }
      } else if (f.state === 'celebrate') {
        poseCelebrate(c, t + f.phase * 0.1);
      } else if (f.keeper) {
        poseSquat(c, t);
      } else {
        poseReady(c, t, f.phase);
      }
    }
  }
}

export class Umpire {
  constructor(scene) {
    this.c = createCharacter({
      headwear: 'hat',
      capColor: 0xf3eee2,
      shirt: 0xffffff,
      trousers: 0x2b2f3a,
      accent: 0x2b2f3a,
      skin: 0x8d5a3b,
      scale: 0.95,
    });
    this.c.root.position.set(-1.0, 0, -22.4);
    scene.add(this.c.root);
    this.signal = null;
  }

  update(t) {
    if (this.signal) poseUmpire(this.c, this.signal, t);
    else poseIdle(this.c, t, 2.1);
  }
}

export class NonStriker {
  constructor(scene, assets) {
    this.c = createCharacter({ headwear: 'helmet', capColor: 0x1b2a5a, pads: true, gloves: true, skin: 0xd29a6c, scale: 0.93 });
    this.bat = createBat(assets);
    this.c.armR.wrist.add(this.bat);
    aimBat(this.bat, new THREE.Vector3(0, -0.02, 0.02), new THREE.Vector3(0.05, -1, 0.3), new THREE.Vector3(0, 0, 1));
    this.c.root.position.set(-1.5, 0, -18.7);
    this.c.root.lookAt(-1.5, 0, 0);
    scene.add(this.c.root);
  }

  update(t) {
    poseIdle(this.c, t, 0.9);
  }
}
