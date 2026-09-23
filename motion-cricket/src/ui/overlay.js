import { HandLandmarker } from '@mediapipe/tasks-vision';

const CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

/** Keeps a canvas' backing store matched to its on-screen size. */
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

/** Draws the tracked hands, grip, stick tip and bat line over the mirrored camera feed. */
export function drawTracking(ctx, w, h, raw, { compact = false } = {}) {
  const X = (p) => p.x * w;
  const Y = (p) => p.y * h;
  const lw = compact ? 1.5 : 3;
  for (const lm of raw.hands) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const { start, end } of CONNECTIONS) {
      ctx.moveTo(X(lm[start]), Y(lm[start]));
      ctx.lineTo(X(lm[end]), Y(lm[end]));
    }
    ctx.stroke();
    ctx.fillStyle = '#18a999';
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(X(p), Y(p), lw * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (raw.grip) {
    const gx = X(raw.grip);
    const gy = Y(raw.grip);
    let ex;
    let ey;
    if (raw.tip) {
      ex = X(raw.tip);
      ey = Y(raw.tip);
    } else {
      // raw.dir is aspect-corrected (x scaled by w/h), so scaling both
      // components by the canvas height gives pixels.
      const len = h * 0.45;
      ex = gx + raw.dir[0] * len;
      ey = gy + raw.dir[1] * len;
    }
    ctx.strokeStyle = '#ffd23f';
    ctx.lineCap = 'round';
    ctx.lineWidth = compact ? 5 : 12;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#ff6b35';
    ctx.beginPath();
    ctx.arc(gx, gy, compact ? 4 : 9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (raw.tip) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(X(raw.tip), Y(raw.tip), compact ? 6 : 14, 0, Math.PI * 2);
    ctx.stroke();
  }
}
