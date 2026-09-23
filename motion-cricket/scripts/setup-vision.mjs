// Copies the MediaPipe WASM runtime into public/ and downloads the hand
// landmark model, so the game runs fully offline (required for the
// Play Store build, where there is no CDN to fall back on).
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'vision');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const modelPath = join(outDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

mkdirSync(outDir, { recursive: true });

if (existsSync(wasmSrc)) {
  // Only the classic (non-module) builds are loaded by FilesetResolver.
  cpSync(wasmSrc, join(outDir, 'wasm'), {
    recursive: true,
    filter: (src) => !src.includes('_module_'),
  });
  console.log('[setup-vision] copied MediaPipe wasm runtime');
} else {
  console.warn('[setup-vision] @mediapipe/tasks-vision not installed yet, skipping wasm copy');
}

if (!existsSync(modelPath)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log('[setup-vision] downloaded hand_landmarker.task');
  } catch (err) {
    console.warn(`[setup-vision] could not download the hand model (${err.message}).`);
    console.warn(`  Download it manually from ${MODEL_URL}`);
    console.warn(`  and save it as public/vision/hand_landmarker.task`);
  }
}
