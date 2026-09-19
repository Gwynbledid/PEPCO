"""Armature and skinning for the batsman.

Two binding strategies, because the character is two different kinds of thing:

  * SOFT parts -- torso, arms, legs, sleeves, head -- are skinned with
    automatic weights, so they bend at the joints.
  * RIGID parts -- helmet, pads, shoes, gloves, bat -- get a single vertex
    group at weight 1.0 naming their bone, and bind with ARMATURE_NAME. A
    helmet should not deform when the neck turns; it should travel with the
    head as a solid object. Running automatic weights over them would smear
    each one across two or three bones and visibly warp it.

Bones are authored in the same +Y-facing frame as the body, so this must run
BEFORE the stance rotation is applied.

    python3 build_rig.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M

# (name, parent, head, tail)
SKELETON = [
    ('root',        None,      (0.000, 0.000, 0.000), (0.000, 0.120, 0.000)),
    ('hips',        'root',    (0.000, 0.004, 0.920), (0.000, 0.004, 1.050)),
    ('spine',       'hips',    (0.000, 0.004, 1.050), (0.000, 0.006, 1.220)),
    ('chest',       'spine',   (0.000, 0.006, 1.220), (0.000, 0.006, 1.400)),
    ('neck',        'chest',   (0.000, 0.006, 1.400), (0.000, 0.008, 1.487)),
    ('head',        'neck',    (0.000, 0.008, 1.487), (0.000, 0.010, 1.700)),

    ('shoulder.L',  'chest',   (0.000, 0.006, 1.385), (-0.141, 0.006, 1.410)),
    ('upperarm.L',  'shoulder.L', (-0.141, 0.006, 1.410), (-0.105, 0.160, 1.150)),
    ('forearm.L',   'upperarm.L', (-0.105, 0.160, 1.150), (0.093, 0.264, 1.098)),
    ('hand.L',      'forearm.L',  (0.093, 0.264, 1.098), (0.100, 0.268, 1.040)),

    ('shoulder.R',  'chest',   (0.000, 0.006, 1.385), (0.141, 0.006, 1.410)),
    ('upperarm.R',  'shoulder.R', (0.141, 0.006, 1.410), (0.196, 0.168, 1.105)),
    ('forearm.R',   'upperarm.R', (0.196, 0.168, 1.105), (0.111, 0.270, 0.985)),
    ('hand.R',      'forearm.R',  (0.111, 0.270, 0.985), (0.108, 0.272, 0.930)),

    ('thigh.L',     'hips',    (-0.086, 0.006, 0.940), (-0.102, 0.040, 0.500)),
    ('shin.L',      'thigh.L', (-0.102, 0.040, 0.500), (-0.098, 0.000, 0.105)),
    ('foot.L',      'shin.L',  (-0.098, 0.000, 0.105), (-0.098, -0.110, 0.020)),

    ('thigh.R',     'hips',    (0.086, 0.006, 0.940), (0.102, 0.040, 0.500)),
    ('shin.R',      'thigh.R', (0.102, 0.040, 0.500), (0.098, 0.000, 0.105)),
    ('foot.R',      'shin.R',  (0.098, 0.000, 0.105), (0.098, -0.110, 0.020)),

    # the bat rides the bottom hand, so a swing is one bone's rotation
    ('bat',         'hand.R',  (0.105, 0.268, 0.985), (0.105, 0.268, 1.300)),
]

CONNECTED = {'spine', 'chest', 'neck', 'head', 'upperarm.L', 'forearm.L',
             'hand.L', 'upperarm.R', 'forearm.R', 'hand.R',
             'shin.L', 'foot.L', 'shin.R', 'foot.R'}

# rigid kit -> the bone it rides
RIGID_BINDING = {
    'Helmet': 'head', 'Helmet_Grille': 'head',
    'Pad.L': 'shin.L', 'Pad_Straps.L': 'shin.L',
    'Pad.R': 'shin.R', 'Pad_Straps.R': 'shin.R',
    'Shoe.L': 'foot.L', 'Shoe_Dark.L': 'foot.L', 'Shoe_Studs.L': 'foot.L',
    'Shoe.R': 'foot.R', 'Shoe_Dark.R': 'foot.R', 'Shoe_Studs.R': 'foot.R',
    'Glove_Top': 'hand.L', 'Glove_Bottom': 'hand.R',
    'Bat': 'bat',
}
SOFT_PARTS = ('Torso', 'Legs', 'Arms', 'Sleeves', 'Head')


def build_armature(col=None, name='Batsman_Rig'):
    col = col or bpy.context.scene.collection
    data = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, data)
    M.link(rig, col)

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones
    for bname, parent, head, tail in SKELETON:
        b = eb.new(bname)
        b.head, b.tail = head, tail
        if parent:
            b.parent = eb[parent]
            b.use_connect = bname in CONNECTED
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind_rigid(obj, rig, bone):
    """One vertex group at weight 1.0, then ARMATURE_NAME.

    Deliberately NOT automatic weights: a helmet or a bat is a solid object
    that travels with one bone. Automatic weights would spread it over
    neighbouring bones and warp it whenever a joint moved.
    """
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    vg = obj.vertex_groups.new(name=bone)
    vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    mod.use_vertex_groups = True
    return obj


def bind_soft(objs, rig):
    """Automatic weights for the deforming body parts."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    return objs


def rig_character(objs, col=None):
    """Bind an assembled (UNPOSED) batsman to a new armature."""
    rig = build_armature(col)
    by_name = {}
    for o in objs:
        by_name.setdefault(o.name.split('.')[0] if o.name not in RIGID_BINDING
                           else o.name, []).append(o)

    soft, bound = [], []
    for o in objs:
        bone = RIGID_BINDING.get(o.name)
        if bone is None:
            base = o.name.rsplit('.', 1)[0]
            bone = RIGID_BINDING.get(base)
        if bone is not None and bone in {b[0] for b in SKELETON}:
            bind_rigid(o, rig, bone)
            bound.append(o)
        elif any(o.name.startswith(p) for p in SOFT_PARTS):
            soft.append(o)
    if soft:
        bind_soft(soft, rig)
    return rig, soft, bound


if __name__ == '__main__':
    import build_body as B
    M.reset_scene()
    col, objs = B.assemble(stance_deg=0.0)
    rig, soft, bound = rig_character(objs, col)
    print(f'  bones        {len(rig.data.bones)}')
    print(f'  skinned      {len(soft)}  ({", ".join(o.name for o in soft)})')
    print(f'  bone-bound   {len(bound)}')
    unbound = [o.name for o in objs if o not in soft and o not in bound]
    print(f'  UNBOUND      {len(unbound)}  {unbound}')
