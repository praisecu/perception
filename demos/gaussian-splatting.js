/*
 * Interactive figures for the chapter on 3D Gaussian Splatting.
 * Each figure looks for its own element id and does nothing if absent.
 * The real-scene figure uses a Blender render and its exact depth map
 * (media/gaussian-splatting/scene_rgb.jpg and scene_depth16.png).
 */
(() => {
  const MEDIA = "media/gaussian-splatting/";
  const GOLD = "#cfb97d";
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (v, d = 2) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d);

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

  function canvasPoint(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * canvas.width,
      y: ((event.clientY - r.top) / r.height) * canvas.height
    };
  }

  // requestAnimationFrame pauses in hidden tabs; fall back to a timer there.
  const nextFrame = (fn) => (document.hidden ? setTimeout(fn, 16) : requestAnimationFrame(fn));

  // Redraw figures when the reader switches between light and dark mode.
  function onTheme(fn) {
    const mo = new MutationObserver(() => fn());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  const fgOf = (root) => getComputedStyle(root).color;

  // Drag helper: calls move(point, event) while the pointer is down.
  function draggable(canvas, down, move, up) {
    let active = false;
    canvas.addEventListener("pointerdown", (e) => {
      if (down(canvasPoint(canvas, e), e) === false) return;
      active = true;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => { if (active) move(canvasPoint(canvas, e), e); });
    const stop = () => { if (active) { active = false; if (up) up(); } };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }

  // Eigen-decomposition of a symmetric 2x2 matrix [[a, b], [b, c]].
  function eig2(a, b, c) {
    const m = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    return { l1: m + d, l2: m - d, theta: 0.5 * Math.atan2(2 * b, a - c) };
  }

  // Small 3x3 helpers (row-major arrays of 9 numbers).
  const M3 = {
    mul(A, B) {
      const C = new Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
      }
      return C;
    },
    T(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; },
    apply(A, v) {
      return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
    }
  };

  function matrixText(name, rows, d = 2) {
    const cells = rows.map((r) => r.map((v) => fmt(v, d).padStart(8)).join(" "));
    const pad = " ".repeat(name.length + 3);
    return cells.map((c, i) => (i === Math.floor((rows.length - 1) / 2) ? `${name} = ` : pad) + "[" + c + " ]").join("\n");
  }

  let gaussRng = 7;
  const rand = () => ((gaussRng = (gaussRng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

  /* ---------------------------------------------------------------------
   * Figure 1: a 2D Gaussian built from a rotation and two scales.
   * ------------------------------------------------------------------- */
  function ellipseEditor() {
    const root = document.getElementById("gs-ellipse");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const Wc = (canvas.width = 720), Hc = (canvas.height = 380);
    const readout = $(root, ".sim__readout");
    const matrices = $(root, ".gs-matrix");
    const heat = ctx.createImageData(Wc, Hc);
    let mu = { x: 330, y: 190 };
    let mode = "rs";

    const S1 = slider(root, "s1", () => { syncCov(); draw(); }, (v) => v.toFixed(0) + " px");
    const S2 = slider(root, "s2", () => { syncCov(); draw(); }, (v) => v.toFixed(0) + " px");
    const TH = slider(root, "theta", () => { syncCov(); draw(); }, (v) => v.toFixed(0) + "°");
    const OP = slider(root, "opacity", draw, (v) => v.toFixed(2));
    const A = slider(root, "sxx", draw, (v) => v.toFixed(0));
    const B = slider(root, "sxy", draw, (v) => v.toFixed(0));
    const C = slider(root, "syy", draw, (v) => v.toFixed(0));

    // Keep the raw covariance sliders in step with R and S.
    function syncCov() {
      const t = (TH.value() * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
      const a = S1.value() ** 2, b = S2.value() ** 2;
      A.set(Math.round(c * c * a + s * s * b));
      B.set(Math.round(c * s * (a - b)));
      C.set(Math.round(s * s * a + c * c * b));
    }

    function current() {
      if (mode === "rs") {
        const t = (TH.value() * Math.PI) / 180;
        const c = Math.cos(t), s = Math.sin(t), a = S1.value() ** 2, b = S2.value() ** 2;
        return { ok: true, sxx: c * c * a + s * s * b, sxy: c * s * (a - b), syy: s * s * a + c * c * b, s1: S1.value(), s2: S2.value(), t };
      }
      const sxx = A.value(), sxy = B.value(), syy = C.value();
      const e = eig2(sxx, sxy, syy);
      if (e.l2 <= 0) return { ok: false, sxx, sxy, syy, det: sxx * syy - sxy * sxy };
      return { ok: true, sxx, sxy, syy, s1: Math.sqrt(e.l1), s2: Math.sqrt(e.l2), t: e.theta };
    }

    function draw() {
      const fg = fgOf(root);
      const g = current();
      ctx.clearRect(0, 0, Wc, Hc);
      // grid
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.08; ctx.lineWidth = 1;
      for (let x = 0; x <= Wc; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Hc); ctx.stroke(); }
      for (let y = 0; y <= Hc; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Wc, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (!g.ok) {
        ctx.fillStyle = "#ff6b6b"; ctx.font = "bold 16px 'Nunito Sans', sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Not a valid covariance: det Σ = " + g.det.toFixed(0) + " ≤ 0", Wc / 2, Hc / 2 - 8);
        ctx.font = "14px 'Open Sans', sans-serif"; ctx.fillStyle = fg;
        ctx.fillText("No Gaussian has this shape. Gradient descent on raw Σ entries can land here.", Wc / 2, Hc / 2 + 18);
        ctx.textAlign = "start";
        matrices.textContent = matrixText("Σ", [[g.sxx, g.sxy], [g.sxy, g.syy]], 0);
        readout.innerHTML = "<b>Invalid.</b> The off-diagonal entry is too large for the diagonal: the matrix has a negative eigenvalue.";
        return;
      }
      // density as a gold heat map with alpha = opacity * G(x)
      const det = g.sxx * g.syy - g.sxy * g.sxy;
      const ia = g.syy / det, ib = -g.sxy / det, ic = g.sxx / det;
      const o = OP.value(), d = heat.data;
      for (let y = 0; y < Hc; y++) {
        const dy = y - mu.y;
        for (let x = 0; x < Wc; x++) {
          const dx = x - mu.x;
          const q = ia * dx * dx + 2 * ib * dx * dy + ic * dy * dy;
          const j = (y * Wc + x) * 4;
          d[j] = 207; d[j + 1] = 185; d[j + 2] = 125;
          d[j + 3] = q > 18 ? 0 : 255 * o * Math.exp(-0.5 * q);
        }
      }
      ctx.putImageData(heat, 0, 0);
      // grid again over the heat map for reference
      // sigma contours
      ctx.save(); ctx.translate(mu.x, mu.y); ctx.rotate(g.t);
      [1, 2, 3].forEach((k) => {
        ctx.beginPath(); ctx.ellipse(0, 0, k * g.s1, k * g.s2, 0, 0, Math.PI * 2);
        ctx.strokeStyle = fg; ctx.globalAlpha = k === 1 ? 0.9 : 0.45; ctx.setLineDash(k === 1 ? [] : [5, 5]); ctx.lineWidth = 1.5; ctx.stroke();
      });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // principal axes (the columns of R scaled by S)
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#e05a47"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2 * g.s1, 0); ctx.stroke();
      ctx.strokeStyle = "#3b82c4"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 2 * g.s2); ctx.stroke();
      ctx.restore();
      // handles
      const h1 = handles(g);
      dot(mu.x, mu.y, fg, 7);
      if (mode === "rs") { dot(h1.a.x, h1.a.y, "#e05a47", 8); dot(h1.b.x, h1.b.y, "#3b82c4", 8); }
      ctx.fillStyle = fg; ctx.font = "13px 'Open Sans', sans-serif";
      ctx.fillText("contours at 1σ, 2σ, 3σ · image coordinates (y points down)", 10, Hc - 10);

      const c = Math.cos(g.t), s = Math.sin(g.t);
      matrices.textContent =
        matrixText("R", [[c, -s], [s, c]]) + "\n\n" +
        matrixText("S", [[g.s1, 0], [0, g.s2]], 1) + "\n\n" +
        matrixText("Σ = R S Sᵀ Rᵀ", [[g.sxx, g.sxy], [g.sxy, g.syy]], 0);
      readout.innerHTML =
        `Eigenvalues of Σ: <b>${(g.s1 ** 2).toFixed(0)}</b> and <b>${(g.s2 ** 2).toFixed(0)}</b> (the squared scales), ` +
        `eigenvectors along the red and blue axes. Opacity ${o.toFixed(2)} sets the peak α at the center.`;
    }
    function dot(x, y, color, r) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    }
    function handles(g) {
      const c = Math.cos(g.t), s = Math.sin(g.t);
      return {
        a: { x: mu.x + 2 * g.s1 * c, y: mu.y + 2 * g.s1 * s },
        b: { x: mu.x - 2 * g.s2 * s, y: mu.y + 2 * g.s2 * c }
      };
    }

    let grab = null;
    draggable(canvas, (p) => {
      const g = current();
      if (!g.ok) { grab = "mu"; return; }
      const h = handles(g);
      const near = (q) => Math.hypot(p.x - q.x, p.y - q.y) < 18;
      grab = mode === "rs" && near(h.a) ? "a" : mode === "rs" && near(h.b) ? "b" : "mu";
      if (grab === "mu") { mu = { x: p.x, y: p.y }; draw(); }
    }, (p) => {
      if (grab === "mu") mu = { x: clamp(p.x, 0, Wc), y: clamp(p.y, 0, Hc) };
      else if (grab === "a") {
        const dx = p.x - mu.x, dy = p.y - mu.y;
        S1.set(clamp(Math.hypot(dx, dy) / 2, Number(S1.input.min), Number(S1.input.max)));
        let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (deg < 0) deg += 180;
        if (deg > 180) deg -= 180;
        TH.set(Math.round(deg));
        syncCov();
      } else if (grab === "b") {
        const t = (TH.value() * Math.PI) / 180;
        const along = -(p.x - mu.x) * Math.sin(t) + (p.y - mu.y) * Math.cos(t);
        S2.set(clamp(Math.abs(along) / 2, Number(S2.input.min), Number(S2.input.max)));
        syncCov();
      }
      draw();
    });

    $$(root, "[data-mode]").forEach((btn) => btn.addEventListener("click", () => {
      const before = current();
      mode = btn.dataset.mode;
      $$(root, "[data-mode]").forEach((b) => b.classList.toggle("is-on", b === btn));
      $(root, ".gs-controls-rs").hidden = mode !== "rs";
      $(root, ".gs-controls-cov").hidden = mode !== "cov";
      if (mode === "rs") {
        // carry a valid raw covariance back into R and S
        const g = before;
        if (g.ok) {
          S1.set(clamp(g.s1, 8, 140)); S2.set(clamp(g.s2, 8, 140));
          let deg = (g.t * 180) / Math.PI; if (deg < 0) deg += 180;
          TH.set(Math.round(deg));
        }
        syncCov();
      }
      draw();
    }));
    S1.init(); S2.init(); TH.init(); OP.init();
    onTheme(draw);
  }

  /* ---------------------------------------------------------------------
   * Figure 2: projecting a 3D Gaussian with the Jacobian (EWA splatting).
   * ------------------------------------------------------------------- */
  function projection() {
    const root = document.getElementById("gs-project");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const Wc = (canvas.width = 720), Hc = (canvas.height = 380);
    const readout = $(root, ".sim__readout");
    const matrices = $(root, ".gs-matrix");
    // image panel and its pinhole camera (camera at the origin, z forward, y down)
    const IMG = { x: 404, y: 70, w: 300, h: 225 };
    const f = 240, cx = IMG.w / 2, cy = IMG.h / 2;
    let yaw = -0.5, pitch = 0.3;

    const X = slider(root, "x", draw, (v) => v.toFixed(2) + " m");
    const Z = slider(root, "z", draw, (v) => v.toFixed(2) + " m");
    const L = slider(root, "len", draw, (v) => v.toFixed(2) + " m");
    const Wd = slider(root, "wid", draw, (v) => v.toFixed(2) + " m");
    const YA = slider(root, "yaw", draw, (v) => v.toFixed(0) + "°");
    const TI = slider(root, "tilt", draw, (v) => v.toFixed(0) + "°");

    const NS = 3000;
    const normals = [];
    for (let i = 0; i < NS; i++) normals.push([gauss(), gauss(), gauss()]);

    // viewer for the 3D panel (orbits around a point in front of the camera)
    function view(P) {
      const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const p = [P[0], -P[1], P[2] - 1.8];
      const x = c * p[0] - s * p[2];
      const z1 = s * p[0] + c * p[2];
      const y = cp * p[1] - sp * z1;
      const z = Math.max(0.5, sp * p[1] + cp * z1 + 5.2);
      const k = 760 / z;
      return [235 + x * k, Hc / 2 + 10 - y * k];
    }
    function seg(a, b, color, width = 1.2, alpha = 1) {
      const [x1, y1] = view(a), [x2, y2] = view(b);
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1;
    }

    function draw() {
      const fg = fgOf(root);
      ctx.clearRect(0, 0, Wc, Hc);
      const mu = [X.value(), 0.15, Z.value()];
      const R = M3.mul(M3.rotY((YA.value() * Math.PI) / 180), M3.rotZ((TI.value() * Math.PI) / 180));
      const sc = [L.value(), Wd.value(), Wd.value()];
      const RS = R.map((v, i) => v * sc[i % 3]);
      const Sig = M3.mul(RS, M3.T(RS));
      // Jacobian of the perspective projection at the mean
      const [x, y, z] = mu;
      const J = [f / z, 0, (-f * x) / (z * z), 0, f / z, (-f * y) / (z * z)];
      const JS = [0, 1].map((r) => [0, 1, 2].map((cI) => J[r * 3] * Sig[cI] + J[r * 3 + 1] * Sig[3 + cI] + J[r * 3 + 2] * Sig[6 + cI]));
      const S2 = [0, 1].map((r) => [0, 1].map((cI) => JS[r][0] * J[cI * 3] + JS[r][1] * J[cI * 3 + 1] + JS[r][2] * J[cI * 3 + 2]));
      const u0 = cx + (f * x) / z, v0 = cy + (f * y) / z;

      // exact projections of samples
      let n = 0, mu_u = 0, mu_v = 0;
      const proj = [];
      const world = [];
      for (const nn of normals) {
        const d = M3.apply(RS, nn);
        const P = [mu[0] + d[0], mu[1] + d[1], mu[2] + d[2]];
        world.push(P);
        if (P[2] < 0.05) { proj.push(null); continue; }
        const u = cx + (f * P[0]) / P[2], v = cy + (f * P[1]) / P[2];
        proj.push([u, v]);
        mu_u += u; mu_v += v; n++;
      }
      mu_u /= n; mu_v /= n;
      let cuu = 0, cuv = 0, cvv = 0;
      for (const q of proj) if (q) { cuu += (q[0] - mu_u) ** 2; cuv += (q[0] - mu_u) * (q[1] - mu_v); cvv += (q[1] - mu_v) ** 2; }
      cuu /= n; cuv /= n; cvv /= n;
      const err = Math.sqrt((cuu - S2[0][0]) ** 2 + 2 * (cuv - S2[0][1]) ** 2 + (cvv - S2[1][1]) ** 2) /
        Math.sqrt(cuu * cuu + 2 * cuv * cuv + cvv * cvv);

      // ---- 3D panel ----
      ctx.fillStyle = fg; ctx.font = "bold 13px 'Nunito Sans', sans-serif";
      ctx.fillText("3D scene (drag to orbit)", 12, 22);
      const pw = IMG.w / 2 / f, ph = IMG.h / 2 / f;
      const corners = [[-pw, -ph, 1], [pw, -ph, 1], [pw, ph, 1], [-pw, ph, 1]];
      corners.forEach((c, i) => { seg([0, 0, 0], c, fg, 1, 0.5); seg(c, corners[(i + 1) % 4], fg, 1.5, 0.8); });
      // far frustum hint
      corners.forEach((c) => seg(c, c.map((v) => v * 6.5), fg, 0.8, 0.15));
      // optical axis
      seg([0, 0, 0], [0, 0, 7], fg, 0.8, 0.25);
      // samples
      ctx.fillStyle = GOLD;
      for (let i = 0; i < 500; i++) {
        const [px, py] = view(world[i]);
        ctx.globalAlpha = 0.35; ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      // principal ellipses of the ellipsoid at 1 sigma
      const axes = [0, 1, 2].map((k) => [RS[k], RS[3 + k], RS[6 + k]]);
      [[0, 1], [0, 2], [1, 2]].forEach(([a, b]) => {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const t = (i / 48) * Math.PI * 2;
          const P = [0, 1, 2].map((k) => mu[k] + Math.cos(t) * axes[a][k] + Math.sin(t) * axes[b][k]);
          const [px, py] = view(P);
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = "#e0a63b"; ctx.lineWidth = 1.6; ctx.stroke();
      });
      // rays from the camera through the mean
      seg([0, 0, 0], mu, GOLD, 1.2, 0.8);
      // projected EWA ellipse drawn on the image plane in 3D
      const e = eig2(S2[0][0], S2[0][1], S2[1][1]);
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        const a = Math.sqrt(Math.max(e.l1, 0)) * Math.cos(t), b = Math.sqrt(Math.max(e.l2, 0)) * Math.sin(t);
        const u = u0 + a * Math.cos(e.theta) - b * Math.sin(e.theta), v = v0 + a * Math.sin(e.theta) + b * Math.cos(e.theta);
        const [px, py] = view([(u - cx) / f, (v - cy) / f, 1]);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.strokeStyle = "#e05a47"; ctx.lineWidth = 2; ctx.stroke();
      const [ox, oy] = view([0, 0, 0]);
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.font = "12px 'Open Sans', sans-serif"; ctx.fillText("camera", ox + 6, oy + 14);

      // ---- image panel ----
      ctx.save();
      ctx.translate(IMG.x, IMG.y);
      ctx.fillStyle = "#111"; ctx.fillRect(0, 0, IMG.w, IMG.h);
      ctx.beginPath(); ctx.rect(0, 0, IMG.w, IMG.h); ctx.clip();
      ctx.fillStyle = GOLD;
      proj.forEach((q, i) => { if (q && i < 1500) { ctx.globalAlpha = 0.5; ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2); } });
      ctx.globalAlpha = 1;
      [1, 2].forEach((k) => {
        ctx.beginPath();
        ctx.ellipse(u0, v0, k * Math.sqrt(Math.max(e.l1, 0)), k * Math.sqrt(Math.max(e.l2, 0)), e.theta, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2; ctx.setLineDash(k === 1 ? [] : [6, 5]); ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = fg; ctx.font = "bold 13px 'Nunito Sans', sans-serif";
      ctx.fillText("image (300 × 225 px, f = 240 px)", IMG.x, IMG.y - 10);
      ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("dots: exact projections of samples", IMG.x, IMG.y + IMG.h + 20);
      ctx.fillStyle = "#ff6b6b";
      ctx.fillText("red: EWA ellipse J Σ Jᵀ at 1σ and 2σ", IMG.x, IMG.y + IMG.h + 38);

      matrices.textContent =
        matrixText("J", [J.slice(0, 3), J.slice(3)], 1) + "\n\n" +
        matrixText("Σ′ = J Σ Jᵀ", S2, 0);
      const quality = err < 0.12 ? "close" : err < 0.35 ? "noticeably off" : "a poor fit";
      readout.innerHTML =
        `Depth ${z.toFixed(2)} m: the ellipse spans about <b>${(2 * Math.sqrt(e.l1)).toFixed(0)} × ${(2 * Math.sqrt(Math.max(e.l2, 0))).toFixed(0)} px</b> (1σ). ` +
        `Difference between the EWA covariance and the true spread of the projected samples: <b>${(100 * err).toFixed(0)}%</b>, ${quality}. ` +
        `The linearization holds when the Gaussian is small compared with its distance.`;
    }

    let last = null;
    draggable(canvas, (p) => { if (p.x > IMG.x - 10) return false; last = p; }, (p) => {
      yaw += (p.x - last.x) * 0.01;
      pitch = clamp(pitch + (p.y - last.y) * 0.01, -1.2, 1.2);
      last = p; draw();
    });
    [X, Z, L, Wd, YA, TI].forEach((s) => s.init());
    onTheme(draw);
  }

  /* ---------------------------------------------------------------------
   * Figure 3: alpha blending of depth-sorted splats at one pixel.
   * ------------------------------------------------------------------- */
  function compositor() {
    const root = document.getElementById("gs-composite");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const Wc = (canvas.width = 720), Hc = (canvas.height = 340);
    const IW = 440, IH = 340;
    const readout = $(root, ".sim__readout");
    const img = ctx.createImageData(IW, IH);
    const BG = [24, 26, 30];
    const splats = [
      { name: "red", col: [224, 80, 70], x: 185, y: 150, sx: 52, sy: 28, t: 0.5, z: 3.0, o: 0.95 },
      { name: "green", col: [70, 180, 100], x: 245, y: 175, sx: 46, sy: 24, t: -0.4, z: 1.4, o: 0.9 },
      { name: "blue", col: [70, 130, 230], x: 205, y: 225, sx: 60, sy: 20, t: 0.1, z: 2.2, o: 0.9 },
      { name: "gold", col: [230, 195, 100], x: 295, y: 115, sx: 36, sy: 36, t: 0, z: 2.6, o: 0.9 },
      { name: "purple", col: [165, 100, 210], x: 130, y: 240, sx: 30, sy: 48, t: 0.3, z: 1.8, o: 0.95 }
    ];
    let probe = { x: 215, y: 165 };
    let sorted = true;
    const ZR = slider(root, "zred", () => { splats[0].z = ZR.value(); draw(); }, (v) => v.toFixed(1) + " m");
    const OP = slider(root, "op", draw, (v) => v.toFixed(2));

    function alphaAt(s, x, y) {
      const c = Math.cos(s.t), sn = Math.sin(s.t);
      const dx = x - s.x, dy = y - s.y;
      const a = (c * dx + sn * dy) / s.sx, b = (-sn * dx + c * dy) / s.sy;
      return Math.min(0.99, s.o * OP.value() * Math.exp(-0.5 * (a * a + b * b)));
    }
    function order() {
      const idx = splats.map((_, i) => i);
      return sorted ? idx.sort((a, b) => splats[a].z - splats[b].z) : idx;
    }

    function draw() {
      const fg = fgOf(root);
      const ord = order().map((i) => splats[i]);
      const d = img.data;
      for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
        let T = 1, r = 0, g = 0, b = 0;
        for (const s of ord) {
          const a = alphaAt(s, x, y);
          if (a < 1 / 255) continue;
          r += s.col[0] * a * T; g += s.col[1] * a * T; b += s.col[2] * a * T;
          T *= 1 - a;
          if (T < 1e-4) break;
        }
        const j = (y * IW + x) * 4;
        d[j] = r + BG[0] * T; d[j + 1] = g + BG[1] * T; d[j + 2] = b + BG[2] * T; d[j + 3] = 255;
      }
      ctx.clearRect(0, 0, Wc, Hc);
      ctx.putImageData(img, 0, 0);
      // centers and probe
      for (const s of splats) {
        ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = "12px 'Open Sans', sans-serif"; ctx.fillText(`z=${s.z.toFixed(1)}`, s.x + 7, s.y - 6);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(probe.x, probe.y, 9, 0, Math.PI * 2);
      ctx.moveTo(probe.x - 15, probe.y); ctx.lineTo(probe.x + 15, probe.y);
      ctx.moveTo(probe.x, probe.y - 15); ctx.lineTo(probe.x, probe.y + 15); ctx.stroke();

      // panel: front-to-back list at the probe pixel
      const X0 = IW + 18;
      ctx.fillStyle = fg; ctx.font = "bold 14px 'Nunito Sans', sans-serif";
      ctx.fillText(sorted ? "At the probe, front to back" : "At the probe, in list order", X0, 24);
      ctx.font = "12px 'Open Sans', sans-serif"; ctx.globalAlpha = 0.7;
      ctx.fillText("z      α       T      weight αT", X0 + 22, 46);
      ctx.globalAlpha = 1;
      let T = 1, used = 0;
      const out = [0, 0, 0];
      ord.forEach((s, k) => {
        const a = alphaAt(s, probe.x, probe.y);
        const w = a * T;
        const y = 66 + k * 34;
        ctx.fillStyle = `rgb(${s.col})`; ctx.fillRect(X0, y - 12, 14, 14);
        ctx.fillStyle = fg; ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
        ctx.fillText(`${s.z.toFixed(1)}  ${a.toFixed(2)}  ${T.toFixed(2)}`, X0 + 22, y);
        ctx.fillStyle = `rgb(${s.col})`; ctx.fillRect(X0 + 150, y - 11, 95 * w, 12);
        ctx.strokeStyle = fg; ctx.globalAlpha = 0.3; ctx.strokeRect(X0 + 150, y - 11, 95, 12); ctx.globalAlpha = 1;
        for (let c = 0; c < 3; c++) out[c] += s.col[c] * w;
        if (a >= 1 / 255) used++;
        T *= 1 - a;
      });
      for (let c = 0; c < 3; c++) out[c] += BG[c] * T;
      const yb = 66 + splats.length * 34 + 6;
      ctx.fillStyle = fg; ctx.font = "13px 'Open Sans', sans-serif";
      ctx.fillText(`background weight T = ${T.toFixed(2)}`, X0, yb);
      ctx.fillText("pixel color", X0, yb + 30);
      ctx.fillStyle = `rgb(${out.map((v) => v | 0)})`; ctx.fillRect(X0 + 80, yb + 14, 60, 24);
      ctx.strokeStyle = fg; ctx.strokeRect(X0 + 80, yb + 14, 60, 24);

      readout.innerHTML = sorted
        ? `Splats are blended nearest first. Each one is weighted by its own α times the transmittance T left over by the splats in front of it. ${used} of ${splats.length} splats touch this pixel.`
        : `<b>Unsorted:</b> splats are blended in the order they are stored, so a far splat can cover a near one. Compare the red splat (z = ${splats[0].z.toFixed(1)} m) in both modes.`;
    }

    let grab = null;
    draggable(canvas, (p) => {
      if (p.x > IW) return false;
      grab = splats.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < 14) || "probe";
      if (grab === "probe") { probe = { x: clamp(p.x, 0, IW - 1), y: clamp(p.y, 0, IH - 1) }; draw(); }
    }, (p) => {
      const x = clamp(p.x, 0, IW - 1), y = clamp(p.y, 0, IH - 1);
      if (grab === "probe") probe = { x, y }; else { grab.x = x; grab.y = y; }
      draw();
    });
    $$(root, "[data-order]").forEach((btn) => btn.addEventListener("click", () => {
      sorted = btn.dataset.order === "sorted";
      $$(root, "[data-order]").forEach((b) => b.classList.toggle("is-on", b === btn));
      draw();
    }));
    ZR.init(); OP.init();
    onTheme(draw);
  }

  /* ---------------------------------------------------------------------
   * Figure 4: a real scene as Gaussians, with a CPU tile rasterizer.
   * ------------------------------------------------------------------- */
  async function sceneViewer() {
    const root = document.getElementById("gs-scene");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    readout.textContent = "Loading the scene…";
    let rgbImg, depImg;
    try {
      [rgbImg, depImg] = await Promise.all([loadImage(MEDIA + "scene_rgb.jpg"), loadImage(MEDIA + "scene_depth16.png")]);
    } catch (e) {
      readout.textContent = "Could not load the scene images.";
      return;
    }
    const W = 480, H = 270, F = (50 / 36) * W, CX = W / 2, CY = H / 2;
    const read = (im) => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(im, 0, 0, W, H);
      return x.getImageData(0, 0, W, H).data;
    };
    const rgb = read(rgbImg), dep = read(depImg);
    const depth = (u, v) => { const j = (v * W + u) * 4; return (dep[j] * 256 + dep[j + 1]) / 1000; };
    const back = (u, v, z) => [((u + 0.5 - CX) * z) / F, ((v + 0.5 - CY) * z) / F, z];

    canvas.width = W; canvas.height = H;
    const frame = ctx.createImageData(W, H);
    const accR = new Float32Array(W * H), accG = new Float32Array(W * H), accB = new Float32Array(W * H), trans = new Float32Array(W * H);
    const zbuf = new Float32Array(W * H);
    const TILE = 16, TW = Math.ceil(W / TILE), TH = Math.ceil(H / TILE);
    const tileCount = new Int32Array(TW * TH);

    // A Gaussian cloud: mean, covariance (xx, xy, xz, yy, yz, zz), color, opacity.
    function makeCloud(n) {
      return { n, m: new Float32Array(n * 3), cov: new Float32Array(n * 6), col: new Uint8Array(n * 3), op: new Float32Array(n) };
    }
    function setCov(cl, i, axes, scales) {
      // Σ = Σ_k s_k² a_k a_kᵀ, i.e. R S Sᵀ Rᵀ with the axes a_k as the columns of R
      const c = [0, 0, 0, 0, 0, 0];
      axes.forEach((a, k) => {
        const s2 = scales[k] * scales[k];
        c[0] += s2 * a[0] * a[0]; c[1] += s2 * a[0] * a[1]; c[2] += s2 * a[0] * a[2];
        c[3] += s2 * a[1] * a[1]; c[4] += s2 * a[1] * a[2]; c[5] += s2 * a[2] * a[2];
      });
      cl.cov.set(c, i * 6);
    }
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const len = (a) => Math.hypot(a[0], a[1], a[2]);
    const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

    // Dense cloud: one flat Gaussian per 2 x 2 pixel block, lying on the surface.
    function denseCloud() {
      const S = 2, gw = W / S, gh = Math.floor(H / S);
      const cl = makeCloud(gw * gh);
      let i = 0;
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const u = gx * S, v = gy * S, z = depth(u, v);
        const P = back(u, v, z);
        // A neighbour counts as the same surface if inverse depth (which is
        // linear across a plane) continues smoothly through this pixel.
        const nbr = (du, dv) => {
          const ua = clamp(u + du, 0, W - 1), va = clamp(v + dv, 0, H - 1);
          const ub = clamp(u - du, 0, W - 1), vb = clamp(v - dv, 0, H - 1);
          const za = depth(ua, va), zb = depth(ub, vb);
          const curve = Math.abs(1 / za - 2 / z + 1 / zb) * z;
          return curve < 0.03 && Math.abs(za - z) / z < 0.3 ? back(ua, va, za) : null;
        };
        const pu = nbr(S, 0), pv = nbr(0, S);
        const sp = (z * S) / F;
        let a1, a2, s1, s2;
        if (pu && pv) {
          const tu = sub(pu, P), tv = sub(pv, P);
          const n = unit(cross(tu, tv));
          a1 = unit(tu); a2 = cross(n, a1);
          s1 = Math.max(len(tu), sp) * 0.6; s2 = Math.max(len(tv), sp) * 0.6;
          setCov(cl, i, [a1, a2, n], [s1, s2, sp * 0.08]);
        } else {
          // at a depth edge, face the camera
          const n = unit(P); a1 = unit(cross([0, 1, 0], n)); a2 = cross(n, a1);
          setCov(cl, i, [a1, a2, n], [sp * 0.6, sp * 0.6, sp * 0.08]);
        }
        cl.m.set(P, i * 3);
        const j = (v * W + u) * 4;
        cl.col[i * 3] = rgb[j]; cl.col[i * 3 + 1] = rgb[j + 1]; cl.col[i * 3 + 2] = rgb[j + 2];
        cl.op[i] = 0.95;
        i++;
      }
      return cl;
    }

    // Sparse cloud, like structure from motion: points where the image has
    // texture, isotropic Gaussians sized by the distance to their 3 nearest neighbours.
    function sparseCloud() {
      const N = 3500, cand = [];
      let total = 0;
      for (let v = 1; v < H - 1; v += 1) for (let u = 1; u < W - 1; u += 1) {
        const j = (v * W + u) * 4;
        const gx = rgb[j + 4] - rgb[j - 4], gy = rgb[j + W * 4] - rgb[j - W * 4];
        const w = Math.hypot(gx, gy) + 15;
        total += w; cand.push([u, v, total]);
      }
      const pts = [];
      for (let k = 0; k < N; k++) {
        const r = rand() * total;
        let lo = 0, hi = cand.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cand[mid][2] < r) lo = mid + 1; else hi = mid; }
        const [u, v] = cand[lo];
        pts.push([u, v, back(u, v, depth(u, v))]);
      }
      const cl = makeCloud(N);
      pts.forEach(([u, v, P], i) => {
        // keep the three smallest squared distances
        let d0 = Infinity, d1 = Infinity, d2 = Infinity;
        for (let k = 0; k < N; k++) {
          if (k === i) continue;
          const q = pts[k][2];
          const dd = (q[0] - P[0]) ** 2 + (q[1] - P[1]) ** 2 + (q[2] - P[2]) ** 2;
          if (dd < d2) {
            if (dd < d1) { d2 = d1; if (dd < d0) { d1 = d0; d0 = dd; } else d1 = dd; } else d2 = dd;
          }
        }
        // (capped, so that a lone point near the camera cannot cover the view)
        const s = Math.min(Math.sqrt((d0 + d1 + d2) / 3), 0.025 * P[2]);
        setCov(cl, i, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [s, s, s]);
        cl.m.set(P, i * 3);
        const j = (v * W + u) * 4;
        cl.col.set([rgb[j], rgb[j + 1], rgb[j + 2]], i * 3);
        cl.op[i] = 0.8;
      });
      return cl;
    }

    const dense = denseCloud();
    let sparse = null;
    let mode = "splats", showTiles = false, yaw = 0, pitch = 0;
    const SZ = slider(root, "size", schedule, (v) => "× " + v.toFixed(2));
    const DO = slider(root, "dolly", schedule, (v) => v.toFixed(2) + " m");
    const PIVOT = 1.4;

    // per-frame buffers for projected Gaussians
    const cap = dense.n;
    const pu = new Float32Array(cap), pv = new Float32Array(cap), pz = new Float32Array(cap);
    const ca = new Float32Array(cap), cb = new Float32Array(cap), cc = new Float32Array(cap), rad = new Float32Array(cap);
    const keys = new Float32Array(cap);
    let ord = new Uint32Array(cap);

    let pending = false;
    function schedule() { if (!pending) { pending = true; setTimeout(() => { pending = false; render(); }, 0); } }

    function render() {
      const t0 = performance.now();
      const cl = mode === "sparse" ? (sparse || (sparse = sparseCloud())) : dense;
      const Rv = M3.mul(M3.rotX(pitch), M3.rotY(yaw));
      const k = SZ.value() ** 2, dolly = DO.value();
      const d = frame.data;
      accR.fill(0); accG.fill(0); accB.fill(0); trans.fill(1);
      if (mode === "points") {
        zbuf.fill(Infinity);
        for (let i = 0; i < cl.n; i++) {
          const m = [cl.m[i * 3], cl.m[i * 3 + 1], cl.m[i * 3 + 2] - PIVOT];
          const q = M3.apply(Rv, m); q[2] += PIVOT - dolly;
          if (q[2] < 0.1) continue;
          const u = Math.floor(CX + (F * q[0]) / q[2]), v = Math.floor(CY + (F * q[1]) / q[2]);
          if (u < 0 || v < 0 || u >= W || v >= H) continue;
          const j = v * W + u;
          if (q[2] < zbuf[j]) {
            zbuf[j] = q[2]; accR[j] = cl.col[i * 3]; accG[j] = cl.col[i * 3 + 1]; accB[j] = cl.col[i * 3 + 2]; trans[j] = 0;
          }
        }
        finish(t0, cl.n, 0, 0);
        return;
      }
      // 1. project every Gaussian: mean, 2D covariance via the Jacobian, radius
      let n = 0;
      tileCount.fill(0);
      let pairs = 0;
      for (let i = 0; i < cl.n; i++) {
        const m = [cl.m[i * 3], cl.m[i * 3 + 1], cl.m[i * 3 + 2] - PIVOT];
        const q = M3.apply(Rv, m); q[2] += PIVOT - dolly;
        const z = q[2];
        if (z < 0.2) continue;
        const o = i * 6, c = cl.cov;
        const S = [c[o], c[o + 1], c[o + 2], c[o + 1], c[o + 3], c[o + 4], c[o + 2], c[o + 4], c[o + 5]].map((v) => v * k);
        const Sc = M3.mul(M3.mul(Rv, S), M3.T(Rv));
        const j0 = F / z, j2 = (-F * q[0]) / (z * z), j5 = (-F * q[1]) / (z * z);
        // J = [[j0, 0, j2], [0, j0, j5]]
        const r0 = [j0 * Sc[0] + j2 * Sc[6], j0 * Sc[1] + j2 * Sc[7], j0 * Sc[2] + j2 * Sc[8]];
        const r1 = [j0 * Sc[3] + j5 * Sc[6], j0 * Sc[4] + j5 * Sc[7], j0 * Sc[5] + j5 * Sc[8]];
        const sxx = r0[0] * j0 + r0[2] * j2 + 0.3, sxy = r0[1] * j0 + r0[2] * j5, syy = r1[1] * j0 + r1[2] * j5 + 0.3;
        const det = sxx * syy - sxy * sxy;
        if (det <= 0) continue;
        const u = CX + (F * q[0]) / z, v = CY + (F * q[1]) / z;
        const mid = 0.5 * (sxx + syy), lmax = mid + Math.sqrt(Math.max(0.1, mid * mid - det));
        const r = Math.ceil(3 * Math.sqrt(lmax));
        if (u + r < 0 || v + r < 0 || u - r >= W || v - r >= H) continue;
        pu[n] = u; pv[n] = v; pz[n] = z;
        ca[n] = syy / det; cb[n] = -sxy / det; cc[n] = sxx / det; rad[n] = r;
        ord[n] = i;
        // 2. count the tiles each splat touches (each pair is a sort key on a GPU)
        const tx0 = Math.max(0, Math.floor((u - r) / TILE)), tx1 = Math.min(TW - 1, Math.floor((u + r) / TILE));
        const ty0 = Math.max(0, Math.floor((v - r) / TILE)), ty1 = Math.min(TH - 1, Math.floor((v + r) / TILE));
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tileCount[ty * TW + tx]++;
        pairs += (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
        n++;
      }
      const t1 = performance.now();
      // 3. sort by depth (front to back)
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) { idx[i] = i; keys[i] = pz[i]; }
      idx.sort((a, b) => keys[a] - keys[b]);
      const t2 = performance.now();
      // 4. blend front to back, skipping pixels that are already opaque
      for (let s = 0; s < n; s++) {
        const i = idx[s], g = ord[i];
        const u = pu[i], v = pv[i], r = rad[i], A = ca[i], B = cb[i], C = cc[i], op = cl.op[g];
        const cr = cl.col[g * 3], cg = cl.col[g * 3 + 1], cbb = cl.col[g * 3 + 2];
        const x0 = Math.max(0, Math.floor(u - r)), x1 = Math.min(W - 1, Math.ceil(u + r));
        const y0 = Math.max(0, Math.floor(v - r)), y1 = Math.min(H - 1, Math.ceil(v + r));
        for (let y = y0; y <= y1; y++) {
          const dy = y + 0.5 - v;
          let j = y * W + x0;
          for (let x = x0; x <= x1; x++, j++) {
            const T = trans[j];
            if (T < 1e-3) continue;
            const dx = x + 0.5 - u;
            const power = -0.5 * (A * dx * dx + 2 * B * dx * dy + C * dy * dy);
            if (power < -4.5) continue;
            const a = Math.min(0.99, op * Math.exp(power));
            if (a < 1 / 255) continue;
            const w = a * T;
            accR[j] += cr * w; accG[j] += cg * w; accB[j] += cbb * w;
            trans[j] = T * (1 - a);
          }
        }
      }
      finish(t0, n, pairs, t2 - t1);
    }

    function finish(t0, n, pairs, sortMs) {
      const d = frame.data;
      for (let j = 0, q = 0; j < W * H; j++, q += 4) {
        const T = trans[j];
        d[q] = accR[j] + 17 * T; d[q + 1] = accG[j] + 17 * T; d[q + 2] = accB[j] + 20 * T; d[q + 3] = 255;
      }
      ctx.putImageData(frame, 0, 0);
      const ms = performance.now() - t0;
      if (showTiles && mode !== "points") {
        let mx = 1;
        for (let t = 0; t < tileCount.length; t++) mx = Math.max(mx, tileCount[t]);
        for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
          const c = tileCount[ty * TW + tx] / mx;
          ctx.fillStyle = `rgba(${Math.round(60 + 195 * c)}, ${Math.round(80 + 100 * (1 - Math.abs(c - 0.5) * 2))}, ${Math.round(220 * (1 - c))}, 0.45)`;
          ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 0.5;
        for (let x = 0; x <= W; x += TILE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y <= H; y += TILE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        readout.innerHTML = `${TW} × ${TH} tiles of 16 × 16 px, colored by how many splats overlap each (blue few, red up to ${mx}). ` +
          `<b>${pairs.toLocaleString()}</b> splat-tile pairs; a GPU sorts these keys and gives each tile its own thread block.`;
        return;
      }
      if (mode === "points") {
        readout.innerHTML = `<b>${n.toLocaleString()} points</b>, one pixel each. Move the view and the gaps between them open up: points have no extent.`;
      } else {
        readout.innerHTML = `<b>${n.toLocaleString()} Gaussians</b> ${mode === "sparse" ? "(sparse, isotropic: what optimization starts from)" : "(dense, flat on the surfaces)"} · ` +
          `frame in <b>${ms.toFixed(0)} ms</b> on one CPU core, of which ${sortMs.toFixed(0)} ms sorting. Drag to look around.`;
      }
    }

    let last = null;
    canvas.style.touchAction = "none";
    draggable(canvas, (p) => { last = p; }, (p) => {
      yaw = clamp(yaw - (p.x - last.x) * 0.005, -0.6, 0.6);
      pitch = clamp(pitch - (p.y - last.y) * 0.004, -0.02, 0.25);
      last = p; schedule();
    });
    $$(root, "[data-view]").forEach((btn) => btn.addEventListener("click", () => {
      mode = btn.dataset.view;
      $$(root, "[data-view]").forEach((b) => b.classList.toggle("is-on", b === btn));
      if (mode === "sparse" && !sparse) readout.textContent = "Building the sparse cloud…";
      setTimeout(render, 20);
    }));
    $(root, "[data-action=tiles]").addEventListener("click", (e) => {
      showTiles = !showTiles; e.currentTarget.classList.toggle("is-on", showTiles); schedule();
    });
    $(root, "[data-action=reset]").addEventListener("click", () => { yaw = 0; pitch = 0; DO.set(0); SZ.set(1); schedule(); });
    // Start slightly to the side so the 3D effect is visible.
    // (the camera is close to the floor, so the view only tilts downward)
    yaw = 0.07; pitch = 0.03;
    SZ.init(); DO.init();
  }

  /* ---------------------------------------------------------------------
   * Figure 5: view-dependent color with spherical harmonics.
   * ------------------------------------------------------------------- */
  function harmonics() {
    const root = document.getElementById("gs-sh");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const Wc = (canvas.width = 720), Hc = (canvas.height = 300);
    const readout = $(root, ".sim__readout");
    const R0 = 105, D = 2 * R0;
    const tgt = ctx.createImageData(D, D), fit = ctx.createImageData(D, D);
    let degree = 2, rotY = 0.4, rotX = -0.3;
    const SH = slider(root, "shine", () => { coeffs = null; draw(); }, (v) => v.toFixed(0));

    // Real spherical harmonics up to degree 3 (16 functions).
    function basis(x, y, z, out) {
      out[0] = 0.282095;
      out[1] = 0.488603 * y; out[2] = 0.488603 * z; out[3] = 0.488603 * x;
      out[4] = 1.092548 * x * y; out[5] = 1.092548 * y * z; out[6] = 0.315392 * (3 * z * z - 1);
      out[7] = 1.092548 * x * z; out[8] = 0.546274 * (x * x - y * y);
      out[9] = 0.590044 * y * (3 * x * x - y * y); out[10] = 2.890611 * x * y * z; out[11] = 0.457046 * y * (5 * z * z - 1);
      out[12] = 0.373176 * z * (5 * z * z - 3); out[13] = 0.457046 * x * (5 * z * z - 1); out[14] = 1.445306 * z * (x * x - y * y);
      out[15] = 0.590044 * x * (x * x - 3 * y * y);
      return out;
    }
    const hl = (() => { const v = [0.45, 0.55, 0.7]; const l = Math.hypot(...v); return v.map((a) => a / l); })();
    // The "true" appearance: a matte color plus a glossy highlight and a cool rim.
    function target(d) {
      const shine = SH.value();
      const s = Math.pow(Math.max(0, d[0] * hl[0] + d[1] * hl[1] + d[2] * hl[2]), shine);
      const back = Math.max(0, -d[1]) * 0.25;
      return [0.55 + 0.9 * s, 0.32 + 0.85 * s + 0.15 * back, 0.18 + 0.75 * s + 0.45 * back];
    }
    let coeffs = null;
    // Least-squares fit of each channel on directions spread over the sphere.
    function fitAll() {
      const N = 1200, B = [], Y = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const z = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - z * z), t = golden * i;
        const d = [r * Math.cos(t), r * Math.sin(t), z];
        B.push(basis(d[0], d[1], d[2], new Float64Array(16)));
        Y.push(target(d));
      }
      const res = {};
      for (let L = 0; L <= 3; L++) {
        const K = (L + 1) * (L + 1);
        const A = Array.from({ length: K }, () => new Float64Array(K + 3));
        for (let i = 0; i < N; i++) for (let a = 0; a < K; a++) {
          for (let b = 0; b < K; b++) A[a][b] += B[i][a] * B[i][b];
          for (let c = 0; c < 3; c++) A[a][K + c] += B[i][a] * Y[i][c];
        }
        // Gauss-Jordan elimination
        for (let col = 0; col < K; col++) {
          let piv = col;
          for (let r = col + 1; r < K; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
          [A[col], A[piv]] = [A[piv], A[col]];
          const p = A[col][col];
          for (let c = col; c < K + 3; c++) A[col][c] /= p;
          for (let r = 0; r < K; r++) if (r !== col) {
            const fct = A[r][col];
            if (fct) for (let c = col; c < K + 3; c++) A[r][c] -= fct * A[col][c];
          }
        }
        const w = [0, 1, 2].map((c) => Array.from({ length: K }, (_, a) => A[a][K + c]));
        let se = 0;
        for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
          let v = 0; for (let a = 0; a < K; a++) v += w[c][a] * B[i][a];
          se += (v - Y[i][c]) ** 2;
        }
        res[L] = { w, K, rms: Math.sqrt(se / (3 * N)) };
      }
      return res;
    }
    const tmp = new Float64Array(16);
    function evalFit(d) {
      const f = coeffs[degree]; basis(d[0], d[1], d[2], tmp);
      return [0, 1, 2].map((c) => { let v = 0; for (let a = 0; a < f.K; a++) v += f.w[c][a] * tmp[a]; return v; });
    }
    const toByte = (v) => 255 * Math.pow(clamp(v / 1.25, 0, 1), 1 / 1.4);

    function sphere(imgData, fn, R) {
      const d = imgData.data;
      for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
        const nx = (x + 0.5 - R0) / R0, ny = -(y + 0.5 - R0) / R0, r2 = nx * nx + ny * ny;
        const j = (y * D + x) * 4;
        if (r2 > 1) { d[j + 3] = 0; continue; }
        const n = [nx, ny, Math.sqrt(1 - r2)];
        const w = M3.apply(R, n);
        const c = fn(w);
        d[j] = toByte(c[0]); d[j + 1] = toByte(c[1]); d[j + 2] = toByte(c[2]);
        d[j + 3] = r2 > 0.985 ? 255 * (1 - r2) / 0.015 : 255;
      }
    }

    function draw() {
      if (!coeffs) coeffs = fitAll();
      const fg = fgOf(root);
      const R = M3.mul(M3.rotY(rotY), M3.rotX(rotX));
      sphere(tgt, target, R);
      sphere(fit, evalFit, R);
      ctx.clearRect(0, 0, Wc, Hc);
      ctx.putImageData(tgt, 20, 50);
      ctx.putImageData(fit, 255, 50);
      ctx.fillStyle = fg; ctx.font = "bold 13px 'Nunito Sans', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("true appearance", 20 + R0, 30);
      ctx.fillText(`spherical harmonics, degree ${degree}`, 255 + R0, 30);
      ctx.font = "12px 'Open Sans', sans-serif"; ctx.globalAlpha = 0.7;
      ctx.fillText("each point: the color seen from that direction", 137 + R0, Hc - 12);
      ctx.globalAlpha = 1; ctx.textAlign = "start";
      // brightness around a great circle through the highlight
      const P = { x: 490, y: 60, w: 215, h: 170 };
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
      ctx.strokeRect(P.x, P.y, P.w, P.h); ctx.globalAlpha = 1;
      const e2 = (() => { const v = [hl[1], -hl[0], 0]; const l = Math.hypot(...v); return v.map((a) => a / l); })();
      const lum = (c) => 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
      [["target", target, fg], ["fit", evalFit, "#e05a47"]].forEach(([, fn, color]) => {
        ctx.beginPath();
        for (let i = 0; i <= 180; i++) {
          const t = (i / 180) * 2 * Math.PI - Math.PI;
          const d = [0, 1, 2].map((k) => Math.cos(t) * hl[k] + Math.sin(t) * e2[k]);
          const yv = P.y + P.h - (clamp(lum(fn(d)), -0.2, 1.6) + 0.2) / 1.8 * P.h;
          const xv = P.x + (i / 180) * P.w;
          i ? ctx.lineTo(xv, yv) : ctx.moveTo(xv, yv);
        }
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      });
      ctx.fillStyle = fg; ctx.font = "bold 13px 'Nunito Sans', sans-serif";
      ctx.fillText("brightness vs viewing angle", P.x, 30);
      ctx.font = "12px 'Open Sans', sans-serif";
      ctx.fillText("−180°", P.x, P.y + P.h + 16); ctx.fillText("0° (highlight)", P.x + P.w / 2 - 34, P.y + P.h + 16); ctx.fillText("180°", P.x + P.w - 26, P.y + P.h + 16);
      ctx.fillText("true", P.x + 8, P.y + 16);
      ctx.fillStyle = "#e05a47"; ctx.fillText("degree " + degree, P.x + 48, P.y + 16);
      const f = coeffs[degree];
      readout.innerHTML = `Degree ${degree} uses <b>${f.K}</b> coefficients per color channel, <b>${3 * f.K}</b> numbers per Gaussian. ` +
        `RMS error over all directions: <b>${f.rms.toFixed(3)}</b>. Sharp highlights need high degrees; a matte surface needs only degree 0.`;
    }
    $$(root, "[data-degree]").forEach((btn) => btn.addEventListener("click", () => {
      degree = Number(btn.dataset.degree);
      $$(root, "[data-degree]").forEach((b) => b.classList.toggle("is-on", b === btn));
      draw();
    }));
    let last = null;
    canvas.style.touchAction = "none";
    draggable(canvas, (p) => { last = p; }, (p) => {
      rotY += (p.x - last.x) * 0.012; rotX = clamp(rotX + (p.y - last.y) * 0.012, -1.5, 1.5);
      last = p; draw();
    });
    SH.init();
    onTheme(draw);
  }

  /* ---------------------------------------------------------------------
   * Figure 6: fitting an image with 2D Gaussians, with adaptive density
   * control. Each Gaussian adds its color to the image; the 3D method
   * alpha-blends instead, but the optimization works the same way.
   * ------------------------------------------------------------------- */
  function createFitter(target, W, H, opt) {
    const MAX = opt.max;
    const NP = 8; // x, y, log sx, log sy, theta, r, g, b
    const p = new Float32Array(MAX * NP), gr = new Float32Array(MAX * NP);
    const m1 = new Float32Array(MAX * NP), m2 = new Float32Array(MAX * NP);
    const steps = new Int32Array(MAX);
    const acc = new Float32Array(MAX), accN = new Int32Array(MAX);
    const img = new Float32Array(W * H * 3), err = new Float32Array(W * H * 3);
    const LR = [0.35, 0.35, 0.03, 0.03, 0.04, 0.025, 0.025, 0.025];
    const SMAX = Math.log(W / 8), SMIN = Math.log(0.35);
    let n = 0, iter = 0, psnr = 0;
    const fresh = { clone: [], split: [], prune: 0, at: -1 };

    function resetMoments(i) {
      for (let k = 0; k < NP; k++) { m1[i * NP + k] = 0; m2[i * NP + k] = 0; }
      steps[i] = 0; acc[i] = 0; accN[i] = 0;
    }
    function sample(x, y) {
      const xi = clamp(x | 0, 0, W - 1), yi = clamp(y | 0, 0, H - 1), j = (yi * W + xi) * 3;
      return [target[j], target[j + 1], target[j + 2]];
    }
    function init(count) {
      n = 0; iter = 0; fresh.clone = []; fresh.split = []; fresh.at = -1;
      const s = W / 60;
      for (let i = 0; i < count; i++) {
        const x = rand() * W, y = rand() * H, col = sample(x, y), o = n * NP;
        p[o] = x; p[o + 1] = y; p[o + 2] = Math.log(s); p[o + 3] = Math.log(s); p[o + 4] = rand() * Math.PI;
        p[o + 5] = col[0] * 0.6; p[o + 6] = col[1] * 0.6; p[o + 7] = col[2] * 0.6;
        resetMoments(n++);
      }
    }
    function footprint(i, visit) {
      const o = i * NP;
      const x = p[o], y = p[o + 1], sx = Math.exp(p[o + 2]), sy = Math.exp(p[o + 3]);
      const c = Math.cos(p[o + 4]), s = Math.sin(p[o + 4]);
      const rx = 3 * Math.sqrt(c * c * sx * sx + s * s * sy * sy);
      const ry = 3 * Math.sqrt(s * s * sx * sx + c * c * sy * sy);
      const x0 = Math.max(0, Math.floor(x - rx)), x1 = Math.min(W - 1, Math.ceil(x + rx));
      const y0 = Math.max(0, Math.floor(y - ry)), y1 = Math.min(H - 1, Math.ceil(y + ry));
      for (let py = y0; py <= y1; py++) {
        const dy = py + 0.5 - y;
        for (let px = x0; px <= x1; px++) {
          const dx = px + 0.5 - x;
          const a = c * dx + s * dy, b = -s * dx + c * dy;
          const u = a / sx, v = b / sy, q = u * u + v * v;
          if (q > 9) continue;
          visit((py * W + px) * 3, Math.exp(-0.5 * q), u, v, a, b, sx, sy, c, s);
        }
      }
    }
    function render() {
      img.fill(0);
      for (let i = 0; i < n; i++) {
        const o = i * NP, r = p[o + 5], g = p[o + 6], b = p[o + 7];
        footprint(i, (j, w) => { img[j] += r * w; img[j + 1] += g * w; img[j + 2] += b * w; });
      }
      return img;
    }
    function step() {
      render();
      let se = 0;
      for (let j = 0; j < img.length; j++) { const e = img[j] - target[j]; err[j] = e; se += e * e; }
      psnr = 10 * Math.log10(1 / Math.max(1e-10, se / img.length));
      // gradients of the squared error with respect to every parameter
      for (let i = 0; i < n; i++) {
        const o = i * NP, r = p[o + 5], g = p[o + 6], b = p[o + 7];
        let gx = 0, gy = 0, gsx = 0, gsy = 0, gth = 0, gcr = 0, gcg = 0, gcb = 0;
        footprint(i, (j, w, u, v, a, bb, sx, sy, c, s) => {
          const er = err[j], eg = err[j + 1], eb = err[j + 2];
          gcr += er * w; gcg += eg * w; gcb += eb * w;
          const dg = (er * r + eg * g + eb * b) * w;
          const ux = u / sx, vy = v / sy;
          gx += dg * (c * ux - s * vy);
          gy += dg * (s * ux + c * vy);
          gsx += dg * u * u;
          gsy += dg * v * v;
          gth -= dg * (ux * bb - vy * a);
        });
        gr[o] = gx; gr[o + 1] = gy; gr[o + 2] = gsx; gr[o + 3] = gsy; gr[o + 4] = gth;
        gr[o + 5] = gcr; gr[o + 6] = gcg; gr[o + 7] = gcb;
        acc[i] += Math.hypot(gx, gy); accN[i]++;
      }
      // Adam update
      for (let i = 0; i < n; i++) {
        const t = ++steps[i];
        const c1 = 1 - Math.pow(0.9, t), c2 = 1 - Math.pow(0.999, t);
        for (let k = 0; k < NP; k++) {
          const q = i * NP + k, g = gr[q];
          m1[q] = 0.9 * m1[q] + 0.1 * g;
          m2[q] = 0.999 * m2[q] + 0.001 * g * g;
          p[q] -= (LR[k] * (m1[q] / c1)) / (Math.sqrt(m2[q] / c2) + 1e-8);
        }
        const o = i * NP;
        p[o + 2] = clamp(p[o + 2], SMIN, SMAX); p[o + 3] = clamp(p[o + 3], SMIN, SMAX);
      }
      iter++;
      if (opt.adc && iter % opt.every === 0 && iter <= opt.stopAt) densify();
      return psnr;
    }
    function copy(from, to) { for (let k = 0; k < NP; k++) p[to * NP + k] = p[from * NP + k]; }
    function remove(i) {
      n--;
      if (i !== n) {
        copy(n, i);
        for (let k = 0; k < NP; k++) { m1[i * NP + k] = m1[n * NP + k]; m2[i * NP + k] = m2[n * NP + k]; }
        steps[i] = steps[n]; acc[i] = acc[n]; accN[i] = accN[n];
      }
    }
    // Clone or split where the position gradient is largest, then prune.
    function densify() {
      fresh.clone = []; fresh.split = []; fresh.prune = 0; fresh.at = iter;
      const avg = [];
      for (let i = 0; i < n; i++) avg.push([accN[i] ? acc[i] / accN[i] : 0, i]);
      avg.sort((a, b) => b[0] - a[0]);
      const k = Math.min(MAX - n, Math.ceil(0.3 * n));
      for (let t = 0; t < k; t++) {
        const i = avg[t][1], o = i * NP;
        const sx = Math.exp(p[o + 2]), sy = Math.exp(p[o + 3]);
        const j = n++;
        copy(i, j);
        if (Math.max(sx, sy) > opt.splitScale) {
          // split: two smaller Gaussians placed by sampling the parent
          const c = Math.cos(p[o + 4]), s = Math.sin(p[o + 4]), px = p[o], py = p[o + 1];
          for (const q of [i, j]) {
            const a = gauss() * sx, b = gauss() * sy;
            p[q * NP] = px + c * a - s * b;
            p[q * NP + 1] = py + s * a + c * b;
            p[q * NP + 2] -= Math.log(1.6); p[q * NP + 3] -= Math.log(1.6);
          }
          fresh.split.push(i, j);
        } else {
          // clone: a copy of a small Gaussian, moved along its gradient
          const gl = Math.hypot(gr[o], gr[o + 1]) || 1;
          p[j * NP] -= (gr[o] / gl) * sx; p[j * NP + 1] -= (gr[o + 1] / gl) * sy;
          for (const q of [i, j]) for (let c = 5; c < 8; c++) p[q * NP + c] *= 0.5;
          fresh.clone.push(i, j);
        }
        resetMoments(i); resetMoments(j);
      }
      for (let i = 0; i < n; i++) { acc[i] = 0; accN[i] = 0; }
      const mark = new Uint8Array(MAX);
      fresh.clone.forEach((i) => (mark[i] = 1));
      fresh.split.forEach((i) => (mark[i] = 2));
      for (let i = n - 1; i >= 0; i--) {
        const o = i * NP;
        if (Math.max(Math.abs(p[o + 5]), Math.abs(p[o + 6]), Math.abs(p[o + 7])) < 0.01) {
          mark[i] = mark[n - 1]; remove(i); fresh.prune++;
        }
      }
      fresh.clone = []; fresh.split = [];
      for (let i = 0; i < n; i++) { if (mark[i] === 1) fresh.clone.push(i); else if (mark[i] === 2) fresh.split.push(i); }
    }
    return { init, step, render, count: () => n, iter: () => iter, psnr: () => psnr, fresh, p, NP };
  }

  async function imageFit() {
    const root = document.getElementById("gs-fit");
    if (!root) return;
    const [cvT, cvR] = $$(root, "canvas");
    const W = 160, H = 90, SCALE = 3;
    cvT.width = cvR.width = W * SCALE; cvT.height = cvR.height = H * SCALE;
    const ctxT = cvT.getContext("2d"), ctxR = cvR.getContext("2d");
    const readout = $(root, ".sim__readout");
    const small = document.createElement("canvas"); small.width = W; small.height = H;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    const out = sctx.createImageData(W, H);
    let scene = null;
    try { scene = await loadImage(MEDIA + "scene_rgb.jpg"); } catch (e) { /* the text target still works */ }

    function makeTarget(kind) {
      sctx.fillStyle = "#14181e"; sctx.fillRect(0, 0, W, H);
      if (kind === "scene" && scene) sctx.drawImage(scene, 0, 0, W, H);
      else if (kind === "text") {
        sctx.fillStyle = "#f0d78c"; sctx.font = "bold 44px 'Nunito Sans', Arial, sans-serif";
        sctx.textAlign = "center"; sctx.textBaseline = "middle"; sctx.fillText("3DGS", W / 2, H / 2 + 2);
      } else {
        for (let k = 0; k < 6; k++) {
          sctx.beginPath(); sctx.arc(W / 2, H / 2, 40 - k * 6.5, 0, Math.PI * 2);
          sctx.fillStyle = k % 2 ? "#14181e" : ["#e05a47", "#cfb97d", "#3b82c4"][(k / 2) | 0]; sctx.fill();
        }
      }
      const d = sctx.getImageData(0, 0, W, H).data;
      const t = new Float32Array(W * H * 3);
      for (let j = 0, q = 0; j < W * H; j++, q += 4) { t[j * 3] = d[q] / 255; t[j * 3 + 1] = d[q + 1] / 255; t[j * 3 + 2] = d[q + 2] / 255; }
      ctxT.imageSmoothingEnabled = true;
      ctxT.drawImage(small, 0, 0, W * SCALE, H * SCALE);
      return t;
    }

    let kind = "scene", adc = true, overlay = false, running = true, visible = false, fitter = null, flashUntil = -1;
    const BUDGET = 400, START = 48;
    function reset() {
      const t = makeTarget(kind);
      fitter = createFitter(t, W, H, { max: BUDGET, adc, every: 50, stopAt: 1000, splitScale: 4 });
      fitter.init(START);
      paint();
    }
    function paint() {
      const img = fitter.render(), d = out.data;
      for (let j = 0, q = 0; j < W * H; j++, q += 4) {
        d[q] = 255 * clamp(img[j * 3], 0, 1); d[q + 1] = 255 * clamp(img[j * 3 + 1], 0, 1); d[q + 2] = 255 * clamp(img[j * 3 + 2], 0, 1); d[q + 3] = 255;
      }
      sctx.putImageData(out, 0, 0);
      ctxR.imageSmoothingEnabled = true;
      ctxR.drawImage(small, 0, 0, W * SCALE, H * SCALE);
      const fr = fitter.fresh, flash = fitter.iter() < flashUntil;
      if (overlay || flash) {
        const p = fitter.p, NP = fitter.NP;
        const draw = (i, color, width) => {
          const o = i * NP;
          ctxR.beginPath();
          ctxR.ellipse(p[o] * SCALE, p[o + 1] * SCALE, Math.exp(p[o + 2]) * SCALE, Math.exp(p[o + 3]) * SCALE, p[o + 4], 0, Math.PI * 2);
          ctxR.strokeStyle = color; ctxR.lineWidth = width; ctxR.stroke();
        };
        if (overlay) { ctxR.globalAlpha = 0.45; for (let i = 0; i < fitter.count(); i++) draw(i, "#fff", 0.8); ctxR.globalAlpha = 1; }
        if (flash) { fr.clone.forEach((i) => draw(i, "#4ade80", 1.6)); fr.split.forEach((i) => draw(i, "#f59e0b", 1.6)); }
      }
      const ev = fr.at > 0 && flash
        ? ` · step ${fr.at}: <span class="gs-clone">${fr.clone.length / 2} cloned</span>, <span class="gs-split">${fr.split.length / 2} split</span>, ${fr.prune} pruned`
        : "";
      readout.innerHTML = `Iteration <b>${fitter.iter()}</b> · <b>${fitter.count()}</b> Gaussians · PSNR <b>${fitter.psnr().toFixed(1)} dB</b>${ev}` +
        (adc ? "" : " · density control off: the count never grows");
    }
    let looping = false;
    function kick() {
      if (!looping && running && visible) { looping = true; nextFrame(tick); }
    }
    function tick() {
      looping = false;
      if (!running || !visible) return;
      const t0 = performance.now();
      const before = fitter.fresh.at;
      do { fitter.step(); } while (performance.now() - t0 < 14 && fitter.iter() < 3000);
      if (fitter.fresh.at !== before) flashUntil = fitter.iter() + 25;
      paint();
      if (fitter.iter() >= 3000) { running = false; setRunLabel(); return; }
      kick();
    }
    const runBtn = $(root, "[data-action=run]");
    function setRunLabel() { runBtn.textContent = running ? "Pause" : fitter && fitter.iter() >= 3000 ? "Done" : "Run"; }
    runBtn.addEventListener("click", () => {
      if (fitter.iter() >= 3000) return;
      running = !running; setRunLabel(); kick();
    });
    $(root, "[data-action=reset]").addEventListener("click", () => { reset(); running = true; setRunLabel(); kick(); });
    $$(root, "[data-target]").forEach((btn) => btn.addEventListener("click", () => {
      kind = btn.dataset.target;
      $$(root, "[data-target]").forEach((b) => b.classList.toggle("is-on", b === btn));
      reset(); running = true; setRunLabel(); kick();
    }));
    const adcBox = $(root, "input[name=adc]"), ovBox = $(root, "input[name=overlay]");
    adcBox.addEventListener("change", () => { adc = adcBox.checked; reset(); running = true; setRunLabel(); kick(); });
    ovBox.addEventListener("change", () => { overlay = ovBox.checked; paint(); });
    reset();
    setRunLabel();
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    }).observe(root);
  }

  function init() {
    ellipseEditor(); projection(); compositor(); sceneViewer(); harmonics(); imageFit();
  }
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
