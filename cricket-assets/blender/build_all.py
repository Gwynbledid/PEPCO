"""Build every asset, export glTF for Godot, and render preview stills.

    python3 build_all.py              # export + render
    python3 build_all.py --no-render  # export only (fast)
    python3 build_all.py --res 1920 1080 --samples 96

Headless rendering needs a GL context. In a container without a GPU:
    apt-get install -y xvfb libegl1 libgl1-mesa-dri libglx-mesa0
    LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
        xvfb-run -a -s "-screen 0 1920x1080x24" python3 build_all.py
Without a GL context EEVEE does not error -- it silently writes a blank white
frame, which is a genuinely nasty way to lose an afternoon.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M
import build_ground
import build_stadium
import build_viewmodel
import build_lookdev

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORT_DIR = os.path.join(ROOT, 'exports')
RENDER_DIR = os.path.join(ROOT, 'renders')


def export_selected(objs, filename):
    """One glTF per logical asset group.

    Modules are exported SEPARATELY and at the origin so Godot can
    MultiMesh-instance them. Do not export the assembled bowl -- that is a
    preview convenience only and would be a ~200 MB file of duplicated
    geometry.
    """
    os.makedirs(EXPORT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(EXPORT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,              # Godot and glTF are both Y-up
        export_materials='EXPORT',
        export_normals=True,
        export_tangents=False,
        export_texcoords=True,
    )
    tris = sum(M.tri_count(o) for o in objs)
    print(f'  {filename:28s} {tris:7d} tris  {os.path.getsize(path)/1024:8.1f} KB')
    return path


def render(camera, filename, samples, resolution):
    os.makedirs(RENDER_DIR, exist_ok=True)
    scene = bpy.context.scene
    scene.camera = camera
    build_lookdev.configure_render(samples=samples, resolution=resolution)
    scene.render.filepath = os.path.join(RENDER_DIR, filename)
    bpy.ops.render.render(write_still=True)
    print(f'  rendered {filename}')
    return scene.render.filepath


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-render', action='store_true')
    ap.add_argument('--no-export', action='store_true')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--res', type=int, nargs=2, default=(1600, 900))
    args = ap.parse_args()

    M.reset_scene()

    print('building ground...')
    _, ground_objs = build_ground.build()

    print('building stadium modules...')
    _, modules = build_stadium.build_modules()

    print('building viewmodel...')
    _, vm_objs = build_viewmodel.build()

    print('building lighting rig...')
    lighting_col, rig = build_lookdev.build()

    if not args.no_export:
        print('\nexporting glTF:')
        export_selected(ground_objs, 'ground.glb')
        # BEFORE attach_to_camera, deliberately. The engine applies its own
        # camera-local offset and basis change (batsman_pov.gd mirrors
        # attach_to_camera exactly), so the export has to carry the viewmodel
        # in its AUTHORED frame. Exporting after the attach bakes this scene's
        # POV camera world transform into every node, and the engine then
        # stacks its offset on top and puts the bat 8 m across the square,
        # behind the camera, where it is invisible and looks like a missing
        # asset rather than a misplaced one.
        export_selected(vm_objs, 'viewmodel.glb')
        for key in ('Stand_Module', 'Roof_Module', 'Signage_Module',
                    'Box_Module', 'Box_Glass', 'Box_Details',
                    'RoofSign_Module', 'Seat',
                    'CrowdCard', 'Sightscreen', 'Floodlight_Tower',
                    'Floodlight_Lamps', 'Tree',
                    'Hoarding_00', 'Hoarding_01', 'Hoarding_02',
                    'Hoarding_03', 'Hoarding_04', 'Hoarding_05'):
            if key in modules:
                export_selected([modules[key]], f'{key.lower()}.glb')

    # Now the viewmodel can ride the POV camera -- for the preview renders
    # only; the export above is the one the engine consumes.
    build_viewmodel.attach_to_camera(rig['pov'], vm_objs,
                                     collection=lighting_col)

    if not args.no_render:
        print('\nassembling bowl for preview...')
        build_stadium.assemble_bowl(modules)
        # the origin-placed modules would otherwise sit in shot at the centre
        for key, o in modules.items():
            if key.startswith('_'):
                for c in o:
                    c.hide_render = True
            else:
                o.hide_render = True
        print('rendering:')
        render(rig['reference'], 'reference.png', args.samples, tuple(args.res))
        render(rig['pov'], 'pov.png', args.samples, tuple(args.res))
        for o in vm_objs:
            o.hide_render = True          # the viewmodel is camera-locked and
                                          # would hang in mid-air in a
                                          # third-person shot
        render(rig['hero'], 'hero.png', args.samples, tuple(args.res))

    print('\ndone.')


if __name__ == '__main__':
    main()
