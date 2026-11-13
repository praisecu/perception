/*
 * Interactive figures for Chapter 13, Neural Radiance Fields.
 * Each figure looks for its own element id and does nothing if absent.
 * Training loops run in small chunks on setTimeout so the page stays responsive.
 */
(() => {
  const MEDIA = "media/nerf/";
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
  const GOLD = "#cfb97d", RED = "#d9534f", BLUE = "#3b82c4", GREEN = "#2f8f5b";
  const FONT = "12px 'Open Sans', sans-serif";

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

  function canvasPoint(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * canvas.width,
      y: ((event.clientY - r.top) / r.height) * canvas.height
    };
  }

  // Seeded random numbers, so every reader sees the same starting network.
  function rng(seed) {
    let a = seed >>> 0;
    const u = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    u.normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
    return u;
  }

  const fg = (el) => getComputedStyle(el).color;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const psnr = (mse) => (mse > 0 ? -10 * Math.log10(mse) : 99);

  // Run a training loop in chunks; stops when the figure leaves the screen.
  function trainer(root, stepChunk) {
    let timer = null, running = false, visible = true;
    const tick = () => {
      timer = null;
      if (!running || !visible) return;
      stepChunk();
      timer = setTimeout(tick, 0);
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && running && !timer) timer = setTimeout(tick, 0);
    }).observe(root);
    return {
      start() { running = true; if (!timer) timer = setTimeout(tick, 0); },
      stop() { running = false; },
      get running() { return running; }
    };
  }

  /* ---------- a tiny multilayer perceptron with Adam ---------- */
  function makeMLP(sizes, seed, outAct = "linear") {
    const r = rng(seed);
    const layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const nin = sizes[i], nout = sizes[i + 1];
      const W = new Float32Array(nin * nout);
      const s = Math.sqrt((i === 0 ? 1 : 2) / nin);
      for (let k = 0; k < W.length; k++) W[k] = r.normal() * s;
      layers.push({
        nin, nout, W, b: new Float32Array(nout),
        gW: new Float32Array(nin * nout), gb: new Float32Array(nout),
        mW: new Float32Array(nin * nout), vW: new Float32Array(nin * nout),
        mb: new Float32Array(nout), vb: new Float32Array(nout)
      });
    }
    return { layers, outAct, t: 0, acts: null, n: 0 };
  }

  function mlpForward(net, X, n) {
    const acts = [X];
    let A = X;
    net.layers.forEach((L, li) => {
      const Y = new Float32Array(n * L.nout);
      const last = li === net.layers.length - 1;
      for (let r = 0; r < n; r++) {
        const xo = r * L.nin, yo = r * L.nout;
        for (let o = 0; o < L.nout; o++) {
          let s = L.b[o];
          const wo = o * L.nin;
          for (let i = 0; i < L.nin; i++) s += L.W[wo + i] * A[xo + i];
          if (!last) s = s > 0 ? s : 0;
          else if (net.outAct === "sigmoid") s = 1 / (1 + Math.exp(-s));
          Y[yo + o] = s;
        }
      }
      acts.push(Y);
      A = Y;
    });
    net.acts = acts; net.n = n;
    return A;
  }

  // dOut is the gradient of the loss with respect to the network output.
  function mlpBackward(net, dOut, lr) {
    const { acts, n, layers } = net;
    let dZ = dOut;
    if (net.outAct === "sigmoid") {
      const Y = acts[acts.length - 1];
      dZ = new Float32Array(dOut.length);
      for (let k = 0; k < dZ.length; k++) dZ[k] = dOut[k] * Y[k] * (1 - Y[k]);
    }
    for (let li = layers.length - 1; li >= 0; li--) {
      const L = layers[li], A = acts[li];
      L.gW.fill(0); L.gb.fill(0);
      const dA = li > 0 ? new Float32Array(n * L.nin) : null;
      for (let r = 0; r < n; r++) {
        const xo = r * L.nin, yo = r * L.nout;
        for (let o = 0; o < L.nout; o++) {
          const g = dZ[yo + o];
          if (g === 0) continue;
          L.gb[o] += g;
          const wo = o * L.nin;
          for (let i = 0; i < L.nin; i++) {
            L.gW[wo + i] += g * A[xo + i];
            if (dA) dA[xo + i] += g * L.W[wo + i];
          }
        }
      }
      if (dA) for (let k = 0; k < dA.length; k++) if (A[k] <= 0) dA[k] = 0;
      dZ = dA;
    }
    // Adam update
    net.t++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
    for (const L of layers) {
      for (const [p, g, m, v] of [[L.W, L.gW, L.mW, L.vW], [L.b, L.gb, L.mb, L.vb]]) {
        for (let k = 0; k < p.length; k++) {
          m[k] = b1 * m[k] + (1 - b1) * g[k];
          v[k] = b2 * v[k] + (1 - b2) * g[k] * g[k];
          p[k] -= (lr * (m[k] / c1)) / (Math.sqrt(v[k] / c2) + eps);
        }
      }
    }
  }

  // Positional encoding: x -> [x, sin(2^k pi x), cos(2^k pi x)], k = 0 .. L-1.
  function encode(coords, n, dim, L) {
    const out = new Float32Array(n * dim * (1 + 2 * L));
    const w = dim * (1 + 2 * L);
    for (let r = 0; r < n; r++) {
      let o = r * w;
      for (let d = 0; d < dim; d++) out[o++] = coords[r * dim + d];
      for (let k = 0; k < L; k++) {
        const f = Math.PI * Math.pow(2, k);
        for (let d = 0; d < dim; d++) {
          const x = coords[r * dim + d];
          out[o++] = Math.sin(f * x);
          out[o++] = Math.cos(f * x);
        }
      }
    }
    return out;
  }

  /* ---------- 1. The capture: posed views around the scene ---------- */
  async function capture() {
    const root = document.getElementById("capture-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const ns = "http://www.w3.org/2000/svg";
    let cams, images = [];
    try {
      cams = await fetch(MEDIA + "cameras.json").then((r) => r.json());
      images = cams.views.map((v) => { const im = new Image(); im.src = MEDIA + v.file; return im; });
    } catch { readout.textContent = "The rendered views could not be loaded."; return; }
    const N = cams.views.length;
    canvas.width = cams.width; canvas.height = cams.height;
    let every = 1, current = 0;
    const idx = $(root, 'input[name="view"]');
    idx.max = N - 1;
    const S = slider(root, "view", draw, (v) => `${v + 1} of ${N}`);

    function el(tag, attrs, text) {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text) e.textContent = text;
      svg.appendChild(e);
      return e;
    }

    function used(i) { return i % every === 0; }

    function draw() {
      let i = S.value();
      if (!used(i)) { i = Math.round(i / every) * every % N; idx.value = i; }
      current = i;
      const out = idx.parentElement.querySelector("output");
      if (out) out.textContent = `${i + 1} of ${N}`;
      svg.innerHTML = "";
      const cx = 180, cy = 180, sc = 175;
      const T = cams.target;
      el("circle", { cx, cy, r: 0.34 * sc, class: "nf-plinth" });
      el("text", { x: cx, y: cy + 4, class: "nf-label" }, "drone");
      cams.views.forEach((v, k) => {
        const x = cx + (v.C[0] - T[0]) * sc, y = cy - (v.C[1] - T[1]) * sc;
        const on = used(k), sel = k === current;
        const a = Math.atan2(cy - y, cx - x);
        const len = sel ? 46 : 18, half = 0.42;
        const p1 = [x + len * Math.cos(a - half), y + len * Math.sin(a - half)];
        const p2 = [x + len * Math.cos(a + half), y + len * Math.sin(a + half)];
        const g = el("polygon", {
          points: `${x},${y} ${p1} ${p2}`,
          class: "nf-cam" + (on ? "" : " is-off") + (sel ? " is-sel" : "")
        });
        g.style.cursor = on ? "pointer" : "default";
        g.addEventListener("click", () => { if (on) { idx.value = k; draw(); } });
      });
      el("text", { x: 10, y: 352, class: "nf-small" }, "top view: one camera per input image");
      const im = images[i];
      const paint = () => ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
      if (im.complete) paint(); else im.onload = paint;
      const v = cams.views[i];
      const nUsed = Math.ceil(N / every);
      readout.innerHTML =
        `Image ${i + 1}: camera at azimuth ${v.azimuth_deg.toFixed(0)}°, center ` +
        `(${v.C.map((c) => c.toFixed(2)).join(", ")}) m. ` +
        `Training set: <b>${nUsed} posed images</b>${every > 1 ? `, ${(360 / nUsed).toFixed(0)}° apart` : ""}.`;
    }

    $$(root, "[data-every]").forEach((b) => b.addEventListener("click", () => {
      every = Number(b.dataset.every);
      idx.step = every;
      $$(root, "[data-every]").forEach((o) => o.classList.toggle("is-on", o === b));
      draw();
    }));
    // drag the image to orbit around the drone
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, i: current }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const steps = Math.round((drag.x - e.clientX) / 14);
      idx.value = (((drag.i + steps * every) % N) + N) % N;
      draw();
    });
    canvas.addEventListener("pointerup", () => { drag = null; });
    S.init();
  }

  /* ---------- 2. Positional encoding in 1D ---------- */
  function pe1d() {
    const root = document.getElementById("pe-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const btn = $(root, '[data-action="train"]');
    const targets = {
      waves: (x) => 0.45 * Math.sin(Math.PI * x) + 0.25 * Math.sin(7 * Math.PI * x) + 0.15 * Math.sin(19 * Math.PI * x),
      steps: (x) => 0.7 * (Math.floor(((x + 1) * 6) % 2) - 0.5) + 0.2 * x,
      chirp: (x) => 0.6 * Math.sin(Math.PI * 4 * (x + 1) * (x + 1))
    };
    let target = "waves";
    const NT = 128, NE = 600;
    const xs = new Float32Array(NT), ys = new Float32Array(NT), xe = new Float32Array(NE);
    for (let i = 0; i < NT; i++) xs[i] = -1 + (2 * (i + 0.5)) / NT;
    for (let i = 0; i < NE; i++) xe[i] = -1 + (2 * i) / (NE - 1);
    let net, Xenc, Eenc, step = 0, loss = 0, L = 6;

    function reset() {
      for (let i = 0; i < NT; i++) ys[i] = targets[target](xs[i]);
      Xenc = encode(xs, NT, 1, L);
      Eenc = encode(xe, NE, 1, L);
      net = makeMLP([1 + 2 * L, 64, 64, 1], 7);
      step = 0; loss = 0;
      draw();
    }

    function chunk() {
      for (let k = 0; k < 15; k++) {
        const y = mlpForward(net, Xenc, NT);
        const d = new Float32Array(NT);
        loss = 0;
        for (let i = 0; i < NT; i++) { const e = y[i] - ys[i]; loss += e * e; d[i] = (2 * e) / NT; }
        loss /= NT;
        mlpBackward(net, d, 0.004);
        step++;
      }
      draw();
      if (step >= 3000) { run.stop(); btn.textContent = "Train"; }
    }
    const run = trainer(root, chunk);

    function draw() {
      const W = canvas.width, H = canvas.height, c = fg(root);
      ctx.clearRect(0, 0, W, H);
      const top = 10, h = H - 40;
      const X = (x) => 30 + ((x + 1) / 2) * (W - 40);
      const Y = (y) => top + h / 2 - y * (h / 2.4);
      ctx.strokeStyle = c; ctx.globalAlpha = 0.25; ctx.beginPath();
      ctx.moveTo(X(-1), Y(0)); ctx.lineTo(X(1), Y(0)); ctx.stroke(); ctx.globalAlpha = 1;
      // true function (thin) and training samples
      ctx.strokeStyle = c; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < NE; i++) { const p = [X(xe[i]), Y(targets[target](xe[i]))]; i ? ctx.lineTo(...p) : ctx.moveTo(...p); }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = BLUE;
      for (let i = 0; i < NT; i++) { ctx.beginPath(); ctx.arc(X(xs[i]), Y(ys[i]), 2.2, 0, 7); ctx.fill(); }
      // the network
      const out = mlpForward(net, Eenc, NE);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2.4; ctx.beginPath();
      for (let i = 0; i < NE; i++) { const p = [X(xe[i]), Y(Math.max(-1.3, Math.min(1.3, out[i])))]; i ? ctx.lineTo(...p) : ctx.moveTo(...p); }
      ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = c; ctx.font = FONT;
      ctx.fillText("blue: training samples   thin: true signal   gold: network output", 30, H - 10);
      // test error between the training samples
      let te = 0;
      for (let i = 0; i < NE; i++) { const e = out[i] - targets[target](xe[i]); te += e * e; }
      te /= NE;
      readout.innerHTML = `Step ${step}. ` + (step ? `Training error ${loss.toExponential(1)}, ` : "") +
        `error between the samples ${te.toExponential(1)}. ` +
        `Input size ${1 + 2 * L} (${L ? `x plus ${L} sine and cosine pairs` : "raw x only"}).`;
    }

    slider(root, "L", () => { L = Number($(root, 'input[name="L"]').value); reset(); },
      (v) => (v ? `${v} (highest ${2 ** (v - 1)}π)` : "off")).init();
    btn.addEventListener("click", () => {
      if (run.running) { run.stop(); btn.textContent = "Train"; }
      else { if (step >= 3000) reset(); run.start(); btn.textContent = "Pause"; }
    });
    $(root, '[data-action="reset"]').addEventListener("click", () => { run.stop(); btn.textContent = "Train"; reset(); });
    $$(root, "[data-target]").forEach((b) => b.addEventListener("click", () => {
      target = b.dataset.target;
      $$(root, "[data-target]").forEach((o) => o.classList.toggle("is-on", o === b));
      reset();
    }));
  }

  /* ---------- 3. Fitting an image with and without positional encoding ---------- */
  async function pe2d() {
    const root = document.getElementById("pe2d-sim");
    if (!root) return;
    const [cT, cA, cB] = $$(root, "canvas");
    const readout = $(root, ".sim__readout");
    const btn = $(root, '[data-action="train"]');
    const W = 64, H = 48, N = W * H;
    let img;
    try { img = await loadImage(MEDIA + "views/v04.jpg"); } catch { readout.textContent = "The image could not be loaded."; return; }
    const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    // crop the middle of the view around the drone
    tctx.drawImage(img, 70, 60, 260, 195, 0, 0, W, H);
    const px = tctx.getImageData(0, 0, W, H).data;
    const Y = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) Y[i * 3 + c] = px[i * 4 + c] / 255;
    const coords = new Float32Array(N * 2);
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      coords[(v * W + u) * 2] = ((u + 0.5) / W) * 2 - 1;
      coords[(v * W + u) * 2 + 1] = (((v + 0.5) / H) * 2 - 1) * (H / W);
    }
    for (const c of [cT, cA, cB]) { c.width = W; c.height = H; }
    cT.getContext("2d").putImageData(tctx.getImageData(0, 0, W, H), 0, 0);

    let L = 6, netA, netB, encA, encB, step = 0;
    const r = rng(3);
    function reset() {
      encA = encode(coords, N, 2, 0);
      encB = encode(coords, N, 2, L);
      netA = makeMLP([2, 64, 64, 3], 11, "sigmoid");
      netB = makeMLP([2 + 4 * L, 64, 64, 3], 11, "sigmoid");
      step = 0;
      draw();
    }
    const B = 512;
    function trainOne(net, enc, dim, idx) {
      const X = new Float32Array(B * dim), T = new Float32Array(B * 3);
      for (let k = 0; k < B; k++) {
        const i = idx[k];
        for (let d = 0; d < dim; d++) X[k * dim + d] = enc[i * dim + d];
        for (let c = 0; c < 3; c++) T[k * 3 + c] = Y[i * 3 + c];
      }
      const out = mlpForward(net, X, B);
      const g = new Float32Array(B * 3);
      for (let k = 0; k < g.length; k++) g[k] = (2 * (out[k] - T[k])) / B;
      mlpBackward(net, g, 0.005);
    }
    function chunk() {
      for (let s = 0; s < 4; s++) {
        const idx = new Int32Array(B);
        for (let k = 0; k < B; k++) idx[k] = Math.floor(r() * N);
        trainOne(netA, encA, 2, idx);
        trainOne(netB, encB, 2 + 4 * L, idx);
        step++;
      }
      if (step % 20 === 0) draw();
      if (step >= 2000) { run.stop(); btn.textContent = "Train"; draw(); }
    }
    const run = trainer(root, chunk);
    function paint(canvas, net, enc) {
      const out = mlpForward(net, enc, N);
      const ctx = canvas.getContext("2d");
      const im = ctx.createImageData(W, H);
      let mse = 0;
      for (let i = 0; i < N; i++) {
        for (let c = 0; c < 3; c++) {
          im.data[i * 4 + c] = out[i * 3 + c] * 255;
          mse += (out[i * 3 + c] - Y[i * 3 + c]) ** 2;
        }
        im.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      return mse / (N * 3);
    }
    function draw() {
      const a = paint(cA, netA, encA), b = paint(cB, netB, encB);
      $$(root, "figcaption")[2].textContent = `With positional encoding (${L} frequencies)`;
      readout.innerHTML = `Step ${step}. PSNR without encoding <b>${psnr(a).toFixed(1)} dB</b>, ` +
        `with encoding <b>${psnr(b).toFixed(1)} dB</b>. Both networks have the same layers and see the same pixels.`;
    }
    slider(root, "L", () => { L = Number($(root, 'input[name="L"]').value); reset(); }, (v) => String(v)).init();
    btn.addEventListener("click", () => {
      if (run.running) { run.stop(); btn.textContent = "Train"; }
      else { if (step >= 2000) reset(); run.start(); btn.textContent = "Pause"; }
    });
    $(root, '[data-action="reset"]').addEventListener("click", () => { run.stop(); btn.textContent = "Train"; reset(); });
  }

  /* ---------- 4. Hierarchical sampling along one ray ---------- */
  function sampling() {
    const root = document.getElementById("sampling-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let seed = 1;
    const Nc = slider(root, "Nc", draw, (v) => String(v));
    const Nf = slider(root, "Nf", draw, (v) => String(v));
    const Sp = slider(root, "surf", draw, (v) => v.toFixed(2));
    let showFine = true;

    const THICK = 0.07;
    const density = (t, ts) =>
      4 * Math.exp(-(((t - 0.25) / 0.05) ** 2)) + (t >= ts && t <= ts + THICK ? 80 : 0);

    // Volume rendering weights for sorted sample positions (deltas to the next sample).
    function weights(ts, surf) {
      const w = [];
      let T = 1;
      for (let i = 0; i < ts.length; i++) {
        const d = (i < ts.length - 1 ? ts[i + 1] : 1) - ts[i];
        const a = 1 - Math.exp(-density(ts[i], surf) * d);
        w.push(T * a);
        T *= 1 - a;
      }
      return w;
    }

    // Expected depth sum(w t) / sum(w).
    function depth(ts, surf) {
      const w = weights(ts, surf);
      const s = w.reduce((a, b) => a + b, 0);
      return w.reduce((a, b, i) => a + b * ts[i], 0) / Math.max(1e-9, s);
    }

    // Inverse transform sampling of the piecewise-constant pdf over the coarse bins.
    // As in mip-NeRF, each weight is widened to its neighbors so the bin just in
    // front of a surface also receives samples.
    function fineSamples(tc, wc, nf, r) {
      const nc = tc.length;
      const pdf = wc.map((v, i) => 0.5 * (Math.max(wc[i - 1] || 0, v) + Math.max(v, wc[i + 1] || 0)) + 0.01);
      const tot = pdf.reduce((s, v) => s + v, 0);
      const cdf = [0];
      for (const p of pdf) cdf.push(cdf[cdf.length - 1] + p / tot);
      const tf = [];
      for (let k = 0; k < nf; k++) {
        const u = (k + r()) / nf;
        let j = 0;
        while (j < nc - 1 && cdf[j + 1] < u) j++;
        const frac = (u - cdf[j]) / Math.max(1e-9, cdf[j + 1] - cdf[j]);
        tf.push((j + frac) / nc);
      }
      return tf;
    }

    function draw() {
      const W = canvas.width, H = canvas.height, c = fg(root);
      const nc = Nc.value(), nf = Nf.value(), surf = Sp.value();
      const r = rng(seed);
      ctx.clearRect(0, 0, W, H);
      const x0 = 40, x1 = W - 20;
      const X = (t) => x0 + t * (x1 - x0);
      // camera and ray
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x0 - 6, 30); ctx.lineTo(x0 - 26, 18); ctx.lineTo(x0 - 26, 42); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(x0, 30); ctx.lineTo(x1, 30); ctx.stroke(); ctx.globalAlpha = 1;
      // density profile
      const dTop = 50, dH = 70;
      ctx.fillStyle = "rgba(127,127,127,0.35)"; ctx.beginPath(); ctx.moveTo(X(0), dTop + dH);
      for (let i = 0; i <= 600; i++) { const t = i / 600; ctx.lineTo(X(t), dTop + dH - Math.min(1, density(t, surf) / 10) * dH); }
      ctx.lineTo(X(1), dTop + dH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.font = FONT;
      ctx.fillText("density along the ray: thin fog, then a solid surface", x0, dTop - 4);

      // coarse: stratified samples
      const tc = [];
      for (let i = 0; i < nc; i++) tc.push((i + r()) / nc);
      const wc = weights(tc, surf);
      const wTop = 150, wH = 70;
      const wmax = Math.max(...wc, 1e-6);
      ctx.fillStyle = c; ctx.fillText("coarse samples and their weights w = T · α", x0, wTop - 6);
      for (let i = 0; i < nc; i++) {
        const h = (wc[i] / wmax) * wH;
        ctx.fillStyle = "rgba(59,130,196,0.35)";
        ctx.fillRect(X(i / nc) + 1, wTop + wH - h, X(1 / nc) - X(0) - 2, h);
        ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(X(tc[i]), 30, 3.5, 0, 7); ctx.fill();
      }
      const tf = fineSamples(tc, wc, nf, r);
      const fTop = 260;
      ctx.fillStyle = c; ctx.fillText("fine samples drawn where the coarse weights are large", x0, fTop - 6);
      if (showFine) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        for (const t of tf) {
          ctx.beginPath(); ctx.moveTo(X(t), fTop); ctx.lineTo(X(t), fTop + 22); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(X(t), 26); ctx.lineTo(X(t), 34); ctx.stroke();
        }
        ctx.lineWidth = 1;
      }
      // compare with the same budget spread evenly, averaged over many random draws
      const inside = (arr) => arr.filter((t) => t >= surf && t <= surf + THICK).length;
      const dense = [];
      for (let k = 0; k < 4000; k++) dense.push((k + 0.5) / 4000);
      const truth = depth(dense, surf);
      const all = tc.concat(tf).sort((a, b) => a - b);
      const tu = [];
      for (let k = 0; k < nc + nf; k++) tu.push((k + r()) / (nc + nf));
      let eh = 0, eu = 0;
      const R = 200, rr = rng(99);
      for (let k = 0; k < R; k++) {
        const c2 = [];
        for (let i = 0; i < nc; i++) c2.push((i + rr()) / nc);
        const h = c2.concat(fineSamples(c2, weights(c2, surf), nf, rr)).sort((a, b) => a - b);
        const u2 = [];
        for (let i = 0; i < nc + nf; i++) u2.push((i + rr()) / (nc + nf));
        eh += Math.abs(depth(h, surf) - truth); eu += Math.abs(depth(u2, surf) - truth);
      }
      readout.innerHTML =
        `This draw: <b>${inside(all)}</b> of ${nc + nf} samples inside the surface with coarse + fine sampling, ` +
        `${inside(tu)} with the same number spread evenly. ` +
        `Average rendered-depth error over ${R} draws: hierarchical <b>${(eh / R).toFixed(4)}</b>, ` +
        `even spacing <b>${(eu / R).toFixed(4)}</b> (ray length 1).`;
    }
    $(root, '[data-action="again"]').addEventListener("click", () => { seed++; draw(); });
    $(root, '[data-action="fine"]').addEventListener("click", (e) => {
      showFine = !showFine; e.target.classList.toggle("is-on", showFine); draw();
    });
    Nc.init(); Nf.init(); Sp.init();
  }

  /* ---------- 5. View-dependent color ---------- */
  function viewDependence() {
    const root = document.getElementById("vd-sim");
    if (!root) return;
    const [cA, cB, plot] = $$(root, "canvas");
    const readout = $(root, ".sim__readout");
    const S = 180;
    cA.width = cB.width = S; cA.height = cB.height = S;
    const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const light = norm([0.5, 0.8, 0.6]);
    const elev = (15 * Math.PI) / 180;
    const dirOf = (az) => [Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)];
    const albedo = [0.75, 0.62, 0.32];
    const train = [];
    for (let k = 0; k < 36; k++) train.push(dirOf((2 * Math.PI * k) / 36));
    const mark = norm([0.35, 0.55, 0.75]);
    const Az = slider(root, "az", draw, (v) => v + "°");
    const P = slider(root, "shine", draw, (v) => String(v));

    function spec(n, v, p) {
      const nl = dot(n, light);
      const r = [2 * nl * n[0] - light[0], 2 * nl * n[1] - light[1], 2 * nl * n[2] - light[2]];
      return Math.pow(Math.max(0, dot(r, v)), p);
    }
    // What a model without the view direction learns: the average over the training views.
    function avgSpec(n, p) {
      let s = 0, c = 0;
      for (const v of train) if (dot(n, v) > 0) { s += spec(n, v, p); c++; }
      return c ? s / c : 0;
    }
    function shade(n, v, p, viewDep) {
      const d = 0.15 + 0.85 * Math.max(0, dot(n, light));
      const s = 0.9 * (viewDep ? spec(n, v, p) : avgSpec(n, p));
      return albedo.map((a) => clamp01(a * d + s));
    }

    function render(canvas, az, p, viewDep) {
      const ctx = canvas.getContext("2d");
      const im = ctx.createImageData(S, S);
      const back = dirOf(az);
      const right = norm([Math.cos(az), 0, -Math.sin(az)]);
      const up = [back[1] * right[2] - back[2] * right[1], back[2] * right[0] - back[0] * right[2], back[0] * right[1] - back[1] * right[0]];
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const u = ((i + 0.5) / S) * 2.2 - 1.1, w = 1.1 - ((j + 0.5) / S) * 2.2;
        const r2 = u * u + w * w, o = (j * S + i) * 4;
        if (r2 >= 1) { im.data[o + 3] = 0; continue; }
        const z = Math.sqrt(1 - r2);
        const n = [0, 1, 2].map((k) => u * right[k] + w * up[k] + z * back[k]);
        const col = shade(n, back, p, viewDep);
        im.data[o] = col[0] * 255; im.data[o + 1] = col[1] * 255; im.data[o + 2] = col[2] * 255; im.data[o + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      // mark the tracked surface point if it faces the camera
      const z = dot(mark, back);
      if (z > 0) {
        const x = ((dot(mark, right) + 1.1) / 2.2) * S, y = ((1.1 - dot(mark, up)) / 2.2) * S;
        ctx.strokeStyle = BLUE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.stroke();
      }
    }

    function draw() {
      const az = (Az.value() * Math.PI) / 180, p = P.value();
      render(cA, az, p, true);
      render(cB, az, p, false);
      // brightness of the tracked point against viewing direction
      const W = plot.width, H = plot.height, c = fg(root);
      const ctx = plot.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const X = (deg) => 40 + ((deg + 180) / 360) * (W - 60);
      const Y = (v) => H - 30 - v * (H - 50);
      ctx.strokeStyle = c; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(X(-180), Y(0)); ctx.lineTo(X(180), Y(0)); ctx.stroke(); ctx.globalAlpha = 1;
      const lum = (col) => 0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2];
      for (const [vd, color] of [[true, GOLD], [false, BLUE]]) {
        ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath();
        let first = true;
        for (let d = -180; d <= 180; d += 2) {
          const v = dirOf((d * Math.PI) / 180);
          if (dot(mark, v) <= 0) { first = true; continue; }
          const pt = [X(d), Y(lum(shade(mark, v, p, vd)))];
          first ? ctx.moveTo(...pt) : ctx.lineTo(...pt); first = false;
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = c; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(Az.value()), 8); ctx.lineTo(X(Az.value()), H - 30); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = c; ctx.font = FONT;
      ctx.fillText("brightness of the circled point vs. viewing direction (gold: with direction input, blue: without)", 40, H - 10);
      const v = dirOf(az);
      readout.innerHTML = dot(mark, v) > 0
        ? `Circled point: brightness ${lum(shade(mark, v, p, true)).toFixed(2)} with the view direction, ` +
          `${lum(shade(mark, v, p, false)).toFixed(2)} without. A model that ignores direction must give one answer for every view.`
        : "The circled point faces away from this camera.";
    }
    let drag = null;
    for (const cv of [cA, cB]) {
      cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, a: Az.value() }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener("pointermove", (e) => {
        if (!drag) return;
        let a = drag.a - (e.clientX - drag.x);
        a = ((((a + 180) % 360) + 360) % 360) - 180;
        Az.input.value = Math.round(a); Az.init();
      });
      cv.addEventListener("pointerup", () => { drag = null; });
    }
    Az.init(); P.init();
  }

  /* ---------- 6. Training a radiance field in flatland ---------- */
  function flatland() {
    const root = document.getElementById("flat-sim");
    if (!root) return;
    const [cScene, cField, cRows] = $$(root, "canvas");
    const readout = $(root, ".sim__readout");
    const btn = $(root, '[data-action="train"]');
    const G = 40, EXT = 1.1, P = 48, NS = 80, T0 = 0.7, T1 = 3.3, RAD = 2.0, FOV = (55 * Math.PI) / 180;
    const DT = (T1 - T0) / NS;
    const BG = [0.07, 0.07, 0.09];
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const shapes = [
      { col: hex(RED), inside: (x, y) => (x + 0.38) ** 2 + (y - 0.28) ** 2 < 0.28 ** 2 },
      { col: hex(BLUE), inside: (x, y) => {
          const c = Math.cos(0.4), s = Math.sin(0.4), u = (x - 0.38) * c + (y - 0.3) * s, v = -(x - 0.38) * s + (y - 0.3) * c;
          return Math.abs(u) < 0.2 && Math.abs(v) < 0.2;
        } },
      { col: hex(GOLD), inside: (x, y) => y > -0.65 && y < -0.2 && Math.abs(x - 0.05) < (y + 0.65) * 0.6 }
    ];
    function gt(x, y) {
      for (const s of shapes) if (s.inside(x, y)) return [30, s.col];
      return [0, BG];
    }
    // Learnable grid: raw density and raw color at each vertex.
    const NP = G * G * 4;
    let theta, m, v, t = 0, step = 0, K = 8;
    function resetParams() {
      theta = new Float32Array(NP); m = new Float32Array(NP); v = new Float32Array(NP);
      for (let i = 0; i < G * G; i++) theta[i * 4] = -3;
      t = 0; step = 0;
    }
    const softplus = (s) => (s > 20 ? s : Math.log1p(Math.exp(s)));
    const sig = (s) => 1 / (1 + Math.exp(-s));

    function camera(theta0) {
      const C = [RAD * Math.cos(theta0), RAD * Math.sin(theta0)];
      const look = theta0 + Math.PI;
      const dirs = [];
      for (let p = 0; p < P; p++) {
        const a = look + FOV / 2 - ((p + 0.5) / P) * FOV;
        dirs.push([Math.cos(a), Math.sin(a)]);
      }
      return { C, dirs, angle: theta0 };
    }
    // Ground-truth pixel color by dense ray marching through the analytic scene.
    function renderGT(cam) {
      return cam.dirs.map((d) => {
        let T = 1; const C = [0, 0, 0];
        const n = 400, dt = (T1 - T0) / n;
        for (let i = 0; i < n && T > 1e-4; i++) {
          const tt = T0 + (i + 0.5) * dt, [s, col] = gt(cam.C[0] + tt * d[0], cam.C[1] + tt * d[1]);
          if (!s) continue;
          const a = 1 - Math.exp(-s * dt);
          for (let k = 0; k < 3; k++) C[k] += T * a * col[k];
          T *= 1 - a;
        }
        return C.map((c, k) => c + T * BG[k]);
      });
    }
    // Bilinear lookup of the grid at (x, y); returns corner indices and weights.
    function corners(x, y) {
      const gx = ((x + EXT) / (2 * EXT)) * (G - 1), gy = ((y + EXT) / (2 * EXT)) * (G - 1);
      if (gx < 0 || gy < 0 || gx >= G - 1 || gy >= G - 1) return null;
      const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const b = j * G + i;
      return [[b, (1 - fx) * (1 - fy)], [b + 1, fx * (1 - fy)], [b + G, (1 - fx) * fy], [b + G + 1, fx * fy]];
    }
    function query(x, y) {
      const cs = corners(x, y);
      if (!cs) return null;
      const raw = [0, 0, 0, 0];
      for (const [idx, w] of cs) for (let k = 0; k < 4; k++) raw[k] += w * theta[idx * 4 + k];
      return { cs, raw };
    }
    // Render one ray; with a target, accumulate gradients of the squared error.
    function renderRay(C0, d, target, grad, scale) {
      const smp = [];
      let T = 1; const C = [0, 0, 0];
      for (let i = 0; i < NS; i++) {
        const tt = T0 + (i + 0.5) * DT;
        const q = query(C0[0] + tt * d[0], C0[1] + tt * d[1]);
        if (!q) continue;
        const sigma = 10 * softplus(q.raw[0]);
        const col = [sig(q.raw[1]), sig(q.raw[2]), sig(q.raw[3])];
        const a = 1 - Math.exp(-sigma * DT);
        const w = T * a;
        for (let k = 0; k < 3; k++) C[k] += w * col[k];
        smp.push({ q, sigma, col, a, w, Tn: T * (1 - a) });
        T *= 1 - a;
      }
      for (let k = 0; k < 3; k++) C[k] += T * BG[k];
      if (!target) return C;
      const g = C.map((c, k) => (2 * (c - target[k])) * scale);
      let S = T * (BG[0] * g[0] + BG[1] * g[1] + BG[2] * g[2]);
      let err = 0;
      for (let k = 0; k < 3; k++) err += (C[k] - target[k]) ** 2;
      for (let i = smp.length - 1; i >= 0; i--) {
        const s = smp[i];
        const cg = s.col[0] * g[0] + s.col[1] * g[1] + s.col[2] * g[2];
        const dSigma = DT * (s.Tn * cg - S);
        S += s.w * cg;
        const dRaw = [dSigma * 10 * sig(s.q.raw[0])];
        for (let k = 0; k < 3; k++) dRaw.push(s.w * g[k] * s.col[k] * (1 - s.col[k]));
        for (const [idx, wt] of s.q.cs) for (let k = 0; k < 4; k++) grad[idx * 4 + k] += wt * dRaw[k];
      }
      return err;
    }

    let train = [], test = null, gtTrain = [], gtTest = null, lastTrain = 0;
    function setup() {
      train = []; gtTrain = [];
      const off = 0.3;
      for (let k = 0; k < K; k++) { const c = camera(off + (2 * Math.PI * k) / K); train.push(c); gtTrain.push(renderGT(c)); }
      test = camera(off + Math.PI / K + (K === 1 ? Math.PI / 2 : 0));
      gtTest = renderGT(test);
      drawScene();
    }
    function chunk() {
      for (let s = 0; s < 3; s++) {
        const grad = new Float32Array(NP);
        let err = 0;
        const scale = 1 / (K * P);
        train.forEach((c, k) => c.dirs.forEach((d, p) => { err += renderRay(c.C, d, gtTrain[k][p], grad, scale); }));
        lastTrain = err / (K * P * 3);
        t++;
        const lr = 0.08, c1 = 1 - 0.9 ** t, c2 = 1 - 0.999 ** t;
        for (let i = 0; i < NP; i++) {
          m[i] = 0.9 * m[i] + 0.1 * grad[i];
          v[i] = 0.999 * v[i] + 0.001 * grad[i] * grad[i];
          theta[i] -= (lr * m[i] / c1) / (Math.sqrt(v[i] / c2) + 1e-8);
        }
        step++;
      }
      drawField();
      if (step >= 600) { run.stop(); btn.textContent = "Train"; }
    }
    const run = trainer(root, chunk);

    const SZ = 240;
    cScene.width = cScene.height = cField.width = cField.height = SZ;
    const VX = 2.3; // half-width of the top view in scene units
    const toPix = (x, y) => [((x + VX) / (2 * VX)) * SZ, ((VX - y) / (2 * VX)) * SZ];
    function drawCams(ctx) {
      const camShape = (c, color, dashed) => {
        const [x, y] = toPix(c.C[0], c.C[1]);
        const a = c.angle + Math.PI;
        ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash(dashed ? [3, 3] : []);
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(x, y);
          const b = a + (s * FOV) / 2;
          ctx.lineTo(x + 30 * Math.cos(b), y - 30 * Math.sin(b)); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      };
      train.forEach((c) => camShape(c, "#e8e8e8", false));
      camShape(test, GOLD, true);
    }
    function drawScene() {
      const ctx = cScene.getContext("2d");
      const im = ctx.createImageData(SZ, SZ);
      for (let j = 0; j < SZ; j++) for (let i = 0; i < SZ; i++) {
        const x = ((i + 0.5) / SZ) * 2 * VX - VX, y = VX - ((j + 0.5) / SZ) * 2 * VX;
        const [s, col] = gt(x, y), o = (j * SZ + i) * 4;
        const c = s ? col : BG;
        im.data[o] = c[0] * 255; im.data[o + 1] = c[1] * 255; im.data[o + 2] = c[2] * 255; im.data[o + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      drawCams(ctx);
      drawField();
    }
    function drawField() {
      const ctx = cField.getContext("2d");
      const im = ctx.createImageData(SZ, SZ);
      for (let j = 0; j < SZ; j++) for (let i = 0; i < SZ; i++) {
        const x = ((i + 0.5) / SZ) * 2 * VX - VX, y = VX - ((j + 0.5) / SZ) * 2 * VX;
        const q = query(x, y), o = (j * SZ + i) * 4;
        let c = BG;
        if (q) {
          const a = 1 - Math.exp(-10 * softplus(q.raw[0]) * 0.08);
          c = [1, 2, 3].map((k, n) => a * sig(q.raw[k]) + (1 - a) * BG[n]);
        }
        im.data[o] = c[0] * 255; im.data[o + 1] = c[1] * 255; im.data[o + 2] = c[2] * 255; im.data[o + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      drawCams(ctx);
      // rows: training view 1 and the held-out view, truth above prediction
      const rows = [["training view 1, truth", gtTrain[0]], ["training view 1, rendered", train[0].dirs.map((d) => renderRay(train[0].C, d))],
        ["held-out view, truth", gtTest], ["held-out view, rendered", test.dirs.map((d) => renderRay(test.C, d))]];
      const rc = cRows.getContext("2d"), RW = cRows.width, rh = 22, lab = 170;
      rc.clearRect(0, 0, RW, cRows.height);
      rc.font = FONT; rc.fillStyle = fg(root);
      let mse = 0;
      rows[3][1].forEach((c, p) => { for (let k = 0; k < 3; k++) mse += (c[k] - gtTest[p][k]) ** 2; });
      mse /= P * 3;
      rows.forEach(([name, px], r) => {
        const y = 6 + r * (rh + 8) + (r >= 2 ? 8 : 0);
        rc.fillStyle = fg(root); rc.fillText(name, 4, y + 15);
        const pw = (RW - lab - 4) / P;
        px.forEach((c, p) => {
          rc.fillStyle = `rgb(${c.map((v) => Math.round(clamp01(v) * 255)).join(",")})`;
          rc.fillRect(lab + p * pw, y, Math.ceil(pw), rh);
        });
      });
      readout.innerHTML = `Step ${step} with ${K} training view${K > 1 ? "s" : ""}. ` +
        (step ? `Training PSNR <b>${psnr(lastTrain).toFixed(1)} dB</b>, held-out ` : "Press Train. Held-out ") +
        `view PSNR <b>${psnr(mse).toFixed(1)} dB</b>.`;
    }
    slider(root, "K", () => {
      K = Number($(root, 'input[name="K"]').value);
      run.stop(); btn.textContent = "Train";
      resetParams(); setup();
    }, (v) => String(v)).init();
    btn.addEventListener("click", () => {
      if (run.running) { run.stop(); btn.textContent = "Train"; }
      else { if (step >= 600) { resetParams(); } run.start(); btn.textContent = "Pause"; }
    });
    $(root, '[data-action="reset"]').addEventListener("click", () => { run.stop(); btn.textContent = "Train"; resetParams(); drawField(); });
  }

  /* ---------- 7. Multiresolution hash encoding ---------- */
  function hashGrid() {
    const root = document.getElementById("hash-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const NL = slider(root, "levels", draw, (v) => String(v));
    const GR = slider(root, "growth", draw, (v) => v.toFixed(2));
    const TB = slider(root, "table", draw, (v) => "2^" + v);
    let P = [0.37, 0.61];
    const colors = ["#cfb97d", "#3b82c4", "#2f8f5b", "#d9534f", "#9b6bd3", "#e08a3c", "#3fb6b0", "#c45c9a"];
    const NMIN = 4;
    function index(x, y, res, T) {
      const side = res + 1;
      if (side * side <= T) return y * side + x; // coarse levels: one entry per vertex
      return ((x ^ Math.imul(y, 2654435761 | 0)) >>> 0) % T;
    }
    function draw() {
      const W = canvas.width, H = canvas.height, c = fg(root);
      const L = NL.value(), b = GR.value(), T = 2 ** TB.value(), F = 2;
      ctx.clearRect(0, 0, W, H);
      const D = Math.min(H - 20, W * 0.48), ox = 10, oy = 10;
      ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.strokeRect(ox, oy, D, D); ctx.globalAlpha = 1;
      const tx = ox + D + 30, tw = W - tx - 10;
      let totalVerts = 0, hashed = 0;
      for (let l = 0; l < L; l++) {
        const res = Math.floor(NMIN * b ** l);
        const col = colors[l % colors.length];
        const gx = P[0] * res, gy = P[1] * res;
        const i0 = Math.min(res - 1, Math.floor(gx)), j0 = Math.min(res - 1, Math.floor(gy));
        // the cell around P at this level
        const cs = D / res;
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.strokeRect(ox + i0 * cs, oy + D - (j0 + 1) * cs, cs, cs);
        // faint full grid for the coarsest two levels
        if (l < 2) {
          ctx.globalAlpha = 0.18;
          for (let k = 1; k < res; k++) {
            ctx.beginPath(); ctx.moveTo(ox + k * cs, oy); ctx.lineTo(ox + k * cs, oy + D); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox, oy + k * cs); ctx.lineTo(ox + D, oy + k * cs); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        // the table for this level, with the four entries P reads
        const y = oy + l * ((D - 10) / L);
        const rowH = Math.max(6, Math.min(18, (D - 10) / L - 16));
        ctx.fillStyle = c; ctx.font = FONT;
        const verts = (res + 1) ** 2;
        totalVerts += verts;
        const isHashed = verts > T;
        if (isHashed) hashed++;
        ctx.fillText(`level ${l + 1}: ${res}×${res} cells, ${verts.toLocaleString()} vertices${isHashed ? `, ${(verts / T).toFixed(1)} per entry` : ""}`, tx, y + 11);
        ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.fillRect(tx, y + 14, tw, rowH); ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const e = index(i0 + dx, j0 + dy, res, T);
          ctx.fillRect(tx + (e / T) * tw - 1.5, y + 14, 3, rowH);
          ctx.beginPath(); ctx.arc(ox + (i0 + dx) * cs, oy + D - (j0 + dy) * cs, 3, 0, 7); ctx.fill();
        }
      }
      ctx.lineWidth = 1;
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ox + P[0] * D, oy + D - P[1] * D, 5, 0, 7); ctx.fill();
      const finest = Math.floor(NMIN * b ** (L - 1));
      const params = L * T * F;
      readout.innerHTML =
        `${L} levels from ${NMIN}×${NMIN} to ${finest}×${finest} cells. ` +
        `${hashed} level${hashed === 1 ? "" : "s"} share table entries through the hash. ` +
        `Parameters: <b>${params.toLocaleString()}</b> (${L} tables × ${T.toLocaleString()} entries × ${F} features), ` +
        `versus ${(totalVerts * F).toLocaleString()} for dense grids at every level. In 3D the gap is far larger.`;
    }
    const move = (e) => {
      const p = canvasPoint(canvas, e);
      const D = Math.min(canvas.height - 20, canvas.width * 0.48);
      const x = (p.x - 10) / D, y = 1 - (p.y - 10) / D;
      if (x >= 0 && x < 1 && y >= 0 && y < 1) { P = [x, y]; draw(); }
    };
    let down = false;
    canvas.addEventListener("pointerdown", (e) => { down = true; canvas.setPointerCapture(e.pointerId); move(e); });
    canvas.addEventListener("pointermove", (e) => { if (down) move(e); });
    canvas.addEventListener("pointerup", () => { down = false; });
    NL.init(); GR.init(); TB.init();
  }

  /* ---------- 8. Aliasing and the mip-NeRF cone ---------- */
  function aliasing() {
    const root = document.getElementById("mip-sim");
    if (!root) return;
    const [cP, cA, bars] = $$(root, "canvas");
    const readout = $(root, ".sim__readout");
    const N = 96;
    cP.width = cA.width = cP.height = cA.height = N;
    const k = 70;
    const tex = (x, y) => 0.5 + 0.5 * Math.cos(k * (x * x + y * y));
    const Z = slider(root, "zoom", draw, (v) => v.toFixed(1) + "×");

    function draw() {
      const z = Z.value();
      const ip = cP.getContext("2d").createImageData(N, N), ia = cA.getContext("2d").createImageData(N, N);
      const sub = 10;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = (j * N + i) * 4;
        const xc = (((i + 0.5) / N) * 2 - 1) * z, yc = (((j + 0.5) / N) * 2 - 1) * z;
        const vp = tex(xc, yc);
        let va = 0;
        for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
          va += tex((((i + (a + 0.5) / sub) / N) * 2 - 1) * z, (((j + (b + 0.5) / sub) / N) * 2 - 1) * z);
        }
        va /= sub * sub;
        for (let c = 0; c < 3; c++) { ip.data[o + c] = vp * 255; ia.data[o + c] = va * 255; }
        ip.data[o + 3] = ia.data[o + 3] = 255;
      }
      cP.getContext("2d").putImageData(ip, 0, 0);
      cA.getContext("2d").putImageData(ia, 0, 0);
      // integrated positional encoding: each frequency is scaled by exp(-0.5 (2^l pi)^2 s^2)
      const s = ((2 * z) / N) / 2; // half the pixel footprint in texture units
      const W = bars.width, H = bars.height, c = fg(root), ctx = bars.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const Lf = 10, bw = (W - 60) / Lf;
      ctx.fillStyle = c; ctx.font = FONT;
      for (let l = 0; l < Lf; l++) {
        const f = Math.PI * 2 ** l;
        const wgt = Math.exp(-0.5 * f * f * s * s);
        const h = wgt * (H - 50);
        ctx.fillStyle = GOLD; ctx.fillRect(40 + l * bw + 4, H - 30 - h, bw - 8, h);
        ctx.fillStyle = c; ctx.fillText(String(l), 40 + l * bw + bw / 2 - 4, H - 14);
      }
      ctx.fillText("weight of each encoding frequency for this pixel's cone (mip-NeRF)", 40, 14);
      ctx.fillText("level", 4, H - 14);
      const kept = Array.from({ length: Lf }, (_, l) => Math.exp(-0.5 * (Math.PI * 2 ** l) ** 2 * s * s)).filter((w) => w > 0.5).length;
      readout.innerHTML = `Each pixel covers ${(2 * s).toFixed(3)} units of the pattern. ` +
        `Point sampling reads one value at the pixel center and produces false rings (aliasing) once the stripes are finer than a pixel; ` +
        `averaging over the footprint gives the correct gray. For this footprint the integrated encoding keeps <b>${kept}</b> of ${Lf} frequency levels.`;
    }
    Z.init();
  }

  function init() {
    capture(); pe1d(); pe2d(); sampling(); viewDependence(); flatland(); hashGrid(); aliasing();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
