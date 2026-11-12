/*
 * Interactive figures for Chapter 5, Camera Models and Calibration.
 * Hand-rolled canvas 3D: no external libraries. Each demo initializes by
 * element id and does nothing if its element is absent.
 */
(() => {
  const $ = (root, sel) => root.querySelector(sel);
  const deg = Math.PI / 180;

  /* ---------- small linear algebra ---------- */
  const Rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
  const Ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
  const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const mv = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const tr = (A) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const n = Math.hypot(...a) || 1; return scale(a, 1 / n); };
  const f2 = (x, d = 2) => (Math.abs(x) < 5e-10 ? 0 : x).toFixed(d);

  // Body (robot) frame: x forward, y left, z up. OpenCV camera frame:
  // x right, y down, z forward. Columns are the camera axes in the body frame.
  const CAM_IN_BODY = [[0, 0, 1], [-1, 0, 0], [0, -1, 0]];
  // Rotation from yaw, pitch, roll (Z then Y then X, intrinsic).
  const ypr = (y, p, r) => mm(mm(Rz(y), Ry(p)), Rx(r));

  function matrixHTML(name, M, digits = 2) {
    const rows = M.map((r) => `<tr>${r.map((x) => `<td>${typeof x === "number" ? f2(x, digits) : x}</td>`).join("")}</tr>`).join("");
    return `<div class="cm-mat"><span class="cm-mat__name">${name} =</span><table>${rows}</table></div>`;
  }

  function slider(root, name, onChange, format = (v) => v) {
    const input = $(root, `input[name="${name}"]`);
    const out = input.parentElement.querySelector("output");
    const update = () => { if (out) out.textContent = format(Number(input.value)); onChange(); };
    input.addEventListener("input", update);
    return {
      input,
      value: () => Number(input.value),
      set: (v) => { input.value = v; if (out) out.textContent = format(Number(input.value)); },
      init: update
    };
  }

  // Size a canvas for crisp drawing at device pixel ratio; returns a 2D context
  // whose units are CSS pixels.
  function fitCanvas(canvas, w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // A viewer that orbits a target; used for the "outside" 3D views.
  function makeOrbit(canvas, target, opts, redraw) {
    const view = { az: opts.az, el: opts.el, dist: opts.dist, target };
    let drag = null;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, az: view.az, el: view.el };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      view.az = drag.az - (e.clientX - drag.x) * 0.008;
      view.el = Math.max(-1.2, Math.min(1.45, drag.el + (e.clientY - drag.y) * 0.008));
      redraw();
    });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    view.project = (p, W, H) => {
      const eye = add(view.target, [
        view.dist * Math.cos(view.el) * Math.cos(view.az),
        view.dist * Math.cos(view.el) * Math.sin(view.az),
        view.dist * Math.sin(view.el)
      ]);
      const fwd = norm(sub(view.target, eye));
      const right = norm(cross(fwd, [0, 0, 1]));
      const up = cross(right, fwd);
      const d = sub(p, eye);
      const z = dot(d, fwd);
      if (z < 0.1) return null;
      const F = 0.9 * Math.min(W, H) * 1.3;
      return [W / 2 + (F * dot(d, right)) / z, H / 2 - (F * dot(d, up)) / z, z];
    };
    return view;
  }

  function drawLine3(ctx, view, W, H, a, b, color, width = 1.5) {
    const pa = view.project(a, W, H), pb = view.project(b, W, H);
    if (!pa || !pb) return;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
  }

  function themeInk() {
    return document.body.classList.contains("quarto-dark") ? "rgba(243,239,227,0.85)" : "rgba(29,30,0,0.8)";
  }
  function themeFaint() {
    return document.body.classList.contains("quarto-dark") ? "rgba(243,239,227,0.14)" : "rgba(29,30,0,0.12)";
  }

  const GOLD = "#cfb97d", RED = "#d9534f", GREEN = "#3fa66b", BLUE = "#4a7fd6";

  // A small scene: a unit cube, a pole and a target, in the world frame (z up).
  const cubeAt = (c, s) => {
    const h = s / 2, v = [];
    for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) v.push(add(c, [x, y, z]));
    const e = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    return e.map(([i, j]) => [v[i], v[j]]);
  };
  const SCENE = [
    ...cubeAt([5, 0, 0.5], 1).map((s) => ({ seg: s, color: GOLD })),
    ...cubeAt([7, -2, 0.35], 0.7).map((s) => ({ seg: s, color: GREEN })),
    ...cubeAt([6.5, 2.2, 0.6], 1.2).map((s) => ({ seg: s, color: BLUE })),
    { seg: [[4, -3, 0], [4, 3, 0]], color: "faint" },
    { seg: [[8, -3, 0], [8, 3, 0]], color: "faint" }
  ];
  for (let x = 2; x <= 9; x++) SCENE.push({ seg: [[x, -3, 0], [x, 3, 0]], color: "faint" });
  for (let y = -3; y <= 3; y++) SCENE.push({ seg: [[2, y, 0], [9, y, 0]], color: "faint" });

  /* ---------- 1. Camera viewer: P = K [R | t] ---------- */
  function cameraViewer() {
    const root = document.getElementById("cam3d-sim");
    if (!root) return;
    const [world, image] = root.querySelectorAll("canvas");
    const mats = $(root, ".cm-mats");
    const IW = 640, IH = 480;
    let view;

    const S = {};
    ["cx_", "cy_", "cz_", "yaw", "pitch", "roll", "f", "u0", "v0"].forEach((n) => {
      const fmt = n.startsWith("c") && n.endsWith("_") ? (v) => v.toFixed(1) + " m"
        : ["yaw", "pitch", "roll"].includes(n) ? (v) => v + "°"
        : (v) => v + " px";
      S[n] = slider(root, n, draw, fmt);
    });

    function camera() {
      const C = [S.cx_.value(), S.cy_.value(), S.cz_.value()];
      const Rwc = mm(ypr(S.yaw.value() * deg, -S.pitch.value() * deg, S.roll.value() * deg), CAM_IN_BODY);
      const R = tr(Rwc);
      const t = scale(mv(R, C), -1);
      const K = [[S.f.value(), 0, S.u0.value()], [0, S.f.value(), S.v0.value()], [0, 0, 1]];
      return { C, Rwc, R, t, K };
    }

    function projectPix(cam, X) {
      const Xc = add(mv(cam.R, X), cam.t);
      if (Xc[2] < 0.05) return null;
      const p = mv(cam.K, Xc);
      return [p[0] / p[2], p[1] / p[2]];
    }

    function draw() {
      const cam = camera();
      // World view
      const W = world.clientWidth || 400, H = Math.round(W * 0.75);
      const ctx = fitCanvas(world, W, H);
      ctx.clearRect(0, 0, W, H);
      SCENE.forEach(({ seg, color }) => drawLine3(ctx, view, W, H, seg[0], seg[1], color === "faint" ? themeFaint() : color, color === "faint" ? 1 : 2));
      // world axes
      drawLine3(ctx, view, W, H, [0, 0, 0], [1, 0, 0], RED, 2.5);
      drawLine3(ctx, view, W, H, [0, 0, 0], [0, 1, 0], GREEN, 2.5);
      drawLine3(ctx, view, W, H, [0, 0, 0], [0, 0, 1], BLUE, 2.5);
      // frustum
      const depth = 1.4;
      const corners = [[0, 0], [IW, 0], [IW, IH], [0, IH]].map(([u, v]) => {
        const xn = (u - cam.K[0][2]) / cam.K[0][0], yn = (v - cam.K[1][2]) / cam.K[1][1];
        return add(cam.C, mv(cam.Rwc, [xn * depth, yn * depth, depth]));
      });
      corners.forEach((c, i) => {
        drawLine3(ctx, view, W, H, cam.C, c, GOLD, 1.2);
        drawLine3(ctx, view, W, H, c, corners[(i + 1) % 4], GOLD, 1.6);
      });
      // camera axes (x right red, y down green, z forward blue)
      const ax = (i, col) => drawLine3(ctx, view, W, H, cam.C, add(cam.C, scale(cam.Rwc.map((r) => r[i]), 0.6)), col, 2.5);
      ax(0, RED); ax(1, GREEN); ax(2, BLUE);
      ctx.fillStyle = themeInk(); ctx.font = "12px 'Nunito Sans', sans-serif";
      ctx.fillText("Drag to orbit", 10, H - 10);

      // Image view
      const w2 = image.clientWidth || 400, h2 = Math.round((w2 * IH) / IW);
      const ictx = fitCanvas(image, w2, h2);
      const s = w2 / IW;
      ictx.fillStyle = "#11120f"; ictx.fillRect(0, 0, w2, h2);
      SCENE.forEach(({ seg, color }) => {
        const a = projectPix(cam, seg[0]), b = projectPix(cam, seg[1]);
        if (!a || !b) return;
        ictx.strokeStyle = color === "faint" ? "rgba(243,239,227,0.18)" : color;
        ictx.lineWidth = color === "faint" ? 1 : 2;
        ictx.beginPath(); ictx.moveTo(a[0] * s, a[1] * s); ictx.lineTo(b[0] * s, b[1] * s); ictx.stroke();
      });
      // principal point
      ictx.strokeStyle = "#f7df91"; ictx.lineWidth = 1;
      const px = cam.K[0][2] * s, py = cam.K[1][2] * s;
      ictx.beginPath(); ictx.moveTo(px - 8, py); ictx.lineTo(px + 8, py); ictx.moveTo(px, py - 8); ictx.lineTo(px, py + 8); ictx.stroke();

      mats.innerHTML = matrixHTML("K", cam.K, 0) + matrixHTML("R", cam.R) + matrixHTML("t", cam.t.map((x) => [x]));
    }

    view = makeOrbit(world, [4.5, 0, 0.5], { az: -2.3, el: 0.55, dist: 11 }, draw);
    $(root, "[data-action=reset]").addEventListener("click", () => {
      [["cx_", 0], ["cy_", 0], ["cz_", 1], ["yaw", 0], ["pitch", 0], ["roll", 0], ["f", 500], ["u0", 320], ["v0", 240]].forEach(([n, v]) => S[n].set(v));
      draw();
    });
    Object.values(S).forEach((s) => s.set(s.value()));
    draw();
    window.addEventListener("resize", () => setTimeout(draw, 50));
    new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------- 2. Frames explorer: world to pixel, one step at a time ---------- */
  function framesExplorer() {
    const root = document.getElementById("frames-sim");
    if (!root) return;
    const steps = root.querySelectorAll(".cm-step");
    const canvas = $(root, "canvas");
    let step = 0;
    const X = slider(root, "X", update, (v) => v.toFixed(1));
    const Y = slider(root, "Y", update, (v) => v.toFixed(1));
    const Z = slider(root, "Z", update, (v) => v.toFixed(1));

    const C = [0, 0, 1.2];
    const Rwc = mm(ypr(10 * deg, -5 * deg, 0), CAM_IN_BODY);
    const R = tr(Rwc), t = scale(mv(R, C), -1);
    const K = [[600, 0, 320], [0, 600, 240], [0, 0, 1]];

    function update() {
      const Xw = [X.value(), Y.value(), Z.value()];
      const Xc = add(mv(R, Xw), t);
      const xn = [Xc[0] / Xc[2], Xc[1] / Xc[2]];
      const uv = [K[0][0] * xn[0] + K[0][2], K[1][1] * xn[1] + K[1][2]];
      const vals = [
        `X<sub>w</sub> = (${Xw.map((v) => f2(v)).join(", ")}) m`,
        `X<sub>c</sub> = R X<sub>w</sub> + t = (${Xc.map((v) => f2(v)).join(", ")}) m`,
        Xc[2] > 0 ? `x = X<sub>c</sub> / Z<sub>c</sub> = (${f2(xn[0], 3)}, ${f2(xn[1], 3)})` : "Behind the camera: Z<sub>c</sub> &le; 0, so the point is not imaged.",
        Xc[2] > 0 ? `(u, v) = (f<sub>x</sub> x + c<sub>x</sub>, f<sub>y</sub> y + c<sub>y</sub>) = (${f2(uv[0], 1)}, ${f2(uv[1], 1)}) px` : "No pixel."
      ];
      steps.forEach((el, i) => {
        el.querySelector(".cm-step__value").innerHTML = vals[i];
        el.classList.toggle("is-current", i === step);
        el.classList.toggle("is-hidden", i > step);
      });
      // image with the pixel marked once we reach the last step
      const w = canvas.clientWidth || 320, h = Math.round((w * 480) / 640);
      const ctx = fitCanvas(canvas, w, h);
      const s = w / 640;
      ctx.fillStyle = "#11120f"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(243,239,227,0.15)";
      for (let u = 0; u <= 640; u += 80) { ctx.beginPath(); ctx.moveTo(u * s, 0); ctx.lineTo(u * s, h); ctx.stroke(); }
      for (let v = 0; v <= 480; v += 80) { ctx.beginPath(); ctx.moveTo(0, v * s); ctx.lineTo(w, v * s); ctx.stroke(); }
      ctx.fillStyle = "rgba(243,239,227,0.6)"; ctx.font = "11px sans-serif";
      ctx.fillText("(0, 0)", 4, 12); ctx.fillText("u →", w - 30, 12); ctx.fillText("v ↓", 4, h - 6);
      if (step >= 3 && Xc[2] > 0) {
        const inside = uv[0] >= 0 && uv[0] <= 640 && uv[1] >= 0 && uv[1] <= 480;
        ctx.fillStyle = inside ? GOLD : RED;
        ctx.beginPath(); ctx.arc(uv[0] * s, uv[1] * s, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillText(inside ? "pixel" : "outside the image", Math.min(w - 90, uv[0] * s + 10), Math.max(14, uv[1] * s - 8));
      }
    }
    $(root, "[data-action=next]").addEventListener("click", () => { step = Math.min(3, step + 1); update(); });
    $(root, "[data-action=back]").addEventListener("click", () => { step = Math.max(0, step - 1); update(); });
    $(root, "[data-action=all]").addEventListener("click", () => { step = 3; update(); });
    [X, Y, Z].forEach((s) => s.set(s.value()));
    update();
    window.addEventListener("resize", () => setTimeout(update, 50));
  }

  /* ---------- 3. Rotation playground and gimbal lock ---------- */
  function rotationPlayground() {
    const root = document.getElementById("rotation-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const readout = $(root, ".cm-mats");
    const note = $(root, ".sim__readout");
    let view;
    const Y = slider(root, "yaw", draw, (v) => v + "°");
    const P = slider(root, "pitch", draw, (v) => v + "°");
    const Rr = slider(root, "roll", draw, (v) => v + "°");

    // A quadrotor outline in its body frame.
    const body = [];
    const arm = 1.0;
    [45, 135, 225, 315].forEach((a) => {
      const tip = [arm * Math.cos(a * deg), arm * Math.sin(a * deg), 0];
      body.push({ seg: [[0, 0, 0], tip], color: "ink" });
      for (let k = 0; k < 16; k++) {
        const t1 = (k / 16) * 2 * Math.PI, t2 = ((k + 1) / 16) * 2 * Math.PI;
        body.push({ seg: [add(tip, [0.38 * Math.cos(t1), 0.38 * Math.sin(t1), 0.05]), add(tip, [0.38 * Math.cos(t2), 0.38 * Math.sin(t2), 0.05])], color: GOLD });
      }
    });
    body.push({ seg: [[0, 0, 0], [1.6, 0, 0]], color: RED, w: 3.5 });
    body.push({ seg: [[0, 0, 0], [0, 1.6, 0]], color: GREEN, w: 3.5 });
    body.push({ seg: [[0, 0, 0], [0, 0, 1.6]], color: BLUE, w: 3.5 });

    function draw() {
      const R = ypr(Y.value() * deg, P.value() * deg, Rr.value() * deg);
      const W = canvas.clientWidth || 400, H = Math.round(W * 0.7);
      const ctx = fitCanvas(canvas, W, H);
      ctx.clearRect(0, 0, W, H);
      // fixed world axes, faint
      [[2.2, 0, 0], [0, 2.2, 0], [0, 0, 2.2]].forEach((a) => drawLine3(ctx, view, W, H, [0, 0, 0], a, themeFaint(), 1.5));
      body.forEach(({ seg, color, w }) => drawLine3(ctx, view, W, H, mv(R, seg[0]), mv(R, seg[1]), color === "ink" ? themeInk() : color, w || 2));
      ctx.fillStyle = themeInk(); ctx.font = "12px 'Nunito Sans', sans-serif";
      ctx.fillText("Drag to orbit   x forward (red), y left (green), z up (blue)", 10, H - 10);

      // axis-angle and quaternion from R
      const trc = R[0][0] + R[1][1] + R[2][2];
      const angle = Math.acos(Math.max(-1, Math.min(1, (trc - 1) / 2)));
      let axis = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
      const s = Math.hypot(...axis);
      axis = s > 1e-6 ? scale(axis, 1 / s) : [1, 0, 0];
      const q = [Math.cos(angle / 2), ...scale(axis, Math.sin(angle / 2))];
      readout.innerHTML = matrixHTML("R", R, 3) +
        `<div class="cm-aa"><div><b>Axis-angle</b> θ = ${f2(angle / deg, 1)}° about (${axis.map((v) => f2(v)).join(", ")})</div>` +
        `<div><b>Quaternion</b> (w, x, y, z) = (${q.map((v) => f2(v, 3)).join(", ")})</div></div>`;
      const locked = Math.abs(Math.abs(P.value()) - 90) < 0.5;
      note.innerHTML = locked
        ? "<b>Gimbal lock.</b> With pitch at 90°, yaw and roll now turn the drone about the same axis. Increase both yaw and roll by the same amount: the orientation does not change at all. One degree of freedom has been lost."
        : "Each slider rotates about one axis, applied in the order yaw, then pitch, then roll.";
      note.classList.toggle("cm-warn", locked);
    }
    view = makeOrbit(canvas, [0, 0, 0], { az: -2.4, el: 0.45, dist: 6.5 }, draw);
    $(root, "[data-action=lock]").addEventListener("click", () => { P.set(90); draw(); });
    $(root, "[data-action=both]").addEventListener("click", () => {
      Y.set(((Y.value() + 20 + 180) % 360) - 180); Rr.set(((Rr.value() + 20 + 180) % 360) - 180); draw();
    });
    $(root, "[data-action=reset]").addEventListener("click", () => { Y.set(0); P.set(0); Rr.set(0); draw(); });
    [Y, P, Rr].forEach((s) => s.set(s.value()));
    draw();
    window.addEventListener("resize", () => setTimeout(draw, 50));
    new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------- 4. Intrinsics on a checkerboard ---------- */
  function intrinsics() {
    const root = document.getElementById("intrinsics-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const mats = $(root, ".cm-mats");
    const FX = slider(root, "fx", draw, (v) => v + " px");
    const FY = slider(root, "fy", draw, (v) => v + " px");
    const CX = slider(root, "cx", draw, (v) => v + " px");
    const CY = slider(root, "cy", draw, (v) => v + " px");
    const SK = slider(root, "s", draw, (v) => v + " px");
    const IW = 640, IH = 480;
    // Board: 8 x 6 squares of 6 cm, 1 m in front of the camera, tilted a little.
    const Rb = mm(Ry(18 * deg), Rx(-12 * deg));
    const tb = [-0.22, -0.16, 1.0];
    const sq = 0.06;
    const corner = (i, j) => add(mv(Rb, [i * sq, j * sq, 0]), tb);

    function draw() {
      const K = [[FX.value(), SK.value(), CX.value()], [0, FY.value(), CY.value()], [0, 0, 1]];
      const proj = (X) => { const p = mv(K, X); return [p[0] / p[2], p[1] / p[2]]; };
      const w = canvas.clientWidth || 480, h = Math.round((w * IH) / IW);
      const ctx = fitCanvas(canvas, w, h);
      const s = w / IW;
      ctx.fillStyle = "#11120f"; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
        const pts = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)].map(proj);
        ctx.fillStyle = (i + j) % 2 ? "#f2efe3" : "#2a2b22";
        ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0] * s, p[1] * s) : ctx.moveTo(p[0] * s, p[1] * s))); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
      const px = CX.value() * s, py = CY.value() * s;
      ctx.beginPath(); ctx.moveTo(px - 10, py); ctx.lineTo(px + 10, py); ctx.moveTo(px, py - 10); ctx.lineTo(px, py + 10); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.font = "12px sans-serif"; ctx.fillText("principal point", px + 12, py - 6);
      mats.innerHTML = matrixHTML("K", K, 0);
    }
    $(root, "[data-action=reset]").addEventListener("click", () => {
      FX.set(600); FY.set(600); CX.set(320); CY.set(240); SK.set(0); draw();
    });
    [FX, FY, CX, CY, SK].forEach((x) => x.set(x.value()));
    draw();
    window.addEventListener("resize", () => setTimeout(draw, 50));
  }

  /* ---------- 5. Lens distortion and undistortion ---------- */
  function distortion() {
    const root = document.getElementById("distortion-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const toggle = $(root, "[data-action=undistort]");
    const gridToggle = $(root, "[data-action=grid]");
    const status = $(root, ".sim__readout");
    let undistorted = false, showGrid = true, src = null, W = 640, H = 360;

    const K1 = slider(root, "k1", schedule, (v) => v.toFixed(2));
    const K2 = slider(root, "k2", schedule, (v) => v.toFixed(2));
    const P1 = slider(root, "p1", schedule, (v) => v.toFixed(3));
    const P2 = slider(root, "p2", schedule, (v) => v.toFixed(3));

    const f = 0.85 * W, cx = W / 2, cy = H / 2;
    function distort(x, y, k1, k2, p1, p2) {
      const r2 = x * x + y * y, rad = 1 + k1 * r2 + k2 * r2 * r2;
      return [x * rad + 2 * p1 * x * y + p2 * (r2 + 2 * x * x), y * rad + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y];
    }
    // Invert the distortion model by fixed-point iteration.
    function undistortPt(xd, yd, k1, k2, p1, p2) {
      let x = xd, y = yd;
      for (let i = 0; i < 8; i++) {
        const r2 = x * x + y * y, rad = 1 + k1 * r2 + k2 * r2 * r2;
        const dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x), dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;
        x = (xd - dx) / rad; y = (yd - dy) / rad;
      }
      return [x, y];
    }

    let timer = null;
    function schedule() { clearTimeout(timer); timer = setTimeout(render, 10); }

    function render() {
      if (!src) return;
      const k1 = K1.value(), k2 = K2.value(), p1 = P1.value(), p2 = P2.value();
      const out = ctx.createImageData(W, H);
      const d = out.data;
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
        let su = u, sv = v;
        if (!undistorted) {
          const [x, y] = undistortPt((u - cx) / f, (v - cy) / f, k1, k2, p1, p2);
          su = x * f + cx; sv = y * f + cy;
        }
        const i = (v * W + u) * 4;
        const ui = Math.round(su), vi = Math.round(sv);
        if (ui < 0 || vi < 0 || ui >= W || vi >= H) { d[i] = d[i + 1] = d[i + 2] = 17; d[i + 3] = 255; continue; }
        const j = (vi * W + ui) * 4;
        d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2]; d[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
      if (showGrid) {
        ctx.strokeStyle = "rgba(247,223,145,0.9)"; ctx.lineWidth = 1.2;
        const line = (pts) => {
          ctx.beginPath();
          pts.forEach(([x, y], k) => {
            const [xd, yd] = undistorted ? [x, y] : distort(x, y, k1, k2, p1, p2);
            const U = xd * f + cx, V = yd * f + cy;
            k ? ctx.lineTo(U, V) : ctx.moveTo(U, V);
          });
          ctx.stroke();
        };
        for (let gx = -8; gx <= 8; gx++) {
          const x = (gx * 40) / f;
          line(Array.from({ length: 41 }, (_, k) => [x, (-H / 2 + (k * H) / 40) / f]));
        }
        for (let gy = -4; gy <= 4; gy++) {
          const y = (gy * 40) / f;
          line(Array.from({ length: 61 }, (_, k) => [(-W / 2 + (k * W) / 60) / f, y]));
        }
      }
      const kind = undistorted ? "Undistorted: straight lines are straight again."
        : k1 < -0.02 ? "Barrel distortion (k₁ < 0): lines bow outward, typical of wide-angle and fisheye lenses."
        : k1 > 0.02 ? "Pincushion distortion (k₁ > 0): lines bow inward, typical of telephoto lenses."
        : "Little radial distortion.";
      status.textContent = kind;
    }

    const img = new Image();
    img.onload = () => {
      W = 640; H = Math.round((640 * img.height) / img.width);
      canvas.width = W; canvas.height = H;
      ctx.drawImage(img, 0, 0, W, H);
      src = ctx.getImageData(0, 0, W, H).data;
      render();
    };
    img.onerror = () => { status.textContent = "The image could not be loaded."; };
    img.src = "media/image-formation/pinhole.jpg";

    toggle.addEventListener("click", () => {
      undistorted = !undistorted;
      toggle.classList.toggle("is-on", undistorted);
      toggle.textContent = undistorted ? "Undistort: on" : "Undistort: off";
      render();
    });
    gridToggle.addEventListener("click", () => {
      showGrid = !showGrid;
      gridToggle.classList.toggle("is-on", showGrid);
      render();
    });
    $(root, "[data-action=reset]").addEventListener("click", () => { K1.set(-0.35); K2.set(0.1); P1.set(0); P2.set(0); render(); });
    [K1, K2, P1, P2].forEach((s) => s.set(s.value()));
  }

  /* ---------- 6. Why calibration needs many views ---------- */
  function coverage() {
    const root = document.getElementById("coverage-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const readout = $(root, ".sim__readout");
    const IW = 640, IH = 480, K = [[600, 0, 320], [0, 600, 240], [0, 0, 1]];
    let views = [];
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    function boardCorners(Rb, tb) {
      const pts = [];
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 5; j++) {
        const Xc = add(mv(Rb, [(i - 4) * 0.04, (j - 2.5) * 0.04, 0]), tb);
        const p = mv(K, Xc);
        pts.push([p[0] / p[2], p[1] / p[2]]);
      }
      return pts;
    }

    function addView() {
      for (let tries = 0; tries < 50; tries++) {
        const Rb = mm(mm(Rz((rand() - 0.5) * 0.8), Ry((rand() - 0.5) * 1.0)), Rx((rand() - 0.5) * 1.0));
        const tb = [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.35, 0.45 + rand() * 0.5];
        const pts = boardCorners(Rb, tb);
        if (pts.every(([u, v]) => u > 5 && v > 5 && u < IW - 5 && v < IH - 5)) {
          const tilt = Math.acos(Math.abs(Rb[2][2])) / deg;
          views.push({ pts, tilt });
          return;
        }
      }
    }

    function draw() {
      const w = canvas.clientWidth || 480, h = Math.round((w * IH) / IW);
      const ctx = fitCanvas(canvas, w, h);
      const s = w / IW;
      ctx.fillStyle = "#11120f"; ctx.fillRect(0, 0, w, h);
      // coverage heat map on a coarse grid
      const G = 8, cov = new Array(G * G).fill(0);
      views.forEach((vw) => vw.pts.forEach(([u, v]) => { cov[Math.min(G - 1, Math.floor((v / IH) * G)) * G + Math.min(G - 1, Math.floor((u / IW) * G))] = 1; }));
      for (let k = 0; k < G * G; k++) {
        if (!cov[k]) continue;
        ctx.fillStyle = "rgba(207,185,125,0.16)";
        ctx.fillRect((k % G) * (w / G), Math.floor(k / G) * (h / G), w / G, h / G);
      }
      views.forEach((vw, n) => {
        ctx.fillStyle = n === views.length - 1 ? GOLD : "rgba(243,239,227,0.55)";
        vw.pts.forEach(([u, v]) => { ctx.beginPath(); ctx.arc(u * s, v * s, 2.2, 0, Math.PI * 2); ctx.fill(); });
      });
      const covered = Math.round((cov.reduce((a, b) => a + b, 0) / (G * G)) * 100);
      const maxTilt = views.reduce((m, v) => Math.max(m, v.tilt), 0);
      const n = views.length;
      let advice;
      if (n < 3) advice = "Zhang's method needs at least three views of a planar board to solve for all five intrinsic parameters.";
      else if (covered < 60) advice = "Keep going: corners near the image edges are what pin down lens distortion.";
      else if (maxTilt < 25) advice = "Add tilted views: a board seen straight on cannot separate focal length from distance.";
      else advice = "A good set: many views, wide coverage and varied tilt. Typical calibrations use 15 to 30 images.";
      readout.innerHTML = `<b>${n}</b> view${n === 1 ? "" : "s"} · <b>${covered}%</b> of the image covered · largest tilt <b>${Math.round(maxTilt)}°</b>. ${advice}`;
    }
    $(root, "[data-action=add]").addEventListener("click", () => { addView(); draw(); });
    $(root, "[data-action=clear]").addEventListener("click", () => { views = []; draw(); });
    addView(); draw();
    window.addEventListener("resize", () => setTimeout(draw, 50));
  }

  function init() {
    cameraViewer(); framesExplorer(); rotationPlayground(); intrinsics(); distortion(); coverage();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
