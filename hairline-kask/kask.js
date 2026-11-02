/**
 * Kask: a hard hat of glass in three layers: a brim with a peak, a dome and
 * an amber strap down the crown. At rest the layers stand a little apart, the
 * strap bright. The pointer's x scrubs the gap and its y picks a layer, which
 * takes the bright stroke. The slider is the gap, in world units.
 *
 * The pattern: scrub and pick. One spring for the gap, a hit test on the
 * layers' rest heights, and the choice carried by the stroke alone.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, lerp, open, poly, proj, rad, ringAt, run,
  spring, stepS, disposer, mk, pointer, put, register, solid,
} = HL;

const BT = 6, R = 30, H = 28, STEPS = 9, SQ = Math.SQRT1_2;
const STRAP = [[86, 4.6], [76, 4.4], [66, 4.2], [56, 4], [46, 3.8], [38, 3.6], [32, 3.4]];

/** The brim: a round plate with a peak toward the viewer (+x +y), as a ring of samples. */
function brimRing(k) {
  const out = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, f = Math.atan2(Math.sin(a - Math.PI / 4), Math.cos(a - Math.PI / 4));
    const r = (39 + 13 * Math.exp(-((f / 0.62) ** 2))) * k - (k < 1 ? 2.4 : 0);
    out.push({ u: r * Math.cos(a), v: r * Math.sin(a), nu: Math.cos(a), nv: Math.sin(a) });
  }
  return out;
}

/** A world point `s` along the front diagonal and `p` across it. */
const D = (s, p) => [(s + p) * SQ, (s - p) * SQ];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let base = value, over = false, act = -1;

  const C = Cam(45, 0.5, 2.3);
  const brim = brimRing(1), seat = brimRing(0.9);
  fit(C, ringAtPts(brim).concat([[0, 0, 0], [0, 0, 100]]), 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const lBrim = solid(g), lDome = solid(g), lStrap = solid(g);
  put(lBrim, { sil: poly(hull(ringAt(P, brim, BT).concat(ringAt(P, brim, 0)))), crease: open(ringAt(P, run(seat, front), BT)) });

  const gap = spring(base, { eps: 0.02 });
  let drawn = NaN;
  const cross = [];
  for (let k = 0; k < STEPS; k++) {
    const a = rad((k / STEPS) * 82);
    cross.push({ ring: circleRing(R * Math.cos(a)), z: H * Math.sin(a) });
  }
  const bead = circleRing(R * Math.cos(rad(13)));

  function draw() {
    const gv = gap.x;
    if (gv === drawn) return;
    drawn = gv;
    const z0 = BT + gv;
    let pts = [P(0, 0, z0 + H)];
    for (const c of cross) pts = pts.concat(ringAt(P, c.ring, z0 + c.z));
    put(lDome, { sil: poly(hull(pts)), crease: open(ringAt(P, run(bead, front), z0 + H * Math.sin(rad(13)))) });
    const zs = BT + gv * 1.9, left = [], right = [], mid = [];
    for (const [a, hw] of STRAP) {
      const s = (R + 1.4) * Math.cos(rad(a)), z = zs + (H + 1.4) * Math.sin(rad(a));
      left.push(P(...D(s, hw), z)); right.push(P(...D(s, -hw), z)); mid.push(P(...D(s, 0), z));
    }
    const ring = left.concat(right.reverse()), n = ring.length;
    const radii = ring.map((_, i) => (i === 0 || i === n / 2 - 1 || i === n / 2 || i === n - 1 ? 2.6 : 0.05));
    put(lStrap, { sil: poly(fillet(ring, radii)), crease: open(mid.slice(1, -1)) });
    paint();
  }
  function paint() {
    lStrap.sil.classList.toggle("hi", act === 2 || act < 0);
    lDome.sil.classList.toggle("hi", act === 1);
    lBrim.sil.classList.toggle("hi", act === 0);
  }

  // Hit: each layer's resting centre on screen, at the slider's gap. Never the pose on screen.
  const centres = () => [BT / 2, BT + base + H * 0.45, BT + base * 1.9 + H * 0.8].map((z, i) => P(...(i === 2 ? D(R * 0.5, 0) : [0, 0]), z)[1]);
  const box = ringAtPts(brim).map((q) => P(q[0], q[1], 0)).reduce((b, q) => [Math.min(b[0], q[0]), Math.max(b[1], q[0])], [1e9, -1e9]);
  function hit([x, y]) {
    if (x < box[0] - 6 || x > box[1] + 6) return -1;
    const cs = centres();
    return cs.reduce((best, cy, i) => (Math.abs(cy - y) < Math.abs(cs[best] - y) ? i : best), 0);
  }

  const B = register(stage, (dt) => { const m = stepS(gap, dt); draw(); return m; });
  bag.add(B.unregister);

  function retarget(p) {
    if (!p) { act = -1; gap.t = base; read.textContent = "rest"; }
    else {
      const a = hit(p);
      act = a;
      gap.t = a < 0 ? base : clamp(base * lerp(0.3, 1.5, clamp((p[0] - 90) / 220, 0, 1)), 0, base * 1.5);
      read.textContent = a < 0 ? "rest" : ["brim", "dome", "strap"][a];
    }
    over = !!p;
    paint();
    B.wake();
  }
  bag.add(pointer(stage, { move: (p) => retarget(p), leave: () => retarget(null) }));
  bag.add(() => svg.replaceChildren());
  draw();

  return {
    set: (v) => { base = v; if (!over) gap.t = v; },
    destroy: bag.dispose,
  };
}

/** The ring's samples as [x, y, 0] points, for fitting. */
function ringAtPts(ring) { return ring.map((q) => [q.u, q.v, 0]); }
function circleRing(r) {
  return Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    return { u: r * Math.cos(a), v: r * Math.sin(a), nu: Math.cos(a), nv: Math.sin(a) };
  });
}

hairline({
  name: "kask",
  means: "A glass hard hat in three layers: the pointer's x opens the gap, its height picks brim, dome or strap.",
  rules: [1, 3, 5, 9],
  range: [9, 18, 28],
  tour: [[200, 125], [275, 160], [135, 238], null],
  mount,
});
