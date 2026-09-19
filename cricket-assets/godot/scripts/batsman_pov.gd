extends Camera3D
## Batsman-POV camera with the viewmodel parented to it.
##
## Constants mirror blender/build_lookdev.py and build_viewmodel.py. If you
## retune the stance in Blender, change it here too -- or the marketing stills
## and the game will not match.

const EYE_HEIGHT := 1.65
const PITCH_LEN := 20.12
const FIELD_R := 78.0
const CROWN := 0.45

## Camera-local placement of the viewmodel: +X right, +Y up, -Z forward.
const VM_OFFSET := Vector3(0.16, -0.13, -0.76)
const VM_TILT_DEG := -72.0
const VM_ROLL_DEG := -38.0
const VM_YAW_DEG := 14.0

@export var viewmodel_glb: PackedScene
@export var look_sensitivity := 0.0025
@export var max_pitch_deg := 35.0
@export var min_pitch_deg := -30.0
## Layer the third-person batsman renders on. The camera sits inside that
## model, so it has to be culled here or the view is filled with the inside of
## his own head. The hands and bat you DO see are the separate viewmodel.
@export var body_layer := 2

var _viewmodel_rig: Node3D
var _yaw := 0.0
var _pitch := 0.0


func ground_height(x: float, z: float) -> float:
	var r := sqrt(x * x + z * z)
	var t: float = min(r / FIELD_R, 1.0)
	return CROWN * (1.0 - t * t)


func _ready() -> void:
	cull_mask &= ~(1 << (body_layer - 1))

	# 26 mm full-frame ~= 69 deg horizontal. Godot's `fov` is VERTICAL, so a
	# 16:9 viewport needs ~46 deg to match. Setting 69 here is the classic
	# mistake and gives a noticeably fish-eyed pitch.
	fov = 46.0
	near = 0.02
	far = 600.0

	var x := -PITCH_LEN * 0.5 - 1.1
	position = Vector3(x, ground_height(x, 0.42) + EYE_HEIGHT, 0.42)
	_yaw = -PI * 0.5   # look down the pitch toward the bowler
	_apply_look()

	_attach_viewmodel()


func _attach_viewmodel() -> void:
	if viewmodel_glb == null:
		return
	_viewmodel_rig = Node3D.new()
	_viewmodel_rig.name = "ViewmodelRig"
	add_child(_viewmodel_rig)
	_viewmodel_rig.position = VM_OFFSET
	# Same basis change as build_viewmodel.attach_to_camera(), with two
	# corrections that a straight copy of the Blender angles does not survive.
	#
	# 1. Blender composes an XYZ euler as Rz * Ry * Rx; Godot's default euler
	#    order is YXZ. Assigning `rotation` with the Blender numbers silently
	#    gives a different orientation, so the basis is composed explicitly.
	# 2. Blender authors the viewmodel Z-up, and the glTF exporter has already
	#    rotated it -90 degrees about X to make it Y-up. That conversion has to
	#    be undone here before the stance rotation, which is the extra 90
	#    degrees folded into the tilt term below. Without it the bat stands
	#    straight up through the middle of the screen instead of resting across
	#    the bottom right of the view.
	_viewmodel_rig.basis = (
		Basis(Vector3(0, 0, 1), deg_to_rad(180.0 + VM_YAW_DEG))
		* Basis(Vector3(0, 1, 0), deg_to_rad(VM_ROLL_DEG))
		* Basis(Vector3(1, 0, 0), deg_to_rad(180.0 + VM_TILT_DEG)))
	var vm := viewmodel_glb.instantiate()
	_viewmodel_rig.add_child(vm)
	# the viewmodel is the closest thing to camera in the whole game; it needs
	# the fabric shader more than anything else does
	var swapper := preload("res://scripts/apply_materials.gd").new()
	swapper.apply_to(vm)
	swapper.free()

	# Keeping the viewmodel sharp:
	# Godot's DOF is a full-screen post-process, so render layers CANNOT
	# exclude an object from it. What keeps the bat sharp is that NEAR blur is
	# switched off in lookdev.tscn while far blur starts at 18 m -- so anything
	# closer than that is untouched. If you ever want near blur as well, the
	# viewmodel has to move to its own SubViewport with its own camera and be
	# composited on top; there is no cheaper way in this engine.
	_viewmodel_rig.set_meta("no_dof_required", true)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := event as InputEventMouseMotion
		_yaw -= mm.relative.x * look_sensitivity
		_pitch = clamp(_pitch - mm.relative.y * look_sensitivity,
				deg_to_rad(min_pitch_deg), deg_to_rad(max_pitch_deg))
		_apply_look()


func _apply_look() -> void:
	rotation = Vector3(_pitch, _yaw, 0.0)
