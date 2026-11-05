// Combat VFX recipes for EffectCraft. Each recipe is a list of engine commands that builds one comp;
// bake.mjs renders it to a PNG sequence, checks the alpha and packs a horizontal strip for Phaser.
// Sizes are the size the game draws them at (one cell is 16 px), so nothing is downscaled later.

const key = (layer, path, time, value) => ({
  command: 'prop.addKey',
  params: { layer, path, time, value },
});
const set = (layer, path, value) => ({ command: 'prop.set', params: { layer, path, value } });
const fx = (layer, effect) => ({ command: 'effect.apply', params: { effect, layers: [layer] } });
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);

/** One particle burst: a short pulse of births, then the particles live out their longevity. */
function burst(layer, size, o) {
  const p = (path) => `effects/#1/${path}`;
  return [
    {
      command: 'layer.newSolid',
      params: { name: layer, color: '#000000', width: size, height: size },
    },
    fx(layer, 'CC Particle Systems II'),
    set(layer, p('physics/animation'), 0), // Explosive
    set(layer, p('physics/gravity'), 0), // top-down: nothing falls
    set(layer, p('physics/velocity'), o.velocity),
    set(layer, p('physics/resistance'), o.resistance ?? 0),
    set(layer, p('longevity'), o.longevity),
    set(layer, p('particle/particleType'), o.type),
    set(layer, p('particle/birthSize'), o.birthSize),
    set(layer, p('particle/deathSize'), o.deathSize),
    set(layer, p('particle/sizeVariation'), o.sizeVariation ?? 40),
    set(layer, p('particle/maxOpacity'), o.opacity ?? 100),
    set(layer, p('particle/birthColor'), rgb(o.birth)),
    set(layer, p('particle/deathColor'), rgb(o.death)),
    set(layer, p('particle/transferMode'), o.add ? 2 : 0),
    set(layer, p('producer/radiusX'), o.radius ?? 0),
    set(layer, p('producer/radiusY'), o.radius ?? 0),
    set(layer, p('randomSeed'), o.seed ?? 1),
    key(layer, p('birthRate'), 0, o.rate),
    key(layer, p('birthRate'), o.emit, o.rate),
    key(layer, p('birthRate'), o.emit + 0.001, 0),
  ];
}

/** A soft blob that grows and fades: the body of a splash or a puff. */
function blob(layer, o) {
  return [
    {
      command: 'layer.newShape',
      params: { kind: 'ellipse', name: layer, size: o.size, fill: o.color },
    },
    fx(layer, 'Gaussian Blur'),
    set(layer, 'effects/#1/blurriness', o.blur),
    key(layer, 'transform/position', 0, [...o.from, 0]),
    key(layer, 'transform/position', o.end, [...(o.to ?? o.from), 0]),
    key(layer, 'transform/scale', 0, [o.scale[0], o.scale[0], 100]),
    key(layer, 'transform/scale', o.end, [o.scale[1], o.scale[1], 100]),
    key(layer, 'transform/opacity', 0, o.opacity[0]),
    key(layer, 'transform/opacity', o.peak ?? o.end * 0.3, o.opacity[1]),
    key(layer, 'transform/opacity', o.end, 0),
  ];
}

export const RECIPES = {
  // Points right; the game rotates it to the shot and anchors its left edge at the muzzle.
  muzzle_flash: {
    width: 64,
    height: 32,
    duration: 0.133,
    layers: () => [
      {
        command: 'layer.newShape',
        params: { kind: 'star', name: 'cone', size: [56, 56], fill: '#ff7a1e' },
      },
      set('cone', 'contents/group/contents/star/points', 6),
      set('cone', 'contents/group/contents/star/innerRadius', 6),
      set('cone', 'contents/group/contents/star/outerRadius', 26),
      fx('cone', 'Glow'),
      key('cone', 'transform/position', 0, [24, 16, 0]),
      key('cone', 'transform/scale', 0, [70, 34, 100]),
      key('cone', 'transform/scale', 0.033, [125, 44, 100]),
      key('cone', 'transform/scale', 0.133, [80, 20, 100]),
      key('cone', 'transform/opacity', 0, 100),
      key('cone', 'transform/opacity', 0.033, 100),
      key('cone', 'transform/opacity', 0.1, 0),
      {
        command: 'layer.newShape',
        params: { kind: 'ellipse', name: 'core', size: [18, 12], fill: '#fff6dc' },
      },
      fx('core', 'Glow'),
      key('core', 'transform/position', 0, [12, 16, 0]),
      key('core', 'transform/scale', 0, [100, 100, 100]),
      key('core', 'transform/scale', 0.066, [55, 55, 100]),
      key('core', 'transform/opacity', 0, 100),
      key('core', 'transform/opacity', 0.066, 0),
    ],
  },
  impact_sparks: {
    width: 48,
    height: 48,
    duration: 0.2,
    layers: () =>
      burst('sparks', 48, {
        velocity: 8,
        resistance: 1.5,
        longevity: 0.11,
        type: 0, // lines read as streaks
        birthSize: 1.2,
        deathSize: 0.4,
        rate: 16,
        emit: 0.02,
        birth: '#fff2b0',
        death: '#ff8a2a',
        add: true,
      }),
  },
  blood_hit: {
    width: 64,
    height: 64,
    duration: 0.433,
    layers: () => [
      ...blob('pool', {
        size: [22, 22],
        color: '#5a0a08',
        blur: 2,
        from: [32, 32],
        scale: [30, 90],
        opacity: [85, 70],
        end: 0.4,
        peak: 0.08,
      }),
      ...burst('drops', 64, {
        velocity: 7,
        resistance: 4,
        longevity: 0.3,
        type: 2,
        birthSize: 2.6,
        deathSize: 1.4,
        sizeVariation: 60,
        rate: 14,
        emit: 0.05,
        birth: '#a3201a',
        death: '#4a0806',
        seed: 3,
      }),
    ],
  },
  ichor_hit: {
    width: 64,
    height: 64,
    duration: 0.433,
    layers: () => [
      ...blob('pool', {
        size: [22, 22],
        color: '#2c2412',
        blur: 2,
        from: [32, 32],
        scale: [30, 85],
        opacity: [85, 70],
        end: 0.4,
        peak: 0.08,
      }),
      ...burst('drops', 64, {
        velocity: 7,
        resistance: 4,
        longevity: 0.3,
        type: 2,
        birthSize: 2.6,
        deathSize: 1.4,
        sizeVariation: 60,
        rate: 14,
        emit: 0.05,
        birth: '#76642e',
        death: '#241c0c',
        seed: 7,
      }),
    ],
  },
  dust_puff: {
    width: 64,
    height: 64,
    duration: 0.5,
    layers: () => [
      ...blob('d1', {
        size: [24, 24],
        color: '#8a8274',
        blur: 4,
        from: [28, 34],
        to: [22, 38],
        scale: [40, 150],
        opacity: [70, 55],
        end: 0.466,
      }),
      ...blob('d2', {
        size: [20, 20],
        color: '#6f695e',
        blur: 4,
        from: [36, 30],
        to: [43, 25],
        scale: [40, 140],
        opacity: [70, 50],
        end: 0.44,
      }),
      ...blob('d3', {
        size: [16, 16],
        color: '#a39a88',
        blur: 3,
        from: [32, 32],
        to: [33, 31],
        scale: [50, 120],
        opacity: [60, 40],
        end: 0.4,
      }),
    ],
  },
};
