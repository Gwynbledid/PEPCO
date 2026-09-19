"""Outfield, pitch, creases, stumps and boundary rope.

Real dimensions throughout (metres). Getting these right matters more than it
sounds: a batsman-POV camera sits 1.65m above a surface whose curvature and
scale the player reads instantly, and a wrong-sized pitch feels wrong long
before anyone can say why.

    pitch length (stump to stump)   20.12 m  (22 yards)
    pitch width                      3.05 m  (10 ft)
    popping crease ahead of stumps   1.22 m  (4 ft)
    return creases either side       1.32 m
    stump height                     0.71 m
    boundary radius                 68.00 m
"""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import bmesh
from lib import meshutil as M, mat

# --- ground constants ---------------------------------------------------
FIELD_R      = 78.0    # outfield mesh radius (extends past the rope)
BOUNDARY_R   = 68.0    # boundary rope
CROWN        = 0.45    # centre rises this far above the rope -- real grounds
                       # are domed for drainage, and it sets the horizon line
PITCH_LEN    = 20.12
PITCH_WIDTH  = 3.05
PITCH_PAD    = 2.4     # prepared strip runs past the stumps at each end
POPPING      = 1.22
RETURN_OFF   = 1.32
LINE_W       = 0.038
STUMP_H      = 0.711
STUMP_R      = 0.0179
STUMP_SPREAD = 0.2286


def ground_height(x, y):
    """The crown. Every other asset must sit on this surface, so this function
    is the single source of truth -- import it, don't re-derive it."""
    r = math.hypot(x, y)
    t = min(r / FIELD_R, 1.0)
    return CROWN * (1.0 - t * t)


def build_outfield(col):
    """Radial grid, densest at the centre where the camera lives."""
    RADIAL, RINGS = 96, 44
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')

    centre = bm.verts.new((0, 0, ground_height(0, 0)))
    rings = []
    for j in range(1, RINGS + 1):
        # exponent > 1 packs vertices toward the middle of the ground
        r = FIELD_R * (j / RINGS) ** 1.7
        row = []
        for i in range(RADIAL):
            a = 2.0 * math.pi * i / RADIAL
            x, y = r * math.cos(a), r * math.sin(a)
            row.append(bm.verts.new((x, y, ground_height(x, y))))
        rings.append(row)
    bm.verts.ensure_lookup_table()

    for i in range(RADIAL):
        j = (i + 1) % RADIAL
        bm.faces.new((centre, rings[0][i], rings[0][j]))
    for a, b in zip(rings, rings[1:]):
        for i in range(RADIAL):
            j = (i + 1) % RADIAL
            bm.faces.new((a[i], a[j], b[j], b[i]))

    # World-aligned UVs so the mown stripes tile at a real-world scale
    # regardless of how the mesh is subdivided. 1 UV unit = 8 m.
    for f in bm.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (co.x / 8.0, co.y / 8.0)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = M.mesh_from_bmesh(bm, 'Outfield', col)
    mat.assign(obj, mat.mown_grass())
    M.shade_smooth(obj, angle_deg=60)
    return obj


def build_pitch(col):
    """The prepared strip, lifted 12mm proud of the outfield so it reads as a
    distinct surface and never z-fights."""
    half_len = PITCH_LEN * 0.5 + PITCH_PAD
    half_w = PITCH_WIDTH * 0.5
    NX, NY = 40, 8
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')

    grid = []
    for iy in range(NY + 1):
        y = -half_w + PITCH_WIDTH * iy / NY
        row = []
        for ix in range(NX + 1):
            x = -half_len + 2 * half_len * ix / NX
            row.append(bm.verts.new((x, y, ground_height(x, y) + 0.012)))
        grid.append(row)
    bm.verts.ensure_lookup_table()

    for iy in range(NY):
        for ix in range(NX):
            f = bm.faces.new((grid[iy][ix], grid[iy][ix + 1],
                              grid[iy + 1][ix + 1], grid[iy + 1][ix]))
            for loop in f.loops:
                co = loop.vert.co
                loop[uv_layer].uv = (co.x / (2 * half_len) + 0.5,
                                     co.y / PITCH_WIDTH + 0.5)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = M.mesh_from_bmesh(bm, 'Pitch', col)
    mat.assign(obj, mat.pitch())
    M.shade_smooth(obj, angle_deg=60)
    return obj


def _line_quad(bm, uv_layer, x0, y0, x1, y1, width, z_off=0.014):
    """One painted crease line as a flat quad hugging the crown."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    nx, ny = -dy / L * width * 0.5, dx / L * width * 0.5
    corners = [(x0 - nx, y0 - ny), (x1 - nx, y1 - ny),
               (x1 + nx, y1 + ny), (x0 + nx, y0 + ny)]
    vs = [bm.verts.new((cx, cy, ground_height(cx, cy) + z_off))
          for cx, cy in corners]
    f = bm.faces.new(vs)
    for i, loop in enumerate(f.loops):
        loop[uv_layer].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][i]
    return f


def build_creases(col):
    """Bowling, popping and return creases at both ends, to Law 7."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    half = PITCH_LEN * 0.5

    for sign in (1, -1):
        stump_x = sign * half
        pop_x = stump_x - sign * POPPING   # popping crease is in front of
                                           # the stumps, toward the middle
        # bowling crease: 2.64 m wide, centred on the stumps
        _line_quad(bm, uv_layer, stump_x, -1.32, stump_x, 1.32, LINE_W)
        # popping crease: drawn 1.83 m either side of middle
        _line_quad(bm, uv_layer, pop_x, -1.83, pop_x, 1.83, LINE_W)
        # return creases: run from behind the stumps to the popping crease
        back_x = stump_x + sign * 1.22
        for ry in (-RETURN_OFF, RETURN_OFF):
            _line_quad(bm, uv_layer, back_x, ry, pop_x, ry, LINE_W)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = M.mesh_from_bmesh(bm, 'Creases', col)
    mat.assign(obj, mat.crease())
    return obj


def build_stumps(col, at_x, name):
    """Three stumps and two bails. Chunky by 1.15x -- true-scale stumps read as
    spindly under a stylised sun, a standard trick in sports art."""
    parts = []
    r = STUMP_R * 1.15
    for k in (-1, 0, 1):
        y = k * STUMP_SPREAD * 0.5
        z0 = ground_height(at_x, y)
        s = M.cylinder(f'{name}_stump{k}', radius=r, depth=STUMP_H, verts=12,
                       location=(at_x, y, z0 + STUMP_H * 0.5), collection=col)
        # tapered tip, as a turned stump has
        top = M.cone(f'{name}_tip{k}', r1=r, r2=r * 0.72, depth=0.05, verts=12,
                     location=(at_x, y, z0 + STUMP_H + 0.025), collection=col)
        parts += [s, top]

    for k in (-1, 1):
        y = k * STUMP_SPREAD * 0.25
        z0 = ground_height(at_x, y)
        b = M.cylinder(f'{name}_bail{k}', radius=r * 0.62, depth=0.111, verts=10,
                       location=(at_x, y, z0 + STUMP_H + 0.052), collection=col)
        b.rotation_euler = (math.radians(90), 0, 0)
        parts.append(b)

    obj = M.join(parts, name)
    M.bevel(obj, width=0.0025, segments=2)
    M.apply_all_modifiers(obj)
    M.shade_smooth(obj, angle_deg=40)
    M.smart_uv(obj)
    mat.assign(obj, mat.willow())
    M.set_origin(obj, (at_x, 0, ground_height(at_x, 0)))
    return obj


def build_boundary_rope(col):
    """A real rope, not a painted line -- it catches the sun and gives the
    outfield a readable edge from the batsman's eye height."""
    SEG = 160
    sections = []
    for i in range(SEG + 1):
        a = 2.0 * math.pi * i / SEG
        cx, cy = BOUNDARY_R * math.cos(a), BOUNDARY_R * math.sin(a)
        z = ground_height(cx, cy) + 0.05
        ring = []
        for k in range(6):
            t = 2.0 * math.pi * k / 6
            # rope cross-section offset along the radial normal
            ox = math.cos(t) * 0.05 * math.cos(a)
            oy = math.cos(t) * 0.05 * math.sin(a)
            ring.append((cx + ox, cy + oy, z + math.sin(t) * 0.05))
        sections.append(ring)
    obj = M.loft('BoundaryRope', sections, closed_caps=False, collection=col)
    M.shade_smooth(obj, angle_deg=60)
    M.smart_uv(obj)
    mat.assign(obj, mat.crease())
    return obj


def build(col=None):
    col = col or M.new_collection('Ground')
    objs = [
        build_outfield(col),
        build_pitch(col),
        build_creases(col),
        build_stumps(col, PITCH_LEN * 0.5, 'Stumps_Bowler'),
        build_stumps(col, -PITCH_LEN * 0.5, 'Stumps_Striker'),
        build_boundary_rope(col),
    ]
    return col, objs


if __name__ == '__main__':
    M.reset_scene()
    col, objs = build()
    total = sum(M.tri_count(o) for o in objs)
    for o in objs:
        print(f'  {o.name:22s} {M.tri_count(o):7d} tris')
    print(f'  {"TOTAL":22s} {total:7d} tris')
