"""Stadium: two-tier stand, seats, crowd, hoardings, signage, lights, trees.

Rebuilt to match the reference photograph's structure rather than a generic
bowl: a lower seating tier, a signage band across its back, an upper tier set
further back and higher, and a dark canopy roof over the top rows. Trees show
above the roofline behind the stands.

Everything repeated is authored ONCE at the origin and instanced. A ground
holds ~28,000 seats and ~17,000 spectators; as nodes that is unshippable, as
MultiMeshes it is a handful of draw calls.

From a batsman-POV camera this all sits 80 m away behind depth of field. Do
not spend detail here -- spend it on silhouette and on the crowd reading as
many individual people.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import bmesh
from lib import meshutil as M, mat
from build_ground import ground_height, BOUNDARY_R

BOWL_SEGMENTS = 24
SEG_ANGLE     = 2 * math.pi / BOWL_SEGMENTS
ARC_STEPS     = 6

# lower tier
L_R0, L_R1    = 80.0, 90.0
L_ROWS        = 14
L_RISE        = 0.42
L_DEPTH       = (L_R1 - L_R0) / L_ROWS
DECK_Z        = 2.4

# signage band across the back of the lower tier
SIGN_R        = L_R1 + 0.30
SIGN_Z0       = DECK_Z + L_ROWS * L_RISE
SIGN_H        = 2.20

# Corporate-box balcony. The reference does not stack two identical decks --
# it separates them with a recessed, glazed box level, and that dark band is
# most of what makes the bowl read as a real stadium rather than two rings of
# terracing. Boxes sit BEHIND the lower tier's back line, so the balcony is
# genuinely recessed rather than flush.
BOX_R         = L_R1 + 1.10
BOX_Z0        = SIGN_Z0 + SIGN_H
BOX_H         = 3.40
BOX_PIERS     = 5              # frame columns per wedge, between the glass

# upper tier, set back and higher again
U_R0, U_R1    = 92.0, 103.0
U_ROWS        = 13
U_RISE        = 0.50
U_DEPTH       = (U_R1 - U_R0) / U_ROWS
U_DECK_Z      = BOX_Z0 + BOX_H + 0.70

# green board standing proud of the roofline, as in the reference
RSIGN_H       = 3.30
RSIGN_R       = U_R1 - 1.0

# The canopy was the worst offender in early renders: a tall back wall plus a
# deep soffit put a solid black band across the top of every stand. Real
# stadium roofs read as a thin dark edge from pitch level, not a slab.
ROOF_Z        = U_DECK_Z + U_ROWS * U_RISE + 1.60
ROOF_REACH    = 4.0

HOARDING_R    = BOUNDARY_R + 2.6
TREE_R        = 112.0
N_BRANDS      = 6


def _arc(radius, z, half):
    return [(radius * math.cos(-half + SEG_ANGLE * i / ARC_STEPS),
             radius * math.sin(-half + SEG_ANGLE * i / ARC_STEPS), z)
            for i in range(ARC_STEPS + 1)]


def _strip(bm, uv, a_pts, b_pts, uv_scale=(1.0, 1.0), flip_u=False):
    """Bridge two arcs into a quad strip.

    flip_u mirrors the U axis. The bowl arcs run anticlockwise, so a strip
    seen from INSIDE the stadium has its U reversed -- which printed the
    signage back to front. Any text-bearing surface facing the pitch needs
    flip_u=True.
    """
    va = [bm.verts.new(p) for p in a_pts]
    vb = [bm.verts.new(p) for p in b_pts]
    n = len(va) - 1
    for i in range(n):
        f = bm.faces.new((va[i], va[i + 1], vb[i + 1], vb[i]))
        t0, t1 = i / n, (i + 1) / n
        if flip_u:
            t0, t1 = 1.0 - t0, 1.0 - t1
        u0, u1 = t0 * uv_scale[0], t1 * uv_scale[0]
        for k, loop in enumerate(f.loops):
            loop[uv].uv = [(u0, 0), (u1, 0), (u1, uv_scale[1]), (u0, uv_scale[1])][k]


def build_stand_module(col):
    """One 15-degree wedge of the bowl: two tiers plus a canopy roof."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    half = SEG_ANGLE * 0.5

    # --- lower tier terracing
    for r in range(L_ROWS):
        r0 = L_R0 + r * L_DEPTH
        z = DECK_Z + r * L_RISE
        _strip(bm, uv, _arc(r0, z, half), _arc(r0 + L_DEPTH, z, half))
        _strip(bm, uv, _arc(r0 + L_DEPTH, z, half),
               _arc(r0 + L_DEPTH, z + L_RISE, half))

    # front facade dropping to pitch level
    _strip(bm, uv, _arc(L_R0, DECK_Z, half), _arc(L_R0, 0.0, half))

    # --- upper tier: vertical face up from the box roof, then terracing
    _strip(bm, uv, _arc(U_R0, BOX_Z0 + BOX_H, half), _arc(U_R0, U_DECK_Z, half))
    for r in range(U_ROWS):
        r0 = U_R0 + r * U_DEPTH
        z = U_DECK_Z + r * U_RISE
        _strip(bm, uv, _arc(r0, z, half), _arc(r0 + U_DEPTH, z, half))
        _strip(bm, uv, _arc(r0 + U_DEPTH, z, half),
               _arc(r0 + U_DEPTH, z + U_RISE, half))

    # back wall
    top_z = U_DECK_Z + U_ROWS * U_RISE
    _strip(bm, uv, _arc(U_R1, top_z, half), _arc(U_R1, ROOF_Z, half))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = M.mesh_from_bmesh(bm, 'Stand_Module', col)
    mat.assign(obj, mat.concrete_tex())
    M.shade_smooth(obj, angle_deg=20)
    return obj


def build_roof_module(col):
    """The canopy, as its own object so it can take the dark green of the
    reference and be deleted wholesale if it shades the bowl too much."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    half = SEG_ANGLE * 0.5
    _strip(bm, uv, _arc(U_R1 + 0.6, ROOF_Z, half),
           _arc(U_R1 - ROOF_REACH, ROOF_Z + 1.4, half))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = M.mesh_from_bmesh(bm, 'Roof_Module', col)
    M.solidify(obj, thickness=0.35, offset=-1.0)
    M.apply_all_modifiers(obj)
    mat.assign(obj, mat.roof_green())
    M.shade_smooth(obj, angle_deg=25)
    return obj


def build_signage_module(col):
    """The advertising band across the back of the lower tier -- the big green
    board in the reference.

    UVs are assigned from WORLD POSITION after recalc_face_normals, not from
    loop order during construction. recalc_face_normals can reverse a face's
    winding, which reorders its loops and scrambles index-assigned UVs; that
    is what printed this sign back to front, and why flipping U during
    construction changed nothing. Any text-bearing surface should be mapped
    positionally.
    """
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    half = SEG_ANGLE * 0.5
    _strip(bm, uv, _arc(SIGN_R, SIGN_Z0 + SIGN_H, half),
           _arc(SIGN_R, SIGN_Z0, half))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    # Seen from the middle of the ground looking out, +theta runs to the LEFT
    # of frame, so U must run against theta for text to read left-to-right.
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            theta = math.atan2(co.y, co.x)
            u = 1.0 - (theta + half) / SEG_ANGLE
            v = (co.z - SIGN_Z0) / SIGN_H
            loop[uv].uv = (u, v)

    obj = M.mesh_from_bmesh(bm, 'Signage_Module', col)
    mat.assign(obj, mat.signage_tex())
    return obj


def build_box_module(col):
    """The glazed corporate-box balcony between the two seating decks.

    Built as a dark glass band broken by pale precast piers. Returned as TWO
    objects because they need different materials, and a single mesh with two
    slots would stop each being MultiMesh-instanced on its own in Godot.
    """
    half = SEG_ANGLE * 0.5

    glass_bm = bmesh.new()
    guv = glass_bm.loops.layers.uv.new('UVMap')
    _strip(glass_bm, guv, _arc(BOX_R, BOX_Z0 + BOX_H * 0.88, half),
           _arc(BOX_R, BOX_Z0 + BOX_H * 0.20, half))
    bmesh.ops.recalc_face_normals(glass_bm, faces=glass_bm.faces[:])
    glass = M.mesh_from_bmesh(glass_bm, 'Box_Glass', col)
    mat.assign(glass, mat.box_glass())

    # solid parapet below the glazing, and the soffit above it
    body_bm = bmesh.new()
    buv = body_bm.loops.layers.uv.new('UVMap')
    _strip(body_bm, buv, _arc(BOX_R, BOX_Z0 + BOX_H * 0.20, half),
           _arc(BOX_R, BOX_Z0, half))
    _strip(body_bm, buv, _arc(BOX_R, BOX_Z0 + BOX_H, half),
           _arc(BOX_R, BOX_Z0 + BOX_H * 0.88, half))
    bmesh.ops.recalc_face_normals(body_bm, faces=body_bm.faces[:])
    body = M.mesh_from_bmesh(body_bm, 'Box_Body', col)
    mat.assign(body, mat.precast_tex())

    # piers: short vertical slabs standing proud of the glass line
    piers = []
    for i in range(BOX_PIERS):
        a = -half + SEG_ANGLE * (i + 0.5) / BOX_PIERS
        p = M.box(f'box_pier{i}', size=(0.55, 0.9, BOX_H),
                  location=(BOX_R * math.cos(a), BOX_R * math.sin(a),
                            BOX_Z0 + BOX_H * 0.5), collection=col)
        p.rotation_euler = (0, 0, a)
        piers.append(p)
    pier_obj = M.join(piers, 'Box_Piers')
    M.bevel(pier_obj, width=0.03, segments=2)
    M.apply_all_modifiers(pier_obj)
    M.shade_smooth(pier_obj, angle_deg=30)
    M.smart_uv(pier_obj)
    mat.assign(pier_obj, mat.precast_tex())

    merged = M.join([body, pier_obj], 'Box_Module')
    return merged, glass


def build_roof_signage(col):
    """The green board standing above the roofline.

    In the reference this is silhouetted against sky rather than sitting flat
    on the stand, and that break in the roofline is a large part of the
    skyline's character. Placed on a subset of segments, not all of them.
    """
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    half = SEG_ANGLE * 0.5
    z0 = ROOF_Z + 0.4
    _strip(bm, uv, _arc(RSIGN_R, z0 + RSIGN_H, half), _arc(RSIGN_R, z0, half))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            theta = math.atan2(co.y, co.x)
            loop[uv].uv = (1.0 - (theta + half) / SEG_ANGLE,
                           (co.z - z0) / RSIGN_H)
    obj = M.mesh_from_bmesh(bm, 'RoofSign_Module', col)
    M.solidify(obj, thickness=0.30, offset=0.0)
    M.apply_all_modifiers(obj)
    mat.assign(obj, mat.signage_tex())
    return obj


def build_seat(col):
    pan = M.box('seat_pan', size=(0.44, 0.40, 0.055),
                location=(0, 0, 0.40), collection=col)
    M.bevel(pan, width=0.018, segments=2)
    M.apply_all_modifiers(pan)
    back = M.box('seat_back', size=(0.44, 0.06, 0.40),
                 location=(0, -0.18, 0.60), collection=col)
    M.bevel(back, width=0.020, segments=2)
    M.apply_all_modifiers(back)
    back.rotation_euler = (math.radians(-9), 0, 0)
    obj = M.join([pan, back], 'Seat')
    M.shade_smooth(obj, angle_deg=40)
    M.smart_uv(obj)
    mat.assign(obj, mat.seat_tex())
    return obj


CROWD_W, CROWD_H = 0.78, 1.15


def build_crowd_card(col, cell=0, cols=8, rows=4, name=None):
    """One spectator quad, UV-mapped to a single cell of the crowd atlas.

    Blender has no per-instance atlas index without geometry nodes, so the
    preview builds all 16 variants as separate objects and scatters them.
    Godot does NOT need this: crowd_card.gdshader picks the cell per instance
    from INSTANCE_ID, so only cell 0 is exported.
    """
    obj = M.plane(name or f'CrowdCard_{cell:02d}', size_x=CROWD_W,
                  size_y=CROWD_H, collection=col)
    for v in obj.data.vertices:
        v.co.z, v.co.y = v.co.y + CROWD_H * 0.5, 0.0
    obj.data.update()
    uvl = obj.data.uv_layers[0] if obj.data.uv_layers else obj.data.uv_layers.new(name='UVMap')
    cx, cy = cell % cols, cell // cols
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        u = (co.x / CROWD_W + 0.5 + cx) / cols
        # atlas rows run top-down; UV runs bottom-up
        v = (co.z / CROWD_H + (rows - 1 - cy)) / rows
        uvl.data[loop.index].uv = (u, v)
    mat.assign(obj, mat.crowd_tex())
    return obj


def build_hoarding_panel(col, index=0):
    """One advertising board. Brands are invented -- see generate_textures."""
    obj = M.box(f'Hoarding_{index:02d}', size=(8.0, 0.12, 1.15),
                location=(0, 0, 0.575), collection=col)
    M.bevel(obj, width=0.02, segments=2)
    M.apply_all_modifiers(obj)
    M.shade_smooth(obj, angle_deg=35)
    # Planar UV so the artwork is not wrapped round the box. U is NEGATED:
    # the panel is rotated to face the middle of the ground, so its local +X
    # points to the viewer's LEFT and un-negated text reads back to front --
    # the same mirroring that caught the signage, on a different surface.
    uvl = obj.data.uv_layers[0] if obj.data.uv_layers else obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            uvl.data[li].uv = (0.5 - co.x / 8.0, co.z / 1.15)
    mat.assign(obj, mat.hoarding_tex(index % N_BRANDS))
    return obj


def build_sightscreen(col):
    panel = M.box('ss_panel', size=(14.0, 0.25, 8.0),
                  location=(0, 0, 5.2), collection=col)
    M.bevel(panel, width=0.05, segments=2)
    M.apply_all_modifiers(panel)
    M.shade_smooth(panel, angle_deg=35)
    M.smart_uv(panel)
    mat.assign(panel, mat.sightscreen())
    legs = []
    for x in (-5.4, 5.4):
        leg = M.box(f'ss_leg{x}', size=(0.30, 0.30, 1.6),
                    location=(x, 0, 0.8), collection=col)
        M.bevel(leg, width=0.02, segments=2)
        M.apply_all_modifiers(leg)
        M.smart_uv(leg)
        mat.assign(leg, mat.steel_dark())
        legs.append(leg)
    return M.join([panel] + legs, 'Sightscreen')


def build_floodlight(col):
    """Tall mast with a wide lamp head, like the reference. The lamps are
    emissive and rely on bloom for the glare -- do not model a flare."""
    H = 62.0
    mast = M.cone('fl_mast', r1=1.4, r2=0.70, depth=H, verts=10,
                  location=(0, 0, H * 0.5), collection=col)
    M.smart_uv(mast)
    mat.assign(mast, mat.steel_dark())
    frame = M.box('fl_frame', size=(16.0, 1.0, 6.0),
                  location=(0, 0, H + 3.0), collection=col)
    M.bevel(frame, width=0.12, segments=2)
    M.apply_all_modifiers(frame)
    M.smart_uv(frame)
    mat.assign(frame, mat.steel_dark())
    tower = M.join([mast, frame], 'Floodlight_Tower')
    M.shade_smooth(tower, angle_deg=35)

    # Halogen array: 5 x 2 of clearly separated lamp faces, as in the
    # reference, rather than a dense grid that reads as one bright slab.
    lamps = []
    for ix in range(5):
        for iz in range(2):
            lamp = M.box(f'fl_lamp{ix}_{iz}', size=(2.5, 0.34, 2.0),
                         location=(-6.0 + ix * 3.0, 0.66, H + 1.6 + iz * 2.5),
                         collection=col)
            M.bevel(lamp, width=0.06, segments=2)
            M.apply_all_modifiers(lamp)
            lamps.append(lamp)
    lamp_obj = M.join(lamps, 'Floodlight_Lamps')
    M.shade_smooth(lamp_obj, angle_deg=35)
    M.smart_uv(lamp_obj)
    mat.assign(lamp_obj, mat.halogen())
    return tower, lamp_obj


def build_tree(col):
    """A stylised tree for the skyline behind the stands. Three overlapping
    spheres on a tapered trunk -- at this distance anything more is wasted."""
    trunk = M.cone('tree_trunk', r1=0.45, r2=0.30, depth=4.2, verts=8,
                   location=(0, 0, 2.1), collection=col)
    M.smart_uv(trunk)
    mat.assign(trunk, mat.bark())
    blobs = []
    for dx, dy, dz, r in ((0, 0, 5.6, 2.9), (1.7, 0.6, 4.6, 2.1),
                          (-1.5, -0.7, 4.9, 1.9)):
        b = M.uv_sphere(f'tree_blob{dx}{dy}', radius=r, segments=10, rings=6,
                        location=(dx, dy, dz), collection=col)
        blobs.append(b)
    foliage = M.join(blobs, 'tree_foliage')
    M.shade_smooth(foliage, angle_deg=50)
    M.smart_uv(foliage)
    mat.assign(foliage, mat.foliage())
    obj = M.join([trunk, foliage], 'Tree')
    return obj


def build_modules(col=None):
    col = col or M.new_collection('Stadium_Modules')
    tower, lamps = build_floodlight(col)
    box_body, box_glass = build_box_module(col)
    mods = {
        'Stand_Module':     build_stand_module(col),
        'Roof_Module':      build_roof_module(col),
        'Signage_Module':   build_signage_module(col),
        'Box_Module':       box_body,
        'Box_Glass':        box_glass,
        'RoofSign_Module':  build_roof_signage(col),
        'Seat':             build_seat(col),
        'CrowdCard':        build_crowd_card(col, cell=0, name='CrowdCard'),
        'Sightscreen':      build_sightscreen(col),
        'Floodlight_Tower': tower,
        'Floodlight_Lamps': lamps,
        'Tree':             build_tree(col),
    }
    for i in range(N_BRANDS):
        mods[f'Hoarding_{i:02d}'] = build_hoarding_panel(col, i)
    # the 16 atlas variants used only by the Blender preview
    mods['_crowd_cells'] = [build_crowd_card(col, cell=c) for c in range(32)]

    # NORMALISE EVERY MODULE ORIGIN TO (0,0,0).
    #
    # M.join() gives the joined object the FIRST child's location as its
    # origin. Both the Blender assembler and the Godot builder then place a
    # module by assigning .location outright, which silently discards that
    # authored offset -- the mesh keeps its shape but lands at the wrong
    # height. It had buried the sightscreen 5.2 m into the ground, sunk the
    # hoardings to half height, dropped seats 0.4 m and trees 2.1 m, and left
    # every floodlight's lamp array sitting at pitch level 63 m below its own
    # frame, which is what made the pylons look unlit.
    #
    # Baking the offset into the mesh makes a module's authored coordinates
    # its local coordinates, so assigning .location is finally safe. Do this
    # for anything that gets instanced.
    for key, obj in mods.items():
        if key.startswith('_'):
            continue
        M.set_origin(obj, (0.0, 0.0, 0.0))
    for card in mods['_crowd_cells']:
        M.set_origin(card, (0.0, 0.0, 0.0))
    return col, mods


def _tier_rows():
    """(radius, z) for every seating row across both tiers."""
    out = []
    for r in range(L_ROWS):
        out.append((L_R0 + r * L_DEPTH + L_DEPTH * 0.55, DECK_Z + r * L_RISE))
    for r in range(U_ROWS):
        out.append((U_R0 + r * U_DEPTH + U_DEPTH * 0.55, U_DECK_Z + r * U_RISE))
    return out


def assemble_bowl(modules, col=None, seat_stride=2, crowd_fill=0.94):
    """Full stadium, for offline preview renders only.

    Godot uses MultiMeshInstance3D instead -- godot/scripts/stadium_builder.gd
    places the same modules at the same transforms.
    """
    col = col or M.new_collection('Stadium_Assembled')
    placed = []
    rng = random.Random(20260919)

    def ring(src, count, radius_fn, z_fn, rot_extra=math.pi * 0.5, jitter=0.0):
        for i in range(count):
            a = 2 * math.pi * i / count
            o = src.copy()
            o.data = src.data
            r = radius_fn(a)
            o.location = (r * math.cos(a), r * math.sin(a), z_fn(a))
            o.rotation_euler = (0, 0, a + rot_extra +
                                (rng.random() - 0.5) * jitter)
            M.link(o, col)
            placed.append(o)

    for key in ('Stand_Module', 'Roof_Module', 'Signage_Module',
                'Box_Module', 'Box_Glass'):
        src = modules[key]
        for s in range(BOWL_SEGMENTS):
            o = src.copy()
            o.data = src.data
            o.rotation_euler = (0, 0, s * SEG_ANGLE)
            M.link(o, col)
            placed.append(o)

    # Rooftop boards on a subset of segments only. A continuous ring of them
    # looks like a wall; the reference has the roofline broken irregularly.
    rsign = modules['RoofSign_Module']
    for s in range(BOWL_SEGMENTS):
        if s % 3 == 1:
            continue
        o = rsign.copy()
        o.data = rsign.data
        o.rotation_euler = (0, 0, s * SEG_ANGLE)
        M.link(o, col)
        placed.append(o)

    seat_src = modules['Seat']
    cells = modules['_crowd_cells']
    for radius, z in _tier_rows():
        count = max(8, int(2 * math.pi * radius / 0.52))
        for i in range(0, count, seat_stride):
            a = 2 * math.pi * i / count
            s = seat_src.copy()
            s.data = seat_src.data
            s.location = (radius * math.cos(a), radius * math.sin(a), z)
            s.rotation_euler = (0, 0, a + math.pi * 0.5)
            M.link(s, col)
            placed.append(s)

            if rng.random() > crowd_fill:
                continue
            src = cells[rng.randrange(len(cells))]
            c = src.copy()
            c.data = src.data
            cr = radius - 0.16
            c.location = (cr * math.cos(a), cr * math.sin(a), z + 0.28)
            c.rotation_euler = (0, 0, a + math.pi * 0.5)
            sc = 0.94 + rng.random() * 0.16
            c.scale = (sc, sc, sc)
            M.link(c, col)
            placed.append(c)

    n_h = int(2 * math.pi * HOARDING_R / 8.2)
    for i in range(n_h):
        a = 2 * math.pi * i / n_h
        src = modules[f'Hoarding_{i % N_BRANDS:02d}']
        h = src.copy()
        h.data = src.data
        x, y = HOARDING_R * math.cos(a), HOARDING_R * math.sin(a)
        h.location = (x, y, ground_height(x, y))
        h.rotation_euler = (0, 0, a + math.pi * 0.5)
        M.link(h, col)
        placed.append(h)

    for sign in (1, -1):
        ss = modules['Sightscreen'].copy()
        ss.data = modules['Sightscreen'].data
        ss.location = (sign * (BOUNDARY_R + 7.0), 0, 0)
        ss.rotation_euler = (0, 0, math.radians(90))
        M.link(ss, col)
        placed.append(ss)

    # Six pylons, offset 15 degrees so one falls inside the reference
    # camera's framing rather than all four sitting on the diagonals just
    # outside it.
    for k in range(6):
        a = math.radians(15 + k * 60)
        for key in ('Floodlight_Tower', 'Floodlight_Lamps'):
            f = modules[key].copy()
            f.data = modules[key].data
            f.location = (110 * math.cos(a), 110 * math.sin(a), 0)
            # Lamps sit on the head's local +Y, which after a Z-rotation of
            # theta points along theta+90. To aim them at the middle of the
            # ground (direction a+180) the rotation must be a+90, NOT a+180 --
            # that put the array 90 degrees off and rendered every pylon as a
            # black silhouette with its emissive faces pointing at the car park.
            f.rotation_euler = (0, 0, a + math.pi * 0.5)
            M.link(f, col)
            placed.append(f)

    tree = modules['Tree']
    for i in range(46):
        a = 2 * math.pi * i / 46 + rng.random() * 0.06
        r = TREE_R + rng.random() * 9.0
        t = tree.copy()
        t.data = tree.data
        t.location = (r * math.cos(a), r * math.sin(a), 0)
        sc = 0.8 + rng.random() * 0.7
        t.scale = (sc, sc, sc)
        t.rotation_euler = (0, 0, rng.random() * 6.28)
        M.link(t, col)
        placed.append(t)

    return col, placed


if __name__ == '__main__':
    M.reset_scene()
    col, mods = build_modules()
    for name, o in sorted(mods.items()):
        if name.startswith('_'):
            continue
        print(f'  {name:20s} {M.tri_count(o):7d} tris')
    _, placed = assemble_bowl(mods)
    print(f'  assembled bowl: {len(placed)} instances')
