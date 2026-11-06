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

/** A ring that grows and fades: a shout or a shockwave seen from above. */
function ring(layer, o) {
  return [
    {
      command: 'layer.newShape',
      params: {
        kind: 'ellipse',
        name: layer,
        size: o.size,
        fill: null,
        stroke: o.color,
        strokeWidth: o.width,
      },
    },
    fx(layer, 'Glow'),
    key(layer, 'transform/scale', 0, [o.scale[0], o.scale[0], 100]),
    key(layer, 'transform/scale', o.start, [o.scale[0], o.scale[0], 100]),
    key(layer, 'transform/scale', o.end, [o.scale[1], o.scale[1], 100]),
    key(layer, 'transform/opacity', 0, 0),
    key(layer, 'transform/opacity', o.start, 0),
    key(layer, 'transform/opacity', o.start + 0.034, 100),
    key(layer, 'transform/opacity', o.end, 0),
  ];
}

/**
 * A blob that cycles forever: phase `u` runs 0→1 every `period` seconds (offset by `phase`), and every
 * property is a function of u that starts and ends at the same value, so the loop has no seam.
 */
function cycle(layer, o) {
  const u = `(((time / ${o.period}) + ${o.phase}) % 1)`;
  return [
    {
      command: 'layer.newShape',
      params: { kind: 'ellipse', name: layer, size: o.size, fill: o.color },
    },
    fx(layer, 'Gaussian Blur'),
    set(layer, 'effects/#1/blurriness', o.blur),
    // tongues of flame: noise that evolves one full cycle per period, so it loops too
    ...(o.turbulence
      ? [
          fx(layer, 'Turbulent Displace'),
          set(layer, 'effects/#2/amount', o.turbulence),
          set(layer, 'effects/#2/size', 10),
          set(layer, 'effects/#2/evolutionOptions/cycleEvolution', true),
          set(layer, 'effects/#2/evolutionOptions/cycle', 1),
          {
            command: 'prop.setExpression',
            params: { layer, path: 'effects/#2/evolution', expression: `360 * time / ${o.period}` },
          },
        ]
      : []),
    {
      command: 'prop.setExpression',
      params: {
        layer,
        path: 'transform/position',
        expression: `var u = ${u}; [${o.from[0]} + (${o.to[0] - o.from[0]}) * u + ${o.sway ?? 0} * Math.sin(2 * Math.PI * (u * 2 + ${o.phase})), ${o.from[1]} + (${o.to[1] - o.from[1]}) * u, 0]`,
      },
    },
    {
      command: 'prop.setExpression',
      params: {
        layer,
        path: 'transform/scale',
        expression: `var u = ${u}; var k = ${o.scale[0]} + (${o.scale[1] - o.scale[0]}) * u; [k, k, 100]`,
      },
    },
    {
      command: 'prop.setExpression',
      params: {
        layer,
        path: 'transform/opacity',
        expression: `${o.opacity} * Math.sin(Math.PI * ${u})`,
      },
    },
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
        color: '#a8281a',
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
        birth: '#e0482c',
        death: '#9a2014',
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
        color: '#4a4a20',
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
        birth: '#7a8432',
        death: '#40421a',
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
  // A door kicked or bashed in: dark splinters thrown wide and a puff of dust.
  door_splinters: {
    width: 64,
    height: 64,
    duration: 0.5,
    layers: () => [
      ...blob('dust', {
        size: [24, 24],
        color: '#7d756a',
        blur: 4,
        from: [32, 32],
        scale: [40, 140],
        opacity: [70, 55],
        end: 0.466,
      }),
      ...burst('chips', 64, {
        velocity: 9,
        resistance: 3,
        longevity: 0.34,
        type: 6, // tri-polygons read as splinters
        birthSize: 2.4,
        deathSize: 1.6,
        sizeVariation: 70,
        rate: 14,
        emit: 0.04,
        birth: '#7a5232',
        death: '#4a3322',
        seed: 11,
      }),
    ],
  },
  // A barricade giving way: fewer, bigger and lighter planks than a door.
  plank_splinters: {
    width: 64,
    height: 64,
    duration: 0.5,
    layers: () => [
      ...blob('dust', {
        size: [20, 20],
        color: '#8a8274',
        blur: 4,
        from: [32, 32],
        scale: [40, 120],
        opacity: [60, 45],
        end: 0.466,
      }),
      ...burst('planks', 64, {
        velocity: 7,
        resistance: 3,
        longevity: 0.4,
        type: 5, // motion polygons stretch along their flight
        birthSize: 3.2,
        deathSize: 2.4,
        sizeVariation: 50,
        rate: 8,
        emit: 0.04,
        birth: '#a07a4a',
        death: '#6e5232',
        seed: 5,
      }),
    ],
  },
  glass_shatter: {
    width: 64,
    height: 64,
    duration: 0.4,
    layers: () => [
      ...burst('shards', 64, {
        velocity: 10,
        resistance: 3,
        longevity: 0.3,
        type: 6,
        birthSize: 1.8,
        deathSize: 1,
        sizeVariation: 70,
        rate: 18,
        emit: 0.03,
        birth: '#e8f6ff',
        death: '#8fc0dc',
        add: true,
        seed: 2,
      }),
      {
        command: 'layer.newShape',
        params: { kind: 'ellipse', name: 'glint', size: [14, 14], fill: '#ffffff' },
      },
      fx('glint', 'Glow'),
      key('glint', 'transform/opacity', 0, 100),
      key('glint', 'transform/opacity', 0.1, 0),
    ],
  },
  // The screamer's shriek at its source; the hearing radius stays drawn by the game.
  scream_burst: {
    width: 96,
    height: 96,
    duration: 0.6,
    layers: () => [
      ...ring('r1', {
        size: [80, 80],
        color: '#ff4b3a',
        width: 4,
        scale: [15, 110],
        start: 0,
        end: 0.4,
      }),
      ...ring('r2', {
        size: [80, 80],
        color: '#ff7a5a',
        width: 3,
        scale: [15, 100],
        start: 0.12,
        end: 0.5,
      }),
      ...ring('r3', {
        size: [80, 80],
        color: '#ff4b3a',
        width: 2,
        scale: [15, 90],
        start: 0.24,
        end: 0.566,
      }),
    ],
  },
  // An infected going down: a wide ichor spray and the body hitting the ground.
  infected_death: {
    width: 96,
    height: 96,
    duration: 0.6,
    layers: () => [
      ...blob('pool', {
        size: [30, 30],
        color: '#4a4a20',
        blur: 3,
        from: [48, 48],
        scale: [30, 100],
        opacity: [85, 75],
        end: 0.566,
        peak: 0.1,
      }),
      ...blob('dust', {
        size: [26, 26],
        color: '#6f695e',
        blur: 5,
        from: [48, 50],
        scale: [50, 150],
        opacity: [45, 35],
        end: 0.5,
      }),
      ...burst('spray', 96, {
        velocity: 11,
        resistance: 4,
        longevity: 0.42,
        type: 2,
        birthSize: 3,
        deathSize: 1.6,
        sizeVariation: 70,
        rate: 22,
        emit: 0.06,
        birth: '#7a8432',
        death: '#40421a',
        seed: 13,
      }),
    ],
  },
  // Flames over a burnt-out wreck, seen from above: a one-second loop, added on top of the map.
  wreck_fire: {
    width: 64,
    height: 64,
    duration: 1,
    loop: true,
    layers: () =>
      [0, 1, 2, 3, 4].flatMap((n) => [
        ...cycle(`outer${n}`, {
          period: 1,
          phase: n / 5,
          size: [22, 22],
          color: '#c2361a',
          turbulence: 40,
          blur: 3,
          from: [26 + n * 3, 44],
          to: [24 + n * 4, 18],
          sway: 3,
          scale: [100, 40],
          opacity: 85,
        }),
        ...cycle(`mid${n}`, {
          period: 1,
          phase: (n + 0.4) / 5,
          size: [15, 15],
          color: '#ff7a1e',
          blur: 2,
          turbulence: 30,
          from: [27 + n * 2.5, 44],
          to: [26 + n * 3, 24],
          sway: 2,
          scale: [100, 30],
          opacity: 95,
        }),
        ...cycle(`core${n}`, {
          period: 0.5,
          phase: (n + 0.7) / 5,
          size: [8, 8],
          color: '#ffe08a',
          blur: 1.5,
          from: [29 + n * 1.5, 44],
          to: [29 + n * 1.5, 32],
          sway: 1.5,
          scale: [100, 40],
          opacity: 100,
        }),
      ]),
  },
  // Smoke drifting off a wreck towards the upper right: slow, so 10 fps over three seconds is enough.
  wreck_smoke: {
    width: 96,
    height: 96,
    duration: 3,
    fps: 10,
    loop: true,
    // a thin plume: its densest pixel stays translucent
    minAlpha: 64,
    layers: () =>
      [0, 1, 2, 3, 4, 5].flatMap((n) =>
        cycle(`puff${n}`, {
          period: 3,
          phase: n / 6,
          size: [26, 26],
          color: n % 2 ? '#4f4842' : '#3d3732',
          blur: 6,
          from: [26, 76],
          to: [80, 14],
          sway: 4,
          scale: [35, 170],
          opacity: 75,
        }),
      ),
  },
  // The radio beacon calling the evacuation: a steady glow and a ring sent out every 1.2 s.
  beacon_pulse: {
    width: 48,
    height: 48,
    duration: 1.2,
    loop: true,
    layers: () => [
      {
        command: 'layer.newShape',
        params: {
          kind: 'ellipse',
          name: 'ring',
          size: [40, 40],
          fill: null,
          stroke: '#9fe870',
          strokeWidth: 3,
        },
      },
      fx('ring', 'Glow'),
      {
        command: 'prop.setExpression',
        params: {
          layer: 'ring',
          path: 'transform/scale',
          expression: 'var u = (time / 1.2) % 1; var k = 15 + 85 * u; [k, k, 100]',
        },
      },
      {
        command: 'prop.setExpression',
        params: {
          layer: 'ring',
          path: 'transform/opacity',
          expression: 'var u = (time / 1.2) % 1; 100 * (1 - u) * (1 - u)',
        },
      },
      {
        command: 'layer.newShape',
        params: { kind: 'ellipse', name: 'core', size: [8, 8], fill: '#d8ffb0' },
      },
      fx('core', 'Glow'),
      {
        command: 'prop.setExpression',
        params: {
          layer: 'core',
          path: 'transform/opacity',
          expression: '70 + 30 * Math.cos(2 * Math.PI * time / 1.2)',
        },
      },
    ],
  },
  // ---- interface animations, drawn at twice their on-screen size for sharp high-DPI screens

  // Horde warning beside the toast: rings closing in on a pulsing core, a one-second loop.
  horde_alert: {
    width: 64,
    height: 64,
    duration: 1,
    loop: true,
    layers: () => [
      ...[0, 1, 2].flatMap((n) => [
        {
          command: 'layer.newShape',
          params: {
            kind: 'ellipse',
            name: `ring${n}`,
            size: [56, 56],
            fill: null,
            stroke: '#ff4b3a',
            strokeWidth: 3,
          },
        },
        {
          command: 'prop.setExpression',
          params: {
            layer: `ring${n}`,
            path: 'transform/scale',
            expression: `var u = (time + ${n / 3}) % 1; var k = 100 - 70 * u; [k, k, 100]`,
          },
        },
        {
          command: 'prop.setExpression',
          params: {
            layer: `ring${n}`,
            path: 'transform/opacity',
            expression: `var u = (time + ${n / 3}) % 1; 100 * Math.sin(Math.PI * u)`,
          },
        },
      ]),
      {
        command: 'layer.newShape',
        params: { kind: 'ellipse', name: 'core', size: [14, 14], fill: '#ff4b3a' },
      },
      fx('core', 'Glow'),
      {
        command: 'prop.setExpression',
        params: {
          layer: 'core',
          path: 'transform/opacity',
          expression: '65 + 35 * Math.cos(2 * Math.PI * time * 2)',
        },
      },
    ],
  },
  // The night passing on the strategic map: the sun sets along an arc and the moon follows.
  day_turn: {
    width: 160,
    height: 96,
    duration: 1.2,
    fps: 20,
    layers: () => {
      const body = (name, color, size, start) => [
        {
          command: 'layer.newShape',
          params: { kind: 'ellipse', name, size: [size, size], fill: color },
        },
        fx(name, 'Glow'),
        {
          command: 'prop.setExpression',
          params: {
            layer: name,
            path: 'transform/position',
            expression: `var u = Math.min(1, Math.max(0, (time - ${start}) / 0.75)); var a = Math.PI * (1 - u); [80 + 58 * Math.cos(a), 80 - 58 * Math.sin(a), 0]`,
          },
        },
        {
          command: 'prop.setExpression',
          params: {
            layer: name,
            path: 'transform/opacity',
            expression: `var u = (time - ${start}) / 0.75; u <= 0 || u >= 1 ? 0 : 100 * Math.sin(Math.PI * u)`,
          },
        },
      ];
      return [
        {
          command: 'layer.newShape',
          params: {
            kind: 'rect',
            name: 'horizon',
            size: [140, 2],
            fill: '#9a9890',
            position: [80, 82],
          },
        },
        key('horizon', 'transform/opacity', 0, 0),
        key('horizon', 'transform/opacity', 0.15, 70),
        key('horizon', 'transform/opacity', 0.95, 70),
        key('horizon', 'transform/opacity', 1.15, 0),
        ...body('sun', '#ffb24a', 16, 0),
        ...body('moon', '#cfe0ff', 12, 0.4),
      ];
    },
  },
  // A convoy leaving the sector: three trucks with headlights running right, a 1.5 s loop.
  convoy: {
    width: 128,
    height: 48,
    duration: 1.5,
    fps: 20,
    loop: true,
    layers: () => [
      {
        command: 'layer.newShape',
        params: { kind: 'rect', name: 'road', size: [128, 2], fill: '#5a5c60', position: [64, 34] },
      },
      ...[0, 1, 2].flatMap((n) => [
        {
          command: 'layer.newShape',
          params: { kind: 'rect', name: `truck${n}`, size: [18, 10], fill: '#8fb05a' },
        },
        {
          command: 'prop.setExpression',
          params: {
            layer: `truck${n}`,
            path: 'transform/position',
            expression: `var u = (time / 1.5 + ${n / 3}) % 1; [-16 + 160 * u, 27, 0]`,
          },
        },
        {
          command: 'layer.newShape',
          params: { kind: 'ellipse', name: `light${n}`, size: [6, 6], fill: '#fff2b0' },
        },
        fx(`light${n}`, 'Glow'),
        {
          command: 'prop.setExpression',
          params: {
            layer: `light${n}`,
            path: 'transform/position',
            expression: `var u = (time / 1.5 + ${n / 3}) % 1; [-5 + 160 * u, 27, 0]`,
          },
        },
      ]),
    ],
  },
  // A sector falling on the strategic map: a red ring closes in and leaves a mark that stays.
  sector_lost: {
    width: 96,
    height: 96,
    duration: 0.8,
    hold: true,
    layers: () => [
      {
        command: 'layer.newShape',
        params: {
          kind: 'ellipse',
          name: 'ring',
          size: [80, 80],
          fill: null,
          stroke: '#e0563e',
          strokeWidth: 4,
        },
      },
      fx('ring', 'Glow'),
      key('ring', 'transform/scale', 0, [140, 140, 100]),
      key('ring', 'transform/scale', 0.5, [55, 55, 100]),
      key('ring', 'transform/scale', 0.766, [50, 50, 100]),
      key('ring', 'transform/opacity', 0, 0),
      key('ring', 'transform/opacity', 0.15, 100),
      {
        command: 'layer.newShape',
        params: { kind: 'ellipse', name: 'mark', size: [34, 34], fill: '#7a1810' },
      },
      key('mark', 'transform/scale', 0, [0, 0, 100]),
      key('mark', 'transform/scale', 0.45, [0, 0, 100]),
      key('mark', 'transform/scale', 0.6, [115, 115, 100]),
      key('mark', 'transform/scale', 0.766, [100, 100, 100]),
    ],
  },
  // ---- HUD animations (shown at 32 px)

  // An objective done: a green ring settles and a check mark pops in, then stays.
  objective_done: {
    width: 64,
    height: 64,
    duration: 0.6,
    hold: true,
    layers: () => [
      {
        command: 'layer.newShape',
        params: {
          kind: 'ellipse',
          name: 'ring',
          size: [52, 52],
          fill: null,
          stroke: '#7fbf6a',
          strokeWidth: 4,
        },
      },
      fx('ring', 'Glow'),
      key('ring', 'transform/scale', 0, [150, 150, 100]),
      key('ring', 'transform/scale', 0.25, [100, 100, 100]),
      key('ring', 'transform/opacity', 0, 0),
      key('ring', 'transform/opacity', 0.2, 100),
      ...[
        ['short', [12, 5], [26, 36], 45, 0.2],
        ['long', [26, 5], [37, 31], -50, 0.3],
      ].flatMap(([name, size, pos, angle, at]) => [
        {
          command: 'layer.newShape',
          params: { kind: 'rect', name, size, fill: '#d8ffb0', position: pos },
        },
        set(name, 'transform/rotation', angle),
        key(name, 'transform/scale', 0, [0, 0, 100]),
        key(name, 'transform/scale', at, [0, 0, 100]),
        key(name, 'transform/scale', at + 0.12, [120, 120, 100]),
        key(name, 'transform/scale', at + 0.2, [100, 100, 100]),
      ]),
    ],
  },
  // The person brought to safety: two figures meet inside a green ring that stays.
  rescue_done: {
    width: 64,
    height: 64,
    duration: 0.7,
    hold: true,
    layers: () => [
      {
        command: 'layer.newShape',
        params: {
          kind: 'ellipse',
          name: 'ring',
          size: [52, 52],
          fill: null,
          stroke: '#7fbf6a',
          strokeWidth: 4,
        },
      },
      fx('ring', 'Glow'),
      key('ring', 'transform/scale', 0, [60, 60, 100]),
      key('ring', 'transform/scale', 0.45, [100, 100, 100]),
      key('ring', 'transform/opacity', 0, 0),
      key('ring', 'transform/opacity', 0.3, 100),
      ...[
        ['guard', '#8fb3d9', [14, 32], [27, 32]],
        ['person', '#f0e6d6', [50, 32], [37, 32]],
      ].flatMap(([name, color, from, to]) => [
        {
          command: 'layer.newShape',
          params: { kind: 'ellipse', name, size: [11, 11], fill: color },
        },
        key(name, 'transform/position', 0, [...from, 0]),
        key(name, 'transform/position', 0.4, [...to, 0]),
        key(name, 'transform/opacity', 0, 0),
        key(name, 'transform/opacity', 0.1, 100),
      ]),
    ],
  },
  // A bite: two rows of teeth snap shut and leave a red mark that stays.
  bite: {
    width: 64,
    height: 64,
    duration: 0.6,
    hold: true,
    layers: () => [
      {
        command: 'layer.newShape',
        params: { kind: 'ellipse', name: 'wound', size: [30, 20], fill: '#8a1410' },
      },
      fx('wound', 'Gaussian Blur'),
      set('wound', 'effects/#1/blurriness', 2),
      key('wound', 'transform/position', 0, [32, 32, 0]),
      key('wound', 'transform/scale', 0, [0, 0, 100]),
      key('wound', 'transform/scale', 0.2, [0, 0, 100]),
      key('wound', 'transform/scale', 0.35, [110, 110, 100]),
      key('wound', 'transform/scale', 0.5, [100, 100, 100]),
      ...[-2, -1, 0, 1, 2].flatMap((n) =>
        [
          ['up', 14, 27],
          ['down', 50, 37],
        ].flatMap(([row, from, to]) => {
          const name = `${row}${n + 2}`;
          const x = 32 + n * 7;
          return [
            {
              command: 'layer.newShape',
              params: { kind: 'ellipse', name, size: [5, 7], fill: '#f0e6d6' },
            },
            key(name, 'transform/position', 0, [x, from, 0]),
            key(name, 'transform/position', 0.2, [x, to, 0]),
            key(name, 'transform/opacity', 0, 100),
            key(name, 'transform/opacity', 0.25, 100),
            key(name, 'transform/opacity', 0.45, 0),
          ];
        }),
      ),
    ],
  },
  // A survivor in panic, on their unit card: a jagged red burst that never settles (0.8 s loop).
  panic_pulse: {
    width: 64,
    height: 64,
    duration: 0.8,
    loop: true,
    layers: () => [
      {
        command: 'layer.newShape',
        params: { kind: 'star', name: 'burst', size: [44, 44], fill: '#ff4b3a' },
      },
      set('burst', 'contents/group/contents/star/points', 9),
      set('burst', 'contents/group/contents/star/innerRadius', 11),
      set('burst', 'contents/group/contents/star/outerRadius', 21),
      fx('burst', 'Glow'),
      {
        command: 'prop.setExpression',
        params: {
          layer: 'burst',
          path: 'transform/scale',
          expression: 'var k = 80 + 20 * Math.sin(2 * Math.PI * time / 0.4); [k, k, 100]',
        },
      },
      {
        command: 'prop.setExpression',
        params: {
          layer: 'burst',
          path: 'transform/rotation',
          expression: '12 * Math.sin(2 * Math.PI * time / 0.8)',
        },
      },
      {
        command: 'layer.newShape',
        params: { kind: 'ellipse', name: 'eye', size: [10, 10], fill: '#fff2e8' },
      },
      {
        command: 'prop.setExpression',
        params: {
          layer: 'eye',
          path: 'transform/opacity',
          expression: '70 + 30 * Math.cos(2 * Math.PI * time / 0.4)',
        },
      },
    ],
  },
};
