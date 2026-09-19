"""Animation clips for the rigged batsman.

Poses are dicts of bone -> (rx, ry, rz) in DEGREES; clips are lists of
(frame, pose). Every clip is authored from the same STANCE base so they blend
into one another without the figure snapping between neutral and crouched.

One rule throughout: every bone a clip touches is keyed at EVERY keyframe of
that clip, even where it does not move. Keying only the bones that change
lets values from a previous keyframe interpolate forwards -- the arm carries
on drifting through a shot because nothing told it to hold -- and on a looping
clip it leaks across the loop point.

Each action is pushed to its own NLA track so the glTF exporter emits all of
them as separate animations rather than only the active one.

    python3 build_anim.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M

# The ready position every clip is built from: knees bent, weight forward,
# head turned down the pitch.
STANCE = {
    'hips': (12, 0, 0), 'spine': (8, 0, -5), 'chest': (4, 0, -8),
    'neck': (-4, 0, 6), 'head': (-12, 0, 12),
    'thigh.L': (24, 0, 0), 'shin.L': (-40, 0, 0), 'foot.L': (14, 0, 0),
    'thigh.R': (18, 0, 0), 'shin.R': (-32, 0, 0), 'foot.R': (12, 0, 0),
    'shoulder.L': (0, 0, 4), 'upperarm.L': (-10, 0, 6), 'forearm.L': (-16, 0, 0),
    'shoulder.R': (0, 0, -4), 'upperarm.R': (-8, 0, -6), 'forearm.R': (-14, 0, 0),
    'bat': (0, 0, 0),
}


def _merge(*overrides):
    pose = dict(STANCE)
    for o in overrides:
        pose.update(o)
    return pose


CLIPS = {
    # gentle weight shift and a bat tap, loops cleanly back to frame 0
    'idle': (61, [
        (0,  _merge()),
        (15, _merge({'hips': (12, 0, 3), 'spine': (9, 0, -4),
                     'bat': (-8, 0, 0), 'upperarm.R': (-12, 0, -6)})),
        (30, _merge({'hips': (13, 0, 0), 'head': (-12, 0, 14),
                     'bat': (-2, 0, 0)})),
        (45, _merge({'hips': (12, 0, -3), 'spine': (7, 0, -6),
                     'bat': (-7, 0, 0), 'upperarm.L': (-13, 0, 6)})),
        (60, _merge()),
    ]),

    # held ready position
    'stance': (2, [(0, _merge()), (1, _merge())]),

    # backlift -> downswing -> impact -> follow through
    'shot_drive': (41, [
        (0,  _merge()),
        (8,  _merge({'bat': (-78, 0, 0), 'upperarm.R': (-46, 0, -20),
                     'forearm.R': (-34, 0, 0), 'upperarm.L': (-40, 0, 16),
                     'forearm.L': (-28, 0, 0), 'chest': (4, 0, -22),
                     'head': (-14, 0, 16)})),
        (14, _merge({'bat': (-66, 0, 0), 'upperarm.R': (-40, 0, -14),
                     'chest': (6, 0, -16), 'hips': (14, 0, -6),
                     'thigh.L': (34, 0, 0), 'shin.L': (-30, 0, 0)})),
        (20, _merge({'bat': (18, 0, 0), 'upperarm.R': (12, 0, 4),
                     'forearm.R': (-6, 0, 0), 'upperarm.L': (8, 0, -4),
                     'forearm.L': (-8, 0, 0), 'chest': (8, 0, 6),
                     'hips': (18, 0, 8), 'thigh.L': (40, 0, 0),
                     'shin.L': (-22, 0, 0), 'head': (-18, 0, 6)})),
        (30, _merge({'bat': (-34, 0, 44), 'upperarm.R': (-30, 0, 26),
                     'forearm.R': (-52, 0, 0), 'upperarm.L': (-26, 0, -18),
                     'forearm.L': (-46, 0, 0), 'chest': (4, 0, 22),
                     'hips': (16, 0, 12), 'head': (-14, 0, -4)})),
        (40, _merge()),
    ]),

    # running between the wickets, loops at 32 frames
    'run': (33, [
        (0,  _merge({'hips': (18, 0, 0), 'spine': (12, 0, 0), 'chest': (6, 0, 0),
                     'head': (-18, 0, 0),
                     'thigh.L': (42, 0, 0), 'shin.L': (-18, 0, 0),
                     'thigh.R': (-22, 0, 0), 'shin.R': (-46, 0, 0),
                     'upperarm.L': (-38, 0, 8), 'forearm.L': (-62, 0, 0),
                     'upperarm.R': (34, 0, -8), 'forearm.R': (-44, 0, 0),
                     'bat': (-24, 0, 18)})),
        (8,  _merge({'hips': (20, 0, 0), 'spine': (13, 0, 0), 'chest': (7, 0, 0),
                     'head': (-18, 0, 0),
                     'thigh.L': (10, 0, 0), 'shin.L': (-52, 0, 0),
                     'thigh.R': (6, 0, 0), 'shin.R': (-20, 0, 0),
                     'upperarm.L': (-6, 0, 8), 'forearm.L': (-50, 0, 0),
                     'upperarm.R': (4, 0, -8), 'forearm.R': (-50, 0, 0),
                     'bat': (-24, 0, 18)})),
        (16, _merge({'hips': (18, 0, 0), 'spine': (12, 0, 0), 'chest': (6, 0, 0),
                     'head': (-18, 0, 0),
                     'thigh.L': (-22, 0, 0), 'shin.L': (-46, 0, 0),
                     'thigh.R': (42, 0, 0), 'shin.R': (-18, 0, 0),
                     'upperarm.L': (34, 0, 8), 'forearm.L': (-44, 0, 0),
                     'upperarm.R': (-38, 0, -8), 'forearm.R': (-62, 0, 0),
                     'bat': (-24, 0, 18)})),
        (24, _merge({'hips': (20, 0, 0), 'spine': (13, 0, 0), 'chest': (7, 0, 0),
                     'head': (-18, 0, 0),
                     'thigh.L': (6, 0, 0), 'shin.L': (-20, 0, 0),
                     'thigh.R': (10, 0, 0), 'shin.R': (-52, 0, 0),
                     'upperarm.L': (4, 0, 8), 'forearm.L': (-50, 0, 0),
                     'upperarm.R': (-6, 0, -8), 'forearm.R': (-50, 0, 0),
                     'bat': (-24, 0, 18)})),
        (32, _merge({'hips': (18, 0, 0), 'spine': (12, 0, 0), 'chest': (6, 0, 0),
                     'head': (-18, 0, 0),
                     'thigh.L': (42, 0, 0), 'shin.L': (-18, 0, 0),
                     'thigh.R': (-22, 0, 0), 'shin.R': (-46, 0, 0),
                     'upperarm.L': (-38, 0, 8), 'forearm.L': (-62, 0, 0),
                     'upperarm.R': (34, 0, -8), 'forearm.R': (-44, 0, 0),
                     'bat': (-24, 0, 18)})),
    ]),
}


def _action_fcurves(action):
    """Every f-curve in an action, across the legacy and slotted layouts."""
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                out.extend(bag.fcurves)
    return out


def apply_pose(rig, pose):
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
    for bone, (rx, ry, rz) in pose.items():
        pb = rig.pose.bones.get(bone)
        if pb is None:
            continue
        pb.rotation_euler = (math.radians(rx), math.radians(ry),
                             math.radians(rz))


def make_action(rig, name, length, keys):
    """Build one action, keying every touched bone at every keyframe."""
    touched = sorted({b for _, pose in keys for b in pose})

    if rig.animation_data is None:
        rig.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action

    for frame, pose in keys:
        apply_pose(rig, pose)
        for bone in touched:
            pb = rig.pose.bones.get(bone)
            if pb is not None:
                pb.keyframe_insert(data_path='rotation_euler', frame=frame)

    # Blender 4.4+ moved f-curves into slotted actions: an action owns layers,
    # each layer owns strips, and a strip's channelbag per slot holds the
    # curves. `action.fcurves` no longer exists.
    for fc in _action_fcurves(action):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'AUTO'

    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    track.mute = True
    return action


def build_all(rig):
    actions = {}
    for name, (length, keys) in CLIPS.items():
        actions[name] = make_action(rig, name, length, keys)
    # leave the rig at rest so the export is a bind-pose statue plus clips
    apply_pose(rig, {b: (0, 0, 0) for b in
                     {k for _, p in CLIPS['stance'][1] for k in p}})
    return actions


if __name__ == '__main__':
    import build_body as B
    import build_rig as R
    M.reset_scene()
    col, objs = B.assemble(stance_deg=0.0)
    rig, soft, bound = R.rig_character(objs, col)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    actions = build_all(rig)
    bpy.ops.object.mode_set(mode='OBJECT')
    for n, a in actions.items():
        rng = a.curve_frame_range
        print(f'  {n:12s} frames {int(rng[0])}-{int(rng[1])}  '
              f'{len(_action_fcurves(a))} curves')
