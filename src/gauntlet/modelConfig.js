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

export const MODEL_CONFIG = {
  url: `${base}models/gauntlet.glb`,
  stonesUrl: `${base}models/stones.glb`,

  // The model is auto-scaled to this height and stood on the cuff's base.
  height: 4.0,
  // Extra rotation (radians) if the model faces the wrong way: back of hand → +Z.
  rotation: [0, 0, 0],
  // Replace the model's own materials with the built-in tinted gold.
  // false keeps the model's baked texture and makes it metallic (see below).
  useGoldMaterial: false,
  // Used when useGoldMaterial is false.
  metalness: 0.45,
  roughness: 0.5,
  envMapIntensity: 2.2,

  // Optional manual socket overrides (normalised model space, printed by
  // ?calibrate). Anything missing is read from the model's Socket_* markers.
  sockets: {
    // soul: { position: [x, y, z], normal: [x, y, z], radius: 0.1 },
  },
};
