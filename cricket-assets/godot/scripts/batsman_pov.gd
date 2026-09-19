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

var _viewmodel_rig: Node3D
var _yaw := 0.0
var _pitch := 0.0


func ground_height(x: float, z: float) -> float:
	var r := sqrt(x * x + z * z)
	var t: float = min(r / FIELD_R, 1.0)
	return CROWN * (1.0 - t * t)


func _ready() -> void:
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
	# Same basis change as build_viewmodel.attach_to_camera(): the asset is
	# authored Z-up, the camera looks down -Z.
	_viewmodel_rig.rotation = Vector3(
		deg_to_rad(90.0 + VM_TILT_DEG),
		deg_to_rad(VM_ROLL_DEG),
		deg_to_rad(180.0 + VM_YAW_DEG))
	_viewmodel_rig.add_child(viewmodel_glb.instantiate())

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
