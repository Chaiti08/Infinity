// The site uses two Blender-exported models (see public/models/):
//
//   gauntlet.glb  the gauntlet with empty gem sockets. It also carries six
//                 pairs of marker nodes, `Socket_<id>` (where a stone sits)
//                 and `SocketN_<id>` (offset along the socket normal by the
//                 stone radius). The loader reads them, so no manual
//                 calibration is needed.
//   stones.glb    six groups, `Stone_<id>`, each holding `<id>_core`
//                 (the gem, centred on the origin).
//
// Set `url` / `stonesUrl` to null to fall back to the built-in procedural
// gauntlet and stones. If a model fails to load, the procedural one is used.
// ids: space, mind, reality, power, time, soul.

const base = import.meta.env.BASE_URL;
// Cache-buster: model files keep their names, so tag them with the build id.
const v = typeof __BUILD_ID__ !== 'undefined' ? `?v=${__BUILD_ID__}` : '';

export const MODEL_CONFIG = {
  url: `${base}models/gauntlet.glb${v}`,
  stonesUrl: `${base}models/stones.glb${v}`,

  // The model is auto-scaled to this height and stood on the cuff's base.
  height: 4.0,
  // Extra rotation (radians) if the model faces the wrong way: back of hand → +Z.
  rotation: [0, 0, 0],
  // How the gauntlet is shaded:
  //   'textured-gold'  real metal; the model's texture adds grime, plus
  //                    procedural brushed streaks and scratches (default)
  //   'gold'           the built-in procedural gold only
  //   'original'       the model's own material, made semi-metallic
  material: 'textured-gold',
  tint: '#ffe0a0', // multiplied with the model's texture
  metalness: 0.85,
  roughness: 0.5,
  envMapIntensity: 1.0,
  bumpScale: 0.25,
  surfaceRepeat: 3, // how finely the brushed/scratch detail tiles

  // Optional manual socket overrides (normalised model space, printed by
  // ?calibrate). Anything missing is read from the model's Socket_* markers.
  sockets: {
    // soul: { position: [x, y, z], normal: [x, y, z], radius: 0.1 },
  },
};
