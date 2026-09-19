extends SceneTree
## Render one frame of match.tscn from the batsman POV to a PNG.
##
## Needs a real GL context: run under xvfb with the software rasteriser
## (LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe). Headless writes nothing.

func _initialize() -> void:
	var scene := (load("res://scenes/match.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	var cam := scene.get_node("BatsmanPOV") as Camera3D
	cam.current = true
	for i in 12:
		await process_frame
	await process_frame
	var img := root.get_texture().get_image()
	img.save_png("res://../renders/godot_pov.png")
	print("wrote renders/godot_pov.png ", img.get_size())
	quit(0)
