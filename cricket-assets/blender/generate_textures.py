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

from PIL import Image, ImageDraw, ImageFilter, ImageFont

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


def main():
    os.makedirs(OUT, exist_ok=True)
    made = [crowd_atlas(os.path.join(OUT, 'crowd_atlas.png'))]
    for i, (b, t, bg, fg) in enumerate(BRANDS):
        made.append(hoarding(os.path.join(OUT, f'hoarding_{i:02d}.png'),
                             b, t, bg, fg))
    made.append(stand_signage(os.path.join(OUT, 'stand_signage.png')))
    made.append(seat_block(os.path.join(OUT, 'seat_block.png')))
    for p in made:
        print(f'  {os.path.basename(p):24s} {os.path.getsize(p)/1024:7.1f} KB')


if __name__ == '__main__':
    main()
