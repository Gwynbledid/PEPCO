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
const BOX_H := 3.40

const U_R0 := 92.0
const U_R1 := 103.0
const U_ROWS := 13
const U_RISE := 0.50

const BOUNDARY_R := 68.0
const HOARDING_R := BOUNDARY_R + 2.6
const FIELD_R := 78.0
const CROWN := 0.45
const TREE_R := 112.0
const FLOODLIGHT_R := 110.0
const N_FLOODLIGHTS := 6
const SIGHTSCREEN_X := 75.0
const N_BRANDS := 6

@export var stand_glb: PackedScene
@export var roof_glb: PackedScene
@export var signage_glb: PackedScene
@export var box_glb: PackedScene
@export var box_glass_glb: PackedScene
@export var box_details_glb: PackedScene  ## glazing bars, transom, rail
@export var roofsign_glb: PackedScene
@export var seat_glb: PackedScene
@export var crowd_glb: PackedScene
@export var tree_glb: PackedScene
## Tower and lamp array are separate meshes sharing one transform: the lamps
## are emissive and the tower is not, so they cannot be one material.
@export var floodlight_tower_glb: PackedScene
@export var floodlight_lamps_glb: PackedScene
@export var sightscreen_glb: PackedScene
## Six hoarding variants; the builder cycles them round the boundary.
@export var hoarding_glbs: Array[PackedScene] = []
@export var crowd_material: ShaderMaterial
## Triplanar concrete for the terracing, and the paler precast for the boxes.
## MultiMeshInstance3D takes a material_override; apply_materials.gd only
## walks MeshInstance3D, so these have to be assigned here.
@export var concrete_material: ShaderMaterial
@export var precast_material: ShaderMaterial
@export var fill_ratio := 0.94  ## fraction of seats that are occupied


static func ring_transform(radius: float, height: float, a: float,
		yaw_offset := PI * 0.5) -> Transform3D:
	## Place a module on the bowl ring at angle `a`, facing the middle.
	##
	## The -sin is the whole point. glTF's Y-up conversion maps Blender
	## (x, y, z) to (x, z, -y), so a Blender ring position at angle `a` lands
	## at -sin here, while a Blender rotation of `a` about +Z comes through
	## unchanged as Basis(UP, a). Write the position with +sin and the ring is
	## mirrored against the rotations: the two cancel at the ends of the pitch
	## and nowhere else, so the seats behind the bowler look right and the ones
	## at square leg face the car park.
	##
	## Kept as a static function so it can be tested without a RenderingServer
	## -- MultiMesh.get_instance_transform() reads back identity under
	## --headless, which makes verifying the built bowl in place impossible.
	return Transform3D(Basis(Vector3.UP, a + yaw_offset),
			Vector3(radius * cos(a), height, -radius * sin(a)))


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
	_build_floodlights()
	_build_sightscreens()
	_build_trees()


func _tier_rows() -> Array[Vector2]:
	## (radius, height) for every seating row across both tiers.
	var out: Array[Vector2] = []
	var l_depth := (L_R1 - L_R0) / float(L_ROWS)
	for r in L_ROWS:
		out.append(Vector2(L_R0 + float(r) * l_depth + l_depth * 0.55,
				DECK_Z + float(r) * L_RISE))
	var u_deck: float = DECK_Z + float(L_ROWS) * L_RISE + SIGN_H + BOX_H + 0.70
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
	_make_multimesh("Stands", stand_glb, xforms, concrete_material)
	_make_multimesh("Roof", roof_glb, xforms)
	_make_multimesh("Signage", signage_glb, xforms)
	_make_multimesh("Boxes", box_glb, xforms, precast_material)
	_make_multimesh("BoxGlass", box_glass_glb, xforms)
	_make_multimesh("BoxDetails", box_details_glb, xforms)

	## Rooftop boards skip every third segment -- a continuous ring reads as a
	## wall rather than a broken skyline.
	var roofsign: Array[Transform3D] = []
	for s in BOWL_SEGMENTS:
		if s % 3 == 1:
			continue
		roofsign.append(xforms[s])
	_make_multimesh("RoofSigns", roofsign_glb, roofsign)


func _build_seats() -> void:
	var xforms: Array[Transform3D] = []
	for rh in _tier_rows():
		var count := int(TAU * rh.x / 0.52)
		for i in count:
			var a := TAU * float(i) / float(count)
			xforms.append(ring_transform(rh.x, rh.y, a))
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
			var pos := ring_transform(r_in, rh.y + 0.28, a).origin
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
		var flat := ring_transform(HOARDING_R, 0.0, a)
		var xf := Transform3D(flat.basis, flat.origin
				+ Vector3.UP * ground_height(flat.origin.x, flat.origin.z))
		buckets[i % hoarding_glbs.size()].append(xf)
	for b in hoarding_glbs.size():
		_make_multimesh("Hoardings_%d" % b, hoarding_glbs[b],
				buckets[b] as Array[Transform3D])


func _build_floodlights() -> void:
	## Six pylons rather than the usual four, offset 15 degrees so one falls
	## inside the batsman's view instead of all of them sitting just outside
	## it on the diagonals.
	var xforms: Array[Transform3D] = []
	for k in N_FLOODLIGHTS:
		var a := deg_to_rad(15.0 + float(k) * 60.0)
		xforms.append(ring_transform(FLOODLIGHT_R, 0.0, a))
	_make_multimesh("FloodlightTowers", floodlight_tower_glb, xforms)
	# Same transform for both: the lamp array is modelled in the head's frame.
	# Its emissive faces sit on the head's local axis, so this yaw is what
	# aims them at the middle of the ground -- get it wrong and every pylon
	# renders as a black silhouette lighting the car park.
	_make_multimesh("FloodlightLamps", floodlight_lamps_glb, xforms)


func _build_sightscreens() -> void:
	var xforms: Array[Transform3D] = []
	for sign_ in [1.0, -1.0]:
		xforms.append(Transform3D(Basis(Vector3.UP, PI * 0.5),
				Vector3(sign_ * SIGHTSCREEN_X, 0.0, 0.0)))
	_make_multimesh("Sightscreens", sightscreen_glb, xforms)


func _build_trees() -> void:
	## Skyline behind the stands. Cheap, and it stops the roofline ending in
	## bare sky.
	var xforms: Array[Transform3D] = []
	var rng := RandomNumberGenerator.new()
	rng.seed = 991
	for i in 46:
		var a := TAU * float(i) / 46.0 + rng.randf() * 0.06  # noqa
		var r := TREE_R + rng.randf() * 9.0
		var pos := ring_transform(r, 0.0, a).origin
		var sc := 0.8 + rng.randf() * 0.7
		var basis := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * sc)
		xforms.append(Transform3D(basis, pos))
	_make_multimesh("Trees", tree_glb, xforms)
