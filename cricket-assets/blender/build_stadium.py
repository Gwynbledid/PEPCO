"""Stadium: stand modules, seats, crowd cards, hoardings, sightscreen, lights.

Everything here is authored as ONE module which Godot then instances. A
stadium holds ~28,000 seats -- baking those into a mesh would give you a
300 MB file that renders at 4 fps. One 120-triangle seat, MultiMesh-instanced,
costs a single draw call.

The other thing to remember: from a batsman-POV camera this entire file lives
behind heavy depth of field, 80 m away. Do not spend detail here. The stand
module is deliberately crude and it will look correct in context.
"""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import bmesh
from lib import meshutil as M, mat
from build_ground import ground_height, BOUNDARY_R

BOWL_SEGMENTS = 24                       # modules around the ring
SEG_ANGLE     = 2 * math.pi / BOWL_SEGMENTS
STAND_R0      = 80.0                     # inner (front row) radius
STAND_R1      = 99.0                     # outer (back row) radius
ROWS          = 22
ROW_RISE      = 0.46
ROW_DEPTH     = (STAND_R1 - STAND_R0) / ROWS
DECK_Z        = 2.6                      # front row sits above pitch level
HOARDING_R    = BOUNDARY_R + 2.6


def build_stand_module(col):
    """One wedge of terracing: stepped rows, a back wall and a roof.

    Wedge-shaped rather than straight so 24 copies tile the ring with no gaps
    and no corner pieces to author.
    """
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    half = SEG_ANGLE * 0.5
    ARC = 6                                   # arc subdivisions across the wedge

    def arc_pts(radius, z):
        return [(radius * math.cos(-half + SEG_ANGLE * i / ARC),
                 radius * math.sin(-half + SEG_ANGLE * i / ARC), z)
                for i in range(ARC + 1)]

    def strip(a_pts, b_pts):
        va = [bm.verts.new(p) for p in a_pts]
        vb = [bm.verts.new(p) for p in b_pts]
        for i in range(len(va) - 1):
            f = bm.faces.new((va[i], va[i + 1], vb[i + 1], vb[i]))
            for k, loop in enumerate(f.loops):
                loop[uv].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][k]

    # the steps themselves: a tread and a riser per row
    for r in range(ROWS):
        r0 = STAND_R0 + r * ROW_DEPTH
        r1 = r0 + ROW_DEPTH
        z = DECK_Z + r * ROW_RISE
        strip(arc_pts(r0, z), arc_pts(r1, z))              # tread
        strip(arc_pts(r1, z), arc_pts(r1, z + ROW_RISE))   # riser

    # back wall
    top_z = DECK_Z + ROWS * ROW_RISE
    strip(arc_pts(STAND_R1, top_z), arc_pts(STAND_R1, top_z + 3.4))
    # roof slab, cantilevered forward over the back rows
    roof_z = top_z + 3.4
    strip(arc_pts(STAND_R1, roof_z), arc_pts(STAND_R1 - 7.0, roof_z + 1.1))
    # front facade dropping to ground level
    strip(arc_pts(STAND_R0, DECK_Z), arc_pts(STAND_R0, 0.0))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = M.mesh_from_bmesh(bm, 'Stand_Module', col)
    mat.assign(obj, mat.concrete())
    M.shade_smooth(obj, angle_deg=25)
    return obj


def build_seat(col):
    """A single stadium seat. ~120 tris; this gets MultiMesh-instanced tens of
    thousands of times, so every triangle here costs 28,000x."""
    pan = M.box('seat_pan', size=(0.44, 0.40, 0.055),
                location=(0, 0, 0.40), collection=col)
    M.bevel(pan, width=0.018, segments=2)
    M.apply_all_modifiers(pan)

    backrest = M.box('seat_back', size=(0.44, 0.06, 0.40),
                     location=(0, -0.18, 0.60), collection=col)
    M.bevel(backrest, width=0.020, segments=2)
    M.apply_all_modifiers(backrest)
    backrest.rotation_euler = (math.radians(-9), 0, 0)

    obj = M.join([pan, backrest], 'Seat')
    M.shade_smooth(obj, angle_deg=40)
    M.smart_uv(obj)
    mat.assign(obj, mat.seat())
    return obj


def build_crowd_card(col):
    """One camera-facing quad. The crowd shader picks a cell from an atlas,
    tints it per-instance and bobs it with a vertex sine -- 16 texture cells
    and per-instance colour is enough variation to read as a full house."""
    obj = M.plane('CrowdCard', size_x=0.62, size_y=1.15, collection=col)
    # stand it upright with its pivot at the feet
    for v in obj.data.vertices:
        v.co.z, v.co.y = v.co.y + 0.575, 0.0
    obj.data.update()
    uvl = obj.data.uv_layers.new(name='UVMap') if not obj.data.uv_layers else obj.data.uv_layers[0]
    for loop in obj.data.loops:
        co = obj.data.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = (co.x / 0.62 + 0.5, co.z / 1.15)
    mat.assign(obj, mat.crowd())
    return obj


def build_hoarding_panel(col):
    """One boundary advertising board. Kept as its own mesh and material so
    you can swap sponsor textures per match without touching geometry.

    Use your own invented brands here -- real sponsor logos are trademarks and
    will block a store release.
    """
    obj = M.box('Hoarding_Panel', size=(8.0, 0.12, 1.15),
                location=(0, 0, 0.575), collection=col)
    M.bevel(obj, width=0.02, segments=2)
    M.apply_all_modifiers(obj)
    M.shade_smooth(obj, angle_deg=35)
    M.smart_uv(obj)
    mat.assign(obj, mat.hoarding())
    return obj


def build_sightscreen(col):
    """The big green board behind the bowler's arm. Batsman-POV games need
    this to actually work -- the ball must stay readable against it."""
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
    """Tower plus lamp array. The lamps are emissive at strength 40 and rely
    on bloom to sell the glare -- do not try to model the flare."""
    H = 58.0
    parts = []
    mast = M.cone('fl_mast', r1=1.5, r2=0.75, depth=H, verts=10,
                  location=(0, 0, H * 0.5), collection=col)
    M.smart_uv(mast)
    mat.assign(mast, mat.steel_dark())
    parts.append(mast)

    frame = M.box('fl_frame', size=(13.0, 1.0, 7.0),
                  location=(0, 0, H + 3.2), collection=col)
    M.bevel(frame, width=0.12, segments=2)
    M.apply_all_modifiers(frame)
    M.smart_uv(frame)
    mat.assign(frame, mat.steel_dark())
    parts.append(frame)

    tower = M.join(parts, 'Floodlight_Tower')
    M.shade_smooth(tower, angle_deg=35)

    # lamp array as one emissive object so Godot can drive its energy
    lamps = []
    for ix in range(5):
        for iz in range(3):
            lamp = M.box(f'fl_lamp{ix}_{iz}', size=(2.1, 0.30, 1.9),
                         location=(-5.0 + ix * 2.5, 0.62, H + 1.1 + iz * 2.1),
                         collection=col)
            M.bevel(lamp, width=0.05, segments=2)
            M.apply_all_modifiers(lamp)
            lamps.append(lamp)
    lamp_obj = M.join(lamps, 'Floodlight_Lamps')
    M.shade_smooth(lamp_obj, angle_deg=35)
    M.smart_uv(lamp_obj)
    mat.assign(lamp_obj, mat.floodlight())
    return tower, lamp_obj


def build_modules(col=None):
    """The exportable pieces -- one of each, at the origin."""
    col = col or M.new_collection('Stadium_Modules')
    tower, lamps = build_floodlight(col)
    return col, {
        'Stand_Module':    build_stand_module(col),
        'Seat':            build_seat(col),
        'CrowdCard':       build_crowd_card(col),
        'Hoarding_Panel':  build_hoarding_panel(col),
        'Sightscreen':     build_sightscreen(col),
        'Floodlight_Tower': tower,
        'Floodlight_Lamps': lamps,
    }


def assemble_bowl(modules, col=None, seat_stride=3):
    """Full stadium, for offline preview renders only.

    In Godot you want MultiMeshInstance3D instead -- see
    godot/scripts/stadium_builder.gd, which places the same modules at the
    same transforms this function uses. seat_stride thins the seat grid so the
    preview render stays tractable.
    """
    col = col or M.new_collection('Stadium_Assembled')
    placed = []

    for s in range(BOWL_SEGMENTS):
        ang = s * SEG_ANGLE
        m = modules['Stand_Module'].copy()
        m.data = modules['Stand_Module'].data          # share mesh data
        m.rotation_euler = (0, 0, ang)
        M.link(m, col)
        placed.append(m)

    # seats, laid out row by row on the terracing
    seat_src = modules['Seat']
    for r in range(0, ROWS, seat_stride):
        radius = STAND_R0 + r * ROW_DEPTH + ROW_DEPTH * 0.55
        z = DECK_Z + r * ROW_RISE
        count = max(8, int(2 * math.pi * radius / 0.52))
        for i in range(0, count, seat_stride):
            a = 2 * math.pi * i / count
            s = seat_src.copy()
            s.data = seat_src.data
            s.location = (radius * math.cos(a), radius * math.sin(a), z)
            s.rotation_euler = (0, 0, a + math.pi * 0.5)
            M.link(s, col)
            placed.append(s)

    # crowd cards, standing in the rows behind the seats
    card = modules['CrowdCard']
    for r in range(1, ROWS, seat_stride):
        radius = STAND_R0 + r * ROW_DEPTH + ROW_DEPTH * 0.20
        z = DECK_Z + r * ROW_RISE
        count = max(8, int(2 * math.pi * radius / 0.62))
        for i in range(0, count, seat_stride):
            a = 2 * math.pi * i / count
            c = card.copy()
            c.data = card.data
            c.location = (radius * math.cos(a), radius * math.sin(a), z)
            # billboarding is the shader's job in Godot; for the preview just
            # face each card inward at the pitch
            c.rotation_euler = (0, 0, a + math.pi * 0.5)
            M.link(c, col)
            placed.append(c)

    # hoardings ringing the boundary
    hoard = modules['Hoarding_Panel']
    n_h = int(2 * math.pi * HOARDING_R / 8.2)
    for i in range(n_h):
        a = 2 * math.pi * i / n_h
        h = hoard.copy()
        h.data = hoard.data
        x, y = HOARDING_R * math.cos(a), HOARDING_R * math.sin(a)
        h.location = (x, y, ground_height(x, y))
        h.rotation_euler = (0, 0, a + math.pi * 0.5)
        M.link(h, col)
        placed.append(h)

    # sightscreens behind both bowler's arms
    for sign in (1, -1):
        ss = modules['Sightscreen'].copy()
        ss.data = modules['Sightscreen'].data
        ss.location = (sign * (BOUNDARY_R + 7.0), 0, 0)
        ss.rotation_euler = (0, 0, math.radians(90))
        M.link(ss, col)
        placed.append(ss)

    # four towers on the diagonals
    for k in range(4):
        a = math.radians(45 + k * 90)
        for key in ('Floodlight_Tower', 'Floodlight_Lamps'):
            f = modules[key].copy()
            f.data = modules[key].data
            f.location = (104 * math.cos(a), 104 * math.sin(a), 0)
            f.rotation_euler = (0, 0, a + math.pi)
            M.link(f, col)
            placed.append(f)

    return col, placed


if __name__ == '__main__':
    M.reset_scene()
    col, mods = build_modules()
    for name, o in mods.items():
        print(f'  {name:22s} {M.tri_count(o):7d} tris')
    _, placed = assemble_bowl(mods)
    print(f'  assembled bowl: {len(placed)} instances')
