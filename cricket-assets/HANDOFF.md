# Cricket assets — integration handoff

Everything in this folder is engine-neutral geometry, textures and animation,
plus a working Godot 4.3 reference implementation you can read as documentation
even if you are not using Godot.

You need two folders to integrate: **`exports/`** (22 `.glb` files) and
**`textures/`** (12 `.png` files). Everything else is source and reference.

| Folder | What it is | Do you need it? |
|---|---|---|
| `exports/` | the assets, glTF 2.0 binary | **yes** |
| `textures/` | the atlases the glTF materials reference by name | **yes** |
| `godot/` | reference implementation: shaders, materials, placement, controller | read it; port what you want |
| `blender/` | the generator scripts — every asset is procedural, nothing was modelled by hand | only if you want to change geometry |
| `renders/` | preview frames from Blender | reference only |
| `README.md` | how the generator works, and every trap hit while building it | worth skimming |

---

## 1. Conventions

**Units are metres.** Real cricket dimensions: pitch 20.12 m between the
stumps, 3.05 m wide; stumps 0.711 m tall, 0.2286 m apart; boundary rope at
68 m; outfield mesh out to 78 m.

**Axes are glTF standard: Y up, right-handed.** The source is Blender (Z up);
the exporter has already applied the conversion `(x, y, z)_blender →
(x, z, −y)_gltf`. Two consequences you will need:

* A Blender rotation of θ about +Z becomes a rotation of θ about +Y. Same sign,
  no conversion.
* A Blender position at ring angle `a` — `(R cos a, R sin a, h)` — becomes
  `(R cos a, h, −R sin a)`. **Note the minus.** Getting this wrong mirrors the
  ring against the rotations, which cancels out at the ends of the pitch and
  nowhere else: the seats behind the bowler look fine and the ones at square
  leg face the car park. `stadium_builder.gd::ring_transform()` is the one
  place that knows this, and `verify_match.gd` asserts it.

**Layout.** The pitch runs along **X**. Striker's stumps at `x = −10.06`,
bowler's at `x = +10.06`, both at `z = 0`. The batsman stands at about
`x = −11.16, z = +0.42`.

**The outfield is crowned**, not flat — 0.45 m higher at the middle than at the
rope, which is what real grounds do and what makes the far boundary sit below
the eyeline. Anything you place on the grass has to sample it:

```
height(x, z) = 0.45 * (1 − min(sqrt(x² + z²) / 78.0, 1.0)²)
```

This formula appears in three places and they must not drift apart:
`blender/build_ground.py::ground_height()`,
`godot/scripts/stadium_builder.gd::ground_height()`,
`godot/scripts/batsman_pov.gd::ground_height()`.

**All module origins are at (0, 0, 0)** and the geometry carries its own
world offset — a stand wedge's vertices already sit at x ∈ [79.3, 103.0].
Instance them at the origin with a yaw and nothing else. (Do not "helpfully"
re-centre them; see §7.)

---

## 2. What's in `exports/`

| File | Tris | KB | Materials |
|---|---:|---:|---|
| `ground.glb` | 13,712 | 357 | `M_GrassMown`, `M_Pitch`, `M_Crease`, `M_Willow` |
| `stand_module.glb` | 684 | 957 | `M_ConcreteTex` |
| `roof_module.glb` | 52 | 4 | `M_Roof` |
| `signage_module.glb` | 12 | 21 | `M_Signage` |
| `box_module.glb` | 564 | 948 | `M_PrecastTex` |
| `box_glass.glb` | 12 | 2 | `M_BoxGlass` |
| `box_details.glb` | 708 | 36 | `M_Mullion` |
| `roofsign_module.glb` | 52 | 23 | `M_Signage` |
| `seat.glb` | 216 | 50 | `M_SeatTex` |
| `crowdcard.glb` | 2 | 254 | `M_CrowdTex` |
| `hoarding_00…05.glb` | 108 ea | ~14 ea | `M_Hoarding00`…`M_Hoarding05` |
| `sightscreen.glb` | 324 | 14 | `M_Sightscreen`, `M_SteelDark` |
| `floodlight_tower.glb` | 144 | 7 | `M_SteelDark` |
| `floodlight_lamps.glb` | 1,080 | 38 | `M_Halogen` |
| `tree.glb` | 328 | 14 | `M_Bark`, `M_Foliage` |
| `batsman.glb` | 25,958 | 1,202 | rigged + 4 clips, see §5 |
| `viewmodel.glb` | 11,074 | 319 | first-person bat/gloves/forearms, see §6 |

Total 55,570 triangles for the whole ground. The bowl is cheap because
everything repeats — a full stadium is 57,831 instances of nine meshes.

`ground.glb` splits into six named nodes so you can treat them separately:
`Outfield`, `Pitch`, `Creases`, `Stumps_Bowler`, `Stumps_Striker`,
`BoundaryRope`. The stumps are separate nodes with their own transforms, so
they are straightforward to replace with physics-driven ones if you want
bails that fly.

---

## 3. Building the bowl

The stadium is not one mesh — it is nine meshes instanced around a ring. In
Godot that is 16 `MultiMeshInstance3D`s and roughly that many draw calls;
whatever your engine's equivalent is (instanced static mesh, GPU instancing),
use it. As individual nodes this scene will not run.

Constants (these must match `blender/build_stadium.py` if you ever re-render
previews):

```
BOWL_SEGMENTS 24          lower tier  R 80→90, 14 rows, rise 0.42, deck Y 2.4
                          signage band height 2.20
                          boxes height 3.40
                          upper tier  R 92→103, 13 rows, rise 0.50
                          upper deck Y = 2.4 + 14*0.42 + 2.20 + 3.40 + 0.70
boundary rope  R 68.0     hoardings   R 70.6
floodlights    R 110.0    trees       R 112–121
```

**Wedges** (stand, roof, signage, box, glass, box details): 24 copies, yaw
`a = i·2π/24`, position `(0,0,0)`. Rooftop boards skip every third segment
(`i % 3 == 1`) — a continuous ring reads as a wall rather than a skyline.

**Seats and crowd**: for each row `(radius, height)`, place `⌊2πR/0.52⌋` per
row, `a = i·2π/count`, transform from `ring_transform()` above — i.e. position
`(R cos a, h, −R sin a)`, yaw `a + π/2`. Crowd sits `0.28` higher and `0.16`
further in, with only a uniform scale in the basis (billboarding is the
shader's job). Occupancy 94%, chosen from a **fixed seed** — a crowd that
reshuffles on reload reads as very wrong.

**Hoardings**: `⌊2π·70.6/8.2⌋ = 54` panels, cycling the six brand variants,
sitting on `ground_height()`.

**Sightscreens**: two, at `x = ±75.0, z = 0`, yaw 90°.

**Floodlights**: six pylons at `a = 15° + k·60°`, R 110. Tower and lamp array
are separate files that share the same transform. The lamp array's emissive
faces point along the head's local axis — **aim them at the middle of the
ground**; get the yaw wrong and every pylon renders as a black silhouette
lighting the car park. (It did, for a while.)

---

## 4. Materials

glTF only carries base colour / metallic / roughness, so every mesh arrives
with a plain PBR material and none of the intended look. **The material names
are the contract.** Match on the name and swap in your own shader.

| Blender name | Base colour | Metal | Rough | Texture | Wants |
|---|---|---:|---:|---|---|
| `M_GrassMown` | #FFFFFF | 0 | 1.0 | — | mown stripes in **world space**, 4 m period |
| `M_Pitch` | #C5A577 | 0 | 0.90 | — | plain |
| `M_Crease` | #E9E8E4 | 0 | 0.75 | — | plain |
| `M_ConcreteTex` | white | 0 | 1.0 | `concrete_albedo/rough` | **triplanar**, scale 0.95 |
| `M_PrecastTex` | white | 0 | 1.0 | `concrete_albedo/rough` | triplanar, scale 1.35, tint ×1.18 |
| `M_SeatTex` | white | 0 | 0.40 | `seat.png` | plain |
| `M_CrowdTex` | white | 0 | 0.90 | `crowd_atlas.png` | **Y-billboard + atlas cell per instance**, alpha cut 0.5 |
| `M_Signage` | white | 0 | 0.55 | `stand_signage.png` | plain |
| `M_Hoarding00`…`05` | white | 0 | 0.45 | `hoarding_0N.png` | plain |
| `M_Halogen` | #FFF9EC | 0 | 0.18 | — | emissive ×220 — **bloom, not a modelled flare** |
| `M_BoxGlass` | #FFFFFF | 0.55 | 0.06 | — | glass |
| `M_Mullion` | #222325 | 0.70 | 0.32 | — | dark metal |
| `M_Roof` | #193122 | 0 | 0.55 | — | plain |
| `M_SteelDark` | #232527 | 1.0 | 0.30 | — | dark metal |
| `M_Sightscreen` | #144D31 | 0 | 0.70 | — | plain |
| `M_Bark` / `M_Foliage` | #3D2F25 / #295220 | 0 | .85/.78 | — | plain |
| `M_KitWhite` | #DFDCD4 | 0 | 0.80 | — | cloth **sheen** (rim), strength 0.32 |
| `M_PadWhite` | #E4E1DA | 0 | 0.45 | — | cloth sheen 0.18 |
| `M_Strap` | #312C29 | 0 | 0.45 | — | plain |
| `M_Skin` | #9C694D | 0 | 0.55 | — | plain |
| `M_Helmet` | #151C2F | 0 | 0.25 | — | plain |
| `M_Grille` | #8D9093 | 1.0 | 0.30 | — | dark metal |
| `M_Willow` | #DAC08B | 0 | 0.35 | — | plain |
| `M_Grip` | #131314 | 0 | 0.65 | — | plain |

Colours above are sRGB hex. The glTF factors are linear. **Any colour you
re-author on the engine side has to be converted**: a shader uniform, a
material parameter, a tint — those slots take linear, and typing the sRGB
number into them renders roughly 1.8× too bright and washed out. It caught the
Blender side once and then caught the Godot materials again later, which is why
the grass was radioactive until the last pass:

```
linear = c / 12.92                        if c <= 0.04045
linear = ((c + 0.055) / 1.055) ** 2.4     otherwise
```

Textures are the opposite case: albedo and atlas PNGs are sRGB files and must
be sampled as sRGB (`source_color` in Godot, sRGB in your importer). Roughness
maps are data and must not be.

Two details that matter more than they look:

* **Grass stripes must be world-space**, derived from world X/Z, not UV. UV
  stripes swim as the camera moves and bend around the circle.
* **Concrete must be triplanar.** The terracing is swept geometry with
  unusable UVs; a UV-mapped texture smears visibly. If you change the
  triplanar scale, the Blender side has a matching `Mapping` node scale
  (0.95) that has to change with it or previews and game diverge.

### The crowd card's UVs

`crowdcard.glb` ships **0..1 UVs across the whole quad**, not the UVs of one
atlas cell. The shader picks a cell per instance and does
`(UV + cell_offset) * cell_size` itself. Ship it a card already mapped to cell
0 and the shader scales an already-scaled coordinate into a transparent corner,
every spectator is alpha-discarded, and the stand renders as 28,000 empty blue
seats with no error anywhere. If you write your own crowd shader, either keep
the 0..1 convention or stop doing the offset.

### Textures

| File | Size | Notes |
|---|---|---|
| `concrete_albedo.png` | 1024² RGB | tileable fBm + vertical dirt streaks |
| `concrete_rough.png` | 1024² grey | pairs with the above |
| `crowd_atlas.png` | 2048×1024 RGBA | 8×4 = 32 spectator cells, transparent |
| `seat.png` | 256² RGB | single seat |
| `seat_block.png` | 512² RGBA | unused by the Godot path; block-of-seats decal |
| `stand_signage.png` | 2048×256 RGBA | ground name band |
| `hoarding_00…05.png` | 1024×160 RGBA | six advertising boards |

All noise is generated tileable (modulo-indexed lattice), so they wrap cleanly.

---

## 5. The batsman — `batsman.glb`

* **21 bones**, skin named `Batsman_Rig`, 20 skinned meshes, 25,958 tris.
* Root node is the armature; there is no extra wrapper node.

```
root
└ hips
  ├ spine → chest → neck → head
  ├ shoulder.L → upperarm.L → forearm.L → hand.L
  ├ shoulder.R → upperarm.R → forearm.R → hand.R → bat
  ├ thigh.L → shin.L → foot.L
  └ thigh.R → shin.R → foot.R
```

`bat` is a real bone parented to `hand.R`, so a swing is one bone's rotation
and the bat cannot drift out of the hands.

Binding is deliberately mixed: torso, arms, legs, sleeves and head use smooth
weights; helmet, grille, pads, straps, shoes, studs, gloves and bat are each
bound rigidly to a single bone at weight 1.0. A helmet should travel with the
head as a solid object, not deform when the neck turns.

### Clips

| Clip | Length | Loops | Notes |
|---|---:|---|---|
| `stance` | 0.042 s | no | single pose — use as a static base / blend target |
| `idle` | 2.5 s | yes | breathing, small bat taps |
| `shot_drive` | 1.667 s | no | front-foot drive |
| `run` | 0.75 s | yes | **carries root motion** |

### Root motion

`run` translates the **`root`** bone by 3.228 m over 0.75 s = **4.30 m/s**, with
the feet planted throughout. The speed is a property of the animation, not a
number in code: drive the character from the root delta and the feet cannot
skate. If you instead move the body at some speed of your own, contact slides
by exactly the difference.

Two traps, both of which bit here:

1. **Read the root track path from the animation, don't construct it.** In this
   export it is `Batsman_Rig/Skeleton3D:root`, but it is relative to the
   animation player's root node and a hand-built path silently resolves to
   nothing — root motion then reads zero with no error.
2. **Advance the animation on the same clock you read it on.** Reading root
   motion in fixed-step physics while the mixer advances on render frames made
   the body travel at exactly 0.40× the authored speed. In Godot that is
   `callback_mode_process = ANIMATION_CALLBACK_MODE_PROCESS_PHYSICS`.

Measured end to end in the reference implementation: 4.232 m/s against 4.30
authored, 1.7% under — that residue is `move_and_slide` against the crowned
ground, not drift.

### Foot IK

`godot/scripts/foot_ik.gd` is a two-bone analytic solver that raycasts under
each ankle and plants the foot on the crowned outfield. It is optional — the
clip works without it on flat ground — but on the crown the downhill foot
floats by a couple of centimetres without it. Port it or use your engine's
own foot IK; either way the ground needs collision, which a glTF does not
carry.

---

## 6. First-person — `viewmodel.glb`

A separate, higher-detail asset for the batsman POV: `Bat`, `Glove_Top`,
`Glove_Bottom`, both forearms and both sleeves. **No helmet grille** — the POV
is from behind the eyes, and a grille in front of the camera is the single
fastest way to make a batsman POV unplayable.

Camera setup that the renders were shot with:

```
eye height  1.65 m above the ground at (−11.16, 0.42)
fov         46° VERTICAL  (= ~69° horizontal at 16:9, a 26 mm full-frame look)
near/far    0.02 / 600
viewmodel   offset (0.16, −0.13, −0.76) in camera space
            tilt −72°, roll −38°, yaw +14°
```

`fov` in most engines is vertical. Setting 69 there because "26 mm is 69°
horizontal" gives a noticeably fish-eyed pitch.

Keep the viewmodel out of depth-of-field. A full-screen DoF post-process
cannot be excluded per-object by render layer; the reference scene simply
switches near blur off and starts far blur at 18 m. If you want near blur as
well, the viewmodel needs its own sub-viewport and camera, composited on top.

---

## 7. Known gaps — read this before you plan

* **There is no gameplay.** No ball physics, no bowling, no bat collision, no
  scoring, no input beyond mouse-look. This is art and animation only. You
  have the game; this is the set and the actor.
* **No bowler, no fielders, no umpire.** One batsman.
* **Kit, pads and gloves are untextured** — flat colour plus a cloth sheen.
  No numbers, no logos, no stitching, no seams. They will look plain next to
  the textured stadium.
* **Pad bolsters are crude.** They read at match distance and at POV distance;
  they would not survive a close-up cutscene.
* **No clip blending.** Four clips, no blend tree, no transitions. The
  reference controller hard-swaps the animation node. `stance` exists partly
  to be a blend target when you build a real state machine.
* **Foot IK has been verified numerically but never seen in a lit render** —
  it runs, the modifier is installed and the raycasts hit, but confirm it
  looks right before shipping it.
* **The lighting rig is approximate.** Against the Blender preview the grass
  matches closely and the pitch renders about 15% hot. The Godot sky is the
  built-in procedural one — **flat blue, no clouds**; the reference cloudscape
  exists only in the Blender rig (`build_lookdev.py`, a Voronoi/fBm blend with
  a deliberately narrow density ramp). Porting it means a sky shader or a
  captured HDRI.
* **Crowd is 32 atlas cells.** Enough for a stand, repetitive if you point a
  telephoto at one block.
* **Shadows on 57k instances** are the obvious perf cliff. The reference scene
  uses 4 shadow splits out to 220 m and static GI mode on the bowl.
* **`seat_block.png` is unused** by the Godot path. It is there if you want a
  cheap far-LOD block of seats instead of instanced geometry.

### Traps that cost real time here

Worth knowing because they will look like different bugs than they are:

* Almost every "lighting" problem turned out to be a **placement or facing**
  bug. Black floodlight pylons, dim stands, stubby hoardings, a buried
  sightscreen — all geometry in the wrong place, none of them the light rig.
  Check the transform before you touch the lighting.
* An asset rendered in isolation finds in one frame what an assembled scene
  hides for an hour.
* `recalc_face_normals` in Blender reverses winding and reorders loops, which
  scrambles any UV assigned by loop index. Signage came out mirrored twice,
  from two unrelated causes.

---

## 8. Reference implementation (Godot 4.3)

`renders/godot_pov.png` is the batsman POV rendered **in engine**, not in
Blender — the bowl, the crowd, the mown stripes, the viewmodel and the lighting
all coming out of the Godot scene. Compare it with `renders/pov.png`, the
Blender preview of the same view, to see how close the two halves sit.

If you are on Godot, `godot/` opens and runs:

```
scenes/match.tscn          the whole thing wired together
scripts/stadium_builder.gd instancing + ring placement  (§3)
scripts/apply_materials.gd name→shader swap, per SURFACE not per mesh (§4)
scripts/batsman_controller.gd root motion  (§5)
scripts/foot_ik.gd         SkeletonModifier3D two-bone IK
scripts/batsman_pov.gd     POV camera + viewmodel  (§6)
shaders/                   mown_grass, concrete (triplanar), crowd_card, stylized_fabric
verify_match.gd            headless assembly check
verify_motion.gd           headless root-motion speed check
shot_match.gd              renders one POV frame to renders/godot_pov.png
```

Run the checks with:

```
godot --headless --path godot --script verify_match.gd
godot --headless --path godot --script verify_motion.gd
```

Current output: 57,845 instances, 21 bones, 14 shader surfaces, ring facing
1.0000, root motion 4.232 m/s vs 4.30 authored. Both PASSED.

`shot_match.gd` needs a real GL context — headless renders nothing. Under
software rasterisation:

```
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe xvfb-run -a \
    godot --path godot --rendering-driver opengl3 --resolution 1280x720 \
    --script shot_match.gd
```

The compatibility backend drops SSAO, SDFGI and depth of field, so that frame
is a floor on how the scene looks, not a ceiling.

Two engine-agnostic lessons buried in those scripts: material swaps must be
**per surface** (one mesh's outfield, pitch, creases and stumps are four
surfaces needing four materials, and a mesh-level override flattens them), and
under `--headless` a `MultiMesh` reads back identity transforms, so verify the
placement *function*, not the assembled buffer.

---

## 9. Licensing / branding

Everything here is original, procedurally generated geometry and texture. No
scanned, purchased or third-party assets, no real player likeness.

**All branding is invented** — ZENTRA, KORVEX, MERIDIAN, PULSE, ALTIVO, NIMBUS
on the hoardings, and the ground is "NORTHFIELD OVAL". This is deliberate. The
reference images this was built from contained a real player's likeness and
number and real trademarks (a bat maker's logo and two sponsor boards); none of
that can ship, and none of it is in here. If you swap in real brands, that is a
licensing decision on your side, not an oversight on this one.
