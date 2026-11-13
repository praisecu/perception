/*
 * Interactive figures for Chapter 12, Volumetric Rendering.
 * Each figure looks for its own element id and does nothing if absent.
 * The fog renders come from tools/blender/volume_fog.py; their depth comes
 * from the stereo chapter's ground-truth disparity (media/stereo/).
 */
(() => {
  const GOLD = "#cfb97d";
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
  const fgColor = (el) => getComputedStyle(el).color;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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

  // Exclusive button group: data-<key>="value"; returns a getter.
  function buttons(root, key, onChange) {
    const list = $$(root, `[data-${key}]`);
    let value = (list.find((b) => b.classList.contains("is-on")) || list[0]).dataset[key];
    list.forEach((b) => b.addEventListener("click", () => {
      value = b.dataset[key];
      list.forEach((o) => o.classList.toggle("is-on", o === b));
      onChange(value);
    }));
    return () => value;
  }

  function canvasPoint(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * canvas.width,
      y: ((event.clientY - r.top) / r.height) * canvas.height
    };
  }

  // Pointer dragging with capture: down(p) may return false to ignore.
  function drag(canvas, { down, move, up }) {
    let active = false;
    canvas.addEventListener("pointerdown", (e) => {
      const p = canvasPoint(canvas, e);
      if (down && down(p, e) === false) return;
      active = true;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (active && move) move(canvasPoint(canvas, e), e);
    });
    const stop = (e) => {
      if (!active) return;
      active = false;
      if (up) up(canvasPoint(canvas, e), e);
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }

  const rgb = (c) => `rgb(${c.map((v) => Math.round(clamp(v, 0, 255))).join(",")})`;
  const swatch = (c) => `<span class="vr-swatch" style="background:${rgb(c)}"></span>`;

  // Axes for a line chart; returns coordinate maps.
  function axes(ctx, W, H, opt) {
    const m = Object.assign({ l: 52, r: 16, t: 16, b: 34 }, opt.margin || {});
    const X = (v) => m.l + ((v - opt.x0) / (opt.x1 - opt.x0)) * (W - m.l - m.r);
    const Y = opt.log
      ? (v) => H - m.b - ((Math.log10(Math.max(v, opt.y0)) - Math.log10(opt.y0)) / (Math.log10(opt.y1) - Math.log10(opt.y0))) * (H - m.t - m.b)
      : (v) => H - m.b - ((v - opt.y0) / (opt.y1 - opt.y0)) * (H - m.t - m.b);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.strokeStyle = opt.fg; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.l, m.t); ctx.lineTo(m.l, H - m.b); ctx.lineTo(W - m.r, H - m.b); ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.fillStyle = opt.fg; ctx.font = "12px 'Open Sans', sans-serif";
    for (const v of opt.xticks || []) ctx.fillText(opt.xfmt ? opt.xfmt(v) : v, X(v) - 8, H - m.b + 16);
    for (const v of opt.yticks || []) ctx.fillText(opt.yfmt ? opt.yfmt(v) : v, 6, Y(v) + 4);
    if (opt.xlabel) { ctx.textAlign = "center"; ctx.fillText(opt.xlabel, (m.l + W - m.r) / 2, H - 3); ctx.textAlign = "start"; }
    ctx.restore();
    return { X, Y, m };
  }

  function line(ctx, xs, ys, X, Y, color, width = 2, dash = []) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.beginPath();
    xs.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(ys[i])) : ctx.moveTo(X(x), Y(ys[i]))));
    ctx.stroke();
    ctx.restore();
  }

  function legend(ctx, items, x, y, fg) {
    ctx.save();
    ctx.font = "12px 'Open Sans', sans-serif";
    for (const [label, color] of items) {
      ctx.fillStyle = color; ctx.fillRect(x, y - 9, 14, 4);
      ctx.fillStyle = fg; ctx.globalAlpha = 0.85; ctx.fillText(label, x + 20, y - 3); ctx.globalAlpha = 1;
      x += ctx.measureText(label).width + 44;
    }
    ctx.restore();
  }

  /* ---------- 1. A slab of medium (Beer-Lambert) ---------- */
  function slab() {
    const root = document.getElementById("vr-slab");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const W = (canvas.width = 760), H = (canvas.height = 380);
    const MEDIA = { smoke: [0, 0, 0], fog: [238, 240, 244], glow: [255, 140, 40] };
    const tiles = ["#d94b4b", "#f0a830", "#f2d750", "#5fb85f", "#3aa6b9", "#4a6fd6", "#8d5ad6", "#e070b0"];

    function draw() {
      const s = sig.value(), d = th.value(), T = Math.exp(-s * d);
      const fg = fgColor(root), med = MEDIA[medium()];
      ctx.clearRect(0, 0, W, H);
      // background tiles, with the slab covering the middle
      const top = 14, h = 150, x0 = 20, x1 = W - 20, cw = (x1 - x0) / 16;
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = tiles[(i + 3 * j) % tiles.length];
          ctx.fillRect(x0 + i * cw, top + j * (h / 3), cw + 0.5, h / 3 + 0.5);
        }
      }
      ctx.fillStyle = "#fff"; ctx.font = "bold 46px 'Nunito Sans', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("PERCEPTION", W / 2, top + h / 2 + 16);
      const sx0 = W * 0.3, sx1 = W * 0.7;
      ctx.save();
      ctx.globalAlpha = 1 - T; ctx.fillStyle = rgb(med);
      ctx.fillRect(sx0, top, sx1 - sx0, h);
      ctx.restore();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.strokeRect(sx0, top, sx1 - sx0, h); ctx.setLineDash([]);
      ctx.fillStyle = fg; ctx.font = "13px 'Open Sans', sans-serif";
      ctx.fillText("seen through the slab", W / 2, top + h + 18);
      ctx.fillText("clear", (x0 + sx0) / 2, top + h + 18); ctx.fillText("clear", (x1 + sx1) / 2, top + h + 18);
      ctx.textAlign = "start";
      // transmittance against distance
      const py = top + h + 30;
      const sub = { width: W, height: H - py };
      ctx.save(); ctx.translate(0, py);
      const { X, Y } = axes(ctx, sub.width, sub.height, {
        fg, x0: 0, x1: 3, y0: 0, y1: 1, xticks: [0, 0.5, 1, 1.5, 2, 2.5, 3], yticks: [0, 0.5, 1],
        xfmt: (v) => v + " m", xlabel: "distance into the medium", margin: { t: 10 }
      });
      ctx.fillStyle = "rgba(207,185,125,0.15)";
      ctx.fillRect(X(0), Y(1), X(d) - X(0), Y(0) - Y(1));
      const xs = [], ys = [];
      for (let i = 0; i <= 150; i++) { const x = (i / 150) * 3; xs.push(x); ys.push(Math.exp(-s * x)); }
      line(ctx, xs, ys, X, Y, GOLD, 3);
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(X(d), Y(T), 6, 0, 7); ctx.fill();
      ctx.fillStyle = fg; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("T(x) = exp(-σ x)", X(2.1), Y(0.85));
      ctx.restore();
      const half = s > 0 ? (Math.LN2 / s) : Infinity;
      readout.innerHTML =
        `Optical depth <b>τ = σd = ${(s * d).toFixed(2)}</b>, transmittance <b>T = ${(T * 100).toFixed(1)}%</b>. ` +
        `Every <b>${isFinite(half) ? half.toFixed(2) + " m" : "∞"}</b> of this medium halves the light. ` +
        `Pixel = T · background + (1 − T) · ${swatch(med)}`;
    }
    const sig = slider(root, "sigma", draw, (v) => v.toFixed(2) + " /m");
    const th = slider(root, "d", draw, (v) => v.toFixed(2) + " m");
    const medium = buttons(root, "medium", draw);
    sig.init(); th.init();
  }

  /* ---------- 2. Fog in a real scene ---------- */
  function fog() {
    const root = document.getElementById("vr-fog");
    if (!root) return;
    const [cModel, cReal] = $$(root, "canvas");
    const readout = $(root, ".sim__readout");
    const LEVELS = ["0.00", "0.10", "0.20", "0.40", "0.80"];
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    let data = null, hover = null;

    Promise.all([
      ...LEVELS.map((l) => load(`media/volumetric/fog_${l}.jpg`)),
      load("media/stereo/gt_disparity.png"),
      fetch("media/stereo/cameras.json").then((r) => r.json())
    ]).then((res) => {
      const cams = res.pop(), gt = res.pop(), imgs = res;
      const W = cams.width, H = cams.height, f = cams.K[0][0], cx = cams.K[0][2], cy = cams.K[1][2];
      const pix = (img) => {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H);
        return x.getImageData(0, 0, W, H).data;
      };
      const frames = imgs.map(pix), G = pix(gt);
      const dist = new Float32Array(W * H);          // distance along each pixel's ray
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
        const j = v * W + u, disp = G[j * 4] / 2;
        const Z = disp > 0.5 ? (f * cams.baseline) / disp : 50;
        const a = (u + 0.5 - cx) / f, b = (v + 0.5 - cy) / f;
        dist[j] = Z * Math.sqrt(1 + a * a + b * b);
      }
      // Fit the airlight A for each fog level by least squares: I = J T + A (1 - T)
      const airlight = LEVELS.map((l, k) => {
        const s = Number(l); if (!s) return [0, 0, 0];
        const num = [0, 0, 0]; let den = 0;
        for (let j = 0; j < W * H; j++) {
          const T = Math.exp(-s * dist[j]), q = 1 - T;
          for (let c = 0; c < 3; c++) num[c] += q * (frames[k][j * 4 + c] - frames[0][j * 4 + c] * T);
          den += q * q;
        }
        return num.map((n) => n / den);
      });
      data = { W, H, frames, dist, airlight };
      cModel.width = cReal.width = W; cModel.height = cReal.height = H;
      draw();
    }).catch(() => { readout.textContent = "The fog images could not be loaded."; });

    function draw() {
      if (!data) return;
      const k = lvl.value(), s = Number(LEVELS[k]);
      const { W, H, frames, dist, airlight } = data, A = airlight[k];
      const out = new ImageData(W, H), J = frames[0], R = frames[k];
      let err = 0;
      for (let j = 0; j < W * H; j++) {
        const T = Math.exp(-s * dist[j]);
        for (let c = 0; c < 3; c++) {
          const v = J[j * 4 + c] * T + A[c] * (1 - T);
          out.data[j * 4 + c] = v; err += Math.abs(v - R[j * 4 + c]);
        }
        out.data[j * 4 + 3] = 255;
      }
      cModel.getContext("2d").putImageData(out, 0, 0);
      const rc = cReal.getContext("2d");
      rc.putImageData(new ImageData(new Uint8ClampedArray(R), W, H), 0, 0);
      let msg = s === 0
        ? "No fog: both images are the clear render. Move the slider to add fog."
        : `σ = ${s} /m. Fitted airlight ${swatch(A)}. Mean difference between model and path tracer: <b>${(err / (W * H * 3)).toFixed(1)}</b> gray levels (of 255).`;
      if (hover) {
        const j = hover.v * W + hover.u, d = dist[j], T = Math.exp(-s * d);
        msg += ` Pixel (${hover.u}, ${hover.v}): distance <b>${d > 40 ? "far" : d.toFixed(2) + " m"}</b>, transmittance <b>${(T * 100).toFixed(0)}%</b>.`;
        for (const c of [cModel, cReal]) {
          const x = c.getContext("2d");
          x.strokeStyle = GOLD; x.lineWidth = 2;
          x.beginPath(); x.arc(hover.u, hover.v, 7, 0, 7); x.stroke();
        }
      }
      readout.innerHTML = msg;
    }
    for (const c of [cModel, cReal]) {
      c.addEventListener("pointermove", (e) => {
        if (!data) return;
        const p = canvasPoint(c, e);
        hover = { u: clamp(Math.floor(p.x), 0, data.W - 1), v: clamp(Math.floor(p.y), 0, data.H - 1) };
        draw();
      });
      c.addEventListener("pointerleave", () => { hover = null; draw(); });
    }
    const lvl = slider(root, "level", draw, (v) => LEVELS[v] + " /m");
    lvl.init();
  }

  /* ---------- 3. A ray through a density field ---------- */
  function rayField() {
    const root = document.getElementById("vr-ray");
    if (!root) return;
    const [canvas, chart] = $$(root, "canvas");
    const ctx = canvas.getContext("2d"), cctx = chart.getContext("2d");
    const readout = $(root, ".sim__readout");
    const W = (canvas.width = 760), H = (canvas.height = 340);
    chart.width = 760; chart.height = 240;
    const S = 76;                                   // pixels per unit
    const cam = { x: 0.35, y: H / S / 2 };
    const blobs = [
      { x: 3.6, y: 2.5, r: 0.75, c: [225, 80, 80] },
      { x: 5.6, y: 2.05, r: 0.9, c: [70, 160, 235] },
      { x: 7.9, y: 2.6, r: 0.7, c: [207, 185, 125] }
    ];
    let angle = 0, grabbed = null;
    const BG = [235, 235, 235];
    const fieldW = 190, fieldH = 85;
    const off = document.createElement("canvas"); off.width = fieldW; off.height = fieldH;
    const octx = off.getContext("2d");

    function sample(x, y) {
      const p = sharp.value(), k = scale.value();
      let s = 0; const c = [0, 0, 0];
      for (const b of blobs) {
        const q = Math.hypot(x - b.x, y - b.y) / b.r;
        const v = k * Math.exp(-Math.pow(q, 2 * p));
        s += v; c[0] += v * b.c[0]; c[1] += v * b.c[1]; c[2] += v * b.c[2];
      }
      return s > 1e-9 ? { s, c: c.map((v) => v / s) } : { s: 0, c: [0, 0, 0] };
    }

    function renderField() {
      const img = octx.createImageData(fieldW, fieldH);
      for (let j = 0; j < fieldH; j++) for (let i = 0; i < fieldW; i++) {
        const { s, c } = sample(((i + 0.5) / fieldW) * (W / S), ((j + 0.5) / fieldH) * (H / S));
        const a = 1 - Math.exp(-s * 0.45), k = (j * fieldW + i) * 4;
        img.data[k] = 16 + a * (c[0] - 16); img.data[k + 1] = 21 + a * (c[1] - 21);
        img.data[k + 2] = 31 + a * (c[2] - 31); img.data[k + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
    }

    function march() {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      // distance to the canvas border
      const tx = dx > 0 ? (W / S - cam.x) / dx : dx < 0 ? -cam.x / dx : Infinity;
      const ty = dy > 0 ? (H / S - cam.y) / dy : dy < 0 ? -cam.y / dy : Infinity;
      const tf = Math.min(tx, ty), N = 500, dt = tf / N;
      const ts = [], sig = [], Ts = [], ws = [];
      let T = 1; const C = [0, 0, 0];
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) * dt, { s, c } = sample(cam.x + t * dx, cam.y + t * dy);
        const a = 1 - Math.exp(-s * dt), w = T * a;
        ts.push(t); sig.push(s); Ts.push(T); ws.push(w / dt);
        for (let k = 0; k < 3; k++) C[k] += w * c[k];
        T *= 1 - a;
      }
      for (let k = 0; k < 3; k++) C[k] += T * BG[k];
      return { ts, sig, Ts, ws, C, T, tf, dx, dy };
    }

    function draw() {
      const fg = fgColor(root);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, W, H);
      const r = march();
      // ray
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(cam.x * S, cam.y * S);
      ctx.lineTo((cam.x + r.tf * r.dx) * S, (cam.y + r.tf * r.dy) * S); ctx.stroke(); ctx.setLineDash([]);
      // camera
      ctx.save(); ctx.translate(cam.x * S, cam.y * S); ctx.rotate(angle);
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-14, 12); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("camera", 6, cam.y * S + 30);
      for (const b of blobs) { ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(b.x * S, b.y * S, 5, 0, 7); ctx.stroke(); }
      // pixel swatch
      ctx.fillStyle = rgb(r.C); ctx.fillRect(W - 70, 14, 52, 52);
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.strokeRect(W - 70, 14, 52, 52);
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillText("pixel", W - 60, 82);
      // chart
      const smax = Math.max(1e-6, ...r.sig), wmax = Math.max(1e-6, ...r.ws);
      const { X, Y } = axes(cctx, 760, 240, {
        fg: fgColor(root), x0: 0, x1: r.tf, y0: 0, y1: 1.05, yticks: [0, 0.5, 1],
        xticks: Array.from({ length: Math.floor(r.tf) + 1 }, (_, i) => i), xlabel: "distance t along the ray", margin: { t: 46 }
      });
      cctx.save();
      cctx.beginPath(); cctx.moveTo(X(0), Y(0));
      r.ts.forEach((t, i) => cctx.lineTo(X(t), Y(r.sig[i] / smax)));
      cctx.lineTo(X(r.tf), Y(0)); cctx.closePath();
      cctx.fillStyle = "rgba(120,140,170,0.35)"; cctx.fill(); cctx.restore();
      // color strip of the medium along the ray
      r.ts.forEach((t, i) => {
        const { c } = sample(cam.x + t * r.dx, cam.y + t * r.dy);
        cctx.fillStyle = rgb(c); cctx.globalAlpha = Math.min(1, r.sig[i] / smax * 1.5);
        cctx.fillRect(X(t), 6, X(r.tf) / r.ts.length + 1, 8);
      });
      cctx.globalAlpha = 1;
      line(cctx, r.ts, r.Ts, X, Y, fg, 2, [6, 4]);
      line(cctx, r.ts, r.ws.map((w) => w / wmax), X, Y, GOLD, 3);
      legend(cctx, [["density σ (scaled)", "rgba(120,140,170,0.8)"], ["transmittance T", fg], ["weight w = Tσ (scaled)", GOLD]], 70, 36, fg);
      readout.innerHTML =
        `Pixel color ${swatch(r.C)} with opacity <b>${((1 - r.T) * 100).toFixed(0)}%</b>; ` +
        `the remaining ${(r.T * 100).toFixed(0)}% comes from the light gray background. Drag a blob, or drag elsewhere to aim the ray.`;
    }

    function full() { renderField(); draw(); }
    drag(canvas, {
      down(p) {
        const x = p.x / S, y = p.y / S;
        grabbed = blobs.find((b) => Math.hypot(x - b.x, y - b.y) < b.r * 0.8) || null;
        if (!grabbed) { angle = Math.atan2(y - cam.y, x - cam.x); angle = clamp(angle, -1.3, 1.3); draw(); }
      },
      move(p) {
        const x = p.x / S, y = p.y / S;
        if (grabbed) { grabbed.x = clamp(x, 1, W / S - 0.2); grabbed.y = clamp(y, 0.2, H / S - 0.2); full(); }
        else { angle = clamp(Math.atan2(y - cam.y, x - cam.x), -1.3, 1.3); draw(); }
      },
      up() { grabbed = null; }
    });
    angle = Math.atan2(2.35 - cam.y, 6 - cam.x);
    const scale = slider(root, "scale", full, (v) => v.toFixed(1));
    const sharp = slider(root, "sharp", full, (v) => v.toFixed(1));
    scale.init(); sharp.init();
  }

  /* ---------- 4. Alpha compositing of samples ---------- */
  function composite() {
    const root = document.getElementById("vr-composite");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const W = (canvas.width = 760), H = (canvas.height = 400);
    const PALETTE = [[225, 80, 80], [70, 160, 235], [207, 185, 125], [90, 185, 110], [240, 240, 240], [40, 40, 40], [170, 100, 220], [245, 150, 60]];
    const N = 8, SMAX = 8, BG = [235, 235, 235];
    let sig = [0.3, 0.6, 2.5, 0.2, 0.8, 4, 1, 6];
    let col = [4, 0, 1, 4, 2, 3, 6, 7];
    const L = 96, CW = 66, top = 30, barTop = 70, barH = 120, rows = 222;
    const cx = (i) => L + i * CW;

    function compute() {
      const d = delta.value();
      let T = 1; const C = [0, 0, 0], out = [];
      let used = N;
      for (let i = 0; i < N; i++) {
        const a = 1 - Math.exp(-sig[i] * d), w = T * a, c = PALETTE[col[i]];
        if (T < 0.01 && used === N) used = i;
        for (let k = 0; k < 3; k++) C[k] += w * c[k];
        out.push({ a, T, w, acc: C.map((v, k) => v + T * (1 - a) * BG[k]) });
        T *= 1 - a;
      }
      return { out, T, C: C.map((v, k) => v + T * BG[k]), used };
    }

    function bar(x, y, w, h, v, color, fg, label) {
      ctx.fillStyle = "rgba(128,128,128,0.18)"; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(v, 0, 1), h);
      ctx.fillStyle = fg; ctx.font = "11px 'Open Sans', sans-serif";
      ctx.fillText(label, x + 2, y + h + 12);
    }

    function draw() {
      const fg = fgColor(root), r = compute();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = fg; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("near", L, 16); ctx.textAlign = "right"; ctx.fillText("far →", cx(N) - 10, 16); ctx.textAlign = "start";
      const labels = [["color c", top + 14], ["density σ", barTop + barH / 2], ["alpha α", rows + 8], ["T before", rows + 42], ["weight w", rows + 76], ["pixel so far", rows + 128]];
      ctx.globalAlpha = 0.8; labels.forEach(([t, y]) => ctx.fillText(t, 4, y)); ctx.globalAlpha = 1;
      for (let i = 0; i < N; i++) {
        const x = cx(i), o = r.out[i];
        ctx.globalAlpha = i >= r.used ? 0.3 : 1;
        ctx.fillStyle = rgb(PALETTE[col[i]]); ctx.fillRect(x + 8, top, CW - 16, 24);
        ctx.strokeStyle = "rgba(128,128,128,0.6)"; ctx.strokeRect(x + 8, top, CW - 16, 24);
        ctx.fillStyle = "rgba(128,128,128,0.15)"; ctx.fillRect(x + 8, barTop, CW - 16, barH);
        const h = (sig[i] / SMAX) * barH;
        ctx.fillStyle = GOLD; ctx.fillRect(x + 8, barTop + barH - h, CW - 16, h);
        ctx.fillStyle = fg; ctx.font = "11px 'Open Sans', sans-serif";
        ctx.fillText(sig[i].toFixed(1), x + 10, barTop + barH - h - 4);
        bar(x + 8, rows, CW - 16, 10, o.a, "#e07a5f", fg, o.a.toFixed(2));
        bar(x + 8, rows + 34, CW - 16, 10, o.T, "rgba(120,140,170,0.9)", fg, o.T.toFixed(2));
        bar(x + 8, rows + 68, CW - 16, 10, o.w, GOLD, fg, o.w.toFixed(2));
        ctx.fillStyle = rgb(o.acc); ctx.fillRect(x + 8, rows + 110, CW - 16, 28);
        if (i >= r.used) { ctx.fillStyle = fg; ctx.fillText("skipped", x + 12, rows + 160); }
        ctx.globalAlpha = 1;
      }
      // final pixel
      const fx = cx(N) + 14;
      ctx.fillStyle = rgb(BG); ctx.fillRect(fx, barTop, 22, barH);
      ctx.fillStyle = fg; ctx.font = "11px 'Open Sans', sans-serif"; ctx.fillText("background", fx - 10, barTop + barH + 14);
      ctx.fillStyle = rgb(r.C); ctx.fillRect(fx + 48, rows + 84, 64, 64);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(fx + 48, rows + 84, 64, 64); ctx.lineWidth = 1;
      ctx.fillStyle = fg; ctx.font = "bold 13px 'Nunito Sans', sans-serif"; ctx.fillText("pixel", fx + 64, rows + 166);
      readout.innerHTML =
        `Pixel ${swatch(r.C)} with opacity <b>${((1 - r.T) * 100).toFixed(1)}%</b>. ` +
        (r.used < N
          ? `Transmittance drops below 1% after sample ${r.used}, so front-to-back compositing can stop there and skip ${N - r.used} of ${N} samples.`
          : `Light still reaches the last sample, so all ${N} samples are needed.`);
    }

    let dragging = -1;
    drag(canvas, {
      down(p) {
        const i = Math.floor((p.x - L) / CW);
        if (i < 0 || i >= N) return false;
        if (p.y >= top && p.y <= top + 24) { col[i] = (col[i] + 1) % PALETTE.length; draw(); return false; }
        if (p.y >= barTop - 10 && p.y <= barTop + barH + 10) { dragging = i; setBar(p); return; }
        return false;
      },
      move(p) { if (dragging >= 0) setBar(p); },
      up() { dragging = -1; }
    });
    function setBar(p) {
      sig[dragging] = Math.round(clamp((barTop + barH - p.y) / barH, 0, 1) * SMAX * 10) / 10;
      draw();
    }
    const PRESETS = {
      fog: { s: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4], c: [4, 4, 4, 4, 4, 4, 4, 4] },
      wall: { s: [0.2, 0.3, 8, 8, 8, 6, 2, 5], c: [4, 4, 0, 0, 0, 3, 2, 6] },
      glass: { s: [0, 0, 1.5, 0, 0, 0, 8, 2], c: [4, 4, 1, 4, 4, 4, 7, 3] }
    };
    $$(root, "[data-preset]").forEach((b) => b.addEventListener("click", () => {
      const p = PRESETS[b.dataset.preset]; sig = p.s.slice(); col = p.c.slice(); draw();
    }));
    const delta = slider(root, "delta", draw, (v) => v.toFixed(2));
    delta.init();
  }

  /* ---------- 5. Sampling strategies ---------- */
  function sampling() {
    const root = document.getElementById("vr-sampling");
    if (!root) return;
    const [canvas, chart] = $$(root, "canvas");
    const ctx = canvas.getContext("2d"), cctx = chart.getContext("2d");
    const readout = $(root, ".sim__readout");
    const W = (canvas.width = 760), H = (canvas.height = 210);
    chart.width = 760; chart.height = 260;
    const TN = 0, TF = 4, FOG = 0.08, CS = 1, CF = 0.3;
    let samples = null, timer = null, curves = null;

    // blur > 0 gives a smoothed scene, standing in for NeRF's coarse network
    const density = (t, blur = 0) => {
      const w = Math.hypot(width.value(), blur), peak = 3 / (w * Math.sqrt(Math.PI));
      return FOG + peak * Math.exp(-(((t - pos.value()) / w) ** 2));
    };
    const colorAt = (t, blur = 0) => { const s = density(t, blur); return (FOG * CF + (s - FOG) * CS) / s; };

    function render(ts, blur = 0) {
      let T = 1, C = 0; const ws = [];
      for (let i = 0; i < ts.length; i++) {
        const d = (i + 1 < ts.length ? ts[i + 1] : TF) - ts[i];
        const a = 1 - Math.exp(-density(ts[i], blur) * d), w = T * a;
        C += w * colorAt(ts[i], blur); ws.push(w); T *= 1 - a;
      }
      return { C, ws };
    }
    function truth() { const n = 20000, ts = []; for (let i = 0; i < n; i++) ts.push(TN + (i * (TF - TN)) / n); return render(ts).C; }

    function draw_(method, n) {
      const h = (TF - TN) / n;
      if (method === "uniform") return { ts: Array.from({ length: n }, (_, i) => TN + (i + 0.5) * h), coarse: n };
      if (method === "stratified") return { ts: Array.from({ length: n }, (_, i) => TN + (i + Math.random()) * h), coarse: n };
      // hierarchical: half coarse (stratified), half drawn from the coarse weights
      const nc = Math.max(2, Math.floor(n / 2)), nf = n - nc, hc = (TF - TN) / nc;
      const tc = Array.from({ length: nc }, (_, i) => TN + (i + Math.random()) * hc);
      const { ws } = render(tc, hc);
      // each coarse sample owns the interval between its neighbours' midpoints
      const edges = [TN].concat(tc.slice(1).map((t, i) => (tc[i] + t) / 2), [TF]);
      const pdf = ws.map((w) => w + 1e-4), tot = pdf.reduce((a, b) => a + b, 0);
      const cdf = [0]; pdf.forEach((p) => cdf.push(cdf[cdf.length - 1] + p / tot));
      const tf = [];
      for (let k = 0; k < nf; k++) {
        const u = (k + Math.random()) / nf;
        let i = 0; while (i < nc - 1 && cdf[i + 1] < u) i++;
        const frac = (u - cdf[i]) / Math.max(1e-12, cdf[i + 1] - cdf[i]);
        tf.push(edges[i] + frac * (edges[i + 1] - edges[i]));
      }
      return { ts: tc.concat(tf).sort((a, b) => a - b), coarse: nc, tc };
    }

    function errorCurves() {
      const gt = truth(), Ns = [], res = { uniform: [], stratified: [], hierarchical: [] };
      for (let n = 4; n <= 64; n += 2) {
        Ns.push(n);
        for (const m of Object.keys(res)) {
          const trials = m === "uniform" ? 1 : 300;
          let e = 0; for (let k = 0; k < trials; k++) e += Math.abs(render(draw_(m, n).ts).C - gt);
          res[m].push(e / trials);
        }
      }
      return { Ns, res, gt };
    }

    function drawRay() {
      const fg = fgColor(root), m = method(), X = (t) => 40 + ((t - TN) / (TF - TN)) * (W - 70);
      ctx.clearRect(0, 0, W, H);
      const base = 120, amp = 90;
      ctx.beginPath(); ctx.moveTo(X(TN), base);
      for (let i = 0; i <= 600; i++) { const t = TN + (i / 600) * (TF - TN), s = density(t); ctx.lineTo(X(t), base - amp * (s / (s + 3))); }
      ctx.lineTo(X(TF), base); ctx.closePath();
      ctx.fillStyle = "rgba(120,140,170,0.35)"; ctx.fill();
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(X(TN), base); ctx.lineTo(X(TF), base); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = fg; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("camera", 4, base + 18); ctx.fillText("thin surface", X(pos.value()) - 30, 18);
      const { C, ws } = render(samples.ts);
      const coarse = new Set(samples.tc || []);
      samples.ts.forEach((t, i) => {
        const fine = m === "hierarchical" && !coarse.has(t);
        ctx.strokeStyle = fine ? GOLD : fg; ctx.lineWidth = fine ? 2 : 1.5;
        ctx.beginPath(); ctx.moveTo(X(t), base - 6); ctx.lineTo(X(t), base + 6); ctx.stroke();
        ctx.fillStyle = fine ? GOLD : "rgba(128,128,128,0.8)";
        ctx.fillRect(X(t) - 2, base + 10, 4, 60 * ws[i]);
      });
      ctx.fillStyle = fg; ctx.globalAlpha = 0.75;
      ctx.fillText(m === "hierarchical" ? "ticks: coarse samples (gray), fine samples (gold); bars: weights" : "ticks: samples; bars below: weights", 40, H - 8);
      ctx.globalAlpha = 1;
      const gt = curves ? curves.gt : truth();
      readout.innerHTML =
        `${samples.ts.length} samples. Estimated brightness <b>${C.toFixed(3)}</b>, true value <b>${gt.toFixed(3)}</b>, ` +
        `error <b>${Math.abs(C - gt).toFixed(3)}</b>.`;
    }

    function drawChart() {
      if (!curves) return;
      const fg = fgColor(root);
      const { X, Y } = axes(cctx, 760, 260, {
        fg, x0: 4, x1: 64, y0: 1e-4, y1: 1, log: true, xticks: [4, 16, 32, 48, 64],
        yticks: [1e-4, 1e-3, 1e-2, 1e-1, 1], yfmt: (v) => v >= 0.01 ? String(v) : v.toExponential(0), xlabel: "samples per ray N"
      });
      const colors = { uniform: fg, stratified: "rgba(120,140,170,1)", hierarchical: GOLD };
      for (const k of Object.keys(curves.res)) line(cctx, curves.Ns, curves.res[k], X, Y, colors[k], k === method() ? 3.5 : 1.5);
      const n = nS.value();
      cctx.strokeStyle = fg; cctx.globalAlpha = 0.4; cctx.setLineDash([4, 4]);
      cctx.beginPath(); cctx.moveTo(X(n), Y(1)); cctx.lineTo(X(n), Y(1e-4)); cctx.stroke(); cctx.setLineDash([]); cctx.globalAlpha = 1;
      legend(cctx, [["uniform", fg], ["stratified (mean of 300)", "rgba(120,140,170,1)"], ["hierarchical (mean of 300)", GOLD]], 270, 30, fg);
      cctx.fillStyle = fg; cctx.font = "12px 'Open Sans', sans-serif"; cctx.fillText("mean |error|", 60, 12);
    }

    function resample() { samples = draw_(method(), nS.value()); drawRay(); drawChart(); }
    function sceneChanged() {
      resample();
      clearTimeout(timer);
      timer = setTimeout(() => { curves = errorCurves(); drawRay(); drawChart(); }, 60);
    }
    const method = buttons(root, "method", resample);
    $(root, "[data-action=resample]").addEventListener("click", resample);
    const nS = slider(root, "n", resample, (v) => v);
    const pos = slider(root, "pos", sceneChanged, (v) => v.toFixed(2));
    const width = slider(root, "width", sceneChanged, (v) => v.toFixed(2));
    nS.init(); pos.init(); width.init();
  }

  /* ---------- 6. Surfaces as dense volumes ---------- */
  function surface() {
    const root = document.getElementById("vr-surface");
    if (!root) return;
    const chart = $(root, "canvas"), ctx = chart.getContext("2d");
    const readout = $(root, ".sim__readout");
    chart.width = 760; chart.height = 260;
    const T0 = 2, TF = 4;

    function draw() {
      const fg = fgColor(root), smax = sm.value(), soft = so.value();
      const n = 4000, dt = TF / n, ts = [], sig = [], Ts = [], ws = [];
      let T = 1, sw = 0, swt = 0, swt2 = 0;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) * dt;
        const s = soft > 0 ? smax / (1 + Math.exp(-(t - T0) / (soft * 0.25))) : (t >= T0 ? smax : 0);
        const a = 1 - Math.exp(-s * dt), w = T * a;
        ts.push(t); sig.push(s / smax); Ts.push(T); ws.push(w / dt);
        sw += w; swt += w * t; swt2 += w * t * t; T *= 1 - a;
      }
      const wmax = Math.max(...ws), ed = swt / sw, sd = Math.sqrt(Math.max(0, swt2 / sw - ed * ed));
      const { X, Y } = axes(ctx, 760, 260, {
        fg, x0: 0, x1: TF, y0: 0, y1: 1.05, xticks: [0, 1, 2, 3, 4], yticks: [0, 0.5, 1], xlabel: "distance t along the ray", margin: { t: 44 }
      });
      ctx.fillStyle = "rgba(120,140,170,0.3)";
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ts.forEach((t, i) => ctx.lineTo(X(t), Y(sig[i]))); ctx.lineTo(X(TF), Y(0)); ctx.fill();
      line(ctx, ts, Ts, X, Y, fg, 2, [6, 4]);
      line(ctx, ts, ws.map((w) => w / wmax), X, Y, GOLD, 3);
      ctx.strokeStyle = "#e07a5f"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(ed), Y(0)); ctx.lineTo(X(ed), Y(1.05)); ctx.stroke();
      ctx.fillStyle = fg; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("true surface", X(T0) + 6, Y(0.55));
      legend(ctx, [["density σ / σmax", "rgba(120,140,170,0.8)"], ["T", fg], ["weight w (scaled)", GOLD], ["expected depth", "#e07a5f"]], 70, 22, fg);
      readout.innerHTML =
        `Expected depth <b>${ed.toFixed(3)}</b> (true surface at ${T0}), so the depth error is <b>${(ed - T0).toFixed(3)}</b>. ` +
        `The weight is spread over about <b>±${sd.toFixed(3)}</b>, and the opacity is ${((1 - T) * 100).toFixed(1)}%.`;
    }
    const sm = slider(root, "smax", draw, (v) => v.toFixed(1));
    const so = slider(root, "soft", draw, (v) => v.toFixed(2));
    sm.init(); so.init();
  }

  /* ---------- 7. Ray marching a voxel cloud ---------- */
  function cloud() {
    const root = document.getElementById("vr-render");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    canvas.width = 640; canvas.height = 480;
    const buf = document.createElement("canvas"), bctx = buf.getContext("2d");
    const LIGHT = norm([0.55, 0.75, 0.35]);
    let yaw = 0.6, pitch = 0.25, grid = null, shadow = null, gridRes = 0, timer = null, shadowKey = "";
    const toggles = { trilinear: true, early: true };

    function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
    // value noise and fBm
    function hash(x, y, z) {
      let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }
    function noise(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const fx = x - xi, fy = y - yi, fz = z - zi;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
      const L = (a, b, t) => a + (b - a) * t;
      return L(
        L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
        L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
    }
    function cloudDensity(x, y, z) {
      // a few overlapping puffs, eroded by fBm noise
      const puffs = [[0, -0.15, 0, 0.55], [-0.4, 0.05, 0.1, 0.38], [0.38, 0.0, -0.1, 0.42], [0.05, 0.3, 0.05, 0.35]];
      let shape = 0;
      for (const [px, py, pz, r] of puffs) shape = Math.max(shape, 1 - Math.hypot(x - px, (y - py) * 1.3, z - pz) / r);
      if (shape <= 0) return 0;
      let n = 0, a = 0.5, f = 3.1;
      for (let o = 0; o < 4; o++) { n += a * noise(x * f + 11, y * f + 7, z * f + 3); a *= 0.5; f *= 2.03; }
      return Math.max(0, shape * 2.2 + (n - 0.5) * 1.2 - 0.12);
    }
    function buildGrid(R) {
      grid = new Float32Array(R * R * R); gridRes = R;
      for (let k = 0; k < R; k++) for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
        grid[(k * R + j) * R + i] = cloudDensity(-1 + (2 * (i + 0.5)) / R, -1 + (2 * (j + 0.5)) / R, -1 + (2 * (k + 0.5)) / R);
      }
      shadowKey = "";
    }
    // look up a grid at world position in [-1, 1]^3
    function lookup(g, x, y, z) {
      const R = gridRes;
      const gx = ((x + 1) / 2) * R - 0.5, gy = ((y + 1) / 2) * R - 0.5, gz = ((z + 1) / 2) * R - 0.5;
      if (!toggles.trilinear) {
        const i = clamp(Math.round(gx), 0, R - 1), j = clamp(Math.round(gy), 0, R - 1), k = clamp(Math.round(gz), 0, R - 1);
        return g[(k * R + j) * R + i];
      }
      const i0 = clamp(Math.floor(gx), 0, R - 1), j0 = clamp(Math.floor(gy), 0, R - 1), k0 = clamp(Math.floor(gz), 0, R - 1);
      const i1 = Math.min(i0 + 1, R - 1), j1 = Math.min(j0 + 1, R - 1), k1 = Math.min(k0 + 1, R - 1);
      const fx = clamp(gx - i0, 0, 1), fy = clamp(gy - j0, 0, 1), fz = clamp(gz - k0, 0, 1);
      const at = (i, j, k) => g[(k * R + j) * R + i];
      const c00 = at(i0, j0, k0) * (1 - fx) + at(i1, j0, k0) * fx, c10 = at(i0, j1, k0) * (1 - fx) + at(i1, j1, k0) * fx;
      const c01 = at(i0, j0, k1) * (1 - fx) + at(i1, j0, k1) * fx, c11 = at(i0, j1, k1) * (1 - fx) + at(i1, j1, k1) * fx;
      return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
    }
    function boxHit(o, d) {
      let tn = -Infinity, tf = Infinity;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (Math.abs(o[a]) > 1) return null; continue; }
        let t1 = (-1 - o[a]) / d[a], t2 = (1 - o[a]) / d[a];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tn = Math.max(tn, t1); tf = Math.min(tf, t2);
      }
      return tf > Math.max(tn, 0) ? [Math.max(tn, 0), tf] : null;
    }
    // light reaching each voxel through the cloud
    function buildShadow() {
      const key = `${gridRes}|${dens.value()}|${toggles.trilinear}`;
      if (key === shadowKey) return;
      const R = gridRes, steps = 28;
      shadow = new Float32Array(R * R * R);
      for (let k = 0; k < R; k++) for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
        const p = [-1 + (2 * (i + 0.5)) / R, -1 + (2 * (j + 0.5)) / R, -1 + (2 * (k + 0.5)) / R];
        const hit = boxHit(p, LIGHT), len = hit ? hit[1] : 0, ds = len / steps;
        let tau = 0;
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) * ds;
          tau += lookup(grid, p[0] + LIGHT[0] * t, p[1] + LIGHT[1] * t, p[2] + LIGHT[2] * t) * ds;
        }
        shadow[(k * R + j) * R + i] = Math.exp(-tau * dens.value());
      }
      shadowKey = key;
    }

    function render(scale) {
      const t0 = performance.now();
      const R = res.value();
      if (R !== gridRes) buildGrid(R);
      const lit = mode() === "lit";
      if (lit) buildShadow();
      const w = Math.round(320 * scale), h = Math.round(240 * scale);
      buf.width = w; buf.height = h;
      const img = bctx.createImageData(w, h), D = img.data;
      const cp = Math.cos(pitch), sp = Math.sin(pitch), cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const dist = 3.3, eye = [dist * cp * syw, dist * sp, dist * cp * cyw];
      const fwd = norm(eye.map((v) => -v)), right = norm([fwd[2], 0, -fwd[0]]);
      const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
      const tanH = Math.tan((40 * Math.PI) / 360), sigma = dens.value(), steps = stp.value();
      const dt = (2 * Math.sqrt(3)) / steps;
      let samples = 0, possible = 0;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const sx = ((2 * (px + 0.5)) / w - 1) * tanH * (w / h), sy = (1 - (2 * (py + 0.5)) / h) * tanH;
        const d = norm([fwd[0] + sx * right[0] + sy * up[0], fwd[1] + sx * right[1] + sy * up[1], fwd[2] + sx * right[2] + sy * up[2]]);
        // sky background
        const g = 0.5 + 0.5 * d[1];
        const bg = [18 + 40 * g, 28 + 60 * g, 48 + 90 * g];
        let T = 1, r = 0, gg = 0, b = 0;
        const hit = boxHit(eye, d);
        if (hit) {
          const n = Math.ceil((hit[1] - hit[0]) / dt);
          possible += n;
          for (let s = 0; s < n; s++) {
            const t = hit[0] + (s + 0.5) * dt;
            const x = eye[0] + d[0] * t, y = eye[1] + d[1] * t, z = eye[2] + d[2] * t;
            const sv = lookup(grid, x, y, z) * sigma;
            samples++;
            if (sv <= 0) continue;
            const a = 1 - Math.exp(-sv * dt), wgt = T * a;
            if (lit) {
              const L = lookup(shadow, x, y, z);
              r += wgt * (255 * L * 1.05 + 70); gg += wgt * (245 * L + 85); b += wgt * (220 * L + 110);
            } else { r += wgt * 230; gg += wgt * 200; b += wgt * 140; }
            T *= 1 - a;
            if (toggles.early && T < 0.01) break;
          }
        }
        const k = (py * w + px) * 4;
        D[k] = r + T * bg[0]; D[k + 1] = gg + T * bg[1]; D[k + 2] = b + T * bg[2]; D[k + 3] = 255;
      }
      bctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
      const ms = performance.now() - t0;
      readout.innerHTML =
        `${w} × ${h} rays, <b>${samples.toLocaleString()}</b> density lookups` +
        (toggles.early && possible > samples ? ` (early termination skipped ${(100 * (1 - samples / possible)).toFixed(0)}%)` : "") +
        `, voxel grid ${R}³ = ${(R ** 3).toLocaleString()} values, ${ms.toFixed(0)} ms` + (scale < 1 ? " (preview while dragging)" : "") + ".";
    }
    function schedule(scale = 1) { clearTimeout(timer); timer = setTimeout(() => render(scale), scale < 1 ? 0 : 40); }

    let last = null;
    drag(canvas, {
      down(p) { last = p; },
      move(p) {
        yaw -= (p.x - last.x) * 0.012; pitch = clamp(pitch + (p.y - last.y) * 0.01, -1.3, 1.3);
        last = p; schedule(0.5);
      },
      up() { schedule(1); }
    });
    const mode = buttons(root, "light", () => schedule());
    $$(root, "[data-toggle]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.toggle; toggles[k] = !toggles[k]; b.classList.toggle("is-on", toggles[k]);
      if (k === "trilinear") shadowKey = "";
      schedule();
    }));
    const dens = slider(root, "density", () => schedule(), (v) => v.toFixed(1));
    const stp = slider(root, "steps", () => schedule(), (v) => v);
    const res = slider(root, "res", () => schedule(), (v) => `${v}³`);
    dens.init(); stp.init(); res.init();
  }

  /* ---------- 8. Sphere tracing a signed distance field ---------- */
  function sdf() {
    const root = document.getElementById("vr-sdf");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const W = (canvas.width = 760), H = (canvas.height = 400);
    const circles = [[430, 110, 62], [610, 300, 48], [250, 330, 34]];
    const boxes = [[330, 230, 62, 34], [650, 120, 7, 70]];      // center and half sizes
    const cam = { x: 50, y: 210 }, aim = { x: 720, y: 150 };
    function f(x, y) {
      let d = Infinity;
      for (const [cx, cy, r] of circles) d = Math.min(d, Math.hypot(x - cx, y - cy) - r);
      for (const [cx, cy, hx, hy] of boxes) {
        const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
        d = Math.min(d, Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
      }
      return d;
    }
    // distance field picture, computed once
    const bg = document.createElement("canvas"); bg.width = W / 2; bg.height = H / 2;
    (() => {
      const x = bg.getContext("2d"), img = x.createImageData(bg.width, bg.height);
      for (let j = 0; j < bg.height; j++) for (let i = 0; i < bg.width; i++) {
        const d = f(i * 2 + 1, j * 2 + 1), k = (j * bg.width + i) * 4;
        if (d < 0) { img.data[k] = 150; img.data[k + 1] = 132; img.data[k + 2] = 84; }
        else {
          const band = 0.5 + 0.5 * Math.cos((d / 22) * 2 * Math.PI), fade = Math.exp(-d / 260);
          const v = 16 + 22 * band * fade;
          img.data[k] = v; img.data[k + 1] = v + 6; img.data[k + 2] = v + 16;
        }
        img.data[k + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    })();

    function draw() {
      ctx.drawImage(bg, 0, 0, W, H);
      const L = Math.hypot(aim.x - cam.x, aim.y - cam.y) || 1;
      const dx = (aim.x - cam.x) / L, dy = (aim.y - cam.y) / L;
      const inside = (x, y) => x > -5 && x < W + 5 && y > -5 && y < H + 5;
      // sphere tracing, always computed to report the true hit
      let x = cam.x, y = cam.y, steps = 0, hitT = null; const pts = [];
      while (steps < 200 && inside(x, y)) {
        const d = f(x, y); pts.push([x, y, d]); steps++;
        if (d < 0.5) { hitT = Math.hypot(x - cam.x, y - cam.y); break; }
        x += dx * d; y += dy * d;
      }
      ctx.lineWidth = 1.5;
      if (march() === "sphere") {
        for (const [px, py, d] of pts) {
          ctx.strokeStyle = "rgba(207,185,125,0.45)"; ctx.beginPath(); ctx.arc(px, py, Math.max(d, 0), 0, 7); ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.moveTo(cam.x, cam.y);
        pts.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.stroke();
        ctx.fillStyle = GOLD; pts.forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill(); });
        readout.innerHTML = hitT !== null
          ? `Sphere tracing hit a surface after <b>${steps}</b> steps, at distance ${hitT.toFixed(0)} px.`
          : `The ray left the scene after <b>${steps}</b> steps without hitting anything.`;
      } else {
        const s = stepSize.value(); let n = 0, fx = cam.x, fy = cam.y, fixedHit = null;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        while (n < 400 && inside(fx, fy)) {
          n++; ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, 7); ctx.fill();
          if (f(fx, fy) < 0) { fixedHit = Math.hypot(fx - cam.x, fy - cam.y); break; }
          fx += dx * s; fy += dy * s;
        }
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(fx, fy); ctx.stroke();
        if (fixedHit !== null) { ctx.fillStyle = "#e07a5f"; ctx.beginPath(); ctx.arc(fx, fy, 6, 0, 7); ctx.fill(); }
        let msg = `Fixed steps of ${s} px took <b>${n}</b> steps (sphere tracing: ${steps}). `;
        if (fixedHit === null && hitT !== null) msg += "<b>It stepped straight through the object that sphere tracing found.</b>";
        else if (fixedHit !== null && hitT !== null && fixedHit > hitT + s) msg += "<b>It skipped the first object and hit one behind it.</b>";
        else if (fixedHit !== null) msg += `It found the surface up to ${s} px too deep.`;
        else msg += "Neither method hits anything along this ray.";
        readout.innerHTML = msg;
      }
      // handles
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(cam.x, cam.y, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(aim.x, aim.y, 9, 0, 7); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("camera", cam.x - 20, cam.y + 26); ctx.fillText("aim", aim.x - 10, aim.y + 26);
    }
    let grabbed = null;
    drag(canvas, {
      down(p) {
        grabbed = Math.hypot(p.x - cam.x, p.y - cam.y) < 22 ? cam : aim;
        grabbed.x = p.x; grabbed.y = p.y; draw();
      },
      move(p) { grabbed.x = clamp(p.x, 5, W - 5); grabbed.y = clamp(p.y, 5, H - 5); draw(); },
      up() { grabbed = null; }
    });
    const march = buttons(root, "march", draw);
    const stepSize = slider(root, "step", draw, (v) => v + " px");
    stepSize.init();
  }

  function init() {
    slab(); fog(); rayField(); composite(); sampling(); surface(); cloud(); sdf();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
