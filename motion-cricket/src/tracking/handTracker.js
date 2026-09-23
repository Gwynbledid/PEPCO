import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// Both the WASM runtime and the model ship inside the app (see
// scripts/setup-vision.mjs), so tracking works without a network.
const asset = (path) => new URL(path, document.baseURI).href;

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.delegate = null;
    this.lastTs = -1;
  }

  async init() {
    if (this.landmarker) return;
    const fileset = await FilesetResolver.forVisionTasks(asset('vision/wasm'));
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: asset('vision/hand_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.45,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
      this.delegate = 'GPU';
    } catch (err) {
      console.warn('GPU hand tracking unavailable, falling back to CPU', err);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
      this.delegate = 'CPU';
    }
  }

  /** Returns landmark arrays (21 points each, normalized image coords) or null. */
  detect(video, nowMs) {
    if (!this.landmarker || video.readyState < 2) return null;
    // detectForVideo needs strictly increasing timestamps.
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    return this.landmarker.detectForVideo(video, ts).landmarks;
  }
}
