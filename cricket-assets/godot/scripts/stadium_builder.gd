extends Node3D
## Builds the stadium bowl from the Blender-exported modules.
##
## Everything repeated -- seats, crowd, hoardings, stand wedges -- goes into a
## MultiMesh. A full ground is roughly 28,000 seats and 17,000 spectators; as
## individual nodes that is tens of thousands of draw calls and the scene will
## not run. As four MultiMeshes it is four draw calls.
##
## The transforms here MUST match blender/build_stadium.py::assemble_bowl(),
## otherwise the preview renders and the game will not agree.

const BOWL_SEGMENTS := 24
const STAND_R0 := 80.0
const STAND_R1 := 99.0
const ROWS := 22
const ROW_RISE := 0.46
const DECK_Z := 2.6
const BOUNDARY_R := 68.0
const HOARDING_R := BOUNDARY_R + 2.6
const FIELD_R := 78.0
const CROWN := 0.45

@export var stand_glb: PackedScene
@export var seat_glb: PackedScene
@export var crowd_glb: PackedScene
@export var hoarding_glb: PackedScene
@export var crowd_material: ShaderMaterial
@export var fill_ratio := 0.82  ## fraction of seats that are occupied


func ground_height(x: float, z: float) -> float:
	# Must stay identical to build_ground.ground_height().
	var r := sqrt(x * x + z * z)
	var t: float = min(r / FIELD_R, 1.0)
	return CROWN * (1.0 - t * t)


func _ready() -> void:
	_build_stands()
	_build_seats()
	_build_crowd()
	_build_hoardings()


static func _first_mesh(scene: PackedScene) -> Mesh:
	## glTF imports as a PackedScene, so dig out the mesh the MultiMesh needs.
	if scene == null:
		return null
	var root := scene.instantiate()
	var found: Mesh = null
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D:
			found = (n as MeshInstance3D).mesh
			break
		for c in n.get_children():
			stack.append(c)
	root.queue_free()
	return found


func _make_multimesh(name_: String, scene: PackedScene, transforms: Array[Transform3D],
		mat: Material = null) -> MultiMeshInstance3D:
	var mesh := _first_mesh(scene)
	if mesh == null:
		push_warning("stadium_builder: no mesh found for %s" % name_)
		return null
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = transforms.size()
	for i in transforms.size():
		mm.set_instance_transform(i, transforms[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = name_
	mmi.multimesh = mm
	if mat != null:
		mmi.material_override = mat
	# the bowl is static and enormous; let the renderer skip it early
	mmi.gi_mode = GeometryInstance3D.GI_MODE_STATIC
	add_child(mmi)
	return mmi


func _build_stands() -> void:
	var xforms: Array[Transform3D] = []
	for s in BOWL_SEGMENTS:
		var a := TAU * float(s) / float(BOWL_SEGMENTS)
		xforms.append(Transform3D(Basis(Vector3.UP, a), Vector3.ZERO))
	_make_multimesh("Stands", stand_glb, xforms)


func _row_radius_and_height(r: int, front_bias: float) -> Vector2:
	var row_depth := (STAND_R1 - STAND_R0) / float(ROWS)
	return Vector2(STAND_R0 + float(r) * row_depth + row_depth * front_bias,
			DECK_Z + float(r) * ROW_RISE)


func _build_seats() -> void:
	var xforms: Array[Transform3D] = []
	for r in ROWS:
		var rh := _row_radius_and_height(r, 0.55)
		var count := int(TAU * rh.x / 0.52)
		for i in count:
			var a := TAU * float(i) / float(count)
			var pos := Vector3(rh.x * cos(a), rh.y, rh.x * sin(a))
			xforms.append(Transform3D(Basis(Vector3.UP, a + PI * 0.5), pos))
	_make_multimesh("Seats", seat_glb, xforms)


func _build_crowd() -> void:
	## Spectators sit slightly forward of the seat backs. Occupancy is
	## deterministic per (row, index) so the same seats are empty every run --
	## a crowd that reshuffles when you reload reads as very wrong.
	var xforms: Array[Transform3D] = []
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260919
	for r in ROWS:
		var rh := _row_radius_and_height(r, 0.20)
		var count := int(TAU * rh.x / 0.62)
		for i in count:
			if rng.randf() > fill_ratio:
				continue
			var a := TAU * float(i) / float(count)
			var pos := Vector3(rh.x * cos(a), rh.y, rh.x * sin(a))
			# billboarding is done in the shader; basis only carries scale
			var scale_v := 0.94 + rng.randf() * 0.14
			xforms.append(Transform3D(Basis().scaled(Vector3.ONE * scale_v), pos))
	_make_multimesh("Crowd", crowd_glb, xforms, crowd_material)


func _build_hoardings() -> void:
	var xforms: Array[Transform3D] = []
	var n := int(TAU * HOARDING_R / 8.2)
	for i in n:
		var a := TAU * float(i) / float(n)
		var x := HOARDING_R * cos(a)
		var z := HOARDING_R * sin(a)
		var pos := Vector3(x, ground_height(x, z), z)
		xforms.append(Transform3D(Basis(Vector3.UP, a + PI * 0.5), pos))
	_make_multimesh("Hoardings", hoarding_glb, xforms)
