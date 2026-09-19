"""Batsman equipment: pads, helmet, shoes.

Built to the proportions of a real kit rather than a stylised approximation,
because these read instantly wrong otherwise -- a cricket pad has a very
specific silhouette (three vertical shin bolsters, a rolled knee, side wings)
and anything else looks like shin armour from a different sport.

The helmet grille is built here as its own object. The first-person view does
NOT use it (see build_viewmodel.build's include_grille), but the third-person
character does.

    python3 build_character.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M, mat

PAD_H       = 0.600      # ankle to above the knee
PAD_W       = 0.205
SHIN_ROLLS  = 3
KNEE_ROLLS  = 3
HELMET_R    = 0.118
GRILLE_BARS = 5


def build_pad(col, name='Pad'):
    """One batting pad.

    Three vertical bolsters down the shin, a rolled knee above them, side
    wings wrapping the calf, and three strap bands. The bolsters are lofted
    with superelliptical sections so they read as padded rolls rather than
    cylinders glued to a board.
    """
    parts = []

    # --- shin face: three vertical bolsters
    roll_w = PAD_W / SHIN_ROLLS
    for i in range(SHIN_ROLLS):
        x = -PAD_W * 0.5 + roll_w * (i + 0.5)
        sections = []
        steps = 16
        for k in range(steps + 1):
            t = k / steps
            z = t * PAD_H * 0.68
            # taper toward the ankle, swell at mid-shin
            w = roll_w * 0.46 * (0.82 + 0.18 * math.sin(math.pi * t))
            d = 0.026 * (0.78 + 0.22 * math.sin(math.pi * min(t * 1.2, 1.0)))
            sections.append(M.ring(x, 0.0, z, w, d, 12, rounded=0.78))
        parts.append(M.loft(f'{name}_shin{i}', sections, collection=col))

    # --- knee roll: three horizontal rolls above the shin
    # Swept ACROSS the pad on an arc, using tube_along_path, which orients its
    # cross-sections to the path. The first attempt stacked XY-plane rings
    # along X and produced three detached floating slabs.
    for j in range(KNEE_ROLLS):
        z = PAD_H * 0.715 + j * 0.052
        pts, radii = [], []
        for k in range(13):
            t = k / 12
            x = -PAD_W * 0.46 + PAD_W * 0.92 * t
            bow = math.sin(math.pi * t)
            pts.append((x, 0.006 * bow, z + 0.010 * bow))
            radii.append(0.0215 * (0.70 + 0.30 * bow))
        parts.append(M.tube_along_path(f'{name}_knee{j}', pts, radii, 12, col))

    # --- side wings, tucked BACK around the calf
    # Fat wings sitting level with the shin face turned the whole pad into a
    # barrel. A real pad has a flat front and the wings fold away behind it,
    # so these are thinner and pushed back in -Y.
    for sgn in (-1, 1):
        sections = []
        steps = 14
        for k in range(steps + 1):
            t = k / steps
            z = t * PAD_H * 0.64
            sections.append(M.ring(sgn * (PAD_W * 0.47), -0.046, z,
                                   0.013, 0.030, 10, rounded=0.88))
        parts.append(M.loft(f'{name}_wing{sgn}', sections, collection=col))

    obj = M.join(parts, name)
    M.shade_smooth(obj, angle_deg=40)
    M.smart_uv(obj)
    mat.assign(obj, mat.pad_white())

    # --- straps: dark bands across the back
    straps = []
    for j, z in enumerate((PAD_H * 0.11, PAD_H * 0.33, PAD_H * 0.55)):
        b = M.box(f'{name}_strap{j}', size=(PAD_W * 1.08, 0.055, 0.030),
                  location=(0, -0.028, z), collection=col)
        M.bevel(b, width=0.006, segments=2)
        M.apply_all_modifiers(b)
        straps.append(b)
    strap_obj = M.join(straps, f'{name}_Straps')
    M.shade_smooth(strap_obj, angle_deg=35)
    M.smart_uv(strap_obj)
    mat.assign(strap_obj, mat.strap())

    M.set_origin(obj, (0, 0, 0))
    M.set_origin(strap_obj, (0, 0, 0))
    return obj, strap_obj


def build_helmet(col, name='Helmet'):
    """Navy shell with a peak and ear flaps, plus the grille as a separate
    object so the POV can leave it off."""
    shell = M.uv_sphere(f'{name}_shell', radius=HELMET_R, segments=24, rings=14,
                        location=(0, 0, 0), collection=col)
    # squash into a helmet dome: slightly oval, flat underside
    for v in shell.data.vertices:
        v.co.z *= 0.92
        v.co.y *= 1.06
        if v.co.z < -HELMET_R * 0.22:
            v.co.z = -HELMET_R * 0.22
    shell.data.update()
    M.shade_smooth(shell, angle_deg=60)
    M.smart_uv(shell)
    mat.assign(shell, mat.helmet())

    # Peak: an explicit curved plate, built as a grid.
    #
    # Lofting XY-plane rings forward along +Y produced a twisted vertical flap
    # -- sweep direction and cross-section plane have to be perpendicular. A
    # plate is easier to control directly than any sweep.
    import bmesh as _bm
    pb = _bm.new()
    puv = pb.loops.layers.uv.new('UVMap')
    NX, NY = 11, 5
    grid = []
    for iy in range(NY + 1):
        ty = iy / NY
        y = HELMET_R * 0.52 + HELMET_R * 0.78 * ty
        row = []
        for ix in range(NX + 1):
            tx = ix / NX
            a_ = (tx - 0.5) * 2.0
            hw = HELMET_R * (0.97 - 0.30 * ty * ty)
            x = a_ * hw
            # droops forward and curves up at the edges, like a real peak
            z = (-HELMET_R * 0.02 - 0.070 * ty * ty
                 + 0.026 * a_ * a_ * (0.35 + ty))
            row.append(pb.verts.new((x, y, z)))
        grid.append(row)
    for iy in range(NY):
        for ix in range(NX):
            f = pb.faces.new((grid[iy][ix], grid[iy][ix + 1],
                              grid[iy + 1][ix + 1], grid[iy + 1][ix]))
            for k, loop in enumerate(f.loops):
                loop[puv].uv = [(ix / NX, iy / NY), ((ix + 1) / NX, iy / NY),
                                ((ix + 1) / NX, (iy + 1) / NY),
                                (ix / NX, (iy + 1) / NY)][k]
    _bm.ops.recalc_face_normals(pb, faces=pb.faces[:])
    peak = M.mesh_from_bmesh(pb, f'{name}_peak', col)
    M.solidify(peak, thickness=0.013, offset=0.0)
    M.apply_all_modifiers(peak)
    M.shade_smooth(peak, angle_deg=50)
    mat.assign(peak, mat.helmet())

    flaps = []
    for sgn in (-1, 1):
        f = M.uv_sphere(f'{name}_flap{sgn}', radius=HELMET_R * 0.46,
                        segments=12, rings=8,
                        location=(sgn * HELMET_R * 0.80, -HELMET_R * 0.10,
                                  -HELMET_R * 0.30), collection=col)
        for v in f.data.vertices:
            v.co.x *= 0.40
        f.data.update()
        flaps.append(f)
    flap_obj = M.join(flaps, f'{name}_Flaps')
    M.shade_smooth(flap_obj, angle_deg=50)
    M.smart_uv(flap_obj)
    mat.assign(flap_obj, mat.helmet())

    helmet = M.join([shell, peak, flap_obj], name)
    M.set_origin(helmet, (0, 0, 0))

    # --- grille: horizontal bars bowed away from the face
    # Grille spanning the whole face opening: from just under the peak down
    # past the chin, and wide enough to meet the ear flaps.
    bars = []
    Z_TOP, Z_BOT = -HELMET_R * 0.12, -HELMET_R * 1.32
    for i in range(GRILLE_BARS):
        t = i / (GRILLE_BARS - 1)
        z = Z_TOP + (Z_BOT - Z_TOP) * t
        # the cage narrows toward the chin
        hw = HELMET_R * (0.92 - 0.26 * t * t)
        pts, radii = [], []
        for k in range(15):
            u = k / 14
            a_ = (u - 0.5) * 2.0
            pts.append((a_ * hw,
                        HELMET_R * (1.00 - 0.26 * a_ * a_) - 0.10 * t * t,
                        z))
            radii.append(0.0046)
        bars.append(M.tube_along_path(f'{name}_gb{i}', pts, radii, 6, col))
    for i, xf in enumerate((-0.62, 0.0, 0.62)):
        pts, radii = [], []
        for k in range(13):
            u = k / 12
            z = Z_TOP + (Z_BOT - Z_TOP) * u
            hw = HELMET_R * (0.92 - 0.26 * u * u)
            pts.append((xf * hw,
                        HELMET_R * (1.00 - 0.26 * xf * xf) - 0.10 * u * u,
                        z))
            radii.append(0.0042)
        bars.append(M.tube_along_path(f'{name}_gv{i}', pts, radii, 6, col))
    grille = M.join(bars, f'{name}_Grille')
    M.shade_smooth(grille, angle_deg=50)
    M.smart_uv(grille)
    mat.assign(grille, mat.grille())
    M.set_origin(grille, (0, 0, 0))
    return helmet, grille


def _shoe_profile(t):
    """(half_width, topline_height) along the foot. t: 0 at toe, 1 at heel.

    A shoe is not a wedge. Its width peaks at the ball of the foot and falls
    away at both ends, while its topline climbs from a low toe box to an ankle
    collar. Driving both from one monotonic ramp -- which is what the first
    attempt did -- can only ever produce a chaise longue.
    """
    # width: narrow toe, widest at the ball (t~0.28), tapering to the heel
    if t < 0.28:
        w = 0.0255 + 0.0225 * (t / 0.28) ** 0.65
    else:
        w = 0.0480 - 0.0115 * ((t - 0.28) / 0.72) ** 1.25
    # topline: low toe box, rising over the instep into the collar
    if t < 0.36:
        h = 0.0320 + 0.0180 * (t / 0.36) ** 1.5
    elif t < 0.74:
        h = 0.0500 + 0.0290 * ((t - 0.36) / 0.38) ** 1.3
    else:
        h = 0.0790 + 0.0250 * ((t - 0.74) / 0.26) ** 0.8
    return w, h


def build_shoe(col, name='Shoe'):
    """Spiked cricket shoe, built as separate forms.

    sole / upper / collar / tongue / laces / studs, rather than one swept
    profile. Authored running along +Z with cross-sections in the XY plane --
    the only orientation M.ring() is correct for -- then laid flat with the
    rotation baked in, origins zeroed FIRST so every part rotates about the
    same point.
    """
    LEN = 0.286
    SOLE_T = 0.016
    steps = 26

    sole_sections, upper_sections = [], []
    for k in range(steps + 1):
        t = k / steps
        z = t * LEN
        w, h = _shoe_profile(t)
        # toe and heel round off in plan as well as section
        # Round the toe and heel over a REAL span. At 0.05 the taper happened
        # across the last 11 mm, which is not a curve -- the heel rendered as a
        # flat drum with a circular back face.
        cap = 1.0
        if t < 0.13:
            cap = math.sin(math.pi * 0.5 * (t / 0.13)) ** 0.45
        elif t > 0.88:
            cap = math.sin(math.pi * 0.5 * ((1.0 - t) / 0.12)) ** 0.45
        sole_sections.append(M.ring(0, SOLE_T * 0.5, z, (w + 0.003) * cap,
                                    SOLE_T * 0.5, 18, rounded=0.58))
        upper_sections.append(M.ring(0, SOLE_T + (h - SOLE_T) * 0.5, z,
                                     w * cap, (h - SOLE_T) * 0.5, 18,
                                     rounded=0.82))

    sole = M.loft(f'{name}_sole', sole_sections, collection=col)
    M.shade_smooth(sole, angle_deg=44)
    M.smart_uv(sole)
    mat.assign(sole, mat.strap())          # dark midsole reads as a real shoe

    upper = M.loft(f'{name}_upper', upper_sections, collection=col)
    M.shade_smooth(upper, angle_deg=44)
    M.smart_uv(upper)
    mat.assign(upper, mat.pad_white())

    # ankle collar: a ring around the opening at the heel, so the shoe has a
    # hole to put a foot in rather than being a solid lump
    _, h_heel = _shoe_profile(0.985)
    collar_pts, collar_r = [], []
    for k in range(19):
        a_ = 2.0 * math.pi * k / 18
        collar_pts.append((0.030 * math.cos(a_),
                           h_heel - 0.004 + 0.007 * math.sin(a_),
                           LEN * 0.845 + 0.037 * math.sin(a_)))
        collar_r.append(0.0075)
    collar = M.tube_along_path(f'{name}_collar', collar_pts, collar_r, 8, col,
                               caps=False)
    M.shade_smooth(collar, angle_deg=50)
    M.smart_uv(collar)
    mat.assign(collar, mat.pad_white())

    # tongue and laces over the instep
    tongue_sections = []
    for k in range(9):
        t = 0.50 + 0.30 * (k / 8)
        z = t * LEN
        w, h = _shoe_profile(t)
        tongue_sections.append(M.ring(0, h + 0.004, z, w * 0.52, 0.006, 10,
                                      rounded=0.85))
    tongue = M.loft(f'{name}_tongue', tongue_sections, collection=col)
    M.shade_smooth(tongue, angle_deg=45)
    M.smart_uv(tongue)
    mat.assign(tongue, mat.pad_white())

    laces = []
    for i in range(4):
        t = 0.545 + 0.062 * i
        z = t * LEN
        w, h = _shoe_profile(t)
        pts = [(-w * 0.62, h + 0.002, z + 0.010),
               (0.0, h + 0.009, z),
               (w * 0.62, h + 0.002, z + 0.010)]
        laces.append(M.tube_along_path(f'{name}_lace{i}', pts, 0.0032, 6, col))
    lace_obj = M.join(laces, f'{name}_Laces')
    M.shade_smooth(lace_obj, angle_deg=50)
    M.smart_uv(lace_obj)
    mat.assign(lace_obj, mat.strap())

    studs = []
    for (sz, sx) in ((0.235, -0.027), (0.235, 0.027), (0.185, -0.032),
                     (0.185, 0.032), (0.052, -0.026), (0.052, 0.026)):
        st = M.cone(f'{name}_stud{sz}{sx}', r1=0.0062, r2=0.0038, depth=0.013,
                    verts=8, location=(sx, -0.0045, sz), collection=col)
        st.rotation_euler = (math.radians(90), 0, 0)
        M.apply_transform(st)
        studs.append(st)
    stud_obj = M.join(studs, f'{name}_Studs')
    M.shade_smooth(stud_obj, angle_deg=40)
    M.smart_uv(stud_obj)
    mat.assign(stud_obj, mat.steel_dark())

    shoe = M.join([upper, collar, tongue], name)
    dark = M.join([sole, lace_obj], f'{name}_Dark')

    for o in (shoe, dark, stud_obj):
        M.set_origin(o, (0, 0, 0))
        o.rotation_euler = (math.radians(90), 0, math.radians(180))
        M.apply_transform(o)
    return shoe, dark, stud_obj


def build(col=None):
    col = col or M.new_collection('Character')
    pad, pad_straps = build_pad(col)
    helmet, grille = build_helmet(col)
    shoe, shoe_dark, studs = build_shoe(col)
    return col, {
        'Pad': pad, 'Pad_Straps': pad_straps,
        'Helmet': helmet, 'Helmet_Grille': grille,
        'Shoe': shoe, 'Shoe_Dark': shoe_dark, 'Shoe_Studs': studs,
    }


if __name__ == '__main__':
    M.reset_scene()
    col, parts = build()
    for n, o in sorted(parts.items()):
        print(f'  {n:16s} {M.tri_count(o):6d} tris')
