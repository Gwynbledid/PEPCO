// Crowd: Y-axis-billboarded quads drawn as one MultiMesh.
//
// A full stadium is ~28,000 spectators. As meshes that is unshippable; as
// billboards in a single MultiMesh it is one draw call. Three cheap tricks make
// cards read as a crowd rather than as wallpaper:
//   1. an atlas of poses, picked per instance
//   2. per-instance hue/value tint on the clothing
//   3. a per-instance phase on the idle bob, so nobody moves in sync
// Without (3) especially, the stand looks like it is breathing.

shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_lambert,
	specular_disabled, shadows_disabled;

uniform sampler2D crowd_atlas : source_color, filter_linear_mipmap;
uniform int atlas_cols : hint_range(1, 8) = 4;
uniform int atlas_rows : hint_range(1, 8) = 4;
uniform float alpha_cut : hint_range(0.0, 1.0) = 0.5;

group_uniforms Motion;
uniform float bob_amplitude : hint_range(0.0, 0.3) = 0.035;
uniform float bob_speed : hint_range(0.0, 6.0) = 1.4;
uniform float sway_amount : hint_range(0.0, 0.3) = 0.02;

group_uniforms Variation;
uniform float tint_strength : hint_range(0.0, 1.0) = 0.55;
uniform float value_spread : hint_range(0.0, 1.0) = 0.35;

varying flat vec2 atlas_offset;
varying flat vec3 tint;

float hash11(float p) {
	p = fract(p * 0.1031);
	p *= p + 33.33;
	p *= p + p;
	return fract(p);
}

void vertex() {
	float id = float(INSTANCE_ID);
	float r1 = hash11(id * 1.017);
	float r2 = hash11(id * 2.371 + 11.0);
	float r3 = hash11(id * 3.709 + 23.0);

	// pick an atlas cell
	int cell = int(r1 * float(atlas_cols * atlas_rows));
	atlas_offset = vec2(float(cell % atlas_cols), float(cell / atlas_cols));

	// clothing tint: random hue, random value, never fully saturated
	vec3 hue = vec3(hash11(id * 5.11), hash11(id * 7.31), hash11(id * 9.13));
	float v = 0.55 + (r3 - 0.5) * value_spread;
	tint = mix(vec3(1.0), normalize(hue + 0.25) * 1.7, tint_strength) * v;

	// idle motion, de-synchronised by a per-instance phase
	float phase = r2 * 6.2831853;
	VERTEX.y += sin(TIME * bob_speed + phase) * bob_amplitude;
	VERTEX.x += sin(TIME * bob_speed * 0.6 + phase * 1.7) * sway_amount;

	// Y-billboard: face the camera but stay upright. A full billboard makes
	// the crowd visibly tilt when the camera pitches up at a six.
	vec3 cam_right = normalize(cross(vec3(0.0, 1.0, 0.0), INV_VIEW_MATRIX[2].xyz));
	vec3 cam_fwd = normalize(cross(cam_right, vec3(0.0, 1.0, 0.0)));
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(
		vec4(cam_right, 0.0),
		vec4(0.0, 1.0, 0.0, 0.0),
		vec4(cam_fwd, 0.0),
		MODEL_MATRIX[3]);
}

void fragment() {
	vec2 cell_size = vec2(1.0 / float(atlas_cols), 1.0 / float(atlas_rows));
	vec2 uv = (UV + atlas_offset) * cell_size;
	vec4 tex = texture(crowd_atlas, uv);
	if (tex.a < alpha_cut) {
		discard;
	}
	ALBEDO = tex.rgb * tint;
	ROUGHNESS = 0.9;
	SPECULAR = 0.1;
}
