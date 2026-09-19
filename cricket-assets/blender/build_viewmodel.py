"""First-person batsman viewmodel: bat, gloves, forearms, helmet grille.

In a batsman-POV game the player never sees a full character -- they see this.
It sits ~0.5 m from the near plane and is on screen every frame, so it carries
a far higher polygon and bevel budget than anything else in the scene.

Built along +Z with the toe at the origin and the handle running up, then the
object origin is moved to the bottom-hand grip point so the engine can rotate
the bat about the wrists directly.

    blade length   0.560 m      handle length  0.290 m
    blade width    0.108 m max  (Law 5 maximum)
    overall        0.850 m      (Law 5 maximum is 0.965 m)
"""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M, mat

BLADE_LEN   = 0.560
HANDLE_LEN  = 0.290
TOTAL_LEN   = BLADE_LEN + HANDLE_LEN
FACE_Y      = -0.011     # the flat hitting face sits on this plane
GRIP_BOTTOM = 0.600
GRIP_ANCHOR = 0.660      # bottom-hand grip: the viewmodel's pivot
RING_SEG    = 16


def _blade_profile(t):
    """t: 0 at the toe, 1 at the shoulders. Returns (half_width, back_y).

    The swell -- the thickest point of the back -- sits at t~0.34, which is
    the sweet spot. Getting this bulge right is what makes a bat read as a bat
    rather than a plank.
    """
    if t < 0.06:
        hw = 0.049 + 0.005 * (t / 0.06)          # rounded toe
    elif t < 0.78:
        hw = 0.054
    else:
        hw = 0.054 - 0.021 * ((t - 0.78) / 0.22)  # shoulders draw in

    if t < 0.34:
        back = 0.018 + 0.044 * (t / 0.34) ** 0.7
    elif t < 0.80:
        back = 0.062 - 0.020 * ((t - 0.34) / 0.46)
    else:
        back = 0.042 - 0.020 * ((t - 0.80) / 0.20)
    return hw, back


def build_bat(col):
    sections = []
    STEPS = 26
    for i in range(STEPS + 1):
        t = i / STEPS
        z = t * BLADE_LEN
        hw, back = _blade_profile(t)
        cy = (back + FACE_Y) * 0.5
        ry = (back - FACE_Y) * 0.5
        # squarish near the middle of the blade, rounder at toe and shoulders
        rounded = 0.30 + 0.45 * max(0.0, (abs(t - 0.45) - 0.25) / 0.30)
        sections.append(M.ring(0, cy, z, hw, ry, RING_SEG,
                               rounded=min(rounded, 0.9)))

    # splice -> handle: converge onto a round shaft
    for i in range(1, 13):
        t = i / 12
        z = BLADE_LEN + t * HANDLE_LEN
        r = 0.033 * (1 - t) + 0.0155 * t
        cy = (0.031 * (1 - t))
        sections.append(M.ring(0, cy, z, r, r * 1.05, RING_SEG,
                               rounded=0.55 + 0.45 * t))

    bat = M.loft('Bat_Blade', sections, closed_caps=True, collection=col)
    M.bevel(bat, width=0.0022, segments=2, angle_deg=28)
    M.apply_all_modifiers(bat)
    M.shade_smooth(bat, angle_deg=42)
    M.smart_uv(bat)
    mat.assign(bat, mat.willow())

    # rubber grip sleeve over the handle
    grip_sections = []
    for i in range(19):
        t = i / 18
        z = GRIP_BOTTOM + t * (TOTAL_LEN - GRIP_BOTTOM)
        base = 0.0195
        # three raised bands, the way a grip is actually rolled on
        band = 0.0016 * max(0.0, math.sin(t * math.pi * 3.0)) ** 2
        flare = 0.0022 if t > 0.94 else 0.0
        cy = 0.031 * max(0.0, 1.0 - (z - BLADE_LEN) / HANDLE_LEN) if z > BLADE_LEN else 0.031
        r = base + band + flare
        grip_sections.append(M.ring(0, cy, z, r, r * 1.05, RING_SEG, rounded=0.95))
    grip = M.loft('Bat_Grip', grip_sections, closed_caps=True, collection=col)
    M.shade_smooth(grip, angle_deg=45)
    M.smart_uv(grip)
    mat.assign(grip, mat.grip())

    obj = M.join([bat, grip], 'Bat')
    # origin at the bottom hand so the engine rotates the bat about the wrists
    M.set_origin(obj, (0, 0, GRIP_ANCHOR))
    return obj


HANDLE_R = 0.021


def handle_axis_y(z):
    """The handle's centre drifts in Y as it leaves the splice. Hands must
    follow it or they float off the bat."""
    if z <= BLADE_LEN:
        return 0.031
    return 0.031 * max(0.0, 1.0 - (z - BLADE_LEN) / HANDLE_LEN)


def build_glove(col, name, grip_z, theta_offset=0.0):
    """A batting glove, wrapped around the handle.

    The previous version swept each finger through 245 degrees, which closed
    them into concentric rings -- the whole hand read as a bedspring. Real
    fingers curl about 180 degrees and no further, and their protection is
    SEGMENTED ALONG the finger, not around it. So each finger here is a tube
    swept along a 180-degree arc whose radius pulses three times down its
    length, giving the sausage rolls of the reference kit, and the four sit
    adjacent rather than spread. A single broad back-of-hand mass then covers
    where all the roll ends meet, which is what stops the assembly reading as
    loose tubing.
    """
    parts = []
    finger_z = [grip_z + d for d in (0.0, 0.026, 0.051, 0.075)]
    # Fingers start INSIDE the back pad's angular span (which reaches ~141
    # degrees) so the two meet. At 128 a sliver of bare handle showed between
    # the knuckle pad and the finger bases.
    A0, A1 = 142.0, -52.0          # 194 degrees of curl, no more

    for i, z in enumerate(finger_z):
        cy = handle_axis_y(z)
        fr = 0.0132 - 0.0009 * i
        R = HANDLE_R + fr * 0.92
        steps = 20
        pts = M.arc_points((0, cy), z, R, A0 + theta_offset, A1 + theta_offset,
                           steps, z_drift=-0.003)
        radii = []
        for k in range(steps + 1):
            t = k / steps
            # three bulges along the finger = three protective rolls
            roll = 1.0 + 0.17 * math.sin(t * math.pi * 3.0) ** 2
            taper = 1.0 - 0.30 * t ** 1.6
            radii.append(fr * roll * taper)
        parts.append(M.tube_along_path(f'{name}_f{i}', pts, radii, 9, col))

    # Back of the hand: a FLAT, BROAD pad, not a round tube.
    #
    # A circular sweep here produced an egg stuck to the side of the bat. A
    # hand's knuckle side is wide across and shallow front-to-back, so the
    # cross-sections are ellipses -- narrow radially (away from the handle),
    # wide tangentially -- built as rings perpendicular to the handle axis,
    # which is exactly the plane M.ring() works in.
    z0, z1 = finger_z[0] - 0.021, finger_z[-1] + 0.021
    th = math.radians(186 + theta_offset)
    Rb = HANDLE_R + 0.013
    back_sections = []
    for k in range(13):
        t = k / 12
        z = z0 + (z1 - z0) * t
        cy = handle_axis_y(z)
        swell = math.sin(math.pi * t) ** 0.7
        back_sections.append(M.ring(
            Rb * math.cos(th), cy + Rb * math.sin(th), z,
            0.0135 + 0.0045 * swell,        # radial: shallow
            0.0250 + 0.0090 * swell,        # tangential: broad
            14, rounded=0.72))
    parts.append(M.loft(f'{name}_back', back_sections, closed_caps=True,
                        collection=col))

    # thumb: shorter, two rolls, crossing up and across the handle
    zt = finger_z[0] - 0.006
    cyt = handle_axis_y(zt)
    tsteps = 12
    tp = M.arc_points((0, cyt), zt, HANDLE_R + 0.012,
                      200 + theta_offset, 305 + theta_offset, tsteps,
                      z_drift=0.032)
    tr = []
    for k in range(tsteps + 1):
        t = k / tsteps
        tr.append(0.0150 * (1.0 + 0.15 * math.sin(t * math.pi * 2.0) ** 2)
                  * (1.0 - 0.28 * t))
    parts.append(M.tube_along_path(f'{name}_thumb', tp, tr, 9, col))

    # Wrist cuff. Barely flared -- the earlier cone read as a stack of discs,
    # like a bucket on the end of the arm. A batting cuff is a close wrap with
    # one strap band proud of it.
    zc = finger_z[-1] + 0.030
    cuff = M.cone(f'{name}_cuff', r1=0.0335, r2=0.0375, depth=0.056, verts=18,
                  location=(0, handle_axis_y(zc), zc + 0.020), collection=col)
    M.bevel(cuff, width=0.003, segments=2)
    M.apply_all_modifiers(cuff)
    parts.append(cuff)

    strap = M.cone(f'{name}_strap', r1=0.0385, r2=0.0395, depth=0.013,
                   verts=18, location=(0, handle_axis_y(zc), zc + 0.008),
                   collection=col)
    M.bevel(strap, width=0.0015, segments=2)
    M.apply_all_modifiers(strap)
    parts.append(strap)

    obj = M.join(parts, name)
    M.shade_smooth(obj, angle_deg=42)
    M.smart_uv(obj)
    mat.assign(obj, mat.pad_white())
    return obj


def build_forearm(col, name, wrist, outward):
    """Wrist to elbow, angling back toward the body and slightly down, so in
    POV the arms enter from the bottom of the frame."""
    pts, radii = [], []
    for k in range(11):
        t = k / 10
        pts.append((wrist[0] + outward * 0.075 * t,
                    wrist[1] + 0.250 * t,
                    wrist[2] - 0.090 * t - 0.030 * t * t))
        radii.append(0.041 + 0.016 * t ** 1.2)
    arm = M.tube_along_path(name, pts, radii, 12, col)
    M.shade_smooth(arm, angle_deg=50)
    M.smart_uv(arm)
    mat.assign(arm, mat.skin())

    sleeve_pts = pts[4:]
    n = len(sleeve_pts)
    sleeve_r = [0.057 + 0.015 * (k / (n - 1)) for k in range(n)]
    sleeve = M.tube_along_path(f'{name}_Sleeve', sleeve_pts, sleeve_r, 12, col,
                               caps=False)
    M.shade_smooth(sleeve, angle_deg=50)
    M.smart_uv(sleeve)
    mat.assign(sleeve, mat.kit_white())
    return arm, sleeve


def build_helmet_grille(col):
    """The grille the player looks through. Placed in helmet-local space --
    parent it to the camera and it frames every shot the way the real thing
    does. Keep it subtle; a heavy grille is exhausting to play behind."""
    bars = []
    # horizontal bars across the lower half of the view
    for i, z in enumerate((-0.085, -0.040, 0.005)):
        sections = []
        for k in range(17):
            t = k / 16
            a = (t - 0.5) * 2.0
            x = a * 0.135
            y = 0.205 - 0.030 * a * a          # bars bow away from the face
            sections.append(M.ring(x, y, z + 0.004 * a * a, 0.0032, 0.0032, 6,
                                   rounded=1.0))
        bars.append(M.loft(f'Grille_H{i}', sections, closed_caps=True,
                           collection=col))
    # two verticals
    for i, x in enumerate((-0.062, 0.062)):
        sections = []
        for k in range(11):
            t = k / 10
            z = -0.105 + t * 0.125
            sections.append(M.ring(x, 0.202, z, 0.0030, 0.0030, 6, rounded=1.0))
        bars.append(M.loft(f'Grille_V{i}', sections, closed_caps=True,
                           collection=col))

    obj = M.join(bars, 'HelmetGrille')
    M.shade_smooth(obj, angle_deg=50)
    M.smart_uv(obj)
    mat.assign(obj, mat.grille())
    return obj


def attach_to_camera(camera, objs, collection=None,
                     offset=(0.16, -0.13, -0.76), tilt_deg=-72.0,
                     roll_deg=-38.0, yaw_deg=14.0):
    """Parent the viewmodel to the camera so it rides the view.

    The viewmodel is authored Z-up (bat pointing up, +Y toward the player) but
    a camera looks down its own -Z with +Y up, so an empty carries the basis
    change: Rz(180) . Rx(90) maps authored +Z -> screen up and authored +Y ->
    +Z (back toward the viewer). Get this wrong and the bat points into the
    camera or out through the back of the player's head.

    `offset` is in CAMERA-LOCAL metres: +X right, +Y up, -Z forward. The
    defaults are a settled ready-stance found by rendering a sweep, not by
    reasoning about the numbers -- do the same if you retune, because the
    interaction of tilt/roll/yaw with a 26 mm lens is not intuitive.
    """
    rig = bpy.data.objects.new('ViewmodelRig', None)
    M.link(rig, collection or camera.users_collection[0])
    rig.parent = camera
    rig.location = offset
    # tilt: blade forward/back   roll: blade left/right across the view
    # yaw:  twists the bat face   -- all three matter for a believable stance
    rig.rotation_euler = (math.radians(90 + tilt_deg),
                          math.radians(roll_deg),
                          math.radians(180 + yaw_deg))
    for o in objs:
        o.parent = rig
        # deliberately NOT setting matrix_parent_inverse: we want each
        # object's authored local transform reinterpreted in rig space, not
        # its world position preserved.
    return rig


def build(col=None, include_grille=False):
    col = col or M.new_collection('Viewmodel')
    objs = [build_bat(col)]

    # right-hander: bottom (left) hand low on the handle, top (right) hand
    # above it. For a left-hander, swap the two grip heights.
    bottom_z, top_z = GRIP_BOTTOM + 0.030, GRIP_BOTTOM + 0.140
    objs.append(build_glove(col, 'Glove_Bottom', bottom_z, theta_offset=0.0))
    objs.append(build_glove(col, 'Glove_Top', top_z, theta_offset=-22.0))

    for name, grip_z, outward in (('Forearm_Bottom', bottom_z, 0.9),
                                  ('Forearm_Top', top_z, -0.7)):
        zc = grip_z + 0.072 + 0.030 + 0.045
        wrist = (0.0, handle_axis_y(zc) + 0.02, zc)
        arm, sleeve = build_forearm(col, name, wrist, outward)
        objs += [arm, sleeve]

    # NO GRILLE IN THE POV. A grille overlay is authentic but it is exhausting
    # to play behind -- it sits a few centimetres from the near plane, crosses
    # the ball's flight path, and never goes away. Real broadcast POV shots
    # omit it for the same reason. The mesh is still built by
    # build_helmet_grille() for the third-person character, which needs it.
    if include_grille:
        objs.append(build_helmet_grille(col))

    # Re-anchor everything to the grip point so the whole viewmodel is
    # authored about (0,0,0). attach_to_camera() then positions the grip
    # directly, instead of positioning a point 0.66 m below it.
    for o in objs:
        o.location = (o.location.x, o.location.y, o.location.z - GRIP_ANCHOR)
    return col, objs


if __name__ == '__main__':
    M.reset_scene()
    col, objs = build()
    total = sum(M.tri_count(o) for o in objs)
    for o in objs:
        print(f'  {o.name:22s} {M.tri_count(o):7d} tris')
    print(f'  {"TOTAL":22s} {total:7d} tris')
