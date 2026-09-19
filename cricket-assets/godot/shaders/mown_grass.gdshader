// Outfield grass with mowing stripes.
//
// The stripes are NOT paint and NOT a texture. They are the same grass mown in
// opposite directions, so alternate bands reflect light differently. That means
// the albedo difference is tiny (~6%) and ROUGHNESS carries the effect. Push
// the two colours apart instead and it immediately reads as a painted pitch.
//
// Stripes are computed in WORLD space, so they stay a fixed real-world width no
// matter how the ground mesh is scaled or subdivided.

shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

group_uniforms Stripes;
uniform vec3 colour_light : source_color = vec3(0.250, 0.580, 0.120);
uniform vec3 colour_dark  : source_color = vec3(0.160, 0.420, 0.090);
uniform float stripe_width_m : hint_range(1.0, 12.0) = 4.0;
uniform float stripe_angle_deg : hint_range(0.0, 180.0) = 0.0;
uniform float roughness_toward : hint_range(0.0, 1.0) = 0.48;
uniform float roughness_away   : hint_range(0.0, 1.0) = 0.72;

group_uniforms Detail;
uniform float variation_scale : hint_range(0.1, 20.0) = 3.5;
uniform float variation_amount : hint_range(0.0, 0.5) = 0.06;
uniform float sheen : hint_range(0.0, 1.0) = 0.25;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

// cheap value noise -- enough to break up the flatness, no texture fetch
float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash12(i);
	float b = hash12(i + vec2(1.0, 0.0));
	float c = hash12(i + vec2(0.0, 1.0));
	float d = hash12(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void fragment() {
	float a = radians(stripe_angle_deg);
	// project world XZ onto the mowing direction
	float along = world_pos.x * sin(a) + world_pos.z * cos(a);
	float phase = along / stripe_width_m;

	// Analytic antialiasing. Without this the stripes alias into moire the
	// moment the outfield recedes -- very visible from a batsman-height camera
	// looking 70 m downfield, and the single thing that makes stripes look
	// cheap. fwidth() gives the per-pixel footprint so distant bands blend to
	// their average instead of shimmering.
	float w = fwidth(phase) * 2.0;
	float tri = abs(fract(phase) - 0.5) * 2.0;
	float band = smoothstep(0.5 - w, 0.5 + w, tri);

	float n = vnoise(world_pos.xz * variation_scale);
	vec3 base = mix(colour_dark, colour_light, band);
	base *= 1.0 + (n - 0.5) * variation_amount * 2.0;

	ALBEDO = base;
	ROUGHNESS = mix(roughness_away, roughness_toward, band) + (n - 0.5) * 0.05;
	SPECULAR = 0.35;
	// grass is fuzzy: a rim term stands in for the fibres catching skylight
	RIM = sheen;
	RIM_TINT = 0.4;
}
