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
	var playing := ""
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
		if n is AnimationPlayer:
			var ap := n as AnimationPlayer
			if ap.is_playing(): playing = ap.current_animation
		if n is Camera3D: cam_children = n.get_child_count()
		for c in n.get_children(): stack.append(c)

	print("--- MultiMeshes ---")
	var total := 0
	for k in mm.keys():
		print("   %-12s %6d instances" % [k, mm[k]])
		total += mm[k]
	print("   TOTAL        %6d" % total)
	print("--- materials ---")
	print("   ShaderMaterial surfaces: ", shader_surfaces)
	print("   untouched glTF surfaces: ", std_surfaces)
	print("--- character ---")
	print("   bones: %d  skinned meshes: %d" % [bones, skinned])
	print("   animation playing: '%s'" % playing)
	print("   camera children (viewmodel rig): ", cam_children)

	var ok := total > 20000 and bones >= 20 and playing != "" \
		and shader_surfaces > 0 and cam_children > 0
	print("RESULT ", "PASSED" if ok else "FAILED")
	quit(0 if ok else 1)
