/*
 * Interactive figures for Chapter 11, Structure from Motion.
 * Each figure looks for its own element id and does nothing if absent.
 * The images are Blender renders with known cameras (media/sfm/cameras.json)
 * and a sparse set of true surface points (media/sfm/points.json).
 * Ground truth is used to build and score the figures; none of them is a
 * reference implementation of an SfM pipeline.
 */
(() => {
  const MEDIA = "media/sfm/";
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
  const GOLD = "#cfb97d", GREEN = "#2fc86e", RED = "#ff6b6b", BLUE = "#4fb3ff";

  function slider(root, name, onChange, format = (v) => v) {
    const input = $(root, `input[name="${name}"]`);
    const out = input.parentElement.querySelector("output");
    const update = () => {
      if (out) out.textContent = format(Number(input.value));
      onChange();
    };
    input.addEventListener("input", update);
    return {
      input,
      value: () => Number(input.value),
      set(v) { input.value = v; if (out) out.textContent = format(Number(input.value)); },
      init: update
    };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  let dataPromise = null;
  function data() {
    if (!dataPromise) {
      dataPromise = Promise.all([
        fetch(MEDIA + "cameras.json").then((r) => r.json()),
        fetch(MEDIA + "points.json").then((r) => r.json())
      ]).then(([cams, points]) => ({ cams, points, K: cams.K, W: cams.width, H: cams.height }));
    }
    return dataPromise;
  }
  const images = {};
  function viewImage(i) {
    if (!images[i]) images[i] = loadImage(MEDIA + `view_${i}.jpg`);
    return images[i];
  }

  function canvasPoint(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * canvas.width,
      y: ((event.clientY - r.top) / r.height) * canvas.height
    };
  }

  function turbo(t) {
    t = Math.min(1, Math.max(0, t));
    const r = 34.61 + t * (1172.33 + t * (-10793.56 + t * (33300.12 + t * (-38394.49 + t * 14825.05))));
    const g = 23.31 + t * (557.33 + t * (1225.33 + t * (-3574.96 + t * (1073.77 + t * 707.56))));
    const b = 27.2 + t * (3211.1 + t * (-15327.97 + t * (27814 + t * (-22569.18 + t * 6838.66))));
    return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))));
  }

  // Seeded random numbers so figures look the same on every visit.
  function rng(seed) {
    let s = seed >>> 0;
    const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    next.gauss = () => { let u = 0, v = 0; while (!u) u = next(); while (!v) v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return next;
  }

  /* ---------- small vector and matrix helpers ---------- */
  const v3 = {
    add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]),
    mul: (a, s) => a.map((x) => x * s), dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
    len: (a) => Math.hypot(...a),
    norm: (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  };
  const m3 = {
    mul: (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0))),
    vec: (A, v) => A.map((row) => row.reduce((s, a, k) => s + a * v[k], 0)),
    T: (A) => A[0].map((_, j) => A.map((row) => row[j])),
    skew: (t) => [[0, -t[2], t[1]], [t[2], 0, -t[0]], [-t[1], t[0], 0]],
    inv(A) {
      const [a, b, c] = A[0], [d, e, f] = A[1], [g, h, i] = A[2];
      const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
      return [
        [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
        [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
        [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]
      ];
    },
    // rotation from an axis-angle vector
    rod(w) {
      const th = Math.hypot(...w);
      if (th < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const k = w.map((x) => x / th), K = m3.skew(k), K2 = m3.mul(K, K);
      const s = Math.sin(th), c = 1 - Math.cos(th);
      return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + s * K[i][j] + c * K2[i][j]));
    }
  };
  const deg = Math.PI / 180;
  const rotX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const rotY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const rotZ = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];

  // Project a world point with world-to-camera R, t and intrinsics K.
  function project(K, R, t, X) {
    const c = v3.add(m3.vec(R, X), t);
    return { u: K[0][0] * c[0] / c[2] + K[0][2], v: K[1][1] * c[1] / c[2] + K[1][2], z: c[2] };
  }

  /*
   * A small orbit viewer for 3D scenes drawn on a canvas.
   * World is z-up. Drag to turn, wheel or pinch is not needed for these figures.
   */
  function orbit(canvas, { center, dist = 4, scale = 900, yaw = 0, pitch = 0.4, onChange }) {
    const ctx = canvas.getContext("2d");
    const st = { yaw, pitch, center, dist, scale };
    function view(P) {
      const p = v3.sub(P, st.center);
      const c = Math.cos(st.yaw), s = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const x = c * p[0] - s * p[1];
      const y1 = s * p[0] + c * p[1];
      const up = cp * p[2] + sp * y1;
      const z = -sp * p[2] + cp * y1 + st.dist;
      const k = st.scale / Math.max(z, 0.05);
      return [canvas.width / 2 + x * k, canvas.height / 2 - up * k, z];
    }
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      st.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
      st.pitch = Math.max(-0.2, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.006));
      onChange();
    });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    return {
      st, view, ctx,
      seg(a, b, color, width = 1.5, dash = []) {
        const [x1, y1] = view(a), [x2, y2] = view(b);
        ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
      },
      dot(P, color, r = 3) {
        const [x, y] = view(P);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      },
      label(P, text, color) {
        const [x, y] = view(P);
        ctx.fillStyle = color; ctx.font = "bold 13px 'Nunito Sans', sans-serif"; ctx.fillText(text, x + 7, y - 7);
      },
      // camera frustum from world-to-camera R and centre C (OpenCV axes)
      frustum(R, C, color, size = 0.25, width = 1.6, fill = null) {
        const [xr, yd, zf] = R; // rows: camera x (right), y (down), z (forward) in world
        const corner = (a, b) => v3.add(C, v3.mul(v3.add(zf, v3.add(v3.mul(xr, a * 0.55), v3.mul(yd, b * 0.32))), size));
        const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
        if (fill) {
          ctx.beginPath(); cs.map(view).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
          ctx.fillStyle = fill; ctx.fill();
        }
        cs.forEach((p, i) => { this.seg(C, p, color, width); this.seg(p, cs[(i + 1) % 4], color, width); });
        this.seg(cs[0], cs[1], color, width * 2); // top edge drawn thicker so "up" is visible
      }
    };
  }

  /* ---------- 1. The eight views and their feature tracks ---------- */
  async function views() {
    const root = document.getElementById("sfm-views");
    if (!root) return;
    const big = $(root, "canvas.sfm-big");
    const strip = $(root, ".sfm-strip");
    const readout = $(root, ".sim__readout");
    const ctx = big.getContext("2d");
    let D;
    try { D = await data(); } catch { readout.textContent = "The scene data could not be loaded."; return; }
    const { K, W, H, cams, points } = D;
    big.width = W; big.height = H;
    const N = cams.views.length;
    const imgs = await Promise.all(cams.views.map((_, i) => viewImage(i)));
    const thumbs = cams.views.map((_, i) => {
      const c = document.createElement("canvas");
      c.width = 320; c.height = 180; c.title = `View ${i + 1}`;
      c.addEventListener("click", () => { cur = i; draw(); });
      strip.appendChild(c);
      return c;
    });
    let cur = 3, sel = null, tracks = true;
    const proj = cams.views.map((v) => points.map((p) => project(K, v.R, v.t, p.X)));
    $(root, "[data-action=tracks]").addEventListener("click", (e) => {
      tracks = !tracks; e.target.textContent = `Feature tracks: ${tracks ? "on" : "off"}`; draw();
    });

    function draw() {
      ctx.drawImage(imgs[cur], 0, 0, W, H);
      if (tracks) {
        points.forEach((p, j) => {
          if (!p.v.includes(cur)) return;
          const q = proj[cur][j];
          const [r, g, b] = turbo((p.v.length - 2) / (N - 2));
          ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
          ctx.fillRect(q.u - 1.5, q.v - 1.5, 3, 3);
        });
      }
      if (sel !== null && points[sel].v.includes(cur)) {
        const q = proj[cur][sel];
        ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(q.u, q.v, 9, 0, Math.PI * 2); ctx.stroke();
      }
      thumbs.forEach((c, i) => {
        const x = c.getContext("2d");
        x.drawImage(imgs[i], 0, 0, 320, 180);
        c.classList.toggle("is-on", i === cur);
        if (sel !== null && points[sel].v.includes(i)) {
          const q = proj[i][sel];
          x.strokeStyle = GOLD; x.lineWidth = 3;
          x.beginPath(); x.arc(q.u / 2, q.v / 2, 8, 0, Math.PI * 2); x.stroke();
        } else if (sel !== null) {
          x.fillStyle = "rgba(0,0,0,0.45)"; x.fillRect(0, 0, 320, 180);
        }
      });
      if (sel === null) {
        readout.innerHTML = `View ${cur + 1} of ${N}. Dots mark surface points that also appear in other views, colored by how many views see them (blue: 2, red: all ${N}). <b>Click a dot</b> to follow its track through the sequence.`;
      } else {
        const p = points[sel];
        readout.innerHTML = `This point is seen in <b>${p.v.length} of ${N} views</b> (${p.v.map((i) => i + 1).join(", ")}). Its images across those views form one <b>feature track</b>. Views that cannot see it are dimmed: it is outside the frame or hidden behind something.`;
      }
    }
    big.addEventListener("click", (e) => {
      const { x, y } = canvasPoint(big, e);
      let best = null, bd = 12 * 12;
      points.forEach((p, j) => {
        if (!p.v.includes(cur)) return;
        const q = proj[cur][j], d = (q.u - x) ** 2 + (q.v - y) ** 2;
        if (d < bd) { bd = d; best = j; }
      });
      sel = best; draw();
    });
    draw();
  }

  /* ---------- 2. Matching two views with OpenCV.js, scored by the true geometry ---------- */
  function matching() {
    const root = document.getElementById("sfm-match");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const runBtn = $(root, "[data-action=match]");
    let pair = [3, 4], result = null, picked = null, busy = false;
    const T = slider(root, "thr", draw, (v) => v.toFixed(1) + " px");
    $$(root, "[data-pair]").forEach((b) => b.addEventListener("click", () => {
      pair = b.dataset.pair.split(",").map(Number);
      $$(root, "[data-pair]").forEach((x) => x.classList.toggle("is-on", x === b));
      run();
    }));
    runBtn.addEventListener("click", run);

    async function run() {
      if (busy) return;
      busy = true; runBtn.disabled = true;
      readout.textContent = "Loading OpenCV.js (about 10 MB, first time only)…";
      try {
        const cv = await window.loadOpenCV();
        const D = await data();
        const [ia, ib] = await Promise.all(pair.map(viewImage));
        readout.textContent = "Detecting ORB features and matching them…";
        await new Promise((r) => setTimeout(r, 30));
        const A = cv.imread(ia), B = cv.imread(ib), ga = new cv.Mat(), gb = new cv.Mat();
        cv.cvtColor(A, ga, cv.COLOR_RGBA2GRAY); cv.cvtColor(B, gb, cv.COLOR_RGBA2GRAY);
        const orb = new cv.ORB(1500);
        const ka = new cv.KeyPointVector(), kb = new cv.KeyPointVector();
        const da = new cv.Mat(), db = new cv.Mat(), none = new cv.Mat();
        orb.detectAndCompute(ga, none, ka, da); orb.detectAndCompute(gb, none, kb, db);
        const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
        const knn = new cv.DMatchVectorVector();
        bf.knnMatch(da, db, knn, 2);
        const matches = [];
        for (let i = 0; i < knn.size(); i++) {
          const m = knn.get(i);
          if (m.size() < 2) continue;
          const m0 = m.get(0), m1 = m.get(1);
          if (m0.distance < 0.8 * m1.distance) {
            const p = ka.get(m0.queryIdx).pt, q = kb.get(m0.trainIdx).pt;
            matches.push({ a: [p.x, p.y], b: [q.x, q.y] });
          }
        }
        // the true fundamental matrix from the renderer's cameras
        const va = D.cams.views[pair[0]], vb = D.cams.views[pair[1]];
        const R = m3.mul(vb.R, m3.T(va.R));
        const t = v3.sub(vb.t, m3.vec(R, va.t));
        const Kinv = m3.inv(D.K);
        const F = m3.mul(m3.mul(m3.T(Kinv), m3.mul(m3.skew(t), R)), Kinv);
        matches.forEach((m) => {
          const x1 = [m.a[0], m.a[1], 1], x2 = [m.b[0], m.b[1], 1];
          const l2 = m3.vec(F, x1), l1 = m3.vec(m3.T(F), x2);
          const d2 = Math.abs(v3.dot(l2, x2)) / Math.hypot(l2[0], l2[1]);
          const d1 = Math.abs(v3.dot(l1, x1)) / Math.hypot(l1[0], l1[1]);
          m.err = Math.max(d1, d2);
        });
        result = { matches, F, ia, ib, W: D.W, H: D.H, na: ka.size(), nb: kb.size() };
        picked = null;
        [A, B, ga, gb, ka, kb, da, db, none, knn].forEach((m) => m.delete());
        orb.delete(); bf.delete();
        runBtn.textContent = "Match again";
        draw();
      } catch (err) {
        readout.textContent = "Could not match: " + (err.message || err);
      }
      busy = false; runBtn.disabled = false;
    }

    function draw() {
      if (!result) return;
      const { matches, F, ia, ib, W, H } = result;
      canvas.width = W * 2; canvas.height = H;
      ctx.drawImage(ia, 0, 0, W, H); ctx.drawImage(ib, W, 0, W, H);
      const thr = T.value();
      let good = 0;
      matches.forEach((m, i) => {
        const ok = m.err <= thr;
        if (ok) good++;
        if (picked !== null && picked !== i) return;
        ctx.strokeStyle = ok ? "rgba(47,200,110,0.75)" : "rgba(255,90,80,0.85)";
        ctx.lineWidth = picked === i ? 2.5 : 1.2;
        ctx.beginPath(); ctx.moveTo(m.a[0], m.a[1]); ctx.lineTo(m.b[0] + W, m.b[1]); ctx.stroke();
      });
      if (picked !== null) {
        const m = matches[picked];
        const l = m3.vec(F, [m.a[0], m.a[1], 1]);
        // line a x + b y + c = 0 across the right image
        ctx.strokeStyle = BLUE; ctx.lineWidth = 2.5; ctx.beginPath();
        if (Math.abs(l[1]) > 1e-9) {
          ctx.moveTo(W, -l[2] / l[1]); ctx.lineTo(2 * W, -(l[2] + l[0] * W) / l[1]);
        } else { const x = -l[2] / l[0]; ctx.moveTo(W + x, 0); ctx.lineTo(W + x, H); }
        ctx.stroke();
        for (const [x, y] of [m.a, [m.b[0] + W, m.b[1]]]) {
          ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
        }
      }
      const pct = matches.length ? Math.round((100 * good) / matches.length) : 0;
      let msg = `${result.na} and ${result.nb} ORB features, <b>${matches.length} matches</b> after the ratio test. <b>${good}</b> (${pct}%) lie within ${thr.toFixed(1)} px of their true epipolar line (green); <b>${matches.length - good}</b> do not (red).`;
      msg += picked === null ? " Click a match in the left image to see its epipolar line." : ` This match is <b>${matches[picked].err.toFixed(1)} px</b> from its epipolar line (blue). Click empty space to show all matches.`;
      readout.innerHTML = msg;
    }
    canvas.addEventListener("click", (e) => {
      if (!result) return;
      const { x, y } = canvasPoint(canvas, e);
      let best = null, bd = 14 * 14;
      result.matches.forEach((m, i) => {
        const px = x < result.W ? m.a[0] : m.b[0] + result.W, py = x < result.W ? m.a[1] : m.b[1];
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      picked = best; draw();
    });
    T.init();
  }

  /* ---------- 3. How many RANSAC trials? ---------- */
  function ransacCount() {
    const root = document.getElementById("sfm-ransac");
    if (!root) return;
    const plot = $(root, "canvas.sfm-plot");
    const grid = $(root, "canvas.sfm-grid");
    const pctx = plot.getContext("2d"), gctx = grid.getContext("2d");
    const readout = $(root, ".sim__readout");
    plot.width = 720; plot.height = 300; grid.width = 720; grid.height = 120;
    let s = 8, draws = 0, wins = 0, sample = [];
    const models = { 3: "P3P (pose from 3 points)", 5: "five-point essential matrix", 7: "seven-point fundamental matrix", 8: "eight-point algorithm" };
    const E = slider(root, "e", reset, (v) => Math.round(v * 100) + "%");
    const P = slider(root, "p", draw, (v) => (v * 100).toFixed(v >= 0.999 ? 1 : 0) + "%");
    $$(root, "[data-s]").forEach((b) => b.addEventListener("click", () => {
      s = Number(b.dataset.s);
      $$(root, "[data-s]").forEach((x) => x.classList.toggle("is-on", x === b));
      reset();
    }));
    const NM = 60;
    let outlier = [];
    function reset() {
      const r = rng(7), e = E.value();
      const idx = Array.from({ length: NM }, (_, i) => i).sort(() => r() - 0.5);
      outlier = new Array(NM).fill(false);
      idx.slice(0, Math.round(e * NM)).forEach((i) => (outlier[i] = true));
      draws = 0; wins = 0; sample = [];
      draw();
    }
    const trials = (e, ss, p) => Math.log(1 - p) / Math.log(1 - Math.pow(1 - e, ss));
    function drawOne() {
      const pool = Array.from({ length: NM }, (_, i) => i);
      sample = [];
      for (let k = 0; k < s; k++) sample.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      draws++;
      if (sample.every((i) => !outlier[i])) wins++;
    }
    $(root, "[data-action=one]").addEventListener("click", () => { drawOne(); draw(); });
    $(root, "[data-action=many]").addEventListener("click", () => { for (let k = 0; k < 500; k++) drawOne(); draw(); });

    function draw() {
      const e = E.value(), p = P.value();
      const fg = getComputedStyle(root).color;
      // plot: log10 trials vs outlier ratio, one curve per sample size
      pctx.clearRect(0, 0, 720, 300);
      const L = 60, R = 700, T0 = 16, B = 260;
      const X = (ee) => L + (ee / 0.8) * (R - L);
      const Y = (n) => B - (Math.min(6, Math.log10(Math.max(1, n))) / 6) * (B - T0);
      pctx.strokeStyle = fg; pctx.globalAlpha = 0.25; pctx.lineWidth = 1;
      for (let k = 0; k <= 6; k++) { pctx.beginPath(); pctx.moveTo(L, Y(10 ** k)); pctx.lineTo(R, Y(10 ** k)); pctx.stroke(); }
      pctx.globalAlpha = 1; pctx.fillStyle = fg; pctx.font = "12px 'Open Sans', sans-serif";
      for (let k = 0; k <= 6; k++) pctx.fillText(k < 4 ? String(10 ** k) : `10^${k}`, 8, Y(10 ** k) + 4);
      for (let k = 0; k <= 8; k++) pctx.fillText(k * 10 + "%", X(k / 10) - 10, B + 18);
      pctx.fillText("fraction of outliers", R - 120, B + 36);
      pctx.fillText("trials needed", L + 8, T0 + 6);
      const colors = { 3: BLUE, 5: GREEN, 7: "#e0a040", 8: RED };
      for (const ss of [3, 5, 7, 8]) {
        pctx.strokeStyle = colors[ss]; pctx.lineWidth = ss === s ? 3.5 : 1.5; pctx.globalAlpha = ss === s ? 1 : 0.6;
        pctx.beginPath();
        for (let k = 0; k <= 160; k++) {
          const ee = (k / 160) * 0.8, n = trials(ee, ss, p);
          k ? pctx.lineTo(X(ee), Y(n)) : pctx.moveTo(X(ee), Y(n));
        }
        pctx.stroke(); pctx.globalAlpha = 1;
      }
      [3, 5, 7, 8].forEach((ss, k) => { pctx.fillStyle = colors[ss]; pctx.font = (ss === s ? "bold " : "") + "12px 'Open Sans', sans-serif"; pctx.fillText(`sample of ${ss}`, L + 8 + k * 100, T0 + 24); });
      pctx.font = "12px 'Open Sans', sans-serif";
      const n = trials(e, s, p);
      pctx.fillStyle = fg; pctx.beginPath(); pctx.arc(X(e), Y(n), 6, 0, Math.PI * 2); pctx.fill();

      // the matches as a row of dots
      gctx.clearRect(0, 0, 720, 120);
      const inSample = new Set(sample);
      for (let i = 0; i < NM; i++) {
        const x = 20 + (i % 30) * 23.5, y = 30 + Math.floor(i / 30) * 50;
        gctx.fillStyle = outlier[i] ? RED : GREEN;
        gctx.globalAlpha = inSample.size && !inSample.has(i) ? 0.35 : 1;
        gctx.beginPath(); gctx.arc(x, y, 8, 0, Math.PI * 2); gctx.fill();
        if (inSample.has(i)) { gctx.strokeStyle = GOLD; gctx.lineWidth = 3; gctx.beginPath(); gctx.arc(x, y, 12, 0, Math.PI * 2); gctx.stroke(); }
      }
      gctx.globalAlpha = 1;
      const pAll = Math.pow(1 - e, s);
      let msg = `With ${Math.round(e * 100)}% outliers, a random sample of <b>${s}</b> matches (${models[s]}) is all inliers with probability (1 − ${e.toFixed(2)})<sup>${s}</sup> = <b>${(pAll * 100).toFixed(pAll < 0.01 ? 2 : 1)}%</b>. `;
      msg += `To find one such sample with ${(p * 100).toFixed(p >= 0.999 ? 1 : 0)}% confidence, RANSAC needs about <b>${Number.isFinite(n) ? Math.ceil(n).toLocaleString() : "∞"} trials</b>.`;
      if (draws) msg += ` Your draws: ${wins} clean samples out of ${draws} (${((100 * wins) / draws).toFixed(1)}%).`;
      readout.innerHTML = msg;
    }
    E.init(); P.init();
  }

  /* ---------- 4. Four poses from one essential matrix ---------- */
  async function fourPoses() {
    const root = document.getElementById("sfm-poses");
    if (!root) return;
    const canvas = $(root, "canvas");
    const readout = $(root, ".sim__readout");
    canvas.width = 720; canvas.height = 420;
    let D;
    try { D = await data(); } catch { readout.textContent = "The scene data could not be loaded."; return; }
    const a = 2, b = 5;
    const va = D.cams.views[a], vb = D.cams.views[b];
    const R = m3.mul(vb.R, m3.T(va.R));
    let t = v3.sub(vb.t, m3.vec(R, va.t));
    const sc = v3.len(t);
    t = v3.mul(t, 1 / sc);
    // correspondences in normalized coordinates (the true projections)
    const pts = D.points.filter((p) => p.v.includes(a) && p.v.includes(b)).filter((_, i) => i % 6 === 0).slice(0, 140);
    const obs = pts.map((p) => {
      const X1 = v3.add(m3.vec(va.R, p.X), va.t), X2 = v3.add(m3.vec(vb.R, p.X), vb.t);
      return { x1: [X1[0] / X1[2], X1[1] / X1[2], 1], x2: [X2[0] / X2[2], X2[1] / X2[2], 1], c: p.c };
    });
    // The two rotations and two translation signs that give the same E (up to sign)
    const tt = [[t[0] * t[0], t[0] * t[1], t[0] * t[2]], [t[1] * t[0], t[1] * t[1], t[1] * t[2]], [t[2] * t[0], t[2] * t[1], t[2] * t[2]]];
    const Rpi = tt.map((row, i) => row.map((x, j) => 2 * x - (i === j ? 1 : 0)));
    const R2 = m3.mul(Rpi, R);
    const cands = [
      { R, t, name: "A" }, { R, t: v3.mul(t, -1), name: "B" },
      { R: R2, t, name: "C" }, { R: R2, t: v3.mul(t, -1), name: "D" }
    ];
    // midpoint triangulation in the first camera's frame
    function tri(c, o) {
      const C2 = v3.mul(m3.vec(m3.T(c.R), c.t), -1);
      const d1 = o.x1, d2 = m3.vec(m3.T(c.R), o.x2);
      const w = v3.sub([0, 0, 0], C2);
      const A11 = v3.dot(d1, d1), A12 = -v3.dot(d1, d2), A22 = v3.dot(d2, d2);
      const b1 = -v3.dot(d1, w), b2 = v3.dot(d2, w);
      const det = A11 * A22 - A12 * A12;
      const lam = (b1 * A22 - A12 * b2) / det, mu = (A11 * b2 - A12 * b1) / det;
      const X = v3.mul(v3.add(v3.mul(d1, lam), v3.add(C2, v3.mul(d2, mu))), 0.5);
      const z2 = v3.add(m3.vec(c.R, X), c.t)[2];
      return { X, front: X[2] > 0 && z2 > 0, z1: X[2], z2 };
    }
    cands.forEach((c) => {
      c.X = obs.map((o) => tri(c, o));
      c.good = c.X.filter((r) => r.front).length;
      c.C2 = v3.mul(m3.vec(m3.T(c.R), c.t), -1);
    });
    // display frame: camera 1 at origin, x right, z forward, y down -> world (x, z, -y)
    const W3 = (p) => [p[0], p[2], -p[1]];
    const Rw = (Rc) => Rc.map((row) => W3(row)); // rows of R expressed in display coordinates
    let cur = 0;
    const O = orbit(canvas, { center: [0, 2.2, 0], dist: 7, scale: 780, yaw: -0.9, pitch: 0.5, onChange: draw });
    $$(root, "[data-cand]").forEach((btn, i) => {
      btn.textContent = `${cands[i].name}: ${cands[i].good} of ${obs.length} in front`;
      btn.addEventListener("click", () => { cur = i; draw(); });
    });

    function draw() {
      const ctx = O.ctx, fg = getComputedStyle(root).color;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const c = cands[cur];
      $$(root, "[data-cand]").forEach((btn, i) => btn.classList.toggle("is-on", i === cur));
      O.seg([-3, 0, 0], [3, 0, 0], fg, 0.6, [4, 6]);
      O.seg([0, -1, 0], [0, 6, 0], fg, 0.6, [4, 6]);
      const order = c.X.map((r, i) => ({ r, i, z: O.view(W3(r.X))[2] })).sort((p, q) => q.z - p.z);
      for (const { r, i } of order) {
        const P = W3(r.X);
        if (Math.abs(P[1]) > 12 || Math.abs(P[0]) > 12) continue;
        O.dot(P, r.front ? `rgb(${obs[i].c.join(",")})` : RED, r.front ? 3.2 : 3);
      }
      O.frustum(Rw([[1, 0, 0], [0, 1, 0], [0, 0, 1]]), [0, 0, 0], fg, 0.5, 1.8, "rgba(207,185,125,0.15)");
      O.frustum(Rw(c.R), W3(c.C2), GOLD, 0.5, 2.2, "rgba(207,185,125,0.25)");
      O.seg([0, 0, 0], W3(c.C2), BLUE, 2, [5, 4]);
      O.label([0, 0, 0], "camera 1", fg);
      O.label(W3(c.C2), "camera 2", GOLD);
      const verdict = c.good === obs.length
        ? "Every point lies <b>in front of both cameras</b>: this is the physically valid pose."
        : c.good === 0
          ? "No point is in front of both cameras. Red points sit behind at least one camera."
          : `Only ${c.good} points are in front of both cameras; red points sit behind at least one.`;
      readout.innerHTML = `Candidate <b>${c.name}</b>: ${c.R === R ? "rotation R" : "rotation R turned 180° about the baseline"}, translation ${c.t === t ? "+t" : "−t"}. ${verdict} Drag to turn the view.`;
    }
    draw();
  }

  /* ---------- 5. Scale ambiguity ---------- */
  function scaleAmbiguity() {
    const root = document.getElementById("sfm-scale");
    if (!root) return;
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const NS = "http://www.w3.org/2000/svg";
    const S = slider(root, "s", draw, (v) => "× " + v.toFixed(2));
    const pts = [[-1.1, 2.4], [-0.4, 3.4], [0.5, 1.7], [1.0, 2.4], [0.35, 3.9]];
    const cols = ["#4fb3ff", "#2fc86e", "#e0a040", "#ff6b6b", "#b48cff"];
    const cam2 = { C: [0.9, 0.1], th: -0.2 };
    const f = 1.0;
    const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; svg.appendChild(e); return e; };
    function img(C, th, P) {
      const d = [P[0] - C[0], P[1] - C[1]];
      const xr = Math.cos(th) * d[0] - Math.sin(th) * d[1];
      const z = Math.sin(th) * d[0] + Math.cos(th) * d[1];
      return f * xr / z;
    }
    function draw() {
      const s = S.value();
      svg.innerHTML = "";
      const ox = 200, oy = 350, k = 55; // top view: x right, depth up
      const T = (p) => [ox + p[0] * k, oy - p[1] * k];
      el("text", { x: 20, y: 24, class: "sfm-label sfm-label--left" }, "Top view of the scene");
      const C2 = [cam2.C[0] * s, cam2.C[1] * s];
      const scaled = pts.map((p) => [p[0] * s, p[1] * s]);
      for (const [C, th, label] of [[[0, 0], 0, "1"], [C2, cam2.th, "2"]]) {
        scaled.forEach((p, i) => {
          const [x1, y1] = T(C), [x2, y2] = T(p);
          el("line", { x1, y1, x2, y2, stroke: cols[i], "stroke-opacity": 0.45, "stroke-width": 1.5 });
        });
        const [cx, cy] = T(C);
        // a small triangle pointing along the viewing direction
        const fx = Math.sin(th), fy = -Math.cos(th), rx = -fy, ry = fx;
        const tri = [[fx * 14, fy * 14], [-fx * 6 + rx * 10, -fy * 6 + ry * 10], [-fx * 6 - rx * 10, -fy * 6 - ry * 10]];
        el("polygon", { points: tri.map(([a, b]) => `${cx + a},${cy + b}`).join(" "), class: "sfm-cam" });
        el("text", { x: label === "1" ? cx - 12 : cx + 12, y: cy + 24, class: "sfm-small", "text-anchor": label === "1" ? "end" : "start" }, "camera " + label);
      }
      const [b1x, b1y] = T([0, 0]), [b2x, b2y] = T(C2);
      el("line", { x1: b1x, y1: b1y, x2: b2x, y2: b2y, class: "sfm-base" });
      scaled.forEach((p, i) => { const [x, y] = T(p); el("circle", { cx: x, cy: y, r: 7, fill: cols[i] }); });
      // the two images
      for (const [row, C, th, name] of [[0, [0, 0], 0, "Image from camera 1"], [1, C2, cam2.th, "Image from camera 2"]]) {
        const x0 = 470, y0 = 70 + row * 140, w = 220;
        el("rect", { x: x0, y: y0, width: w, height: 70, rx: 8, fill: "rgba(207,185,125,0.08)", stroke: "currentColor", "stroke-opacity": 0.4 });
        el("text", { x: x0, y: y0 - 10, class: "sfm-label sfm-label--left" }, name);
        scaled.forEach((p, i) => {
          const u = img(C, th, p);
          el("circle", { cx: x0 + w / 2 + u * 170, cy: y0 + 35, r: 7, fill: cols[i] });
        });
      }
      readout.innerHTML = `Scale the whole scene, including the distance between the cameras, by <b>${s.toFixed(2)}</b>. The baseline is now ${(Math.hypot(...C2)).toFixed(2)} units, yet both images are <b>exactly the same</b>. No algorithm working from these images alone can tell the two worlds apart.`;
    }
    S.init();
  }

  /* ---------- 6. Perspective-n-Point: register a new view ---------- */
  async function pnp() {
    const root = document.getElementById("sfm-pnp");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let D;
    try { D = await data(); } catch { readout.textContent = "The scene data could not be loaded."; return; }
    const VIEW = 5;
    const v = D.cams.views[VIEW], K = D.K, W = D.W, H = D.H;
    canvas.width = W; canvas.height = H;
    const img = await viewImage(VIEW);
    const r = rng(11);
    // 3D points already reconstructed from views 3 and 4 that view 6 also sees
    const pts = D.points.filter((p) => p.v.includes(3) && p.v.includes(4) && p.v.includes(VIEW)).filter((_, i) => i % 9 === 0).slice(0, 60);
    const truthObs = pts.map((p) => { const q = project(K, v.R, v.t, p.X); return [q.u + 0.5 * r.gauss(), q.v + 0.5 * r.gauss()]; });
    const outlierObs = pts.map(() => [20 + r() * (W - 40), 20 + r() * (H - 40)]);
    const isOut = pts.map(() => r() < 0.3);
    let outliers = false;
    const obs = () => pts.map((_, i) => (outliers && isOut[i] ? outlierObs[i] : truthObs[i]));

    const sl = {
      dx: slider(root, "dx", fromSliders, (x) => (x * 100).toFixed(0) + " cm"),
      dy: slider(root, "dy", fromSliders, (x) => (x * 100).toFixed(0) + " cm"),
      dz: slider(root, "dz", fromSliders, (x) => (x * 100).toFixed(0) + " cm"),
      yaw: slider(root, "yaw", fromSliders, (x) => x.toFixed(1) + "°"),
      pitch: slider(root, "pitch", fromSliders, (x) => x.toFixed(1) + "°"),
      roll: slider(root, "roll", fromSliders, (x) => x.toFixed(1) + "°")
    };
    // pose = small rotation and centre offset relative to the true pose
    let pose = { R: v.R, C: v.C };
    let note = "";
    function fromSliders() {
      const Rd = m3.mul(rotY(sl.yaw.value() * deg), m3.mul(rotX(sl.pitch.value() * deg), rotZ(sl.roll.value() * deg)));
      const R = m3.mul(Rd, v.R);
      const off = m3.vec(m3.T(v.R), [sl.dx.value(), sl.dy.value(), sl.dz.value()]);
      pose = { R, C: v3.add(v.C, off) };
      note = "";
      draw();
    }
    function toSliders() {
      const Rd = m3.mul(pose.R, m3.T(v.R));
      const pitch = Math.asin(Math.max(-1, Math.min(1, -Rd[1][2])));
      const roll = Math.atan2(Rd[1][0], Rd[1][1]);
      const yaw = Math.atan2(Rd[0][2], Rd[2][2]);
      const off = m3.vec(v.R, v3.sub(pose.C, v.C));
      sl.dx.set(off[0]); sl.dy.set(off[1]); sl.dz.set(off[2]);
      sl.yaw.set(yaw / deg); sl.pitch.set(pitch / deg); sl.roll.set(roll / deg);
    }
    function draw() {
      ctx.drawImage(img, 0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, W, H);
      const t = v3.mul(m3.vec(pose.R, pose.C), -1);
      const o = obs();
      let sum = 0, n = 0, sumIn = 0, nIn = 0;
      pts.forEach((p, i) => {
        const q = project(K, pose.R, t, p.X);
        const [ox, oy] = o[i];
        const bad = outliers && isOut[i];
        if (q.z > 0) {
          const e2 = (q.u - ox) ** 2 + (q.v - oy) ** 2;
          sum += e2; n++;
          if (!bad) { sumIn += e2; nIn++; }
          ctx.strokeStyle = "rgba(255,107,107,0.9)"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(q.u, q.v); ctx.stroke();
          ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(q.u, q.v, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = bad ? RED : GREEN; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.stroke();
      });
      const rms = Math.sqrt(sum / Math.max(1, n)), rmsIn = Math.sqrt(sumIn / Math.max(1, nIn));
      const posErr = v3.len(v3.sub(pose.C, v.C)) * 100;
      const Rd = m3.mul(pose.R, m3.T(v.R));
      const angErr = Math.acos(Math.max(-1, Math.min(1, (Rd[0][0] + Rd[1][1] + Rd[2][2] - 1) / 2))) / deg;
      readout.innerHTML = `${note}RMS reprojection error <b>${rms.toFixed(1)} px</b>${outliers ? ` (inliers only: ${rmsIn.toFixed(1)} px)` : ""}. The camera is <b>${posErr.toFixed(1)} cm</b> and <b>${angErr.toFixed(2)}°</b> from its true pose.`;
    }

    async function solve(ransac) {
      note = "Loading OpenCV.js…"; draw();
      try {
        const cv = await window.loadOpenCV();
        const o = obs();
        const Om = cv.matFromArray(pts.length, 3, cv.CV_64F, pts.flatMap((p) => p.X));
        const Im = cv.matFromArray(pts.length, 2, cv.CV_64F, o.flat());
        const Km = cv.matFromArray(3, 3, cv.CV_64F, K.flat());
        const Dm = cv.Mat.zeros(4, 1, cv.CV_64F);
        const rv = new cv.Mat(), tv = new cv.Mat(), inl = new cv.Mat(), Rm = new cv.Mat();
        let ok;
        if (ransac) ok = cv.solvePnPRansac(Om, Im, Km, Dm, rv, tv, false, 200, 3.0, 0.99, inl, cv.SOLVEPNP_ITERATIVE);
        else ok = cv.solvePnP(Om, Im, Km, Dm, rv, tv, false, cv.SOLVEPNP_ITERATIVE);
        if (!ok) throw new Error("no solution");
        cv.Rodrigues(rv, Rm);
        const Rs = [0, 1, 2].map((i) => Array.from(Rm.data64F.slice(3 * i, 3 * i + 3)));
        const ts = Array.from(tv.data64F);
        pose = { R: Rs, C: v3.mul(m3.vec(m3.T(Rs), ts), -1) };
        const nIn = ransac ? inl.rows : pts.length;
        [Om, Im, Km, Dm, rv, tv, inl, Rm].forEach((m) => m.delete());
        toSliders();
        note = ransac
          ? `<code>solvePnPRansac</code> kept <b>${nIn} of ${pts.length}</b> correspondences as inliers. `
          : `<code>solvePnP</code> used all ${pts.length} correspondences. `;
        draw();
      } catch (err) {
        note = "Could not solve: " + (err.message || err) + ". ";
        draw();
      }
    }
    $(root, "[data-action=pnp]").addEventListener("click", () => solve(false));
    $(root, "[data-action=ransac]").addEventListener("click", () => solve(true));
    $(root, "[data-action=outliers]").addEventListener("click", (e) => {
      outliers = !outliers;
      e.target.textContent = `Bad matches: ${outliers ? "30%" : "none"}`;
      e.target.classList.toggle("is-on", outliers);
      note = ""; draw();
    });
    $(root, "[data-action=reset]").addEventListener("click", () => {
      sl.dx.set(0.25); sl.dy.set(-0.08); sl.dz.set(-0.3); sl.yaw.set(-8); sl.pitch.set(4); sl.roll.set(0);
      fromSliders();
    });
    sl.dx.set(0.25); sl.dy.set(-0.08); sl.dz.set(-0.3); sl.yaw.set(-8); sl.pitch.set(4); sl.roll.set(0);
    fromSliders();
  }

  /* ---------- 7. Incremental reconstruction ---------- */
  async function incremental() {
    const root = document.getElementById("sfm-incremental");
    if (!root) return;
    const canvas = $(root, "canvas.sfm-3d");
    const vis = $(root, "canvas.sfm-vis");
    const readout = $(root, ".sim__readout");
    canvas.width = 720; canvas.height = 430; vis.width = 720; vis.height = 150;
    let D;
    try { D = await data(); } catch { readout.textContent = "The scene data could not be loaded."; return; }
    const { cams, points } = D;
    const ORDER = [3, 4, 2, 5, 1, 6, 0, 7];
    const center = [0.05, 1.9, 0.1];
    const r = rng(5);
    // each view gets a small pose error relative to the neighbour it was registered from
    const delta = ORDER.map((_, k) => (k < 2 ? { w: [0, 0, 0], t: [0, 0, 0] } : {
      w: [r.gauss(), r.gauss(), r.gauss()].map((x) => x * 0.03),
      t: [r.gauss(), r.gauss(), r.gauss()].map((x) => x * 0.07)
    }));
    const parent = { 2: 3, 5: 4, 1: 2, 6: 5, 0: 1, 7: 6 };
    const err = {};
    ORDER.forEach((vi, k) => {
      if (k < 2) { err[vi] = { w: [0, 0, 0], t: [0, 0, 0] }; return; }
      const p = err[parent[vi]];
      err[vi] = { w: v3.add(p.w, delta[k].w), t: v3.add(p.t, delta[k].t) };
    });
    const jitter = points.map(() => [r.gauss(), r.gauss(), r.gauss()].map((x) => x * 0.004));
    let n = 2, ba = true, shrink = 1, anim = null;
    const O = orbit(canvas, { center: [0.05, 1.6, 0.2], dist: 6.5, scale: 640, yaw: 0.35, pitch: 0.75, onChange: draw });

    function errOf(vi) { return { R: m3.rod(v3.mul(err[vi].w, shrink)), t: v3.mul(err[vi].t, shrink) }; }
    const moved = (e, X) => v3.add(v3.add(center, m3.vec(e.R, v3.sub(X, center))), e.t);

    function state() {
      const reg = new Set(ORDER.slice(0, n));
      const order = ORDER.slice(0, n);
      return points.map((p) => {
        const seen = order.filter((vi) => p.v.includes(vi));
        return seen.length >= 2 ? seen[1] : null; // view that triggered triangulation
      }).map((trig) => ({ trig, reg }));
    }
    function draw() {
      const ctx = O.ctx, fg = getComputedStyle(root).color;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const st = state();
      let errSum = 0, count = 0;
      const drawn = [];
      points.forEach((p, j) => {
        const trig = st[j].trig;
        if (trig === null) return;
        const X = v3.add(moved(errOf(trig), p.X), v3.mul(jitter[j], shrink < 1 ? 0.5 : 1));
        errSum += v3.len(v3.sub(X, p.X)); count++;
        drawn.push({ X, c: p.c, z: O.view(X)[2] });
      });
      drawn.sort((a, b) => b.z - a.z).forEach((d) => O.dot(d.X, `rgb(${d.c.join(",")})`, 2.4));
      cams.views.forEach((v, vi) => {
        const k = ORDER.indexOf(vi);
        if (k >= n) { O.frustum(v.R, v.C, "rgba(128,128,128,0.35)", 0.22, 1, null); return; }
        const e = errOf(vi);
        const C = moved(e, v.C);
        if (shrink > 0.5 && k >= 2) O.frustum(v.R, v.C, "rgba(128,128,128,0.45)", 0.22, 1, null); // where it really was
        const R = m3.mul(v.R, m3.T(e.R));
        const latest = k === n - 1 && n > 2;
        O.frustum(R, C, latest ? GOLD : fg, 0.22, latest ? 2.4 : 1.5, latest ? "rgba(207,185,125,0.3)" : null);
        O.label(C, String(vi + 1), latest ? GOLD : fg);
      });
      drawVis(st);
      const meanErr = count ? (100 * errSum) / count : 0;
      const what = n === 2
        ? "Start: the essential matrix between views 4 and 5 gives their relative pose, and triangulation gives the first points. Their distance apart sets the unit of length."
        : `View ${ORDER[n - 1] + 1} was registered by PnP against points already in the map, then new points were triangulated.`;
      readout.innerHTML = `${what} <b>${n} of 8 views</b>, <b>${count} points</b>, mean point error <b>${meanErr.toFixed(1)} cm</b>. ${ba ? "Bundle adjustment runs after each new view." : "Bundle adjustment is off, so small errors pile up from view to view."}`;
    }
    function drawVis(st) {
      const ctx = vis.getContext("2d"), fg = getComputedStyle(root).color;
      ctx.clearRect(0, 0, vis.width, vis.height);
      // columns: points sorted by the first view (in ORDER) that sees them
      if (!drawVis.cols) {
        drawVis.cols = points.map((p, j) => ({ j, k: Math.min(...p.v.map((vi) => ORDER.indexOf(vi))) })).sort((a, b) => a.k - b.k).map((c) => c.j);
      }
      const cols = drawVis.cols, L = 70, Wd = vis.width - L - 6, rowH = 16;
      ctx.font = "11px 'Open Sans', sans-serif"; ctx.fillStyle = fg;
      ORDER.forEach((vi, k) => {
        const y = 4 + k * rowH;
        ctx.globalAlpha = k < n ? 1 : 0.35;
        ctx.fillStyle = fg; ctx.fillText(`view ${vi + 1}`, 4, y + 11);
        for (let c = 0; c < cols.length; c++) {
          const p = points[cols[c]];
          if (!p.v.includes(vi)) continue;
          const x = L + (c / cols.length) * Wd;
          ctx.fillStyle = k < n ? (st[cols[c]].trig !== null ? GOLD : BLUE) : "#888";
          ctx.fillRect(x, y, Math.max(1, Wd / cols.length), rowH - 3);
        }
      });
      ctx.globalAlpha = 1;
    }
    function animateBA() {
      cancelAnimationFrame(anim);
      clearTimeout(anim);
      shrink = 1;
      let k = 0;
      const step = () => {
        shrink = 0.08 + 0.92 * Math.pow(0.8, ++k);
        draw();
        if (k < 18) anim = setTimeout(step, 50);
      };
      anim = setTimeout(step, 250);
    }
    $(root, "[data-action=next]").addEventListener("click", () => {
      if (n >= 8) return;
      n++;
      if (ba) { shrink = 1; draw(); animateBA(); } else { shrink = 1; draw(); }
    });
    $(root, "[data-action=reset]").addEventListener("click", () => { clearTimeout(anim); n = 2; shrink = ba ? 0.08 : 1; draw(); });
    $(root, "[data-action=ba]").addEventListener("click", (e) => {
      ba = !ba;
      e.target.textContent = `Bundle adjustment: ${ba ? "on" : "off"}`;
      e.target.classList.toggle("is-on", ba);
      clearTimeout(anim);
      if (ba) animateBA(); else { shrink = 1; draw(); }
    });
    shrink = 0.08;
    draw();
  }

  /* ---------- 8. Bundle adjustment in a flat world ---------- */
  function bundle() {
    const root = document.getElementById("sfm-ba");
    if (!root) return;
    const canvas = $(root, "canvas.sfm-flat");
    const chart = $(root, "canvas.sfm-chart");
    const readout = $(root, ".sim__readout");
    canvas.width = 720; canvas.height = 380; chart.width = 720; chart.height = 170;
    const ctx = canvas.getContext("2d"), cctx = chart.getContext("2d");
    const F = 400, FOV = 330;
    const NC = 6, NP = 26;
    const r0 = rng(21);
    // true cameras on an arc, looking toward the middle of the points
    const camT = Array.from({ length: NC }, (_, i) => {
      const x = -1.6 + (3.2 * i) / (NC - 1), z = -0.25 * Math.cos((i / (NC - 1) - 0.5) * 2.5);
      return [x, z, Math.atan2(0 - x, 3 - z)];
    });
    const ptT = Array.from({ length: NP }, () => [-1.8 + 3.6 * r0(), 1.8 + 2.4 * r0()]);
    function cam(c, P) {
      const dx = P[0] - c[0], dz = P[1] - c[1];
      const xr = Math.cos(c[2]) * dx - Math.sin(c[2]) * dz;
      const zf = Math.sin(c[2]) * dx + Math.cos(c[2]) * dz;
      return { u: (F * xr) / Math.max(zf, 0.05), z: zf };
    }
    const obs = [];
    for (let i = 0; i < NC; i++) for (let j = 0; j < NP; j++) {
      const q = cam(camT[i], ptT[j]);
      if (q.z > 0 && Math.abs(q.u) < FOV) obs.push({ i, j, u: q.u + 0.4 * r0.gauss() });
    }
    // Camera 1 is fixed and camera 2's position too: this removes the
    // freedom to move, turn or scale the whole solution (the gauge).
    let est, history = [], timer = null, lambda = 1e-3;
    const Nz = slider(root, "noise", () => { shake(); }, (v) => v.toFixed(2) + " m");
    function shake() {
      stop();
      const r = rng(Math.floor(Math.random() * 1e9)), s = Nz.value();
      est = {
        c: camT.map((c, i) => (i === 0 ? c.slice() : i === 1 ? [c[0], c[1], c[2] + 0.3 * s * r.gauss()] : [c[0] + s * r.gauss(), c[1] + s * r.gauss(), c[2] + 0.3 * s * r.gauss()])),
        p: ptT.map((p) => [p[0] + s * r.gauss(), p[1] + s * r.gauss()])
      };
      history = [rms()]; lambda = 1e-3;
      draw();
    }
    const pack = () => [...est.c[1].slice(2), ...est.c.slice(2).flat(), ...est.p.flat()];
    function unpack(x, into = est) {
      let k = 0;
      into.c[1][2] = x[k++];
      for (let i = 2; i < NC; i++) for (let d = 0; d < 3; d++) into.c[i][d] = x[k++];
      for (let j = 0; j < NP; j++) for (let d = 0; d < 2; d++) into.p[j][d] = x[k++];
    }
    const residuals = (e = est) => obs.map((o) => cam(e.c[o.i], e.p[o.j]).u - o.u);
    const rms = () => Math.sqrt(residuals().reduce((s, x) => s + x * x, 0) / obs.length);
    function lmStep() {
      const x0 = pack(), n = x0.length, m = obs.length;
      const r = residuals();
      const cost0 = r.reduce((s, v) => s + v * v, 0);
      const J = Array.from({ length: m }, () => new Float64Array(n));
      for (let k = 0; k < n; k++) {
        const x = x0.slice(); x[k] += 1e-6; unpack(x);
        const rk = residuals();
        for (let i = 0; i < m; i++) J[i][k] = (rk[i] - r[i]) / 1e-6;
      }
      unpack(x0);
      const A = Array.from({ length: n }, () => new Float64Array(n)), g = new Float64Array(n);
      for (let i = 0; i < m; i++) {
        const Ji = J[i];
        for (let a = 0; a < n; a++) {
          if (!Ji[a]) continue;
          g[a] += Ji[a] * r[i];
          for (let b = 0; b < n; b++) A[a][b] += Ji[a] * Ji[b];
        }
      }
      for (let tries = 0; tries < 8; tries++) {
        const M = A.map((row, a) => { const c = Array.from(row); c[a] += lambda * (row[a] + 1e-9); c.push(-g[a]); return c; });
        // Gaussian elimination with partial pivoting
        for (let c = 0; c < n; c++) {
          let piv = c;
          for (let rr = c + 1; rr < n; rr++) if (Math.abs(M[rr][c]) > Math.abs(M[piv][c])) piv = rr;
          [M[c], M[piv]] = [M[piv], M[c]];
          const d = M[c][c] || 1e-12;
          for (let rr = c + 1; rr < n; rr++) {
            const f = M[rr][c] / d;
            if (!f) continue;
            for (let k = c; k <= n; k++) M[rr][k] -= f * M[c][k];
          }
        }
        const dx = new Float64Array(n);
        for (let c = n - 1; c >= 0; c--) {
          let s = M[c][n];
          for (let k = c + 1; k < n; k++) s -= M[c][k] * dx[k];
          dx[c] = s / (M[c][c] || 1e-12);
        }
        const x1 = x0.map((v, k) => v + dx[k]);
        unpack(x1);
        const cost1 = residuals().reduce((s, v) => s + v * v, 0);
        if (cost1 < cost0) { lambda = Math.max(1e-7, lambda / 3); return; }
        unpack(x0); lambda *= 4;
      }
    }
    function stop() { clearTimeout(timer); timer = null; }
    $(root, "[data-action=run]").addEventListener("click", () => {
      stop();
      let k = 0;
      const step = () => {
        lmStep(); history.push(rms()); draw();
        if (++k < 25 && history[history.length - 1] > 0.05) timer = setTimeout(step, 140);
      };
      step();
    });
    $(root, "[data-action=shake]").addEventListener("click", shake);

    // drag estimated points and free cameras
    const S = 90, OX = 360, OY = 350;
    const toC = (p) => [OX + p[0] * S, OY - (p[1] + 0.4) * S];
    const fromC = (x, y) => [(x - OX) / S, (OY - y) / S - 0.4];
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      const { x, y } = canvasPoint(canvas, e);
      let best = null, bd = 16 * 16;
      est.p.forEach((p, j) => { const [px, py] = toC(p); const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = { type: "p", j }; } });
      est.c.forEach((c, i) => { if (i < 2) return; const [px, py] = toC(c); const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = { type: "c", j: i }; } });
      if (best) { stop(); drag = best; canvas.setPointerCapture(e.pointerId); }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const { x, y } = canvasPoint(canvas, e);
      const P = fromC(x, y);
      if (drag.type === "p") est.p[drag.j] = P; else { est.c[drag.j][0] = P[0]; est.c[drag.j][1] = P[1]; }
      history = [rms()]; draw();
    });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    function drawCam(c, color, fill, alpha = 1) {
      const [x, y] = toC(c);
      const fx = Math.sin(c[2]), fz = Math.cos(c[2]);
      const ang = Math.atan2(FOV, F);
      ctx.globalAlpha = alpha;
      for (const s of [-1, 1]) {
        const a = c[2] + s * ang;
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * 60, y - Math.cos(a) * 60); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = fill; ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + fx * 14, y - fz * 14);
      ctx.lineTo(x - fz * 9 - fx * 6, y - fx * 9 + fz * 6);
      ctx.lineTo(x + fz * 9 - fx * 6, y + fx * 9 + fz * 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function draw() {
      const fg = getComputedStyle(root).color;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // truth, faint
      ptT.forEach((p) => { const [x, y] = toC(p); ctx.strokeStyle = fg; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke(); });
      ctx.globalAlpha = 1;
      camT.forEach((c) => drawCam(c, fg, "transparent", 0.3));
      // error links
      est.p.forEach((p, j) => {
        const [x1, y1] = toC(p), [x2, y2] = toC(ptT[j]);
        ctx.strokeStyle = RED; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      est.p.forEach((p) => { const [x, y] = toC(p); ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); });
      est.c.forEach((c, i) => drawCam(c, i < 2 ? BLUE : GOLD, i < 2 ? "rgba(79,179,255,0.35)" : "rgba(207,185,125,0.35)"));
      ctx.fillStyle = fg; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("Top view. Gold: current estimate (drag points or cameras). Faint: truth. Blue cameras are held fixed.", 10, 18);

      // convergence chart (log scale)
      cctx.clearRect(0, 0, chart.width, chart.height);
      const L = 60, R = 700, T = 14, B = 140;
      const Y = (v) => B - ((Math.log10(Math.max(v, 0.01)) + 1) / 4) * (B - T); // 0.1 to 1000 px
      cctx.strokeStyle = fg; cctx.globalAlpha = 0.25;
      for (let k = -1; k <= 3; k++) { cctx.beginPath(); cctx.moveTo(L, Y(10 ** k)); cctx.lineTo(R, Y(10 ** k)); cctx.stroke(); }
      cctx.globalAlpha = 1; cctx.fillStyle = fg; cctx.font = "12px 'Open Sans', sans-serif";
      for (let k = -1; k <= 3; k++) cctx.fillText((10 ** k) + " px", 4, Y(10 ** k) + 4);
      cctx.fillText("iteration", R - 60, B + 22);
      cctx.strokeStyle = GOLD; cctx.lineWidth = 2.5; cctx.beginPath();
      history.forEach((v, k) => { const x = L + (k / 25) * (R - L); k ? cctx.lineTo(x, Y(v)) : cctx.moveTo(x, Y(v)); });
      cctx.stroke();
      history.forEach((v, k) => { const x = L + (k / 25) * (R - L); cctx.fillStyle = GOLD; cctx.beginPath(); cctx.arc(x, Y(v), 3.5, 0, Math.PI * 2); cctx.fill(); });

      const pErr = est.p.reduce((s, p, j) => s + Math.hypot(p[0] - ptT[j][0], p[1] - ptT[j][1]), 0) / NP;
      const now = history[history.length - 1];
      readout.innerHTML = `${obs.length} observations of ${NP} points by ${NC} cameras. RMS reprojection error <b>${now.toFixed(2)} px</b> (the measurements have 0.4 px of noise). Mean point error <b>${(pErr * 100).toFixed(1)} cm</b>. ${history.length > 1 ? `Iteration ${history.length - 1}.` : "Press <b>Run</b> to optimize."}`;
    }
    Nz.set(0.25);
    shake();
  }

  /* ---------- 9. COLMAP-style output files ---------- */
  async function colmap() {
    const root = document.getElementById("sfm-colmap");
    if (!root) return;
    const pre = $(root, "pre");
    let D;
    try { D = await data(); } catch { pre.textContent = "The scene data could not be loaded."; return; }
    const { K, W, H, cams, points } = D;
    function quat(R) {
      const tr = R[0][0] + R[1][1] + R[2][2];
      let w, x, y, z;
      if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        w = 0.25 * s; x = (R[2][1] - R[1][2]) / s; y = (R[0][2] - R[2][0]) / s; z = (R[1][0] - R[0][1]) / s;
      } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
        const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
        w = (R[2][1] - R[1][2]) / s; x = 0.25 * s; y = (R[0][1] + R[1][0]) / s; z = (R[0][2] + R[2][0]) / s;
      } else if (R[1][1] > R[2][2]) {
        const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
        w = (R[0][2] - R[2][0]) / s; x = (R[0][1] + R[1][0]) / s; y = 0.25 * s; z = (R[1][2] + R[2][1]) / s;
      } else {
        const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
        w = (R[1][0] - R[0][1]) / s; x = (R[0][2] + R[2][0]) / s; y = (R[1][2] + R[2][1]) / s; z = 0.25 * s;
      }
      if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
      return [w, x, y, z];
    }
    const f = (x, d = 6) => x.toFixed(d);
    // 2D keypoint lists per image, indexed so points3D can refer to them
    const kp = cams.views.map(() => []);
    const track = points.map(() => []);
    points.forEach((p, j) => {
      p.v.forEach((vi) => {
        const q = project(K, cams.views[vi].R, cams.views[vi].t, p.X);
        track[j].push([vi + 1, kp[vi].length]);
        kp[vi].push([q.u, q.v, j + 1]);
      });
    });
    const files = {
      cameras: [
        "# Camera list with one line of data per camera:",
        "#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]",
        "# Number of cameras: 1",
        `1 PINHOLE ${W} ${H} ${f(K[0][0], 4)} ${f(K[1][1], 4)} ${f(K[0][2], 1)} ${f(K[1][2], 1)}`
      ],
      images: [
        "# Image list with two lines of data per image:",
        "#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME",
        "#   POINTS2D[] as (X, Y, POINT3D_ID)",
        `# Number of images: ${cams.views.length}`,
        ...cams.views.flatMap((v, i) => [
          `${i + 1} ${quat(v.R).map((x) => f(x)).join(" ")} ${v.t.map((x) => f(x)).join(" ")} 1 ${v.file}`,
          kp[i].slice(0, 3).map(([u, vv, id]) => `${f(u, 2)} ${f(vv, 2)} ${id}`).join(" ") + ` ... (${kp[i].length} points)`
        ])
      ],
      points3D: [
        "# 3D point list with one line of data per point:",
        "#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)",
        `# Number of points: ${points.length}`,
        ...points.slice(0, 12).map((p, j) => `${j + 1} ${p.X.map((x) => f(x, 4)).join(" ")} ${p.c.join(" ")} 0.0 ${track[j].map(([a, b]) => `${a} ${b}`).join(" ")}`),
        "..."
      ]
    };
    function show(name) {
      $$(root, "[data-file]").forEach((b) => b.classList.toggle("is-on", b.dataset.file === name));
      pre.textContent = files[name].join("\n");
    }
    $$(root, "[data-file]").forEach((b) => b.addEventListener("click", () => show(b.dataset.file)));
    show("images");
  }

  function init() {
    views(); matching(); ransacCount(); fourPoses(); scaleAmbiguity(); pnp(); incremental(); bundle(); colmap();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
