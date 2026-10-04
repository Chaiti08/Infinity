// Picks a rendering tier once at startup. Everything expensive (pixel ratio,
// particle counts, nebula octaves, reflections, MSAA) reads from here.

const TIERS = {
  high: {
    name: 'high',
    maxDpr: 2,
    msaa: 4,
    bgScale: 0.5,
    nebulaOctaves: 5,
    bloomScale: 0.5,
    stars: 5000,
    dust: 900,
    aether: 2400,
    galaxy: 16000,
    snapDust: 9000,
    reflections: true,
    stoneLights: true,
  },
  medium: {
    name: 'medium',
    maxDpr: 1.5,
    msaa: 2,
    bgScale: 0.4,
    nebulaOctaves: 4,
    bloomScale: 0.5,
    stars: 3500,
    dust: 600,
    aether: 1600,
    galaxy: 10000,
    snapDust: 6000,
    reflections: true,
    stoneLights: true,
  },
  low: {
    name: 'low',
    maxDpr: 1.25,
    msaa: 0,
    bgScale: 0.33,
    nebulaOctaves: 3,
    bloomScale: 0.35,
    stars: 2200,
    dust: 350,
    aether: 900,
    galaxy: 6000,
    snapDust: 3500,
    reflections: false,
    stoneLights: false,
  },
};

export function detectQuality() {
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  if (forced && TIERS[forced]) return { ...TIERS[forced] };

  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;

  let tier = 'high';
  if (coarse || small) tier = 'medium';
  if ((coarse && (cores <= 4 || mem <= 3)) || mem <= 2) tier = 'low';

  // Software renderers (no GPU) need the lightest tier.
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(gpu)) tier = 'low';
  } catch {
    /* ignore */
  }
  return { ...TIERS[tier] };
}

export function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
