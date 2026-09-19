// Cricket whites, pads and gloves.
//
// The one thing a default PBR material cannot do here is SHEEN -- the soft
// bright edge along a trouser leg where cotton fibres catch skylight. Godot
// exposes exactly this as RIM/RIM_TINT, which is cheaper than a real sheen BRDF
// and, for a stylised look, indistinguishable.
//
// Keep base_colour off pure white (0.88 is right). Pure white clips, and once
// clipped a surface can no longer pick up the green bounce from the outfield,
// which is what makes a kit look like it is outdoors on grass.

shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

group_uniforms Surface;
uniform vec3 base_colour : source_color = vec3(0.880, 0.868, 0.838);
uniform float roughness_value : hint_range(0.0, 1.0) = 0.80;
uniform float metallic_value : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D albedo_tex : source_color, hint_default_white;
uniform bool use_albedo_tex = false;

group_uniforms Sheen;
uniform float sheen_strength : hint_range(0.0, 1.0) = 0.32;
uniform float sheen_tint : hint_range(0.0, 1.0) = 0.55;

group_uniforms Wear;
// Curvature-driven edge lightening. Subtle -- at 0.15 you should not be able
// to point at it, only notice the material looks less plastic.
uniform float edge_wear : hint_range(0.0, 1.0) = 0.15;
uniform sampler2D normal_tex : hint_normal;
uniform bool use_normal_tex = false;
uniform float normal_strength : hint_range(0.0, 2.0) = 1.0;

void fragment() {
	vec3 albedo = base_colour;
	if (use_albedo_tex) {
		albedo *= texture(albedo_tex, UV).rgb;
	}

	if (use_normal_tex) {
		NORMAL_MAP = texture(normal_tex, UV).rgb;
		NORMAL_MAP_DEPTH = normal_strength;
	}

	// fresnel-ish edge lift, stands in for a curvature bake
	float ndv = clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	albedo += vec3(edge_wear * 0.12) * pow(1.0 - ndv, 3.0);

	ALBEDO = albedo;
	ROUGHNESS = roughness_value;
	METALLIC = metallic_value;
	SPECULAR = 0.4;
	RIM = sheen_strength;
	RIM_TINT = sheen_tint;
}
