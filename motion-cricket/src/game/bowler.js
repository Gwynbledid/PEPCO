import * as THREE from 'three';
import { createCharacter, poseBowl, poseIdle, poseReady, poseRun } from './character.js';

const START_Z = -31;
const STRIDE_Z = -21.2;
const CREASE_Z = -19.4;
const RUN_T = 1.9;
const DELIVER_T = 0.6;
const RELEASE_U = 0.56;
const FOLLOW_T = 1.0;
const LANE_X = 0.55; // right-arm over the wicket: passes the stumps on his left

export class Bowler {
  constructor(scene, ballMesh) {
    this.c = createCharacter({ headwear: 'cap', capColor: 0x1b2a5a, accent: 0x0d6b73, skin: 0xa8704a });
    scene.add(this.c.root);
    this.heldBall = ballMesh.clone();
    this.c.armR.hand.add(this.heldBall);
    this.heldBall.position.set(0, -0.07, 0.03);
    this.state = 'idle';
    this.t = 0;
    this.phase = 0;
    this.fieldPos = new THREE.Vector3(1.8, 0, -16.8);
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.t = 0;
    this.heldBall.visible = true;
    this.c.root.position.set(LANE_X, 0, START_Z);
    this.c.root.rotation.set(0, 0, 0);
  }

  startRunUp() {
    this.reset();
    this.state = 'runup';
  }

  get busy() {
    return this.state === 'runup' || this.state === 'deliver';
  }

  /** Advances the animation. Returns the release point on the frame the ball leaves the hand. */
  update(dt, time) {
    const c = this.c;
    const root = c.root;
    this.t += dt;
    let release = null;
    if (this.state === 'idle') {
      poseIdle(c, time);
    } else if (this.state === 'runup') {
      const s = Math.min(1, this.t / RUN_T);
      root.position.z = START_Z + (STRIDE_Z - START_Z) * (0.35 * s + 0.65 * s * s);
      const speed = ((STRIDE_Z - START_Z) / RUN_T) * (0.35 + 1.3 * s);
      this.phase += dt * speed * 1.9;
      poseRun(c, this.phase, 0.7 + 0.3 * s);
      if (s >= 1) {
        this.state = 'deliver';
        this.t = 0;
      }
    } else if (this.state === 'deliver') {
      const u = Math.min(1, this.t / DELIVER_T);
      root.position.z = STRIDE_Z + (CREASE_Z - STRIDE_Z) * Math.sin((u * Math.PI) / 2);
      poseBowl(c, u);
      if (this.heldBall.visible && u >= RELEASE_U) {
        root.updateMatrixWorld(true);
        release = new THREE.Vector3();
        c.armR.hand.getWorldPosition(release);
        this.heldBall.visible = false;
      }
      if (u >= 1) {
        this.state = 'follow';
        this.t = 0;
      }
    } else if (this.state === 'follow') {
      const s = Math.min(1, this.t / FOLLOW_T);
      const e = 1 - (1 - s) * (1 - s);
      root.position.x = LANE_X + (this.fieldPos.x - LANE_X) * e;
      root.position.z = CREASE_Z + (this.fieldPos.z - CREASE_Z) * e;
      root.rotation.y = -0.5 * e;
      this.phase += dt * (1 - s) * 12;
      poseRun(c, this.phase, 1 - s);
      if (s >= 1) this.state = 'field';
    } else {
      poseReady(c, time);
    }
    return release;
  }
}
