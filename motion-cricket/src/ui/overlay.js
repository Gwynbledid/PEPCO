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

/**
 * Draws what the tracker sees over the mirrored camera image: the hands
 * (faint), and the stick it found, green when it's sure of it.
 */
export function drawTracking(ctx, w, h, raw, { compact = false, mode = 'stick' } = {}) {
  const X = (p) => p.x * w;
  const Y = (p) => p.y * h;
  const lw = compact ? 1.5 : 3;
  for (const lm of raw.hands) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const { start, end } of CONNECTIONS) {
      ctx.moveTo(X(lm[start]), Y(lm[start]));
      ctx.lineTo(X(lm[end]), Y(lm[end]));
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(24,169,153,0.8)';
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(X(p), Y(p), lw, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (raw.grip && raw.tip) {
    const sure = raw.conf >= 0.55;
    const color = mode !== 'stick' ? '#ffd23f' : raw.predicted ? '#9aa6b8' : sure ? '#3ee08f' : '#ffd23f';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = (compact ? 6 : 14) + 3;
    ctx.beginPath();
    ctx.moveTo(X(raw.grip), Y(raw.grip));
    ctx.lineTo(X(raw.tip), Y(raw.tip));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = compact ? 6 : 14;
    ctx.beginPath();
    ctx.moveTo(X(raw.grip), Y(raw.grip));
    ctx.lineTo(X(raw.tip), Y(raw.tip));
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(X(raw.tip), Y(raw.tip), compact ? 4 : 9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (raw.grip) {
    ctx.fillStyle = '#ff8a4c';
    ctx.beginPath();
    ctx.arc(X(raw.grip), Y(raw.grip), compact ? 4 : 8, 0, Math.PI * 2);
    ctx.fill();
  }
}
