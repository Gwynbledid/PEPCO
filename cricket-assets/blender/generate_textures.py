"""Generate the texture set procedurally with Pillow.

No painting required and nothing to lose: re-run and you get the same maps.
Everything is authored at the scale it is actually seen from -- the crowd is
80 m away behind depth of field, so its cells are deliberately simple. Detail
spent there is detail wasted.

    python3 generate_textures.py

Brand names on the hoardings are INVENTED. Real sponsor logos are trademarks
and will block a store release, so do not swap them for the ones in your
reference photo.
"""

import glob
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import noise as N

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'textures')

# clearly fictional sponsors
BRANDS = [
    ('ZENTRA',   'TILES',       (206, 32, 39),   (255, 255, 255)),
    ('KORVEX',   'MOTORS',      (18, 62, 140),   (255, 255, 255)),
    ('MERIDIAN', 'BANK',        (247, 181, 0),   (24, 24, 28)),
    ('PULSE',    'ENERGY',      (0, 132, 94),    (255, 255, 255)),
    ('ALTIVO',   'CEMENT',      (232, 90, 20),   (255, 255, 255)),
    ('NIMBUS',   'TELECOM',     (92, 44, 150),   (255, 255, 255)),
]

SHIRTS = [
    (214, 56, 48), (32, 84, 168), (242, 226, 92), (240, 240, 245),
    (38, 142, 96), (232, 128, 40), (140, 52, 150), (28, 32, 44),
    (220, 118, 150), (60, 176, 196), (176, 42, 60), (250, 178, 60),
    (96, 112, 128), (18, 110, 64), (236, 236, 226), (168, 44, 36),
]
SKINS = [(232, 186, 148), (196, 142, 102), (152, 102, 68),
         (112, 74, 48), (74, 48, 32), (246, 208, 178)]
HAIR = [(28, 20, 16), (54, 34, 20), (96, 66, 38), (18, 16, 18), (140, 120, 96)]


def _font(size, bold=True):
    names = ['LiberationSans-Bold.ttf'] if bold else ['LiberationSans-Regular.ttf']
    for n in names:
        hits = glob.glob(f'/usr/share/fonts/**/{n}', recursive=True)
        if hits:
            return ImageFont.truetype(hits[0], size)
    return ImageFont.load_default()


def _centre_text(draw, box, text, font, fill):
    x0, y0, x1, y1 = box
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    draw.text((x0 + (x1 - x0 - (r - l)) / 2 - l,
               y0 + (y1 - y0 - (b - t)) / 2 - t), text, font=font, fill=fill)


def crowd_atlas(path, size=1024, cols=4, rows=4):
    """4x4 spectators on transparent background.

    Each cell is one seated figure: head, hair, shoulders, torso, and for some
    of them raised arms. At stadium distance this is all that survives, but the
    SILHOUETTE variation -- some arms up, some not, different heights -- is
    what stops a stand reading as a repeating pattern.
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cw, ch = size // cols, size // rows
    rng = random.Random(7)

    for i in range(cols * rows):
        cx0, cy0 = (i % cols) * cw, (i // cols) * ch
        shirt = SHIRTS[i % len(SHIRTS)]
        skin = SKINS[rng.randrange(len(SKINS))]
        hair = HAIR[rng.randrange(len(HAIR))]
        arms_up = rng.random() < 0.35

        mx = cx0 + cw // 2
        head_r = int(cw * 0.115)
        head_y = cy0 + int(ch * (0.26 if not arms_up else 0.30))

        # torso: a rounded trapezoid, widest at the shoulders
        tw = int(cw * 0.42)
        ty0 = head_y + head_r
        ty1 = cy0 + int(ch * 0.94)
        d.rounded_rectangle([mx - tw // 2, ty0, mx + tw // 2, ty1],
                            radius=int(cw * 0.10), fill=shirt + (255,))

        if arms_up:
            aw = int(cw * 0.085)
            for sgn in (-1, 1):
                ax = mx + sgn * int(tw * 0.52)
                d.rounded_rectangle([ax - aw // 2, cy0 + int(ch * 0.14),
                                     ax + aw // 2, ty0 + int(ch * 0.16)],
                                    radius=aw // 2, fill=shirt + (255,))
                d.ellipse([ax - aw // 2, cy0 + int(ch * 0.10),
                           ax + aw // 2, cy0 + int(ch * 0.10) + aw],
                          fill=skin + (255,))

        # head + hair cap
        d.ellipse([mx - head_r, head_y - head_r, mx + head_r, head_y + head_r],
                  fill=skin + (255,))
        d.pieslice([mx - head_r, head_y - head_r, mx + head_r, head_y + head_r],
                   start=180, end=360, fill=hair + (255,))

    # a touch of blur so the cards do not alias into hard pixels at distance
    img = img.filter(ImageFilter.GaussianBlur(radius=size / 900.0))
    img.save(path)
    return path


def hoarding(path, brand, tagline, bg, fg, w=1024, h=160):
    """One advertising board. Kept wide and low like the real thing."""
    img = Image.new('RGBA', (w, h), bg + (255,))
    d = ImageDraw.Draw(img)
    # a lighter band across the top, as printed boards usually have
    d.rectangle([0, 0, w, int(h * 0.10)], fill=tuple(
        min(255, int(c * 1.25 + 30)) for c in bg) + (255,))
    f1 = _font(int(h * 0.46))
    f2 = _font(int(h * 0.20))
    _centre_text(d, (0, int(h * 0.08), w, int(h * 0.70)), brand, f1, fg + (255,))
    _centre_text(d, (0, int(h * 0.66), w, int(h * 0.98)), tagline, f2, fg + (215,))
    img.save(path)
    return path


def stand_signage(path, text='NORTHFIELD OVAL', w=2048, h=256,
                  bg=(14, 78, 46), fg=(242, 244, 238)):
    """The big board along the top of the stand, like the green sign in the
    reference."""
    img = Image.new('RGBA', (w, h), bg + (255,))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, int(h * 0.06)], fill=(226, 196, 74, 255))
    d.rectangle([0, int(h * 0.94), w, h], fill=(226, 196, 74, 255))
    _centre_text(d, (0, 0, w, h), text, _font(int(h * 0.52)), fg + (255,))
    img.save(path)
    return path


def seat_block(path, size=512, seat=(28, 78, 150), gap=(20, 22, 26)):
    """A block of seats as a tiling texture, for the upper rows where
    individual seat meshes are not worth the instances."""
    img = Image.new('RGBA', (size, size), gap + (255,))
    d = ImageDraw.Draw(img)
    rng = random.Random(3)
    n = 8
    cell = size // n
    for r in range(n):
        for c in range(n):
            v = 1.0 + (rng.random() - 0.5) * 0.22
            col = tuple(max(0, min(255, int(x * v))) for x in seat)
            pad = int(cell * 0.12)
            d.rounded_rectangle(
                [c * cell + pad, r * cell + pad,
                 (c + 1) * cell - pad, (r + 1) * cell - pad],
                radius=int(cell * 0.18), fill=col + (255,))
    img.save(path)
    return path


def concrete(path_albedo, path_rough, size=1024, seed=11):
    """Board-formed stadium concrete, tileable.

    Four things separate this from flat grey, in rough order of how much they
    matter at stadium distance:
      1. large blotchy tonal drift -- pour-to-pour colour variation
      2. vertical run-off staining under every lip
      3. horizontal form-board lines from the shuttering
      4. fine aggregate grain
    Only (4) is invisible past ~15 m, but it stops close-ups looking like
    plastic, and it is nearly free.
    """
    rng = np.random.default_rng(seed)

    blotch = N.fbm(size, 4, 5, rng)
    medium = N.fbm(size, 14, 4, rng)
    grain = N.fbm(size, 200, 2, rng)

    value = (0.700
             + (blotch - 0.5) * 0.17
             + (medium - 0.5) * 0.085
             + (grain - 0.5) * 0.05)

    # form-board lines: shuttering leaves a seam every ~1.2 m
    lines = np.zeros((size, size), dtype=np.float32)
    spacing = size // 6
    for k in range(6):
        y = k * spacing
        lines[:, max(0, y - 1):y + 2] += 0.10
        lines[:, y + 2:y + 4] -= 0.035        # pale bleed under each seam
    value -= lines

    # run-off staining
    value -= N.streaks(size, rng, count=110, strength=0.30) * 0.30

    value = np.clip(value, 0.06, 1.0)

    # concrete is not neutral: warm in the pale patches, cool in the damp ones
    warm = (blotch - 0.5) * 0.045
    # slight warm bias overall: raw cement photographs blue, but stadium
    # concrete in sunlight does not
    rgb = np.stack([value * 1.025 + warm * 1.2,
                    value * 1.005 + warm * 0.25,
                    value * 0.965 - warm * 0.9], axis=-1)
    Image.fromarray(N.to_u8(np.clip(rgb, 0, 1)).transpose(1, 0, 2),
                    mode='RGB').save(path_albedo)

    # Roughness runs INVERSE to the staining: weathered, dirty concrete is
    # rougher than the clean pours, and damp streaks are glossier.
    rough = np.clip(0.88 - (blotch - 0.5) * 0.18
                    - N.streaks(size, np.random.default_rng(seed + 1),
                                count=110, strength=0.30) * 0.22, 0.30, 0.98)
    Image.fromarray(N.to_u8(rough).T, mode='L').save(path_rough)
    return path_albedo


def crowd_atlas_v2(path, cell=256, cols=8, rows=4, seed=17):
    """32 spectators, shaded.

    The first atlas was flat vector shapes, which read as confetti once
    thousands were instanced. Three changes fix that: a vertical light-to-dark
    gradient down each torso so the figures have volume, edge darkening so they
    separate from their neighbours, and real silhouette variety -- caps, raised
    arms, folded arms, leaning, a few holding flags. Silhouette is what survives
    at 80 m; the colours only stop it looking like a repeating pattern.
    """
    W, H = cell * cols, cell * rows
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rng = random.Random(seed)

    for idx in range(cols * rows):
        cx0, cy0 = (idx % cols) * cell, (idx // cols) * cell
        tile = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
        d = ImageDraw.Draw(tile)

        shirt = SHIRTS[idx % len(SHIRTS)]
        skin = SKINS[rng.randrange(len(SKINS))]
        hair = HAIR[rng.randrange(len(HAIR))]
        pose = rng.random()
        lean = rng.uniform(-0.05, 0.05) * cell
        height = rng.uniform(0.88, 1.06)

        mx = cell // 2 + int(lean)
        head_r = int(cell * 0.108 * height)
        top_y = int(cell * (0.30 if pose < 0.30 else 0.24))
        head_y = top_y + head_r
        tw = int(cell * rng.uniform(0.38, 0.47) * height)
        ty0 = head_y + int(head_r * 0.85)
        ty1 = int(cell * 0.95)

        if pose < 0.30:                      # arms raised
            aw = int(cell * 0.085)
            for sgn in (-1, 1):
                ax = mx + sgn * int(tw * 0.55)
                d.rounded_rectangle([ax - aw // 2, int(cell * 0.10),
                                     ax + aw // 2, ty0 + int(cell * 0.18)],
                                    radius=aw // 2, fill=shirt + (255,))
                d.ellipse([ax - aw // 2, int(cell * 0.06),
                           ax + aw // 2, int(cell * 0.06) + aw],
                          fill=skin + (255,))
        elif pose < 0.45:                    # holding a small flag
            fx = mx + int(tw * 0.62)
            d.line([(fx, int(cell * 0.08)), (fx, ty0 + int(cell * 0.20))],
                   fill=(70, 60, 55, 255), width=max(2, cell // 90))
            fc = SHIRTS[(idx * 5 + 3) % len(SHIRTS)]
            d.polygon([(fx, int(cell * 0.09)), (fx + int(cell * 0.20), int(cell * 0.15)),
                       (fx, int(cell * 0.22))], fill=fc + (255,))

        d.rounded_rectangle([mx - tw // 2, ty0, mx + tw // 2, ty1],
                            radius=int(cell * 0.11), fill=shirt + (255,))
        d.ellipse([mx - head_r, head_y - head_r, mx + head_r, head_y + head_r],
                  fill=skin + (255,))
        if rng.random() < 0.34:              # cap
            cc = SHIRTS[(idx * 3 + 7) % len(SHIRTS)]
            d.pieslice([mx - head_r, head_y - head_r,
                        mx + head_r, head_y + head_r],
                       start=180, end=360, fill=cc + (255,))
            d.rectangle([mx - head_r, head_y - int(head_r * 0.12),
                         mx + int(head_r * 1.5), head_y + int(head_r * 0.10)],
                        fill=cc + (255,))
        else:
            d.pieslice([mx - head_r, head_y - head_r,
                        mx + head_r, head_y + head_r],
                       start=180, end=360, fill=hair + (255,))

        # vertical shading gradient: light at the shoulders, dark at the lap
        arr = np.array(tile).astype(np.float32)
        ramp = np.linspace(1.16, 0.60, cell, dtype=np.float32)[:, None]
        arr[..., :3] *= ramp
        # edge darkening so neighbours separate in a packed stand
        alpha = arr[..., 3] / 255.0
        from PIL import ImageFilter as _IF
        blurred = np.array(Image.fromarray(
            (alpha * 255).astype(np.uint8)).filter(
                _IF.GaussianBlur(cell / 42.0))).astype(np.float32) / 255.0
        arr[..., :3] *= (0.55 + 0.45 * blurred)[..., None]
        tile = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')

        img.paste(tile, (cx0, cy0), tile)

    img = img.filter(ImageFilter.GaussianBlur(radius=cell / 700.0))
    img.save(path)
    return path


def seat_texture(path, size=256, base=(28, 78, 150), seed=23):
    """A single moulded seat: vertical rib shadows, a top highlight and a
    little grime in the seat pan."""
    rng = np.random.default_rng(seed)
    grain = N.fbm(size, 40, 3, rng)
    ribs = 0.5 + 0.5 * np.cos(np.linspace(0, math.pi * 14, size))[:, None]
    shade = (0.86 + 0.16 * ribs + (grain[..., None][:, :, 0] - 0.5) * 0.10)
    vert = np.linspace(1.12, 0.78, size, dtype=np.float32)[None, :]
    shade = shade * vert
    rgb = np.stack([np.clip(shade * base[0] / 255.0, 0, 1),
                    np.clip(shade * base[1] / 255.0, 0, 1),
                    np.clip(shade * base[2] / 255.0, 0, 1)], axis=-1)
    Image.fromarray(N.to_u8(rgb).transpose(1, 0, 2), 'RGB').save(path)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    made = [crowd_atlas_v2(os.path.join(OUT, 'crowd_atlas.png'))]
    made.append(concrete(os.path.join(OUT, 'concrete_albedo.png'),
                         os.path.join(OUT, 'concrete_rough.png')))
    made.append(os.path.join(OUT, 'concrete_rough.png'))
    made.append(seat_texture(os.path.join(OUT, 'seat.png')))
    for i, (b, t, bg, fg) in enumerate(BRANDS):
        made.append(hoarding(os.path.join(OUT, f'hoarding_{i:02d}.png'),
                             b, t, bg, fg))
    made.append(stand_signage(os.path.join(OUT, 'stand_signage.png')))
    made.append(seat_block(os.path.join(OUT, 'seat_block.png')))
    for p in made:
        print(f'  {os.path.basename(p):24s} {os.path.getsize(p)/1024:7.1f} KB')


if __name__ == '__main__':
    main()
