"""Root motion and foot planting for the run cycle.

The previous run clip rotated bones only, so the feet skated: the figure
pedalled on the spot and the engine had to move it, which never matches. A
locomotion clip has to be authored the other way round -- decide where the
feet MEET THE GROUND first, advance the root, and let the legs solve.

Method:
  1. the root bone translates forward a whole stride pair per cycle
  2. each foot has an explicit world-space target: fixed while planted,
     arcing forward while swinging
  3. Blender's own IK solves the legs to those targets
  4. the result is baked to a plain action with the constraints removed

Blender's solver is used rather than hand-rolled two-bone IK because getting
bone-local rotation signs right by derivation is exactly the kind of thing
that silently produces a knee bending backwards.

    python3 build_locomotion.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M

FPS          = 24
CYCLE_FRAMES = 18          # one full two-stride cycle
DUTY         = 0.22        # fraction of the cycle each foot is planted
SWING_H      = 0.190       # peak toe-off height
ANKLE_Z      = 0.105       # ankle height with the foot flat on the ground
HIP_X        = 0.086
BOB          = 0.030       # vertical bounce, twice per cycle
ROOT_DROP    = 0.090       # runners sit lower; this also buys stride length
REACH_SAFETY = 0.92        # never ask IK for a fully locked-out leg

# STRIDE IS DERIVED, NOT CHOSEN. A leg can only reach so far forward of the
# hip: with the ankle on the ground, the horizontal reach is
# sqrt(leg^2 - hip_height^2). The first attempt planted the foot 1.0 m ahead
# of a 0.835 m leg, so the targets were simply unreachable -- one foot touched
# down for three frames out of twenty-four and the other never landed at all,
# hanging half a metre in the air while the root dragged it along. Everything
# below is computed from the measured skeleton instead.
LEAD_AHEAD = None          # filled in by calibrate()
CYCLE_DIST = None


def calibrate(rig):
    """Measure the leg and the running hip height, then derive the stride.

    Returns (lead_ahead, cycle_dist, speed). Called after the run pose is
    applied so the hip height reflects the actual crouch, not the rest pose.
    """
    global LEAD_AHEAD, CYCLE_DIST
    bpy.context.view_layer.update()
    eb = rig.data.bones
    thigh = eb['thigh.L']
    shin = eb['shin.L']
    leg = thigh.length + shin.length

    hip_world = (rig.matrix_world @ rig.pose.bones['thigh.L'].matrix).translation
    hip_h = max(hip_world.z - ANKLE_Z, 0.05)

    reach_sq = leg * leg - hip_h * hip_h
    reach = math.sqrt(max(reach_sq, 1e-4)) * REACH_SAFETY

    LEAD_AHEAD = reach
    CYCLE_DIST = (2.0 * reach) / DUTY
    speed = CYCLE_DIST / (CYCLE_FRAMES / FPS)
    print(f'  calibrated: leg {leg:.3f} m, hip {hip_h:.3f} m above ankle')
    print(f'              reach {reach:.3f} m -> stride pair {CYCLE_DIST:.2f} m'
          f' -> {speed:.2f} m/s')
    return LEAD_AHEAD, CYCLE_DIST, speed


def _foot_track(c0_frames):
    """World (y, z) of one ankle for every frame of the cycle.

    Contact holds y CONSTANT while the root advances -- that is the whole
    point, and it is what stops the skating. Swing carries the foot forward by
    a full cycle distance so frame 0 and frame N differ by exactly CYCLE_DIST
    and the clip loops.
    """
    n = CYCLE_FRAMES
    contact = DUTY * n
    swing = n - contact
    out = []
    for f in range(n + 1):
        rel = (f - c0_frames) % n
        # WHICH contact this frame belongs to, and crucially WHERE THE ROOT WAS
        # when that contact began. Anchoring the plant to the world origin
        # instead works by accident for the lead foot -- its first plant is at
        # frame 0 where the root is also at 0 -- and fails completely for the
        # offset foot, whose targets end up a stride and a half behind the
        # body. It never landed.
        k = math.floor((f - c0_frames) / n)
        plant_frame = c0_frames + k * n
        root_at_plant = (plant_frame / n) * CYCLE_DIST
        base = root_at_plant + LEAD_AHEAD
        if rel < contact:
            y = base
            z = ANKLE_Z
        else:
            s = (rel - contact) / swing          # 0..1 through the swing
            y = base + s * CYCLE_DIST
            z = ANKLE_Z + SWING_H * math.sin(math.pi * s)
        out.append((y, z))
    return out


def setup_ik(rig):
    """IK constraints on both shins, with the knees locked to a hinge.

    Locking IK rotation on Y and Z turns each leg into a planar two-bone
    hinge, so no pole target is needed and the knee cannot swing sideways --
    which is the usual failure mode of an unconstrained leg chain.
    """
    targets = {}
    for side, sgn in (('L', -1), ('R', 1)):
        empty = bpy.data.objects.new(f'IK_Foot_{side}', None)
        empty.empty_display_size = 0.05
        M.link(empty)
        targets[side] = empty

        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='POSE')
        for bname in (f'thigh.{side}', f'shin.{side}'):
            pb = rig.pose.bones[bname]
            pb.lock_ik_y = True
            pb.lock_ik_z = True
        knee = rig.pose.bones[f'shin.{side}']
        knee.use_ik_limit_x = True
        knee.ik_min_x = math.radians(-155.0)   # knees bend one way only
        knee.ik_max_x = math.radians(0.0)

        con = rig.pose.bones[f'shin.{side}'].constraints.new('IK')
        con.target = empty
        con.chain_count = 2
        con.use_tail = True
        bpy.ops.object.mode_set(mode='OBJECT')
    return targets


def author_run(rig, targets, upper_pose_fn=None):
    """Key the root, the IK targets and the upper body across one cycle."""
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = CYCLE_FRAMES

    # Apply the running pose and drop the root BEFORE calibrating, so the
    # measured hip height is the one the legs will actually work from.
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    rig.pose.bones['root'].location = (0.0, 0.0, -ROOT_DROP)
    if upper_pose_fn:
        upper_pose_fn(rig, 0.0, None)
    bpy.ops.object.mode_set(mode='OBJECT')
    calibrate(rig)

    tracks = {'L': _foot_track(0), 'R': _foot_track(CYCLE_FRAMES // 2)}

    if rig.animation_data is None:
        rig.animation_data_create()
    action = bpy.data.actions.new('run_rootmotion_src')
    rig.animation_data.action = action

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    root = rig.pose.bones['root']
    root.rotation_mode = 'XYZ'

    for f in range(CYCLE_FRAMES + 1):
        phase = f / CYCLE_FRAMES
        scene.frame_set(f)

        # ROOT MOTION: forward travel plus a two-per-cycle vertical bob
        root.location = (0.0,
                         phase * CYCLE_DIST,
                         -ROOT_DROP
                         - BOB * (0.5 - 0.5 * math.cos(4.0 * math.pi * phase)))
        root.keyframe_insert('location', frame=f)

        if upper_pose_fn:
            upper_pose_fn(rig, phase, f)

        for side, sgn in (('L', -1), ('R', 1)):
            y, z = tracks[side][f]
            e = targets[side]
            e.location = (sgn * HIP_X, y, z)
            e.keyframe_insert('location', frame=f)

    bpy.ops.object.mode_set(mode='OBJECT')
    return action


def upper_body(rig, phase, f):
    """Arms counter-swinging the legs, plus a forward lean."""
    a = math.sin(2.0 * math.pi * phase)
    pose = {
        'hips':  (19, 0, -4 * a),
        'spine': (12, 0, 5 * a),
        'chest': (6, 0, 8 * a),
        'head':  (-17, 0, 0),
        'upperarm.L': (-36 * a, 0, 8),
        'forearm.L':  (-52 - 14 * a, 0, 0),
        'upperarm.R': (36 * a, 0, -8),
        'forearm.R':  (-52 + 14 * a, 0, 0),
        'bat': (-26, 0, 20),
    }
    for bone, (rx, ry, rz) in pose.items():
        pb = rig.pose.bones.get(bone)
        if pb is None:
            continue
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (math.radians(rx), math.radians(ry),
                             math.radians(rz))
        if f is not None:
            pb.keyframe_insert('rotation_euler', frame=f)


def bake(rig, name='run'):
    """Bake the IK result to plain bone keys and drop the constraints.

    glTF carries no constraints -- an unbaked rig exports as a T-pose that
    ignores every IK target. Visual keying samples the SOLVED pose.
    """
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    baked = bpy.ops.nla.bake(
        frame_start=0, frame_end=CYCLE_FRAMES, step=1,
        only_selected=False, visual_keying=True,
        clear_constraints=True, clear_parents=False,
        use_current_action=False, bake_types={'POSE'},
    )
    bpy.ops.object.mode_set(mode='OBJECT')
    action = rig.animation_data.action
    action.name = name
    action.use_fake_user = True
    return action


def build(rig):
    targets = setup_ik(rig)
    src = author_run(rig, targets, upper_body)
    action = bake(rig, 'run')
    for e in targets.values():
        # the empties carry their own actions; removing the objects is not
        # enough to keep those out of the export
        if e.animation_data and e.animation_data.action:
            bpy.data.actions.remove(e.animation_data.action)
        bpy.data.objects.remove(e, do_unlink=True)
    # Drop the pre-bake source. It is a complete action in its own right, so
    # the exporter happily shipped it as a duplicate 'run_rootmotion_src' clip.
    if src and src.users == 0 or src:
        try:
            bpy.data.actions.remove(src)
        except Exception:
            pass
    return action


if __name__ == '__main__':
    import build_body as B
    import build_rig as R
    M.reset_scene()
    col, objs = B.assemble(stance_deg=0.0)
    rig, soft, bound = R.rig_character(objs, col)
    action = build(rig)
    from build_anim import _action_fcurves
    fcs = _action_fcurves(action)
    loc = [fc for fc in fcs if 'location' in fc.data_path]
    print(f'  baked action: {action.name}')
    print(f'  curves: {len(fcs)}  (location channels: {len(loc)})')
    print(f'  travel: {CYCLE_DIST:.2f} m per {CYCLE_FRAMES / FPS:.2f} s '
          f'= {CYCLE_DIST / (CYCLE_FRAMES / FPS):.1f} m/s')
    root_y = [fc for fc in loc if fc.data_path.endswith('["root"].location')
              or ('root' in fc.data_path and fc.array_index == 1)]
    print(f'  root forward curve present: {bool(root_y)}')
