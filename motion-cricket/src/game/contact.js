import { TIMING } from './config.js';

// Did the bat meet the ball, and with what timing?
//
// The swing is judged at the moment the ball reaches the bat, not when the
// bat first moves: whatever the bat is doing as the ball arrives is the
// shot. So a backlift made before the ball arrives doesn't use up the
// swing, and the fastest movement around the ball's arrival wins.
//
// Times: the camera sees the player's movement a little late (processing)
// and the player sees the ball a little late (the screen), so a perfectly
// timed swing peaks, in measured time, at T + latency, where T is when the
// ball reaches the bat on screen.

/**
 * @param {Array} strokes  StrokeDetector strokes (finished and in progress), in game time
 * @param {object} p
 * @param {number} p.T        game time the ball reaches the bat
 * @param {number} p.latency  seconds
 * @param {number} p.now      current game time
 * @param {number} p.vOn      speed that counts as the bat moving
 * @param {number} p.onsetToPeak  the player's typical time from starting a swing to its peak
 * @returns {{stroke:object, e:number, provisional:boolean}|{early:true}|null}
 */
export function pickStroke(strokes, { T, latency, now, vOn, onsetToPeak = 0.12 }) {
  const ideal = T + latency;
  let best = null;
  let early = null;
  for (const s of strokes) {
    if (s.onset > now) continue;
    if (s.onset < ideal - 0.9) continue; // long before the ball
    if (!s.active && s.tPeak < ideal - TIMING.early) {
      if (s.valid) early = s;
      continue;
    }
    if (!s.active && s.peak < vOn) continue;
    if (!best || s.peak > best.peak) best = s;
  }
  if (!best) return early ? { early: true, e: early.tPeak - ideal } : null;
  let tPeak = best.tPeak;
  // A swing still speeding up: its peak is yet to come.
  if (best.active && now - best.tPeak < 0.04) tPeak = Math.max(best.tPeak, best.onset + onsetToPeak);
  return { stroke: best, e: tPeak - ideal, provisional: !!best.active };
}

/** Chance of an edge instead of the middle of the bat, from how mistimed the swing was. */
export function edgeChance(e) {
  return Math.min(0.85, Math.max(0, (Math.abs(e) - 0.12) / 0.12));
}
