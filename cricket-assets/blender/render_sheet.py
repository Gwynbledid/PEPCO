"""Render each asset on its own, under the real game lighting rig.

Scene shots hide the individual assets behind depth of field and distance.
This puts each one on a neutral pad under the same sun / skylight / grass
bounce, framed automatically from its bounding box, so you can actually see
what the geometry looks like.

    LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
      xvfb-run -a -s "-screen 0 1920x1080x24" python3 render_sheet.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Vector
from lib import meshutil as M, mat
import build_ground
import build_stadium
import build_viewmodel
import build_lookdev

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'renders')
TILE = 520
SAMPLES = 48


def world_bbox(objs):
    # matrix_world is CACHED. Setting obj.location from Python does not
    # refresh it until the depsgraph is evaluated, so reading it straight
    # after a move silently returns the old transform -- which framed the bat
    # as if it still sat at its pre-anchor height and buried the blade under
    # the shadow pad. Force the update before trusting any world-space read.
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        for corner in o.bound_box:
            pts.append(o.matrix_world @ Vector(corner))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def frame_camera(cam, objs, azimuth_deg=38.0, elevation_deg=22.0, pad=1.55):
    """Place the camera so the selection fills the frame from a 3/4 view."""
    lo, hi = world_bbox(objs)
    centre = (lo + hi) * 0.5
    radius = max((hi - lo).length * 0.5, 1e-3)

    fov = cam.data.angle
    dist = (radius / math.tan(fov * 0.5)) * pad

    a, e = math.radians(azimuth_deg), math.radians(elevation_deg)
    offset = Vector((math.cos(e) * math.cos(a),
                     math.cos(e) * math.sin(a),
                     math.sin(e))) * dist
    cam.location = centre + offset

    direction = (centre - cam.location).normalized()
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return centre, radius


def main():
    M.reset_scene()

    ground_col, ground_objs = build_ground.build()
    _, modules = build_stadium.build_modules()
    _, vm_objs = build_viewmodel.build()
    light_col, rig = build_lookdev.build(with_cameras=False)

    by_name = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}

    # a neutral pad so each asset has something to cast a shadow onto
    pad = M.plane('StudioPad', size_x=400, size_y=400, location=(0, 0, -0.001))
    mat.assign(pad, mat._principled('M_StudioPad', (0.52, 0.53, 0.55), 0.7))

    cam_data = bpy.data.cameras.new('SheetCam')
    cam_data.lens = 70.0            # long-ish: minimal perspective distortion
    cam_data.clip_start = 0.005
    cam_data.clip_end = 2000.0
    cam = bpy.data.objects.new('SheetCam', cam_data)
    M.link(cam, light_col)
    bpy.context.scene.camera = cam

    shots = [
        ('01_bat',          ['Bat']),
        ('02_glove',        ['Glove_Bottom']),
        ('03_viewmodel',    [o.name for o in vm_objs if o.name != 'HelmetGrille']),
        ('04_stumps',       ['Stumps_Bowler']),
        ('05_seat',         ['Seat']),
        ('06_stand_module', ['Stand_Module']),
        ('07_sightscreen',  ['Sightscreen']),
        ('08_floodlight',   ['Floodlight_Tower', 'Floodlight_Lamps']),
        ('09_hoarding',     ['Hoarding_Panel']),
    ]

    build_lookdev.configure_render(samples=SAMPLES, resolution=(TILE, TILE))
    os.makedirs(OUT, exist_ok=True)

    all_meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for name, members in shots:
        objs = [by_name[m] for m in members if m in by_name]
        if not objs:
            print(f'  SKIP {name}: not found')
            continue
        for o in all_meshes:
            o.hide_render = o not in objs and o is not pad
        frame_camera(cam, objs)

        # drop the pad to just under the asset so it reads as a shadow catcher
        lo, _ = world_bbox(objs)
        pad.location.z = lo.z - 0.002

        path = os.path.join(OUT, f'asset_{name}.png')
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tris = sum(M.tri_count(o) for o in objs)
        print(f'  {name:18s} {tris:6d} tris -> {os.path.basename(path)}')

    print('done')


if __name__ == '__main__':
    main()
