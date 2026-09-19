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

# Must stay in step with blender/build_stadium.py -- the preview renders and
# the running game have to agree on where every module sits.
const BOWL_SEGMENTS := 24

const L_R0 := 80.0
const L_R1 := 90.0
const L_ROWS := 14
const L_RISE := 0.42
const DECK_Z := 2.4

const SIGN_H := 2.20

const U_R0 := 92.0
const U_R1 := 103.0
const U_ROWS := 13
const U_RISE := 0.50

const BOUNDARY_R := 68.0
const HOARDING_R := BOUNDARY_R + 2.6
const FIELD_R := 78.0
const CROWN := 0.45
const TREE_R := 112.0
const N_BRANDS := 6

@export var stand_glb: PackedScene
@export var roof_glb: PackedScene
@export var signage_glb: PackedScene
@export var seat_glb: PackedScene
@export var crowd_glb: PackedScene
@export var tree_glb: PackedScene
## Six hoarding variants; the builder cycles them round the boundary.
@export var hoarding_glbs: Array[PackedScene] = []
@export var crowd_material: ShaderMaterial
@export var fill_ratio := 0.94  ## fraction of seats that are occupied


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
	_build_trees()


func _tier_rows() -> Array[Vector2]:
	## (radius, height) for every seating row across both tiers.
	var out: Array[Vector2] = []
	var l_depth := (L_R1 - L_R0) / float(L_ROWS)
	for r in L_ROWS:
		out.append(Vector2(L_R0 + float(r) * l_depth + l_depth * 0.55,
				DECK_Z + float(r) * L_RISE))
	var u_deck: float = DECK_Z + float(L_ROWS) * L_RISE + SIGN_H + 0.80
	var u_depth := (U_R1 - U_R0) / float(U_ROWS)
	for r in U_ROWS:
		out.append(Vector2(U_R0 + float(r) * u_depth + u_depth * 0.55,
				u_deck + float(r) * U_RISE))
	return out


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
	_make_multimesh("Roof", roof_glb, xforms)
	_make_multimesh("Signage", signage_glb, xforms)


func _build_seats() -> void:
	var xforms: Array[Transform3D] = []
	for rh in _tier_rows():
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
	for rh in _tier_rows():
		var count := int(TAU * rh.x / 0.52)
		for i in count:
			if rng.randf() > fill_ratio:
				continue
			var a := TAU * float(i) / float(count)
			var r_in := rh.x - 0.16
			var pos := Vector3(r_in * cos(a), rh.y + 0.28, r_in * sin(a))
			# billboarding is done in the shader; basis only carries scale
			var scale_v := 0.94 + rng.randf() * 0.16
			xforms.append(Transform3D(Basis().scaled(Vector3.ONE * scale_v), pos))
	_make_multimesh("Crowd", crowd_glb, xforms, crowd_material)


func _build_hoardings() -> void:
	## One MultiMesh per brand: each variant carries its own texture, so they
	## cannot share a mesh.
	if hoarding_glbs.is_empty():
		push_warning("stadium_builder: no hoarding scenes assigned")
		return
	var n := int(TAU * HOARDING_R / 8.2)
	var buckets: Array[Array] = []
	for b in hoarding_glbs.size():
		buckets.append([] as Array[Transform3D])
	for i in n:
		var a := TAU * float(i) / float(n)
		var x := HOARDING_R * cos(a)
		var z := HOARDING_R * sin(a)
		var pos := Vector3(x, ground_height(x, z), z)
		buckets[i % hoarding_glbs.size()].append(
				Transform3D(Basis(Vector3.UP, a + PI * 0.5), pos))
	for b in hoarding_glbs.size():
		_make_multimesh("Hoardings_%d" % b, hoarding_glbs[b],
				buckets[b] as Array[Transform3D])


func _build_trees() -> void:
	## Skyline behind the stands. Cheap, and it stops the roofline ending in
	## bare sky.
	var xforms: Array[Transform3D] = []
	var rng := RandomNumberGenerator.new()
	rng.seed = 991
	for i in 46:
		var a := TAU * float(i) / 46.0 + rng.randf() * 0.06
		var r := TREE_R + rng.randf() * 9.0
		var pos := Vector3(r * cos(a), 0.0, r * sin(a))
		var sc := 0.8 + rng.randf() * 0.7
		var basis := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * sc)
		xforms.append(Transform3D(basis, pos))
	_make_multimesh("Trees", tree_glb, xforms)
