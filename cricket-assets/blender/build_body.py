"""Batsman body: torso, arms, legs, head, and the assembled character.

Authored FACING +Y in a neutral stance, then rotated as a whole into the
side-on batting position. Building side-on directly would mean every section
straddles two axes -- width along Y, depth along X -- and every radius becomes
a guess. Build it square, pose it afterwards.

Proportions are 7.6 heads at 1.80 m, slightly stockier than life so the kit
reads at distance.

    python3 build_body.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M, mat

HEIGHT      = 1.80
Z_HIP       = 0.920
Z_SHOULDER  = 1.420
Z_HEAD      = 1.600
HEAD_R      = 0.098
HIP_X       = 0.086
SHOULDER_X  = 0.196


def build_torso(col, name='Torso'):
    """Shirt, lofted hips to shoulders, with a polo collar."""
    profile = [
        (0.880, 0.150, 0.104),
        (0.985, 0.142, 0.098),
        (1.090, 0.140, 0.098),
        (1.190, 0.162, 0.111),
        (1.290, 0.178, 0.119),
        (1.375, 0.193, 0.118),
        (1.430, 0.188, 0.112),
        (1.462, 0.146, 0.096),
    ]
    sections = [M.ring(0, 0, z, rx, ry, 20, rounded=0.90)
                for z, rx, ry in profile]
    torso = M.loft(name, sections, collection=col)
    M.shade_smooth(torso, angle_deg=55)
    M.smart_uv(torso)
    mat.assign(torso, mat.kit_white())

    # polo collar: a short flared band at the neck
    collar_sections = []
    for k in range(6):
        t = k / 5
        collar_sections.append(M.ring(0, 0.004, 1.452 + t * 0.052,
                                      0.072 + 0.022 * t,
                                      0.062 + 0.020 * t, 16, rounded=0.92))
    collar = M.loft(f'{name}_Collar', collar_sections, closed_caps=False,
                    collection=col)
    M.shade_smooth(collar, angle_deg=50)
    M.smart_uv(collar)
    mat.assign(collar, mat.kit_white())
    return M.join([torso, collar], name)


def _limb(col, name, pts, radii, segments=12):
    o = M.tube_along_path(name, pts, radii, segments, col)
    M.shade_smooth(o, angle_deg=52)
    M.smart_uv(o)
    return o


def build_legs(col):
    """Trousers, hip to ankle, with a slight knee bend."""
    parts = []
    for sgn, tag in ((-1, 'L'), (1, 'R')):
        pts = [
            (sgn * HIP_X, 0.006, Z_HIP + 0.02),
            (sgn * (HIP_X + 0.010), 0.028, 0.700),
            (sgn * (HIP_X + 0.016), 0.040, 0.500),   # knee, pushed forward
            (sgn * (HIP_X + 0.014), 0.012, 0.300),
            (sgn * (HIP_X + 0.012), 0.000, 0.105),   # ankle
        ]
        radii = [0.098, 0.082, 0.070, 0.062, 0.052]
        parts.append(_limb(col, f'Leg_{tag}', pts, radii, 14))
    legs = M.join(parts, 'Legs')
    mat.assign(legs, mat.kit_white())
    return legs


# Where the hands meet on the bat handle, in the authoring frame. Both arms
# converge here: a cricket grip stacks the hands on one vertical handle, so
# they share x and y and differ only in height. Mirroring the arms
# symmetrically instead -- which is the obvious thing to do -- leaves one hand
# half a metre from the bat.
GRIP_XY = (0.105, 0.268)
GRIP_Z_LOW = 0.985       # bottom hand
GRIP_Z_HIGH = 1.098      # top hand


def build_arms(col):
    """Upper arm and forearm as one tube each, plus a short shirt sleeve.

    Skin below the sleeve, so the sleeve is a separate shell rather than a
    material split -- cricket shirts have a visible cuff edge and a
    material-only boundary reads flat.

    Arms and sleeves start INSIDE the torso; beginning them at the shoulder
    surface left the tube's end cap visible and each sleeve read as a separate
    block stuck on the side.
    """
    gx, gy = GRIP_XY
    paths = {
        # back arm reaches across to the TOP hand
        'L': [(-(SHOULDER_X - 0.055), 0.006, Z_SHOULDER - 0.010),
              (-(SHOULDER_X + 0.010), 0.070, 1.255),
              (-0.105, 0.160, 1.150),
              (0.000, 0.232, 1.115),
              (gx - 0.012, gy - 0.004, GRIP_Z_HIGH)],
        # front arm drops to the BOTTOM hand
        'R': [((SHOULDER_X - 0.055), 0.006, Z_SHOULDER - 0.010),
              ((SHOULDER_X + 0.038), 0.068, 1.240),
              (0.196, 0.168, 1.105),
              (0.150, 0.234, 1.020),
              (gx + 0.006, gy + 0.002, GRIP_Z_LOW)],
    }
    radii = [0.062, 0.050, 0.044, 0.040, 0.037]

    arms, sleeves = [], []
    for tag, pts in paths.items():
        arms.append(_limb(col, f'Arm_{tag}', pts, radii, 12))
        sleeve_pts = pts[:2] + [(
            pts[1][0] + (pts[2][0] - pts[1][0]) * 0.45,
            pts[1][1] + (pts[2][1] - pts[1][1]) * 0.45,
            pts[1][2] + (pts[2][2] - pts[1][2]) * 0.45)]
        sleeves.append(_limb(col, f'Sleeve_{tag}', sleeve_pts,
                             [0.082, 0.066, 0.059], 12))

    arm_obj = M.join(arms, 'Arms')
    mat.assign(arm_obj, mat.skin())
    sleeve_obj = M.join(sleeves, 'Sleeves')
    mat.assign(sleeve_obj, mat.kit_white())
    return arm_obj, sleeve_obj


def build_head(col, name='Head'):
    neck = M.cone(f'{name}_neck', r1=0.056, r2=0.050, depth=0.120, verts=16,
                  location=(0, 0.004, 1.478), collection=col)
    head = M.uv_sphere(f'{name}_skull', radius=HEAD_R, segments=20, rings=12,
                       location=(0, 0.008, Z_HEAD), collection=col)
    for v in head.data.vertices:
        v.co.y *= 1.10
        v.co.z *= 1.06
    head.data.update()
    obj = M.join([neck, head], name)
    M.shade_smooth(obj, angle_deg=55)
    M.smart_uv(obj)
    mat.assign(obj, mat.skin())
    return obj


def assemble(col=None, stance_deg=-78.0, with_bat=True):
    """Full batsman: body plus helmet, pads, shoes, gloves and bat.

    Everything is placed in the AUTHORING frame (facing +Y) and the whole
    assembly is rotated once at the end. Placing kit against an already-rotated
    body means every offset has to be resolved in a turned frame, which is how
    parts end up subtly misaligned.
    """
    import build_character as C
    import build_viewmodel as V

    col = col or M.new_collection('Batsman')
    objs = []

    parts = {
        'Torso': build_torso(col),
        'Legs': build_legs(col),
        'Head': build_head(col),
    }
    arms, sleeves = build_arms(col)
    parts['Arms'] = arms
    parts['Sleeves'] = sleeves
    objs += list(parts.values())

    _, kit = C.build(col)

    # helmet over the skull
    helmet_parts = []
    for key, dz in (('Helmet', 0.030), ('Helmet_Grille', 0.030)):
        o = kit[key]
        o.location = (0.0, 0.010, Z_HEAD + dz)
        helmet_parts.append(o)
    objs += helmet_parts

    # pads on the shins, shoes under the ankles
    for sgn, side in ((-1, 'L'), (1, 'R')):
        ax = sgn * (HIP_X + 0.012)
        for src_key, loc, rot in (
                ('Pad',        (ax, 0.062, 0.070), (0, 0, 0)),
                ('Pad_Straps', (ax, 0.062, 0.070), (0, 0, 0)),
                ('Shoe',       (ax, -0.100, 0.000), (0, 0, 0)),
                ('Shoe_Dark',  (ax, -0.100, 0.000), (0, 0, 0)),
                ('Shoe_Studs', (ax, -0.100, 0.000), (0, 0, 0))):
            src = kit[src_key]
            o = src.copy()
            # COPY the mesh, don't share it. apply_transform() refuses to bake
            # into multi-user data, and the left and right pads need opposite
            # placements anyway. Instancing is for the stadium's thousands of
            # repeats; a single character is not worth the constraint.
            o.data = src.data.copy()
            # Name the side EXPLICITLY. Left to itself Blender appends .001 /
            # .002, and the rig's bone-binding map keys off these names -- the
            # kit silently went unbound the first time.
            o.name = f'{src_key}.{side}'
            o.data.name = o.name
            o.location = loc
            o.rotation_euler = rot
            M.link(o, col)
            objs.append(o)
    for k in ('Pad', 'Pad_Straps', 'Shoe', 'Shoe_Dark', 'Shoe_Studs'):
        kit[k].hide_render = True
        kit[k].hide_viewport = True

    if with_bat:
        bat = V.build_bat(col)
        g_bot = V.build_glove(col, 'Glove_Bottom', V.GRIP_BOTTOM + 0.030)
        g_top = V.build_glove(col, 'Glove_Top', V.GRIP_BOTTOM + 0.140,
                              theta_offset=-22.0)
        # Place the handle so the authored grip heights land on the hands:
        # build_glove puts the bottom hand's fingers at local z = GRIP_BOTTOM
        # + 0.030, so offsetting by that puts it at GRIP_Z_LOW in world space.
        gx, gy = GRIP_XY
        bat_z = GRIP_Z_LOW - (V.GRIP_BOTTOM + 0.030) - 0.055
        for o in (bat, g_bot, g_top):
            M.set_origin(o, (0, 0, 0))
            # Bake the bat's own tilt FIRST, while its origin is still at its
            # local zero. Setting a location and then rotating rotates about
            # the WORLD origin -- the later stance pass zeroes origins, so the
            # 9-degree tilt became a 9-degree swing about the middle of the
            # pitch and threw the bat clear of the hands.
            o.rotation_euler = (math.radians(-9), 0, 0)
            M.apply_transform(o)
            o.location = (gx, gy, bat_z)
            objs.append(o)

    for o in objs:
        M.set_origin(o, (0, 0, 0))
        o.rotation_euler = (o.rotation_euler.x, o.rotation_euler.y,
                            o.rotation_euler.z + math.radians(stance_deg))
        M.apply_transform(o)
    return col, objs


def build(col=None, stance_deg=-78.0):
    """Full body, rotated into a side-on batting stance.

    `stance_deg` turns the finished figure about Z. Authoring faces +Y; a
    right-hander stands side-on to the bowler, so roughly -78 degrees puts the
    chest across the pitch with the head turned down it.
    """
    col = col or M.new_collection('Body')
    parts = {
        'Torso': build_torso(col),
        'Legs': build_legs(col),
        'Head': build_head(col),
    }
    arms, sleeves = build_arms(col)
    parts['Arms'] = arms
    parts['Sleeves'] = sleeves

    for o in parts.values():
        M.set_origin(o, (0, 0, 0))
        o.rotation_euler = (0, 0, math.radians(stance_deg))
        M.apply_transform(o)
    return col, parts


if __name__ == '__main__':
    M.reset_scene()
    col, parts = build()
    total = 0
    for n, o in sorted(parts.items()):
        t = M.tri_count(o)
        total += t
        print(f'  {n:12s} {t:6d} tris')
    print(f'  {"TOTAL":12s} {total:6d} tris')
