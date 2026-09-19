"""Materials and the project palette.

Colours below are written as SRGB -- the numbers you would read off a colour
picker or sample from the reference screenshot -- and converted to linear on
the way into the shader by `_srgb()`.

Getting this backwards is the classic renderer bug and it is not subtle: feed
sRGB 0.78 straight into a linear socket and a tan pitch renders pale grey, a
rich outfield renders mint, and you spend a day blaming the lights. If a
surface looks washed out and desaturated, suspect this before anything else.

Two rules keep this palette on-style:
  * No pure white and no pure black. Whites sit at ~0.87 so they still have
    headroom to pick up the green grass bounce; blacks bottom out near 0.03.
  * Roughness carries the material story, not albedo detail.
"""

import bpy


def _srgb(c):
    """sRGB -> linear, per component. The exact IEC 61966-2-1 curve."""
    return tuple(
        v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        for v in c
    )


# --- palette -----------------------------------------------------------
KIT_WHITE      = (0.880, 0.868, 0.838)   # cotton twill, faintly warm
KIT_ACCENT     = (0.035, 0.282, 0.240)   # dark teal numbers/lettering
PAD_WHITE      = (0.900, 0.888, 0.862)
LEATHER_STRAP  = (0.180, 0.160, 0.145)
SKIN           = (0.620, 0.415, 0.300)
HELMET_NAVY    = (0.055, 0.085, 0.170)
GRILLE_STEEL   = (0.560, 0.570, 0.585)
WILLOW         = (0.860, 0.762, 0.550)
GRIP_BLACK     = (0.045, 0.045, 0.050)

GRASS_LIGHT    = (0.250, 0.580, 0.120)
GRASS_DARK     = (0.203, 0.497, 0.104)
PITCH_TAN      = (0.780, 0.655, 0.470)
CREASE_WHITE   = (0.920, 0.915, 0.900)

SEAT_BLUE      = (0.130, 0.350, 0.620)
BOX_GLASS      = (0.055, 0.085, 0.115)   # corporate-box glazing, near-black
BOX_FRAME      = (0.760, 0.755, 0.735)   # pale precast frames between boxes
ROOF_GREEN     = (0.075, 0.180, 0.115)
CONCRETE       = (0.600, 0.592, 0.570)
SIGHTSCREEN    = (0.050, 0.300, 0.180)
STEEL_DARK     = (0.120, 0.125, 0.135)
FLOODLIGHT_EM  = (1.000, 0.960, 0.880)

# Roughness reference table -- see cricket-assets/README.md
R_COTTON   = 0.80
R_LEATHER  = 0.45
R_HELMET   = 0.25
R_METAL    = 0.30
R_WILLOW   = 0.35
R_GRIP     = 0.65
R_GRASS    = 0.62
R_PITCH    = 0.90
R_CONCRETE = 0.85
R_PLASTIC  = 0.40


def _principled(name, base, roughness, metallic=0.0, emission=None,
                emission_strength=0.0, alpha=1.0):
    """One Principled BSDF, wired for clean glTF export.

    Only base colour / metallic / roughness / emission are used -- these are
    exactly the channels glTF carries, so what you see in Blender is what
    lands in Godot.
    """
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*_srgb(base), 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'IOR' in bsdf.inputs:
        bsdf.inputs['IOR'].default_value = 1.45
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*_srgb(emission), 1.0)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.blend_method = 'BLEND'
    return mat


# --- named materials ---------------------------------------------------
# Names are the contract with Godot: the importer script matches on these
# strings to swap in the custom shaders.

def kit_white():     return _principled('M_KitWhite',   KIT_WHITE, R_COTTON)
def kit_accent():    return _principled('M_KitAccent',  KIT_ACCENT, R_COTTON)
def pad_white():     return _principled('M_PadWhite',   PAD_WHITE, R_LEATHER)
def strap():         return _principled('M_Strap',      LEATHER_STRAP, R_LEATHER)
def skin():          return _principled('M_Skin',       SKIN, 0.55)
def helmet():        return _principled('M_Helmet',     HELMET_NAVY, R_HELMET)
def grille():        return _principled('M_Grille',     GRILLE_STEEL, R_METAL, metallic=1.0)
def willow():        return _principled('M_Willow',     WILLOW, R_WILLOW)
def grip():          return _principled('M_Grip',       GRIP_BLACK, R_GRIP)
def grass():         return _principled('M_Grass',      GRASS_LIGHT, R_GRASS)
def pitch():         return _principled('M_Pitch',      PITCH_TAN, R_PITCH)
def crease():        return _principled('M_Crease',     CREASE_WHITE, 0.75)
def seat():          return _principled('M_Seat',       SEAT_BLUE, R_PLASTIC)
def concrete():      return _principled('M_Concrete',   CONCRETE, R_CONCRETE)
def sightscreen():   return _principled('M_Sightscreen', SIGHTSCREEN, 0.70)
def steel_dark():    return _principled('M_SteelDark',  STEEL_DARK, R_METAL, metallic=1.0)
def hoarding():      return _principled('M_Hoarding',   (0.75, 0.75, 0.76), 0.55)
def crowd():         return _principled('M_Crowd',      (0.45, 0.42, 0.44), 0.85)
def floodlight():
    return _principled('M_Floodlight', (0.9, 0.9, 0.9), 0.3,
                       emission=FLOODLIGHT_EM, emission_strength=40.0)


def mown_grass(stripe_width_m=4.0):
    """Outfield grass WITH the mowing stripes, for Blender previews.

    The stripes are not geometry and not a texture -- they are the same
    surface mown in opposite directions, so alternate bands reflect differently.
    That means the albedo difference is tiny (~6%) and most of the effect lives
    in ROUGHNESS. Push the albedo apart instead and it reads as paint.

    godot/shaders/mown_grass.gdshader is the real-time version of this; keep
    the two in sync if you retune.
    """
    name = 'M_GrassMown'
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']

    texco = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(texco.outputs['Object'], sep.inputs['Vector'])

    # square wave along Y at the mower's spacing
    div = nt.nodes.new('ShaderNodeMath')
    div.operation = 'DIVIDE'
    div.inputs[1].default_value = stripe_width_m
    nt.links.new(sep.outputs['Y'], div.inputs[0])

    wrap = nt.nodes.new('ShaderNodeMath')
    wrap.operation = 'PINGPONG'
    wrap.inputs[1].default_value = 1.0
    nt.links.new(div.outputs[0], wrap.inputs[0])

    step = nt.nodes.new('ShaderNodeMath')
    step.operation = 'GREATER_THAN'
    step.inputs[1].default_value = 0.5
    nt.links.new(wrap.outputs[0], step.inputs[0])

    col_mix = nt.nodes.new('ShaderNodeMix')
    col_mix.data_type = 'RGBA'
    col_mix.inputs[6].default_value = (*_srgb(GRASS_DARK), 1.0)
    col_mix.inputs[7].default_value = (*_srgb(GRASS_LIGHT), 1.0)
    nt.links.new(step.outputs[0], col_mix.inputs['Factor'])
    nt.links.new(col_mix.outputs[2], bsdf.inputs['Base Color'])

    # roughness does most of the work: 0.48 toward the mower, 0.72 away
    r_mix = nt.nodes.new('ShaderNodeMix')
    r_mix.data_type = 'FLOAT'
    r_mix.inputs[2].default_value = 0.72
    r_mix.inputs[3].default_value = 0.48
    nt.links.new(step.outputs[0], r_mix.inputs['Factor'])
    nt.links.new(r_mix.outputs[0], bsdf.inputs['Roughness'])
    return m


# --- textured materials -------------------------------------------------
import os as _os
_TEXDIR = _os.path.join(
    _os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))),
    'textures')


def _image(filename):
    """Load a generated texture, reusing it if already loaded."""
    img = bpy.data.images.get(filename)
    if img is None:
        path = _os.path.join(_TEXDIR, filename)
        if not _os.path.exists(path):
            return None
        img = bpy.data.images.load(path)
    return img


def textured(name, filename, roughness=0.6, alpha_clip=False,
             emission_boost=0.0):
    """Principled BSDF driven by one of the generated PNGs.

    Textures are authored in sRGB (they came out of Pillow), so the image node
    must stay on sRGB -- setting it to Non-Color here is the same colour-space
    mistake the palette comment warns about, just in the other direction.
    """
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = roughness

    img = _image(filename)
    if img is None:
        bsdf.inputs['Base Color'].default_value = (0.7, 0.7, 0.7, 1.0)
        return mat

    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'CLIP' if alpha_clip else 'REPEAT'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if emission_boost > 0.0:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emission_boost
    if alpha_clip:
        nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else 'BLEND'
        if hasattr(mat, 'shadow_method'):
            mat.shadow_method = 'CLIP'
    return mat


def concrete_tex(name='M_ConcreteTex', tint=(1.0, 1.0, 1.0), scale=0.95):
    """Weathered concrete, BOX-PROJECTED from object coordinates.

    The stand is built from swept quad strips whose UVs run 0..1 per segment,
    so a UV-mapped texture would stretch differently on every face. Box
    projection ignores the UVs entirely and projects along the dominant axis
    of each face, which gives an even real-world texel density across
    terracing, risers and walls alike -- and needs no unwrapping at all.

    `scale` is in object units: 0.95 tiles the map roughly every 1.05 m.

    Measured, not guessed. At 0.25 (4 m tiles) the blotching read as soft
    marble and the form-board lines disappeared entirely -- a 1024 px map
    stretched over 4 m puts the whole thing below the detail the eye wants at
    conversational distance. Around a metre per tile, the lines land at a
    believable board pitch and the grain survives.
    """
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']

    albedo = _image('concrete_albedo.png')
    rough = _image('concrete_rough.png')
    if albedo is None:
        bsdf.inputs['Base Color'].default_value = (*_srgb(CONCRETE), 1.0)
        bsdf.inputs['Roughness'].default_value = R_CONCRETE
        return mat

    texco = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (scale, scale, scale)
    nt.links.new(texco.outputs['Object'], mapping.inputs['Vector'])

    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = albedo
    tex.projection = 'BOX'
    tex.projection_blend = 0.30
    nt.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])

    if tint != (1.0, 1.0, 1.0):
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        nt.links.new(tex.outputs['Color'], mix.inputs[6])
        mix.inputs[7].default_value = (*tint, 1.0)
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    else:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

    if rough is not None:
        rtex = nt.nodes.new('ShaderNodeTexImage')
        rtex.image = rough
        rtex.image.colorspace_settings.name = 'Non-Color'   # data, not colour
        rtex.projection = 'BOX'
        rtex.projection_blend = 0.30
        nt.links.new(mapping.outputs['Vector'], rtex.inputs['Vector'])
        nt.links.new(rtex.outputs['Color'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = R_CONCRETE
    return mat


def precast_tex():
    """Paler precast, for the box-balcony frames and piers."""
    return concrete_tex('M_PrecastTex', tint=(1.18, 1.17, 1.14), scale=1.35)


def seat_tex():
    return textured('M_SeatTex', 'seat.png', roughness=R_PLASTIC)


def crowd_tex():
    return textured('M_CrowdTex', 'crowd_atlas.png', roughness=0.9,
                    alpha_clip=True)


def hoarding_tex(index):
    return textured(f'M_Hoarding{index:02d}', f'hoarding_{index:02d}.png',
                    roughness=0.45)


def signage_tex():
    return textured('M_Signage', 'stand_signage.png', roughness=0.55)


def seat_block_tex():
    return textured('M_SeatBlock', 'seat_block.png', roughness=0.42)


def box_glass(z_lo=10.5, z_hi=13.9):
    """Corporate-box glazing with a faked sky reflection.

    Flat near-black glass reads as a hole in the building -- the balcony looked
    like a row of empty hollow boxes. Real glazing at this angle mirrors the
    sky: pale and cool along the top of each pane, falling to dark where it
    reflects the far stand and the ground. A vertical gradient in object space
    gets that for nothing, and gives the band the sense of being a surface
    rather than an absence.
    """
    name = 'M_BoxGlass'
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.06
    bsdf.inputs['Metallic'].default_value = 0.55

    texco = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(texco.outputs['Object'], sep.inputs['Vector'])

    height = nt.nodes.new('ShaderNodeMapRange')
    height.inputs['From Min'].default_value = z_lo
    height.inputs['From Max'].default_value = z_hi
    height.clamp = True
    nt.links.new(sep.outputs['Z'], height.inputs['Value'])

    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    ramp.color_ramp.elements[0].position = 0.10
    ramp.color_ramp.elements[0].color = (*_srgb((0.030, 0.048, 0.070)), 1.0)
    ramp.color_ramp.elements[1].position = 0.92
    ramp.color_ramp.elements[1].color = (*_srgb((0.300, 0.430, 0.560)), 1.0)
    nt.links.new(height.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def mullion():
    """Dark anodised glazing bars."""
    return _principled('M_Mullion', (0.115, 0.120, 0.128), 0.32, metallic=0.7)


def handrail():
    return _principled('M_Handrail', (0.690, 0.700, 0.715), 0.28, metallic=0.9)


def box_frame():
    return _principled('M_BoxFrame', BOX_FRAME, 0.55)


def roof_green():
    return _principled('M_Roof', ROOF_GREEN, 0.55)


def halogen():
    """Halogen lamp face. Emission strength is deliberately extreme -- these
    have to blow out and bloom in full daylight, the way real floodlights do
    in a sunny photograph."""
    return _principled('M_Halogen', (1.0, 0.98, 0.93), 0.18,
                       emission=(1.0, 0.972, 0.90), emission_strength=220.0)


def foliage():
    return _principled('M_Foliage', (0.145, 0.320, 0.105), 0.78)


def bark():
    return _principled('M_Bark', (0.230, 0.170, 0.125), 0.85)


def assign(obj, material, slot=0):
    """Put `material` in the given slot, creating slots as needed."""
    while len(obj.data.materials) <= slot:
        obj.data.materials.append(None)
    obj.data.materials[slot] = material
    return obj


def assign_faces(obj, material, predicate):
    """Add `material` as a new slot and move every face matching
    predicate(face_center) onto it. Used for the crease lines on the pitch and
    the number panel on the kit."""
    obj.data.materials.append(material)
    idx = len(obj.data.materials) - 1
    for poly in obj.data.polygons:
        if predicate(poly.center):
            poly.material_index = idx
    return obj
