# Motion Cricket

A first-person cricket game you play by swinging for real. The device camera
tracks your hands, or a stick with a coloured tip, and the bat on screen
follows them. Time the swing, and the direction and angle you swing decide
where the ball goes.

It runs in the browser on laptops and phones, and is packaged for the Play
Store with Capacitor.

## Quick start

```bash
cd motion-cricket
npm install          # also copies the MediaPipe runtime and downloads the hand model
npm run dev          # http://localhost:5173
```

- **Laptop:** open `http://localhost:5173`. Camera access works on localhost.
- **Phone on the same Wi-Fi:** run `npm run dev:phone` and open the
  `https://<your-computer-ip>:5173` address it prints. Phones only allow the
  camera over https. Accept the self-signed certificate warning once.
- **No camera?** Choose **Settings → Control → Touch / Mouse** and swipe to swing.

## How to play

| You do | The game does |
|---|---|
| Swing **upward** through the ball | **Lofted** shot (in the air: six or catch) |
| Swing **downward** / level | **Ground** shot (four along the ground or runs) |
| Swing straight up or down | Straight drive |
| Swing across to your **right** | Ball goes right (off side for a right-hander) |
| Swing across to your **left** | Ball goes left (leg side for a right-hander) |
| Swing **early** | Ball goes more to the leg side |
| Swing **late** | Ball goes more to the off side; very late edges go behind the wicket |
| Don't swing, or miss a straight ball | Bowled! |

Swing speed, relative to your calibrated full swing, sets the power. Timing
sets how cleanly you connect. Perfect timing is what clears the rope.

**Input modes** (Settings → Control):
- **Hands:** hold both hands together as if gripping a bat. The line of your
  knuckles and the line between your hands give the bat angle.
- **Stick:** hold a broom handle, rolled newspaper or toy bat with a
  **bright coloured tip** (tape, a sock or a ball). This gives the most
  accurate bat angle. The calibration learns the tip colour.
- **Touch / Mouse:** swipe or move the mouse. Good for testing without a camera.

**Calibration** (about 30 s, asked for on first play): get in frame, (stick:
show the tip), stance, backlift, reach left, reach right, then 3 practice
swings. It adapts the game to your body, your distance from the camera and
your swing speed. Recalibrate any time from the menu or the pause screen.

**Setup tips:** put the device at chest height, landscape, with you 1.5–2 m
back, in good light and in front of a plain background. Start on **Slow** pace:
camera tracking adds some lag and slow balls hide it.

## Custom art

The game ships with procedural art for everything. To match the reference
style more closely, generate the images in **[ASSET_PROMPTS.md](ASSET_PROMPTS.md)**
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
  locks the activity to landscape. Capacitor's WebView then asks the player
  for camera permission at runtime.
- Everything is bundled for offline play: the MediaPipe WASM runtime, the
  hand model (`public/vision/`, ~8 MB) and the fonts.
- Change `appId` / `appName` in `capacitor.config.json` before your first
  upload. The app ID can't be changed later.
- The Play Console asks for a **privacy policy** because the app uses the
  camera. The camera frames are processed on the device and are never
  stored or uploaded. Say so in the policy and in the Data safety form.

## Code map

```
src/
  main.js               screens, settings, frame loop, camera start-up
  audio.js              synthesized sounds (bat, stumps, crowd)
  tracking/
    camera.js           front camera via getUserMedia
    handTracker.js      MediaPipe HandLandmarker (GPU, CPU fallback)
    markerTracker.js    colour-blob tracking of the stick tip
    batInput.js         fuses hands/stick/touch into one bat: grip, angle,
                        calibrated position, velocity, swing detection
    filters.js          One Euro smoothing filter
  game/
    game.js             delivery loop, swing timing → hit, scoring, camera
    shots.js            swing → shot direction/height/power + shot names
    physics.js          delivery path (bounce, seam) and struck-ball flight
    fielding.js         field placings, catches, fielding and running outcomes
    bowler.js           bowler run-up and delivery animation
    batView.js          first-person bat, gloves, sleeves and swing trail
    character.js        stylized characters built from primitives + poses
    stadium.js          sky, field, pitch, stands, roof, floodlights, boards
    textures.js         procedural canvas textures
    assets.js           optional custom art loader
  ui/
    calibration.js      guided calibration flow
    hud.js              scoreboard, results, radar, confetti
    overlay.js          hand/bat drawing over the camera preview
```

**Tuning knobs:** swing timing window (`IDEAL_LEAD`, `EARLIEST`, `LATEST`
in `game.js`), input lag compensation (`latency` in `game.js`), pace ranges
(`PACES` in `physics.js`), shot power (`shots.js`), fielder speed and catch
height (`fielding.js`).

**Testing hook:** `window.__mc.step(frames)` drives the game on a virtual
clock, and `window.__mc.realtime()` hands it back to real time. Automated
tests use it on slow machines.
