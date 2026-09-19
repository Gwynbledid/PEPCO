extends SceneTree

func _initialize() -> void:
	var ok := true

	# --- 1. does the exported run clip carry root translation?
	var ps: PackedScene = load("res://assets/batsman.glb")
	var model := ps.instantiate()
	var ap: AnimationPlayer = _find(model, "AnimationPlayer")
	var found_root_pos := false
	var run_len := 0.0
	for lib_name in ap.get_animation_library_list():
		var lib := ap.get_animation_library(lib_name)
		if not lib.has_animation("run"): continue
		var anim := lib.get_animation("run")
		run_len = anim.length
		for t in anim.get_track_count():
			var path := String(anim.track_get_path(t))
			if path.ends_with(":root") and anim.track_get_type(t) == Animation.TYPE_POSITION_3D:
				found_root_pos = true
				var first := anim.position_track_interpolate(t, 0.0)
				var last := anim.position_track_interpolate(t, anim.length)
				print("root track travel over clip: ", (last - first))
				print("   => %.2f m over %.2fs = %.2f m/s" % [
					(last - first).length(), anim.length,
					(last - first).length() / max(anim.length, 0.001)])
	print("run clip has root position track: ", found_root_pos, " (len %.2fs)" % run_len)
	if not found_root_pos: ok = false
	model.queue_free()

	# --- 2. does the Skeleton3D IK API foot_ik.gd relies on exist?
	var skel := Skeleton3D.new()
	var has_set := skel.has_method("set_bone_global_pose")
	var has_get := skel.has_method("get_bone_global_pose")
	print("Skeleton3D.set_bone_global_pose: ", has_set)
	print("Skeleton3D.get_bone_global_pose: ", has_get)
	if not (has_set and has_get): ok = false
	skel.free()

	# --- 3. does root motion actually displace the controller?
	# A floor, so gravity is satisfied and does not swamp the measurement.
	var holder := Node3D.new()
	root.add_child(holder)
	var floor_body := StaticBody3D.new()
	var fshape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(400, 1, 400)
	fshape.shape = box
	floor_body.add_child(fshape)
	holder.add_child(floor_body)
	floor_body.global_position = Vector3(0, -0.5, 0)
	var ctrl := CharacterBody3D.new()
	ctrl.set_script(load("res://scripts/batsman_controller.gd"))
	ctrl.batsman_glb = ps
	ctrl.start_clip = "run"
	var cshape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.height = 1.7
	cap.radius = 0.25
	cshape.shape = cap
	ctrl.add_child(cshape)
	holder.add_child(ctrl)
	ctrl.global_position = Vector3(0, 0.9, 0)
	await process_frame
	ctrl.play("run")
	await process_frame

	# Let the ENGINE drive _physics_process. Calling it by hand as well
	# double-consumes the root motion delta -- get_root_motion_position()
	# reports motion since the last read and resets -- so the second caller
	# sees nothing and the measured speed comes out far too low.
	var start: Vector3 = ctrl.global_position
	var ticks := Engine.physics_ticks_per_second
	for i in ticks:
		await physics_frame
	var moved: Vector3 = ctrl.global_position - start
	var horiz := Vector2(moved.x, moved.z).length()
	var expect := 3.228 / 0.75
	print("controller displacement over 1.00 s: %s" % moved)
	print("   horizontal: %.3f m/s   (clip authored at %.2f m/s)" % [horiz, expect])
	var err: float = abs(horiz - expect) / expect
	print("   error vs clip: %.1f%%" % (err * 100.0))
	if horiz < 0.5:
		print("   !! root motion is NOT driving the body")
		ok = false
	elif err > 0.12:
		print("   !! body speed does not match the animation - feet will skate")
		ok = false

	print("RESULT ", "PASSED" if ok else "FAILED")
	quit(0 if ok else 1)

static func _find(r: Node, cls: String) -> Node:
	var st: Array[Node] = [r]
	while not st.is_empty():
		var n: Node = st.pop_back()
		if n.is_class(cls): return n
		for c in n.get_children(): st.append(c)
	return null
