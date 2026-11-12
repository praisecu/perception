/*
 * Interactive figures for Chapter 9, Learning Depth.
 * Each demo looks for its own element id and does nothing if it is absent.
 * Everything runs in the reader's browser. Timers use setTimeout/setInterval
 * rather than requestAnimationFrame so the first frame always appears.
 */
(() => {
  const MEDIA = "media/learned-depth/";
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

  function isDark() {
    return document.body.classList.contains("quarto-dark");
  }

  function ink(alpha = 1) {
    return isDark() ? `rgba(243,239,227,${alpha})` : `rgba(29,30,0,${alpha})`;
  }

  const GOLD = "#cfb97d";
  const GOLD_DEEP = "#a78a3b";

  // A perceptual colormap (magma-like), near = bright, far = dark.
  const STOPS = [
    [0.0, [252, 253, 191]],
    [0.25, [254, 159, 109]],
    [0.5, [222, 73, 104]],
    [0.75, [140, 41, 129]],
    [1.0, [10, 8, 30]]
  ];
  function colormap(t) {
    t = Math.min(1, Math.max(0, t));
    for (let i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i];
        const u = (t - t0) / (t1 - t0);
        return [0, 1, 2].map((k) => Math.round(c0[k] + u * (c1[k] - c0[k])));
      }
    }
    return STOPS[STOPS.length - 1][1];
  }

  // Seeded random numbers so figures are repeatable.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function gauss(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Shared scene: RGB image and exact depth (metres) from the Blender render.
  let scenePromise = null;
  function loadScene() {
    if (scenePromise) return scenePromise;
    scenePromise = (async () => {
      const [rgbImg, depImg] = await Promise.all([
        loadImage(MEDIA + "rgb.jpg"),
        loadImage(MEDIA + "depth16.png")
      ]);
      const W = depImg.width, H = depImg.height;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(depImg, 0, 0);
      const dd = ctx.getImageData(0, 0, W, H).data;
      const depth = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) depth[i] = (dd[i * 4] * 256 + dd[i * 4 + 1]) / 1000;
      ctx.drawImage(rgbImg, 0, 0, W, H);
      const rgb = ctx.getImageData(0, 0, W, H).data.slice();
      return { W, H, depth, rgb, rgbImg };
    })();
    return scenePromise;
  }

  function depthToImageData(depth, W, H, zmin = 0.45, zmax = 6) {
    const out = new ImageData(W, H);
    const lmin = Math.log(zmin), lmax = Math.log(zmax);
    for (let i = 0; i < W * H; i++) {
      const t = (Math.log(Math.max(zmin, depth[i])) - lmin) / (lmax - lmin);
      const [r, g, b] = colormap(t);
      out.data[i * 4] = r; out.data[i * 4 + 1] = g; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = 255;
    }
    return out;
  }

  /* ------------------------------------------------------------------
   * 1. A tiny neural network playground (1 input, H tanh units, 1 output)
   * ------------------------------------------------------------------ */
  function playground() {
    const root = document.getElementById("nn-sim");
    if (!root) return;
    const plot = $(root, "canvas.ld-plot");
    const lossCanvas = $(root, "canvas.ld-loss");
    const readout = $(root, ".sim__readout");
    const pctx = plot.getContext("2d"), lctx = lossCanvas.getContext("2d");

    const targets = {
      sine: (x) => Math.sin(3 * x),
      step: (x) => (x < 0.1 ? -0.6 : 0.6),
      bump: (x) => Math.exp(-12 * x * x) * 1.4 - 0.5
    };
    let target = "sine";
    let train = [], val = [];
    let net, opt, epoch = 0, history = [];
    let timer = null;

    const Hn = slider(root, "hidden", () => { reset(); }, (v) => v + (v === 1 ? " neuron" : " neurons"));
    const LR = slider(root, "lr", () => {}, (v) => lrValue(v).toFixed(3));
    const NS = slider(root, "noise", () => { makeData(); reset(); }, (v) => v.toFixed(2));
    function lrValue(v) { return Math.pow(10, v); }

    function makeData() {
      const rand = rng(7);
      const f = targets[target];
      const sigma = NS ? NS.value() : 0.08;
      train = []; val = [];
      for (let i = 0; i < 18; i++) {
        const x = -1 + (2 * (i + rand() * 0.8)) / 18;
        train.push([x, f(x) + sigma * gauss(rand)]);
      }
      for (let i = 0; i < 18; i++) {
        const x = -1 + 2 * rand();
        val.push([x, f(x) + sigma * gauss(rand)]);
      }
    }

    function reset() {
      stop();
      const H = Hn.value();
      const rand = rng(11 + H);
      net = {
        w1: Array.from({ length: H }, () => gauss(rand) * 1.5),
        b1: Array.from({ length: H }, () => gauss(rand) * 0.5),
        w2: Array.from({ length: H }, () => gauss(rand) / Math.sqrt(H)),
        b2: 0
      };
      opt = { t: 0, m: {}, v: {} };
      epoch = 0; history = [];
      draw();
    }

    function forward(x) {
      const H = net.w1.length;
      const h = new Array(H);
      let y = net.b2;
      for (let j = 0; j < H; j++) {
        h[j] = Math.tanh(net.w1[j] * x + net.b1[j]);
        y += net.w2[j] * h[j];
      }
      return { h, y };
    }

    function mse(data) {
      let s = 0;
      for (const [x, t] of data) { const d = forward(x).y - t; s += d * d; }
      return s / data.length;
    }

    // One full-batch Adam step on the mean squared error.
    function step() {
      const H = net.w1.length;
      const g = { w1: new Array(H).fill(0), b1: new Array(H).fill(0), w2: new Array(H).fill(0), b2: 0 };
      for (const [x, t] of train) {
        const { h, y } = forward(x);
        const dy = (2 * (y - t)) / train.length;
        g.b2 += dy;
        for (let j = 0; j < H; j++) {
          g.w2[j] += dy * h[j];
          const dh = dy * net.w2[j] * (1 - h[j] * h[j]);
          g.w1[j] += dh * x;
          g.b1[j] += dh;
        }
      }
      const lr = lrValue(LR.value()), b1 = 0.9, b2 = 0.999, eps = 1e-8;
      opt.t++;
      for (const key of ["w1", "b1", "w2", "b2"]) {
        const grad = Array.isArray(g[key]) ? g[key] : [g[key]];
        const p = Array.isArray(net[key]) ? net[key] : [net[key]];
        opt.m[key] = opt.m[key] || new Array(p.length).fill(0);
        opt.v[key] = opt.v[key] || new Array(p.length).fill(0);
        for (let i = 0; i < p.length; i++) {
          opt.m[key][i] = b1 * opt.m[key][i] + (1 - b1) * grad[i];
          opt.v[key][i] = b2 * opt.v[key][i] + (1 - b2) * grad[i] * grad[i];
          const mh = opt.m[key][i] / (1 - Math.pow(b1, opt.t));
          const vh = opt.v[key][i] / (1 - Math.pow(b2, opt.t));
          p[i] -= (lr * mh) / (Math.sqrt(vh) + eps);
        }
        if (!Array.isArray(net[key])) net[key] = p[0];
      }
      epoch++;
    }

    function trainSteps(n) {
      for (let i = 0; i < n; i++) {
        step();
        if (epoch % 5 === 0) history.push([epoch, mse(train), mse(val)]);
      }
      draw();
    }

    function sizeCanvas(c, aspect) {
      const w = Math.max(280, Math.round(c.clientWidth || 600));
      c.width = w; c.height = Math.round(w * aspect);
    }

    function draw() {
      sizeCanvas(plot, 0.5);
      sizeCanvas(lossCanvas, 0.28);
      const W = plot.width, H = plot.height;
      pctx.clearRect(0, 0, W, H);
      const X = (x) => ((x + 1.05) / 2.1) * W;
      const Y = (y) => H / 2 - (y / 1.9) * (H / 2);
      pctx.strokeStyle = ink(0.15); pctx.lineWidth = 1;
      pctx.beginPath(); pctx.moveTo(0, Y(0)); pctx.lineTo(W, Y(0)); pctx.stroke();

      // True function (faint)
      pctx.strokeStyle = ink(0.3); pctx.setLineDash([5, 5]); pctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const x = -1 + (2 * i) / 200;
        const y = targets[target](x);
        i ? pctx.lineTo(X(x), Y(y)) : pctx.moveTo(X(x), Y(y));
      }
      pctx.stroke(); pctx.setLineDash([]);

      // Network prediction
      pctx.strokeStyle = GOLD_DEEP; pctx.lineWidth = 3; pctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const x = -1.05 + (2.1 * i) / 240;
        const y = forward(x).y;
        i ? pctx.lineTo(X(x), Y(y)) : pctx.moveTo(X(x), Y(y));
      }
      pctx.stroke();

      for (const [x, t] of val) {
        pctx.strokeStyle = ink(0.55); pctx.lineWidth = 1.5;
        pctx.beginPath(); pctx.arc(X(x), Y(t), 4, 0, Math.PI * 2); pctx.stroke();
      }
      for (const [x, t] of train) {
        pctx.fillStyle = GOLD;
        pctx.beginPath(); pctx.arc(X(x), Y(t), 4.5, 0, Math.PI * 2); pctx.fill();
      }

      // Loss curves (log scale)
      const LW = lossCanvas.width, LH = lossCanvas.height;
      lctx.clearRect(0, 0, LW, LH);
      lctx.fillStyle = ink(0.6); lctx.font = "12px 'Open Sans', sans-serif";
      lctx.fillText("Loss (log scale)", 6, 14);
      if (history.length > 1) {
        const maxE = history[history.length - 1][0];
        const all = history.flatMap((h) => [h[1], h[2]]).filter((v) => v > 0);
        const lo = Math.log10(Math.max(1e-4, Math.min(...all))), hi = Math.log10(Math.max(...all));
        const span = Math.max(0.5, hi - lo);
        const LX = (e) => 6 + ((LW - 12) * e) / maxE;
        const LY = (v) => LH - 6 - ((LH - 26) * (Math.log10(Math.max(1e-4, v)) - lo)) / span;
        [[1, GOLD_DEEP, "train"], [2, ink(0.55), "validation"]].forEach(([k, col]) => {
          lctx.strokeStyle = col; lctx.lineWidth = 2; lctx.beginPath();
          history.forEach((h, i) => (i ? lctx.lineTo(LX(h[0]), LY(h[k])) : lctx.moveTo(LX(h[0]), LY(h[k]))));
          lctx.stroke();
        });
      }
      const tl = mse(train), vl = mse(val);
      let note = "";
      if (epoch > 300 && vl > 2.5 * tl && Hn.value() >= 12) note = " The network now fits the noise in the training points: validation loss is rising. This is <b>overfitting</b>.";
      else if (epoch > 300 && Hn.value() <= 2 && tl > 0.03) note = " Too few neurons to bend the curve into this shape: the model is <b>underfitting</b>.";
      readout.innerHTML = `Step ${epoch} · training loss <b>${tl.toFixed(4)}</b> · validation loss <b>${vl.toFixed(4)}</b>.${note}`;
    }

    function play() {
      if (timer) return stop();
      $(root, "[data-action=play]").textContent = "Pause";
      timer = setInterval(() => trainSteps(15), 40);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      const b = $(root, "[data-action=play]");
      if (b) b.textContent = "Train";
    }

    $(root, "[data-action=play]").addEventListener("click", play);
    $(root, "[data-action=step]").addEventListener("click", () => { stop(); trainSteps(1); });
    $(root, "[data-action=reset]").addEventListener("click", reset);
    $$(root, "[data-target]").forEach((b) =>
      b.addEventListener("click", () => {
        target = b.dataset.target;
        $$(root, "[data-target]").forEach((x) => x.classList.toggle("is-on", x === b));
        makeData(); reset();
      })
    );
    window.addEventListener("resize", () => draw());
    makeData();
    LR.init(); NS.init(); Hn.init();
  }

  /* ------------------------------------------------------------------
   * 2. Gradient descent on a 2D loss surface
   * ------------------------------------------------------------------ */
  function descent() {
    const root = document.getElementById("gd-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const S = 3; // domain [-S, S]^2

    const surfaces = {
      bowl: { f: (x, y) => x * x + y * y, g: (x, y) => [2 * x, 2 * y], name: "round bowl" },
      valley: { f: (x, y) => 0.15 * x * x + 3 * y * y, g: (x, y) => [0.3 * x, 6 * y], name: "narrow valley" },
      twin: {
        f: (x, y) => 0.25 * (x * x - 2.2) * (x * x - 2.2) + 0.25 * x + 1.2 * y * y,
        g: (x, y) => [x * (x * x - 2.2) + 0.25, 2.4 * y],
        name: "two valleys"
      }
    };
    let surf = "valley";
    let start = [-2.4, 1.6];
    let path = [];
    let timer = null;
    let background = null;
    let momentum = false;

    const LR = slider(root, "lr", () => { stop(); path = []; draw(); }, (v) => lr(v).toFixed(3));
    function lr(v) { return Math.pow(10, v); }

    function toPx(x, y) {
      return [((x + S) / (2 * S)) * canvas.width, ((S - y) / (2 * S)) * canvas.height];
    }
    function fromPx(px, py) {
      return [(px / canvas.width) * 2 * S - S, S - (py / canvas.height) * 2 * S];
    }

    function makeBackground() {
      const W = canvas.width, H = canvas.height;
      const img = new ImageData(W, H);
      const { f } = surfaces[surf];
      let lo = Infinity, hi = -Infinity;
      const vals = new Float32Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const [x, y] = fromPx(i + 0.5, j + 0.5);
        const v = Math.log(1e-3 + f(x, y) - (surf === "twin" ? -0.5 : 0) + 0.6);
        vals[j * W + i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      for (let k = 0; k < W * H; k++) {
        const t = (vals[k] - lo) / (hi - lo);
        const band = Math.abs(((t * 14) % 1) - 0.5) < 0.04 ? 0.75 : 1;
        const c = colormap(0.15 + 0.8 * t).map((v) => v * band);
        img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2]; img.data[k * 4 + 3] = 255;
      }
      background = img;
    }

    function draw() {
      const w = Math.max(280, Math.round(canvas.clientWidth || 520));
      if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round(w * 0.62); background = null; }
      if (!background) makeBackground();
      ctx.putImageData(background, 0, 0);
      if (path.length) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.2; ctx.beginPath();
        path.forEach(([x, y], i) => { const [px, py] = toPx(x, y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();
        ctx.fillStyle = "#fff";
        path.forEach(([x, y]) => { const [px, py] = toPx(x, y); ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill(); });
      }
      const [sx, sy] = toPx(start[0], start[1]);
      ctx.fillStyle = GOLD; ctx.strokeStyle = "#1d1e00"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      const { f } = surfaces[surf];
      if (!path.length) {
        readout.innerHTML = `Drag the gold point to choose where training starts, then press <b>Descend</b>. Surface: ${surfaces[surf].name}.`;
      } else {
        const [x, y] = path[path.length - 1];
        const loss = f(x, y);
        const diverged = !isFinite(loss) || Math.abs(x) > 50 || Math.abs(y) > 50;
        readout.innerHTML = diverged
          ? `<b>Diverged</b> after ${path.length - 1} steps: the learning rate is too large, so each step overshoots further.`
          : `Step ${path.length - 1} · loss <b>${loss.toFixed(4)}</b> at (${x.toFixed(2)}, ${y.toFixed(2)}).`;
      }
    }

    function stop() { if (timer) clearInterval(timer); timer = null; }

    function run() {
      stop();
      path = [start.slice()];
      const { g } = surfaces[surf];
      let v = [0, 0];
      const eta = lr(LR.value()), beta = momentum ? 0.9 : 0;
      let n = 0;
      timer = setInterval(() => {
        for (let k = 0; k < 2; k++) {
          const [x, y] = path[path.length - 1];
          const [gx, gy] = g(x, y);
          v = [beta * v[0] - eta * gx, beta * v[1] - eta * gy];
          const nx = x + v[0], ny = y + v[1];
          path.push([nx, ny]);
          n++;
          if (!isFinite(nx) || Math.abs(nx) > 50 || Math.abs(ny) > 50) { n = 999; break; }
        }
        draw();
        const [x, y] = path[path.length - 1];
        const [gx, gy] = g(x, y);
        if (n >= 160 || Math.hypot(gx, gy) < 1e-3) stop();
      }, 30);
    }

    // Drag the start point (mouse, pen or touch)
    let dragging = false;
    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return fromPx(((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height);
    }
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true; canvas.setPointerCapture(e.pointerId);
      stop(); start = pos(e).map((v) => Math.max(-S, Math.min(S, v))); path = []; draw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      start = pos(e).map((v) => Math.max(-S, Math.min(S, v))); draw();
    });
    canvas.addEventListener("pointerup", () => { dragging = false; });

    $(root, "[data-action=run]").addEventListener("click", run);
    $(root, "[data-action=momentum]").addEventListener("click", (e) => {
      momentum = !momentum;
      e.currentTarget.classList.toggle("is-on", momentum);
      e.currentTarget.textContent = momentum ? "Momentum: on" : "Momentum: off";
      stop(); path = []; draw();
    });
    $$(root, "[data-surface]").forEach((b) =>
      b.addEventListener("click", () => {
        surf = b.dataset.surface;
        $$(root, "[data-surface]").forEach((x) => x.classList.toggle("is-on", x === b));
        stop(); path = []; background = null; draw();
      })
    );
    window.addEventListener("resize", () => { background = null; draw(); });
    LR.init();
  }

  /* ------------------------------------------------------------------
   * 3. Receptive field across layers (1D cone)
   * ------------------------------------------------------------------ */
  function receptive() {
    const root = document.getElementById("rf-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let pool = false;

    const L = slider(root, "layers", draw, (v) => v + (v === 1 ? " layer" : " layers"));
    const K = slider(root, "kernel", draw, (v) => v + " × " + v);

    // Receptive field (in input pixels) of one unit at layer r, and the spacing
    // between neighbouring units at that layer.
    function rfAt(r, k) {
      let s = 1, jump = 1;
      for (let l = 0; l < r; l++) { s += (k - 1) * jump; if (pool) jump *= 2; }
      return s;
    }
    function spacing(r) { return pool ? Math.pow(2, r) : 1; }

    function draw() {
      const nL = L.value(), k = K.value();
      const N = 41;
      const w = Math.max(300, Math.round(canvas.clientWidth || 640));
      canvas.width = w; canvas.height = Math.round(60 + nL * 48);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const cell = (W - 20) / N, c = (N - 1) / 2;
      const total = rfAt(nL, k);
      for (let r = 0; r <= nL; r++) {
        const y = H - 24 - r * ((H - 50) / nL);
        // units of the top unit's cone at this row
        const half = (total - rfAt(r, k)) / 2;
        const step = Math.min(spacing(r), 32);
        for (let i = 0; i < N; i++) {
          if ((i - c) % step !== 0) continue;
          const inCone = r === nL ? i === c : Math.abs(i - c) <= half;
          ctx.beginPath();
          ctx.arc(10 + cell * (i + 0.5), y, Math.max(2.5, Math.min(7, cell * 0.38)), 0, Math.PI * 2);
          ctx.fillStyle = inCone ? (r === nL ? GOLD_DEEP : GOLD) : ink(0.13);
          ctx.fill();
        }
        ctx.fillStyle = ink(0.6); ctx.font = "12px 'Nunito Sans', sans-serif";
        ctx.fillText(r === 0 ? "input pixels" : r === nL ? "one output unit" : "layer " + r, 10, y - 11);
      }
      readout.innerHTML = `One output unit sees <b>${total} × ${total}</b> input pixels` +
        (total > N ? " (wider than this strip)." : ".") +
        (pool ? " Downsampling doubles the spacing at every level, so the view grows exponentially with depth."
              : ` Without downsampling it grows by only ${k - 1} pixels per layer.`);
    }
    $(root, "[data-action=pool]").addEventListener("click", (e) => {
      pool = !pool;
      e.currentTarget.classList.toggle("is-on", pool);
      e.currentTarget.textContent = pool ? "Downsampling: on" : "Downsampling: off";
      draw();
    });
    window.addEventListener("resize", draw);
    L.init(); K.init();
  }

  /* ------------------------------------------------------------------
   * 4. U-Net: hover blocks; switch skip connections on and off
   * ------------------------------------------------------------------ */
  async function unet() {
    const root = document.getElementById("unet-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const info = $(root, ".sim__readout");
    const out = $(root, "canvas");
    const octx = out.getContext("2d");
    const ns = "http://www.w3.org/2000/svg";
    let skips = true;

    const levels = [
      { size: 256, ch: 32 }, { size: 128, ch: 64 }, { size: 64, ch: 128 }, { size: 32, ch: 256 }
    ];
    const bottleneck = { size: 16, ch: 512 };

    function el(tag, attrs, text) {
      const e = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      if (text) e.textContent = text;
      svg.appendChild(e);
      return e;
    }

    function block(x, y, w, h, cls, label, detail) {
      const r = el("rect", { x, y, width: w, height: h, rx: 6, class: "ld-unet__block " + cls, tabindex: 0 });
      el("text", { x: x + w / 2, y: y + h + 15, class: "ld-unet__label" }, label);
      const show = () => { info.innerHTML = detail; $$(root, ".ld-unet__block").forEach((b) => b.classList.remove("is-hot")); r.classList.add("is-hot"); };
      r.addEventListener("pointerenter", show);
      r.addEventListener("focus", show);
      r.addEventListener("click", show);
    }

    function drawDiagram() {
      svg.innerHTML = "";
      const top = 22, dy = 58;
      el("text", { x: 70, y: 14, class: "ld-unet__title" }, "Encoder");
      el("text", { x: 650, y: 14, class: "ld-unet__title" }, "Decoder");
      levels.forEach((lv, i) => {
        const h = 46 - i * 8, w = 14 + i * 9;
        const y = top + i * dy;
        const xL = 40 + i * 70, xR = 680 - i * 70 - w;
        block(xL, y, w, h, "ld-unet__block--enc", `${lv.size}²`,
          `<b>Encoder level ${i + 1}</b>: two 3 × 3 convolutions give a ${lv.size} × ${lv.size} × ${lv.ch} feature map. ` +
          (i === 0 ? "These features are fine detail: edges and texture." : "A 2 × 2 max-pool halved the size, so each feature sees a larger part of the image."));
        block(xR, y, w, h, "ld-unet__block--dec", `${lv.size}²`,
          `<b>Decoder level ${i + 1}</b>: upsample to ${lv.size} × ${lv.size}, ` +
          (skips ? `concatenate the encoder's ${lv.ch} channels from the same level (skip connection), ` : "with no skip connection, ") +
          `then convolve back to ${lv.ch} channels.` + (i === 0 ? " A final 1 × 1 convolution outputs one depth value per pixel." : ""));
        if (i < levels.length - 1) {
          el("path", { d: `M${xL + w / 2} ${y + h + 18} L${xL + 70 + (14 + (i + 1) * 9) / 2} ${top + (i + 1) * dy - 4}`, class: "ld-unet__arrow" });
          el("path", { d: `M${xR - 70 + w / 2 + (i + 1) * 0} ${top + (i + 1) * dy - 4} L${xR + w / 2} ${y + h + 18}`, class: "ld-unet__arrow ld-unet__arrow--up" });
        }
        if (skips) el("path", { d: `M${xL + w + 4} ${y + h / 2} L${xR - 4} ${y + h / 2}`, class: "ld-unet__skip" });
      });
      const by = top + levels.length * dy - 6;
      el("path", { d: `M${40 + 3 * 70 + 20} ${top + 3 * dy + 30} L345 ${by}`, class: "ld-unet__arrow" });
      el("path", { d: `M375 ${by} L${680 - 3 * 70 - 20} ${top + 3 * dy + 30}`, class: "ld-unet__arrow ld-unet__arrow--up" });
      block(330, by, 60, 18, "ld-unet__block--mid", `${bottleneck.size}²`,
        `<b>Bottleneck</b>: ${bottleneck.size} × ${bottleneck.size} × ${bottleneck.ch}. The most compressed, most global summary of the scene: what is where, roughly, with little detail.`);
      el("text", { x: 360, y: by + 50, class: "ld-unet__note" }, skips ? "Gold lines: skip connections" : "Skip connections removed");
    }

    let scene;
    try { scene = await loadScene(); } catch { drawDiagram(); return; }
    const { W, H, depth } = scene;

    // "Without skips": the decoder only has the bottleneck, modelled here as the
    // depth map reduced 16 times and smoothly upsampled. "With skips": boundaries
    // are restored from fine encoder features, modelled by the full-resolution map.
    function coarse(f) {
      const w = Math.ceil(W / f), h = Math.ceil(H / f);
      const small = new Float32Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let s = 0, n = 0;
        for (let y = j * f; y < Math.min(H, (j + 1) * f); y++)
          for (let x = i * f; x < Math.min(W, (i + 1) * f); x++) { s += depth[y * W + x]; n++; }
        small[j * w + i] = s / n;
      }
      const up = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fx = Math.min(w - 1.001, Math.max(0, (x + 0.5) / f - 0.5)), fy = Math.min(h - 1.001, Math.max(0, (y + 0.5) / f - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        const a = small[y0 * w + x0], b = small[y0 * w + x0 + 1], c = small[(y0 + 1) * w + x0], d = small[(y0 + 1) * w + x0 + 1];
        up[y * W + x] = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
      }
      return up;
    }
    const blurry = coarse(16);
    out.width = W; out.height = H;

    function render() {
      drawDiagram();
      octx.putImageData(depthToImageData(skips ? depth : blurry, W, H), 0, 0);
      $(root, ".ld-unet__caption").textContent = skips
        ? "Predicted depth with skip connections: sharp drone outlines."
        : "Without skip connections: the decoder only knows the bottleneck, so outlines smear.";
      info.innerHTML = "Hover over or tap a block to see what it does.";
    }
    $(root, "[data-action=skips]").addEventListener("click", (e) => {
      skips = !skips;
      e.currentTarget.classList.toggle("is-on", skips);
      e.currentTarget.textContent = skips ? "Skip connections: on" : "Skip connections: off";
      render();
    });
    render();
  }

  /* ------------------------------------------------------------------
   * 5. Depth viewer with a simulated prediction and live metrics
   * ------------------------------------------------------------------ */
  async function viewer() {
    const root = document.getElementById("depth-sim");
    if (!root) return;
    const [left, right] = $$(root, "canvas");
    const readout = $(root, ".ld-metrics");
    const probe = $(root, ".ld-probe");
    let scene;
    try { scene = await loadScene(); } catch { readout.textContent = "Could not load the rendered scene."; return; }
    const { W, H, depth, rgb } = scene;
    [left, right].forEach((c) => { c.width = W; c.height = H; });
    const lctx = left.getContext("2d"), rctx = right.getContext("2d");
    let view = "pred";
    let medianScale = false;
    let pred = new Float32Array(W * H);

    const rgbData = new ImageData(new Uint8ClampedArray(rgb), W, H);
    lctx.putImageData(rgbData, 0, 0);

    // Fixed per-pixel noise field so sliders change magnitude, not pattern.
    const rand = rng(3);
    const noise = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) noise[i] = gauss(rand);
    // Smooth it a little so it looks like network error, not static.
    const sm = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += noise[yy * W + xx]; n++; }
      }
      sm[y * W + x] = (s / n) * 2.2;
    }

    // Edge smearing: a box blur of depth with a given radius.
    const blurCache = {};
    function blurred(r) {
      if (r === 0) return depth;
      if (blurCache[r]) return blurCache[r];
      const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += depth[y * W + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) {
          tmp[y * W + x] = s / (2 * r + 1);
          s += depth[y * W + Math.min(W - 1, x + r + 1)] - depth[y * W + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) {
          out[y * W + x] = s / (2 * r + 1);
          s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
        }
      }
      return (blurCache[r] = out);
    }

    const SC = slider(root, "scale", update, (v) => "× " + v.toFixed(2));
    const NZ = slider(root, "noise", update, (v) => v.toFixed(0) + " %");
    const BL = slider(root, "smear", update, (v) => v + " px");

    function update() {
      const s = SC.value(), nz = NZ.value() / 100, r = BL.value();
      const base = blurred(r);
      for (let i = 0; i < W * H; i++) pred[i] = Math.max(0.05, s * base[i] * (1 + nz * sm[i]));
      let p = pred;
      if (medianScale) {
        const ratios = [];
        for (let i = 0; i < W * H; i += 7) ratios.push(depth[i] / pred[i]);
        ratios.sort((a, b) => a - b);
        const k = ratios[Math.floor(ratios.length / 2)];
        p = pred.map((v) => v * k);
      }
      // Metrics
      let absrel = 0, sq = 0, d1 = 0, l1 = 0, siA = 0, siB = 0;
      const n = W * H;
      for (let i = 0; i < n; i++) {
        const g = depth[i], q = p[i];
        absrel += Math.abs(q - g) / g; sq += (q - g) * (q - g); l1 += Math.abs(q - g);
        if (Math.max(q / g, g / q) < 1.25) d1++;
        const d = Math.log(q) - Math.log(g); siA += d * d; siB += d;
      }
      const si = siA / n - (siB / n) * (siB / n);
      readout.innerHTML =
        `<span><b>AbsRel</b> ${(absrel / n).toFixed(3)}</span>` +
        `<span><b>RMSE</b> ${Math.sqrt(sq / n).toFixed(3)} m</span>` +
        `<span><b>δ &lt; 1.25</b> ${((100 * d1) / n).toFixed(1)} %</span>` +
        `<span><b>L1 loss</b> ${(l1 / n).toFixed(3)} m</span>` +
        `<span><b>Scale-invariant loss</b> ${si.toFixed(4)}</span>`;
      drawRight(p);
    }

    function drawRight(p) {
      if (view === "gt") rctx.putImageData(depthToImageData(depth, W, H), 0, 0);
      else if (view === "pred") rctx.putImageData(depthToImageData(p, W, H), 0, 0);
      else {
        const img = new ImageData(W, H);
        for (let i = 0; i < W * H; i++) {
          const e = Math.min(1, Math.abs(p[i] - depth[i]) / depth[i] / 0.3);
          const c = colormap(1 - e);
          img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
        }
        rctx.putImageData(img, 0, 0);
      }
      $(root, ".ld-right-caption").textContent =
        view === "gt" ? "Ground-truth depth (exact, from the renderer)" :
        view === "pred" ? "Simulated network prediction" : "Relative error (bright = large)";
    }

    function probeAt(e, canvas) {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * W), y = Math.floor(((e.clientY - r.top) / r.height) * H);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const g = depth[y * W + x], q = pred[y * W + x];
      probe.innerHTML = `At this pixel: true depth <b>${g.toFixed(2)} m</b>, prediction <b>${q.toFixed(2)} m</b>.`;
    }
    [left, right].forEach((c) => {
      c.addEventListener("pointermove", (e) => probeAt(e, c));
      c.addEventListener("pointerdown", (e) => probeAt(e, c));
    });

    $$(root, "[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        view = b.dataset.view;
        $$(root, "[data-view]").forEach((x) => x.classList.toggle("is-on", x === b));
        update();
      })
    );
    $(root, "[data-action=median]").addEventListener("click", (e) => {
      medianScale = !medianScale;
      e.currentTarget.classList.toggle("is-on", medianScale);
      e.currentTarget.textContent = medianScale ? "Median scaling: on" : "Median scaling: off";
      update();
    });
    SC.init(); NZ.init(); BL.init();
  }

  /* ------------------------------------------------------------------
   * 6. Open versus coded aperture: depth-dependent blur from RGB + depth
   * ------------------------------------------------------------------ */
  async function coded() {
    const root = document.getElementById("coded-sim");
    if (!root) return;
    const canvas = $(root, "canvas.ld-coded");
    const psfCanvas = $(root, "canvas.ld-psfs");
    const plotCanvas = $(root, "canvas.ld-blurplot");
    const readout = $(root, ".sim__readout");
    let scene;
    try { scene = await loadScene(); } catch { readout.textContent = "Could not load the rendered scene."; return; }

    // Work at half resolution so recomputing stays quick.
    const W = scene.W >> 1, H = scene.H >> 1;
    const rgb = new Float32Array(W * H * 3), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, z = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = (y * 2 + dy) * scene.W + (x * 2 + dx);
        r += scene.rgb[i * 4]; g += scene.rgb[i * 4 + 1]; b += scene.rgb[i * 4 + 2]; z += scene.depth[i];
      }
      const k = y * W + x;
      rgb[k * 3] = r / 4; rgb[k * 3 + 1] = g / 4; rgb[k * 3 + 2] = b / 4; depth[k] = z / 4;
    }
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    // A 7 x 7 binary code. It is deliberately asymmetric, so the blur pattern
    // in front of the focal plane is the mirror image of the one behind it.
    const CODE = [
      [1, 0, 1, 1, 0, 0, 1],
      [0, 1, 1, 0, 1, 0, 0],
      [1, 1, 0, 0, 1, 1, 0],
      [1, 0, 0, 1, 0, 1, 1],
      [0, 1, 1, 0, 0, 0, 1],
      [0, 0, 1, 1, 1, 0, 1],
      [1, 1, 0, 1, 0, 1, 1]
    ];
    let mode = "coded";
    let model = "layered";
    const A = 6; // blur scale in (half-resolution) pixels per dioptre

    // Signed blur radius: negative in front of the focal plane, positive behind.
    const signedRadius = (z, zf) => A * (1 / zf - 1 / z) * -1;

    function psf(rs, kind) {
      const r = Math.min(9, Math.abs(rs));
      const R = Math.max(0, Math.round(r));
      const size = 2 * R + 1;
      const k = new Float32Array(size * size);
      let sum = 0;
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const u = (i - R + 0.5 * 0) / Math.max(r, 0.5), v = (j - R) / Math.max(r, 0.5);
        if (u * u + v * v > 1.0001 + (R === 0 ? 1 : 0)) continue;
        let w = 1;
        if (kind === "coded" && R > 0) {
          // map (u, v) in [-1, 1] to the 7 x 7 code; mirror for the other side of focus
          let cu = Math.min(6, Math.max(0, Math.floor(((u + 1) / 2) * 7)));
          let cv = Math.min(6, Math.max(0, Math.floor(((v + 1) / 2) * 7)));
          if (rs < 0) { cu = 6 - cu; cv = 6 - cv; }
          w = CODE[cv][cu];
        }
        k[j * size + i] = w; sum += w;
      }
      if (sum === 0) { k[R * size + R] = 1; sum = 1; }
      for (let i = 0; i < k.length; i++) k[i] /= sum;
      return { k, R, size };
    }

    // Convolve premultiplied colour + alpha of one layer with a kernel.
    function convolveLayer(mask, kern, outC, outA) {
      const { k, R, size } = kern;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let j = 0; j < size; j++) {
          const yy = y + j - R;
          if (yy < 0 || yy >= H) continue;
          for (let i = 0; i < size; i++) {
            const w = k[j * size + i];
            if (w === 0) continue;
            const xx = x + i - R;
            if (xx < 0 || xx >= W) continue;
            const q = yy * W + xx;
            const m = mask[q];
            if (m === 0) continue;
            r += w * rgb[q * 3]; g += w * rgb[q * 3 + 1]; b += w * rgb[q * 3 + 2]; a += w;
          }
        }
        const p = y * W + x;
        outC[p * 3] = r; outC[p * 3 + 1] = g; outC[p * 3 + 2] = b; outA[p] = a;
      }
    }

    const ZF = slider(root, "focus", schedule, (v) => v.toFixed(1) + " m");
    let pending = null;
    function schedule() {
      drawPsfs(); drawPlot();
      clearTimeout(pending);
      pending = setTimeout(render, 120);
    }

    function render() {
      const zf = ZF.value();
      const nLayers = 14;
      const inv = depth.map((z) => 1 / z);
      const iMin = 1 / 6, iMax = 1 / 0.5;
      const layerOf = (iz) => Math.min(nLayers - 1, Math.max(0, Math.floor(((iz - iMin) / (iMax - iMin)) * nLayers)));
      const ids = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) ids[p] = layerOf(inv[p]);
      const accC = new Float32Array(W * H * 3), accA = new Float32Array(W * H);
      const lc = new Float32Array(W * H * 3), la = new Float32Array(W * H);
      const mask = new Uint8Array(W * H);
      for (let l = 0; l < nLayers; l++) { // far (small 1/z) to near
        let any = false;
        for (let p = 0; p < W * H; p++) { mask[p] = ids[p] === l ? 1 : 0; any = any || mask[p]; }
        if (!any) continue;
        const zl = 1 / (iMin + ((l + 0.5) / nLayers) * (iMax - iMin));
        const kern = psf(signedRadius(zl, zf), mode);
        convolveLayer(mask, kern, lc, la);
        for (let p = 0; p < W * H; p++) {
          if (model === "layered") {
            // nearer layers cover what is behind them (alpha compositing)
            const a = la[p];
            accC[p * 3] = accC[p * 3] * (1 - a) + lc[p * 3];
            accC[p * 3 + 1] = accC[p * 3 + 1] * (1 - a) + lc[p * 3 + 1];
            accC[p * 3 + 2] = accC[p * 3 + 2] * (1 - a) + lc[p * 3 + 2];
            accA[p] = accA[p] * (1 - a) + a;
          } else {
            // linear model: every layer is simply added, ignoring occlusion
            accC[p * 3] += lc[p * 3]; accC[p * 3 + 1] += lc[p * 3 + 1]; accC[p * 3 + 2] += lc[p * 3 + 2]; accA[p] += la[p];
          }
        }
      }
      const img = new ImageData(W, H);
      for (let p = 0; p < W * H; p++) {
        const a = Math.max(1e-3, accA[p]);
        img.data[p * 4] = accC[p * 3] / a; img.data[p * 4 + 1] = accC[p * 3 + 1] / a; img.data[p * 4 + 2] = accC[p * 3 + 2] / a; img.data[p * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      readout.innerHTML = (mode === "coded"
        ? "Coded aperture: the blur carries the code's pattern, mirrored on either side of the focal plane, so the sign of the defocus is visible."
        : "Open (circular) aperture: blur grows on both sides of the focal plane, and a disc looks the same in front of it as behind it.") +
        (model === "linear" ? " <b>Linear model</b>: layers are added without occlusion, so background colour bleeds over the edges of near objects." : "");
    }

    function drawPsfs() {
      const depths = [0.6, 1.0, 2.0, 4.0];
      const zf = ZF.value();
      const cell = 64;
      psfCanvas.width = depths.length * (cell + 12); psfCanvas.height = cell + 26;
      const p = psfCanvas.getContext("2d");
      p.clearRect(0, 0, psfCanvas.width, psfCanvas.height);
      depths.forEach((z, n) => {
        const rs = signedRadius(z, zf);
        const { k, R, size } = psf(rs * 2.2, mode); // enlarged for display
        const x0 = n * (cell + 12) + 6;
        p.fillStyle = "#000"; p.fillRect(x0, 0, cell, cell);
        let max = 0; for (const v of k) max = Math.max(max, v);
        const s = cell / Math.max(size, 3);
        for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
          const v = k[j * size + i] / (max || 1);
          if (v <= 0) continue;
          p.fillStyle = `rgba(247,223,145,${v})`;
          p.fillRect(x0 + (cell - size * s) / 2 + i * s, (cell - size * s) / 2 + j * s, Math.ceil(s), Math.ceil(s));
        }
        p.fillStyle = ink(0.7); p.font = "12px 'Nunito Sans', sans-serif"; p.textAlign = "center";
        p.fillText(z.toFixed(1) + " m", x0 + cell / 2, cell + 16);
      });
    }

    function drawPlot() {
      const w = Math.max(260, Math.round(plotCanvas.clientWidth || 320));
      plotCanvas.width = w; plotCanvas.height = Math.round(w * 0.5);
      const p = plotCanvas.getContext("2d");
      const PW = plotCanvas.width, PH = plotCanvas.height;
      p.clearRect(0, 0, PW, PH);
      const zf = ZF.value();
      const X = (z) => 30 + ((z - 0.5) / 5.5) * (PW - 40);
      const Y = (r) => PH / 2 - (r / 9) * (PH / 2 - 14);
      p.strokeStyle = ink(0.25); p.lineWidth = 1;
      p.beginPath(); p.moveTo(30, PH / 2); p.lineTo(PW - 6, PH / 2); p.stroke();
      p.fillStyle = ink(0.6); p.font = "11px 'Open Sans', sans-serif";
      p.fillText("depth (m)", PW - 62, PH / 2 - 6);
      p.fillText(mode === "coded" ? "signed blur (code flips)" : "blur size (no sign)", 34, 13);
      p.strokeStyle = GOLD_DEEP; p.lineWidth = 2.5; p.beginPath();
      for (let i = 0; i <= 200; i++) {
        const z = 0.5 + (5.5 * i) / 200;
        let r = signedRadius(z, zf);
        if (mode !== "coded") r = Math.abs(r);
        r = Math.max(-9, Math.min(9, r));
        i ? p.lineTo(X(z), Y(r)) : p.moveTo(X(z), Y(r));
      }
      p.stroke();
      p.strokeStyle = GOLD; p.setLineDash([4, 4]);
      p.beginPath(); p.moveTo(X(zf), 18); p.lineTo(X(zf), PH - 4); p.stroke(); p.setLineDash([]);
    }

    $$(root, "[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        mode = b.dataset.mode;
        $$(root, "[data-mode]").forEach((x) => x.classList.toggle("is-on", x === b));
        schedule();
      })
    );
    $$(root, "[data-model]").forEach((b) =>
      b.addEventListener("click", () => {
        model = b.dataset.model;
        $$(root, "[data-model]").forEach((x) => x.classList.toggle("is-on", x === b));
        schedule();
      })
    );
    window.addEventListener("resize", drawPlot);
    ZF.init();
  }

  function init() {
    playground(); descent(); receptive(); unet(); viewer(); coded();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
