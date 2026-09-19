extends Node3D
## Runtime assembly: drops the ground, stadium, batsman and POV together and
## starts the batsman idling. Everything it needs is assigned in match.tscn;
## this only does the work that cannot be expressed as scene data.

@export var batsman_glb: PackedScene
@export var batsman_clip := "idle"
@export var batsman_position := Vector3(-11.16, 0.0, 0.42)
@export var batsman_yaw_deg := -90.0

var _batsman: Node3D


func _ready() -> void:
	_spawn_batsman()


func _spawn_batsman() -> void:
	if batsman_glb == null:
		push_warning("match_scene: no batsman scene assigned")
		return
	_batsman = batsman_glb.instantiate()
	add_child(_batsman)
	# glTF gives the batsman plain StandardMaterial3Ds; swap in the fabric
	# shader so the kit actually gets its sheen.
	var swapper := preload("res://scripts/apply_materials.gd").new()
	var n := swapper.apply_to(_batsman)
	if n == 0:
		push_warning("match_scene: no batsman materials were swapped")
	swapper.free()
	_batsman.position = batsman_position
	_batsman.rotation.y = deg_to_rad(batsman_yaw_deg)

	var player := _find_animation_player(_batsman)
	if player == null:
		push_warning("match_scene: batsman has no AnimationPlayer")
		return
	# glTF nests clips in a library; resolve the real name before playing
	for lib_name in player.get_animation_library_list():
		var lib := player.get_animation_library(lib_name)
		if lib.has_animation(batsman_clip):
			var full := batsman_clip if lib_name == "" else "%s/%s" % [lib_name, batsman_clip]
			var anim := lib.get_animation(batsman_clip)
			anim.loop_mode = Animation.LOOP_LINEAR
			player.play(full)
			return
	push_warning("match_scene: clip '%s' not found" % batsman_clip)


static func _find_animation_player(root: Node) -> AnimationPlayer:
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is AnimationPlayer:
			return n as AnimationPlayer
		for c in n.get_children():
			stack.append(c)
	return null
