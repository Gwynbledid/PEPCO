import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './style.css';

import { Sound } from './audio.js';
import { loadAssets } from './game/assets.js';
import { Game } from './game/game.js';
import { BatInput, DEFAULT_CALIBRATION } from './tracking/batInput.js';
import { startCamera } from './tracking/camera.js';
import { HandTracker } from './tracking/handTracker.js';
import { MarkerTracker } from './tracking/markerTracker.js';
import { Calibration } from './ui/calibration.js';
import { Hud } from './ui/hud.js';
import { drawTracking, fitCanvas } from './ui/overlay.js';

const $ = (id) => document.getElementById(id);

// ---------- Settings (persisted per device) ----------
const DEFAULTS = { input: 'hands', hand: 'R', pace: 'slow', aimAssist: true, showCam: true, sound: true };
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: settings just won't persist */
    }
  },
};
const settings = { ...DEFAULTS, ...store.get('mc.settings', {}) };
const calibKey = (mode) => `mc.calib.${mode}`;

// ---------- Core objects ----------
const audio = new Sound();
audio.setEnabled(settings.sound);
const hud = new Hud();
const input = new BatInput();
const marker = new MarkerTracker();
const hands = new HandTracker();
const video = $('cam');
let cameraReady = false;

const assets = await loadAssets();
if (assets.logo) {
  $('logoImg').src = assets.logo.src;
  $('logoImg').hidden = false;
  $('logoText').hidden = true;
}
const game = new Game({ canvas: $('scene'), input, audio, hud, assets, settings });
game.startAttract();

const calibration = new Calibration({ input, marker, audio });

// ---------- Screens ----------
const SCREENS = ['menu', 'settings', 'help', 'calib', 'pause', 'loading'];
let returnTo = 'menu';
function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
}
function hideScreens() {
  for (const s of SCREENS) $(s).hidden = true;
}

function updateModeLine() {
  const names = { hands: 'Hand tracking', stick: 'Stick tracking', touch: 'Touch / mouse' };
  const cal = settings.input !== 'touch' && store.get(calibKey(settings.input), null) ? ' · calibrated ✓' : '';
  $('modeLine').textContent = `${names[settings.input]} · ${settings.hand === 'R' ? 'Right' : 'Left'}-handed · ${settings.pace} pace${cal}`;
}
updateModeLine();

// ---------- Loop ----------
let mode = 'menu'; // menu | calib | play
let paused = false;
let pausedTotal = 0;
let last = performance.now();
let lastVideoTime = -1;

function track(nowMs) {
  if (!cameraReady || settings.input === 'touch') return;
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const landmarks = hands.detect(video, nowMs);
  const m = settings.input === 'stick' && marker.calibrated ? marker.track(video) : null;
  input.updateFromCamera(nowMs / 1000, landmarks, m, video.videoWidth / video.videoHeight);
}

let manual = false; // debug: step frames on a virtual clock (see window.__mc.step)
function loop(nowMs) {
  if (!manual) frame(nowMs);
  requestAnimationFrame(loop);
}

function frame(nowMs, draw = true) {
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  track(nowMs);
  if (settings.input === 'touch' && mode === 'play') input.updateFromPointer(nowMs / 1000);
  if (mode === 'calib') calibration.update(dt, video);

  if (paused) pausedTotal += dt;
  else game.update(dt, nowMs / 1000 - pausedTotal, (t) => t - pausedTotal);
  if (draw) game.render();

  if (mode === 'play' && settings.showCam && cameraReady && settings.input !== 'touch') {
    const cv = $('camOverlay');
    const { w, h } = fitCanvas(cv);
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    drawTracking(ctx, w, h, input.raw, { compact: true });
  }
}
requestAnimationFrame(loop);

// ---------- Camera ----------
async function ensureCamera() {
  if (cameraReady) return true;
  show('loading');
  $('loadingError').hidden = true;
  $('loadingText').textContent = 'Starting camera…';
  try {
    await startCamera(video);
    $('loadingText').textContent = 'Loading hand tracking…';
    await hands.init();
    cameraReady = true;
    const ar = `${video.videoWidth} / ${video.videoHeight}`;
    $('calStage').style.aspectRatio = ar;
    $('camBox').style.aspectRatio = ar;
    return true;
  } catch (err) {
    console.error(err);
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    $('loadingText').textContent = 'Camera unavailable';
    $('errorText').textContent = denied
      ? 'Camera permission was blocked. Allow camera access in your browser or app settings and try again.'
      : `Couldn't start the camera or tracker (${err?.message || err}).`;
    $('loadingError').hidden = false;
    return false;
  }
}

function applyInputMode() {
  input.setMode(settings.input);
  if (settings.input === 'touch') {
    input.setCalibration({ ...DEFAULT_CALIBRATION, refSpeed: 6, threshold: 2.2 });
    return;
  }
  const saved = store.get(calibKey(settings.input), null);
  input.setCalibration(saved || DEFAULT_CALIBRATION);
  if (settings.input === 'stick') marker.setTarget(saved?.marker || null);
}

// ---------- Flow ----------
async function play() {
  audio.unlock();
  requestFullscreen();
  applyInputMode();
  if (settings.input !== 'touch') {
    if (!(await ensureCamera())) return;
    if (!store.get(calibKey(settings.input), null)) {
      startCalibration();
      return;
    }
  }
  beginPlay();
}

function beginPlay() {
  mode = 'play';
  paused = false;
  hideScreens();
  const box = $('camBox');
  box.hidden = !(settings.showCam && settings.input !== 'touch');
  box.insertBefore(video, box.firstChild);
  game.applySettings(settings);
  // Coming back from a mid-innings recalibration keeps the score.
  if (game.mode !== 'play') game.startMatch();
  else game.nextBall(true);
  requestWakeLock();
}

async function startCalibration() {
  audio.unlock();
  if (settings.input === 'touch') {
    settings.input = 'hands';
    saveSettings();
  }
  input.setMode(settings.input);
  input.setCalibration(DEFAULT_CALIBRATION);
  if (settings.input === 'stick') marker.setTarget(null);
  if (!(await ensureCamera())) return;
  $('calStage').insertBefore(video, $('calStage').firstChild);
  returnTo = mode === 'play' ? 'play' : 'menu';
  mode = 'calib';
  paused = returnTo === 'play';
  show('calib');
  calibration.start(settings.input);
}

function finishCalibration() {
  store.set(calibKey(settings.input), calibration.calib);
  updateModeLine();
  applyInputMode();
  beginPlay();
}

function toMenu() {
  mode = 'menu';
  paused = false;
  game.startAttract();
  updateModeLine();
  show('menu');
}

function pause() {
  if (mode !== 'play' || paused) return;
  paused = true;
  show('pause');
}

function resume() {
  paused = false;
  hideScreens();
  input.reset();
}

// ---------- Settings UI ----------
function saveSettings() {
  store.set('mc.settings', settings);
  audio.setEnabled(settings.sound);
  game.applySettings(settings);
  renderSettings();
  updateModeLine();
}

function renderSettings() {
  document.querySelectorAll('.seg').forEach((seg) => {
    const key = seg.dataset.key;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings[key]));
  });
  document.querySelectorAll('input[type=checkbox][data-key]').forEach((cb) => {
    cb.checked = !!settings[cb.dataset.key];
  });
  $('inputNote').textContent = {
    hands: 'The camera tracks your hands. Hold them together like a bat grip.',
    stick: 'Hold a stick with a brightly coloured tip (tape, a sock or a ball). This gives the most precise bat angle.',
    touch: 'Swipe or move the mouse to swing. Good for trying the game without a camera.',
  }[settings.input];
}

document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    audio.unlock();
    audio.click();
    settings[seg.dataset.key] = b.dataset.v;
    saveSettings();
  });
});
document.querySelectorAll('input[type=checkbox][data-key]').forEach((cb) => {
  cb.addEventListener('change', () => {
    settings[cb.dataset.key] = cb.checked;
    saveSettings();
  });
});
renderSettings();

// ---------- Buttons ----------
const on = (id, fn) =>
  $(id).addEventListener('click', (e) => {
    audio.unlock();
    audio.click();
    fn(e);
  });
on('playBtn', play);
on('calibBtn', () => startCalibration());
on('settingsBtn', () => {
  returnTo = 'menu';
  show('settings');
});
on('helpBtn', () => show('help'));
on('helpDone', () => show('menu'));
on('settingsDone', async () => {
  if (returnTo !== 'pause') return show('menu');
  // Switching control scheme mid-innings may need the camera or a calibration.
  applyInputMode();
  $('camBox').hidden = !(settings.showCam && settings.input !== 'touch');
  if (settings.input !== 'touch') {
    if (!(await ensureCamera())) return;
    if (!store.get(calibKey(settings.input), null)) return startCalibration();
  }
  show('pause');
});
on('calBack', () => {
  if (returnTo === 'play') {
    beginPlay();
  } else toMenu();
});
on('calSkip', () => {
  calibration.calib = { ...DEFAULT_CALIBRATION };
  finishCalibration();
});
on('calRedo', () => calibration.start(settings.input));
on('calPlay', finishCalibration);
on('pauseBtn', pause);
on('resumeBtn', resume);
on('recalBtn', () => {
  paused = false;
  mode = 'play';
  startCalibration();
});
on('pauseSettingsBtn', () => {
  returnTo = 'pause';
  show('settings');
});
on('quitBtn', toMenu);
on('useTouchBtn', () => {
  settings.input = 'touch';
  saveSettings();
  play();
});
on('errorBack', () => (mode === 'play' ? show('pause') : toMenu()));

// ---------- Touch / mouse bat ----------
const sceneCanvas = $('scene');
function pointerTo(e) {
  const r = sceneCanvas.getBoundingClientRect();
  input.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
}
sceneCanvas.addEventListener('pointermove', (e) => {
  if (settings.input === 'touch' && mode === 'play') pointerTo(e);
});
sceneCanvas.addEventListener('pointerdown', (e) => {
  if (settings.input === 'touch' && mode === 'play') pointerTo(e);
});

// ---------- System ----------
window.addEventListener('resize', () => {
  game.resize();
  updateRotateTip();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') {
    if (paused && mode === 'play') resume();
    else pause();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function updateRotateTip() {
  const portrait = window.innerHeight > window.innerWidth;
  $('rotateTip').classList.toggle('show', portrait && mode === 'play');
}

function requestFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen && /Android|Mobile/i.test(navigator.userAgent)) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* not critical */
  }
  updateRotateTip();
}

// Test hooks: inspect state, or drive the game frame by frame on a virtual
// clock (useful on slow machines and for automated tests).
window.__mc = {
  game,
  input,
  settings,
  step(frames = 1, { dtMs = 1000 / 60, render = true } = {}) {
    manual = true;
    for (let i = 0; i < frames; i++) frame(last + dtMs, render && i === frames - 1);
  },
  realtime() {
    manual = false;
    last = performance.now();
  },
};
