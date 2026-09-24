# Motion Cricket

A first-person cricket game you play by swinging a real stick (a rolled
newspaper, a broom handle, a toy bat) at your laptop or phone camera. The
camera finds the stick itself, so the bat on screen follows the stick, not
your arm. You judge the timing and pick the direction, and you choose
whether the ball goes in the air or along the ground.

It runs in the browser on laptops and phones, and is packaged for the Play
Store with Capacitor.

## Quick start

```bash
cd motion-cricket
npm install          # also copies the MediaPipe runtime and downloads the hand model
npm run dev          # http://localhost:5173
```

**Windows PowerShell:** older PowerShell doesn't accept `&&`, so run the
commands one per line:

```powershell
cd motion-cricket
npm install
npm run dev
```

If npm says *"running scripts is disabled on this system"*, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use `npm.cmd`
in place of `npm`. Keep that window open while you play; closing it stops
the game server.

- **Laptop:** open `http://localhost:5173`. Camera access works on localhost.
- **Phone on the same Wi-Fi:** run `npm run dev:phone` and open the
  `https://<your-computer-ip>:5173` address it prints. Phones only allow the
  camera over https. Accept the self-signed certificate warning once.
- **No camera?** Choose **Settings → Control → Touch** and swipe to swing.

## How to play

| You do | The game does |
|---|---|
| Swing **up** through the ball | **Lofted** shot: a six if it's timed and hit hard, or a catch |
| Swing **down** or level | **Ground** shot, hit into the turf so it can't be caught |
| Swing within ~20° of vertical | Straight: past the bowler, between mid-off and mid-on |
| Swing across to your **right** / **left** | The ball goes right / left, up to square |
| Swing **early** / **late** | It bends to the leg side / off side; very late or edged goes behind the wicket |
| A slow push | A defensive block |
| Leave a straight ball, or miss it | Bowled! |

- **Power** is your swing speed compared with your own full swing (measured
  in calibration). **Timing** decides how cleanly you connect. Perfect
  timing is what clears the rope.
- **The swing is judged when the ball arrives**, from whatever the bat is
  doing at that moment. Picking the bat up (the backlift) doesn't use up your
  shot, and neither does nudging it or fidgeting: a swing has to be fast and
  travel a real distance.
- **Any direction counts.** A swing is any fast bat movement, whichever way
  your arms go. If the stick blurs out of sight mid-swing, the game follows
  your hands instead, so fast swings aren't lost.
- **The on-screen bat follows your hands and stick**, live. While the ball
  is on its way, it turns see-through whenever it's in front of the pitch,
  so it never hides the ball. If the camera loses you, it rests in a raised
  backlift. (Settings → On-screen bat → "Waits in backlift" keeps it raised
  and only swings it when you swing.)
- **Auto timing** (Settings, on by default): if you keep swinging early or
  late, the game shifts its timing window to match you and your camera.
- **Six meter:** every lofted hit shows its distance live. Sixes get a
  cinematic replay from behind the batter, and your longest six is saved.

### Controls (Settings → Control)

- **Stick** (default): the camera finds the stick in your hands by its shape
  and colour. Calibration learns what your stick looks like.
- **Hands:** no stick. Hold your hands together as if gripping a bat. The
  bat angle is estimated from your fists, so it's less precise.
- **Touch:** swipe or move the mouse. For trying the game without a camera.

### Calibration (about 30 seconds, asked for on first play)

Get in frame → hold the stick up (it learns the stick) → stance → backlift →
reach left → reach right → 3 real swings. The swing counter shows each swing
it counted, and tells you when it ignored a backlift or a small movement.

### Tips

- Device at chest height, landscape. Stand 1.5–2.5 m back in good light.
- **Make the stick stand out from what's behind you.** A white newspaper in
  front of white curtains is hard to see. Wrap it in coloured paper or tape,
  or stand in front of a different-coloured wall. Calibration warns you if
  the contrast is too low.
- Start on **Slow** pace. If your shots are always "Early" or always "Late",
  move the **Timing** slider in Settings to match your camera.

## Look and sound

- Stylized animated-film look based on the reference image: a warm golden-hour
  sun, a deep blue sky with big cumulus clouds, and floodlights that glow. The
  stadium has two tiers of stands packed with an animated crowd that jumps on
  sixes, plus a green-roofed members' pavilion, LED boards and a lush striped
  outfield. The characters are chunky and rim-lit, with soft background blur
  and bloom.
- **Graphics** setting: Auto, Low, Medium or High. Auto picks for the
  device, and the game steps down by itself if the frame rate drops.
- Calm, synthesized sound: a soft ambient pad and wind chimes, a wooden
  "tok" and bell for the bat, singing bowls instead of alarms, and
  pentatonic chimes for fours and sixes. Effects and ambience have separate
  volume sliders.

## Custom art

Everything is drawn procedurally. To get even closer to the reference, you
can generate images with the prompts in **[ASSET_PROMPTS.md](ASSET_PROMPTS.md)**
and drop them into `public/assets/`. Each file replaces its procedural
version automatically.

## Building for the Play Store

The web build is wrapped in a native Android app with
[Capacitor](https://capacitorjs.com/). You need Android Studio for the final
signing and upload.

```bash
npm run android:add     # first time only: builds, creates android/, adds camera permission + landscape
npm run android:sync    # after every code change: rebuild and copy into android/
npm run android:open    # opens Android Studio → Build → Generate Signed App Bundle (.aab)
```

- `scripts/android-permissions.mjs` adds `android.permission.CAMERA` and
  locks the activity to landscape.
- Everything is bundled for offline play: the MediaPipe runtime, the hand
  model (`public/vision/`, ~8 MB) and the fonts.
- Change `appId` / `appName` in `capacitor.config.json` before your first
  upload. The app ID can't be changed later.
- The Play Console asks for a **privacy policy** because the app uses the
  camera. Camera frames are processed on the device and are never stored or
  uploaded. Say so in the policy and in the Data safety form.

## Tests

```bash
npm test
```

There are 43 tests. The stick tracker is tested on drawn camera frames:
every direction, no stick at all (the arm must never count), white sleeves,
a wooden stick, motion blur and low contrast. The other tests cover:
- the swing detector: backlifts, nudges, jitter and lost frames;
- contact timing;
- ball heights at the bat for every length and pace;
- shot directions all round the field, straight fours and sixes, and catches;
- a full pipeline test from drawn frames of a player swinging to the shot.

## Code map

```
src/
  main.js                 screens, settings, camera loop (one pass per video frame)
  audio/zen.js            calm synthesized soundscape
  tracking/
    camera.js             front camera (720p, 60 fps where available)
    handTracker.js        MediaPipe hand landmarks (GPU, CPU fallback)
    frame.js, frameGrabber.js  small blurred Y/Cb/Cr copy of each frame
    handGeometry.js       palm, hand size, forearm direction; hands-only bat guess
    stickTracker.js       finds the stick: bar detector from the fist, learned stick
                          colour, skin suppression, never along the forearm
    strokeDetector.js     bat movement → strokes; swing thresholds; backlift detection
    batInput.js           stick/hands/touch → one bat for the game
  game/
    config.js             layout, pace, timing constants
    game.js               match flow, contact, scoring, cameras, six replay
    contact.js            which swing met the ball, and its timing
    batPose.js            on-screen bat: follows your hands, or rests in a backlift and swings
    shots.js              swing → direction, height, power, shot name
    physics.js            delivery (lengths, bounce, swing, seam) and struck-ball flight
    outcome.js            field placings, catches, runs, boundaries
    world.js, post.js     renderer, lights, quality presets; blur, bloom, grade
    sky.js, field.js, stadium.js, crowd.js, stumps.js   the ground
    characters.js, cast.js, batter.js   characters, bowler/fielders/umpire, the player's batter
    fpRig.js, batModel.js, ball.js      first-person bat and gloves, the bat, the ball
    textures.js, assets.js              procedural textures, optional custom art
  ui/
    calibration.js        guided calibration
    hud.js                scorebug, six meter, results, radar
    overlay.js            what the tracker sees, drawn over the camera preview
test/                     node --test suites (+ a tiny rasterizer for drawn frames)
```

**Tuning knobs:** timing windows and default latency (`TIMING` in
`config.js`), pace ranges (`PACES`), lengths and bounce (`LENGTHS` in
`physics.js`), swing thresholds (`STROKE_PROFILES` in `strokeDetector.js`),
shot power (`shots.js`), field placings (`FIELD` in `outcome.js`).

**Testing hook:** `window.__mc.step(frames)` drives the game on a virtual
clock, and `window.__mc.realtime()` hands it back to real time.
