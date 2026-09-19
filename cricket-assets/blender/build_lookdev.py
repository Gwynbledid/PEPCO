"""The lighting rig. This file matters more than every model in the project.

Three lights and a sky, at specific values. Change the models and the scene
still looks right; change these numbers and it stops looking like the
reference immediately.

  KeySun        40 deg elevation, front-left, 5800K, 2.5 deg soft angle
  SkyDome       the sky itself as IBL -- this is where blue shadows come from
  GrassBounce   a dim GREEN light shining UPWARD

That third light is the one people miss. Outdoors on grass, every downward
facing surface -- the underside of the trousers, the pads, the jaw -- picks up
reflected green. Without it a white kit goes dead grey in shadow and the whole
image reads as a model in a void rather than a player on a field.
"""

import math
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from lib import meshutil as M
from build_ground import ground_height, PITCH_LEN

SUN_ELEVATION = math.radians(41.0)
SUN_AZIMUTH   = math.radians(128.0)      # front-left of a down-pitch camera
SUN_COLOR     = (1.000, 0.952, 0.862)    # ~5400 K, warmer than
                                         # neutral daylight: the reference has
                                         # a distinctly golden key
SUN_STRENGTH  = 4.0                      # W/m2 -- see README for the Godot /
                                         # Unity / Unreal equivalents
SKY_STRENGTH  = 0.30                     # deliberately LOW. A full-strength
                                         # Nishita sky washes the sun out and
                                         # everything goes pastel; at 0.30 the
                                         # key dominates and the grass keeps
                                         # its colour. Measured, not guessed.
EXPOSURE      = -1.72
CLOUD_LIT     = 13.0                     # radiance of a sunlit cumulus top
SUN_ANGLE     = math.radians(2.5)        # soft shadow edges; default is 0.526
BOUNCE_COLOR  = (0.350, 0.550, 0.200)
BOUNCE_ENERGY = 0.80                     # ~17% of the key
FILL_COLOR    = (0.780, 0.845, 1.000)    # cool, like open sky
FILL_ENERGY   = 2.10
FILL_ELEV     = 58.0
FILL_AZIM     = 308.0                    # opposite the key
EYE_HEIGHT    = 1.65


def _sun_vector():
    return (
        math.cos(SUN_ELEVATION) * math.cos(SUN_AZIMUTH),
        math.cos(SUN_ELEVATION) * math.sin(SUN_AZIMUTH),
        math.sin(SUN_ELEVATION),
    )


def build_sky_world():
    """Nishita atmosphere plus procedural cumulus.

    The clouds are projected onto a virtual plane at 2200 m rather than
    wrapped on the sphere, so they get real perspective -- big overhead,
    compressed toward the horizon, exactly like the reference.
    """
    world = bpy.data.worlds.new('CricketSky')
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()

    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = SKY_STRENGTH

    sky = nt.nodes.new('ShaderNodeTexSky')
    # Blender 5.0 renamed the Nishita model to MULTIPLE_SCATTERING
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_elevation = SUN_ELEVATION
    sky.sun_rotation = SUN_AZIMUTH
    sky.sun_intensity = 0.32          # low: the sun disc is the KeySun's job
    sky.sun_disc = True
    sky.altitude = 120
    sky.air_density = 1.0
    sky.aerosol_density = 1.4         # slight haze warms the horizon
    sky.ozone_density = 1.0
    # Ground albedo is a scalar in this model. Grass reflects ~0.25, which
    # lifts the skylight slightly; the GrassBounce light supplies the colour.
    sky.ground_albedo = 0.25

    # For a WORLD shader the ray direction comes from Texture Coordinate ->
    # Generated. Geometry -> Incoming is defined relative to a surface and
    # gives nothing usable on background rays.
    texco = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(texco.outputs['Generated'], sep.inputs['Vector'])

    # t = cloud_altitude / dir.z, clamped so the horizon does not stretch
    z_safe = nt.nodes.new('ShaderNodeMath')
    z_safe.operation = 'MAXIMUM'
    z_safe.inputs[1].default_value = 0.055
    nt.links.new(sep.outputs['Z'], z_safe.inputs[0])

    t = nt.nodes.new('ShaderNodeMath')
    t.operation = 'DIVIDE'
    t.inputs[0].default_value = 1.0
    nt.links.new(z_safe.outputs[0], t.inputs[1])

    ux = nt.nodes.new('ShaderNodeMath'); ux.operation = 'MULTIPLY'
    uy = nt.nodes.new('ShaderNodeMath'); uy.operation = 'MULTIPLY'
    nt.links.new(sep.outputs['X'], ux.inputs[0]); nt.links.new(t.outputs[0], ux.inputs[1])
    nt.links.new(sep.outputs['Y'], uy.inputs[0]); nt.links.new(t.outputs[0], uy.inputs[1])

    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(ux.outputs[0], comb.inputs['X'])
    nt.links.new(uy.outputs[0], comb.inputs['Y'])

    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (0.30, 0.30, 0.30)
    nt.links.new(comb.outputs['Vector'], mapping.inputs['Vector'])

    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.55
    noise.inputs['Detail'].default_value = 9.0
    noise.inputs['Roughness'].default_value = 0.52
    nt.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])

    # a tight ramp turns soft noise into defined cumulus with hard-ish edges
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    # Lower start = more sky covered. The reference is a busy cumulus sky, so
    # coverage runs high; drop both numbers together to add more cloud without
    # turning the edges to mush.
    # RAMP WIDTH IS THE WHOLE GAME. These two numbers are 0.055 apart, and
    # that narrowness is what gives cumulus their defined edges. At 0.18 apart
    # the same noise renders as a flat grey haze at every camera elevation --
    # it reads as pollution, not weather. Widen this and no amount of
    # brightness, coverage or cloud size will rescue it; the edges are the
    # cloud. Move the two stops together to change coverage.
    ramp.color_ramp.elements[0].position = 0.448
    ramp.color_ramp.elements[1].position = 0.505
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])

    # fade the cloud layer out at the horizon (Math has no smoothstep in 5.0,
    # so Map Range does the job)
    horizon = nt.nodes.new('ShaderNodeMapRange')
    horizon.interpolation_type = 'SMOOTHSTEP'
    horizon.inputs['From Min'].default_value = 0.02
    horizon.inputs['From Max'].default_value = 0.30
    horizon.inputs['To Min'].default_value = 0.0
    horizon.inputs['To Max'].default_value = 1.0
    horizon.clamp = True
    nt.links.new(sep.outputs['Z'], horizon.inputs['Value'])

    density = nt.nodes.new('ShaderNodeMath')
    density.operation = 'MULTIPLY'
    nt.links.new(ramp.outputs['Color'], density.inputs[0])
    nt.links.new(horizon.outputs['Result'], density.inputs[1])

    # Cloud brightness is RADIANCE, and it has to compete with a physically
    # bright Nishita sky -- a value of 1.0 is not "white", it is dark grey
    # against this background. Lit tops sit around 9-11.
    # A second ramp gives lit tops and shadowed bases in one node, which is
    # what stops the clouds reading as flat paper cut-outs.
    cloud_shade = nt.nodes.new('ShaderNodeValToRGB')
    cloud_shade.color_ramp.interpolation = 'EASE'
    cloud_shade.color_ramp.elements[0].position = 0.50
    # Cloud SHADOW, not cloud grey. Set this too low and high coverage turns
    # a sunny cumulus sky into overcast -- which is exactly what happened at
    # 2.6. Sunlit cumulus have bright bases; they are not storm clouds.
    cloud_shade.color_ramp.elements[0].color = (5.0, 5.2, 5.8, 1.0)
    cloud_shade.color_ramp.elements[1].position = 0.66
    cloud_shade.color_ramp.elements[1].color = (CLOUD_LIT, CLOUD_LIT * 0.995,
                                                CLOUD_LIT * 0.97, 1.0)
    nt.links.new(noise.outputs['Fac'], cloud_shade.inputs['Fac'])

    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(density.outputs[0], mix.inputs['Factor'])
    nt.links.new(sky.outputs['Color'], mix.inputs[6])
    nt.links.new(cloud_shade.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return world


def build_lights(col=None):
    col = col or M.new_collection('Lighting')

    sun_data = bpy.data.lights.new('KeySun', type='SUN')
    sun_data.energy = SUN_STRENGTH
    sun_data.color = SUN_COLOR
    sun_data.angle = SUN_ANGLE
    sun = bpy.data.objects.new('KeySun', sun_data)
    M.link(sun, col)
    # point the lamp's -Z down the sun vector
    sx, sy, sz = _sun_vector()
    sun.rotation_euler = (
        math.acos(max(-1.0, min(1.0, sz))),
        0.0,
        math.atan2(sy, sx) + math.pi * 0.5,
    )

    bounce_data = bpy.data.lights.new('GrassBounce', type='SUN')
    bounce_data.energy = BOUNCE_ENERGY
    bounce_data.color = BOUNCE_COLOR
    bounce_data.angle = math.radians(90.0)     # very soft: it is fake GI
    bounce = bpy.data.objects.new('GrassBounce', bounce_data)
    M.link(bounce, col)
    bounce.rotation_euler = (math.radians(180), 0, 0)   # shines UPWARD
    if hasattr(bounce_data, 'use_shadow'):
        bounce_data.use_shadow = False

    # Fill. A stadium bowl bounces an enormous amount of light around its own
    # interior; with only a key and a low sky the stands read as a black void,
    # which was the single worst artefact in the first renders. Shadows OFF --
    # this is standing in for interreflection, not for a real light source.
    fill_data = bpy.data.lights.new('StandFill', type='SUN')
    fill_data.energy = FILL_ENERGY
    fill_data.color = FILL_COLOR
    fill_data.angle = math.radians(60.0)
    if hasattr(fill_data, 'use_shadow'):
        fill_data.use_shadow = False
    fill = bpy.data.objects.new('StandFill', fill_data)
    M.link(fill, col)
    fe, fa = math.radians(FILL_ELEV), math.radians(FILL_AZIM)
    fill.rotation_euler = (
        math.acos(max(-1.0, min(1.0, math.sin(fe)))),
        0.0,
        math.atan2(math.cos(fe) * math.sin(fa), math.cos(fe) * math.cos(fa))
        + math.pi * 0.5,
    )

    return col, sun, bounce, fill


def add_camera_pov(col, name='Cam_BatsmanPOV', focal=26.0):
    """The actual game camera: striker's eye, looking down the pitch."""
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = focal
    cam_data.clip_start = 0.02          # the bat is ~0.5 m away
    cam_data.clip_end = 600.0
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = 18.0  # the bowler's release point
    cam_data.dof.aperture_fstop = 4.0
    cam = bpy.data.objects.new(name, cam_data)
    M.link(cam, col)
    x = -PITCH_LEN * 0.5 - 1.1
    cam.location = (x, 0.42, ground_height(x, 0.42) + EYE_HEIGHT)
    cam.rotation_euler = (math.radians(87.5), 0, math.radians(-90))
    return cam


def add_camera_hero(col, name='Cam_Hero', focal=85.0):
    """A third-person beauty shot matching the reference framing -- long lens,
    low angle, batsman against the stands. Use this for look validation and
    for marketing stills, not for gameplay."""
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = focal
    cam_data.clip_start = 0.05
    cam_data.clip_end = 600.0
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = 11.0
    cam_data.dof.aperture_fstop = 2.8   # heavy background bokeh
    cam = bpy.data.objects.new(name, cam_data)
    M.link(cam, col)
    cam.location = (-17.6, -7.2, 1.30)
    cam.rotation_euler = (math.radians(87.0), 0, math.radians(-57.0))
    return cam


def _add_bloom(scene, strength=0.42, threshold=1.0, size=0.62):
    """Bloom, for INTERACTIVE Blender only -- off by default. See the warning.

    Blender 5.0 moved compositing into a node group on the scene
    (`scene.compositing_node_group`) and turned every Glare setting into an
    input socket, so this looks nothing like the 3.x recipe you will find
    online.

    WARNING -- verified on Blender 5.0.1 built as the `bpy` Python module:
    assigning ANY compositing_node_group, even a bare input->output
    passthrough, makes `render()` emit a black frame in ~0.5s without ever
    rasterising. The compositor needs a real GL context that headless bpy does
    not provide, and it fails silently. If you are scripting renders, leave
    bloom off here. Inside the Blender GUI this function works fine.

    None of this matters for the game: bloom is Godot's job, and
    godot/scenes/lookdev.tscn sets the equivalent glow on WorldEnvironment.
    Threshold 1.0 means only genuine highlights bleed -- cloud tops, the
    floodlight lamps, sun off the grille. Keep strength low; heavy bloom reads
    as a mobile filter, not a film render.
    """
    ng = bpy.data.node_groups.get('CricketPost')
    if ng is None:
        ng = bpy.data.node_groups.new('CricketPost', 'CompositorNodeTree')
        ng.interface.new_socket('Image', in_out='INPUT',
                                socket_type='NodeSocketColor')
        ng.interface.new_socket('Image', in_out='OUTPUT',
                                socket_type='NodeSocketColor')
        gin = ng.nodes.new('NodeGroupInput')
        gout = ng.nodes.new('NodeGroupOutput')
        gin.location = (-400, 0)
        gout.location = (400, 0)

        glare = ng.nodes.new('CompositorNodeGlare')
        glare.location = (0, 0)
        settings = {
            'Type': 'Bloom',
            'Quality': 'High',
            'Threshold': threshold,
            'Strength': strength,
            'Size': size,
            'Smoothness': 0.25,
        }
        for key, val in settings.items():
            if key in glare.inputs:
                try:
                    glare.inputs[key].default_value = val
                except (TypeError, AttributeError):
                    pass

        ng.links.new(gin.outputs[0], glare.inputs['Image'])
        ng.links.new(glare.outputs['Image'], gout.inputs[0])

    scene.use_nodes = True
    scene.compositing_node_group = ng
    return ng


def aim(obj, target):
    """Point an object's -Z at a world-space target."""
    from mathutils import Vector
    direction = (Vector(target) - obj.location).normalized()
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return obj


def add_camera_reference(col, name='Cam_Reference', focal=50.0):
    """Framed like the reference photograph: low across the outfield, stands
    filling the middle band, sky above, grass in the foreground."""
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = focal
    cam_data.clip_start = 0.05
    cam_data.clip_end = 900.0
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = 95.0
    cam_data.dof.aperture_fstop = 8.0     # stands nearly sharp, as in the ref
    cam = bpy.data.objects.new(name, cam_data)
    M.link(cam, col)
    # Look toward -Y. The key sits at azimuth 128 deg, so the stands on the
    # -Y arc present their LIT inward faces to this camera. Aiming the other
    # way photographs the shadowed half of the bowl, which is what made the
    # first pass look like an overcast evening.
    cam.location = (-4.0, 30.0, 2.35)
    aim(cam, (0.0, -88.0, 13.0))
    return cam


def configure_render(engine='BLENDER_EEVEE', samples=48,
                     resolution=(1280, 720), bloom=False):
    """Exposure, tonemap and post. Fixed exposure -- never auto."""
    scene = bpy.context.scene
    available = [e.identifier for e in
                 scene.bl_rna.properties['render'].fixed_type
                 .bl_rna.properties['engine'].enum_items]
    scene.render.engine = engine if engine in available else available[0]
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False

    if scene.render.engine == 'CYCLES':
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 6
        scene.cycles.device = 'CPU'
    else:
        scene.eevee.taa_render_samples = samples
        if hasattr(scene.eevee, 'use_raytracing'):
            scene.eevee.use_raytracing = True

    vs = scene.view_settings
    # Khronos PBR Neutral, NOT AgX. Measured side by side on this scene, AgX
    # desaturated the outfield to 0.31 chroma while PBR Neutral held 0.45 --
    # AgX is built to roll highlights off gracefully for film, and it eats
    # exactly the saturated mid-tones this art style is made of.
    for want in ('Khronos PBR Neutral', 'AgX', 'Filmic'):
        try:
            vs.view_transform = want
            break
        except TypeError:
            continue
    # The look list is populated from the active OCIO config and is NOT
    # visible through bl_rna, so probe it by assignment.
    if vs.view_transform == 'AgX':
        for want in ('AgX - Punchy', 'Punchy', 'None'):
            try:
                vs.look = want
                break
            except TypeError:
                continue
    vs.exposure = EXPOSURE
    vs.gamma = 1.0
    if bloom:
        _add_bloom(scene)
    return scene


def build(col=None, with_cameras=True):
    build_sky_world()
    col, sun, bounce, fill = build_lights(col)
    cams = {}
    if with_cameras:
        cams['pov'] = add_camera_pov(col)
        cams['hero'] = add_camera_hero(col)
        cams['reference'] = add_camera_reference(col)
    return col, {'sun': sun, 'bounce': bounce, 'fill': fill, **cams}


if __name__ == '__main__':
    M.reset_scene()
    col, rig = build()
    configure_render()
    print('lighting rig:', ', '.join(sorted(rig)))
    print('sun vector:', tuple(round(v, 3) for v in _sun_vector()))
    print('view transform:', bpy.context.scene.view_settings.view_transform,
          '| look:', bpy.context.scene.view_settings.look)
