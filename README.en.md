[中文](README.md) · **English**

# PAYLOAD SYNTHESIS
A merge-and-clear game built with Three.js (Suika / "Watermelon Game" style), where the
art, UI and UX all follow a **NASA-punk** direction — the functional aesthetic of 1970s
aerospace specification manuals: off-white lacquered hardware, panel seams and rivets,
black-and-white hazard stripes, small all-caps part numbers, a single red accent color,
and honest wear.

Portrait and landscape share one physics and gameplay core; the surrounding layout
adapts and switches between them.

**[ Live Demo](https://fanquanpp.github.io/payload-synthesis/)**

---

## Running
```bash
cd payload-synthesis
python -m http.server 8123
# open http://127.0.0.1:8123/
```

On Windows you can also double-click `start.bat`. Deployment on GitHub Pages is likewise
a zero-config static site.

---

## How to Play
| Input | Action |
|---|---|
| `←` `→` / `A` `D` | Move the drop position |
| `Space` / `Enter` | Drop a part |
| Mouse move + click | Aim and drop |
| Touch drag + release | Drop on mobile |
| `Q` / click "Prune" in the HUD | Enter prune mode, then click any part to remove it |
| `Esc` / `P` | Exit prune mode / pause |
| "EN / 中文" in the top-right of the HUD | Toggle Chinese/English (your choice is remembered; on a first visit it is decided by browser language) |

- Two parts of the **same tier** that touch merge into the next tier up.
- If a part crosses the red limit line inside the bay and stays there for **6 seconds**, the mission is aborted.
- Consecutive merges build a **chain**, and the score is multiplied by the chain multiplier (up to ×8).
- Every **500 points** earned grants one "Prune" charge (up to 3 stored), which removes any part to rescue the run.
- Dropping has **0.28 s of input buffering**: a key press during cooldown takes effect the instant the cooldown ends.

### The 11-Tier Parts Ladder
| Level | Code | Name | Shape | Collision radius factor |
|---|---|---|---|---|
| 1 | P/L 01 | BOLT (螺栓) | hexagonal prism | 0.96 |
| 2 | STOW 84S | SENSOR (传感器) | capsule | 1.00 |
| 3 | REF 12-4 | BATTERY (电池组) | cube | 0.93 |
| 4 | GYR-A | GYRO (陀螺仪) | sphere | 1.00 |
| 5 | TANK 5 | CANISTER (储罐) | cylinder | 0.96 |
| 6 | NO STEP | THRUSTER (推进器) | rocket bell | 0.96 |
| 7 | ANT 7 | ANTENNA (天线) | torus | 0.90 |
| 8 | F/T 08 | FUEL TANK (燃料舱) | dodecahedron | 0.96 |
| 9 | SM-09 | SERVICE MODULE (服务舱) | slim cylinder | 0.96 |
| 10 | CM-10 | COMMAND MODULE (指令舱) | cone | 0.93 |
| 11 | LV-11 | LAUNCH VEHICLE (运载火箭) | large capsule | 0.98 |

The collision radius and the visual radius are kept **separate**: the visual uses the
bounding sphere, while collision uses the solid radius scaled by the factor. This lets
polyhedra and tori interlock naturally instead of "hitting air."

---

## Project Structure
```
index.html                Entry point (single page, portrait/landscape adaptive)
start.bat                 One-click local server
.nojekyll                 Disables Jekyll processing on GitHub Pages
src/
  style.css               All UI styles + NASA-punk tokens + motion vocabulary
  i18n.js                 Chinese/English dictionary and data-i18n bindings
  cfg.js                  Physics constants, adaptive board width, 11-tier ladder, palette
  physics.js              2D circular impulse solver
  world.js                Three.js scene + adaptive quality
  fx.js                   Instanced sparks / shockwave rings / floating scores / dust
  ui.js                   HUD, parts codex, next-drop preview, gate transitions, log
  game.js                 State machine, main loop, input, responsive layout, chain scoring, prune skill
vendor/
  three.min.js            Three.js r147 (UMD)
  pp/                     Post-processing (EffectComposer / UnrealBloom / FXAA)
  fonts/                  Archivo · Space Mono (self-hosted woff2)
assets/tex/
  lv01..lv11.jpg          Raw ambientCG material scans (texture-pipeline input)
  final/lv##_a.jpg        Finished albedo maps
  final/lv##_e.jpg        Finished emissive maps (deliberately near-black in this style)
tools/
  fetch_textures.py       Search for and download materials from ambientCG
  build_textures.py       Art pass: turn photo scans into NASA-punk hardware textures
  responsive-harness.html Side-by-side portrait/landscape check page (development)
```

---

## Art Pipeline
The two scripts under `tools/` form a complete, re-runnable asset workflow:

```bash
python tools/fetch_textures.py     # download 11 ambientCG 1K materials (CC0)
python tools/build_textures.py     # process the finished textures → assets/tex/final/
```

Processing steps:

1. An off-white lacquered base, with the hue tuned slightly per tier;
2. Overlay that tier's **own functional motif** — hex-bolt array / grille / battery pack / concentric rings / banding strap / rocket bell / radiator ribs / panel grid / access hatch / thermal tiles / fuselage livery;
3. Lay a downloaded real-material photo on top as **wear and grime noise**;
4. Use only **one vivid accent color** per tier (red `#D63A2C`, ochre `#D2A85E`, olive `#7A7F4E`, slate `#4C5A68`, rust `#A8432F`, blue `#2B4A7A`, orange `#C8792B`, teal `#2F6E75`);
5. Stamp in genuinely legible **all-caps stencil codes** (`STOW 84S`, `THIS SIDE UP`, `NO STEP`…);
6. Add scratches and light noise, then output 1024×512 equirectangular maps.

The style deliberately **avoids neon glow**: the emissive maps are close to fully black,
and the bloom post-processing strength is only 0.62 and rises with the danger level.

---

## Visual & Motion Highlights
- **A single interface**: an off-white manual-style page with an inset dark inspection-bay viewport — two materials, one language.
- **Line-art feel**: every part is inked with an inverted-hull outline, so it reads like a manual illustration. Parts under 5 units of radius skip the outline, saving roughly forty percent of the draw calls.
- **Motion vocabulary**: mechanical double-gate transitions, panel-assembly slide-ins, four corner rivets locking in sequence, striped bar segment charging, status-LED blinking, and a rotating pulsing prune targeting reticle.

### Responsive Layout
- **Adaptive board width**: `BH` is fixed while `BW` is derived from the viewport's actual available space (a floor of 0.733 aspect in portrait, a ceiling of 1.15 in landscape). So a wide screen gets a **wider bay**, not a letterboxed narrow column.
- The layout works by "measuring the real usable area → deriving the board width → hugging the side panels against the bay," rather than letting the panels drift to the window edges.
- Wide screens use three columns — "status bar on the left / bay / codex on the right"; portrait drops the left column and compresses the codex into a bottom bar.
- `@container` queries let a narrow bay automatically collapse the corner badges and warning copy that would otherwise collide.

### Adaptive Quality
The main loop monitors frame rate: three consecutive readings below 46 FPS drops one level
(full effects → reduced DPR + half-resolution bloom → bloom off + 1× DPR), and twelve
consecutive readings above 57 FPS raises it back. Quality-level changes are written to the
activity log.

---

## Physics Solver
- Uniform-grid broad phase plus pairwise narrow phase.
- Position resolution proceeds **from largest radius to smallest**, so big parts are solved first and small parts don't get squeezed out of the pile.
- Deep-penetration relaxation: when overlap exceeds a threshold, extra push-out iterations run, waking sleeping bodies if needed.
- Low-impact contacts receive velocity damping, so stacks settle quietly instead of humming continuously.
- **Penetration-aware sleeping**: a body may only fall asleep when it is not currently overlapping anything, which avoids freezing in a half-overlapped state.
- When the mass difference is too large, the position-correction factor is raised so light parts don't sink into heavy ones.

---

## Debugging
- `?noraf=1` — drives the main loop with `setTimeout` instead of `requestAnimationFrame`, for headless screenshots / embedded contexts (when rAF is throttled).
  Note: in this mode the frame-rate ceiling is limited by timer scheduling, so low readings are expected and do not reflect real performance.
- `SA.game.setAutoPause(false)` — disables "pause when the page is hidden."
- `SA.setLang('en' | 'zh')` — switches language.
- `SA.world.setQuality(0 | 1 | 2)` — sets the quality level manually.
- `SA.game` / `SA.world` / `SA.fx` / `SA.ui` / `SA.cfg` are all attached to the global object for console debugging.

---

## Asset Sources & Licenses
- Material scans: **ambientCG** (CC0 public domain).
- Fonts: **Archivo**, **Space Mono** (SIL OFL 1.1), self-hosted via jsDelivr / Fontsource.
- 3D engine: **Three.js r147** (MIT).
- All UI graphics, icons, part-texture motifs, particles and motion effects are generated in code.

## Design References
- Art and motion language: the NASA-punk style card (1970s NASA specification manuals / the Starfield interface).
- Gameplay structure: Watermelon-Game-style merging, with a removal skill and chain scoring.
