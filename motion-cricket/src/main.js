import '@fontsource/lilita-one/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './style.css';

import { ZenAudio } from './audio/zen.js';
import { loadAssets } from './game/assets.js';
import { TIMING } from './game/config.js';
import { Game } from './game/game.js';
import { pickQuality } from './game/world.js';
import { BatInput, CALIBRATION_VERSION, defaultCalibration } from './tracking/batInput.js';
import { startCamera } from './tracking/camera.js';
import { FrameGrabber } from './tracking/frameGrabber.js';
import { HandTracker } from './tracking/handTracker.js';
import { Calibration } from './ui/calibration.js';
import { Hud } from './ui/hud.js';
import { drawTracking, fitCanvas } from './ui/overlay.js';

const $ = (id) => document.getElementById(id);

// ---------- Settings and records (per device) ----------
const DEFAULTS = {
  input: 'stick',
  hand: 'R',
  pace: 'slow',
  batLead: TIMING.lead * 1000,
  quality: 'auto',
  fxVolume: 80,
  ambientVolume: 55,
  chimes: true,
  easyContact: true,
  showCam: true,
  name: 'YOU',
  number: '18',
};
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
      /* private mode: nothing persists */
    }
  },
};
const settings = { ...DEFAULTS, ...store.get('mc.settings', {}) };
const records = { longestSix: 0, highScore: 0, ...store.get('mc.records', {}) };
const calibKey = (mode) => `mc.calib.v${CALIBRATION_VERSION}.${mode}`;
const savedCalib = (mode) => {
  const c = store.get(calibKey(mode), null);
  return c && c.version === CALIBRATION_VERSION ? c : null;
};

// ---------- Core objects ----------
const audio = new ZenAudio();
const applyAudio = () =>
  audio.setLevels({ fx: settings.fxVolume / 100, ambient: settings.ambientVolume / 100, chimes: settings.chimes });
applyAudio();
const hud = new Hud();
const input = new BatInput();
const hands = new HandTracker();
const grabber = new FrameGrabber(448);
const video = $('cam');
let cameraReady = false;

const assets = await loadAssets();
if (assets.logo) {
  $('logoImg').src = assets.logo.src;
  $('logoImg').hidden = false;
  $('logoText').hidden = true;
}
const quality = pickQuality(settings.quality);
const game = new Game({ canvas: $('scene'), input, audio, hud, assets, settings, quality });
game.best = { ...records };
game.onRecord = (key, value) => {
  records[key] = value;
  store.set('mc.records', records);
  updateMenuLines();
};
const calibration = new Calibration({ input, audio });
game.showMenu();

// ---------- Screens ----------
const SCREENS = ['menu', 'settings', 'help', 'calib', 'pause', 'loading'];
let returnTo = 'menu';
const show = (id) => SCREENS.forEach((s) => ($(s).hidden = s !== id));
const hideScreens = () => SCREENS.forEach((s) => ($(s).hidden = true));

function updateMenuLines() {
  const names = { stick: 'Stick tracking', hands: 'Hand tracking', touch: 'Touch / mouse' };
  const cal = settings.input !== 'touch' && savedCalib(settings.input) ? ' · calibrated ✓' : '';
  $('modeLine').textContent = `${names[settings.input]} · ${settings.hand === 'R' ? 'Right' : 'Left'}-handed · ${settings.pace} pace${cal}`;
  const parts = [];
  if (records.longestSix) parts.push(`Longest six ${records.longestSix} m`);
  if (records.highScore) parts.push(`Best score ${records.highScore}`);
  $('records').textContent = parts.join(' · ');
  $('sbTeam').textContent = (settings.name || 'YOU').toUpperCase();
}
updateMenuLines();

// ---------- Clock and loop ----------
let mode = 'menu'; // menu | calib | play
let paused = false;
let pausedTotal = 0;
let last = performance.now();
const toGame = (t) => t - pausedTotal;

/** One camera frame: hand landmarks, the stick, then the swing detector. */
function onCameraFrame() {
  if (!cameraReady || settings.input === 'touch' || (mode !== 'calib' && mode !== 'play')) return;
  const nowMs = performance.now();
  const landmarks = hands.detect(video, nowMs) || [];
  const frame = grabber.grab(video);
  if (!frame) return;
  if (mode === 'calib' && calibration.learning) calibration.learnFrame(frame, landmarks);
  else input.processCamera(nowMs / 1000, frame, landmarks);
}

let lastVideoTime = -1;
function pollVideo() {
  // Fallback for browsers without requestVideoFrameCallback.
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    onCameraFrame();
  }
}
const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
function watchVideo() {
  if (!hasRVFC) return;
  const cb = () => {
    onCameraFrame();
    video.requestVideoFrameCallback(cb);
  };
  video.requestVideoFrameCallback(cb);
}

let manual = false; // test hook: step frames on a virtual clock
function loop(nowMs) {
  if (!manual) frame(nowMs);
  requestAnimationFrame(loop);
}

function frame(nowMs, draw = true) {
  const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
  last = nowMs;
  if (!hasRVFC) pollVideo();
  if (settings.input === 'touch' && mode === 'play') input.processPointer(nowMs / 1000);
  if (mode === 'calib') calibration.update(dt);
  if (paused) pausedTotal += dt;
  else game.update(dt, toGame(nowMs / 1000), toGame);
  if (draw) game.render(dt);
  if (mode === 'play') drawPreview();
}
requestAnimationFrame(loop);

function drawPreview() {
  const dot = $('trackDot');
  const s = input.state;
  dot.className = `track-dot ${settings.input === 'touch' ? 'good' : !s.tracked ? 'lost' : s.conf >= 0.55 ? 'good' : 'weak'}`;
  if (!(settings.showCam && cameraReady && settings.input !== 'touch')) return;
  const cv = $('camOverlay');
  const { w, h } = fitCanvas(cv);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  drawTracking(ctx, w, h, input.raw, { compact: true, mode: settings.input });
}

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
    watchVideo();
    return true;
  } catch (err) {
    console.error(err);
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    $('loadingText').textContent = 'Camera unavailable';
    $('errorText').textContent = denied
      ? 'Camera permission was blocked. Allow camera access in your browser or app settings and try again.'
      : `Couldn't start the camera or hand tracking (${err?.message || err}).`;
    $('loadingError').hidden = false;
    return false;
  }
}

function applyInputMode() {
  input.mode = settings.input;
  if (settings.input === 'touch') {
    input.setCalibration({ ...defaultCalibration('touch'), ref: 70 });
    return;
  }
  input.setCalibration(savedCalib(settings.input) || defaultCalibration(settings.input));
}

// ---------- Flow ----------
async function play() {
  audio.unlock();
  requestFullscreen();
  applyInputMode();
  if (settings.input !== 'touch') {
    if (!(await ensureCamera())) return;
    if (!savedCalib(settings.input)) return startCalibration();
  }
  beginPlay(true);
}

function beginPlay(fresh) {
  mode = 'play';
  paused = false;
  hideScreens();
  const box = $('camBox');
  box.hidden = !(settings.showCam && settings.input !== 'touch');
  box.insertBefore(video, box.firstChild);
  game.applySettings(settings);
  if (fresh || game.mode !== 'play') game.startInnings();
  else game.resume();
  requestWakeLock();
}

async function startCalibration() {
  audio.unlock();
  if (settings.input === 'touch') {
    settings.input = 'stick';
    saveSettings();
  }
  input.mode = settings.input;
  input.setCalibration(defaultCalibration(settings.input));
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
  updateMenuLines();
  applyInputMode();
  beginPlay(returnTo !== 'play');
}

function toMenu() {
  mode = 'menu';
  paused = false;
  game.showMenu();
  updateMenuLines();
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
  settings.name = String(settings.name || 'YOU').toUpperCase().slice(0, 12);
  settings.number = String(settings.number || '18').replace(/[^0-9]/g, '').slice(0, 3) || '18';
  store.set('mc.settings', settings);
  applyAudio();
  game.applySettings(settings);
  renderSettings();
  updateMenuLines();
}

function renderSettings() {
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(settings[seg.dataset.key])));
  });
  document.querySelectorAll('input[data-key]').forEach((el) => {
    const v = settings[el.dataset.key];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el) el.value = v;
  });
  $('latencyVal').textContent = `${settings.batLead} ms`;
  $('inputNote').textContent = {
    stick: 'Hold any stick like a bat — a rolled newspaper, a broom handle, a toy bat. The camera finds the stick itself.',
    hands: 'No stick: hold your hands together like a grip. The bat angle is estimated from your fists.',
    touch: 'Swipe or move the mouse to swing. For trying the game without a camera.',
  }[settings.input];
  $('qualityNote').textContent =
    settings.quality === 'auto' ? `Auto picked "${quality.name}" for this device.` : 'Graphics changes apply after the game reloads.';
}

let qualityChanged = false;
document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    audio.unlock();
    audio.click();
    const key = seg.dataset.key;
    if (key === 'quality' && settings.quality !== b.dataset.v) qualityChanged = true;
    settings[key] = b.dataset.v;
    saveSettings();
  });
});
document.querySelectorAll('input[data-key]').forEach((el) => {
  const key = el.dataset.key;
  el.addEventListener(el.type === 'text' ? 'change' : 'input', () => {
    if (el.type === 'checkbox') settings[key] = el.checked;
    else if (el.type === 'range') settings[key] = Number(el.value);
    else settings[key] = el.value;
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
  if (qualityChanged) {
    location.reload();
    return;
  }
  if (returnTo !== 'pause') return show('menu');
  // Switching control scheme mid-innings may need the camera or a calibration.
  applyInputMode();
  $('camBox').hidden = !(settings.showCam && settings.input !== 'touch');
  if (settings.input !== 'touch') {
    if (!(await ensureCamera())) return;
    if (!savedCalib(settings.input)) return startCalibration();
  }
  show('pause');
});
on('resetCalBtn', () => {
  for (const m of ['stick', 'hands']) {
    try {
      localStorage.removeItem(calibKey(m));
    } catch {
      /* ignore */
    }
  }
  updateMenuLines();
  hud.toast('Calibration cleared');
});
on('calBack', () => (returnTo === 'play' ? beginPlay(false) : toMenu()));
on('calSkip', () => {
  calibration.calib = { ...defaultCalibration(settings.input), stick: input.stick.model };
  finishCalibration();
});
on('calRedo', () => calibration.start(settings.input));
on('calPlay', finishCalibration);
on('calRetryStick', () => calibration.retryStick());
on('calAcceptStick', () => calibration.acceptStick());
on('pauseBtn', pause);
on('resumeBtn', resume);
on('recalBtn', () => {
  paused = false;
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
  if (document.hidden) {
    pause();
    audio.suspend();
  } else {
    audio.resume();
  }
});

function updateRotateTip() {
  $('rotateTip').classList.toggle('show', window.innerHeight > window.innerWidth && mode === 'play');
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
// clock (for slow machines and automated tests).
window.__mc = {
  game,
  input,
  settings,
  calibration,
  step(frames = 1, { dtMs = 1000 / 60, render = true } = {}) {
    manual = true;
    for (let i = 0; i < frames; i++) frame(last + dtMs, render && i === frames - 1);
  },
  realtime() {
    manual = false;
    last = performance.now();
  },
};
