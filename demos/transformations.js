/*
 * Interactive figures for Chapter 4, Projections and Transformations.
 * Each demo looks for its own element id and does nothing if it is absent.
 * Everything runs in the reader's browser; nothing is uploaded.
 */
(() => {
  const MEDIA_IF = "media/image-formation/";
  const MEDIA = "media/transformations/";
  const $ = (root, sel) => root.querySelector(sel);
  const GOLD = "#cfb97d", GREEN = "#2f8f5b", RED = "#c2463a", BLUE = "#3b6fb6";

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
      set: (v) => { input.value = v; if (out) out.textContent = format(Number(input.value)); },
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

  // Coalesce many input events into one redraw without requestAnimationFrame.
  function scheduler(fn) {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; fn(); }, 0);
    };
  }

  // Pointer position in canvas pixel coordinates.
  function canvasPoint(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
  }

  // Draggable handles drawn on a canvas. Returns a function to redraw handles.
  function draggable(canvas, points, onMove, radius = 22) {
    let active = -1;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      const [x, y] = canvasPoint(canvas, e);
      const scale = canvas.width / canvas.getBoundingClientRect().width;
      let best = -1, bd = radius * scale;
      points.forEach((p, i) => {
        const d = Math.hypot(p[0] - x, p[1] - y);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) {
        active = best;
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (active < 0) return;
      const [x, y] = canvasPoint(canvas, e);
      points[active][0] = Math.min(canvas.width, Math.max(0, x));
      points[active][1] = Math.min(canvas.height, Math.max(0, y));
      onMove();
    });
    const end = () => { active = -1; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  /* ---------- Linear algebra helpers ---------- */

  // Solve A x = b (n x n) by Gaussian elimination with partial pivoting.
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  // Homography (3x3, row-major array of 9) mapping four src points to four dst points.
  function homography4(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    const h = solve(A, b);
    return h ? [...h, 1] : null;
  }

  function invert3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
            B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
            C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }

  function mul3(m, n) {
    const r = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += m[i * 3 + k] * n[k * 3 + j];
    return r;
  }

  function apply(m, x, y) {
    const w = m[6] * x + m[7] * y + m[8];
    return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w, w];
  }

  function matrixHTML(m, digits = 2, classes) {
    const cells = m.map((v, i) => {
      const cls = classes ? classes[i] : "";
      const s = Math.abs(v) < 5e-4 && digits < 4 ? "0" : v.toFixed(Math.abs(v) < 0.01 && v !== 0 ? 4 : digits);
      return `<span class="mat__cell ${cls}">${s}</span>`;
    });
    return `<div class="mat"><div class="mat__grid">${cells.join("")}</div></div>`;
  }

  // Warp src ImageData into dst ImageData using the inverse map Hinv (dst -> src).
  function inverseWarp(src, dst, Hinv, bilinear = true, clear = true) {
    const sw = src.width, sh = src.height, sd = src.data;
    const dw = dst.width, dh = dst.height, dd = dst.data;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const w = Hinv[6] * x + Hinv[7] * y + Hinv[8];
        const u = (Hinv[0] * x + Hinv[1] * y + Hinv[2]) / w;
        const v = (Hinv[3] * x + Hinv[4] * y + Hinv[5]) / w;
        const i = (y * dw + x) * 4;
        if (w <= 0 || u < 0 || v < 0 || u > sw - 1 || v > sh - 1) {
          if (clear) dd[i + 3] = 0;
          continue;
        }
        if (bilinear) {
          const x0 = Math.floor(u), y0 = Math.floor(v);
          const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
          const fx = u - x0, fy = v - y0;
          const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
          for (let c = 0; c < 3; c++) {
            dd[i + c] = (sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx) * (1 - fy) + (sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx) * fy;
          }
        } else {
          const j = (Math.round(v) * sw + Math.round(u)) * 4;
          dd[i] = sd[j]; dd[i + 1] = sd[j + 1]; dd[i + 2] = sd[j + 2];
        }
        dd[i + 3] = 255;
      }
    }
  }

  function drawHandles(ctx, pts, colors, labels) {
    // keep handles a constant size on screen, however the canvas is scaled
    const k = ctx.canvas.width / (ctx.canvas.getBoundingClientRect().width || ctx.canvas.width);
    ctx.save();
    ctx.lineWidth = 2 * k;
    ctx.strokeStyle = GOLD;
    ctx.setLineDash([6 * k, 5 * k]);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 9 * k, 0, Math.PI * 2);
      ctx.fillStyle = colors ? colors[i] : GOLD;
      ctx.fill();
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      if (labels) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labels[i], p[0], p[1]);
      }
    });
    ctx.restore();
  }

  /* ---------- 1. Orthographic versus perspective projection ---------- */
  function projection() {
    const root = document.getElementById("proj-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = 720), H = (canvas.height = 380);
    const readout = $(root, ".sim__readout");
    let mode = "persp";
    const draw = scheduler(render);
    const P = slider(root, "pitch", draw, (v) => v + "°");
    const F = slider(root, "f", draw, (v) => v + " px");
    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.mode;
      root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("is-on", x === b));
      render();
    }));

    function render() {
      const th = (P.value() * Math.PI) / 180, f = F.value(), h = 1.6;
      const cs = Math.cos(th), sn = Math.sin(th);
      const ink = getComputedStyle(root).color;
      const project = (X, Y, Z) => {
        const xc = X, yc = (Y - h) * cs + Z * sn, zc = -(Y - h) * sn + Z * cs;
        if (mode === "persp") {
          if (zc <= 0.05) return null;
          return [W / 2 + (f * xc) / zc, H / 2 - (f * yc) / zc];
        }
        const s = f / 14;
        return [W / 2 + s * xc, H / 2 - s * yc + 0];
      };
      const seg = (a, b, color, width) => {
        // clip by sampling, so lines behind the camera are skipped
        ctx.beginPath();
        let started = false;
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const p = project(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
          if (!p) { started = false; continue; }
          if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
        }
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      };
      ctx.clearRect(0, 0, W, H);
      // ground tiles
      for (let x = -6; x <= 6; x += 1) seg([x, 0, 1], [x, 0, 60], "rgba(127,127,127,0.5)", 1);
      for (let z = 2; z <= 60; z += 2) seg([-6, 0, z], [6, 0, z], "rgba(127,127,127,0.5)", 1);
      // rails and sleepers
      for (let z = 2; z <= 60; z += 1.2) seg([-0.9, 0, z], [0.9, 0, z], "#8a6a3c", 3);
      seg([-0.72, 0, 1], [-0.72, 0, 60], ink, 3);
      seg([0.72, 0, 1], [0.72, 0, 60], ink, 3);
      // poles of equal height
      for (let z = 10; z <= 60; z += 6) seg([2.4, 0, z], [2.4, 1.2, z], GREEN, 3);
      // vanishing point of lines parallel to Z
      if (mode === "persp" && cs > 0.01) {
        const vy = H / 2 - (f * sn) / cs;
        ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.moveTo(0, vy); ctx.lineTo(W, vy);
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(W / 2, vy, 7, 0, Math.PI * 2); ctx.fillStyle = GOLD; ctx.fill();
        ctx.fillStyle = GOLD; ctx.font = "bold 13px sans-serif"; ctx.fillText("vanishing point", W / 2 + 12, vy - 8);
        ctx.fillText("horizon", 10, vy - 6);
        readout.innerHTML = "Perspective: the rails meet at a <b>vanishing point</b> on the horizon, and equally tall poles shrink with distance.";
      } else if (mode === "ortho") {
        readout.innerHTML = "Orthographic: parallel rails stay parallel, and every pole has the same size. There is no vanishing point.";
      }
    }
    P.init(); F.init();
  }

  /* ---------- 2. Homogeneous coordinates ---------- */
  function homogeneous() {
    const root = document.getElementById("homog-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const ns = "http://www.w3.org/2000/svg";
    const W = 720, H = 340, ox = 360, oy = 300, S = 110; // origin and scale
    const draw = scheduler(render);
    const X = slider(root, "x", draw, (v) => v.toFixed(2));
    const Wt = slider(root, "w", draw, (v) => v.toFixed(2));
    const K = slider(root, "k", draw, (v) => v.toFixed(2));
    const el = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      if (text) e.textContent = text;
      svg.appendChild(e);
      return e;
    };
    const P = (x, w) => [ox + x * S, oy - w * S];

    function render() {
      svg.innerHTML = "";
      const x = X.value(), w = Wt.value(), k = K.value();
      el("line", { x1: 20, y1: oy, x2: W - 20, y2: oy, class: "hc__axis" });
      el("line", { x1: ox, y1: oy + 20, x2: ox, y2: 20, class: "hc__axis" });
      el("text", { x: W - 30, y: oy + 20, class: "hc__label" }, "x");
      el("text", { x: ox + 10, y: 30, class: "hc__label" }, "w");
      const [l1x, l1y] = P(-3.1, 1), [l2x] = P(3.1, 1);
      el("line", { x1: l1x, y1: l1y, x2: l2x, y2: l1y, class: "hc__plane" });
      el("text", { x: 26, y: l1y - 8, class: "hc__label hc__label--gold" }, "w = 1: the image line");
      // the ray through the origin
      const far = 6;
      const [rx, ry] = P(x * far, w * far);
      el("line", { x1: ox, y1: oy, x2: rx, y2: ry, class: "hc__ray" });
      const [px, py] = P(k * x, k * w);
      el("circle", { cx: px, cy: py, r: 8, class: "hc__point" });
      el("text", { x: px + 12, y: py - 10, class: "hc__label" }, `(${(k * x).toFixed(2)}, ${(k * w).toFixed(2)})`);
      if (w > 0.03) {
        const xi = x / w;
        const [ix, iy] = P(xi, 1);
        if (Math.abs(xi) < 3.2) {
          el("circle", { cx: ix, cy: iy, r: 7, class: "hc__image" });
          el("text", { x: ix + 10, y: iy + 22, class: "hc__label hc__label--gold" }, `x = ${xi.toFixed(2)}`);
        }
        readout.innerHTML = `Every point on the ray is the same point: <b>(${(k * x).toFixed(2)}, ${(k * w).toFixed(2)}) ~ (${xi.toFixed(2)}, 1)</b>. Divide by w to get back to ordinary coordinates.`;
      } else {
        readout.innerHTML = "With <b>w = 0</b> the ray is parallel to the image line and never meets it. The point lies <b>at infinity</b>: it is a pure direction, which is exactly what a vanishing point is.";
      }
    }
    X.init(); Wt.init(); K.init();
  }

  /* ---------- 3. Transformation playground ---------- */
  function playground() {
    const root = document.getElementById("transform-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = 640), H = (canvas.height = 400);
    const matrixBox = $(root, ".tp__matrix");
    const props = $(root, ".tp__props");
    const badge = $(root, ".tp__class");
    let showGrid = true;
    const draw = scheduler(render);
    const fmt1 = (v) => v.toFixed(2);
    const tx = slider(root, "tx", draw, (v) => v.toFixed(0));
    const ty = slider(root, "ty", draw, (v) => v.toFixed(0));
    const th = slider(root, "theta", draw, (v) => v + "°");
    const sc = slider(root, "s", draw, fmt1);
    const as = slider(root, "aspect", draw, fmt1);
    const sh = slider(root, "shear", draw, fmt1);
    const p1 = slider(root, "p1", draw, (v) => v.toFixed(4));
    const p2 = slider(root, "p2", draw, (v) => v.toFixed(4));
    const all = [tx, ty, th, sc, as, sh, p1, p2];

    const presets = {
      reset: [0, 0, 0, 1, 1, 0, 0, 0],
      euclidean: [60, -20, 30, 1, 1, 0, 0, 0],
      similarity: [40, 10, -20, 0.7, 1, 0, 0, 0],
      affine: [20, 0, 15, 1, 1.5, 0.5, 0, 0],
      projective: [0, 10, 0, 1, 1, 0, 0.0016, 0.0012]
    };
    root.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
      presets[b.dataset.preset].forEach((v, i) => all[i].set(v));
      render();
    }));
    $(root, "[data-action=grid]").addEventListener("click", (e) => {
      showGrid = !showGrid;
      e.currentTarget.classList.toggle("is-on", showGrid);
      render();
    });

    function matrix() {
      const t = (th.value() * Math.PI) / 180, s = sc.value(), a = as.value(), k = sh.value();
      const c = Math.cos(t), sn = Math.sin(t);
      // linear part: rotation * scale * aspect * shear
      const L = mul3([c, -sn, 0, sn, c, 0, 0, 0, 1], mul3([s * a, 0, 0, 0, s, 0, 0, 0, 1], [1, k, 0, 0, 1, 0, 0, 0, 1]));
      return [L[0], L[1], tx.value(), L[3], L[4], ty.value(), p1.value(), p2.value(), 1];
    }

    function classify() {
      if (Math.abs(p1.value()) > 1e-6 || Math.abs(p2.value()) > 1e-6) return "projective";
      if (Math.abs(sh.value()) > 1e-6 || Math.abs(as.value() - 1) > 1e-6) return "affine";
      if (Math.abs(sc.value() - 1) > 1e-6) return "similarity";
      if (tx.value() || ty.value() || th.value()) return "euclidean";
      return "identity";
    }

    function render() {
      const M = matrix();
      const ink = getComputedStyle(root).color;
      ctx.clearRect(0, 0, W, H);
      const map = (x, y) => {
        const [u, v] = apply(M, x, y);
        return [W / 2 + u, H / 2 + v];
      };
      const poly = (pts, color, width, fill) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => {
          const [u, v] = map(x, y);
          i ? ctx.lineTo(u, v) : ctx.moveTo(u, v);
        });
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      };
      const dense = (a, b, n = 20) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
      // faint original outline
      ctx.save(); ctx.globalAlpha = 0.18;
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5;
      ctx.strokeRect(W / 2 - 120, H / 2 - 120, 240, 240);
      ctx.restore();
      if (showGrid) {
        for (let g = -120; g <= 120; g += 30) {
          poly(dense([g, -120], [g, 120]), "rgba(127,127,127,0.45)", 1);
          poly(dense([-120, g], [120, g]), "rgba(127,127,127,0.45)", 1);
        }
      }
      poly(dense([-120, -120], [120, -120]).concat(dense([120, -120], [120, 120]), dense([120, 120], [-120, 120]), dense([-120, 120], [-120, -120])), ink, 2.5);
      // circle
      const circ = Array.from({ length: 73 }, (_, i) => [55 + 38 * Math.cos((i * Math.PI) / 36), -55 + 38 * Math.sin((i * Math.PI) / 36)]);
      poly(circ, BLUE, 2.5, "rgba(59,111,182,0.15)");
      // the letter F
      const F = [[-90, -90], [-30, -90], [-30, -70], [-70, -70], [-70, -40], [-40, -40], [-40, -20], [-70, -20], [-70, 30], [-90, 30], [-90, -90]];
      poly(F.flatMap((p, i) => (i ? dense(F[i - 1], p, 8) : [p])), GREEN, 2.5, "rgba(47,143,91,0.25)");
      // a pair of parallel arrows
      poly(dense([-90, 70], [90, 70]), RED, 3);
      poly(dense([-90, 95], [90, 95]), RED, 3);

      const kind = classify();
      const names = { identity: "Identity", euclidean: "Euclidean (rigid)", similarity: "Similarity", affine: "Affine", projective: "Projective (homography)" };
      const dof = { identity: 0, euclidean: 3, similarity: 4, affine: 6, projective: 8 };
      badge.innerHTML = `${names[kind]} <span>${dof[kind]} degrees of freedom</span>`;
      badge.dataset.kind = kind;
      const order = ["identity", "euclidean", "similarity", "affine", "projective"];
      const level = order.indexOf(kind);
      const rows = [
        ["Lengths", level <= 1],
        ["Angles", level <= 2],
        ["Parallel lines", level <= 3],
        ["Straight lines", true]
      ];
      props.innerHTML = rows.map(([n, ok]) => `<li class="${ok ? "ok" : "no"}">${ok ? "✓" : "✗"} ${n} preserved</li>`).join("");
      const classes = ["lin", "lin", "trn", "lin", "lin", "trn", "prj", "prj", "one"];
      matrixBox.innerHTML = matrixHTML(M, 2, classes);
    }
    all.forEach((s) => s.init());
  }

  /* ---------- 4. Drag the corners: a live homography ---------- */
  async function dragHomography() {
    const root = document.getElementById("homography-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const matrixBox = $(root, ".tp__matrix");
    let img;
    try { img = await loadImage(MEDIA_IF + "pinhole.jpg"); } catch { return; }
    const W = (canvas.width = 720), H = (canvas.height = 420);
    const sw = 480, shh = 270;
    const tmp = document.createElement("canvas");
    tmp.width = sw; tmp.height = shh;
    const t = tmp.getContext("2d");
    t.drawImage(img, 0, 0, sw, shh);
    const src = t.getImageData(0, 0, sw, shh);
    const start = () => [[120, 75], [600, 75], [600, 345], [120, 345]];
    let pts = start();
    const out = ctx.createImageData(W, H);
    const draw = scheduler(render);
    draggable(canvas, pts, draw);
    $(root, "[data-action=reset]").addEventListener("click", () => { pts.splice(0, 4, ...start()); render(); });
    $(root, "[data-action=tilt]").addEventListener("click", () => {
      pts.splice(0, 4, [230, 110], [490, 110], [680, 380], [40, 380]);
      render();
    });

    function render() {
      const Hm = homography4([[0, 0], [sw, 0], [sw, shh], [0, shh]], pts);
      if (!Hm) return;
      const Hinv = invert3(Hm);
      if (!Hinv) return;
      out.data.fill(0);
      inverseWarp(src, out, Hinv, true);
      ctx.clearRect(0, 0, W, H);
      ctx.putImageData(out, 0, 0);
      drawHandles(ctx, pts);
      const n = Hm.map((v) => v / Hm[8]);
      matrixBox.innerHTML = `<span class="tp__mlabel">H =</span>` + matrixHTML(n, 3, ["lin", "lin", "trn", "lin", "lin", "trn", "prj", "prj", "one"]);
    }
    render();
  }

  /* ---------- 5. Rectify a plane: bird's-eye view ---------- */
  async function rectify() {
    const root = document.getElementById("rectify-sim");
    if (!root) return;
    const [left, right] = root.querySelectorAll("canvas");
    const lctx = left.getContext("2d", { willReadFrequently: true });
    const rctx = right.getContext("2d");
    let img;
    try { img = await loadImage(MEDIA + "floor_oblique.jpg"); } catch { return; }
    const W = (left.width = 960), H = (left.height = 540);
    lctx.drawImage(img, 0, 0, W, H);
    const src = lctx.getImageData(0, 0, W, H);
    // Marker centres on the mat are 1220 x 820 texture pixels apart.
    const RW = 488, RH = 328, pad = 16;
    right.width = RW + 2 * pad; right.height = RH + 2 * pad;
    const start = () => [[389, 198], [712, 275], [588, 400], [219, 279]];
    let pts = start();
    const colors = [RED, BLUE, GOLD, GREEN];
    const out = rctx.createImageData(right.width, right.height);
    const draw = scheduler(render);
    draggable(left, pts, draw, 26);
    $(root, "[data-action=reset]").addEventListener("click", () => { pts.splice(0, 4, ...start()); render(); });
    $(root, "[data-action=scramble]").addEventListener("click", () => {
      pts.splice(0, 4, [330, 150], [760, 230], [640, 460], [160, 330]);
      render();
    });

    function render() {
      lctx.putImageData(src, 0, 0);
      drawHandles(lctx, pts, colors);
      const dst = [[pad, pad], [pad + RW, pad], [pad + RW, pad + RH], [pad, pad + RH]];
      // H maps the rectified view back into the photo, which is what inverse warping needs.
      const Hback = homography4(dst, pts);
      if (!Hback) return;
      out.data.fill(0);
      inverseWarp(src, out, Hback, true);
      rctx.putImageData(out, 0, 0);
    }
    render();
  }

  /* ---------- 6. Forward versus inverse warping ---------- */
  async function warping() {
    const root = document.getElementById("warp-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const N = 48, S = 8;
    canvas.width = N * S; canvas.height = N * S;
    let img;
    try { img = await loadImage(MEDIA + "floor_oblique.jpg"); } catch { return; }
    const tmp = document.createElement("canvas");
    tmp.width = N; tmp.height = N;
    const t = tmp.getContext("2d");
    // the "H" of the landing mat makes a crisp test pattern
    t.drawImage(img, 400, 225, 130, 130, 0, 0, N, N);
    const src = t.getImageData(0, 0, N, N);
    let mode = "forward";
    const draw = scheduler(render);
    const R = slider(root, "rot", draw, (v) => v + "°");
    const Z = slider(root, "zoom", draw, (v) => v.toFixed(2) + "×");
    const readout = $(root, ".sim__readout");
    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.mode;
      root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("is-on", x === b));
      render();
    }));

    function render() {
      const a = (R.value() * Math.PI) / 180, z = Z.value();
      const c = Math.cos(a) * z, s = Math.sin(a) * z, h = N / 2;
      // M maps source pixel to destination pixel about the centre
      const M = [c, -s, h - c * h + s * h, s, c, h - s * h - c * h, 0, 0, 1];
      const out = new ImageData(N, N);
      if (mode === "forward") {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const [u, v] = apply(M, x, y);
          const xi = Math.round(u), yi = Math.round(v);
          if (xi < 0 || yi < 0 || xi >= N || yi >= N) continue;
          const i = (yi * N + xi) * 4, j = (y * N + x) * 4;
          out.data[i] = src.data[j]; out.data[i + 1] = src.data[j + 1]; out.data[i + 2] = src.data[j + 2]; out.data[i + 3] = 255;
        }
      } else {
        inverseWarp(src, out, invert3(M), mode === "bilinear");
      }
      // checkerboard behind, so holes are visible
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        if (out.data[i + 3]) ctx.fillStyle = `rgb(${out.data[i]},${out.data[i + 1]},${out.data[i + 2]})`;
        else ctx.fillStyle = (x + y) % 2 ? "#e0479e" : "#b2186b";
        ctx.fillRect(x * S, y * S, S, S);
      }
      readout.innerHTML = {
        forward: "<b>Forward mapping</b> sends each source pixel to a rounded destination. Some destinations get no pixel at all: the pink holes.",
        nearest: "<b>Inverse mapping</b> asks, for every destination pixel, where it came from. No holes, but nearest-neighbor sampling leaves jagged edges.",
        bilinear: "<b>Inverse mapping with bilinear interpolation</b> blends the four nearest source pixels. No holes and smoother edges."
      }[mode];
    }
    R.init(); Z.init();
  }

  /* ---------- 7. RANSAC line fitting ---------- */
  function ransac() {
    const root = document.getElementById("ransac-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = 640), H = (canvas.height = 380);
    const readout = $(root, ".sim__readout");
    const O = slider(root, "out", () => { newData(); }, (v) => v + " %");
    const Nz = slider(root, "noise", () => { newData(); }, (v) => v.toFixed(0) + " px");
    const T = slider(root, "thresh", () => { rescore(); draw(); }, (v) => v + " px");
    let pts = [], trueLine, iter = 0, best = null, current = null, timer = null;
    const NPTS = 70;

    function newData() {
      stop();
      const a = (Math.random() - 0.5) * 0.9, b = H / 2 + (Math.random() - 0.5) * 80;
      trueLine = { a, b };
      pts = [];
      const nOut = Math.round((NPTS * O.value()) / 100);
      for (let i = 0; i < NPTS; i++) {
        const x = 30 + Math.random() * (W - 60);
        if (i < nOut) pts.push({ x, y: 20 + Math.random() * (H - 40), out: true });
        else {
          const g = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
          pts.push({ x, y: a * x + b + g * Nz.value(), out: false });
        }
      }
      iter = 0; best = null; current = null;
      draw();
    }

    // line through two points as ax + by + c = 0 with a^2 + b^2 = 1
    function lineThrough(p, q) {
      let a = q.y - p.y, b = p.x - q.x;
      const n = Math.hypot(a, b) || 1;
      a /= n; b /= n;
      return { a, b, c: -(a * p.x + b * p.y) };
    }
    const dist = (L, p) => Math.abs(L.a * p.x + L.b * p.y + L.c);
    const inliersOf = (L) => pts.filter((p) => dist(L, p) < T.value());

    function step() {
      let i = Math.floor(Math.random() * pts.length), j = Math.floor(Math.random() * pts.length);
      while (j === i) j = Math.floor(Math.random() * pts.length);
      const L = lineThrough(pts[i], pts[j]);
      const n = inliersOf(L).length;
      current = { L, pair: [pts[i], pts[j]], n };
      if (!best || n > best.n) best = { L, n };
      iter++;
      draw();
    }
    function rescore() { if (best) best.n = inliersOf(best.L).length; }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    function leastSquares(set) {
      const n = set.length;
      if (n < 2) return null;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      set.forEach((p) => { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
      const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      return { m, k: (sy - m * sx) / n };
    }

    function drawLine(L, color, width, dash) {
      ctx.save();
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      if (Math.abs(L.b) > 1e-6) {
        ctx.moveTo(0, -L.c / L.b); ctx.lineTo(W, -(L.a * W + L.c) / L.b);
      } else { ctx.moveTo(-L.c / L.a, 0); ctx.lineTo(-L.c / L.a, H); }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      ctx.restore();
    }

    function draw() {
      const ink = getComputedStyle(root).color;
      ctx.clearRect(0, 0, W, H);
      if (current) {
        // inlier band of the current sample
        const L = current.L, t = T.value();
        ctx.save(); ctx.globalAlpha = 0.18;
        drawLine(L, GOLD, 2 * t);
        ctx.restore();
        drawLine(L, GOLD, 1.5, [6, 5]);
      }
      const ls = leastSquares(pts);
      if (ls) drawLine({ a: ls.m, b: -1, c: ls.k }, RED, 2, [3, 5]);
      if (best) drawLine(best.L, GREEN, 3);
      const bestIn = best ? new Set(inliersOf(best.L)) : new Set();
      pts.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = bestIn.has(p) ? GREEN : ink;
        ctx.globalAlpha = bestIn.has(p) ? 1 : 0.55; ctx.fill(); ctx.globalAlpha = 1;
      });
      if (current) current.pair.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
      });
      const e = O.value() / 100;
      const need = e > 0 ? Math.ceil(Math.log(1 - 0.99) / Math.log(1 - (1 - e) ** 2)) : 1;
      readout.innerHTML =
        `Iteration <b>${iter}</b>. ` +
        (current ? `This sample has <b>${current.n}</b> inliers. ` : "") +
        (best ? `Best so far: <b>${best.n}</b> of ${pts.length} points. ` : "") +
        `For 99% confidence with ${Math.round(e * 100)}% outliers, about <b>${need}</b> samples are enough.` +
        `<br><span class="leg leg--green">RANSAC best fit</span> <span class="leg leg--red">Least squares on all points</span> <span class="leg leg--gold">Current sample</span>`;
    }

    $(root, "[data-action=new]").addEventListener("click", newData);
    $(root, "[data-action=step]").addEventListener("click", () => { stop(); step(); });
    $(root, "[data-action=run]").addEventListener("click", () => {
      stop();
      let k = 0;
      timer = setInterval(() => { step(); if (++k >= 40) stop(); }, 90);
    });
    O.init(); Nz.init(); T.init();
    newData();
  }

  /* ---------- 8. Panorama stitching with OpenCV.js ---------- */
  function panorama() {
    const root = document.getElementById("pano-sim");
    if (!root) return;
    const button = $(root, "[data-action=stitch]");
    const status = $(root, ".sim__readout");
    const out = $(root, "canvas.pano__out");
    const matchCanvas = $(root, "canvas.pano__matches");
    const blendWrap = $(root, ".pano__blend");
    const B = slider(root, "blend", () => blend(), (v) => (v === 0 ? "left on top" : v === 100 ? "right on top" : v === 50 ? "average" : v + " %"));
    let layers = null;

    async function stitch() {
      button.disabled = true;
      status.textContent = "Loading OpenCV.js (about 10 MB, first time only)…";
      let cv;
      try {
        cv = await window.loadOpenCV();
        const [ia, ib] = await Promise.all([loadImage(MEDIA + "pano_left.jpg"), loadImage(MEDIA + "pano_right.jpg")]);
        status.textContent = "Detecting ORB features and matching them…";
        await new Promise((r) => setTimeout(r, 30));
        const A = cv.imread(ia), Bm = cv.imread(ib);
        const ga = new cv.Mat(), gb = new cv.Mat();
        cv.cvtColor(A, ga, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(Bm, gb, cv.COLOR_RGBA2GRAY);
        const orb = new cv.ORB(1500);
        const ka = new cv.KeyPointVector(), kb = new cv.KeyPointVector();
        const da = new cv.Mat(), db = new cv.Mat(), none = new cv.Mat();
        orb.detectAndCompute(ga, none, ka, da);
        orb.detectAndCompute(gb, none, kb, db);
        const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
        const knn = new cv.DMatchVectorVector();
        bf.knnMatch(db, da, knn, 2);
        const good = [];
        for (let i = 0; i < knn.size(); i++) {
          const m = knn.get(i);
          if (m.size() < 2) continue;
          const m0 = m.get(0), m1 = m.get(1);
          if (m0.distance < 0.75 * m1.distance) good.push(m0);
        }
        if (good.length < 4) throw new Error("Not enough matches");
        const srcPts = [], dstPts = [];
        good.forEach((m) => {
          const p = kb.get(m.queryIdx).pt, q = ka.get(m.trainIdx).pt;
          srcPts.push(p.x, p.y); dstPts.push(q.x, q.y);
        });
        const srcM = cv.matFromArray(good.length, 1, cv.CV_32FC2, srcPts);
        const dstM = cv.matFromArray(good.length, 1, cv.CV_32FC2, dstPts);
        const mask = new cv.Mat();
        const Hm = cv.findHomography(srcM, dstM, cv.RANSAC, 3, mask);
        let inl = 0;
        for (let i = 0; i < mask.rows; i++) inl += mask.data[i] ? 1 : 0;
        const h = Array.from(Hm.data64F);

        // draw matches side by side (inliers green, outliers red)
        const w = ia.width, hh = ia.height;
        matchCanvas.width = w * 2; matchCanvas.height = hh;
        const mctx = matchCanvas.getContext("2d");
        mctx.drawImage(ia, 0, 0); mctx.drawImage(ib, w, 0);
        good.forEach((m, i) => {
          if (i % 2) return; // every other match keeps the drawing readable
          const ok = mask.data[i];
          const p = ka.get(m.trainIdx).pt, q = kb.get(m.queryIdx).pt;
          mctx.beginPath(); mctx.moveTo(p.x, p.y); mctx.lineTo(q.x + w, q.y);
          mctx.strokeStyle = ok ? "rgba(47,200,110,0.8)" : "rgba(230,70,60,0.8)";
          mctx.lineWidth = 1.5; mctx.stroke();
        });

        // warp the right image into the left image's frame
        const corners = [[0, 0], [w, 0], [w, hh], [0, hh]].map(([x, y]) => apply(h, x, y));
        const minX = Math.min(0, ...corners.map((c) => c[0])), maxX = Math.max(w, ...corners.map((c) => c[0]));
        const minY = Math.min(0, ...corners.map((c) => c[1])), maxY = Math.max(hh, ...corners.map((c) => c[1]));
        const OW = Math.ceil(maxX - minX), OH = Math.ceil(maxY - minY);
        const T = [1, 0, -minX, 0, 1, -minY, 0, 0, 1];
        const HT = cv.matFromArray(3, 3, cv.CV_64F, mul3(T, h));
        const TT = cv.matFromArray(3, 3, cv.CV_64F, T);
        const wb = new cv.Mat(), wa = new cv.Mat();
        cv.warpPerspective(Bm, wb, HT, new cv.Size(OW, OH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
        cv.warpPerspective(A, wa, TT, new cv.Size(OW, OH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
        layers = { a: new Uint8ClampedArray(wa.data), b: new Uint8ClampedArray(wb.data), W: OW, H: OH };
        out.width = OW; out.height = OH;
        blendWrap.hidden = false;
        $(root, ".pano__result").hidden = false;
        blend();
        status.innerHTML = `Found <b>${ka.size()}</b> and <b>${kb.size()}</b> ORB features, <b>${good.length}</b> matches after the ratio test, and <b>${inl}</b> RANSAC inliers. Green lines are inliers, red lines outliers.`;
        [A, Bm, ga, gb, ka, kb, da, db, none, knn, srcM, dstM, mask, Hm, HT, TT, wb, wa].forEach((m) => m.delete && m.delete());
        orb.delete(); bf.delete();
        button.textContent = "Stitch again";
      } catch (err) {
        status.textContent = "Could not stitch: " + (err.message || err);
      }
      button.disabled = false;
    }

    function blend() {
      if (!layers) return;
      const { a, b, W, H } = layers;
      const t = B.value() / 100;
      const img = new ImageData(W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const ha = a[i + 3] > 0, hb = b[i + 3] > 0;
        if (ha && hb) {
          for (let c = 0; c < 3; c++) d[i + c] = a[i + c] * (1 - t) + b[i + c] * t;
          d[i + 3] = 255;
        } else if (ha || hb) {
          const s = ha ? a : b;
          d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255;
        }
      }
      out.getContext("2d").putImageData(img, 0, 0);
    }

    button.addEventListener("click", stitch);
    B.init();
  }

  function init() {
    projection(); homogeneous(); playground(); dragHomography(); rectify(); warping(); ransac(); panorama();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
