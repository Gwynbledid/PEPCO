import * as THREE from 'three';
import { BatView } from './batView.js';
import { Bowler } from './bowler.js';
import { createCharacter, poseIdle, poseUmpire } from './character.js';
import { Fielders } from './fielding.js';
import { BALL_RADIUS, buildDelivery, planDelivery, shotPosAt, simulateShot } from './physics.js';
import { FIELD_CENTER, buildStadium, buildStumps } from './stadium.js';
import { ballCanvas, shadowCanvas, toTexture } from './textures.js';
import { describeShot } from './shots.js';

// How far before the ball reaches the hit plane a swing should start, and
// how late one can start and still connect (seconds).
const IDEAL_LEAD = 0.14;
const EARLIEST = -0.3;
const LATEST = 0.16;
const RESULT_HOLD = 2.4;

const angleLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export class Game {
  constructor({ canvas, input, audio, hud, assets, settings }) {
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.settings = settings;
    const lowSpec = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.lowSpec = lowSpec;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowSpec ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcfe6fb, 260, 1400);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.03, 3000);
    scene.add(this.camera);

    // Warm late-afternoon sun and a soft blue sky fill: the reference look.
    scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5f8f38, 1.35));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.6);
    sun.position.set(-45, 70, 25);
    sun.target.position.set(0, 0, -12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(lowSpec ? 1024 : 2048, lowSpec ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 200 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const bounce = new THREE.DirectionalLight(0xbfe0ff, 0.5);
    bounce.position.set(30, 20, -60);
    scene.add(bounce);

    buildStadium(scene, assets, { lowSpec });
    this.strikerStumps = buildStumps(scene, 0);

    // Ball (drawn 1.5x real size so it reads on a phone screen) + shadow.
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS * 1.5, 20, 14);
    const ballMat = new THREE.MeshStandardMaterial({ map: toTexture(ballCanvas()), roughness: 0.35 });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.ball.visible = false;
    scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map: toTexture(shadowCanvas()), transparent: true, depthWrite: false }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.visible = false;
    scene.add(this.ballShadow);

    this.bowler = new Bowler(scene, this.ball);
    this.fielders = new Fielders(scene);

    this.umpire = createCharacter({ headwear: 'hat', shirt: 0xffffff, trousers: 0x2b2f3a, accent: 0x2b2f3a, shortSleeves: false, skin: 0x8d5a3b });
    this.umpire.root.position.set(-1.0, 0, -22.4);
    scene.add(this.umpire.root);
    this.umpireSignal = null;

    this.nonStriker = createCharacter({ headwear: 'helmet', capColor: 0x1b2a5a, pads: true, gloves: true });
    const nsBat = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.04), new THREE.MeshStandardMaterial({ color: 0xecd3a0, roughness: 0.55 }));
    nsBat.position.set(0, -0.4, 0.05);
    this.nonStriker.armR.hand.add(nsBat);
    this.nonStriker.root.position.set(-1.5, 0, -18.6);
    scene.add(this.nonStriker.root);

    this.batView = new BatView(this.camera, assets);

    this.camPos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.mode = 'attract';
    this.state = 'idle';
    this.clockT = 0;
    this.stateT = 0;
    this.resetScore();
    this.applySettings(settings);
    this.resize();
  }

  applySettings(settings) {
    this.settings = settings;
    this.hand = settings.hand === 'L' ? -1 : 1;
    this.fielders.setHand(this.hand);
    this.batView.setHand(this.hand);
    this.camPos.set(-0.2 * this.hand, 1.58, -1.05);
  }

  resetScore() {
    this.score = { runs: 0, wkts: 0, balls: 0, fours: 0, sixes: 0, last: [] };
    this.hud.score(this.score);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Keep ~64° across in portrait so the pitch still fits on a phone held upright.
    this.camera.fov = aspect >= 1 ? 52 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(32)) / aspect));
    this.camera.updateProjectionMatrix();
  }

  startAttract() {
    this.mode = 'attract';
    this.state = 'idle';
    this.batView.rig.visible = false;
    this.bowler.reset();
    this.fielders.reset();
    this.ball.visible = false;
    this.ballShadow.visible = false;
    this.hud.show(false);
  }

  startMatch() {
    this.mode = 'play';
    this.batView.rig.visible = true;
    this.resetScore();
    this.hud.show(true);
    this.nextBall(true);
  }

  nextBall(first = false) {
    this.state = 'ready';
    this.stateT = first ? -0.6 : 0;
    this.readyFor = 0;
    this.delivery = null;
    this.shot = null;
    this.outcome = null;
    this.pending = null;
    this.swingUsed = false;
    this.missResolved = false;
    this.shotInfo = null;
    this.umpireSignal = null;
    this.ball.visible = false;
    this.ballShadow.visible = false;
    this.bowler.reset();
    this.fielders.reset();
    this.resetStumps();
    this.hud.clearResult();
    this.yaw = 0;
    this.pitch = -0.06;
  }

  resetStumps() {
    const { stumps, bails } = this.strikerStumps.userData;
    stumps.forEach((s, i) => {
      s.position.set([-0.108, 0, 0.108][i], 0.355, 0);
      s.rotation.set(0, 0, 0);
    });
    bails.forEach((b, i) => {
      b.position.set([-0.054, 0.054][i], 0.715, 0);
      b.rotation.set(0, 0, Math.PI / 2);
    });
    this.stumpsHit = null;
  }

  /** `now` is game time in seconds (pauses excluded), `toGame` converts input timestamps. */
  update(dt, now, toGame) {
    this.clockT = now;
    this.stateT += dt;
    const inp = this.input.state;
    const swings = this.input.takeSwings();

    if (this.mode === 'attract') {
      const a = now * 0.05;
      this.camera.position.set(FIELD_CENTER.x + Math.sin(a) * 38, 13, FIELD_CENTER.z + Math.cos(a) * 38);
      this.camera.lookAt(FIELD_CENTER.x, 1.5, FIELD_CENTER.z);
      this.bowler.update(dt, now);
      this.fielders.update(dt, now, 0);
      poseIdle(this.umpire, now);
      poseIdle(this.nonStriker, now + 1);
      return;
    }

    this.batView.update(inp, inp.speed / Math.max(1, this.input.calib.threshold * 1.6) - 0.3);

    switch (this.state) {
      case 'ready':
        this.updateReady(dt);
        break;
      case 'runup':
        this.updateRunUp(dt, now);
        break;
      case 'bowled':
        this.updateBowled(dt, now, swings, toGame);
        break;
      case 'hit':
        this.updateHit(now);
        break;
      case 'result':
        if (this.delivery && !this.shot) this.moveMissedBall(now);
        if (this.stateT > RESULT_HOLD) {
          this.hud.fade();
          this.state = 'fading';
          this.stateT = 0;
        }
        break;
      case 'fading':
        if (this.stateT > 0.3) this.nextBall();
        break;
      default:
        break;
    }

    if (this.state !== 'runup' && this.state !== 'bowled' && this.state !== 'ready') {
      this.bowler.update(dt, now);
    }
    this.fielders.update(dt, now, this.shot ? now - this.hitTime : 0);
    if (this.umpireSignal) poseUmpire(this.umpire, this.umpireSignal, now);
    else poseIdle(this.umpire, now);
    poseIdle(this.nonStriker, now + 1);
    this.animateStumps(dt);
    this.updateCamera(dt);
  }

  updateReady(dt) {
    const tracked = this.settings.input === 'touch' || this.input.state.tracked;
    if (!tracked) {
      this.readyFor = 0;
      this.hud.hint(this.settings.input === 'stick' ? 'Show the stick and your hands to the camera' : 'Show both hands to the camera');
      this.bowler.update(dt, this.clockT);
      return;
    }
    this.hud.hint(null);
    this.readyFor += dt;
    this.bowler.update(dt, this.clockT);
    if (this.readyFor > 0.5 && this.stateT > 0.9) {
      this.state = 'runup';
      this.stateT = 0;
      this.bowler.startRunUp();
      this.plan = planDelivery(this.settings.pace);
    }
  }

  updateRunUp(dt, now) {
    const release = this.bowler.update(dt, now);
    if (!release) return;
    this.delivery = buildDelivery(release, this.plan);
    this.releaseT = now;
    this.state = 'bowled';
    this.stateT = 0;
    this.ball.visible = true;
    this.ballShadow.visible = true;
    this.hud.speed(Math.round(this.plan.speed * 3.6));
  }

  updateBowled(dt, now, swings, toGame) {
    this.bowler.update(dt, now);
    const d = this.delivery;
    const t = now - this.releaseT;
    const tHitAbs = this.releaseT + d.tHit;
    // Rough input lag: camera capture + hand tracking, or touch events.
    const latency = this.settings.input === 'touch' ? 0.05 : 0.08;

    for (const s of swings) {
      if (this.swingUsed) break;
      const gt = toGame(s.t);
      if (gt < this.releaseT) continue; // waggles during the run-up don't count
      const e = gt - latency - (tHitAbs - IDEAL_LEAD);
      if (e < EARLIEST) {
        this.swingUsed = true;
        this.hud.toast('Too early!');
      } else if (e <= LATEST) {
        this.swingUsed = true;
        this.pending = { e, perfT: s.t, gt, gy: s.gy };
      }
    }

    if (this.pending && now >= Math.max(tHitAbs, this.pending.gt)) {
      if (this.tryHit(now)) return;
      this.pending = null;
    }

    this.moveMissedBall(now);

    // Missed or left it: did it hit the stumps?
    if (t >= d.tStumps && !this.missResolved) {
      this.missResolved = true;
      this.scoreBall(d.hitsStumps ? { type: 'bowled' } : { type: 'dot', label: this.swingUsed ? 'BEATEN!' : 'LEFT ALONE' });
      if (d.hitsStumps) {
        this.stumpsHit = { t: 0, vx: this.delivery.velAt(t).x * 0.1 };
        this.audio.stumps();
        this.ball.visible = false;
        this.ballShadow.visible = false;
      }
    }
  }

  /** Carries an unhit ball on through to the keeper. */
  moveMissedBall(now) {
    if (this.stumpsHit) return;
    const p = this.delivery.posAt(now - this.releaseT, this.ball.position);
    this.placeShadow(p);
    if (p.z > 10) {
      this.ball.visible = false;
      this.ballShadow.visible = false;
    }
  }

  tryHit(now) {
    const d = this.delivery;
    const ballPos = d.posAt(now - this.releaseT);
    const pend = this.pending;
    const v = this.input.velocityBetween(pend.perfT - 0.04, this.input.state.t);

    let contact = 'middle';
    if (this.settings.aimAssist) {
      if (pend.e > 0.09 && Math.random() < 0.5) contact = 'edge';
    } else {
      const [a, b] = this.batView.bladeSegment();
      const seg = new THREE.Line3(a, b);
      const closest = seg.closestPointToPoint(ballPos, true, new THREE.Vector3());
      const dist = closest.distanceTo(ballPos);
      contact = dist < 0.24 ? 'middle' : dist < 0.45 ? 'edge' : 'miss';
    }
    if (contact === 'miss') {
      this.hud.toast('Missed it!');
      return false;
    }

    const shotInfo = describeShot({
      vx: v.vx,
      vy: v.vy,
      peak: v.peak,
      e: pend.e,
      contact,
      hand: this.hand,
      refSpeed: this.input.calib.refSpeed,
    });
    const el = THREE.MathUtils.degToRad(shotInfo.elevation);
    const th = THREE.MathUtils.degToRad(shotInfo.theta);
    const vel = new THREE.Vector3(Math.sin(th) * Math.cos(el), Math.sin(el), -Math.cos(th) * Math.cos(el)).multiplyScalar(shotInfo.speed);
    this.shot = simulateShot(ballPos, vel);
    this.shotInfo = shotInfo;
    this.hitTime = now;
    this.outcome = this.fielders.resolve(this.shot, [
      { pos: this.bowler.fieldPos, speed: 4.5, reaction: 0.5, f: null },
    ]);
    this.fielders.chase(this.outcome, this.shot);
    this.audio.hit(shotInfo.power, contact === 'edge');
    this.hud.flash();
    this.state = 'hit';
    this.stateT = 0;
    this.outcomeShown = false;
    return true;
  }

  updateHit(now) {
    const st = now - this.hitTime;
    const out = this.outcome;
    const tEnd = Math.min(out.t, this.shot.duration);
    let p;
    if (out.type === 'caught' && st >= out.t && out.fielder) {
      p = this.ball.position;
      out.fielder.c.armR.hand.getWorldPosition(p);
    } else {
      p = shotPosAt(this.shot, Math.min(st, tEnd), this.ball.position);
    }
    this.placeShadow(p);
    this.hud.radar(this.shot, Math.min(st, tEnd), this.fielders.list);

    if (!this.outcomeShown && st >= out.t) {
      this.outcomeShown = true;
      this.scoreBall(out);
    }
    if (this.outcomeShown && this.state === 'hit' && st > out.t + 0.2) {
      this.state = 'result';
      this.stateT = 0;
    }
  }

  placeShadow(p) {
    this.ballShadow.position.set(p.x, 0.02, p.z);
    const s = Math.max(0.4, 1 - p.y / 25);
    this.ballShadow.scale.set(s, s, s);
  }

  scoreBall(out) {
    const sc = this.score;
    sc.balls += 1;
    const info = this.shotInfo && this.shot ? this.shotInfo : null;
    const sub = info ? `${info.name} · ${info.timing}` : '';
    let code;
    switch (out.type) {
      case 'six':
        sc.runs += 6;
        sc.sixes += 1;
        code = '6';
        this.hud.result('six', 'SIX!', sub);
        this.audio.cheer(1);
        this.umpireSignal = 'six';
        break;
      case 'four':
        sc.runs += 4;
        sc.fours += 1;
        code = '4';
        this.hud.result('four', 'FOUR!', sub);
        this.audio.cheer(0.75);
        this.umpireSignal = 'four';
        break;
      case 'caught':
        sc.wkts += 1;
        code = 'W';
        this.hud.result('out', 'CAUGHT!', out.fielder ? `by ${out.fielder.name}` : 'caught and bowled');
        this.audio.groan();
        this.umpireSignal = 'out';
        this.fielders.celebrate(out.fielder);
        break;
      case 'bowled':
        sc.wkts += 1;
        code = 'W';
        this.hud.result('out', 'BOWLED!', 'Watch the line');
        this.audio.groan();
        this.umpireSignal = 'out';
        this.state = 'result';
        this.stateT = -0.4;
        break;
      case 'dot':
        code = '•';
        this.hud.result('dot', out.label || 'DOT BALL', '');
        this.state = 'result';
        this.stateT = 0.4;
        break;
      default: {
        sc.runs += out.runs;
        code = out.runs ? String(out.runs) : '•';
        const big = out.runs === 0 ? 'DOT BALL' : `${out.runs} RUN${out.runs > 1 ? 'S' : ''}`;
        this.hud.result(out.runs ? 'runs' : 'dot', out.dropped ? `DROPPED! ${big}` : big, sub);
        if (out.runs >= 2) this.audio.cheer(0.35);
      }
    }
    sc.last.push(code);
    if (sc.last.length > 6) sc.last.shift();
    this.hud.score(sc);
    this.missResolved = true;
  }

  animateStumps(dt) {
    if (!this.stumpsHit) return;
    const h = this.stumpsHit;
    h.t += dt;
    const { stumps, bails } = this.strikerStumps.userData;
    const k = Math.min(1, h.t / 0.35);
    stumps[1].rotation.x = -0.5 * k;
    stumps[0].rotation.z = 0.25 * k;
    stumps[2].rotation.z = -0.3 * k;
    bails.forEach((b, i) => {
      b.position.set((i ? 1 : -1) * (0.054 + h.t * 0.8), 0.715 + h.t * 2.2 - 4.9 * h.t * h.t, h.t * 1.5);
      b.position.y = Math.max(0.01, b.position.y);
      b.rotation.x += dt * 12;
    });
  }

  updateCamera(dt) {
    const cam = this.camera;
    cam.position.copy(this.camPos);
    let yawT = 0;
    let pitchT = -0.06;
    if (this.state === 'hit' || (this.state === 'result' && this.shot)) {
      const p = this.ball.position;
      const dx = p.x - cam.position.x;
      const dz = p.z - cam.position.z;
      const dy = p.y - cam.position.y;
      yawT = Math.atan2(-dx, -dz);
      pitchT = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.9);
    } else if (this.stumpsHit) {
      // Glance back at the broken wicket.
      const dx = -cam.position.x;
      const dz = -cam.position.z;
      yawT = Math.atan2(-dx, -dz);
      pitchT = Math.atan2(0.45 - cam.position.y, Math.hypot(dx, dz));
    }
    const k = 1 - Math.exp(-dt * (this.state === 'hit' ? 5 : 3.5));
    this.yaw = angleLerp(this.yaw, yawT, k);
    this.pitch += (pitchT - this.pitch) * k;
    // Subtle breathing sway keeps the first-person view alive.
    const sway = Math.sin(this.clockT * 1.3) * 0.004;
    cam.rotation.set(this.pitch + sway, this.yaw, 0, 'YXZ');
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
