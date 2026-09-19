"""Mesh construction helpers shared by the asset generators.

Everything here exists to enforce the two rules that create the stylised
look: no unbevelled hard edges, and low-frequency shapes.
"""

import bpy  # must precede bmesh: bpy sets up the module search path
import bmesh
from mathutils import Vector
from math import radians


def reset_scene():
    """Empty scene, metric units, no default cube/camera/light."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'METERS'
    return scene


def new_collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def link(obj, collection=None):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def mesh_from_bmesh(bm, name, collection=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    return link(obj, collection)


def bevel(obj, width=0.003, segments=2, angle_deg=35.0, harden=True, clamp=True):
    """The single most important operation for this art style.

    Every hard edge gets a small rounded transition so it catches the sun as a
    thin highlight line. 2-3mm at 2 segments is the sweet spot -- large enough
    to read, small enough to stay invisible as geometry.
    """
    m = obj.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = radians(angle_deg)
    m.harden_normals = harden
    m.miter_outer = 'MITER_ARC'
    m.use_clamp_overlap = clamp
    return m


def subsurf(obj, levels=1, render=None):
    m = obj.modifiers.new('Subdivision', 'SUBSURF')
    m.levels = levels
    m.render_levels = render if render is not None else levels
    return m


def solidify(obj, thickness=0.01, offset=-1.0):
    m = obj.modifiers.new('Solidify', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = offset
    return m


def mirror(obj, axis=(True, False, False), bisect=True):
    m = obj.modifiers.new('Mirror', 'MIRROR')
    m.use_axis = axis
    if bisect:
        m.use_bisect_axis = axis
    return m


def apply_all_modifiers(obj):
    """Modifiers must be applied before export -- glTF bakes geometry only."""
    activate(obj)
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:
            obj.modifiers.remove(m)
    return obj


def shade_smooth(obj, angle_deg=32.0):
    """Angle-based smoothing keeps bevel highlights crisp while the broad
    surfaces stay soft."""
    activate(obj)
    bpy.ops.object.shade_smooth()
    try:
        bpy.ops.object.shade_auto_smooth(angle=radians(angle_deg))
    except Exception:
        pass
    return obj


def box(name, size=(1, 1, 1), location=(0, 0, 0), collection=None, pivot_bottom=False):
    sx, sy, sz = (s * 0.5 for s in size)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        if pivot_bottom:
            v.co.z += sz
    obj = mesh_from_bmesh(bm, name, collection)
    obj.location = location
    return obj


def cylinder(name, radius=0.5, depth=1.0, verts=16, location=(0, 0, 0),
             collection=None, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=cap, cap_tris=False, segments=verts,
        radius1=radius, radius2=radius, depth=depth,
    )
    obj = mesh_from_bmesh(bm, name, collection)
    obj.location = location
    return obj


def cone(name, r1=0.5, r2=0.2, depth=1.0, verts=16, location=(0, 0, 0),
         collection=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=verts,
        radius1=r1, radius2=r2, depth=depth,
    )
    obj = mesh_from_bmesh(bm, name, collection)
    obj.location = location
    return obj


def uv_sphere(name, radius=0.5, segments=16, rings=8, location=(0, 0, 0),
              collection=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(
        bm, u_segments=segments, v_segments=rings, radius=radius,
    )
    obj = mesh_from_bmesh(bm, name, collection)
    obj.location = location
    return obj


def plane(name, size_x=1.0, size_y=1.0, subdiv=0, location=(0, 0, 0),
          collection=None):
    bm = bmesh.new()
    bmesh.ops.create_grid(
        bm, x_segments=subdiv + 1, y_segments=subdiv + 1, size=0.5,
    )
    for v in bm.verts:
        v.co.x *= size_x
        v.co.y *= size_y
    obj = mesh_from_bmesh(bm, name, collection)
    obj.location = location
    return obj


def loft(name, sections, closed_caps=True, collection=None):
    """Build a tube by bridging a list of cross-sections.

    sections is a list of lists of (x, y, z) tuples; every section must have
    the same vertex count. This is how the bat blade, forearms and pads get
    their smooth tapering silhouettes.
    """
    bm = bmesh.new()
    rings = []
    for sec in sections:
        rings.append([bm.verts.new(Vector(p)) for p in sec])
    bm.verts.ensure_lookup_table()

    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))

    if closed_caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_from_bmesh(bm, name, collection)


def ring(cx, cy, z, rx, ry, n=12, rounded=0.0):
    """A closed cross-section. rounded>0 blends the rectangle toward an
    ellipse -- used for the bat blade (squarish) vs the handle (round)."""
    import math
    pts = []
    for i in range(n):
        t = 2.0 * math.pi * i / n
        ex, ey = math.cos(t), math.sin(t)
        # superellipse: p=2 is an ellipse, higher p approaches a rectangle
        p = 2.0 + (1.0 - rounded) * 3.0
        sx = math.copysign(abs(ex) ** (2.0 / p), ex)
        sy = math.copysign(abs(ey) ** (2.0 / p), ey)
        pts.append((cx + sx * rx, cy + sy * ry, z))
    return pts


def set_origin(obj, point):
    """Move the object origin without moving the mesh in world space."""
    offset = Vector(point) - obj.location
    me = obj.data
    for v in me.vertices:
        v.co -= offset
    obj.location = Vector(point)
    return obj


def join(objs, name=None):
    activate(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    if name:
        result.name = name
        result.data.name = name
    return result


def smart_uv(obj, angle_deg=66.0, margin=0.005):
    activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=radians(angle_deg), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def tri_count(obj):
    me = obj.data
    return sum(len(p.vertices) - 2 for p in me.polygons)


def tube_along_path(name, points, radius, n=8, collection=None, caps=True):
    """Sweep a circular cross-section along an arbitrary 3D path.

    Rings are oriented perpendicular to the path using parallel transport --
    a reference vector carried along the curve and re-orthogonalised at each
    step, rather than recomputed from a fixed world axis. The naive approach
    (always cross with world Z) flips the frame wherever the path turns
    vertical, which puts a visible twist in the mesh.

    `radius` may be a scalar or a per-point sequence, so a finger can taper.
    """
    import math as _math
    pts = [Vector(p) for p in points]
    count = len(pts)
    radii = [radius] * count if isinstance(radius, (int, float)) else list(radius)

    tangents = []
    for i in range(count):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == count - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        tangents.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))

    # seed a reference perpendicular to the first tangent
    seed = Vector((0, 0, 1))
    if abs(seed.dot(tangents[0])) > 0.95:
        seed = Vector((1, 0, 0))
    normal = (seed - tangents[0] * seed.dot(tangents[0])).normalized()

    bm = bmesh.new()
    rings = []
    for i in range(count):
        t = tangents[i]
        # re-orthogonalise the carried normal against the new tangent
        normal = (normal - t * normal.dot(t))
        if normal.length < 1e-7:
            alt = Vector((1, 0, 0)) if abs(t.x) < 0.9 else Vector((0, 1, 0))
            normal = (alt - t * alt.dot(t))
        normal.normalize()
        binormal = t.cross(normal)

        r = radii[i]
        ring_verts = []
        for k in range(n):
            a = 2.0 * _math.pi * k / n
            off = normal * (_math.cos(a) * r) + binormal * (_math.sin(a) * r)
            ring_verts.append(bm.verts.new(pts[i] + off))
        rings.append(ring_verts)

    bm.verts.ensure_lookup_table()
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_from_bmesh(bm, name, collection)


def arc_points(centre, axis_z, radius, a_from, a_to, steps, z_drift=0.0):
    """Points on a circular arc in the plane perpendicular to +Z, centred on
    `centre`, optionally drifting along Z. Used to wrap fingers around a bat
    handle."""
    import math as _math
    cx, cy = centre[0], centre[1]
    out = []
    for i in range(steps + 1):
        f = i / steps
        a = _math.radians(a_from + (a_to - a_from) * f)
        out.append((cx + radius * _math.cos(a),
                    cy + radius * _math.sin(a),
                    axis_z + z_drift * f))
    return out


def apply_transform(obj, location=False, rotation=True, scale=True):
    """Bake the object's transform into its mesh data.

    Needed whenever a part is authored along one axis and then rotated into
    place: leaving the rotation on the object means the exported glTF carries
    it, and any later code that assigns `.location` or reads local coordinates
    sees a different frame than the author intended.
    """
    activate(obj)
    bpy.ops.object.transform_apply(location=location, rotation=rotation,
                                   scale=scale)
    return obj


def ring_xz(cx, cz, y, rx, rz, n=12, rounded=1.0):
    """A cross-section lying in the XZ plane, for lofting ALONG Y.

    `ring()` always builds in the XY plane, so it is only correct for parts
    swept along Z. Using it for something swept along Y -- a shoe, a helmet
    peak -- bridges a stack of flat ellipses into a twisted ribbon, which is
    exactly what turned the first shoe into a surfboard. Sweep direction and
    cross-section plane must be perpendicular.
    """
    import math as _math
    pts = []
    for i in range(n):
        t = 2.0 * _math.pi * i / n
        ex, ez = _math.cos(t), _math.sin(t)
        p = 2.0 + (1.0 - rounded) * 3.0
        sx = _math.copysign(abs(ex) ** (2.0 / p), ex)
        sz = _math.copysign(abs(ez) ** (2.0 / p), ez)
        pts.append((cx + sx * rx, y, cz + sz * rz))
    return pts
