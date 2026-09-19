extends SceneTree

func _initialize() -> void:
	var ps: PackedScene = load("res://scenes/match.tscn")
	if ps == null:
		print("FAIL: match.tscn did not load"); quit(1); return
	var scene := ps.instantiate()
	root.add_child(scene)              # triggers every _ready()
	await process_frame
	await process_frame

	var mm := {}          # MultiMesh name -> instance count
	var shader_surfaces := 0
	var std_surfaces := 0
	var bones := 0
	var skinned := 0
	var tree_active := false
	var tree_clip := ""
	var root_track := ""
	var foot_ik := 0
	var static_bodies := 0
	var cam_children := 0

	var stack: Array[Node] = [scene]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MultiMeshInstance3D:
			var m := (n as MultiMeshInstance3D).multimesh
			mm[n.name] = (m.instance_count if m else 0)
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			if mi.mesh:
				for s in mi.mesh.get_surface_count():
					var ov := mi.get_surface_override_material(s)
					if ov is ShaderMaterial: shader_surfaces += 1
					elif mi.mesh.surface_get_material(s) != null: std_surfaces += 1
			if mi.skin != null: skinned += 1
		if n is Skeleton3D: bones = max(bones, (n as Skeleton3D).get_bone_count())
		# The controller drives playback through an AnimationTree, so the
		# AnimationPlayer is never "playing" in the classic sense.
		if n is AnimationTree:
			var at := n as AnimationTree
			tree_active = at.active
			root_track = String(at.root_motion_track)
			if at.tree_root is AnimationNodeAnimation:
				tree_clip = (at.tree_root as AnimationNodeAnimation).animation
		if n is SkeletonModifier3D: foot_ik += 1
		if n is StaticBody3D: static_bodies += 1
		if n is Camera3D: cam_children = n.get_child_count()
		for c in n.get_children(): stack.append(c)

	print("--- MultiMeshes ---")
	var total := 0
	for k in mm.keys():
		print("   %-12s %6d instances" % [k, mm[k]])
		total += mm[k]
	print("   TOTAL        %6d" % total)
	# Ring placement handedness.
	#
	# Seats and hoardings are authored facing local +Y in Blender, which the
	# glTF Y-up conversion turns into local -Z. If the ring positions and the
	# yaw disagree in handedness the two cancel only at the ends of the pitch
	# and everything else faces outward -- invisible from behind the stumps,
	# glaring from square leg.
	#
	# This checks stadium_builder.ring_transform() rather than the built
	# MultiMesh: under --headless the instance buffer lives in a dummy
	# RenderingServer and get_instance_transform() reads back identity, so a
	# check against the assembled bowl would pass no matter what was in it.
	const Builder := preload("res://scripts/stadium_builder.gd")
	var facing_worst := 1.0
	for i in 72:
		var a := TAU * float(i) / 72.0
		var t: Transform3D = Builder.ring_transform(85.0, 3.0, a)
		var face := (t.basis * Vector3(0, 0, -1)).normalized()
		var inward := Vector3(-t.origin.x, 0.0, -t.origin.z).normalized()
		facing_worst = min(facing_worst, face.dot(inward))
	print("--- ring placement ---")
	print("   worst facing dot over the ring (1.0 = dead at the middle): %.4f"
			% facing_worst)
	print("--- materials ---")
	print("   ShaderMaterial surfaces: ", shader_surfaces)
	print("   untouched glTF surfaces: ", std_surfaces)
	print("--- character ---")
	print("   bones: %d  skinned meshes: %d" % [bones, skinned])
	print("   AnimationTree active: %s  clip: '%s'" % [tree_active, tree_clip])
	print("   root_motion_track: '%s'" % root_track)
	print("   SkeletonModifier3D (foot IK): ", foot_ik)
	print("   ground StaticBody3D (IK can raycast): ", static_bodies)
	print("   camera children (viewmodel rig): ", cam_children)

	var ok := total > 20000 and bones >= 20 and tree_active \
		and facing_worst > 0.99 \
		and root_track != "" and foot_ik > 0 and static_bodies > 0 \
		and shader_surfaces > 0 and cam_children > 0
	print("RESULT ", "PASSED" if ok else "FAILED")
	quit(0 if ok else 1)
