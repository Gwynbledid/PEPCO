extends CharacterBody3D
## Drives the batsman from the animation's ROOT MOTION.
##
## The run clip advances its root bone a full stride pair per cycle with the
## feet planted, so the character's speed is a property of the animation, not
## a number picked in code. Reading that delta and applying it is what keeps
## the feet from skating: if the body moved at some other speed, contact would
## slide by exactly the difference.
##
## AnimationTree consumes the root bone's motion and reports it per frame via
## get_root_motion_position(); the visual skeleton stays at the origin.

@export var batsman_glb: PackedScene
@export var start_clip := "idle"
@export var gravity := 22.0
## Bone whose translation carries the locomotion.
@export var root_bone := "root"
## Runtime IK so the feet meet the crowned outfield, not a flat plane.
@export var foot_ik := true
## Render layer for the third-person body. The POV camera stands inside this
## model -- eye height, same spot -- so without a layer to cull it, the first
## thing the batsman sees is the inside of his own shoulders. batsman_pov.gd
## drops this layer from its cull mask; every other camera keeps it.
@export var body_layer := 2

var _tree: AnimationTree
var _player: AnimationPlayer
var _model: Node3D
var _clips: Array[String] = []


func _ready() -> void:
	if batsman_glb == null:
		push_warning("batsman_controller: no model assigned")
		return
	_model = batsman_glb.instantiate()
	add_child(_model)

	var swapper := preload("res://scripts/apply_materials.gd").new()
	swapper.apply_to(_model)
	swapper.free()

	_set_render_layer(_model, 1 << (body_layer - 1))

	_player = _find(_model, "AnimationPlayer") as AnimationPlayer
	if _player == null:
		push_warning("batsman_controller: no AnimationPlayer in model")
		return

	for lib_name in _player.get_animation_library_list():
		var lib := _player.get_animation_library(lib_name)
		for a in lib.get_animation_list():
			_clips.append(a if lib_name == "" else "%s/%s" % [lib_name, a])
			if a == "idle" or a == "run":
				lib.get_animation(a).loop_mode = Animation.LOOP_LINEAR

	_tree = AnimationTree.new()
	# The tree lives BESIDE the AnimationPlayer, inside the model. Track paths
	# in the animation are relative to the player's root_node; parenting the
	# tree elsewhere and hand-building a path resolves it against the wrong
	# node and root motion silently reads as zero.
	_player.get_parent().add_child(_tree)
	_tree.anim_player = _tree.get_path_to(_player)
	_tree.root_node = _tree.get_path_to(_player.get_node(_player.root_node))

	var node_anim := AnimationNodeAnimation.new()
	node_anim.animation = _resolve(start_clip)
	_tree.tree_root = node_anim
	_tree.root_motion_track = _find_root_motion_track()
	# ADVANCE IN PHYSICS, not idle.
	#
	# AnimationMixer defaults to the idle callback, so the tree advances on
	# render frames while get_root_motion_position() is read in
	# _physics_process. The two run at different rates, so the body travels at
	# idle_fps/physics_fps of the authored speed -- measured at exactly 0.40x
	# here -- and the feet skate by the difference. Any root-motion character
	# has to have these in lockstep.
	_tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS
	_tree.active = true

	if foot_ik:
		_install_foot_ik()


func _install_foot_ik() -> void:
	## SkeletonModifier3D must be a CHILD of the Skeleton3D it modifies, and
	## the skeleton only exists once the glTF is instantiated -- hence code
	## rather than scene data.
	var skel := _find(_model, "Skeleton3D")
	if skel == null:
		return
	# .new() ON THE SCRIPT, not Node.new() + set_script. Attaching a script to
	# a plain Node leaves it a Node -- it never becomes a SkeletonModifier3D,
	# so the skeleton never calls it and the IK silently does nothing.
	var ik = preload("res://scripts/foot_ik.gd").new()
	ik.name = "FootIK"
	skel.add_child(ik)


func _find_root_motion_track() -> NodePath:
	## Take the path VERBATIM from the animation rather than constructing it.
	for lib_name in _player.get_animation_library_list():
		var lib := _player.get_animation_library(lib_name)
		for a in lib.get_animation_list():
			var anim := lib.get_animation(a)
			for t in anim.get_track_count():
				if anim.track_get_type(t) != Animation.TYPE_POSITION_3D:
					continue
				var path := anim.track_get_path(t)
				if String(path).ends_with(":" + root_bone):
					return path
	push_warning("batsman_controller: no ':%s' position track; "
			% root_bone + "root motion disabled")
	return NodePath()


func play(clip: String) -> void:
	var resolved := _resolve(clip)
	if resolved == "":
		push_warning("batsman_controller: unknown clip '%s'" % clip)
		return
	var node_anim := AnimationNodeAnimation.new()
	node_anim.animation = resolved
	_tree.tree_root = node_anim


func _resolve(clip: String) -> String:
	for c in _clips:
		if c == clip or c.ends_with("/" + clip):
			return c
	return ""


func _physics_process(delta: float) -> void:
	if _tree == null:
		return
	# Root motion arrives in the model's local space; rotate it into world so
	# turning the character steers the motion instead of ignoring it.
	var motion := _tree.get_root_motion_position()
	var world := global_transform.basis * motion
	velocity.x = world.x / delta
	velocity.z = world.z / delta
	if not is_on_floor():
		velocity.y -= gravity * delta
	else:
		velocity.y = 0.0
	move_and_slide()


static func _set_render_layer(root: Node, mask: int) -> void:
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is VisualInstance3D:
			(n as VisualInstance3D).layers = mask
		for c in n.get_children():
			stack.append(c)


static func _find(root: Node, cls: String) -> Node:
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n.is_class(cls):
			return n
		for c in n.get_children():
			stack.append(c)
	return null
