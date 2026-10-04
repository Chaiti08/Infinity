# Infinity

An interactive 3D Infinity Gauntlet for the web, built with Three.js (WebGL).

Six stones slowly orbit a gold gauntlet. Drag any stone onto the gauntlet and it
snaps into its own socket. The gauntlet takes on the stone's glow and the world
around it changes. Collect all six for the finale, then snap.

## The stones

| Stone   | Socket       | What happens                                                                    | What stays afterwards                      |
| ------- | ------------ | ------------------------------------------------------------------------------- | ------------------------------------------ |
| Space   | middle knuckle | Hyperspace jump: the stars stretch into light, then a blue portal opens         | A faint portal and blue-shifted sky        |
| Mind    | back of hand | A psychic wave: the screen ripples, the camera sways, the cursor leaves a gold trail | Gentle sway and golden interference        |
| Reality | ring knuckle | Reality glitches: the screen tears, the sky turns to red liquid, Aether tendrils coil | A red-tinted sky and drifting Aether       |
| Power   | index knuckle | A shockwave of force: screen shake, purple storm, sparks                        | Purple energy crackling over the metal     |
| Time    | thumb        | Time stops: particles, lightning and orbit freeze inside green rune rings, then rewind | The whole world runs at half speed         |
| Soul    | pinky knuckle | The Soul World: an amber sky over a calm, mirror-like sea                       | The sea stays beneath the gauntlet         |

When all six are placed, every stone throws lightning skyward. A white-gold flash
then rebuilds the universe as a new spiral galaxy, and a **Snap** button appears.
Pressing it turns everything to dust before the scene resets.

## Controls

- **Drag** a stone onto the gauntlet to place it. Drag a placed stone away to remove it.
- **Drag empty space** to orbit the camera. **Scroll or pinch** to zoom. The camera auto-rotates when idle.
- **Keys 1–6**, or the six dots at the bottom, place or remove stones. Use these if dragging isn't practical.
- **R** resets, **M** mutes, **Space/Enter** snaps when the button is shown.

Touch works for everything above. The page respects `prefers-reduced-motion`
by toning down shake and sway.

## Running locally

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
```

Useful URL flags:

- `?quality=low|medium|high` forces a rendering tier. It is picked automatically otherwise.
- `?calibrate` prints socket coordinates when you click the model (see below).
- `?debug` exposes internals on `window.__gauntlet`.

## Using a Sketchfab (or any glTF) gauntlet model

The gauntlet is modelled procedurally in code, so the site works with no
downloaded assets. To use a scanned or hand-sculpted model instead:

1. Download a model you have the licence for (for example a CC-BY model on
   Sketchfab) as **glTF Binary (.glb)**. Save it as `public/models/gauntlet.glb`.
2. In `src/gauntlet/modelConfig.js`, set `url: 'models/gauntlet.glb'`.
3. Open the site with `?calibrate`, click where each stone should sit, and paste
   the printed entries into `sockets`.
4. If the model uses a CC-BY licence, credit its author in the page footer.

## Deployment

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push
to `main`. To enable it, go to the repo's **Settings → Pages** and set
**Source = GitHub Actions** once. The build uses relative paths, so it also works
on any static host (Netlify, Vercel, S3, …).

## How it's built

- `src/gauntlet/`: procedural gauntlet geometry, a tinted-gold PBR material with
  procedural wear, rim glow and the dissolve shader, plus the optional `.glb` loader.
- `src/stones/`: the stones, their orbit, and the fly-to-socket animation.
- `src/world/`: nebula sky shader (rendered at reduced resolution), stars,
  drifting sparkles, Soul World water (planar reflection), and the reborn galaxy.
- `src/effects/`: lightning, per-stone effects, snap-to-dust, and `director.js`,
  which sequences every effect, the ultimate and the snap.
- `src/core/`: renderer, camera, lights, image-based environment, adaptive quality
  tiers, and post-processing (bloom plus a custom lens/glitch/ripple pass).
- `src/audio/`: all sound synthesised live with the Web Audio API (no audio files).

This is a fan-made tribute. It is not affiliated with or endorsed by Marvel or Disney.
