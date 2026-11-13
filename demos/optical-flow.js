/*
 * Interactive figures for Chapter 15, Motion Fields and Optical Flow.
 * Each figure looks for its own element id and does nothing if absent.
 * The image pair is a Blender render with exact ground-truth flow
 * (media/optical-flow/gt_flow.png: u = (R - 128) / 8, v = (G - 128) / 8, B = visible).
 */
(() => {
  const MEDIA = "media/optical-flow/";
  const GOLD = "#cfb97d", RED = "#ff6b6b", GREEN = "#3ecf8e", BLUE = "#5aa9ff";
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

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

  // A row of toggle buttons sharing one data attribute; returns the current value.
  function choice(root, attr, onChange) {
    const buttons = $$(root, `[data-${attr}]`);
    let value = (buttons.find((b) => b.classList.contains("is-on")) || buttons[0]).dataset[attr];
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        buttons.forEach((x) => x.classList.toggle("is-on", x === b));
        value = b.dataset[attr];
        onChange(value);
      })
    );
    return () => value;
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

  // Drag (mouse, pen or touch) on a canvas; handler gets canvas coordinates.
  function onDrag(canvas, handler, onStart) {
    let down = false;
    canvas.addEventListener("pointerdown", (e) => {
      down = true;
      canvas.setPointerCapture(e.pointerId);
      const p = canvasPoint(canvas, e);
      if (onStart) onStart(p);
      handler(p, true);
    });
    canvas.addEventListener("pointermove", (e) => { if (down) handler(canvasPoint(canvas, e), false); });
    const end = () => { down = false; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  // Text colour of the page, so canvas labels follow the light or dark theme.
  const ink = (el) => getComputedStyle(el).color || "#ddd";

  // Run a loop only while the figure is on screen. setTimeout keeps it going in
  // background tabs where requestAnimationFrame may be paused.
  function whileVisible(root, step, ms = 40) {
    let visible = false, timer = null;
    const tick = () => { timer = null; if (!visible) return; step(); timer = setTimeout(tick, ms); };
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !timer) tick();
    }).observe(root);
  }

  function arrow(ctx, x0, y0, x1, y1, color, width = 1.5, head = 5) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const h = Math.min(head, len * 0.6), a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45));
    ctx.lineTo(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill();
  }

  /* ---------- Flow colour coding (the Middlebury colour wheel) ---------- */
  const WHEEL = (() => {
    const segs = [[15, (i, n) => [255, (255 * i) / n, 0]], [6, (i, n) => [255 - (255 * i) / n, 255, 0]],
      [4, (i, n) => [0, 255, (255 * i) / n]], [11, (i, n) => [0, 255 - (255 * i) / n, 255]],
      [13, (i, n) => [(255 * i) / n, 0, 255]], [6, (i, n) => [255, 0, 255 - (255 * i) / n]]];
    const cols = [];
    segs.forEach(([n, f]) => { for (let i = 0; i < n; i++) cols.push(f(i, n)); });
    return cols;
  })();

  // Colour of flow (u, v) whose magnitude is normalised by maxMag. Writes into out[0..2].
  function flowColor(u, v, maxMag, out) {
    const nc = WHEEL.length;
    const fu = u / maxMag, fv = v / maxMag;
    const rad = Math.hypot(fu, fv);
    const a = Math.atan2(-fv, -fu) / Math.PI;
    const fk = ((a + 1) / 2) * (nc - 1);
    const k0 = Math.floor(fk), k1 = (k0 + 1) % nc, f = fk - k0;
    for (let i = 0; i < 3; i++) {
      let c = ((1 - f) * WHEEL[k0][i] + f * WHEEL[k1][i]) / 255;
      c = rad <= 1 ? 1 - rad * (1 - c) : c * 0.75;
      out[i] = Math.round(255 * c);
    }
    return out;
  }

  /* ---------- Small image-processing toolkit ---------- */
  function grayOf(img, W, H) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return g;
  }

  // Separable [1 4 6 4 1] / 16 blur with clamped borders.
  function blur(src, W, H) {
    const k = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let i = -2; i <= 2; i++) s += k[i + 2] * src[y * W + clamp(x + i, 0, W - 1)];
        tmp[y * W + x] = s;
      }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let i = -2; i <= 2; i++) s += k[i + 2] * tmp[clamp(y + i, 0, H - 1) * W + x];
        out[y * W + x] = s;
      }
    return out;
  }

  function down(src, W, H) {
    const b = blur(src, W, H);
    const w = W >> 1, h = H >> 1, out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = b[2 * y * W + 2 * x];
    return { img: out, W: w, H: h };
  }

  function pyramid(img, W, H, levels) {
    const p = [{ img, W, H }];
    for (let l = 1; l < levels; l++) p.push(down(p[l - 1].img, p[l - 1].W, p[l - 1].H));
    return p;
  }

  function sample(img, W, H, x, y) {
    x = clamp(x, 0, W - 1.001); y = clamp(y, 0, H - 1.001);
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i = y0 * W + x0;
    return (1 - fy) * ((1 - fx) * img[i] + fx * img[i + 1]) + fy * ((1 - fx) * img[i + W] + fx * img[i + W + 1]);
  }

  function gradients(img, W, H) {
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        gx[i] = 0.5 * (img[y * W + Math.min(x + 1, W - 1)] - img[y * W + Math.max(x - 1, 0)]);
        gy[i] = 0.5 * (img[Math.min(y + 1, H - 1) * W + x] - img[Math.max(y - 1, 0) * W + x]);
      }
    return { gx, gy };
  }

  /* ---------- The rendered image pair with ground truth ---------- */
  let pairPromise = null;
  function pair() {
    if (!pairPromise) {
      pairPromise = Promise.all([
        loadImage(MEDIA + "frame0.jpg"),
        loadImage(MEDIA + "frame1.jpg"),
        loadImage(MEDIA + "gt_flow.png"),
        fetch(MEDIA + "meta.json").then((r) => r.json())
      ]).then(([f0, f1, gtImg, meta]) => {
        const W = meta.width, H = meta.height;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(gtImg, 0, 0);
        const d = x.getImageData(0, 0, W, H).data;
        const gu = new Float32Array(W * H), gv = new Float32Array(W * H), vis = new Uint8Array(W * H);
        for (let j = 0, i = 0; j < W * H; j++, i += 4) {
          gu[j] = (d[i] - 128) / 8; gv[j] = (d[i + 1] - 128) / 8; vis[j] = d[i + 2] > 127 ? 1 : 0;
        }
        const g0 = blur(grayOf(f0, W, H), W, H), g1 = blur(grayOf(f1, W, H), W, H);
        return { W, H, meta, f0, f1, g0, g1, gu, gv, vis };
      });
    }
    return pairPromise;
  }

  /* Lucas-Kanade at one point, optionally coarse to fine. Returns the estimate and the
     level-0 structure tensor of the window (used for the plot and the eigenvalues). */
  function lkPoint(P0, P1, G0, px, py, half, levels, iters = 6) {
    let u = 0, v = 0;
    for (let l = levels - 1; l >= 0; l--) {
      const { img: A, W, H } = P0[l], B = P1[l].img, { gx, gy } = G0[l];
      const s = 1 / (1 << l), cx = px * s, cy = py * s;
      u *= l === levels - 1 ? 1 : 2; v *= l === levels - 1 ? 1 : 2;
      if (l === levels - 1) { u = 0; v = 0; }
      for (let it = 0; it < iters; it++) {
        let sxx = 0, sxy = 0, syy = 0, sxt = 0, syt = 0;
        for (let dy = -half; dy <= half; dy++)
          for (let dx = -half; dx <= half; dx++) {
            const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
            if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
            const i = y * W + x;
            const ix = gx[i], iy = gy[i];
            const t = sample(B, W, H, x + u, y + v) - A[i];
            sxx += ix * ix; sxy += ix * iy; syy += iy * iy; sxt += ix * t; syt += iy * t;
          }
        const det = sxx * syy - sxy * sxy;
        if (Math.abs(det) < 1e-6) break;
        const du = (-syy * sxt + sxy * syt) / det, dv = (sxy * sxt - sxx * syt) / det;
        u += du; v += dv;
        if (Math.hypot(du, dv) < 0.01) break;
      }
    }
    return { u, v };
  }

  function eig2(a, b, c) {
    // eigen decomposition of [[a, b], [b, c]]
    const tr = a + c, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    const l1 = tr / 2 + d, l2 = tr / 2 - d;
    const ang = 0.5 * Math.atan2(2 * b, a - c);
    return { l1, l2, ang };
  }

  /* Dense flow on a pair of grey images (both already blurred), coarse to fine. */
  function denseFlow(I0, I1, W, H, opts) {
    const levels = opts.levels;
    const P0 = pyramid(I0, W, H, levels), P1 = pyramid(I1, W, H, levels);
    let u = null, v = null, valid = null;
    for (let l = levels - 1; l >= 0; l--) {
      const { img: A, W: w, H: h } = P0[l], B = P1[l].img;
      const n = w * h;
      // upsample the previous level's flow
      const u0 = new Float32Array(n), v0 = new Float32Array(n);
      if (u) {
        const pw = P0[l + 1].W, ph = P0[l + 1].H;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            u0[y * w + x] = 2 * sample(u, pw, ph, x / 2, y / 2);
            v0[y * w + x] = 2 * sample(v, pw, ph, x / 2, y / 2);
          }
      }
      // Re-warp a few times per level (Gauss-Newton style) so the linearisation stays accurate.
      const warps = opts.warps || 1;
      const itersPerWarp = Math.max(1, Math.round(opts.iters / warps));
      for (let wp = 0; wp < warps; wp++) {
        // warp B toward A by the current flow; average gradients of A and warped B
        const Bw = new Float32Array(n);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) Bw[y * w + x] = sample(B, w, h, x + u0[y * w + x], y + v0[y * w + x]);
        const ga = gradients(A, w, h), gb = gradients(Bw, w, h);
        const Ix = new Float32Array(n), Iy = new Float32Array(n), It = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          Ix[i] = 0.5 * (ga.gx[i] + gb.gx[i]); Iy[i] = 0.5 * (ga.gy[i] + gb.gy[i]); It[i] = Bw[i] - A[i];
        }
        const du = new Float32Array(n), dv = new Float32Array(n);
        valid = new Uint8Array(n).fill(1);
        if (opts.method === "lk") {
          const r = opts.half;
          const box = (f) => {
            // box sum over a (2r+1)^2 window via an integral image
            const S = new Float64Array((w + 1) * (h + 1));
            for (let y = 0; y < h; y++) {
              let row = 0;
              for (let x = 0; x < w; x++) { row += f(y * w + x); S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row; }
            }
            const out = new Float32Array(n);
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) {
                const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
                out[y * w + x] = S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0];
              }
            return out;
          };
          const sxx = box((i) => Ix[i] * Ix[i]), sxy = box((i) => Ix[i] * Iy[i]), syy = box((i) => Iy[i] * Iy[i]);
          const sxt = box((i) => Ix[i] * It[i]), syt = box((i) => Iy[i] * It[i]);
          const area = (2 * r + 1) ** 2;
          for (let i = 0; i < n; i++) {
            const det = sxx[i] * syy[i] - sxy[i] * sxy[i];
            const lmin = eig2(sxx[i], sxy[i], syy[i]).l2 / area;
            if (lmin < opts.minEig || det <= 0) { valid[i] = 0; continue; }
            du[i] = (-syy[i] * sxt[i] + sxy[i] * syt[i]) / det;
            dv[i] = (sxy[i] * sxt[i] - sxx[i] * syt[i]) / det;
          }
        } else {
          // Horn-Schunck on the increment, with smoothness on the total flow u0 + du
          const a2 = opts.alpha * opts.alpha;
          const U = new Float32Array(n), V = new Float32Array(n);
          for (let it = 0; it < itersPerWarp; it++) {
            for (let i = 0; i < n; i++) { U[i] = u0[i] + du[i]; V[i] = v0[i] + dv[i]; }
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const xl = x > 0 ? i - 1 : i, xr = x < w - 1 ? i + 1 : i, yu = y > 0 ? i - w : i, yd = y < h - 1 ? i + w : i;
                const ub = 0.25 * (U[xl] + U[xr] + U[yu] + U[yd]) - u0[i];
                const vb = 0.25 * (V[xl] + V[xr] + V[yu] + V[yd]) - v0[i];
                const k = (Ix[i] * ub + Iy[i] * vb + It[i]) / (a2 + Ix[i] * Ix[i] + Iy[i] * Iy[i]);
                du[i] = ub - Ix[i] * k; dv[i] = vb - Iy[i] * k;
              }
          }
        }
        // invalid LK pixels keep the current flow; the rest add their increment
        for (let i = 0; i < n; i++) { u0[i] += du[i]; v0[i] += dv[i]; }
      }
      u = u0; v = v0;
    }
    return { u, v, valid };
  }

  /* ---------- 1. Motion field versus optical flow on a sphere ---------- */
  function sphere() {
    const root = document.getElementById("of-sphere");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const N = 220, R = 92, C = N / 2;
    canvas.width = N * 2 + 20; canvas.height = N;
    let t = 0;
    const scene = choice(root, "scene", () => draw());

    function render(time) {
      const s = scene();
      const theta = s === "light" ? 0 : time * 0.9;
      const phi = s === "light" ? time * 1.4 : 0.6;
      const L = [Math.sin(phi) * 0.8, -0.45, Math.cos(phi) * 0.8];
      const ln = Math.hypot(...L);
      const img = new Float32Array(N * N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const nx = (x - C) / R, ny = (y - C) / R, r2 = nx * nx + ny * ny;
          if (r2 >= 1) { img[y * N + x] = 18; continue; }
          const nz = Math.sqrt(1 - r2);
          // body coordinates: rotate about the vertical axis by -theta
          const bx = nx * Math.cos(theta) - nz * Math.sin(theta), bz = nx * Math.sin(theta) + nz * Math.cos(theta);
          let albedo = 0.78;
          if (s === "texture") {
            // a smooth pattern painted on the surface, so it moves with the sphere
            const lon = Math.atan2(bx, bz), lat = Math.asin(clamp(ny, -1, 1));
            albedo = 0.62 + 0.3 * Math.sin(6 * lon) * Math.cos(5 * lat);
          }
          const shade = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ln);
          img[y * N + x] = 255 * albedo * (0.12 + 0.88 * shade);
        }
      return img;
    }

    function draw() {
      const s = scene();
      const dt = 0.025;
      const A = render(t), B = render(t + dt);
      const id = ctx.createImageData(N, N);
      for (let i = 0; i < N * N; i++) {
        const g = clamp(A[i], 0, 255);
        id.data[4 * i] = g; id.data[4 * i + 1] = g; id.data[4 * i + 2] = g; id.data[4 * i + 3] = 255;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(id, 0, 0);
      ctx.putImageData(id, N + 20, 0);
      const omega = s === "light" ? 0 : 0.9;
      const LEN = 5; // arrows are drawn 5 times longer than the motion per frame
      // measured flow: Lucas-Kanade between consecutive frames on a grid
      const Ab = blur(A, N, N), Bb = blur(B, N, N);
      const P0 = [{ img: Ab, W: N, H: N }], P1 = [{ img: Bb, W: N, H: N }], G0 = [gradients(Ab, N, N)];
      let field = 0, flow = 0, count = 0;
      for (let y = 14; y < N; y += 16)
        for (let x = 14; x < N; x += 16) {
          const nx = (x - C) / R, ny = (y - C) / R;
          if (nx * nx + ny * ny >= 0.9) continue;
          const nz = Math.sqrt(1 - nx * nx - ny * ny);
          // motion field of a sphere spinning about the vertical axis (orthographic view):
          // a surface point moves sideways at a speed proportional to its depth coordinate
          const fu = omega * nz * R * dt;
          arrow(ctx, x, y, x + fu * LEN, y, GOLD, 1.6, 5);
          const e = lkPoint(P0, P1, G0, x, y, 4, 1, 3);
          const eu = Math.abs(e.u) > 10 ? 0 : e.u, ev = Math.abs(e.v) > 10 ? 0 : e.v;
          arrow(ctx, N + 20 + x, y, N + 20 + x + eu * LEN, y + ev * LEN, RED, 1.6, 5);
          field += fu; flow += Math.hypot(eu, ev); count++;
        }
      ctx.font = "600 12px 'Nunito Sans', sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText("Motion field", 8, 16);
      ctx.fillText("Optical flow (measured)", N + 28, 16);
      const mf = field / count, of = flow / count;
      const msg = {
        texture: "The textured sphere spins. Its surface points move, and the brightness pattern moves with them, so the measured flow matches the motion field.",
        plain: "The plain sphere spins just as fast, so the motion field is unchanged. But the image does not change at all, so there is no optical flow to measure.",
        light: "The sphere is still, so the motion field is zero everywhere. The light moves, the shading slides across the surface, and the measured flow is not zero."
      }[s];
      readout.innerHTML = `${msg} Average arrow length: motion field <b>${mf.toFixed(2)}</b> px per frame, optical flow <b>${of.toFixed(2)}</b> px per frame.`;
    }

    whileVisible(root, () => { t += 0.05; draw(); }, 60);
    draw();
  }

  /* ---------- 2. The aperture problem ---------- */
  function aperture() {
    const root = document.getElementById("of-aperture");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const W = 640, H = 340;
    canvas.width = W; canvas.height = H;
    let ap = { x: 216, y: 134, r: 46 }, t = 0, reveal = false;
    const Dir = slider(root, "dir", () => draw(), (v) => `${v}°`);
    const Rad = slider(root, "rad", () => { ap.r = Rad.value(); draw(); }, (v) => `${v} px`);
    $(root, "[data-action=reveal]").addEventListener("click", (e) => {
      reveal = !reveal;
      e.target.textContent = reveal ? "Hide the scene" : "Show the whole scene";
      e.target.classList.toggle("is-on", reveal);
      draw();
    });
    $$(root, "[data-spot]").forEach((b) =>
      b.addEventListener("click", () => {
        const [x, y] = b.dataset.spot.split(",").map(Number);
        ap.x = x; ap.y = y; draw();
      })
    );
    onDrag(canvas, (p) => { ap.x = p.x; ap.y = p.y; draw(); });

    // a rotated square that drifts back and forth along the chosen direction
    function square() {
      const a = (Dir.value() * Math.PI) / 180;
      const s = Math.sin(t) * 40;
      const cx = 300 + Math.cos(a) * s, cy = 180 + Math.sin(a) * s;
      const rot = 0.5, h = 95;
      const pts = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [
        cx + x * Math.cos(rot) - y * Math.sin(rot),
        cy + x * Math.sin(rot) + y * Math.cos(rot)
      ]);
      return { pts, dir: [Math.cos(a), Math.sin(a)], speed: Math.cos(t) };
    }

    function segCircle(p, q, c, r) {
      // shortest distance from circle center to segment pq
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const k = clamp(((c.x - p[0]) * dx + (c.y - p[1]) * dy) / (dx * dx + dy * dy), 0, 1);
      return Math.hypot(p[0] + k * dx - c.x, p[1] + k * dy - c.y) < r;
    }

    function draw() {
      const sq = square();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#1c1b18"; ctx.fillRect(0, 0, W, H);
      // the moving square, with stripes so motion along an edge is visible when revealed
      ctx.save();
      ctx.beginPath(); sq.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      ctx.fillStyle = "#d8cfb4"; ctx.fill();
      ctx.restore();
      // mask outside the aperture
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(ap.x, ap.y, ap.r, 0, Math.PI * 2, true);
      ctx.fillStyle = reveal ? "rgba(10,10,10,0.55)" : "rgba(10,10,10,0.97)";
      ctx.fill("evenodd");
      ctx.restore();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ap.x, ap.y, ap.r, 0, Math.PI * 2); ctx.stroke();

      // what can be seen inside the aperture
      const corners = sq.pts.filter(([x, y]) => Math.hypot(x - ap.x, y - ap.y) < ap.r).length;
      const edges = [];
      for (let i = 0; i < 4; i++) {
        const p = sq.pts[i], q = sq.pts[(i + 1) % 4];
        if (segCircle(p, q, ap, ap.r)) edges.push([q[0] - p[0], q[1] - p[1]]);
      }
      const d = sq.dir, L = 70;
      arrow(ctx, ap.x, ap.y, ap.x + d[0] * L, ap.y + d[1] * L, "rgba(207,185,125,0.85)", 2, 8);
      let text;
      if (corners > 0 || edges.length >= 2) {
        const nonParallel = edges.length >= 2 && edges.some((e) => Math.abs(e[0] * edges[0][1] - e[1] * edges[0][0]) > 1e-3 * Math.hypot(...e) * Math.hypot(...edges[0]));
        if (corners > 0 || nonParallel) {
          arrow(ctx, ap.x, ap.y, ap.x + d[0] * L, ap.y + d[1] * L, GREEN, 3, 10);
          text = "A <b>corner</b> is inside the aperture. Two edge directions pin down the motion: the measured motion (green) equals the true motion (gold).";
        }
      }
      if (!text && edges.length) {
        const e = edges[0], el = Math.hypot(...e);
        const n = [-e[1] / el, e[0] / el];
        const dn = d[0] * n[0] + d[1] * n[1];
        arrow(ctx, ap.x, ap.y, ap.x + n[0] * dn * L, ap.y + n[1] * dn * L, RED, 3, 10);
        const ang = Math.round((Math.acos(clamp(Math.abs(dn), 0, 1)) * 180) / Math.PI);
        text = `Only one <b>edge</b> is visible. Any motion along the edge leaves the view unchanged, so only the <b>normal component</b> (red) can be measured. It is ${ang}° off the true direction and ${Math.round(Math.abs(dn) * 100)}% as long.`;
      }
      if (!text) text = "The aperture sees a <b>uniform region</b>. Nothing changes inside it, so no motion can be measured at all.";
      readout.innerHTML = text + " Drag the aperture to explore.";
    }

    whileVisible(root, () => { t += 0.05; draw(); }, 40);
    Dir.init(); Rad.init();
  }

  /* ---------- 3. Lucas-Kanade on a window: constraint lines and the structure tensor ---------- */
  function lucasKanade() {
    const root = document.getElementById("of-lk");
    if (!root) return;
    const [view, plot] = $$(root, "canvas");
    const vctx = view.getContext("2d"), pctx = plot.getContext("2d");
    const readout = $(root, ".sim__readout");
    let data = null, P0, P1, G0, pt = { x: 150, y: 290 };
    const PW = 360, RANGE = 16;
    plot.width = PW; plot.height = PW;
    const Half = slider(root, "half", () => draw(), (v) => `${2 * v + 1} × ${2 * v + 1}`);
    const Levels = slider(root, "levels", () => draw(), (v) => (v === 1 ? "1 (no pyramid)" : `${v}`));
    $$(root, "[data-spot]").forEach((b) =>
      b.addEventListener("click", () => {
        const [x, y] = b.dataset.spot.split(",").map(Number);
        pt = { x, y }; draw();
      })
    );

    pair().then((d) => {
      data = d;
      view.width = d.W; view.height = d.H;
      P0 = pyramid(d.g0, d.W, d.H, 4); P1 = pyramid(d.g1, d.W, d.H, 4);
      G0 = P0.map((p) => gradients(p.img, p.W, p.H));
      onDrag(view, (p) => { pt = { x: Math.round(p.x), y: Math.round(p.y) }; draw(); });
      Half.init(); Levels.init();
    });

    const toPlot = (u, v) => [PW / 2 + (u / RANGE) * (PW / 2), PW / 2 + (v / RANGE) * (PW / 2)];

    function draw() {
      if (!data) return;
      const { W, H } = data, h = Half.value(), lv = Levels.value();
      const fg = ink(root);
      vctx.drawImage(data.f0, 0, 0, W, H);
      vctx.strokeStyle = GOLD; vctx.lineWidth = 2;
      vctx.strokeRect(pt.x - h - 0.5, pt.y - h - 0.5, 2 * h + 1, 2 * h + 1);

      // single-level constraints from every pixel in the window
      const { gx, gy } = G0[0];
      let sxx = 0, sxy = 0, syy = 0, sxt = 0, syt = 0;
      const lines = [];
      for (let dy = -h; dy <= h; dy++)
        for (let dx = -h; dx <= h; dx++) {
          const x = pt.x + dx, y = pt.y + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
          const i = y * W + x, ix = gx[i], iy = gy[i], it = data.g1[i] - data.g0[i];
          sxx += ix * ix; sxy += ix * iy; syy += iy * iy; sxt += ix * it; syt += iy * it;
          lines.push([ix, iy, it]);
        }
      const det = sxx * syy - sxy * sxy;
      const one = det > 1e-6 ? { u: (-syy * sxt + sxy * syt) / det, v: (sxy * sxt - sxx * syt) / det } : null;
      const multi = lkPoint(P0, P1, G0, pt.x, pt.y, h, lv);
      const gi = pt.y * W + pt.x, gt = { u: data.gu[gi], v: data.gv[gi] };

      // plot
      pctx.clearRect(0, 0, PW, PW);
      pctx.strokeStyle = fg; pctx.globalAlpha = 0.25; pctx.lineWidth = 1;
      for (let k = -RANGE; k <= RANGE; k += 4) {
        const [a] = toPlot(k, 0), [, b] = toPlot(0, k);
        pctx.beginPath(); pctx.moveTo(a, 0); pctx.lineTo(a, PW); pctx.stroke();
        pctx.beginPath(); pctx.moveTo(0, b); pctx.lineTo(PW, b); pctx.stroke();
      }
      pctx.globalAlpha = 0.6;
      pctx.beginPath(); pctx.moveTo(PW / 2, 0); pctx.lineTo(PW / 2, PW); pctx.moveTo(0, PW / 2); pctx.lineTo(PW, PW / 2); pctx.stroke();
      pctx.globalAlpha = 1;
      // constraint lines Ix u + Iy v + It = 0
      const step = Math.max(1, Math.floor(lines.length / 160));
      pctx.strokeStyle = BLUE; pctx.globalAlpha = Math.max(0.12, Math.min(0.6, 12 / (lines.length / step)));
      for (let k = 0; k < lines.length; k += step) {
        const [a, b, c] = lines[k];
        if (Math.hypot(a, b) < 0.5) continue;
        let p, q;
        if (Math.abs(b) > Math.abs(a)) { p = [-RANGE, (-c + a * RANGE) / b]; q = [RANGE, (-c - a * RANGE) / b]; }
        else { p = [(-c + b * RANGE) / a, -RANGE]; q = [(-c - b * RANGE) / a, RANGE]; }
        const P = toPlot(...p), Q = toPlot(...q);
        pctx.beginPath(); pctx.moveTo(...P); pctx.lineTo(...Q); pctx.stroke();
      }
      pctx.globalAlpha = 1;
      // uncertainty ellipse from the structure tensor, centred on the single-level estimate
      const n = lines.length || 1;
      const e = eig2(sxx, sxy, syy);
      const sigma = 2.5; // assumed noise in It, grey levels
      const center = one || { u: 0, v: 0 };
      const r1 = Math.min(3 * RANGE, (2 * sigma) / Math.sqrt(Math.max(e.l1, 1e-6)));
      const r2 = Math.min(3 * RANGE, (2 * sigma) / Math.sqrt(Math.max(e.l2, 1e-6)));
      const [cx, cy] = toPlot(center.u, center.v), k = PW / 2 / RANGE;
      pctx.save();
      pctx.beginPath(); pctx.rect(0, 0, PW, PW); pctx.clip();
      pctx.beginPath(); pctx.ellipse(cx, cy, r1 * k, r2 * k, e.ang, 0, Math.PI * 2);
      pctx.fillStyle = "rgba(207,185,125,0.18)"; pctx.fill(); pctx.strokeStyle = GOLD; pctx.lineWidth = 1.5; pctx.stroke();
      pctx.restore();
      const dot = (u, v, color, r = 6) => {
        const [x, y] = toPlot(clamp(u, -RANGE, RANGE), clamp(v, -RANGE, RANGE));
        pctx.fillStyle = color; pctx.strokeStyle = "#111"; pctx.lineWidth = 1.5;
        pctx.beginPath(); pctx.arc(x, y, r, 0, Math.PI * 2); pctx.fill(); pctx.stroke();
      };
      dot(gt.u, gt.v, GREEN, 7);
      if (one) dot(one.u, one.v, GOLD, 5);
      dot(multi.u, multi.v, RED, 5);
      pctx.fillStyle = fg; pctx.font = "600 12px 'Nunito Sans', sans-serif";
      pctx.fillText("u (px)", PW - 44, PW / 2 - 6); pctx.fillText("v (px)", PW / 2 + 6, 14);

      // flow arrows on the image
      arrow(vctx, pt.x, pt.y, pt.x + gt.u * 3, pt.y + gt.v * 3, GREEN, 2.5, 7);
      arrow(vctx, pt.x, pt.y, pt.x + multi.u * 3, pt.y + multi.v * 3, RED, 2, 6);

      const l1 = e.l1 / n, l2 = e.l2 / n;
      const kind = l1 < 1.5 ? "a <b>flat</b> region: both eigenvalues are small, and the constraint lines point every which way with no clear crossing" :
        l2 < 0.1 * l1 ? "an <b>edge</b>: one large and one small eigenvalue, the lines are nearly parallel, and the uncertainty ellipse stretches along them. This is the aperture problem" :
        "a <b>corner or texture</b>: both eigenvalues are large, the lines cross in one place, and the motion is well determined";
      const epe = (f) => Math.hypot(f.u - gt.u, f.v - gt.v).toFixed(2);
      readout.innerHTML = `Eigenvalues per pixel λ₁ = ${l1.toFixed(1)}, λ₂ = ${l2.toFixed(1)}. This window is ${kind}. ` +
        `True flow (${gt.u.toFixed(1)}, ${gt.v.toFixed(1)}). ` +
        (one ? `One level, no warping: error <b>${epe(one)}</b> px (gold). ` : "") +
        `${lv} level${lv > 1 ? "s" : ""} with iterations: error <b>${epe(multi)}</b> px (red).`;
    }
  }

  /* ---------- 4. Dense flow: Lucas-Kanade versus Horn-Schunck ---------- */
  function dense() {
    const root = document.getElementById("of-dense");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let data = null, half = null, result = null, timer = null;
    const method = choice(root, "method", () => { sync(); schedule(); });
    const show = choice(root, "show", () => paint());
    const Levels = slider(root, "levels", () => schedule());
    const Alpha = slider(root, "alpha", () => schedule());
    const Iters = slider(root, "iters", () => schedule());
    const Win = slider(root, "win", () => schedule(), (v) => `${2 * v + 1} × ${2 * v + 1}`);

    function sync() {
      const hs = method() === "hs";
      Alpha.input.closest("label").hidden = !hs;
      Iters.input.closest("label").hidden = !hs;
      Win.input.closest("label").hidden = hs;
    }

    pair().then((d) => {
      data = d;
      // work at half resolution so the figure stays interactive
      const w = d.W >> 1, h = d.H >> 1;
      const g0 = down(d.g0, d.W, d.H).img, g1 = down(d.g1, d.W, d.H).img;
      const gu = new Float32Array(w * h), gv = new Float32Array(w * h), vis = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const j = 2 * y * d.W + 2 * x;
          gu[y * w + x] = d.gu[j] / 2; gv[y * w + x] = d.gv[j] / 2; vis[y * w + x] = d.vis[j];
        }
      half = { w, h, g0, g1, gu, gv, vis };
      canvas.width = w; canvas.height = h;
      sync(); Levels.init(); Alpha.init(); Iters.init(); Win.init();
    });

    function schedule() {
      if (!half) return;
      clearTimeout(timer);
      readout.textContent = "Computing…";
      timer = setTimeout(run, 30);
    }

    function run() {
      const { w, h, g0, g1, gu, gv, vis } = half;
      const t0 = performance.now();
      result = denseFlow(g0, g1, w, h, {
        method: method(), levels: Levels.value(), alpha: Alpha.value(), iters: Iters.value(), half: Win.value(), minEig: 1
      });
      const ms = performance.now() - t0;
      let sum = 0, n = 0, bad = 0, holes = 0;
      for (let i = 0; i < w * h; i++) {
        if (!vis[i]) continue;
        if (!result.valid[i] && method() === "lk") { holes++; continue; }
        const e = 2 * Math.hypot(result.u[i] - gu[i], result.v[i] - gv[i]); // in full-resolution pixels
        sum += e; n++; if (e > 3) bad++;
      }
      result.stats = { epe: sum / Math.max(1, n), bad: (100 * bad) / Math.max(1, n), holes: (100 * holes) / (w * h), ms };
      paint();
    }

    function paint() {
      if (!result) return;
      const { w, h, gu, gv, vis } = half, mode = show();
      const id = ctx.createImageData(w, h), c = [0, 0, 0];
      const maxMag = 6;
      for (let i = 0; i < w * h; i++) {
        let r = 0, g = 0, b = 0;
        if (mode === "flow" || mode === "truth") {
          const u = mode === "flow" ? result.u[i] : gu[i], v = mode === "flow" ? result.v[i] : gv[i];
          const hole = (mode === "flow" && method() === "lk" && !result.valid[i]) || (mode === "truth" && !vis[i]);
          if (!hole) { flowColor(u, v, maxMag, c); [r, g, b] = c; }
        } else if (mode === "error") {
          const e = vis[i] && (method() !== "lk" || result.valid[i]) ? 2 * Math.hypot(result.u[i] - gu[i], result.v[i] - gv[i]) : -1;
          if (e >= 0) {
            const t = clamp(e / 5, 0, 1);
            r = 255 * clamp(t * 2, 0, 1); g = 255 * clamp(t * 2 - 1, 0, 1); b = 255 * clamp(t * 3 - 2, 0, 1);
            r = Math.max(r, 30); g = Math.max(g, 30); b = Math.max(b, 40);
          }
        }
        id.data[4 * i] = r; id.data[4 * i + 1] = g; id.data[4 * i + 2] = b; id.data[4 * i + 3] = 255;
      }
      if (mode === "arrows") {
        ctx.drawImage(data.f0, 0, 0, w, h);
        for (let y = 6; y < h; y += 12)
          for (let x = 6; x < w; x += 12) {
            const i = y * w + x;
            if (method() === "lk" && !result.valid[i]) continue;
            arrow(ctx, x, y, x + result.u[i] * 1.5, y + result.v[i] * 1.5, GOLD, 1.2, 3.5);
          }
      } else ctx.putImageData(id, 0, 0);
      const s = result.stats;
      const name = method() === "lk" ? "Lucas-Kanade" : "Horn-Schunck";
      readout.innerHTML = `${name}: average end-point error <b>${s.epe.toFixed(2)} px</b>, ${s.bad.toFixed(1)}% of pixels off by more than 3 px` +
        (method() === "lk" ? `, ${s.holes.toFixed(0)}% left empty (too little texture to solve)` : "") +
        `. Computed in ${s.ms.toFixed(0)} ms at 320 × 180. ` +
        (mode === "error" ? "Bright pixels have large errors (5 px or more is white)." : mode === "truth" ? "This is the exact flow from the renderer; black pixels are hidden in the second frame." : "");
    }
  }

  /* ---------- 5. The colour wheel ---------- */
  function wheel() {
    const root = document.getElementById("of-wheel");
    if (!root) return;
    const [wc, fc] = $$(root, "canvas");
    const wctx = wc.getContext("2d"), fctx = fc.getContext("2d");
    const readout = $(root, ".sim__readout");
    const S = 240, R = 110;
    wc.width = S; wc.height = S; fc.width = S; fc.height = S;
    let probe = { u: 0.6, v: -0.4 };
    const field = choice(root, "field", () => draw());

    const fields = {
      right: (x, y) => [1, 0],
      zoom: (x, y) => [x, y],
      rotate: (x, y) => [-y, x],
      object: (x, y) => (Math.hypot(x - 0.25, y + 0.1) < 0.35 ? [-0.9, 0.3] : [0.15 * x, 0.15 * y])
    };

    function draw() {
      const c = [0, 0, 0];
      const wi = wctx.createImageData(S, S), fi = fctx.createImageData(S, S);
      const f = fields[field()];
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const i = 4 * (y * S + x);
          const u = (x - S / 2) / R, v = (y - S / 2) / R;
          if (Math.hypot(u, v) <= 1.04) { flowColor(u, v, 1, c); wi.data[i] = c[0]; wi.data[i + 1] = c[1]; wi.data[i + 2] = c[2]; wi.data[i + 3] = 255; }
          const [fu, fv] = f((x - S / 2) / (S / 2), (y - S / 2) / (S / 2));
          flowColor(fu, fv, 1.2, c);
          fi.data[i] = c[0]; fi.data[i + 1] = c[1]; fi.data[i + 2] = c[2]; fi.data[i + 3] = 255;
        }
      wctx.putImageData(wi, 0, 0); fctx.putImageData(fi, 0, 0);
      arrow(wctx, S / 2, S / 2, S / 2 + probe.u * R, S / 2 + probe.v * R, "#111", 2.5, 9);
      for (let y = 15; y < S; y += 30)
        for (let x = 15; x < S; x += 30) {
          const [fu, fv] = f((x - S / 2) / (S / 2), (y - S / 2) / (S / 2));
          arrow(fctx, x, y, x + fu * 12, y + fv * 12, "rgba(17,17,17,0.85)", 1.4, 4);
        }
      const ang = Math.round((Math.atan2(-probe.v, probe.u) * 180) / Math.PI);
      const mag = Math.min(1, Math.hypot(probe.u, probe.v));
      readout.innerHTML = `The arrow points ${ang}° (counterclockwise from the right) with ${Math.round(mag * 100)}% of the largest motion. ` +
        "<b>Hue</b> encodes direction and <b>saturation</b> encodes speed: still pixels are white, fast ones are vivid. Drag on the wheel.";
    }

    onDrag(wc, (p) => {
      let u = (p.x - S / 2) / R, v = (p.y - S / 2) / R;
      const m = Math.hypot(u, v);
      if (m > 1) { u /= m; v /= m; }
      probe = { u, v }; draw();
    });
    draw();
  }

  /* ---------- 6. Motion field of a moving camera ---------- */
  function egomotion() {
    const root = document.getElementById("of-ego");
    if (!root) return;
    const canvas = $(root, "canvas"), ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const W = 640, H = 360, f = 420, cx = W / 2, cy = H / 2;
    canvas.width = W; canvas.height = H;
    const camH = 1.2, wallZ = 12;
    let hover = null;
    const names = ["tx", "ty", "tz", "wx", "wy", "wz"];
    const S = {};
    names.forEach((n) => (S[n] = slider(root, n, () => draw(), (v) => (n[0] === "t" ? `${v.toFixed(2)} m` : `${v.toFixed(1)}°`))));
    const part = choice(root, "part", () => draw());
    $$(root, "[data-preset]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = JSON.parse(b.dataset.preset);
        names.forEach((n) => { S[n].input.value = p[n] || 0; S[n].init(); });
        draw();
      })
    );
    canvas.addEventListener("pointermove", (e) => { hover = canvasPoint(canvas, e); draw(); });
    canvas.addEventListener("pointerleave", () => { hover = null; draw(); });

    // depth of the scene at image point (x, y): a ground plane in front of a wall
    function depth(x, y) {
      const dy = y - cy;
      if (dy > 0) return Math.min(wallZ, (f * camH) / dy);
      return wallZ;
    }

    function flowAt(x, y) {
      const Z = depth(x, y);
      const X = ((x - cx) * Z) / f, Y = ((y - cy) * Z) / f;
      const T = [S.tx.value(), S.ty.value(), S.tz.value()];
      const w = [S.wx.value(), S.wy.value(), S.wz.value()].map((d) => (d * Math.PI) / 180);
      // velocity of a static point relative to the camera: -T - w x P
      const tr = [-T[0], -T[1], -T[2]];
      const rot = [-(w[1] * Z - w[2] * Y), -(w[2] * X - w[0] * Z), -(w[0] * Y - w[1] * X)];
      const proj = (V) => [(f * (V[0] * Z - X * V[2])) / (Z * Z), (f * (V[1] * Z - Y * V[2])) / (Z * Z)];
      const a = proj(tr), b = proj(rot);
      return { Z, trans: a, rot: b, total: [a[0] + b[0], a[1] + b[1]] };
    }

    function draw() {
      const fg = ink(root);
      ctx.clearRect(0, 0, W, H);
      // sky-wall and floor
      ctx.fillStyle = "rgba(207,185,125,0.07)"; ctx.fillRect(0, 0, W, cy + (f * camH) / wallZ);
      ctx.fillStyle = "rgba(90,169,255,0.07)"; ctx.fillRect(0, cy + (f * camH) / wallZ, W, H);
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.3; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(0, cy + (f * camH) / wallZ); ctx.lineTo(W, cy + (f * camH) / wallZ); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const which = part();
      const scale = 3; // arrows are drawn 3 times longer than the flow per frame
      for (let y = 14; y < H; y += 26)
        for (let x = 14; x < W; x += 26) {
          const F = flowAt(x, y);
          const v = which === "trans" ? F.trans : which === "rot" ? F.rot : F.total;
          const c = which === "trans" ? GOLD : which === "rot" ? BLUE : y > cy + (f * camH) / wallZ ? "#9fd3ff" : GOLD;
          arrow(ctx, x, y, x + v[0] * scale, y + v[1] * scale, c, 1.3, 4);
          if (Math.hypot(v[0], v[1]) < 0.5) { ctx.fillStyle = c; ctx.fillRect(x - 1, y - 1, 2, 2); }
        }
      // focus of expansion of the translational part
      const tz = S.tz.value();
      let foeText = "";
      if (Math.abs(tz) > 1e-3) {
        const fx = cx + (f * S.tx.value()) / tz, fy = cy + (f * S.ty.value()) / tz;
        const inside = fx > 0 && fx < W && fy > 0 && fy < H;
        if (inside) {
          ctx.strokeStyle = RED; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(fx, fy, 9, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(fx - 14, fy); ctx.lineTo(fx + 14, fy); ctx.moveTo(fx, fy - 14); ctx.lineTo(fx, fy + 14); ctx.stroke();
          ctx.fillStyle = RED; ctx.font = "700 12px 'Nunito Sans', sans-serif";
          ctx.fillText(tz > 0 ? "FOE" : "FOC", fx + 12, fy - 10);
        }
        foeText = `The ${tz > 0 ? "focus of expansion" : "focus of contraction"} is at (${Math.round(fx - cx)}, ${Math.round(fy - cy)}) px from the image center` + (inside ? "" : ", outside the image") + ". ";
      } else foeText = "With no forward motion the focus of expansion is at infinity: translational flow is parallel everywhere. ";
      const rotOn = ["wx", "wy", "wz"].some((n) => Math.abs(S[n].value()) > 1e-3);
      if (rotOn && which === "total") foeText += "Rotation is on, so the total flow no longer radiates from the marked point. ";
      let hov = "";
      if (hover) {
        const F = flowAt(hover.x, hover.y);
        const ttc = tz > 1e-3 ? `, time to contact <b>${(F.Z / tz).toFixed(1)}</b> frames` : "";
        hov = `At the pointer: depth ${F.Z.toFixed(2)} m, flow (${F.total[0].toFixed(1)}, ${F.total[1].toFixed(1)}) px per frame${ttc}.`;
        ctx.strokeStyle = fg; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(hover.x, hover.y, 5, 0, Math.PI * 2); ctx.stroke();
      }
      readout.innerHTML = foeText + hov;
    }
    names.forEach((n) => S[n].init());
  }

  /* ---------- 7. Looming and time to contact ---------- */
  function looming() {
    const root = document.getElementById("of-ttc");
    if (!root) return;
    const [scene, chart] = $$(root, "canvas");
    const sctx = scene.getContext("2d"), cctx = chart.getContext("2d");
    const readout = $(root, ".sim__readout");
    scene.width = 300; scene.height = 300; chart.width = 420; chart.height = 300;
    const Speed = slider(root, "speed", () => reset(), (v) => `${v} m/s`);
    const Fold = slider(root, "fold", () => reset(), (v) => `${v.toFixed(2)} s`);
    const Z0 = 30, size = 0.6, f = 300, dt = 1 / 30;
    let t = 0, hist = [], folded = null, running = false;
    $(root, "[data-action=dive]").addEventListener("click", () => { reset(); running = true; });

    function reset() { t = 0; hist = []; folded = null; running = false; draw(); }

    function draw() {
      const fg = ink(root), v = Speed.value();
      const Z = Math.max(0.05, Z0 - v * t);
      const theta = (2 * Math.atan(size / 2 / Z)); // angular size
      // estimate tau from the last two samples of theta only
      let tau = null;
      if (hist.length) {
        const prev = hist[hist.length - 1];
        const rate = (theta - prev.theta) / dt;
        if (rate > 1e-6) tau = theta / rate;
      }
      if (running) hist.push({ t, theta, tau, truth: Z / v });
      if (running && folded === null && tau !== null && tau < Fold.value()) folded = { t, Z };
      // scene: a fish seen from above, growing as the bird dives
      sctx.fillStyle = "#123448"; sctx.fillRect(0, 0, 300, 300);
      for (let k = 0; k < 40; k++) {
        const r = ((k * 37) % 150) / Z * 6;
        sctx.strokeStyle = "rgba(255,255,255,0.05)";
        sctx.beginPath(); sctx.arc(150 + ((k * 53) % 200) - 100, 150 + ((k * 71) % 200) - 100, r, 0, Math.PI * 2); sctx.stroke();
      }
      const px = Math.min(400, Math.tan(theta / 2) * f);
      sctx.fillStyle = "#e9d9a6";
      sctx.beginPath(); sctx.ellipse(150, 150, px, px * 0.4, 0, 0, Math.PI * 2); sctx.fill();
      sctx.beginPath(); sctx.moveTo(150 + px * 0.9, 150); sctx.lineTo(150 + px * 1.35, 150 - px * 0.35); sctx.lineTo(150 + px * 1.35, 150 + px * 0.35); sctx.fill();
      if (folded) { sctx.fillStyle = RED; sctx.font = "700 14px 'Nunito Sans', sans-serif"; sctx.fillText("Wings folded", 12, 22); }

      // chart: tau estimate and the true time to contact
      const Tend = Z0 / v;
      cctx.clearRect(0, 0, 420, 300);
      const X = (s) => 40 + (s / Tend) * 360, Y = (s) => 270 - (s / Math.min(Tend, 6)) * 250;
      cctx.strokeStyle = fg; cctx.globalAlpha = 0.5; cctx.lineWidth = 1;
      cctx.beginPath(); cctx.moveTo(40, 10); cctx.lineTo(40, 270); cctx.lineTo(400, 270); cctx.stroke();
      cctx.globalAlpha = 1; cctx.fillStyle = fg; cctx.font = "600 12px 'Nunito Sans', sans-serif";
      cctx.fillText("time (s)", 350, 290); cctx.fillText("seconds to contact", 46, 16);
      // threshold
      cctx.strokeStyle = RED; cctx.setLineDash([4, 4]);
      cctx.beginPath(); cctx.moveTo(40, Y(Fold.value())); cctx.lineTo(400, Y(Fold.value())); cctx.stroke(); cctx.setLineDash([]);
      const line = (key, color, w) => {
        cctx.strokeStyle = color; cctx.lineWidth = w; cctx.beginPath();
        let started = false;
        hist.forEach((h) => {
          if (h[key] === null || h[key] > Math.min(Tend, 6) * 1.1) { started = false; return; }
          const x = X(h.t), y = Y(h[key]);
          if (!started) { cctx.moveTo(x, y); started = true; } else cctx.lineTo(x, y);
        });
        cctx.stroke();
      };
      line("truth", GREEN, 4);
      line("tau", GOLD, 2);
      const last = hist[hist.length - 1];
      readout.innerHTML = last
        ? `Distance ${Z.toFixed(1)} m, angular size ${((theta * 180) / Math.PI).toFixed(1)}°. τ = θ / (dθ/dt) = <b>${last.tau ? last.tau.toFixed(2) : "…"}</b> s; true time to contact ${last.truth.toFixed(2)} s. ` +
          (folded ? `Wings folded ${(Z0 / v - folded.t).toFixed(2)} s before impact, ${folded.Z.toFixed(1)} m above the water, without ever knowing the distance or the speed.` : "")
        : "Press Dive. The bird sees only the image of the fish growing; τ is computed from its angular size and how fast it grows.";
    }

    whileVisible(root, () => {
      if (!running) return;
      t += dt;
      if (Z0 - Speed.value() * t <= 1) running = false; // stop just before impact
      draw();
    }, 33);
    Speed.init(); Fold.init();
  }

  /* ---------- 8. Matching over a fixed window: one slice of a cost volume ---------- */
  function costVolume() {
    const root = document.getElementById("of-cost");
    if (!root) return;
    const [view, heat] = $$(root, "canvas");
    const vctx = view.getContext("2d"), hctx = heat.getContext("2d");
    const readout = $(root, ".sim__readout");
    let data = null, P0, P1, pt = { x: 150, y: 290 };
    heat.width = 260; heat.height = 260;
    const Rad = slider(root, "radius", () => draw(), (v) => `±${v} px`);
    const Level = choice(root, "level", () => draw());
    $$(root, "[data-spot]").forEach((b) =>
      b.addEventListener("click", () => { const [x, y] = b.dataset.spot.split(",").map(Number); pt = { x, y }; draw(); })
    );

    pair().then((d) => {
      data = d; view.width = d.W; view.height = d.H;
      P0 = pyramid(d.g0, d.W, d.H, 3); P1 = pyramid(d.g1, d.W, d.H, 3);
      onDrag(view, (p) => { pt = { x: Math.round(p.x), y: Math.round(p.y) }; draw(); });
      Rad.init();
    });

    function draw() {
      if (!data) return;
      const r = Rad.value(), l = Number(Level()), s = 1 << l;
      const { img: A, W, H } = P0[l], B = P1[l].img;
      const x0 = Math.round(pt.x / s), y0 = Math.round(pt.y / s), p = 3;
      // normalised cross-correlation of a 7 x 7 patch at every offset in the window
      const patch = (I, x, y) => {
        const out = []; let m = 0;
        for (let dy = -p; dy <= p; dy++) for (let dx = -p; dx <= p; dx++) { const q = sample(I, W, H, x + dx, y + dy); out.push(q); m += q; }
        m /= out.length; let n = 0;
        for (let i = 0; i < out.length; i++) { out[i] -= m; n += out[i] * out[i]; }
        n = Math.sqrt(n) || 1;
        return out.map((q) => q / n);
      };
      const a = patch(A, x0, y0), N = 2 * r + 1, C = new Float32Array(N * N);
      let best = -2, bi = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const b = patch(B, x0 + dx, y0 + dy);
          let c = 0; for (let i = 0; i < a.length; i++) c += a[i] * b[i];
          const k = (dy + r) * N + dx + r; C[k] = c;
          if (c > best) { best = c; bi = k; }
        }
      const bu = ((bi % N) - r) * s, bv = (Math.floor(bi / N) - r) * s;
      const gi = pt.y * data.W + pt.x, gu = data.gu[gi], gv = data.gv[gi];
      // image with the search window
      vctx.drawImage(data.f0, 0, 0);
      vctx.strokeStyle = GOLD; vctx.lineWidth = 2;
      vctx.strokeRect(pt.x - r * s, pt.y - r * s, N * s - 1, N * s - 1);
      arrow(vctx, pt.x, pt.y, pt.x + gu, pt.y + gv, GREEN, 2.5, 7);
      arrow(vctx, pt.x, pt.y, pt.x + bu, pt.y + bv, RED, 2, 6);
      // heat map
      const cell = 260 / N;
      hctx.clearRect(0, 0, 260, 260);
      for (let k = 0; k < N * N; k++) {
        const t = clamp((C[k] + 0.2) / 1.2, 0, 1);
        hctx.fillStyle = `rgb(${Math.round(20 + 235 * t)}, ${Math.round(18 + 200 * t * t)}, ${Math.round(30 + 120 * t * t * t)})`;
        hctx.fillRect((k % N) * cell, Math.floor(k / N) * cell, Math.ceil(cell), Math.ceil(cell));
      }
      const mark = (u, v, color) => {
        const cxp = (u / s + r + 0.5) * cell, cyp = (v / s + r + 0.5) * cell;
        if (cxp < 0 || cyp < 0 || cxp > 260 || cyp > 260) return false;
        hctx.strokeStyle = color; hctx.lineWidth = 2.5;
        hctx.beginPath(); hctx.arc(cxp, cyp, Math.max(5, cell * 0.45), 0, Math.PI * 2); hctx.stroke();
        return true;
      };
      const inWin = mark(gu, gv, GREEN);
      mark(bu, bv, RED);
      const err = Math.hypot(bu - gu, bv - gv);
      readout.innerHTML = `Window ${N} × ${N} offsets at ${l === 0 ? "full resolution" : `1/${s} resolution`}, covering ±${r * s} px. ` +
        `Best match (red) is ${err.toFixed(1)} px from the true flow (green), with correlation ${best.toFixed(2)}. ` +
        (inWin ? "" : "<b>The true motion lies outside the window</b>, so no amount of matching inside it can find it. ") +
        `The window costs ${N * N} correlations per pixel.`;
    }
  }

  /* ---------- 9. Live dense flow on the webcam (OpenCV.js Farneback) ---------- */
  function webcam() {
    const root = document.getElementById("of-webcam");
    if (!root) return;
    const video = $(root, "video"), canvas = $(root, "canvas"), button = $(root, "button");
    const status = $(root, ".sim__readout");
    const view = choice(root, "view", () => {});
    let stream = null, running = false;
    const w = 160, h = 120;

    async function start() {
      button.disabled = true;
      status.textContent = "Loading OpenCV.js (about 10 MB, first time only)…";
      let cv;
      try { cv = await window.loadOpenCV(); } catch (e) { status.textContent = e.message; button.disabled = false; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      } catch (e) { status.textContent = "Camera not available: " + e.message; button.disabled = false; return; }
      video.srcObject = stream;
      await video.play();
      const grab = document.createElement("canvas"); grab.width = w; grab.height = h;
      const gctx = grab.getContext("2d", { willReadFrequently: true });
      canvas.width = w * 2; canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      const frame = new cv.Mat(h, w, cv.CV_8UC4), gray = new cv.Mat(), prev = new cv.Mat(), flow = new cv.Mat();
      let hasPrev = false;
      running = true; button.textContent = "Stop camera"; button.disabled = false;
      const off = document.createElement("canvas"); off.width = w; off.height = h;
      const octx = off.getContext("2d");
      const loop = () => {
        if (!running) { frame.delete(); gray.delete(); prev.delete(); flow.delete(); return; }
        gctx.save(); gctx.scale(-1, 1); gctx.drawImage(video, -w, 0, w, h); gctx.restore(); // mirror like a selfie view
        frame.data.set(gctx.getImageData(0, 0, w, h).data);
        cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
        if (hasPrev) {
          cv.calcOpticalFlowFarneback(prev, gray, flow, 0.5, 3, 13, 3, 5, 1.1, 0);
          const F = flow.data32F, id = octx.createImageData(w, h), c = [0, 0, 0];
          let su = 0, sv = 0, div = 0;
          for (let i = 0; i < w * h; i++) {
            const u = F[2 * i], v = F[2 * i + 1];
            flowColor(u, v, 4, c);
            id.data[4 * i] = c[0]; id.data[4 * i + 1] = c[1]; id.data[4 * i + 2] = c[2]; id.data[4 * i + 3] = 255;
            su += u; sv += v;
            const x = i % w, y = (i / w) | 0;
            div += (x - w / 2) * u + (y - h / 2) * v;
          }
          ctx.imageSmoothingEnabled = true;
          if (view() === "color") { octx.putImageData(id, 0, 0); ctx.drawImage(off, 0, 0, w * 2, h * 2); }
          else {
            ctx.drawImage(grab, 0, 0, w * 2, h * 2);
            for (let y = 6; y < h; y += 10)
              for (let x = 6; x < w; x += 10) {
                const i = y * w + x, u = F[2 * i], v = F[2 * i + 1];
                if (Math.hypot(u, v) > 0.4) arrow(ctx, 2 * x, 2 * y, 2 * (x + u * 2), 2 * (y + v * 2), GOLD, 1.4, 4);
              }
          }
          su /= w * h; sv /= w * h; div /= w * h * (w / 4);
          const looming = div > 0.08 ? "Something is <b>approaching</b>: the flow points outward." : div < -0.08 ? "Something is <b>receding</b>: the flow points inward." : "";
          status.innerHTML = `Average flow (${su.toFixed(2)}, ${sv.toFixed(2)}) px per frame, like an optical mouse sensor reports. ${looming}`;
        }
        gray.copyTo(prev); hasPrev = true;
        setTimeout(loop, 30);
      };
      loop();
    }
    function stop() {
      running = false;
      stream?.getTracks().forEach((t) => t.stop());
      button.textContent = "Start camera"; status.textContent = "Camera stopped.";
    }
    button.addEventListener("click", () => (running ? stop() : start()));
  }

  function init() {
    sphere(); aperture(); lucasKanade(); dense(); wheel(); egomotion(); looming(); costVolume(); webcam();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
