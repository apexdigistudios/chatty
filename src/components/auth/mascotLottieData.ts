/**
 * Lightweight, 60fps Skeletal Lottie Vector Animations for Let's Gist Mascot ("Kofi").
 *
 * Engineered as pure Bodymovin v5.7 JSON data objects for `LottieLight` (`lottie-react`),
 * eliminating external network fetches on low-data Ghanaian networks & SM1 tablets.
 *
 * Canvas coordinate space: 180 x 180 (`fr: 60`).
 * Every parented layer uses identity-rest rigging (`anchor == restPosition`) so all
 * shapes share the same 180 x 180 coordinate grid while inheriting skeletal motion.
 */

type Vec2 = readonly [number, number];
type Rgba = readonly [number, number, number, number];

/* ───────────── Color Palette (0..1 floats) ───────────── */

function hex(color: string): Rgba {
  const clean = color.replace("#", "");
  const n = parseInt(clean, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3)), 1];
}

const C = {
  outline: hex("#18181B"),
  charcoal: hex("#27272A"),
  slate: hex("#3F3F46"),
  slateLight: hex("#52525B"),
  black: hex("#09090B"),
  white: hex("#FFFFFF"),
  cream: hex("#FFFBEB"),
  offWhite: hex("#FAFAFA"),
  skin: hex("#6B3E26"),
  skinDeep: hex("#5A331E"),
  skinHighlight: hex("#855035"),
  cheek: hex("#EC4899"),
  purple: hex("#8B5CF6"),
  purpleDeep: hex("#7C3AED"),
  purpleLight: hex("#A78BFA"),
  purpleWash: hex("#EDE9FE"),
  gold: hex("#FACC15"),
  amber: hex("#F59E0B"),
  emerald: hex("#10B981"),
} as const;

/* ───────────── Bodymovin Property Helpers ───────────── */

const val = <T,>(k: T) => ({ a: 0 as const, k });

/** 1D keyframed scalar (rotation `r`, opacity `o`, stroke width `w`). */
function kf1D(frames: ReadonlyArray<readonly [number, number]>) {
  return {
    a: 1 as const,
    k: frames.map((frame, idx) => {
      const next = frames[idx + 1];
      if (!next) return { t: frame[0], s: [frame[1]] };
      return {
        t: frame[0],
        s: [frame[1]],
        e: [next[1]],
        i: { x: [0.42], y: [1] },
        o: { x: [0.58], y: [0] },
      };
    }),
  };
}

/** 2D/3D spatial keyframed position (`p`). */
function kfPos(frames: ReadonlyArray<readonly [number, number, number]>) {
  return {
    a: 1 as const,
    k: frames.map((frame, idx) => {
      const next = frames[idx + 1];
      if (!next) return { t: frame[0], s: [frame[1], frame[2], 0] };
      return {
        t: frame[0],
        s: [frame[1], frame[2], 0],
        e: [next[1], next[2], 0],
        i: { x: 0.42, y: 1 },
        o: { x: 0.58, y: 0 },
        ti: [0, 0, 0],
        to: [0, 0, 0],
      };
    }),
  };
}

/** 3D keyframed scale (`s`: `[sx, sy, 100]`). */
function kfScale(frames: ReadonlyArray<readonly [number, number, number]>) {
  return {
    a: 1 as const,
    k: frames.map((frame, idx) => {
      const next = frames[idx + 1];
      if (!next) return { t: frame[0], s: [frame[1], frame[2], 100] };
      return {
        t: frame[0],
        s: [frame[1], frame[2], 100],
        e: [next[1], next[2], 100],
        i: { x: [0.42, 0.42, 0.42], y: [1, 1, 1] },
        o: { x: [0.58, 0.58, 0.58], y: [0, 0, 0] },
      };
    }),
  };
}

/* ───────────── Shape Primitives ───────────── */

const el = (nm: string, cx: number, cy: number, w: number, h: number) => ({
  ty: "el" as const,
  nm,
  d: 1,
  p: val([cx, cy]),
  s: val([w, h]),
});

const rc = (nm: string, cx: number, cy: number, w: number, h: number, r = 0) => ({
  ty: "rc" as const,
  nm,
  d: 1,
  p: val([cx, cy]),
  s: val([w, h]),
  r: val(r),
});

const poly = (nm: string, pts: ReadonlyArray<Vec2>, closed = true) => ({
  ty: "sh" as const,
  nm,
  d: 1,
  ks: val({
    c: closed,
    v: pts.map((p) => [p[0], p[1]]),
    i: pts.map(() => [0, 0]),
    o: pts.map(() => [0, 0]),
  }),
});

const bezier = (
  nm: string,
  v: ReadonlyArray<Vec2>,
  i: ReadonlyArray<Vec2>,
  o: ReadonlyArray<Vec2>,
  closed = false
) => ({
  ty: "sh" as const,
  nm,
  d: 1,
  ks: val({
    c: closed,
    v: v.map((p) => [p[0], p[1]]),
    i: i.map((p) => [p[0], p[1]]),
    o: o.map((p) => [p[0], p[1]]),
  }),
});

const defaultGroupTr = () => ({
  ty: "tr" as const,
  p: val([0, 0]),
  a: val([0, 0]),
  s: val([100, 100]),
  r: val(0),
  o: val(100),
  sk: val(0),
  sa: val(0),
});

interface StyleOpts {
  fill?: Rgba;
  fillOpacity?: number;
  stroke?: Rgba;
  strokeWidth?: number;
  strokeOpacity?: number;
}

/**
 * Builds a Lottie shape group `"gr"`.
 * Note: `lottie-web` iterates `it` backwards and appends to SVG `<g>`, so
 * placing `stroke` at a lower index than `fill` paints crisp dark outlines ON TOP of fills.
 */
function grp(nm: string, shapes: unknown[], opts: StyleOpts) {
  const it: unknown[] = [...shapes];
  if (opts.stroke) {
    it.push({
      ty: "st",
      nm: `${nm}-st`,
      c: val(opts.stroke),
      o: val(opts.strokeOpacity ?? 100),
      w: val(opts.strokeWidth ?? 3.6),
      lc: 2,
      lj: 2,
      ml: 4,
    });
  }
  if (opts.fill) {
    it.push({
      ty: "fl",
      nm: `${nm}-fl`,
      c: val(opts.fill),
      o: val(opts.fillOpacity ?? 100),
      r: 1,
    });
  }
  it.push(defaultGroupTr());
  return { ty: "gr", nm, it };
}

interface LayerOpts {
  ind: number;
  nm: string;
  parent?: number;
  anchor: Vec2;
  pos?: ReturnType<typeof val> | ReturnType<typeof kfPos>;
  rot?: ReturnType<typeof val> | ReturnType<typeof kf1D>;
  scale?: ReturnType<typeof val> | ReturnType<typeof kfScale>;
  opacity?: ReturnType<typeof val> | ReturnType<typeof kf1D>;
  ip?: number;
  op?: number;
  shapes: unknown[];
}

function shapeLayer(opts: LayerOpts) {
  const [ax, ay] = opts.anchor;
  return {
    ddd: 0,
    ind: opts.ind,
    ty: 4,
    nm: opts.nm,
    ...(opts.parent !== undefined ? { parent: opts.parent } : {}),
    sr: 1,
    ks: {
      o: opts.opacity ?? val(100),
      r: opts.rot ?? val(0),
      p: opts.pos ?? val([ax, ay, 0]),
      a: val([ax, ay, 0]),
      s: opts.scale ?? val([100, 100, 100]),
    },
    ao: 0,
    shapes: opts.shapes,
    ip: opts.ip ?? 0,
    op: opts.op ?? 180,
    st: 0,
    bm: 0,
  };
}

/* ───────────── Shared Character Anatomy Shapes (180 x 180 grid) ───────────── */

function baseHeadShapes(includeHighTopHair: boolean, mouthMode: "smile" | "smirk" | "agent" | "grin") {
  // Remember: shapes[0] is painted ON TOP, shapes[last] AT THE BACK.
  const mouth =
    mouthMode === "grin"
      ? grp(
          "VictoryGrin",
          [
            bezier(
              "GrinShape",
              [
                [74, 91],
                [90, 104],
                [106, 91],
              ],
              [
                [0, 0],
                [-10, 0],
                [0, 0],
              ],
              [
                [0, 8],
                [10, 0],
                [0, 0],
              ],
              true
            ),
          ],
          { fill: C.white, stroke: C.outline, strokeWidth: 3.3 }
        )
      : mouthMode === "smirk"
        ? grp(
            "Smirk",
            [
              bezier(
                "SmirkCurve",
                [
                  [81, 95],
                  [99, 91],
                ],
                [
                  [0, 0],
                  [-5, 5],
                ],
                [
                  [6, 3],
                  [0, 0],
                ],
                false
              ),
            ],
            { stroke: C.outline, strokeWidth: 3.6 }
          )
        : mouthMode === "agent"
          ? grp("AgentMouth", [poly("FirmSmile", [[81, 95], [99, 94]], false)], {
              stroke: C.outline,
              strokeWidth: 3.6,
            })
          : grp(
              "FriendlySmile",
              [
                bezier(
                  "SmileArc",
                  [
                    [78, 92],
                    [90, 99],
                    [102, 92],
                  ],
                  [
                    [0, 0],
                    [-7, 0],
                    [0, 0],
                  ],
                  [
                    [3, 5],
                    [7, 0],
                    [0, 0],
                  ],
                  false
                ),
              ],
              { stroke: C.outline, strokeWidth: 3.8 }
            );

  const cheeks = grp(
    "Cheeks",
    [el("LeftCheek", 63, 85, 9, 5), el("RightCheek", 117, 85, 9, 5)],
    { fill: C.cheek, fillOpacity: 36 }
  );

  const hair = includeHighTopHair
    ? [
        grp(
          "HighTopHair",
          [
            bezier(
              "HairCrown",
              [
                [53, 64],
                [65, 31],
                [90, 28],
                [115, 31],
                [127, 64],
                [108, 54],
                [90, 52],
                [72, 54],
              ],
              [
                [0, 0],
                [-8, 6],
                [-14, 0],
                [-8, -5],
                [0, -14],
                [9, 3],
                [10, 0],
                [9, -3],
              ],
              [
                [0, -14],
                [8, -5],
                [14, 0],
                [8, 6],
                [-6, -5],
                [-9, -2],
                [-10, 0],
                [-9, 2],
              ],
              true
            ),
          ],
          { fill: C.outline, stroke: C.outline, strokeWidth: 3 }
        ),
      ]
    : [];

  const foreheadHighlight = grp(
    "ForeheadShine",
    [
      bezier(
        "Shine",
        [
          [69, 53],
          [90, 49],
          [111, 53],
        ],
        [
          [0, 0],
          [-10, 0],
          [0, 0],
        ],
        [
          [7, -3],
          [10, 0],
          [0, 0],
        ],
        false
      ),
    ],
    { stroke: C.skinHighlight, strokeWidth: 3.4, strokeOpacity: 65 }
  );

  const face = grp("HeadFace", [rc("FaceBox", 90, 74, 74, 70, 34)], {
    fill: C.skin,
    stroke: C.outline,
    strokeWidth: 4,
  });

  const ears = grp(
    "Ears",
    [el("LeftEar", 50, 76, 18, 18), el("RightEar", 130, 76, 18, 18)],
    { fill: C.skin, stroke: C.outline, strokeWidth: 3.6 }
  );

  const neck = grp("Neck", [rc("NeckCol", 90, 110, 22, 20, 8)], {
    fill: C.skinDeep,
  });

  return [...hair, mouth, cheeks, foreheadHighlight, face, ears, neck];
}

function shsUniformTorsoShapes() {
  return [
    // Breast pocket crest
    grp("PocketDot", [el("Dot", 112, 146, 6.5, 6.5)], { fill: C.purple }),
    grp("Pocket", [rc("PocketBox", 112, 147, 15, 16, 4)], {
      fill: C.purpleWash,
      stroke: C.outline,
      strokeWidth: 2.6,
    }),
    // Gold tie stripe + purple tie
    grp("TieStripe", [poly("GoldBar", [[86, 146], [94, 146]], false)], {
      stroke: C.gold,
      strokeWidth: 3.2,
    }),
    grp(
      "SchoolTie",
      [poly("TiePoly", [[90, 128], [97, 137], [94, 162], [86, 162], [83, 137]], true)],
      { fill: C.purpleDeep, stroke: C.outline, strokeWidth: 3 }
    ),
    // Crisp White Collars
    grp(
      "LeftCollar",
      [poly("LCol", [[74, 115], [90, 131], [80, 138], [67, 121]], true)],
      { fill: C.white, stroke: C.outline, strokeWidth: 3.2 }
    ),
    grp(
      "RightCollar",
      [poly("RCol", [[106, 115], [90, 131], [100, 138], [113, 121]], true)],
      { fill: C.white, stroke: C.outline, strokeWidth: 3.2 }
    ),
    // Purple Epaulettes
    grp(
      "Epaulettes",
      [
        poly("LEp", [[55, 124], [70, 117], [72, 123], [57, 130]], true),
        poly("REp", [[125, 124], [110, 117], [108, 123], [123, 130]], true),
      ],
      { fill: C.purple, stroke: C.outline, strokeWidth: 2.5 }
    ),
    // Cream SHS Shirt Body
    grp(
      "ShirtTorso",
      [
        bezier(
          "ShirtBody",
          [
            [42, 162],
            [52, 122],
            [90, 115],
            [128, 122],
            [138, 162],
          ],
          [
            [0, 0],
            [-6, 10],
            [-20, 0],
            [-14, -5],
            [0, -14],
          ],
          [
            [0, -14],
            [14, -5],
            [20, 0],
            [6, 10],
            [0, 0],
          ],
          true
        ),
      ],
      { fill: C.cream, stroke: C.outline, strokeWidth: 4 }
    ),
  ];
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. SHS UNIFORM WELCOME / LOGIN STATE (60fps, 180 frames = 3.0s loop)
   Moving, waving arm, idle floating breath, natural blinking & pupil glance.
   ═══════════════════════════════════════════════════════════════════════════ */

function buildShsWelcomeLottie() {
  const OP = 180;
  return {
    v: "5.7.4",
    fr: 60,
    ip: 0,
    op: OP,
    w: 180,
    h: 180,
    nm: "Kofi_SHS_Welcome",
    ddd: 0,
    assets: [],
    layers: [
      // Animated Purple Wave Arcs beside waving hand
      shapeLayer({
        ind: 5,
        nm: "WaveArcs",
        parent: 10,
        anchor: [158, 92],
        opacity: kf1D([
          [0, 20],
          [22, 100],
          [45, 25],
          [68, 100],
          [92, 20],
          [135, 75],
          [180, 20],
        ]),
        scale: kfScale([
          [0, 92, 92],
          [22, 108, 108],
          [45, 95, 95],
          [68, 108, 108],
          [92, 92, 92],
          [180, 92, 92],
        ]),
        shapes: [
          grp(
            "Arc1",
            [
              bezier(
                "InnerWave",
                [
                  [155, 82],
                  [161, 95],
                ],
                [
                  [0, 0],
                  [2, -5],
                ],
                [
                  [5, 3],
                  [0, 0],
                ],
                false
              ),
              bezier(
                "OuterWave",
                [
                  [162, 77],
                  [169, 96],
                ],
                [
                  [0, 0],
                  [3, -7],
                ],
                [
                  [7, 4],
                  [0, 0],
                ],
                false
              ),
            ],
            { stroke: C.purple, strokeWidth: 3.2 }
          ),
        ],
      }),

      // Articulated Waving Right Arm & Hand (pivots at shoulder 124,126)
      shapeLayer({
        ind: 30,
        nm: "WavingArm",
        parent: 10,
        anchor: [124, 126],
        rot: kf1D([
          [0, -10],
          [22, 20],
          [45, -14],
          [68, 22],
          [92, -10],
          [136, 8],
          [180, -10],
        ]),
        shapes: [
          grp("Palm", [el("HandBall", 147, 101, 22, 22)], {
            fill: C.skin,
            stroke: C.outline,
            strokeWidth: 3.6,
          }),
          grp("Thumb", [el("ThumbNub", 138, 97, 9, 11)], {
            fill: C.skin,
            stroke: C.outline,
            strokeWidth: 3,
          }),
          grp(
            "SleeveCuff",
            [poly("Sleeve", [[120, 129], [136, 110], [144, 118], [128, 136]], true)],
            { fill: C.cream, stroke: C.outline, strokeWidth: 3.5 }
          ),
        ],
      }),

      // Blinking Eyes & Friendly Glance (parented to Head 20, anchor at eye-line 90,75)
      shapeLayer({
        ind: 21,
        nm: "EyesBlink",
        parent: 20,
        anchor: [90, 75],
        pos: kfPos([
          [0, 90, 75],
          [60, 92, 75],
          [110, 89, 75],
          [155, 90, 75],
          [180, 90, 75],
        ]),
        scale: kfScale([
          [0, 100, 100],
          [44, 100, 100],
          [48, 108, 10],
          [53, 100, 100],
          [126, 100, 100],
          [130, 108, 10],
          [135, 100, 100],
          [180, 100, 100],
        ]),
        shapes: [
          grp(
            "EyeSparkles",
            [el("LGlint", 75, 72.5, 4.6, 4.6), el("RGlint", 109, 72.5, 4.6, 4.6)],
            { fill: C.white }
          ),
          grp(
            "Pupils",
            [el("LEye", 73, 75, 13, 13), el("REye", 107, 75, 13, 13)],
            { fill: C.outline }
          ),
        ],
      }),

      // Expressive Eyebrows (gently lift during wave)
      shapeLayer({
        ind: 22,
        nm: "Eyebrows",
        parent: 20,
        anchor: [90, 62],
        pos: kfPos([
          [0, 90, 62],
          [35, 90, 59.5],
          [90, 90, 62],
          [140, 90, 60.5],
          [180, 90, 62],
        ]),
        shapes: [
          grp(
            "Brows",
            [
              bezier("LBrow", [[65, 63], [79, 62]], [[0, 0], [-4, -3]], [[4, -3], [0, 0]], false),
              bezier("RBrow", [[101, 62], [115, 63]], [[0, 0], [-4, -3]], [[4, -3], [0, 0]], false),
            ],
            { stroke: C.outline, strokeWidth: 3.5 }
          ),
        ],
      }),

      // Head Rig (pivots at neck 90,108, secondary overlap tilt)
      shapeLayer({
        ind: 20,
        nm: "HeadRig",
        parent: 10,
        anchor: [90, 108],
        rot: kf1D([
          [0, -2],
          [45, 3.5],
          [90, -1.5],
          [135, 2.5],
          [180, -2],
        ]),
        shapes: baseHeadShapes(true, "smile"),
      }),

      // Body / Torso Rig (idle floating breath)
      shapeLayer({
        ind: 10,
        nm: "BodyRig",
        anchor: [90, 138],
        pos: kfPos([
          [0, 90, 139],
          [45, 90, 134],
          [90, 90, 139],
          [135, 90, 134.5],
          [180, 90, 139],
        ]),
        rot: kf1D([
          [0, -1],
          [90, 1.2],
          [180, -1],
        ]),
        shapes: shsUniformTorsoShapes(),
      }),

      // Ambient Floating Campus Sparkles (background)
      shapeLayer({
        ind: 90,
        nm: "AmbientSparkles",
        anchor: [90, 90],
        rot: kf1D([
          [0, -4],
          [90, 4],
          [180, -4],
        ]),
        scale: kfScale([
          [0, 96, 96],
          [90, 104, 104],
          [180, 96, 96],
        ]),
        shapes: [
          grp("LeftStar", [el("S1", 28, 56, 7, 7)], { fill: C.purpleLight }),
          grp("RightGoldStar", [el("S2", 152, 46, 6, 6)], { fill: C.amber }),
          grp("LowDot", [el("S3", 25, 116, 5, 5)], { fill: C.amber }),
        ],
      }),
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. DETECTIVE UNDERCOVER STATE (60fps, 180 frames = 3.0s loop)
   Hand adjusts/dips sunglasses, eyes perform secretive side-glance + blink,
   magnifying glass sweeps curiously for clues.
   ═══════════════════════════════════════════════════════════════════════════ */

function buildDetectiveLottie() {
  const OP = 180;
  return {
    v: "5.7.4",
    fr: 60,
    ip: 0,
    op: OP,
    w: 180,
    h: 180,
    nm: "Kofi_Detective_Undercover",
    ddd: 0,
    assets: [],
    layers: [
      // Right Hand + Sweeping Magnifying Glass Clue Prop
      shapeLayer({
        ind: 35,
        nm: "MagnifyingGlassArm",
        parent: 10,
        anchor: [122, 134],
        rot: kf1D([
          [0, -8],
          [55, 12],
          [115, -11],
          [150, 6],
          [180, -8],
        ]),
        pos: kfPos([
          [0, 122, 134],
          [60, 124, 131],
          [120, 120, 135],
          [180, 122, 134],
        ]),
        shapes: [
          // Hand holding handle
          grp("DetectiveHand", [el("RHand", 141, 127, 17, 17)], {
            fill: C.skin,
            stroke: C.outline,
            strokeWidth: 3.3,
          }),
          // Lens glass shine
          grp("LensGlint", [poly("ShineBar", [[117, 95], [126, 91]], false)], {
            stroke: C.white,
            strokeWidth: 3.2,
          }),
          // Magnifier rim & translucent purple lens
          grp("MagnifierLens", [el("GlassCircle", 125, 100, 32, 32)], {
            fill: C.purpleWash,
            fillOpacity: 78,
            stroke: C.purple,
            strokeWidth: 5,
          }),
          grp("MagnifierOuter", [el("OuterRing", 125, 100, 34, 34)], {
            stroke: C.outline,
            strokeWidth: 2.5,
          }),
          // Handle
          grp("MagnifierHandle", [poly("Handle", [[134, 113], [148, 133]], false)], {
            stroke: C.outline,
            strokeWidth: 6.5,
          }),
        ],
      }),

      // Left Hand Reaching Up to Adjust Sunglasses Rim (t=28..112)
      shapeLayer({
        ind: 32,
        nm: "ShadesAdjustHand",
        parent: 20,
        anchor: [46, 122],
        pos: kfPos([
          [0, 46, 126],
          [24, 46, 126],
          [46, 51, 84],
          [94, 51, 84],
          [118, 46, 126],
          [180, 46, 126],
        ]),
        rot: kf1D([
          [0, -14],
          [46, 8],
          [94, 5],
          [118, -14],
          [180, -14],
        ]),
        shapes: [
          grp("AdjustHand", [el("LHand", 48, 80, 16, 16)], {
            fill: C.skin,
            stroke: C.outline,
            strokeWidth: 3.3,
          }),
          grp(
            "TrenchSleeve",
            [poly("LSleeve", [[36, 106], [45, 84], [55, 88], [47, 110]], true)],
            { fill: C.slate, stroke: C.outline, strokeWidth: 3.3 }
          ),
        ],
      }),

      // Sleek Dark Sunglasses (dip down at t=42..98 so eyes peek over with side-glance!)
      shapeLayer({
        ind: 25,
        nm: "AgentSunglasses",
        parent: 20,
        anchor: [90, 76],
        pos: kfPos([
          [0, 90, 75],
          [28, 90, 75],
          [46, 90, 83.5],
          [94, 90, 83.5],
          [112, 90, 75],
          [180, 90, 75],
        ]),
        rot: kf1D([
          [0, 0],
          [28, 0],
          [46, -2.5],
          [94, -2.5],
          [112, 0],
          [180, 0],
        ]),
        shapes: [
          grp(
            "ShadesGlint",
            [
              poly("GlintL", [[63, 71], [70, 79]], false),
              poly("GlintR", [[99, 71], [106, 79]], false),
            ],
            { stroke: C.purpleLight, strokeWidth: 2.5 }
          ),
          grp(
            "ShadesFrame",
            [
              rc("LeftLens", 70, 76, 28, 17, 6),
              rc("RightLens", 110, 76, 28, 17, 6),
              poly("Bridge", [[84, 74], [96, 74]], false),
              poly("LArm", [[53, 73], [56, 73]], false),
              poly("RArm", [[124, 73], [127, 73]], false),
            ],
            { fill: C.black, stroke: C.outline, strokeWidth: 3.2 }
          ),
        ],
      }),

      // Secretive Side-Glance Eyes (revealed when sunglasses dip!)
      shapeLayer({
        ind: 21,
        nm: "SecretiveEyes",
        parent: 20,
        anchor: [90, 73],
        pos: kfPos([
          [0, 90, 73],
          [45, 90, 73],
          [58, 84.5, 72.5],
          [76, 96, 72.5],
          [92, 90, 73],
          [180, 90, 73],
        ]),
        scale: kfScale([
          [0, 100, 100],
          [136, 100, 100],
          [140, 106, 10],
          [145, 100, 100],
          [180, 100, 100],
        ]),
        shapes: [
          grp(
            "PeekGlints",
            [el("LG", 74, 71, 3.8, 3.8), el("RG", 108, 71, 3.8, 3.8)],
            { fill: C.white }
          ),
          grp(
            "PeekPupils",
            [el("LP", 72, 73, 11, 11), el("RP", 106, 73, 11, 11)],
            { fill: C.outline }
          ),
        ],
      }),

      // Curious Stealth Eyebrows + Fedora Hat + Head
      shapeLayer({
        ind: 20,
        nm: "DetectiveHead",
        parent: 10,
        anchor: [90, 108],
        rot: kf1D([
          [0, -1.5],
          [55, -3.5],
          [95, 2.5],
          [145, 0],
          [180, -1.5],
        ]),
        shapes: [
          // Fedora Hat with Signature Purple Ribbon (top-most on head)
          grp("FedoraRibbon", [poly("Ribbon", [[61, 43], [119, 43]], false)], {
            stroke: C.purple,
            strokeWidth: 5.8,
          }),
          grp(
            "FedoraCrown",
            [poly("Crown", [[60, 47], [65, 22], [90, 19], [115, 22], [120, 47]], true)],
            { fill: C.slate, stroke: C.outline, strokeWidth: 3.6 }
          ),
          grp("FedoraBrim", [el("Brim", 90, 48, 94, 18)], {
            fill: C.charcoal,
            stroke: C.outline,
            strokeWidth: 3.6,
          }),
          // Curious Brows
          grp(
            "StealthBrows",
            [
              poly("LBrow", [[63, 62], [79, 60]], false),
              poly("RBrow", [[101, 59], [117, 62]], false),
            ],
            { stroke: C.outline, strokeWidth: 3.6 }
          ),
          ...baseHeadShapes(false, "smirk"),
        ],
      }),

      // Detective Trench Coat Torso
      shapeLayer({
        ind: 10,
        nm: "TrenchBody",
        anchor: [90, 138],
        pos: kfPos([
          [0, 90, 139],
          [60, 90, 135.5],
          [120, 90, 138.5],
          [180, 90, 139],
        ]),
        shapes: [
          grp("TrenchButtons", [el("B1", 80, 154, 5.4, 5.4), el("B2", 100, 154, 5.4, 5.4)], {
            fill: C.gold,
          }),
          grp(
            "LeftLapel",
            [poly("LLap", [[62, 114], [88, 143], [73, 150], [53, 125]], true)],
            { fill: C.slateLight, stroke: C.outline, strokeWidth: 3.4 }
          ),
          grp(
            "RightLapel",
            [poly("RLap", [[118, 114], [92, 143], [107, 150], [127, 125]], true)],
            { fill: C.slateLight, stroke: C.outline, strokeWidth: 3.4 }
          ),
          grp("UndercoverTie", [poly("UTie", [[90, 123], [95, 142], [85, 142]], true)], {
            fill: C.purpleDeep,
          }),
          grp("UndercoverShirt", [poly("UShirt", [[77, 115], [103, 115], [90, 144]], true)], {
            fill: C.purpleWash,
          }),
          grp(
            "TrenchTorso",
            [
              bezier(
                "Coat",
                [
                  [39, 163],
                  [50, 121],
                  [90, 114],
                  [130, 121],
                  [141, 163],
                ],
                [
                  [0, 0],
                  [-6, 10],
                  [-20, 0],
                  [-14, -5],
                  [0, -14],
                ],
                [
                  [0, -14],
                  [14, -5],
                  [20, 0],
                  [6, 10],
                  [0, 0],
                ],
                true
              ),
            ],
            { fill: C.slate, stroke: C.outline, strokeWidth: 4 }
          ),
        ],
      }),
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. FBI / CAMPUS SECURITY STATE (60fps, 180 frames = 3.0s loop)
   Tactical FBI jacket + coiled earpiece, sunglasses adjustment + lens glint,
   secretive side-glance, and glowing FBI shield badge with clicking padlock!
   ═══════════════════════════════════════════════════════════════════════════ */

function buildFbiSecurityLottie() {
  const OP = 180;
  return {
    v: "5.7.4",
    fr: 60,
    ip: 0,
    op: OP,
    w: 180,
    h: 180,
    nm: "Kofi_FBI_Security",
    ddd: 0,
    assets: [],
    layers: [
      // Right Hand Holding FBI Shield Badge + Animated Clicking Padlock
      shapeLayer({
        ind: 36,
        nm: "SecurityBadgeProp",
        parent: 10,
        anchor: [139, 108],
        pos: kfPos([
          [0, 139, 110],
          [45, 139, 103],
          [90, 139, 108],
          [135, 139, 103],
          [180, 139, 110],
        ]),
        rot: kf1D([
          [0, -3],
          [45, 4],
          [90, -2],
          [135, 3],
          [180, -3],
        ]),
        shapes: [
          grp("BadgeHand", [el("RHand", 124, 125, 16, 16)], {
            fill: C.skin,
            stroke: C.outline,
            strokeWidth: 3.2,
          }),
          // Padlock inside shield
          grp("PadlockBody", [rc("LockBox", 139, 108, 13, 11, 2.5)], {
            fill: C.gold,
            stroke: C.outline,
            strokeWidth: 2.2,
          }),
          grp(
            "PadlockShackle",
            [
              bezier(
                "Shackle",
                [
                  [135, 103],
                  [139, 97],
                  [143, 103],
                ],
                [
                  [0, 0],
                  [-3, 0],
                  [0, -3],
                ],
                [
                  [0, -3],
                  [3, 0],
                  [0, 0],
                ],
                false
              ),
            ],
            { stroke: C.offWhite, strokeWidth: 2.6 }
          ),
          // Purple Shield Badge
          grp(
            "ShieldPlate",
            [
              poly(
                "Shield",
                [
                  [139, 86],
                  [156, 92],
                  [155, 110],
                  [139, 127],
                  [123, 110],
                  [122, 92],
                ],
                true
              ),
            ],
            { fill: C.purple, stroke: C.outline, strokeWidth: 3.5 }
          ),
        ],
      }),

      // Animated Security Pulse Ring behind FBI Shield
      shapeLayer({
        ind: 37,
        nm: "BadgePulseRing",
        parent: 10,
        anchor: [139, 106],
        scale: kfScale([
          [0, 88, 88],
          [60, 126, 126],
          [120, 88, 88],
          [180, 126, 126],
        ]),
        opacity: kf1D([
          [0, 75],
          [60, 0],
          [61, 75],
          [120, 0],
          [121, 75],
          [180, 0],
        ]),
        shapes: [
          grp("PulseCircle", [el("Ring", 139, 106, 36, 36)], {
            stroke: C.purpleLight,
            strokeWidth: 2.5,
          }),
        ],
      }),

      // Tactical Sunglasses (slight undercover dip + lens sweep)
      shapeLayer({
        ind: 25,
        nm: "FbiShades",
        parent: 20,
        anchor: [90, 75],
        pos: kfPos([
          [0, 90, 74],
          [50, 90, 74],
          [68, 90, 80.5],
          [110, 90, 80.5],
          [128, 90, 74],
          [180, 90, 74],
        ]),
        shapes: [
          grp(
            "ScannerGlint",
            [
              poly("GL", [[62, 70], [70, 78]], false),
              poly("GR", [[98, 70], [106, 78]], false),
            ],
            { stroke: C.purpleLight, strokeWidth: 2.6 }
          ),
          grp(
            "TacticalFrames",
            [
              rc("LLens", 70, 75, 29, 17, 5),
              rc("RLens", 110, 75, 29, 17, 5),
              poly("MidBridge", [[84, 73], [96, 73]], false),
            ],
            { fill: C.black, stroke: C.outline, strokeWidth: 3.2 }
          ),
        ],
      }),

      // Perimeter Side-Glance Eyes behind shades
      shapeLayer({
        ind: 21,
        nm: "PerimeterEyes",
        parent: 20,
        anchor: [90, 73],
        pos: kfPos([
          [0, 90, 73],
          [65, 95, 72.5],
          [90, 85, 72.5],
          [115, 90, 73],
          [180, 90, 73],
        ]),
        shapes: [
          grp("Pupils", [el("LE", 72, 73, 10, 10), el("RE", 106, 73, 10, 10)], {
            fill: C.outline,
          }),
        ],
      }),

      // Head + Coiled Security Earpiece
      shapeLayer({
        ind: 20,
        nm: "FbiHead",
        parent: 10,
        anchor: [90, 108],
        rot: kf1D([
          [0, 0],
          [60, -2.5],
          [120, 2.2],
          [180, 0],
        ]),
        shapes: [
          grp(
            "EarpieceCoil",
            [
              bezier(
                "Wire",
                [
                  [51, 83],
                  [45, 99],
                  [53, 114],
                  [56, 127],
                ],
                [
                  [0, 0],
                  [0, -6],
                  [-5, -5],
                  [-3, -4],
                ],
                [
                  [-5, 5],
                  [0, 6],
                  [4, 4],
                  [0, 0],
                ],
                false
              ),
            ],
            { stroke: C.purpleLight, strokeWidth: 2.6 }
          ),
          grp(
            "FocusedBrows",
            [
              poly("LB", [[63, 62], [79, 64]], false),
              poly("RB", [[117, 62], [101, 64]], false),
            ],
            { stroke: C.outline, strokeWidth: 3.6 }
          ),
          ...baseHeadShapes(true, "agent"),
        ],
      }),

      // FBI Tactical Jacket Torso
      shapeLayer({
        ind: 10,
        nm: "FbiBody",
        anchor: [90, 138],
        pos: kfPos([
          [0, 90, 138.5],
          [45, 90, 134.5],
          [90, 90, 138.5],
          [135, 90, 135],
          [180, 90, 138.5],
        ]),
        shapes: [
          grp("AgentIdLine", [poly("TagText", [[103, 141], [117, 141]], false)], {
            stroke: C.offWhite,
            strokeWidth: 2.4,
          }),
          grp("AgentIdBadge", [rc("IdPatch", 110, 141, 22, 11, 3)], {
            fill: C.purple,
            stroke: C.offWhite,
            strokeWidth: 1.6,
          }),
          grp(
            "VestStraps",
            [
              poly("LStrap", [[65, 120], [65, 162]], false),
              poly("RStrap", [[115, 120], [115, 162]], false),
            ],
            { stroke: C.slate, strokeWidth: 4 }
          ),
          grp("AgentTie", [poly("ATie", [[90, 122], [94, 140], [86, 140]], true)], {
            fill: C.purple,
          }),
          grp("AgentShirt", [poly("AShirt", [[77, 115], [103, 115], [90, 138]], true)], {
            fill: C.offWhite,
          }),
          grp(
            "TacticalTorso",
            [
              bezier(
                "Jacket",
                [
                  [39, 163],
                  [50, 121],
                  [90, 114],
                  [130, 121],
                  [141, 163],
                ],
                [
                  [0, 0],
                  [-6, 10],
                  [-20, 0],
                  [-14, -5],
                  [0, -14],
                ],
                [
                  [0, -14],
                  [14, -5],
                  [20, 0],
                  [6, 10],
                  [0, 0],
                ],
                true
              ),
            ],
            { fill: C.outline, stroke: C.black, strokeWidth: 4 }
          ),
        ],
      }),
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. SUCCESS / CELEBRATION STATE (60fps, 150 frames = 2.5s energetic loop)
   Confetti victory dance pose, pumping arms, SHS uniform + graduation cap
   with swinging golden tassel, joyful blinking & beaming grin!
   ═══════════════════════════════════════════════════════════════════════════ */

function confettiLayer(
  ind: number,
  color: Rgba,
  startX: number,
  endX: number,
  peakY: number,
  endY: number,
  delayOffset: number
) {
  const OP = 150;
  const t0 = delayOffset;
  const tMid = Math.min(OP - 15, delayOffset + 55);
  const tEnd = Math.min(OP, delayOffset + 115);
  return shapeLayer({
    ind,
    nm: `Confetti_${ind}`,
    anchor: [startX, 95],
    pos: kfPos([
      [0, startX, 95],
      ...(t0 > 0 ? ([[t0, startX, 95]] as const) : []),
      [tMid, (startX + endX) / 2, peakY],
      [tEnd, endX, endY],
      ...(tEnd < OP ? ([[OP, endX, endY]] as const) : []),
    ]),
    rot: kf1D([
      [0, 0],
      [OP, ind % 2 === 0 ? 320 : -320],
    ]),
    opacity: kf1D([
      [0, t0 === 0 ? 100 : 0],
      ...(t0 > 0
        ? ([
            [Math.max(0, t0 - 1), 0],
            [t0 + 6, 100],
          ] as const)
        : []),
      [Math.max(t0 + 12, tEnd - 18), 100],
      [tEnd, 0],
      ...(tEnd < OP ? ([[OP, 0]] as const) : []),
    ]),
    op: OP,
    shapes: [
      grp("Ribbon", [rc("Conf", startX, 95, 8, 12, 2.2)], {
        fill: color,
      }),
    ],
  });
}

function buildCelebrationLottie() {
  const OP = 150;
  return {
    v: "5.7.4",
    fr: 60,
    ip: 0,
    op: OP,
    w: 180,
    h: 180,
    nm: "Kofi_Victory_Celebration",
    ddd: 0,
    assets: [],
    layers: [
      // Foreground Confetti Ribbons
      confettiLayer(2, C.purple, 64, 22, 26, 78, 0),
      confettiLayer(3, C.amber, 116, 158, 24, 76, 8),
      confettiLayer(4, C.emerald, 72, 34, 16, 56, 22),
      confettiLayer(5, C.cheek, 108, 148, 18, 58, 15),
      confettiLayer(6, C.gold, 84, 48, 12, 42, 32),
      confettiLayer(7, C.purpleLight, 96, 134, 14, 46, 26),

      // Pumping Left Victory Arm
      shapeLayer({
        ind: 31,
        nm: "LeftVictoryArm",
        parent: 10,
        anchor: [56, 126],
        op: OP,
        rot: kf1D([
          [0, 14],
          [19, -24],
          [38, 12],
          [56, -26],
          [75, 14],
          [94, -24],
          [112, 12],
          [131, -25],
          [150, 14],
        ]),
        shapes: [
          grp("LFist", [el("LHand", 32, 95, 20, 20)], {
            fill: C.skin,
            stroke: C.outline,
            strokeWidth: 3.5,
          }),
          grp(
            "LSleeve",
            [poly("LS", [[58, 129], [42, 106], [34, 114], [50, 135]], true)],
            { fill: C.cream, stroke: C.outline, strokeWidth: 3.4 }
          ),
        ],
      }),

      // Pumping Right Victory Arm
      shapeLayer({
        ind: 32,
        nm: "RightVictoryArm",
        parent: 10,
        anchor: [124, 126],
        op: OP,
        rot: kf1D([
          [0, -14],
          [19, 24],
          [38, -12],
          [56, 26],
          [75, -14],
          [94, 24],
          [112, -12],
          [131, 25],
          [150, -14],
        ]),
        shapes: [
          grp("RFist", [el("RHand", 148, 95, 20, 20)], {
            fill: C.skin,
            stroke: C.outline,
            strokeWidth: 3.5,
          }),
          grp(
            "RSleeve",
            [poly("RS", [[122, 129], [138, 106], [146, 114], [130, 135]], true)],
            { fill: C.cream, stroke: C.outline, strokeWidth: 3.4 }
          ),
        ],
      }),

      // Swinging Golden Mortarboard Tassel (parented to Head 20)
      shapeLayer({
        ind: 24,
        nm: "GradTassel",
        parent: 20,
        anchor: [126, 36],
        op: OP,
        rot: kf1D([
          [0, -18],
          [25, 22],
          [50, -16],
          [75, 24],
          [100, -18],
          [125, 22],
          [150, -18],
        ]),
        shapes: [
          grp("TasselDrop", [el("GoldBall", 126, 56, 8.5, 8.5)], {
            fill: C.amber,
            stroke: C.outline,
            strokeWidth: 2,
          }),
          grp("TasselCord", [poly("Cord", [[126, 36], [126, 54]], false)], {
            stroke: C.amber,
            strokeWidth: 3.2,
          }),
        ],
      }),

      // Joyful Blinking Eyes
      shapeLayer({
        ind: 21,
        nm: "JoyEyes",
        parent: 20,
        anchor: [90, 74],
        op: OP,
        scale: kfScale([
          [0, 100, 100],
          [52, 100, 100],
          [56, 110, 10],
          [61, 100, 100],
          [116, 100, 100],
          [120, 110, 10],
          [125, 100, 100],
          [150, 100, 100],
        ]),
        shapes: [
          grp("Sparkles", [el("LG", 75, 71.5, 4.8, 4.8), el("RG", 109, 71.5, 4.8, 4.8)], {
            fill: C.white,
          }),
          grp("Pupils", [el("LE", 73, 74, 13, 13), el("RE", 107, 74, 13, 13)], {
            fill: C.outline,
          }),
        ],
      }),

      // Head + Graduation Mortarboard Cap
      shapeLayer({
        ind: 20,
        nm: "CelebrationHead",
        parent: 10,
        anchor: [90, 108],
        op: OP,
        rot: kf1D([
          [0, -5],
          [37, 5],
          [75, -5],
          [112, 5],
          [150, -5],
        ]),
        shapes: [
          // Mortarboard Cap Top Diamond & Purple Skullcap
          grp("CapCordTop", [poly("TopCord", [[90, 28], [126, 36]], false)], {
            stroke: C.amber,
            strokeWidth: 3,
          }),
          grp(
            "MortarboardDiamond",
            [poly("Diamond", [[90, 13], [136, 28], [90, 43], [44, 28]], true)],
            { fill: C.outline, stroke: C.black, strokeWidth: 3.4 }
          ),
          grp(
            "MortarboardBand",
            [poly("Band", [[64, 34], [116, 34], [116, 48], [90, 53], [64, 48]], true)],
            { fill: C.purpleDeep, stroke: C.outline, strokeWidth: 3.4 }
          ),
          // Raised Joyful Brows
          grp(
            "HappyBrows",
            [
              bezier("LB", [[65, 61], [79, 60]], [[0, 0], [-4, -4]], [[4, -4], [0, 0]], false),
              bezier("RB", [[101, 60], [115, 61]], [[0, 0], [-4, -4]], [[4, -4], [0, 0]], false),
            ],
            { stroke: C.outline, strokeWidth: 3.4 }
          ),
          ...baseHeadShapes(true, "grin"),
        ],
      }),

      // Victory Dance Body (rhythmic bounce + squash & stretch groove)
      shapeLayer({
        ind: 10,
        nm: "DanceBodyRig",
        anchor: [90, 144],
        op: OP,
        pos: kfPos([
          [0, 90, 145],
          [19, 90, 135],
          [38, 90, 145],
          [56, 90, 134],
          [75, 90, 145],
          [94, 90, 135],
          [112, 90, 145],
          [131, 90, 134],
          [150, 90, 145],
        ]),
        rot: kf1D([
          [0, -4],
          [38, 4],
          [75, -4],
          [112, 4],
          [150, -4],
        ]),
        scale: kfScale([
          [0, 103, 97],
          [19, 98, 103],
          [38, 103, 97],
          [56, 98, 103],
          [75, 103, 97],
          [94, 98, 103],
          [112, 103, 97],
          [131, 98, 103],
          [150, 103, 97],
        ]),
        shapes: shsUniformTorsoShapes(),
      }),
    ],
  };
}

/* ───────────── Cached Singleton Animation Objects ───────────── */

export const MASCOT_LOTTIE_DATA = {
  shs_welcome: buildShsWelcomeLottie(),
  login_welcome: buildShsWelcomeLottie(),
  detective: buildDetectiveLottie(),
  fbi_security: buildFbiSecurityLottie(),
  celebration: buildCelebrationLottie(),
} as const;
