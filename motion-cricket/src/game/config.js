// World layout and tuning shared by the game modules.
//
// Metres. The striker's stumps are at the origin and the bowler's at
// z = -20.12. +X is to the batter's right as they look down the pitch (the
// off side for a right-hander), +Y is up.

export const PITCH_LENGTH = 20.12;
export const FIELD_CENTER = { x: 0, y: 0, z: -PITCH_LENGTH / 2 };
export const BOUNDARY_RADIUS = 65; // from the middle of the pitch
export const BOARD_RADIUS = 67;
export const STAND_RADIUS = 72;

// First-person camera: the batter's eyes in a slightly crouched stance.
export const EYE = { x: -0.06, y: 1.38, z: -1.1 };
export const CAMERA_PITCH = -0.1; // radians, looking a little down the pitch
// Where the bat meets the ball: about a metre in front of the batter's eyes.
export const CONTACT_Z = -2.3;

export const BALL_RADIUS = 0.036;
export const G = 9.81;

// Bowling speeds (m/s) by the pace setting.
export const PACES = {
  slow: [21, 25], // ~75-90 km/h: best while learning
  medium: [26, 31], // ~95-110 km/h
  fast: [32, 37], // ~115-135 km/h
};

// Contact timing (seconds). e = (measured bat peak) - (ball at the bat + latency).
export const TIMING = {
  latency: 0.1, // camera + processing + display, default (adjustable in settings)
  early: 0.4, // a swing peaking earlier than this missed the ball
  lateWait: 0.14, // how long after the ball reaches the bat a late swing can still start
  refine: 0.2, // after a provisional hit, how long to keep refining the shot
  perfect: 0.035,
  good: 0.08,
};

export function standHeight(rFromCenter) {
  // Height of the stand surface at a distance from the middle of the ground.
  if (rFromCenter < STAND_RADIUS) return 0;
  if (rFromCenter < STAND_RADIUS + 16) return 2.2 + (rFromCenter - STAND_RADIUS) * 0.49;
  if (rFromCenter < STAND_RADIUS + 18) return 11.2;
  return 11.6 + (rFromCenter - STAND_RADIUS - 18) * 0.52;
}
