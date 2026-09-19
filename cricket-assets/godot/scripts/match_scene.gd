extends Node3D
## Runtime assembly: drops the ground, stadium, batsman and POV together and
## starts the batsman idling. Everything it needs is assigned in match.tscn;
## this only does the work that cannot be expressed as scene data.

## Nothing to spawn any more: the batsman is a CharacterBody3D in match.tscn
## driven by batsman_controller.gd, because root motion needs a physics body
## and that cannot be created meaningfully from a plain Node3D at runtime.


func _ready() -> void:
	pass
