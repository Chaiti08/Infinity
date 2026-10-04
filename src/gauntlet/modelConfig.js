// Use your own gauntlet model (for example a CC-licensed one from Sketchfab).
//
// 1. Download it as glTF Binary (.glb) and save it as public/models/gauntlet.glb
// 2. Set `url` below to 'models/gauntlet.glb'
// 3. Run the site with ?calibrate in the URL and click on the model where each
//    stone should sit — the console prints a ready-to-paste socket entry.
// 4. Paste the six entries into `sockets`.
//
// While `url` is null (or the file fails to load) the built-in procedural
// gauntlet is used, which already has all six sockets.

export const MODEL_CONFIG = {
  url: null,

  // The model is auto-scaled to this height and stood on the cuff's base.
  height: 4.0,
  // Extra rotation (radians) if the model faces the wrong way: back of hand → +Z.
  rotation: [0, 0, 0],
  // Replace the model's own materials with the tinted gold (recommended when
  // the source materials look flat or untextured).
  useGoldMaterial: false,

  // Socket positions in the normalised model space printed by ?calibrate.
  sockets: {
    // soul:    { position: [x, y, z], normal: [x, y, z], radius: 0.1 },
    // reality: { ... }, space: { ... }, power: { ... }, time: { ... }, mind: { ... },
  },
};
