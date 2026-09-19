@tool
extends Node3D
## Swap glTF's imported Principled materials for the project's ShaderMaterials.
##
## glTF only carries base colour / metallic / roughness, so an imported mesh
## arrives with a plain StandardMaterial3D and none of the sheen, mown stripes
## or triplanar concrete is active. The Blender materials are named
## deliberately (M_GrassMown, M_ConcreteTex, ...) precisely so they can be
## matched here -- that naming is the contract between the two halves of the
## pipeline.
##
## Matching is per SURFACE, not per mesh: ground.glb's outfield, pitch, creases
## and stumps are separate surfaces that need different materials, and a
## material_override would flatten all of them to one.

const MAP := {
	"M_GrassMown": "res://materials/grass.tres",
	"M_ConcreteTex": "res://materials/concrete.tres",
	"M_PrecastTex": "res://materials/precast.tres",
	"M_Crowd": "res://materials/crowd.tres",
	"M_CrowdTex": "res://materials/crowd.tres",
	"M_KitWhite": "res://materials/kit_white.tres",
	"M_PadWhite": "res://materials/pad_white.tres",
}

@export var apply_on_ready := true
@export var verbose := false
## Build static collision from the meshes. The foot IK raycasts downward and
## needs something to hit; an imported glTF carries no collision at all.
@export var generate_collision := false

var _cache: Dictionary = {}


func _ready() -> void:
	if apply_on_ready:
		apply_to(self)
	if generate_collision:
		_build_collision(self)


func _build_collision(root: Node) -> int:
	var made := 0
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
			(n as MeshInstance3D).create_trimesh_collision()
			made += 1
		for c in n.get_children():
			stack.append(c)
	return made


func _load(path: String) -> Material:
	if not _cache.has(path):
		_cache[path] = load(path)
	return _cache[path]


func apply_to(root: Node) -> int:
	var swapped := 0
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			var mesh := mi.mesh
			if mesh != null:
				for s in mesh.get_surface_count():
					var src := mesh.surface_get_material(s)
					if src == null:
						continue
					var key := src.resource_name
					if MAP.has(key):
						# surface_override, not material_override: override
						# replaces every surface on the instance at once
						mi.set_surface_override_material(s, _load(MAP[key]))
						swapped += 1
						if verbose:
							print("  %s surface %d -> %s" % [mi.name, s, key])
		for c in n.get_children():
			stack.append(c)
	return swapped
