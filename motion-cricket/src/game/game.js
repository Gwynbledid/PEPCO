import * as THREE from 'three';
import { BallView } from './ball.js';
import { Batter } from './batter.js';
import { Bowler, Fielders, NonStriker, Umpire } from './cast.js';
import { BALL_RADIUS, CAMERA_PITCH, CONTACT_Z, EYE, FIELD_CENTER, TIMING } from './config.js';
import { pointToSegment, sweptTouch } from './batContact.js';
import { buildCrowd } from './crowd.js';
import { buildField } from './field.js';
import { FirstPersonRig } from './fpRig.js';
import { resolveOutcome } from './outcome.js';
import { BatPose } from './batPose.js';
import { buildDelivery, launchVelocity, planDelivery, shotDistance, shotPos, simulateShot } from './physics.js';
import { shotFromSwing } from './shots.js';
import { buildSky } from './sky.js';
import { buildStadium } from './stadium.js';
import { buildStumps } from './stumps.js';
import { World } from './world.js';

// The match: bowler runs in, the ball comes down, and if the bat (drawn
// where the player's stick is) touches the ball, it's hit: where and when it
// touched decide the timing, and how the bat was moving decides the shot.
// The shot then plays out with fielders,
// boundaries, catches and a cinematic replay for sixes.

const DEG = Math.PI / 180;
const angleLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const smooth = (t) => t * t * (3 - 2 * t);

export class Game {
  constructor({ canvas, input, audio, hud, assets, settings, quality }) {
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.assets = assets;
    this.world = new World(canvas, quality);
    const { scene, camera } = this.world;
    this.scene = scene;
    this.camera = camera;

    buildSky(scene, assets, { quality });
    this.field = buildField(scene, assets, { quality });
    this.stadium = buildStadium(scene, assets, { quality });
    this.crowd = quality.crowd > 0 ? buildCrowd(scene, { density: quality.crowd }) : null;
    this.stumps = buildStumps(scene, 0);
    buildStumps(scene, -20.12);

    this.ball = new BallView(scene);
    this.bowler = new Bowler(scene, this.ball.mesh);
    this.fielders = new Fielders(scene);
    this.umpire = new Umpire(scene);
    this.nonStriker = new NonStriker(scene, assets);
    this.batter = new Batter(scene, { name: settings.name, number: settings.number, assets });
    this.rig = new FirstPersonRig(camera, assets);
    this.batPose = new BatPose();
    // Learned timing correction (camera and screen delay differ per device).

    this.mode = 'menu';
    this.state = 'idle';
    this.simT = 0;
    this.timeScale = 1;
    this.cam = { yaw: 0, pitch: CAMERA_PITCH };
    this.best = { longestSix: 0, highScore: 0 };
    this.onRecord = null;
    this.resetScore();
    this.applySettings(settings);
  }

  applySettings(settings) {
    this.settings = settings;
    this.hand = settings.hand === 'L' ? -1 : 1;
    this.fielders.setHand(this.hand);
    this.bowler.setHand(this.hand);
    this.rig.setHand(this.hand);
    this.batPose.setLead(settings.batLead);
    this.batter.setJersey(settings.name || 'YOU', settings.number || '18');
    this.batterSpot = new THREE.Vector3(-0.32 * this.hand, 0, -1.05);
    this.batter.place(this.batterSpot, this.hand);
  }

  resetScore() {
    this.score = { runs: 0, wkts: 0, balls: 0, fours: 0, sixes: 0, over: [] };
    this.hud.score(this.score);
  }

  resize() {
    this.world.resize();
  }

  // ---------------------------------------------------------------------
  // Modes

  showMenu() {
    this.mode = 'menu';
    this.state = 'idle';
    this.rig.show(false);
    this.ball.show(false);
    this.batter.show(true);
    this.batter.setPose('backlift');
    this.nonStriker.c.root.visible = true;
    this.bowler.reset();
    this.fielders.reset();
    this.hud.show(false);
    this.timeScale = 1;
    this.world.post?.setFocus(8, 60, 5);
  }

  startInnings() {
    this.resetScore();
    this.resume();
  }

  /** Back to first-person play (also after a recalibration mid-innings). */
  resume() {
    this.mode = 'play';
    this.batter.show(false);
    this.rig.show(true);
    this.hud.show(true);
    this.hud.score(this.score);
    this.nextBall(true);
  }

  nextBall(first = false) {
    this.state = 'ready';
    this.stateT = first ? -0.8 : 0;
    this.readyFor = 0;
    this.delivery = null;
    this.hit = null;
    this.decided = false;
    this.swung = false;
    this.prevTouch = null;
    this.hitPoint = null;
    this.resolved = false;
    this.timeScale = 1;
    this.camMode = 'fp';
    this.ball.show(false);
    this.bowler.reset();
    this.fielders.reset();
    this.umpire.signal = null;
    this.batter.show(false);
    this.rig.show(true);
    this.rig.assist(null, 0);
    this.batPose.reset();
    this.resetStumps();
    this.hud.clearResult();
    this.hud.sixMeter(null);
    this.cam.yaw = 0;
    this.cam.pitch = CAMERA_PITCH;
    this.world.setFov(null);
    this.world.post?.setFocus(45, 110, 3.5);
  }

  resetStumps() {
    this.stumps.userData.reset();
    this.stumpsHit = null;
  }

  // ---------------------------------------------------------------------
  // Frame update

  /**
   * @param {number} dt real seconds since the last frame
   * @param {number} now game clock (seconds, excluding pauses)
   * @param {(t:number)=>number} toGame converts input-clock times to the game clock
   */
  update(dt, now, toGame) {
    this.now = now;
    this.toGame = toGame;
    const sdt = dt * this.timeScale;
    this.simT += sdt;
    this.stateT = (this.stateT ?? 0) + dt;

    if (this.mode === 'menu') this._menu(dt, now);
    else this._play(dt, sdt, now);

    this.crowd?.update(this.simT, sdt);
    this.stadium.flags.update(this.simT);
    this.field.children.forEach((c) => c.userData.animate?.(this.simT));
    this.ball.update(sdt);
    this._animateStumps(sdt);
  }

  render(dt) {
    this.world.render(dt);
  }

  _menu(dt, now) {
    // The reference shot: low behind the batter, bat raised, the stands and
    // big sky behind.
    const h = this.hand;
    const drift = Math.sin(now * 0.12) * 0.35;
    const b = this.batterSpot;
    if (this.camera.aspect >= 1) {
      this.camera.position.set(b.x - 2.1 * h + drift * 0.3, 0.32 + Math.sin(now * 0.2) * 0.04, b.z + 1.6 + drift);
      this.camera.lookAt(b.x + 1.4 * h, 1.55, b.z - 4.2);
      this.world.setFov(50);
    } else {
      // Portrait: the batter fills the lower half, sky and floodlights above.
      this.camera.position.set(b.x - 2.6 * h + drift * 0.2, 0.3, b.z + 2.2 + drift * 0.5);
      this.camera.lookAt(b.x + 0.25 * h, 0.6, b.z - 1.2);
      this.world.setFov(80);
    }
    this.batter.setPose('stance', 'backlift', 0.85 + Math.sin(now * 0.9) * 0.15);
    this.bowler.update(dt, now);
    this.fielders.update(dt, now, 0);
    this.umpire.update(now);
    this.nonStriker.update(now);
  }

  _play(dt, sdt, now) {
    const inp = this.input.state;
    const glow = this.input.detector.speed / Math.max(1, this.input.detector.ref) - 0.25;
    if (this.camMode === 'fp') {
      const incoming = this.state === 'runup' || (this.state === 'bowled' && now < this.releaseT + this.delivery.tContact - 0.3);
      const age = this.settings.input === 'touch' ? 0 : now - this.toGame(inp.t);
      this.rig.update(this.batPose.update(inp, age), glow, incoming);
    }

    switch (this.state) {
      case 'ready':
        this._ready(dt, now);
        break;
      case 'runup':
        this._runup(dt, now);
        break;
      case 'bowled':
        this._bowled(dt, now);
        break;
      case 'hit':
        this._flight(dt, sdt, now);
        break;
      case 'dead':
        if (this.delivery && !this.hit && !this.stumpsHit) this._missedBall(now);
        if (this.stateT > this.deadHold) {
          this.hud.fade();
          this.state = 'fading';
          this.stateT = 0;
        }
        break;
      case 'fading':
        if (this.stateT > 0.32) this.nextBall();
        break;
      default:
        break;
    }
    if (this.state !== 'runup' && this.state !== 'bowled' && this.state !== 'ready') this.bowler.update(sdt, now);
    this.fielders.update(sdt, this.simT, this.hit ? this.simT - this.hit.simT0 : 0);
    this.umpire.update(this.simT);
    this.nonStriker.update(this.simT);
    this._camera(dt);
  }

  _ready(dt, now) {
    const touch = this.settings.input === 'touch';
    const tracked = touch || this.input.state.tracked;
    this.bowler.update(dt, now);
    if (!tracked) {
      this.readyFor = 0;
      this.hud.hint(this.settings.input === 'stick' ? 'Show your hands and the stick to the camera' : 'Show both hands to the camera');
      return;
    }
    this.hud.hint(null);
    this.readyFor += dt;
    if (this.readyFor > 0.5 && this.stateT > 1.0) {
      this.state = 'runup';
      this.stateT = 0;
      this.bowler.startRunUp();
      this.plan = planDelivery(this.settings.pace, this.hand);
    }
  }

  _runup(dt, now) {
    const release = this.bowler.update(dt, now);
    if (!release) return;
    this.delivery = buildDelivery(release, this.plan);
    this.releaseT = now;
    this.pitched = false;
    this.state = 'bowled';
    this.stateT = 0;
    this.ball.show(true);
    this.ball.spinFrom({ x: 0, z: 1 });
    this.audio.release();
    this.hud.speed(Math.round(this.plan.speed * 3.6));
    this.input.detector.strokes.length = 0;
  }

  _bowled(dt, now) {
    const d = this.delivery;
    const t = now - this.releaseT;
    const p = d.posAt(t);
    this.ball.setPosition(p, dt);
    if (!this.pitched && t >= d.tBounce) {
      this.pitched = true;
      this.ball.dust(d.bounce);
      this.audio.pitch();
    }
    const T = this.releaseT + (this.hitPoint || this._findHitPoint()).t;
    if (!this.decided && this.camMode === 'fp') {
      const touch = this._touch(now, T);
      if (touch && this._contact(touch, now)) return;
      if (now > T + TIMING.late) {
        this.decided = true;
        if (this.swung) this.hud.toast('Missed it!');
      }
    }
    if (t >= d.tStumps && !this.resolved) this._missed();
  }

  /**
   * Is the bat touching the ball? The ball is met at the hitting point: where
   * it reaches the batter. The bat hits it by moving through that point
   * within TIMING.early before the ball gets there to TIMING.late after (out
   * in front, or beside the batter), or by being there when it arrives (a
   * block). Tested on screen, where the player sees the bat and the ball.
   */
  /**
   * Where and when the ball is there to be hit: as it reaches the batter,
   * or a little before for a low ball that would by then be below the
   * bottom of the screen, so it's always met where the player can see it.
   */
  _findHitPoint() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const d = this.delivery;
    let t = d.tContact;
    let c;
    let q;
    for (;;) {
      const p = d.posAt(t);
      c = cam.worldToLocal(new THREE.Vector3(p.x, p.y, p.z));
      q = c.clone().applyMatrix4(cam.projectionMatrix);
      if (q.y >= -0.8 || t <= d.tContact - 0.1) break;
      t -= 0.005;
    }
    // Touching: within a ball's radius plus half the blade's width (more
    // with easy contact), at the hitting point's distance.
    const reach = BALL_RADIUS + 0.054 + (this.settings.easyContact ? 0.09 : 0.035);
    this.hitPoint = { t, x: q.x * cam.aspect, y: q.y, radius: reach / (Math.max(0.3, -c.z) * Math.tan((cam.fov * DEG) / 2)) };
    return this.hitPoint;
  }

  _touch(now, T) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const hp = this.hitPoint || this._findHitPoint();
    const line = this.rig.line();
    const toScreen = (v) => {
      const q = v.clone().applyMatrix4(cam.projectionMatrix);
      return { x: q.x * cam.aspect, y: q.y };
    };
    const cur = { top: toScreen(line.top), toe: toScreen(line.toe), now };
    const here = pointToSegment(hp, cur.top, cur.toe);
    cur.dist = here.dist;
    const prev = this.prevTouch;
    this.prevTouch = cur;
    if (now < T - TIMING.early) return null;
    const det = this.input.detector;
    if (det.speed > det.vOn * 1.5) this.swung = true;
    const where = (u, dist, t) => ({ t, e: t - T, v: (u - line.shoulder) / (1 - line.shoulder), off: dist / hp.radius });
    // The middle of the ball: the bat swept through it this frame.
    const core = hp.radius * 0.4;
    if (prev && prev.dist > core) {
      const hit = sweptTouch(prev, cur, hp, hp, core);
      if (hit) return where(hit.u, 0, prev.now + (now - prev.now) * hit.k);
    }
    // Just caught it: came within reach and went away again without meeting it properly.
    if (prev && prev.dist <= hp.radius && cur.dist > hp.radius && prev.now >= T - TIMING.early) {
      const r = pointToSegment(hp, prev.top, prev.toe);
      return where(r.u, r.dist, prev.now);
    }
    // Held there when the ball arrives: it hits the bat. (A bat still
    // moving in is left to meet it properly next frame.)
    const settled = !prev || Math.abs(prev.dist - cur.dist) < core * 0.5;
    if (cur.dist <= hp.radius && now >= T && settled) return where(here.u, here.dist, T);
    return null;
  }

  /** The bat touched the ball. */
  _contact(touch, now) {
    const d = this.delivery;
    const origin = d.posAt(touch.t - this.releaseT);
    const easy = this.settings.easyContact;
    // Off the middle of the blade: the handle, the shoulder, the toe, or
    // only just catching it.
    const edge = touch.v < (easy ? 0.02 : 0.12) || touch.v > 0.98 || touch.off > (easy ? 0.8 : 0.6);
    const contact = edge ? 'edge' : 'middle';
    this.decided = true;
    this.hit = {
      simT0: this.simT,
      launched: now,
      origin: { x: origin.x, y: Math.max(0.15, origin.y), z: origin.z },
      contact,
      outcome: null,
      revealed: false,
      prev: null,
      blendFrom: 0,
    };
    // The shot goes the way the bat was moving when it touched the ball.
    const det = this.input.detector;
    const cur = det.current();
    const info = shotFromSwing({
      vx: det.vx,
      vy: det.vy,
      peak: Math.max(det.speed, cur ? cur.peak * 0.9 : 0),
      ref: this.input.calib.ref,
      e: touch.e,
      hand: this.hand,
      contact,
    });
    const h = this.hit;
    h.info = info;
    h.e = touch.e;
    h.flight = simulateShot(h.origin, launchVelocity(info.azimuth, info.elevation, info.speed));
    this.ball.spinFrom(launchVelocity(info.azimuth, 0, 1));
    this.state = 'hit';
    this.stateT = 0;
    this.audio.hit(info.power, info.quality, contact === 'edge');
    this.hud.flash();
    // Let the bat visibly meet the ball.
    const local = this.camera.worldToLocal(new THREE.Vector3(origin.x, origin.y, origin.z));
    this.rig.assist(local, 0.5);
    this.assistT = now;
    return true;
  }

  _flight(dt, sdt, now) {
    const h = this.hit;
    const st = this.simT - h.simT0;
    if (!h.outcome) this._finalize();

    // Ball position, blending from the provisional path to the final one.
    let p = shotPos(h.flight, st);
    if (h.prev) {
      const k = smooth(Math.min(1, (st - h.blendFrom) / 0.12));
      const q = shotPos(h.prev, st);
      p = { x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k, z: q.z + (p.z - q.z) * k };
      if (k >= 1) h.prev = null;
    }
    const o = h.outcome;
    if (o && o.type === 'caught' && st >= o.t) {
      // In the catcher's hands (the bowler, for a caught-and-bowled).
      const catcher = o.fielder?.ref?.c ?? this.bowler.c;
      const hand = new THREE.Vector3();
      catcher.armR.wrist.getWorldPosition(hand);
      p = hand;
    }
    this.ball.setPosition(p, sdt);

    // Contact assist fades out.
    const a = Math.max(0, 0.5 - (now - this.assistT) / 0.2);
    this.rig.assist(a > 0 ? this.rig.assistTarget : null, a);

    if (h.info.loft && !h.info.defensive) {
      if (!h.revealed) {
        this.hud.sixMeter({ distance: shotDistance(h.flight, Math.min(st, h.flight.duration)), best: this.best.longestSix });
      } else if (h.sixShown !== undefined) {
        // After a six: count up to its full (projected) distance.
        h.sixShown = Math.min(h.sixFinal, h.sixShown + dt * 60);
        this.hud.sixMeter({ distance: h.sixShown, best: h.bestBefore, final: true });
      }
    }
    this.hud.radar(h.flight, Math.min(st, h.flight.duration), this.fielders.list);

    if (o && !h.revealed && st >= o.t) {
      h.revealed = true;
      this._score(o);
    }
    const end = o ? Math.max(o.t, o.type === 'six' ? h.flight.duration : o.t) : Infinity;
    if (o && h.revealed && st > end + 0.25) {
      this.state = 'dead';
      this.stateT = 0;
      this.deadHold = o.type === 'six' ? 2.2 : 1.9;
    }
    if (this.camMode === 'six') this._sixCamera(dt, st);
  }

  _finalize() {
    const h = this.hit;
    const o = resolveOutcome(h.flight, [
      ...this.fielders.plan(),
      { name: 'Bowler', pos: { x: this.bowler.fieldPos.x, z: this.bowler.fieldPos.z }, speed: 4.5, reaction: 0.55 },
    ]);
    h.outcome = o;
    if (o.fielder?.ref) this.fielders.chase(o.fielder.ref, o.point, o.t, h.flight, o.type === 'caught');
    if (o.type === 'six') {
      // Cut to the cinematic replay, like the reference: low behind the batter.
      this.camMode = 'six';
      this.sixT = 0;
      this.rig.show(false);
      this.batter.show(true);
      const az = h.info.azimuth * DEG;
      this.batter.setPose('backlift', 'followHigh', 1, -az * this.hand * 0.6);
      this.world.post?.setFocus(4, 40, 6);
      this.timeScale = 0.45;
      const dir = launchVelocity(h.info.azimuth, 0, 1);
      this.crowd?.cheer(1, dir);
    } else if (o.type === 'four') {
      this.crowd?.cheer(0.6, launchVelocity(h.info.azimuth, 0, 1));
    }
  }

  _sixCamera(dt, st) {
    this.sixT += dt;
    // Ease out of slow motion after the first moment.
    this.timeScale = this.sixT < 1.3 ? 0.45 : Math.min(1, this.timeScale + dt * 0.8);
    const b = this.batterSpot;
    const h = this.hand;
    const ball = this.ball.mesh.position;
    const az = this.hit.info.azimuth * DEG;
    // Behind the batter, low, on the far side from the shot; rises slowly.
    const back = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const side = new THREE.Vector3(-back.z, 0, back.x).multiplyScalar(-h);
    const k = Math.min(1, this.sixT / 3);
    const pos = b.clone().addScaledVector(back, 2.6 + k * 1.2).addScaledVector(side, 1.1);
    pos.y = 0.35 + k * 0.9;
    this.camera.position.lerp(pos, this.sixT < 0.05 ? 1 : 0.08);
    const look = new THREE.Vector3(b.x, 1.6, b.z).lerp(ball, 0.35 + 0.45 * k);
    look.y = Math.max(1.4, look.y);
    this.camera.lookAt(look);
    this.world.setFov(this.camera.aspect >= 1 ? 52 : 68);
  }

  _missedBall(now) {
    const p = this.delivery.posAt(now - this.releaseT);
    if (p.z > 12) {
      this.ball.show(false);
      return;
    }
    this.ball.setPosition(p, 0.016);
  }

  _missed() {
    this.resolved = true;
    const d = this.delivery;
    if (d.hitsStumps) {
      this.stumpsHit = { t: 0, vx: d.velAt(d.tStumps).x * 0.1 };
      this.ball.show(false);
      this.audio.stumps();
      this._score({ type: 'bowled' });
    } else {
      this._score({ type: 'dot', label: this.swung ? 'BEATEN!' : 'LEFT ALONE' });
    }
    this.state = 'dead';
    this.stateT = 0;
    this.deadHold = d.hitsStumps ? 2.2 : 1.2;
  }

  _score(o) {
    const sc = this.score;
    sc.balls += 1;
    const info = this.hit?.info;
    const sub = info ? `${info.name} · ${info.timing}` : '';
    let code = '•';
    switch (o.type) {
      case 'six': {
        sc.runs += 6;
        sc.sixes += 1;
        code = '6';
        const carry = Math.round(this.hit.flight.carry);
        this.hud.result('six', 'SIX!', `${sub} · ${carry} m`);
        this.hit.bestBefore = this.best.longestSix;
        this.hit.sixFinal = carry;
        this.hit.sixShown = Math.min(carry, shotDistance(this.hit.flight, this.simT - this.hit.simT0));
        if (carry > this.best.longestSix) {
          this.best.longestSix = carry;
          this.onRecord?.('longestSix', carry);
        }
        this.audio.six();
        this.umpire.signal = 'six';
        break;
      }
      case 'four':
        sc.runs += 4;
        sc.fours += 1;
        code = '4';
        this.hud.result('four', 'FOUR!', sub);
        this.hud.sixMeter(null);
        this.audio.four();
        this.umpire.signal = 'four';
        break;
      case 'caught':
        sc.wkts += 1;
        code = 'W';
        this.hud.result('out', 'CAUGHT!', o.fielder ? `by ${o.fielder.name}` : 'caught and bowled');
        this.hud.sixMeter(null);
        this.audio.wicket();
        this.umpire.signal = 'out';
        this.fielders.celebrate(o.fielder?.ref);
        break;
      case 'bowled':
        sc.wkts += 1;
        code = 'W';
        this.hud.result('out', 'BOWLED!', 'Watch the line');
        this.audio.wicket();
        this.umpire.signal = 'out';
        break;
      case 'dot':
        this.hud.result('dot', o.label || 'DOT BALL', '');
        this.audio.dot();
        break;
      default: {
        sc.runs += o.runs;
        code = o.runs ? String(o.runs) : '•';
        const big = o.runs === 0 ? 'DOT BALL' : `${o.runs} RUN${o.runs > 1 ? 'S' : ''}`;
        this.hud.result(o.runs ? 'runs' : 'dot', o.dropped ? `DROPPED! ${big}` : big, sub);
        this.hud.sixMeter(null);
        if (o.runs) this.audio.runs(o.runs);
        else this.audio.dot();
      }
    }
    sc.over.push(code);
    if (sc.balls % 6 === 0) {
      this.hud.overDone(sc);
      sc.over = [];
    }
    if (sc.runs > this.best.highScore) {
      this.best.highScore = sc.runs;
      this.onRecord?.('highScore', sc.runs);
    }
    this.hud.score(sc);
  }

  _animateStumps(dt) {
    const h = this.stumpsHit;
    if (!h) return;
    h.t += dt;
    this.stumps.userData.knock(h.t, h.vx);
  }

  _camera(dt) {
    if (this.camMode === 'six') return;
    const cam = this.camera;
    cam.position.set(EYE.x * this.hand, EYE.y, EYE.z);
    let yawT = 0;
    let pitchT = CAMERA_PITCH;
    if (this.state === 'hit' || (this.state === 'dead' && this.hit)) {
      const p = this.ball.mesh.position;
      const dx = p.x - cam.position.x;
      const dz = p.z - cam.position.z;
      yawT = Math.atan2(-dx, -dz);
      pitchT = THREE.MathUtils.clamp(Math.atan2(p.y - cam.position.y, Math.hypot(dx, dz)), -0.45, 0.85);
    } else if (this.stumpsHit) {
      yawT = Math.atan2(cam.position.x, cam.position.z) + Math.PI;
      pitchT = -0.55;
    }
    const k = 1 - Math.exp(-dt * (this.state === 'hit' ? 5 : 3.2));
    this.cam.yaw = angleLerp(this.cam.yaw, yawT, k);
    this.cam.pitch += (pitchT - this.cam.pitch) * k;
    const sway = Math.sin(this.now * 1.3) * 0.004;
    cam.rotation.set(this.cam.pitch + sway, this.cam.yaw, 0, 'YXZ');
  }
}

export { CONTACT_Z, FIELD_CENTER };
