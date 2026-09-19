# Gully — 3D asset handoff

Everything an artist needs to build the look in the reference image without
talking to me. Numbers here are read out of `gully/index.html`, not estimated.

---

## 1. What the game is, in one paragraph

A motion-controlled cricket game. The player props a phone in landscape, stands
back holding a stick-like object in both hands, and swings at a ball on screen.
The camera watches their hands; the phone is never held. The whole game today is
one 200KB HTML file with three.js from a CDN — no framework, no bundler, no npm
dependencies. Revenue is sponsor branding on hoardings, bat and jersey, which is
why those three surfaces are data-driven from `sponsors.json`.

## 2. The constraint envelope — read this before modelling anything

The target device is a **mid-range Android in Chrome at 20–30fps**, and the game
already spends roughly a third of every frame on pose inference (MediaPipe
PoseLandmarker). Whatever you build shares what is left with the ball, the bat,
eleven figures and the ground.

Three quality tiers exist and the game drops between them on its own when the
phone gets hot:

| tier | pose model | input | stride | DPR | shadows | ball flight |
|---|---|---|---|---|---|---|
| smooth | lite | 192px | every 2nd frame | 1.00 | off | 1500ms |
| balanced | lite | 256px | every frame | 1.25 | off | 1200ms |
| quality | full | 320px | every frame | 1.60 | on | 980ms |

Assets must look acceptable on **smooth**, not just on quality.

## 3. The decision that gates everything

**Third-person (the reference image) or batter's-eye (today)?**

- *Batter's-eye* needs gloves, forearms and a bat. Perhaps two days of work.
  It is what exists now.
- *Third-person* needs a full rigged, animated batsman. It is roughly ten times
  the work and it changes how the game plays — see §9.

The rest of this document assumes third-person, because that is what the
reference shows. If the answer changes, §5 shrinks to almost nothing.

## 4. World conventions — get these wrong and nothing lines up

| | |
|---|---|
| Units | **metres**, 1 unit = 1m |
| Up axis | **+Y** |
| Pitch runs along | **−Z** (batter at z = 0, bowler releases at z = −18) |
| Off side for a right-hander | **+X** (the game mirrors for left-handers) |
| Model origin | **between the feet**, on the ground (y = 0) |
| Facing | down **−Z**, i.e. toward the bowler |
| Scale reference | a figure is **1.80m** tall |
| Format | **glTF 2.0 binary (.glb)**, Y-up, metres, +Z forward |

Existing landmarks you must not contradict:

| thing | value |
|---|---|
| bat length | 0.90m (fixed, never scaled to the player's real stick) |
| bat blade half-width | 0.055m |
| ball radius | 0.085m — deliberately oversized, a real 36mm ball is invisible on a phone |
| boundary radius | 62m |
| bowler's release | z = −18 |
| bowler's mark | z = −25.5 |
| camera | eye (x, 1.72, 1.90), aimed at (x, 0.75, −14), **74° vertical FOV** |

The camera follows the player sideways, so `x` moves; everything else is fixed.

## 5. Asset list

### A. The batsman — the big one

| | |
|---|---|
| Triangles | **≤ 15,000** including pads, gloves, helmet |
| Textures | **one 1024×1024** albedo for the entire figure. No normal map unless the budget allows it after everything else |
| Rig | humanoid, ≤ 60 bones. Mixamo's standard rig is fine |
| Origin | between the feet, y = 0, facing −Z |
| Jersey | the back and one sleeve must be a **flat, unshaded, axis-aligned quad region** in the UV layout so a sponsor name can be drawn into it at runtime — see §8 |

Kit: whites, pads, gloves, helmet with grille, spikes. No sculpted wrinkles;
they will not survive a 1024 texture at this distance.

### B. Bowler, keeper and nine fielders

Today these are **sprites**: a 672×336 atlas of 6×3 cells, 17 named poses, one
figure per cell at 1.80m filling 86% of a cell, inlined as base64. Named poses:

```
field_knees  field_alert  field_walk   field_runR   field_runL   field_slide
field_dive   field_throw  bowl_run     bowl_load    bowl_arm     bowl_release
bowl_follow  keeper_crouch keeper_take keeper_diveL keeper_diveR
```

Two options, and the cheap one is genuinely defensible:

- **Cheap and recommended first:** keep them as sprites, just redraw the atlas at
  a higher quality and in one consistent art style. They are 20–50m away and a
  few dozen pixels tall. Cost: one image.
- **Expensive:** one shared rigged figure, instanced 11 times, ≤ 4,000 triangles
  each, sharing a single 512×512 texture, with 5 short clips (idle, run, dive,
  throw, celebrate). Only worth it if you also do the stadium.

Field positions, so you know what is seen and from how far:

| position | degrees from straight | distance |
|---|---|---|
| keeper | 180 | 2.6m |
| third man | 128 | 33m |
| point | 74 | 20m |
| cover | 44 | 25m |
| mid-off | 19 | 28m |
| long-off | 27 | 49m |
| mid-on | −21 | 28m |
| midwicket | −50 | 25m |
| square leg | −80 | 20m |
| fine leg | −142 | 32m |

Positive degrees are the off side for a right-hander. The game mirrors the whole
table for a left-hander, so the field must be symmetric-capable.

### C. Stadium, crowd, floodlights

**Never model individual spectators.** A crowd is a texture.

| element | how |
|---|---|
| stands | one ring mesh at r ≈ 75–90m, **≤ 5,000 triangles**, lighting **baked into the texture** |
| crowd | a repeating strip texture on the stand face, 2048×256, 3–4 colour variants tiled around |
| floodlights | 4–6 towers, ≤ 300 triangles each, plus a glow sprite |
| roof/signage | part of the stand mesh and its baked texture |

There is already a sponsor hoarding cylinder at the boundary (r = 62m, 2.2m
tall) generated at runtime from `sponsors.json`. Do not model over it — build the
stand **behind** it, from r ≈ 70m outward.

### D. Ground

| element | how |
|---|---|
| outfield | one tiling grass texture, 1024², with mowing stripes baked in. **No grass geometry** |
| pitch strip | separate 512×1024 texture, worn in the middle, crease lines included |
| creases | part of the pitch texture, not geometry |

### E. Bat and kit

The bat is currently eight primitives generated in code, and the blade face
takes a runtime-drawn sponsor texture. If you model one: ≤ 400 triangles, blade
face as a **flat rectangular UV island** so the sponsor canvas still maps onto it.

## 6. Animation list

This is the part with no shortcut and most of the weeks.

| clip | length | notes |
|---|---|---|
| `stance` | loop, 2s | idle, small weight shift, bat tapping |
| `backlift` | 0.4s | additive onto stance if you can |
| `drive_straight` | 1.2s | |
| `drive_cover` | 1.2s | off side, front foot |
| `drive_on` | 1.2s | leg side, front foot |
| `pull` | 1.3s | cross-batted, back foot, finishes high behind the shoulder |
| `cut` | 1.1s | cross-batted, off side, back foot |
| `defend` | 0.8s | |
| `leave` | 0.8s | bat raised, ball let through |
| `celebrate` | 2s | optional |

Every clip must **start and end in the stance pose** so they can be cut together
without blending code.

Name them exactly as above in the glTF. Contact — the frame where bat meets ball
— must sit at **30% through** each stroke clip, or tell me the real fraction per
clip and I will read it from a table.

## 7. Tools — all free

| job | tool | notes |
|---|---|---|
| everything 3D | **Blender** | the whole pipeline can be Blender alone |
| base human | **Ready Player Me** or **MakeHuman** | RPM returns a rigged glTF humanoid; biggest single shortcut |
| auto-rigging | **Mixamo** | free with an Adobe account; upload mesh, download rigged FBX |
| motion capture | **FreeMoCap**, **Rokoko Video** (free tier), **Plask** (free tier) | film yourself playing each shot, get rough FBX, clean up in Blender |
| textures | **Krita**, **GIMP** | |
| free CC0 source | **Poly Haven**, **ambientCG**, **Kenney.nl** | HDRIs, grass, dirt — no attribution required |
| compression | **gltfpack** (meshoptimizer) or **glTF-Transform** | not optional, see §8 |

## 8. Delivery and integration contract

**File budget: the whole set ≤ 4 MB after gltfpack.** That is the number that
decides whether this ships on a mid-range phone.

Deliver:

```
assets/
  batsman.glb        rigged + all clips from §6
  fielders.glb       or fielders.png if you keep sprites
  stadium.glb        stands, towers, baked lighting
  ground_pitch.png   512x1024
  ground_grass.png   1024x1024, tiling
```

Three things I need from you in writing with the files:

1. **Bone name** of the right and left hand, so the bat can be parented to the grip.
2. **Contact frame** (or time in seconds) for each stroke clip.
3. **UV rectangle** (u0,v0,u1,v1) of the jersey sponsor panel and the bat blade
   face, so `sponsors.json` can still draw into them.

### What changes in the code, and what it costs

Loading a `.glb` needs `GLTFLoader` — a new import from the three.js CDN — and
meshopt-compressed files also need `meshopt_decoder`. **That is a new dependency
and I will not add it without you saying so.**

It also **ends "one file"**. A 4 MB asset should not be base64-inlined into the
HTML. The game becomes a folder. That is a real decision: the standing
constraint has been one file with no npm dependencies since the first commit, and
the eventual offline APK assumed everything was vendorable into it. A folder is
still packageable, but say it out loud before the work starts.

## 9. The design consequence nobody mentions until it is too late

**A rigged batsman forces canned strokes.** You cannot drive a rigged character
from two wrist landmarks — it must play clips, so the game has to *classify* your
swing and play the matching clip.

I built exactly that and you played it. It was worse: the bat stopped mimicking
your hands, and the whole feel of direct control went with it.

So if you go third-person, the honest design is a **hybrid**:

- the body plays a canned clip, chosen from your swing, purely for looks
- **contact and the ball's direction still come from your real swing**, exactly
  as they do today

The character animation must be allowed to be slightly wrong — a cover drive clip
playing on a shot that actually went to midwicket — because the alternative is
the version you rejected. Decide that you can live with it before spending the
weeks.

## 10. Order of work — biggest visual gain per hour

If you cannot do all of it, do it in this order. Each step is worth doing alone.

1. **Ground textures.** One grass texture with mowing stripes and a worn pitch
   strip. Hours of work, and it changes every frame of the game.
2. **Redraw the sprite atlas** in one consistent style. The three sheets today
   are in two different styles.
3. **Stadium ring with a baked crowd texture.** Turns a green field into a match.
4. **Floodlights and sky.** Cheap, and it is most of the mood in your reference.
5. **The rigged batsman.** Most expensive, and the one with the design
   consequence in §9.

## 11. Legal — not optional

The reference image has "VIRAT 18" on the jersey and MRF, Kajaria and Hero
hoardings. **Do not ship any of that.** A real cricketer's likeness or name, and
real brand logos, in a game that sells sponsor slots is a legal problem rather
than a cosmetic one. Generic kit, invented team names, and sponsor text driven
from `sponsors.json`.

Check the licence on anything downloaded. Poly Haven and ambientCG are CC0 and
safe. Sketchfab is mixed — filter for CC0 and read each one.

## 12. Acceptance checklist

- [ ] Loads as `.glb`, Y-up, metres, origin between the feet at y = 0
- [ ] Figure measures 1.80m in Blender
- [ ] Whole set ≤ 4 MB after gltfpack
- [ ] Batsman ≤ 15k triangles, one 1024² texture
- [ ] Stadium ≤ 5k triangles, lighting baked, built beyond r = 70m
- [ ] No geometry inside r = 62m except players
- [ ] Every stroke clip starts and ends in the stance pose
- [ ] Clips named exactly as §6
- [ ] Hand bone names, contact frames and sponsor UV rects supplied
- [ ] Holds 20fps on a mid-range Android at the **smooth** tier
- [ ] No real likenesses, no real brands, licences checked
