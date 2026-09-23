# Asset prompts (ChatGPT / Qwen)

The game already runs with procedural art: stadium, crowd, grass, pitch,
sponsor boards, clouds, characters and bat are all generated in code. Each
image below **replaces** one of those procedural pieces, so the game gets
closer to the reference art. Add them in any order; nothing breaks if an
image is missing.

**How to use**

1. Start a new ChatGPT (image generation) or Qwen chat and **attach your
   reference image** so it copies the art style.
2. Paste the **Style block** first, then the prompt for the asset.
3. Resize or crop the result to the size listed and save it with the **exact
   filename** in `motion-cricket/public/assets/`.
4. Reload the game. The console prints `[assets] using custom art for: …`.

> **Don't use real names or logos.** The reference image shows a real
> player's name and real brands (the bat and board sponsors). Publishing
> those on the Play Store without a licence gets apps rejected or taken
> down. Every prompt below uses fictional brands. Keep it that way, or
> swap in brands you actually have rights to.

---

## Style block (paste before every prompt)

```
STYLE: stylized 3D animated feature-film look matching the attached reference image —
soft rounded shapes, rich saturated colours, bright blue sky, big fluffy cumulus clouds,
warm golden late-afternoon sunlight, soft shadows, gentle ambient occlusion, clean and
cheerful, high detail. Do NOT copy any text, player names or brand logos from the
reference image. No real-world brands or trademarks. No watermark.
```

---

## 1. Sky: `sky.jpg`, 2048×1024 (2:1 landscape)

```
A wide panoramic sky only — no ground, no stadium, no buildings, no sun disc.
Vivid saturated blue sky that is deep blue at the top and lighter, slightly hazy blue near
the bottom edge. Large puffy stylized white cumulus clouds with soft lavender-grey shaded
undersides spread across the lower two thirds; the top third mostly clear. Evenly
balanced composition with no single focal point, so the left and right edges can be
mirrored and repeated around a 360° dome.
```
*If you add this, it replaces the gradient sky and cloud sprites. Pick a
version whose clouds sit low in the frame.*

## 2. Crowd: `crowd.jpg`, 1024×512 (2:1), seamless tile

```
A flat, front-facing orthographic texture of stadium seating rows packed with cheerful
cartoon cricket fans. Exactly 10 horizontal rows of seats, small stylized people seen
from the front, most wearing bright royal-blue jerseys, with some orange, yellow and
white shirts, a few waving small tricolour flags and some with raised arms. Even
lighting, no perspective, no sky, no roof, no railings or pillars at the edges.
The texture must tile seamlessly left-to-right and top-to-bottom.
```

## 3. Outfield grass: `grass.jpg`, 1024×1024, seamless tile

```
Top-down view of lush, perfectly mowed cricket outfield grass. Bright saturated green,
fine stylized grass blades with subtle variation, even flat lighting, no mowing stripes,
no shadows, no objects. Seamless tileable texture.
```
*The game adds the mowing stripes itself.*

## 4. Pitch surface: `pitch.jpg`, 1024×1024, seamless tile

```
Top-down view of a dry, hard-packed cricket pitch surface: light tan / sandy clay with
fine hairline cracks, tiny darker speckles and a few very small dry grass tufts.
Stylized, even flat lighting, no crease lines, no shadows. Seamless tileable texture.
```
*The game paints the white crease lines on top.*

## 5. Boundary boards: `sponsor_1.png` … `sponsor_6.png`, 1024×160 (~6.4:1)

Image tools can't make very wide images, so generate at **3:2** and crop the
banner out. Use one prompt per board and change the name and colours:

| File | Name | Colours |
|---|---|---|
| `sponsor_1.png` | BOLT COLA | white text on red |
| `sponsor_2.png` | NOVA TILES | red text on white |
| `sponsor_3.png` | SKYRIDE | white text on royal blue |
| `sponsor_4.png` | ZENTRA PAINTS | navy text on sunflower yellow |
| `sponsor_5.png` | KRAFT BATS | white text on emerald green |
| `sponsor_6.png` | PEPCO | teal text on white |

```
A flat advertising hoarding for a cricket stadium boundary, very wide horizontal banner
(about 6:1) centred on a plain white canvas. Bold rounded logo lettering reading
"BOLT COLA" in white on a solid red background, playful 3D-cartoon lettering with a slight
bevel and soft highlight, a small simple icon beside the name. The banner is flat,
front-on, no perspective, no mockup, no frame, no people. Spell the text exactly.
```

## 6. Roof banner: `roof_banner.png`, 2048×192 (~10.7:1)

Generate at 3:2 and crop.
```
A long flat stadium roof fascia banner, very wide horizontal strip (about 10:1) centred on
a plain white canvas. Teal-green (#0D6B73) background with bold cream-white rounded
lettering reading "PREMIUM PAVILION", thin golden stripes along the top and bottom edges.
Flat, front-on, no perspective, no mockup. Spell the text exactly.
```

## 7. Bat sticker: `bat_sticker.png`, 256×640 (portrait), transparent PNG

```
A cricket bat face sticker design on a transparent background, tall vertical layout.
Fictional brand "KRAFT" in big bold red letters with a thick white outline, written
vertically bottom-to-top, a navy-blue swoosh and a small gold star above it. Flat graphic,
front-on, no bat, no shadow, transparent background.
```

## 8. Game logo: `logo.png`, 1024×512, transparent PNG

```
Game logo reading "MOTION CRICKET" on a transparent background. Chunky, rounded 3D cartoon
letters: "MOTION" in white and "CRICKET" in golden yellow, both with a thick navy outline
and a soft drop shadow. A wooden cricket bat and a shiny red cricket ball with motion
swoosh lines tucked behind the text. Bright, playful, animated-movie title style.
Spell the text exactly.
```
*It replaces the text title on the main menu.*

---

## Play Store listing art (not loaded by the game)

**App icon:** 1024×1024, downscaled to 512×512 for the store.
```
App icon, square with no rounded corners and no text: a stylized 3D cartoon cricket bat
striking a shiny red cricket ball with a burst of motion lines, against a bright blue sky
with one fluffy cloud and a hint of green grass at the bottom. Bold, simple, readable at
small size, centred with generous padding.
```

**Feature graphic:** 1024×500. Generate at 16:9 and crop.
```
Wide promotional banner: first-person view of a cricket batter's gloves and bat in the
foreground at the bottom, a bowler running in on the pitch ahead, a packed colourful
stadium with a teal-green roof, floodlights and a huge bright blue sky with fluffy clouds.
Leave clear empty sky on the left third for a title. No text, no real logos.
```

---

## Optional, phase 2: 3D characters

The bowler, fielders, umpire and gloves are built from simple shapes in
code. For film-quality characters like the reference you need **3D
models**. ChatGPT and Qwen only make images, so there are two steps:

1. Generate a character sheet with the prompt below.
2. Turn it into a 3D model with an image-to-3D tool (for example Meshy,
   Tripo or Hunyuan3D), then rig and animate it (for example with Mixamo).
   Export it as `.glb`.

Once you have `.glb` files, ask me to add a model loader so they replace
the procedural characters.

```
Character turnaround sheet for a 3D model: a stylized animated-film cricket fast bowler in
a white cricket Test kit (long-sleeved white shirt with teal collar trim, white trousers,
white spiked shoes), navy cap, short dark beard, friendly face, athletic build, slightly
exaggerated proportions (larger head and hands). Neutral A-pose. Front, side and back
views side by side on a plain light-grey background, even lighting, no shadows, no text,
no logos or numbers on the shirt.
```
Use the same prompt for the fielder, the umpire (white coat, dark trousers,
wide-brim white hat) and the batting gloves (white padded gloves with teal
trim, top and palm views).
