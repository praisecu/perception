/*
 * Interactive figures for Chapter 10, Stereo and Two-View Geometry.
 * Each figure looks for its own element id and does nothing if absent.
 * Images are Blender renders with known cameras (media/stereo/cameras.json).
 */
(() => {
  const MEDIA = "media/stereo/";
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

  function slider(root, name, onChange, format = (v) => v) {
    const input = $(root, `input[name="${name}"]`);
    const out = input.parentElement.querySelector("output");
    const update = () => {
      if (out) out.textContent = format(Number(input.value));
      onChange();
    };
    input.addEventListener("input", update);
    return { input, value: () => Number(input.value), init: update };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  let assetsPromise = null;
  function assets() {
    if (!assetsPromise) {
      assetsPromise = Promise.all([
        loadImage(MEDIA + "left.jpg"),
        loadImage(MEDIA + "right.jpg"),
        loadImage(MEDIA + "verged_right.jpg"),
        loadImage(MEDIA + "gt_disparity.png"),
        fetch(MEDIA + "cameras.json").then((r) => r.json())
      ]).then(([left, right, verged, gt, cams]) => {
        const W = cams.width, H = cams.height;
        const pixels = (img) => {
          const c = document.createElement("canvas");
          c.width = W; c.height = H;
          const x = c.getContext("2d", { willReadFrequently: true });
          x.drawImage(img, 0, 0, W, H);
          return x.getImageData(0, 0, W, H);
        };
        const gray = (data) => {
          const g = new Float32Array(W * H);
          for (let i = 0, j = 0; j < g.length; i += 4, j++) {
            g[j] = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
          }
          return g;
        };
        const L = pixels(left), R = pixels(right), V = pixels(verged), G = pixels(gt);
        const gtDisp = new Float32Array(W * H);
        for (let j = 0; j < gtDisp.length; j++) gtDisp[j] = G.data[j * 4] / 2;
        return {
          W, H, cams, left, right, verged,
          L, R, V, gL: gray(L), gR: gray(R), gtDisp,
          f: cams.K[0][0], B: cams.baseline
        };
      });
    }
    return assetsPromise;
  }

  // Map position on a canvas (CSS pixels) to canvas pixels.
  function canvasPoint(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * canvas.width,
      y: ((event.clientY - r.top) / r.height) * canvas.height
    };
  }

  // Perceptually ordered colormap (a compact "turbo" approximation).
  function turbo(t) {
    t = Math.min(1, Math.max(0, t));
    const r = 34.61 + t * (1172.33 + t * (-10793.56 + t * (33300.12 + t * (-38394.49 + t * 14825.05))));
    const g = 23.31 + t * (557.33 + t * (1225.33 + t * (-3574.96 + t * (1073.77 + t * 707.56))));
    const b = 27.2 + t * (3211.1 + t * (-15327.97 + t * (27814 + t * (-22569.18 + t * 6838.66))));
    return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))));
  }

  /* ---------- small 3x3 linear algebra ---------- */
  const mat = {
    mul(A, B) {
      return A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
    },
    vec(A, v) { return A.map((row) => row.reduce((s, a, k) => s + a * v[k], 0)); },
    T(A) { return A[0].map((_, j) => A.map((row) => row[j])); },
    skew(t) { return [[0, -t[2], t[1]], [t[2], 0, -t[0]], [-t[1], t[0], 0]]; },
    inv(A) {
      const [a, b, c] = A[0], [d, e, f] = A[1], [g, h, i] = A[2];
      const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
      return [
        [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
        [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
        [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]
      ];
    }
  };

  /* ---------- 1. Stereo viewer ---------- */
  async function viewer() {
    const root = document.getElementById("stereo-viewer");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let A;
    try { A = await assets(); } catch { readout.textContent = "The images could not be loaded."; return; }
    const { W, H } = A;
    let timer = null, flip = false, current = "wiggle";

    const notes = {
      side: "Parallel viewing: relax your eyes as if looking far away until the two images fuse.",
      cross: "Cross-eyed viewing: the images are swapped. Cross your eyes slightly until a third image appears in the middle.",
      anaglyph: "Red-cyan anaglyph: wear red-cyan glasses (red over the left eye). Each eye sees only its own image.",
      wiggle: "Wiggle stereo: the two views alternate. Near drones jump much more than the far wall: that jump is disparity."
    };

    function show(mode) {
      current = mode;
      clearInterval(timer); timer = null;
      $$(root, "[data-mode]").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === mode));
      readout.textContent = notes[mode];
      if (mode === "side" || mode === "cross") {
        canvas.width = W * 2; canvas.height = H;
        const [a, b] = mode === "side" ? [A.left, A.right] : [A.right, A.left];
        ctx.drawImage(a, 0, 0, W, H); ctx.drawImage(b, W, 0, W, H);
      } else if (mode === "anaglyph") {
        canvas.width = W; canvas.height = H;
        const out = ctx.createImageData(W, H);
        for (let i = 0; i < out.data.length; i += 4) {
          // red from the left eye, green and blue from the right eye
          out.data[i] = 0.299 * A.L.data[i] + 0.587 * A.L.data[i + 1] + 0.114 * A.L.data[i + 2];
          out.data[i + 1] = A.R.data[i + 1];
          out.data[i + 2] = A.R.data[i + 2];
          out.data[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
      } else {
        canvas.width = W; canvas.height = H;
        const draw = () => { flip = !flip; ctx.drawImage(flip ? A.right : A.left, 0, 0, W, H); };
        draw();
        timer = setInterval(draw, 180);
      }
    }
    $$(root, "[data-mode]").forEach((b) => b.addEventListener("click", () => show(b.dataset.mode)));
    show("wiggle");
    // Stop wiggling when the figure scrolls out of view.
    new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && timer) { clearInterval(timer); timer = null; }
      else if (e.isIntersecting && current === "wiggle" && !timer) show("wiggle");
    }).observe(root);
  }

  /* ---------- 2. Disparity and depth ---------- */
  function disparity() {
    const root = document.getElementById("disparity-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const plot = $(root, "canvas");
    const pctx = plot.getContext("2d");
    const readout = $(root, ".sim__readout");
    const ns = "http://www.w3.org/2000/svg";
    const f = 622; // focal length in pixels, as in the chapter's renders
    const Z = slider(root, "Z", draw, (v) => v.toFixed(2) + " m");
    const B = slider(root, "B", draw, (v) => (v * 100).toFixed(0) + " cm");
    const Xs = slider(root, "X", draw, (v) => v.toFixed(2) + " m");

    function el(tag, attrs, text) {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text) e.textContent = text;
      svg.appendChild(e);
      return e;
    }

    function draw() {
      svg.innerHTML = "";
      const z = Z.value(), b = B.value(), xw = Xs.value();
      // Schematic top-down view (horizontal and depth scales differ)
      const sx = 1100, sz = 44, cy = 300, cx = 360, fz = 34;
      const xL = cx - (b / 2) * sx, xR = cx + (b / 2) * sx;
      const px = cx + xw * 600, py = cy - z * sz;
      el("line", { x1: 40, y1: cy - fz, x2: 680, y2: cy - fz, class: "st-plane" });
      el("text", { x: 46, y: cy - fz - 6, class: "st-small" }, "image planes");
      for (const [x, name] of [[xL, "L"], [xR, "R"]]) {
        el("polygon", { points: `${x},${cy} ${x - 14},${cy + 16} ${x + 14},${cy + 16}`, class: "st-cam" });
        el("text", { x, y: cy + 32, class: "st-label" }, name);
        el("line", { x1: px, y1: py, x2: x, y2: cy, class: "st-ray" });
      }
      // where each ray crosses the image plane
      const hitL = xL + (px - xL) * (fz / (cy - py));
      const hitR = xR + (px - xR) * (fz / (cy - py));
      el("circle", { cx: hitL, cy: cy - fz, r: 5, class: "st-hit" });
      el("circle", { cx: hitR, cy: cy - fz, r: 5, class: "st-hit" });
      el("line", { x1: xL, y1: cy + 44, x2: xR, y2: cy + 44, class: "st-base" });
      el("text", { x: cx, y: cy + 60, class: "st-small" }, "baseline B");
      el("circle", { cx: px, cy: py, r: 8, class: "st-point" });
      el("text", { x: px + 12, y: py - 10, class: "st-label st-label--left" }, "X");

      const d = (f * b) / z;
      const dz = (z * z) / (f * b) * 0.5; // depth error for half a pixel of disparity error
      readout.innerHTML =
        `Disparity <b>d = f B / Z = ${f} × ${b.toFixed(2)} / ${z.toFixed(2)} = ${d.toFixed(1)} px</b>. ` +
        `A half-pixel matching error moves the depth by about <b>±${dz < 0.1 ? (dz * 100).toFixed(1) + " cm" : dz.toFixed(2) + " m"}</b>.`;
      drawPlot(b, z);
    }

    function drawPlot(b, zNow) {
      const Wp = (plot.width = 640), Hp = (plot.height = 220);
      const m = { l: 52, r: 14, t: 14, b: 36 };
      const zmax = 6, emax = 1.0;
      const X = (z) => m.l + (z / zmax) * (Wp - m.l - m.r);
      const Y = (e) => Hp - m.b - (Math.min(e, emax) / emax) * (Hp - m.t - m.b);
      const style = getComputedStyle(root);
      const fg = style.color;
      pctx.clearRect(0, 0, Wp, Hp);
      pctx.strokeStyle = fg; pctx.globalAlpha = 0.35; pctx.lineWidth = 1;
      pctx.beginPath(); pctx.moveTo(m.l, m.t); pctx.lineTo(m.l, Hp - m.b); pctx.lineTo(Wp - m.r, Hp - m.b); pctx.stroke();
      pctx.globalAlpha = 0.8; pctx.fillStyle = fg; pctx.font = "12px 'Open Sans', sans-serif";
      for (let z = 0; z <= zmax; z++) pctx.fillText(z + " m", X(z) - 8, Hp - m.b + 16);
      for (const e of [0, 0.25, 0.5, 0.75, 1]) pctx.fillText(e.toFixed(2), 8, Y(e) + 4);
      pctx.fillText("depth Z", Wp / 2 - 20, Hp - 4);
      pctx.save(); pctx.translate(14, Hp / 2 + 30); pctx.rotate(-Math.PI / 2); pctx.fillText("error (m)", 0, 0); pctx.restore();
      const curve = (bb, color, width) => {
        pctx.strokeStyle = color; pctx.lineWidth = width; pctx.globalAlpha = 1;
        pctx.beginPath();
        for (let i = 0; i <= 200; i++) {
          const z = (i / 200) * zmax;
          const e = (z * z) / (f * bb) * 0.5;
          i ? pctx.lineTo(X(z), Y(e)) : pctx.moveTo(X(z), Y(e));
        }
        pctx.stroke();
      };
      curve(0.05, "rgba(150,150,150,0.6)", 1.2);
      curve(0.3, "rgba(150,150,150,0.6)", 1.2);
      curve(b, "#cfb97d", 3);
      const e = (zNow * zNow) / (f * b) * 0.5;
      pctx.fillStyle = "#cfb97d";
      pctx.beginPath(); pctx.arc(X(zNow), Y(e), 6, 0, Math.PI * 2); pctx.fill();
      pctx.fillStyle = fg; pctx.globalAlpha = 0.7;
      pctx.fillText("gray: B = 5 cm (top) and 30 cm (bottom)", m.l + 10, m.t + 12);
      pctx.globalAlpha = 1;
    }
    Z.init(); B.init(); Xs.init();
  }

  /* ---------- 3. Matching along a scanline ---------- */
  async function matcher() {
    const root = document.getElementById("match-sim");
    if (!root) return;
    const [cl, cr] = $$(root, ".st-pair canvas");
    const chart = $(root, ".st-chart");
    const readout = $(root, ".sim__readout");
    let A;
    try { A = await assets(); } catch { readout.textContent = "The images could not be loaded."; return; }
    const { W, H, gL, gR, gtDisp } = A;
    [cl, cr].forEach((c) => { c.width = W; c.height = H; });
    const lctx = cl.getContext("2d"), rctx = cr.getContext("2d"), cctx = chart.getContext("2d");
    let pt = { x: 236, y: 226 }, cost = "SAD";
    const D = 130;
    const R = slider(root, "win", draw, (v) => (2 * v + 1) + " × " + (2 * v + 1));

    function costs(u, v, r) {
      const out = new Float32Array(D + 1).fill(NaN);
      for (let d = 0; d <= D; d++) {
        if (u - d - r < 0) break;
        let sad = 0, ssd = 0, sl = 0, sr = 0, sll = 0, srr = 0, slr = 0, n = 0;
        for (let dy = -r; dy <= r; dy++) {
          const y = Math.min(H - 1, Math.max(0, v + dy));
          for (let dx = -r; dx <= r; dx++) {
            const xl = Math.min(W - 1, Math.max(0, u + dx));
            const a = gL[y * W + xl], b = gR[y * W + xl - d];
            const diff = a - b;
            sad += Math.abs(diff); ssd += diff * diff;
            sl += a; sr += b; sll += a * a; srr += b * b; slr += a * b; n++;
          }
        }
        if (cost === "SAD") out[d] = sad / n;
        else if (cost === "SSD") out[d] = ssd / n;
        else {
          const cov = slr - (sl * sr) / n;
          const va = sll - (sl * sl) / n, vb = srr - (sr * sr) / n;
          const ncc = cov / Math.sqrt(Math.max(1e-6, va * vb));
          out[d] = 1 - ncc; // lower is better, like the others
        }
      }
      return out;
    }

    function box(ctx, x, y, r, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.strokeRect(x - r - 0.5, y - r - 0.5, 2 * r + 1, 2 * r + 1);
    }

    function draw() {
      const r = R.value();
      const u = Math.round(pt.x), v = Math.round(pt.y);
      const c = costs(u, v, r);
      let best = 0, bestVal = Infinity;
      c.forEach((val, d) => { if (!isNaN(val) && val < bestVal) { bestVal = val; best = d; } });
      const truth = gtDisp[v * W + u];

      lctx.drawImage(A.left, 0, 0, W, H);
      rctx.drawImage(A.right, 0, 0, W, H);
      box(lctx, u, v, r, "#cfb97d");
      rctx.fillStyle = "rgba(207,185,125,0.18)";
      rctx.fillRect(0, v - r, W, 2 * r + 1);
      box(rctx, u - best, v, r, "#ff5d5d");
      rctx.strokeStyle = "rgba(255,255,255,0.8)"; rctx.setLineDash([4, 4]);
      rctx.beginPath(); rctx.moveTo(u, 0); rctx.lineTo(u, H); rctx.stroke(); rctx.setLineDash([]);
      lctx.fillStyle = "#cfb97d"; lctx.beginPath(); lctx.arc(u, v, 3, 0, Math.PI * 2); lctx.fill();

      // cost curve
      const Wc = (chart.width = 640), Hc = (chart.height = 200);
      const m = { l: 44, r: 12, t: 12, b: 32 };
      const vals = Array.from(c).filter((x) => !isNaN(x));
      const vmax = Math.max(...vals), vmin = Math.min(...vals);
      const X = (d) => m.l + (d / D) * (Wc - m.l - m.r);
      const Y = (val) => Hc - m.b - ((val - vmin) / Math.max(1e-6, vmax - vmin)) * (Hc - m.t - m.b);
      const fg = getComputedStyle(root).color;
      cctx.clearRect(0, 0, Wc, Hc);
      cctx.globalAlpha = 0.35; cctx.strokeStyle = fg;
      cctx.beginPath(); cctx.moveTo(m.l, m.t); cctx.lineTo(m.l, Hc - m.b); cctx.lineTo(Wc - m.r, Hc - m.b); cctx.stroke();
      cctx.globalAlpha = 0.8; cctx.fillStyle = fg; cctx.font = "12px 'Open Sans', sans-serif";
      for (let d = 0; d <= D; d += 20) cctx.fillText(d, X(d) - 6, Hc - m.b + 15);
      cctx.fillText("disparity d (px)", Wc / 2 - 40, Hc - 3);
      cctx.save(); cctx.translate(14, Hc / 2 + 40); cctx.rotate(-Math.PI / 2); cctx.fillText(cost + " cost", 0, 0); cctx.restore();
      cctx.globalAlpha = 1;
      if (truth > 0) {
        cctx.strokeStyle = "#4fb3ff"; cctx.lineWidth = 2; cctx.setLineDash([5, 4]);
        cctx.beginPath(); cctx.moveTo(X(truth), m.t); cctx.lineTo(X(truth), Hc - m.b); cctx.stroke(); cctx.setLineDash([]);
      }
      cctx.strokeStyle = "#cfb97d"; cctx.lineWidth = 2.5; cctx.beginPath();
      let started = false;
      c.forEach((val, d) => { if (isNaN(val)) return; started ? cctx.lineTo(X(d), Y(val)) : cctx.moveTo(X(d), Y(val)); started = true; });
      cctx.stroke();
      cctx.fillStyle = "#ff5d5d"; cctx.beginPath(); cctx.arc(X(best), Y(bestVal), 6, 0, Math.PI * 2); cctx.fill();

      const err = Math.abs(best - truth);
      const depth = (A.f * A.B) / Math.max(best, 0.5);
      readout.innerHTML =
        `Best match at <b>d = ${best} px</b> (red), so Z ≈ ${depth.toFixed(2)} m. ` +
        (truth > 0 ? `Ground truth (blue): ${truth.toFixed(1)} px. ` : "") +
        (truth > 0 && err > 2 ? "<b>Wrong match.</b> Try a larger window or another cost." : truth > 0 ? "<b>Correct.</b>" : "");
    }

    let dragging = false;
    const move = (e) => { pt = canvasPoint(cl, e); pt.x = Math.max(1, Math.min(W - 2, pt.x)); pt.y = Math.max(1, Math.min(H - 2, pt.y)); draw(); };
    cl.addEventListener("pointerdown", (e) => { dragging = true; cl.setPointerCapture(e.pointerId); move(e); });
    cl.addEventListener("pointermove", (e) => { if (dragging) move(e); });
    cl.addEventListener("pointerup", () => { dragging = false; });
    $$(root, "[data-cost]").forEach((b) => b.addEventListener("click", () => {
      cost = b.dataset.cost;
      $$(root, "[data-cost]").forEach((x) => x.classList.toggle("is-on", x === b));
      draw();
    }));
    $$(root, "[data-spot]").forEach((b) => b.addEventListener("click", () => {
      const [x, y] = b.dataset.spot.split(",").map(Number);
      pt = { x, y }; draw();
    }));
    R.init();
  }

  /* ---------- 4. Block matching ---------- */
  async function blockMatching() {
    const root = document.getElementById("bm-sim");
    if (!root) return;
    const [cOut, cGt] = $$(root, "canvas");
    const readout = $(root, ".sim__readout");
    let A;
    try { A = await assets(); } catch { readout.textContent = "The images could not be loaded."; return; }
    // Work at half resolution so it runs quickly in the browser.
    const s = 2, W = A.W / s, H = A.H / s;
    const down = (g) => {
      const o = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * s * A.W + x * s;
        o[y * W + x] = (g[i] + g[i + 1] + g[i + A.W] + g[i + A.W + 1]) / 4;
      }
      return o;
    };
    const toInt = (g) => Int32Array.from(g, (v) => Math.round(v));
    const gL = toInt(down(A.gL)), gR = toInt(down(A.gR));
    const gt = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) gt[y * W + x] = A.gtDisp[y * s * A.W + x * s] / s;
    [cOut, cGt].forEach((c) => { c.width = W; c.height = H; });
    const MAXD = 66; // in half-resolution pixels (132 at full resolution)

    // Ground truth panel
    const gctx = cGt.getContext("2d");
    const gimg = gctx.createImageData(W, H);
    for (let i = 0; i < gt.length; i++) {
      const [r, g, b] = turbo(gt[i] / MAXD);
      gimg.data.set([r, g, b, 255], i * 4);
    }
    gctx.putImageData(gimg, 0, 0);

    const Bk = slider(root, "block", schedule, (v) => (2 * v + 1) + " × " + (2 * v + 1));
    const Dm = slider(root, "maxd", schedule, (v) => v * s + " px");
    let lr = false;
    $(root, "[data-action=lr]").addEventListener("click", (e) => {
      lr = !lr;
      e.target.classList.toggle("is-on", lr);
      e.target.textContent = lr ? "Left-right check: on" : "Left-right check: off";
      schedule();
    });

    let uniq = false;
    $(root, "[data-action=unique]").addEventListener("click", (e) => {
      uniq = !uniq;
      e.target.classList.toggle("is-on", uniq);
      e.target.textContent = uniq ? "Uniqueness check: on" : "Uniqueness check: off";
      schedule();
    });

    let timer = null;
    function schedule() { clearTimeout(timer); timer = setTimeout(run, 30); }

    // Disparity by winner-take-all over box-filtered absolute differences.
    function match(ref, other, sign, r, maxd, unique = false) {
      const best = new Int32Array(W * H).fill(2147483647);
      const second = new Int32Array(W * H).fill(2147483647);
      const disp = new Int16Array(W * H).fill(-1);
      const ii = new Int32Array((W + 1) * (H + 1));
      for (let d = 0; d <= maxd; d++) {
        // integral image of |ref(x) - other(x - sign*d)|
        for (let y = 0; y < H; y++) {
          let rowSum = 0;
          for (let x = 0; x < W; x++) {
            const xo = x - sign * d;
            const diff = xo >= 0 && xo < W ? ref[y * W + x] - other[y * W + xo] : 255;
            const v = diff < 0 ? -diff : diff;
            rowSum += v;
            ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + rowSum;
          }
        }
        for (let y = r; y < H - r; y++) {
          for (let x = r; x < W - r; x++) {
            const x0 = x - r, x1 = x + r + 1, y0 = y - r, y1 = y + r + 1;
            const sum = ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0];
            const k = y * W + x;
            if (sum < best[k]) {
              if (Math.abs(d - disp[k]) > 1) second[k] = best[k];
              best[k] = sum; disp[k] = d;
            } else if (sum < second[k] && Math.abs(d - disp[k]) > 1) {
              second[k] = sum;
            }
          }
        }
      }
      if (unique) {
        // Reject pixels whose runner-up match is almost as good (ambiguous texture)
        for (let k = 0; k < disp.length; k++) {
          if (disp[k] >= 0 && second[k] < 2147483647 && best[k] * 1.15 > second[k]) disp[k] = -1;
        }
      }
      return disp;
    }

    function run() {
      const t0 = performance.now();
      const r = Bk.value(), maxd = Math.round(Dm.value());
      const dl = match(gL, gR, 1, r, maxd, uniq);
      let dr = null;
      if (lr) dr = match(gR, gL, -1, r, maxd);
      const ctx = cOut.getContext("2d");
      const img = ctx.createImageData(W, H);
      let valid = 0, good = 0, total = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        let d = dl[k];
        if (d >= 0 && dr) {
          const xr = x - d;
          if (xr < 0 || Math.abs(dr[y * W + xr] - d) > 1) d = -1;
        }
        let rgb = [40, 40, 40];
        if (d >= 0) {
          rgb = turbo(d / MAXD);
          valid++;
          if (gt[k] > 0 && Math.abs(d - gt[k]) * s <= 2) good++;
        }
        if (gt[k] > 0) total++;
        img.data.set([...rgb, 255], k * 4);
      }
      ctx.putImageData(img, 0, 0);
      const ms = performance.now() - t0;
      readout.innerHTML =
        `<b>${((100 * good) / Math.max(1, valid)).toFixed(0)}%</b> of the estimated pixels are within 2 px of the truth, ` +
        `covering ${((100 * valid) / Math.max(1, total)).toFixed(0)}% of the image` +
        (lr || uniq ? " (gray pixels were rejected by the checks)" : "") +
        `. Computed in ${ms.toFixed(0)} ms on your device.`;
    }
    Bk.init(); Dm.init();
  }

  /* ---------- 5. Epipolar lines on a real pair ---------- */
  async function epipolar() {
    const root = document.getElementById("epi-sim");
    if (!root) return;
    const [c1, c2] = $$(root, ".st-pair canvas");
    const readout = $(root, ".sim__readout");
    let A;
    try { A = await assets(); } catch { readout.textContent = "The images could not be loaded."; return; }
    const { W, H, cams } = A;
    [c1, c2].forEach((c) => { c.width = W; c.height = H; });
    const ctx1 = c1.getContext("2d"), ctx2 = c2.getContext("2d");
    const K = cams.K, Ki = mat.inv(K);
    const R1 = cams.left.R, t1 = cams.left.t, R2 = cams.verged_right.R, t2 = cams.verged_right.t;
    // Relative pose of camera 2 with respect to camera 1
    const R = mat.mul(R2, mat.T(R1));
    const Rt1 = mat.vec(R, t1);
    const t = [t2[0] - Rt1[0], t2[1] - Rt1[1], t2[2] - Rt1[2]];
    const E = mat.mul(mat.skew(t), R);
    const F = mat.mul(mat.mul(mat.T(Ki), E), Ki);
    const proj = (Rc, tc, X) => { const p = mat.vec(K, mat.vec(Rc, X).map((v, i) => v + tc[i])); return [p[0] / p[2], p[1] / p[2], p[2]]; };
    const C1 = cams.left.C, C2 = cams.verged_right.C;
    const e2 = proj(R2, t2, C1), e1 = proj(R1, t1, C2);

    const colors = ["#cfb97d", "#ff6b6b", "#4fb3ff", "#7ddc7a", "#d58cff", "#ffa94d"];
    let pts = [];

    function line(ctx, l, color) {
      // a x + b y + c = 0, clipped to the image
      const [a, b, c] = l;
      const P = [];
      if (Math.abs(b) > 1e-9) { P.push([0, -c / b]); P.push([W, -(c + a * W) / b]); }
      else { P.push([-c / a, 0]); P.push([-c / a, H]); }
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.stroke();
    }
    function dot(ctx, x, y, color, r = 5) {
      ctx.fillStyle = color; ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    function draw() {
      ctx1.drawImage(A.left, 0, 0, W, H);
      ctx2.drawImage(A.verged, 0, 0, W, H);
      pts.forEach((p, i) => {
        const color = colors[i % colors.length];
        const l2 = mat.vec(F, [p.x, p.y, 1]);
        line(ctx2, l2, color);
        dot(ctx1, p.x, p.y, color);
        // the true match, from the ground-truth depth of the left image
        const d = A.gtDisp[Math.round(p.y) * W + Math.round(p.x)];
        if (d > 0) {
          const Z = (A.f * A.B) / d;
          const ray = mat.vec(Ki, [p.x, p.y, 1]).map((v) => v * Z);
          const Xw = mat.vec(mat.T(R1), ray.map((v, k) => v - t1[k]));
          const q = proj(R2, t2, Xw);
          if (q[2] > 0) dot(ctx2, q[0], q[1], color, 7);
        }
      });
      readout.innerHTML = pts.length
        ? `Each point on the left constrains its match to one line on the right. The large dots show the true matches: they always sit on the line. ` +
          `Epipole in the right image: (${e2[0].toFixed(0)}, ${e2[1].toFixed(0)}) px${e2[0] < 0 || e2[0] > W || e2[1] < 0 || e2[1] > H ? ", outside the frame, where all the lines meet" : ""}.`
        : "Click anywhere on the left image.";
    }
    c1.addEventListener("pointerdown", (e) => {
      const p = canvasPoint(c1, e);
      pts.push(p); if (pts.length > 6) pts.shift();
      draw();
    });
    $(root, "[data-action=clear]").addEventListener("click", () => { pts = []; draw(); });
    $(root, "[data-action=demo]").addEventListener("click", () => {
      pts = [{ x: 231, y: 222 }, { x: 427, y: 182 }, { x: 310, y: 161 }, { x: 120, y: 60 }, { x: 520, y: 300 }];
      draw();
    });
    const Fs = F.map((r) => r.map((v) => v / F[2][2]));
    const fm = $(root, ".st-matrix");
    if (fm) fm.textContent = "F ∝\n" + Fs.map((r) => r.map((v) => (v >= 0 ? " " : "") + v.toExponential(2)).join("  ")).join("\n");
    pts = [{ x: 231, y: 222 }, { x: 427, y: 182 }];
    draw();
  }

  /* ---------- 6. The epipolar plane in 3D ---------- */
  function epiPlane() {
    const root = document.getElementById("plane-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const Wc = (canvas.width = 720), Hc = (canvas.height = 420);
    let yaw = -0.55, pitch = 0.35;

    const v3 = {
      add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]),
      mul: (a, s) => a.map((x) => x * s), dot: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
      norm: (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); },
      cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    };
    // Two cameras looking roughly at the origin region (z forward, y up)
    function camera(C, target) {
      const fwd = v3.norm(v3.sub(target, C));
      const right = v3.norm(v3.cross(fwd, [0, 1, 0]));
      const up = v3.cross(right, fwd);
      return { C, fwd, right, up, f: 0.55 };
    }
    const cam1 = camera([-0.7, 0, 0], [0, 0, 2.2]);
    const cam2 = camera([0.7, 0.12, 0.15], [0, 0, 2.2]);
    const S = slider(root, "s", draw, (v) => v.toFixed(2) + " m");
    const Hs = slider(root, "h", draw, (v) => v.toFixed(2));

    // project a world point onto a camera's image plane (in 3D)
    function onPlane(cam, P) {
      const d = v3.sub(P, cam.C);
      const k = cam.f / v3.dot(d, cam.fwd);
      return v3.add(cam.C, v3.mul(d, k));
    }
    // viewer projection
    function view(P) {
      const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const p = v3.sub(P, [0, 0, 1.0]);
      const x = c * p[0] - s * p[2];
      const z1 = s * p[0] + c * p[2];
      const y = cp * p[1] - sp * z1;
      const z = sp * p[1] + cp * z1 + 4.2;
      const k = 900 / z;
      return [Wc / 2 + x * k, Hc / 2 - y * k];
    }
    function poly(points, fill, stroke, width = 1.5, dash = []) {
      ctx.beginPath();
      points.map(view).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.setLineDash(dash); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]); }
    }
    function seg(a, b, color, width = 1.5, dash = []) {
      const [x1, y1] = view(a), [x2, y2] = view(b);
      ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    }
    function pt(P, color, r = 5, label) {
      const [x, y] = view(P);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (label) { ctx.fillStyle = getComputedStyle(root).color; ctx.font = "bold 14px 'Nunito Sans', sans-serif"; ctx.fillText(label, x + 8, y - 8); }
    }
    function planeCorners(cam) {
      const c = v3.add(cam.C, v3.mul(cam.fwd, cam.f));
      const w = 0.42, h = 0.3;
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => v3.add(c, v3.add(v3.mul(cam.right, a * w), v3.mul(cam.up, b * h))));
    }

    // Clip the segment p-q (both on the camera's image plane) to the plane's rectangle.
    function clipToPlane(cam, p, q) {
      const c = v3.add(cam.C, v3.mul(cam.fwd, cam.f));
      const uv = (P) => { const d = v3.sub(P, c); return [v3.dot(d, cam.right), v3.dot(d, cam.up)]; };
      const [u0, w0] = uv(p), [u1, w1] = uv(q);
      let t0 = 0, t1 = 1;
      const du = u1 - u0, dw = w1 - w0;
      for (const [pp, qq] of [[-du, u0 + 0.42], [du, 0.42 - u0], [-dw, w0 + 0.3], [dw, 0.3 - w0]]) {
        if (Math.abs(pp) < 1e-12) { if (qq < 0) return null; continue; }
        const r = qq / pp;
        if (pp < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
        if (t0 > t1) return null;
      }
      const at = (t) => v3.add(p, v3.mul(v3.sub(q, p), t));
      return [at(t0), at(t1)];
    }

    function draw() {
      ctx.clearRect(0, 0, Wc, Hc);
      const fg = getComputedStyle(root).color;
      const s = S.value(), h = Hs.value();
      // X lies on a fixed ray from camera 1; the slider moves it along that ray
      const rayDir = v3.norm(v3.add(cam1.fwd, v3.add(v3.mul(cam1.right, 0.35), v3.mul(cam1.up, h))));
      const X = v3.add(cam1.C, v3.mul(rayDir, s));
      // epipolar plane
      poly([cam1.C, cam2.C, X], "rgba(207,185,125,0.18)", "rgba(207,185,125,0.6)");
      // image planes
      poly(planeCorners(cam1), "rgba(120,160,255,0.10)", fg, 1.2);
      poly(planeCorners(cam2), "rgba(120,160,255,0.10)", fg, 1.2);
      // baseline and epipoles
      seg(cam1.C, cam2.C, fg, 2);
      const e1 = onPlane(cam1, cam2.C), e2 = onPlane(cam2, cam1.C);
      // ray from camera 1, extended
      seg(cam1.C, v3.add(cam1.C, v3.mul(rayDir, 4.2)), "rgba(207,185,125,0.55)", 1.5, [6, 5]);
      seg(cam1.C, X, "#cfb97d", 2.5);
      seg(cam2.C, X, "#ff6b6b", 2.5);
      // epipolar line in image 2: projection of the whole ray
      const a = onPlane(cam2, v3.add(cam1.C, v3.mul(rayDir, 0.35)));
      const b = onPlane(cam2, v3.add(cam1.C, v3.mul(rayDir, 80))); // toward the ray's vanishing point
      // the epipolar line, clipped to the second image plane
      const clipped = clipToPlane(cam2, a, b);
      if (clipped) seg(clipped[0], clipped[1], "#4fb3ff", 3);
      pt(onPlane(cam1, X), "#cfb97d", 5, "x");
      pt(onPlane(cam2, X), "#ff6b6b", 6, "x′");
      pt(e1, "#4fb3ff", 4, "e");
      pt(e2, "#4fb3ff", 4, "e′");
      pt(cam1.C, fg, 6, "C");
      pt(cam2.C, fg, 6, "C′");
      pt(X, "#2f8f5b", 7, "X");
      readout.innerHTML = "Slide X along the gold ray. From camera C it is always the same pixel x, but in camera C′ its image x′ moves along the blue <b>epipolar line</b>, which always passes through the epipole e′. Drag the figure to turn it.";
    }

    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
      pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.008));
      draw();
    });
    canvas.addEventListener("pointerup", () => { drag = null; });
    S.init(); Hs.init();
  }

  /* ---------- 7. Triangulation with noise ---------- */
  function triangulation() {
    const root = document.getElementById("tri-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const Wc = (canvas.width = 720), Hc = (canvas.height = 360);
    const f = 622;
    const B = slider(root, "B", draw, (v) => (v * 100).toFixed(0) + " cm");
    const Z = slider(root, "Z", draw, (v) => v.toFixed(1) + " m");
    const N = slider(root, "noise", draw, (v) => v.toFixed(1) + " px");
    $(root, "[data-action=again]").addEventListener("click", draw);

    const gauss = () => {
      let u = 0, v = 0;
      while (!u) u = Math.random();
      while (!v) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    function draw() {
      const b = B.value(), z = Z.value(), sigma = N.value();
      const fg = getComputedStyle(root).color;
      ctx.clearRect(0, 0, Wc, Hc);
      // world to canvas: x in metres around 0, z from 0 to zmax
      const zmax = Math.max(1.5, z * 1.35);
      const sc = (Hc - 60) / zmax;
      const EX = 6; // sideways scale exaggerated so the spread is visible
      const toC = (x, zz) => [Wc / 2 + x * sc * EX, Hc - 30 - zz * sc];
      const camL = [-b / 2, 0], camR = [b / 2, 0], X = [0.02 * z, z];
      const est = [];
      for (let i = 0; i < 300; i++) {
        // pixel noise turns into angular noise on each ray
        const xl = (f * (X[0] - camL[0])) / X[1] + sigma * gauss();
        const xr = (f * (X[0] - camR[0])) / X[1] + sigma * gauss();
        const d = xl - xr;
        if (d <= 0.05) continue;
        const zz = (f * b) / d;
        const xx = camL[0] + (xl * zz) / f;
        est.push([xx, zz]);
      }
      // rays
      ctx.strokeStyle = "rgba(207,185,125,0.7)"; ctx.lineWidth = 1.5;
      for (const c of [camL, camR]) {
        const [x1, y1] = toC(c[0], c[1]), [x2, y2] = toC(X[0], X[1]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // estimates
      ctx.fillStyle = "rgba(255,107,107,0.45)";
      for (const [xx, zz] of est) {
        if (zz > zmax) continue;
        const [x, y] = toC(xx, zz);
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // cameras and true point
      for (const c of [camL, camR]) {
        const [x, y] = toC(c[0], c[1]);
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 14); ctx.lineTo(x + 9, y + 14); ctx.closePath(); ctx.fill();
      }
      const [tx, ty] = toC(X[0], X[1]);
      ctx.fillStyle = "#2f8f5b"; ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fg; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("top view, sideways scale exaggerated 6 times: cameras, true point (green), noisy estimates (red)", 10, Hc - 8);

      const sd = (arr) => { const m = arr.reduce((s, v) => s + v, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };
      const sz = sd(est.map((e) => e[1])), sx = sd(est.map((e) => e[0]));
      readout.innerHTML =
        `Spread of 300 noisy reconstructions: <b>${(sz * 100).toFixed(1)} cm in depth</b> but only ${(sx * 100).toFixed(1)} cm sideways. ` +
        `Depth error grows with the square of distance and shrinks with the baseline.`;
    }
    B.init(); Z.init(); N.init();
  }

  function init() {
    viewer(); disparity(); matcher(); blockMatching(); epipolar(); epiPlane(); triangulation();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
