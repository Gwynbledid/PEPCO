"""Tileable value-noise helpers for the texture generator.

Everything here wraps, because a stadium tiles one concrete map across
thousands of square metres and a visible seam is the first thing the eye
finds. All lattice lookups use modulo indexing, so every map produced is
seamless in both axes by construction rather than by fixing it up afterwards.
"""

import numpy as np


def _smoothstep(t):
    return t * t * (3.0 - 2.0 * t)


def value_noise(size, cells, rng):
    """One octave of tileable value noise at `size` px from a `cells` lattice."""
    lattice = rng.random((cells, cells)).astype(np.float32)

    coord = np.linspace(0.0, cells, size, endpoint=False, dtype=np.float32)
    i0 = np.floor(coord).astype(np.int32) % cells
    i1 = (i0 + 1) % cells
    frac = _smoothstep(coord - np.floor(coord)).astype(np.float32)

    # bilinear, separably, with wrapped indices
    a = lattice[np.ix_(i0, i0)]
    b = lattice[np.ix_(i1, i0)]
    c = lattice[np.ix_(i0, i1)]
    d = lattice[np.ix_(i1, i1)]

    fx = frac[:, None]
    fy = frac[None, :]
    return (a * (1 - fx) * (1 - fy) + b * fx * (1 - fy)
            + c * (1 - fx) * fy + d * fx * fy)


def fbm(size, cells, octaves, rng, gain=0.5, lacunarity=2):
    """Fractal sum of tileable value noise, normalised to 0..1."""
    total = np.zeros((size, size), dtype=np.float32)
    amp, norm, c = 1.0, 0.0, cells
    for _ in range(octaves):
        total += value_noise(size, max(2, int(c)), rng) * amp
        norm += amp
        amp *= gain
        c *= lacunarity
    out = total / max(norm, 1e-6)
    lo, hi = float(out.min()), float(out.max())
    return (out - lo) / max(hi - lo, 1e-6)


def streaks(size, rng, count=90, strength=0.35, max_len=0.55):
    """Vertical dirt runs, as weather leaves on concrete.

    Each streak fades downward from its start row, which is what a real run-off
    stain does -- strongest under the lip it drips from, dissolving as it goes.
    """
    acc = np.zeros((size, size), dtype=np.float32)
    ys = np.arange(size, dtype=np.float32)
    for _ in range(count):
        x = rng.integers(0, size)
        w = int(rng.integers(2, max(3, size // 120)))
        top = int(rng.integers(0, size))
        length = int(size * rng.uniform(0.10, max_len))
        prof = np.clip(1.0 - (ys - top) / max(length, 1), 0.0, 1.0)
        prof[ys < top] = 0.0
        prof *= rng.uniform(0.35, 1.0) * strength
        for dx in range(-w, w + 1):
            fall = 1.0 - abs(dx) / (w + 1.0)
            acc[(x + dx) % size, :] += prof * fall
    return np.clip(acc, 0.0, 1.0)


def to_u8(arr):
    return np.clip(arr * 255.0, 0, 255).astype(np.uint8)
