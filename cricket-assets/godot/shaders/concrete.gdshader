// Weathered stadium concrete, TRIPLANAR.
//
// The stand is swept quad strips whose UVs run 0..1 per segment, so a
// UV-mapped texture stretches differently on every face -- risers, treads and
// walls would each get a different texel density. Triplanar projection ignores
// the UVs and blends three world-space projections weighted by the surface
// normal, giving even real-world texel size everywhere and needing no unwrap.
//
// This mirrors the BOX projection used by mat.concrete_tex() in Blender; keep
// `tri_scale` in step with the Mapping node's scale there (0.25 = 4 m tiles)
// or the preview renders and the game will not match.

shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, hint_default_white;
uniform sampler2D roughness_tex : hint_default_white, filter_linear_mipmap;
uniform vec3 tint : source_color = vec3(1.0, 1.0, 1.0);
uniform float tri_scale : hint_range(0.02, 2.0) = 0.25;
uniform float tri_sharpness : hint_range(1.0, 16.0) = 4.0;
uniform float roughness_min : hint_range(0.0, 1.0) = 0.30;
uniform float roughness_max : hint_range(0.0, 1.0) = 0.98;

varying vec3 tri_pos;
varying vec3 tri_weights;

void vertex() {
	tri_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz * tri_scale;

	// World-space normal, then sharpen so faces pick one dominant projection
	// instead of smearing all three. Too low and everything looks doubled;
	// too high and the blend seams show on curved surfaces.
	vec3 n = normalize(mat3(MODEL_MATRIX) * NORMAL);
	vec3 w = pow(abs(n), vec3(tri_sharpness));
	tri_weights = w / max(w.x + w.y + w.z, 1e-4);
}

vec4 triplanar(sampler2D tex, vec3 p, vec3 w) {
	vec4 s = vec4(0.0);
	s += texture(tex, p.xy) * w.z;
	s += texture(tex, p.xz) * w.y;
	s += texture(tex, p.zy * vec2(-1.0, 1.0)) * w.x;
	return s;
}

void fragment() {
	ALBEDO = triplanar(albedo_tex, tri_pos, tri_weights).rgb * tint;
	float r = triplanar(roughness_tex, tri_pos, tri_weights).r;
	ROUGHNESS = clamp(mix(roughness_min, roughness_max, r), 0.0, 1.0);
	SPECULAR = 0.35;
	METALLIC = 0.0;
}
