@tool
extends SkeletonModifier3D
## Plants the feet on whatever ground is actually under them.
##
## The baked clips plant the feet perfectly on a FLAT pitch. A cricket outfield
## is crowned -- build_ground.ground_height() raises the middle 0.45 m -- and
## any slope or step breaks that immediately. This raycasts under each ankle
## and re-solves the leg so the foot meets the real surface.
##
## Two-bone analytic IK, solved in the plane containing the hip, the target and
## the knee's existing bend direction. That plane matters: solving in a fixed
## world plane makes the knee swing sideways the moment the character turns.

@export var enabled := true
@export var hip_bones: PackedStringArray = ["thigh.L", "thigh.R"]
@export var knee_bones: PackedStringArray = ["shin.L", "shin.R"]
@export var ankle_bones: PackedStringArray = ["foot.L", "foot.R"]
## How far above and below the animated ankle to look for ground.
@export var trace_up := 0.45
@export var trace_down := 0.60
@export var ankle_height := 0.105
## 0 disables; 1 snaps hard. Anything below ~0.5 visibly lags on slopes.
@export_range(0.0, 1.0) var blend := 1.0
@export var collision_mask := 1


func _process_modification() -> void:
	if not enabled:
		return
	var skel := get_skeleton()
	if skel == null:
		return
	var space := skel.get_world_3d().direct_space_state if skel.is_inside_tree() else null
	if space == null:
		return

	for i in hip_bones.size():
		var hip_i := skel.find_bone(hip_bones[i])
		var knee_i := skel.find_bone(knee_bones[i])
		var ankle_i := skel.find_bone(ankle_bones[i])
		if hip_i < 0 or knee_i < 0 or ankle_i < 0:
			continue
		_solve_leg(skel, space, hip_i, knee_i, ankle_i)


func _solve_leg(skel: Skeleton3D, space: PhysicsDirectSpaceState3D,
		hip_i: int, knee_i: int, ankle_i: int) -> void:
	var to_world := skel.global_transform
	var hip := to_world * skel.get_bone_global_pose(hip_i).origin
	var knee := to_world * skel.get_bone_global_pose(knee_i).origin
	var ankle := to_world * skel.get_bone_global_pose(ankle_i).origin

	var q := PhysicsRayQueryParameters3D.create(
		ankle + Vector3.UP * trace_up, ankle + Vector3.DOWN * trace_down)
	q.collision_mask = collision_mask
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		return

	var target: Vector3 = hit.position + Vector3.UP * ankle_height
	target = ankle.lerp(target, blend)

	var l1 := hip.distance_to(knee)
	var l2 := knee.distance_to(ankle)
	var to_target := target - hip
	var dist: float = clamp(to_target.length(), abs(l1 - l2) + 0.001,
			l1 + l2 - 0.001)
	if dist <= 0.0001:
		return
	var dir := to_target.normalized()

	# Bend plane from the CURRENT knee, so the knee keeps pointing where the
	# animation put it rather than snapping to a world axis.
	var pole := (knee - hip) - dir * (knee - hip).dot(dir)
	if pole.length_squared() < 1e-8:
		pole = to_world.basis.z
		pole = pole - dir * pole.dot(dir)
	if pole.length_squared() < 1e-8:
		return
	pole = pole.normalized()

	var cos_a: float = clamp((l1 * l1 + dist * dist - l2 * l2)
			/ (2.0 * l1 * dist), -1.0, 1.0)
	var a := acos(cos_a)
	var new_knee := hip + (dir * cos(a) + pole * sin(a)) * l1

	_aim(skel, hip_i, knee, new_knee, hip)
	_aim(skel, knee_i, ankle, target, new_knee)


func _aim(skel: Skeleton3D, bone: int, from_world: Vector3,
		to_world_pos: Vector3, pivot: Vector3) -> void:
	## Rotate a bone so its child lands on the new position.
	var inv := skel.global_transform.affine_inverse()
	var a := (inv * from_world) - (inv * pivot)
	var b := (inv * to_world_pos) - (inv * pivot)
	if a.length_squared() < 1e-9 or b.length_squared() < 1e-9:
		return
	var rot := Quaternion(a.normalized(), b.normalized())
	var pose := skel.get_bone_global_pose(bone)
	pose.basis = Basis(rot) * pose.basis
	skel.set_bone_global_pose(bone, pose)
