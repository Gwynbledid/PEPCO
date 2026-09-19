"""Export the rigged batsman as a skinned glTF for the engine.

Exported UNPOSED in the authoring frame with the armature included, so the
engine receives a skeleton it can drive rather than a frozen statue. Godot
imports this as a Skeleton3D plus skinned MeshInstance3Ds.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M
import build_body as B
import build_rig as R

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORT_DIR = os.path.join(ROOT, 'exports')


def main():
    M.reset_scene()
    col, objs = B.assemble(stance_deg=0.0)
    rig, soft, bound = R.rig_character(objs, col)

    os.makedirs(EXPORT_DIR, exist_ok=True)
    path = os.path.join(EXPORT_DIR, 'batsman.glb')

    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=False,          # MUST be False: applying modifiers would
                                     # bake out the Armature modifier and ship
                                     # a statue instead of a rig
        export_skins=True,
        export_yup=True,
        export_materials='EXPORT',
        export_normals=True,
        export_texcoords=True,
        export_def_bones=False,
    )
    tris = sum(M.tri_count(o) for o in objs)
    print(f'  batsman.glb  {len(rig.data.bones)} bones, {len(objs)} meshes, '
          f'{tris} tris, {os.path.getsize(path)/1024:.1f} KB')


if __name__ == '__main__':
    main()
