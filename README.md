# EGGHEAD: STAY UNSTABLE

An absurd, short-session physics balancing game for mobile browsers. A well-dressed
egg-shaped agent has to keep his footing on a platform that tilts, hops, slides,
spins and eventually grows miniature fans and a spring. Stay up as long as you can.

Built with Three.js. No build step, no package manager, no network access required —
just open `index.html`.

---

## Play

Open `index.html` in any modern browser (Chrome, Safari, Edge, Firefox).

For the full experience use a phone or a desktop browser in a narrow portrait window,
and turn sound on.

### Controls

| Input | Action |
| --- | --- |
| Drag left / right (or `←` `→`, `A` `D`) | Shift the agent's balance and shuffle his feet |
| Tap the screen (or `Space`) | Exaggerated recovery flail, once the meter refills |
| Pause button (or `Esc` / `P`) | Pause and resume |

---

## How it plays

The agent's feet are **not** locked to the deck. Push left and right to fight the
drift; whatever momentum the platform gives you, you keep. The body trails behind the
feet, so an aggressive correction makes him lean the wrong way for a moment before he
catches up. Anticipate rather than react.

Surviving earns points. Every few seconds a new hazard is bolted onto the platform,
and the music adds a layer with it.

### Hazard schedule

| Time survived | Hazard |
| --- | --- |
| 0s | Warm-up sway |
| 5s | Sudden bounce |
| 10s | Sliding floor |
| 15s | Spinning deck |
| 21s | Mini fans |
| 27s | Spring loaded |
| 34s | Total chaos |

### Progression

Reaching a survival time unlocks a cosmetic item — suits, sunglasses and idle poses.
Unlocks are **purely visual** and never change the physics or the scoring. Your best
time, best score and everything you have unlocked are saved locally in the browser.

---

## Project layout

```
egghead-stay-unstable/
├── index.html          markup, HUD and every screen
├── css/style.css       mobile-portrait UI, safe-area aware
└── js/
    ├── three.min.js    Three.js r149 (UMD, vendored so it runs offline / from file://)
    ├── audio.js        procedural Web Audio: sound effects and layered music
    ├── character.js    the Egghead mesh, rig and six blended physical poses
    ├── world.js        platform, hazards, backdrop and lighting
    └── game.js         loop, physics, fail detection, progression and UI wiring
```

Everything is loaded as plain `<script>` tags that share a few globals
(`EggAudio`, `EggCharacter`, `EggWorld`). There are no modules to bundle.

---

## Notes on the physics

The agent stands in a **platform-local** frame, so his feet can never punch through
the deck. His body is a wobbly self-righting spring whose lean lags behind his sliding
feet:

```
leanAcc = -RESTORE·sin(lean) - DAMP·leanVel - LEAN_V·footVel - LEAN_A·footAcc
          + (gravity from the tilted deck) / COM_H + wind + hop kick + slip noise
```

A tilted deck both shoves the feet downhill and torques the body, so the failure mode
is either drifting off the edge or leaning past the point of no return. Releasing the
controls genuinely loses — the foot drive is a *force*, not a position lock.

Sound is synthesised at runtime (no audio files): a rising comedic tone as balance
fails, a short victory sting on a recovery, a low bass thud on failure, and a looping
minimal rhythm that gains drums and synth layers as you survive.

---

## Third-party

[Three.js](https://threejs.org/) r149, MIT licensed, vendored in `js/three.min.js`.
