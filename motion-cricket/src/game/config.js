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

// Contact timing (seconds). The ball is hit when the bat touches it; e is
// when that happened compared with the ball reaching the batter
// (<0 early, out in front; >0 late, beside the batter).
export const TIMING = {
  lead: 0.08, // default camera delay the bat is drawn ahead to make up (settings)
  // The bat can touch the ball only while it's near the batter (about a
  // metre and a half either side of the hitting point at slow pace).
  early: 0.08, // out in front
  late: 0.04, // and just after it reaches the batter
  perfect: 0.02,
  good: 0.045,
};

export function standHeight(rFromCenter) {
  // Height of the stand surface at a distance from the middle of the ground.
  if (rFromCenter < STAND_RADIUS) return 0;
  if (rFromCenter < STAND_RADIUS + 16) return 2.2 + (rFromCenter - STAND_RADIUS) * 0.49;
  if (rFromCenter < STAND_RADIUS + 18) return 11.2;
  return 11.6 + (rFromCenter - STAND_RADIUS - 18) * 0.52;
}
