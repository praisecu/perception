/*
 * Interactive figures for Chapter 6, Curves and Rendering.
 * Each demo initializes by element id and does nothing if it is absent.
 */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const GOLD = "#cfb97d", INK = "#b39a52";
  const $ = (root, sel) => root.querySelector(sel);
  const $$ = (root, sel) => [...root.querySelectorAll(sel)];
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

  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Pointer position in SVG user units
  function svgPoint(svg, evt) {
    const p = svg.createSVGPoint();
    p.x = evt.clientX; p.y = evt.clientY;
    const m = svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  // Make SVG circles draggable; pts is an array of {x, y}
  function draggable(svg, pts, getHandles, onMove) {
    let active = -1;
    svg.addEventListener("pointerdown", (e) => {
      const i = getHandles().indexOf(e.target);
      if (i < 0) return;
      active = i;
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      if (active < 0) return;
      const p = svgPoint(svg, e);
      const vb = svg.viewBox.baseVal;
      pts[active].x = clamp(p.x, vb.x + 6, vb.x + vb.width - 6);
      pts[active].y = clamp(p.y, vb.y + 6, vb.y + vb.height - 6);
      onMove(active);
    });
    const end = () => { active = -1; };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
  }

  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  // de Casteljau: returns all intermediate levels, last level has the point
  function casteljau(pts, t) {
    const levels = [pts];
    while (levels[levels.length - 1].length > 1) {
      const prev = levels[levels.length - 1];
      const next = [];
      for (let i = 0; i < prev.length - 1; i++) next.push(lerp(prev[i], prev[i + 1], t));
      levels.push(next);
    }
    return levels;
  }

  const pathOf = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  /* ---------- 1. Implicit versus parametric ---------- */
  function curveKinds() {
    const root = document.getElementById("curve-kinds");
    if (!root) return;
    const [imp, par] = $$(root, "canvas");
    const S = 260;
    [imp, par].forEach((c) => { c.width = S; c.height = S; });
    const ic = imp.getContext("2d"), pc = par.getContext("2d");
    const readout = $(root, ".sim__readout");
    const scale = S / 3.2; // world units [-1.6, 1.6]
    const toPx = (x, y) => [S / 2 + x * scale, S / 2 - y * scale];
    const toW = (px, py) => [(px - S / 2) / scale, (S / 2 - py) / scale];

    const A = slider(root, "a", draw, (v) => v.toFixed(2));
    const B = slider(root, "b", draw, (v) => v.toFixed(2));
    const T = slider(root, "t", draw, (v) => v.toFixed(2) + " × 2π");
    let probe = null;

    function axes(ctx) {
      ctx.strokeStyle = "rgba(127,127,127,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
    }

    function draw() {
      const a = A.value(), b = B.value(), t = T.value() * 2 * Math.PI;
      // Implicit: color each pixel by the sign of f(x, y)
      const img = ic.createImageData(S, S);
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const [x, y] = toW(px, py);
        const f = (x * x) / (a * a) + (y * y) / (b * b) - 1;
        const i = (py * S + px) * 4;
        const band = Math.abs(f) < 0.03;
        if (band) { img.data[i] = 207; img.data[i + 1] = 185; img.data[i + 2] = 125; }
        else if (f < 0) { img.data[i] = 60; img.data[i + 1] = 120; img.data[i + 2] = 90; }
        else { img.data[i] = 40; img.data[i + 1] = 42; img.data[i + 2] = 36; }
        img.data[i + 3] = 255;
      }
      ic.putImageData(img, 0, 0);
      axes(ic);
      if (probe) {
        const [px, py] = toPx(probe[0], probe[1]);
        ic.fillStyle = "#fff"; ic.beginPath(); ic.arc(px, py, 4, 0, 7); ic.fill();
      }

      // Parametric: trace the curve up to t and mark the point
      pc.fillStyle = "#16170f"; pc.fillRect(0, 0, S, S);
      axes(pc);
      pc.strokeStyle = "rgba(207,185,125,0.25)"; pc.lineWidth = 2;
      pc.beginPath();
      for (let k = 0; k <= 200; k++) {
        const s = (k / 200) * 2 * Math.PI;
        const [px, py] = toPx(a * Math.cos(s), b * Math.sin(s));
        k ? pc.lineTo(px, py) : pc.moveTo(px, py);
      }
      pc.stroke();
      pc.strokeStyle = GOLD; pc.lineWidth = 3; pc.beginPath();
      for (let k = 0; k <= 200; k++) {
        const s = (k / 200) * t;
        const [px, py] = toPx(a * Math.cos(s), b * Math.sin(s));
        k ? pc.lineTo(px, py) : pc.moveTo(px, py);
      }
      pc.stroke();
      const [qx, qy] = toPx(a * Math.cos(t), b * Math.sin(t));
      pc.fillStyle = "#fff"; pc.beginPath(); pc.arc(qx, qy, 6, 0, 7); pc.fill();

      let txt = `Parametric point at t: <b>(${(a * Math.cos(t)).toFixed(2)}, ${(b * Math.sin(t)).toFixed(2)})</b>.`;
      if (probe) {
        const f = (probe[0] ** 2) / (a * a) + (probe[1] ** 2) / (b * b) - 1;
        txt += ` Implicit test at (${probe[0].toFixed(2)}, ${probe[1].toFixed(2)}): f = <b>${f.toFixed(2)}</b>, so the point is <b>${Math.abs(f) < 0.03 ? "on" : f < 0 ? "inside" : "outside"}</b> the curve.`;
      } else {
        txt += " Move over the left panel to test points with the implicit equation.";
      }
      readout.innerHTML = txt;
    }

    imp.addEventListener("pointermove", (e) => {
      const r = imp.getBoundingClientRect();
      probe = toW(((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S);
      draw();
    });
    A.init(); B.init(); T.init();
  }

  /* ---------- 2. Bezier curves and de Casteljau ---------- */
  function bezier() {
    const root = document.getElementById("bezier-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const pool = [
      { x: 70, y: 300 }, { x: 150, y: 70 }, { x: 420, y: 60 }, { x: 560, y: 290 },
      { x: 330, y: 330 }, { x: 250, y: 200 }, { x: 620, y: 120 }
    ];
    let n = 4;
    let pts = pool.slice(0, n).map((p) => ({ ...p }));
    let showBuild = true, split = false, affine = false;
    const T = slider(root, "t", draw, (v) => v.toFixed(2));
    const layer = el("g", {}, svg);
    let handles = [];

    function curve(points, steps = 120) {
      const out = [];
      for (let k = 0; k <= steps; k++) {
        const lv = casteljau(points, k / steps);
        out.push(lv[lv.length - 1][0]);
      }
      return out;
    }

    // A fixed affine map used to show affine invariance
    const M = { a: 0.75, b: -0.35, c: 0.3, d: 0.8, tx: 120, ty: 60 };
    const aff = (p) => ({ x: M.a * p.x + M.b * p.y + M.tx, y: M.c * p.x + M.d * p.y + M.ty });

    function draw() {
      layer.innerHTML = "";
      const t = T.value();
      const levels = casteljau(pts, t);
      const B = levels[levels.length - 1][0];

      el("path", { d: pathOf(pts), class: "cr-poly" }, layer);
      if (split) {
        // The left curve's control points are the first point of each level,
        // the right curve's are the last points, read backwards.
        const left = levels.map((l) => l[0]);
        const right = levels.map((l) => l[l.length - 1]).reverse();
        el("path", { d: pathOf(curve(left)), class: "cr-curve cr-curve--a" }, layer);
        el("path", { d: pathOf(curve(right)), class: "cr-curve cr-curve--b" }, layer);
        el("path", { d: pathOf(left), class: "cr-poly cr-poly--a" }, layer);
        el("path", { d: pathOf(right), class: "cr-poly cr-poly--b" }, layer);
      } else {
        el("path", { d: pathOf(curve(pts)), class: "cr-curve" }, layer);
      }
      if (showBuild) {
        levels.slice(1, -1).forEach((lv, k) => {
          el("path", { d: pathOf(lv), class: "cr-build", style: `opacity:${0.9 - k * 0.12}` }, layer);
          lv.forEach((p) => el("circle", { cx: p.x, cy: p.y, r: 3.5, class: "cr-buildpt" }, layer));
        });
      }
      if (affine) {
        // Transform the control points, then draw the curve; compare with
        // transforming every point of the original curve.
        el("path", { d: pathOf(curve(pts).map(aff)), class: "cr-curve cr-curve--ghost" }, layer);
        el("path", { d: pathOf(curve(pts.map(aff))), class: "cr-curve cr-curve--affine" }, layer);
        el("path", { d: pathOf(pts.map(aff)), class: "cr-poly cr-poly--b" }, layer);
      }
      el("circle", { cx: B.x, cy: B.y, r: 7, class: "cr-onpt" }, layer);
      handles = pts.map((p, i) => {
        const h = el("circle", { cx: p.x, cy: p.y, r: 11, class: "cr-handle" }, layer);
        el("text", { x: p.x, y: p.y - 16, class: "cr-label" }, layer).textContent = `P${i}`;
        return h;
      });
      readout.innerHTML =
        `Degree <b>${pts.length - 1}</b> curve with ${pts.length} control points. ` +
        `B(${t.toFixed(2)}) is found by ${pts.length - 1} rounds of linear interpolation.` +
        (affine ? " The gold and dashed curves coincide: moving the control points moves the curve exactly." : "");
    }

    draggable(svg, pts, () => handles, draw);
    $(root, "[data-act=add]").addEventListener("click", () => {
      if (pts.length >= 7) return;
      pts.push({ ...pool[pts.length] }); draw();
    });
    $(root, "[data-act=remove]").addEventListener("click", () => {
      if (pts.length <= 2) return;
      pts.pop(); draw();
    });
    const toggle = (sel, get, set) => {
      const b = $(root, sel);
      b.addEventListener("click", () => { set(!get()); b.classList.toggle("is-on", get()); draw(); });
      b.classList.toggle("is-on", get());
    };
    toggle("[data-act=build]", () => showBuild, (v) => (showBuild = v));
    toggle("[data-act=split]", () => split, (v) => (split = v));
    toggle("[data-act=affine]", () => affine, (v) => (affine = v));
    T.init();
  }

  /* ---------- 3. B-splines: local control ---------- */
  function bspline() {
    const root = document.getElementById("bspline-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const pts = [
      { x: 40, y: 270 }, { x: 105, y: 90 }, { x: 180, y: 300 }, { x: 255, y: 80 }, { x: 330, y: 290 },
      { x: 405, y: 80 }, { x: 480, y: 300 }, { x: 555, y: 90 }, { x: 625, y: 270 }
    ];
    let degree = 3, last = 1, showBezier = false;
    const layer = el("g", {}, svg);
    let handles = [];

    // Uniform B-spline basis via Cox-de Boor on knots 0..n+p
    function basis(i, p, u, knots) {
      if (p === 0) return knots[i] <= u && u < knots[i + 1] ? 1 : 0;
      const d1 = knots[i + p] - knots[i], d2 = knots[i + p + 1] - knots[i + 1];
      const a = d1 ? ((u - knots[i]) / d1) * basis(i, p - 1, u, knots) : 0;
      const b = d2 ? ((knots[i + p + 1] - u) / d2) * basis(i + 1, p - 1, u, knots) : 0;
      return a + b;
    }

    function splinePoints(p) {
      const n = pts.length;
      const knots = Array.from({ length: n + p + 1 }, (_, i) => i);
      const segs = [];
      for (let s = p; s < n; s++) {
        const seg = [];
        for (let k = 0; k <= 30; k++) {
          const u = s + (k / 30) * 0.9999;
          let x = 0, y = 0;
          for (let i = 0; i < n; i++) {
            const w = basis(i, p, u, knots);
            x += w * pts[i].x; y += w * pts[i].y;
          }
          seg.push({ x, y });
        }
        // segment s depends on control points s - p .. s
        segs.push({ seg, from: s - p, to: s });
      }
      return segs;
    }

    function bezierCurve() {
      const out = [];
      for (let k = 0; k <= 160; k++) { const lv = casteljau(pts, k / 160); out.push(lv[lv.length - 1][0]); }
      return out;
    }

    function draw() {
      layer.innerHTML = "";
      el("path", { d: pathOf(pts), class: "cr-poly" }, layer);
      if (showBezier) el("path", { d: pathOf(bezierCurve()), class: "cr-curve cr-curve--ghost" }, layer);
      const segs = splinePoints(degree);
      let affected = 0;
      segs.forEach(({ seg, from, to }) => {
        const hit = last >= from && last <= to;
        if (hit) affected++;
        el("path", { d: pathOf(seg), class: "cr-curve" + (hit ? " cr-curve--hit" : "") }, layer);
      });
      handles = pts.map((p, i) => {
        const h = el("circle", { cx: p.x, cy: p.y, r: 11, class: "cr-handle" + (i === last ? " cr-handle--last" : "") }, layer);
        el("text", { x: p.x, y: p.y - 16, class: "cr-label" }, layer).textContent = `P${i}`;
        return h;
      });
      const cont = degree === 1 ? "C⁰: corners at the joins" : degree === 2 ? "C¹: smooth tangent, curvature jumps" : "C²: smooth tangent and curvature";
      readout.innerHTML =
        `Degree <b>${degree}</b> B-spline, ${segs.length} pieces, continuity <b>${cont}</b>. ` +
        `Moving P${last} changes only <b>${affected}</b> of the ${segs.length} pieces (highlighted).` +
        (showBezier ? " The dashed single Bezier curve through the same points changes everywhere." : "");
    }

    draggable(svg, pts, () => handles, (i) => { last = i; draw(); });
    $$(root, "[data-degree]").forEach((b) =>
      b.addEventListener("click", () => {
        degree = Number(b.dataset.degree);
        $$(root, "[data-degree]").forEach((x) => x.classList.toggle("is-on", x === b));
        draw();
      })
    );
    const bz = $(root, "[data-act=bezier]");
    bz.addEventListener("click", () => { showBezier = !showBezier; bz.classList.toggle("is-on", showBezier); draw(); });
    draw();
  }

  /* ---------- small 3D helpers ---------- */
  const v3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  };

  function rotateYX(p, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x = cy * p[0] + sy * p[2], z = -sy * p[0] + cy * p[2];
    return [x, cp * p[1] - sp * z, sp * p[1] + cp * z];
  }

  /* ---------- 4. Meshes and normals ---------- */
  function mesh() {
    const root = document.getElementById("mesh-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const S = 320;
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let mode = "flat", yaw = 0.6, pitch = 0.35;
    const R = slider(root, "res", draw, (v) => v);

    function build(res) {
      const V = [], N = [], F = [];
      const rings = res, segs = res * 2;
      for (let i = 0; i <= rings; i++) {
        const th = (i / rings) * Math.PI;
        for (let j = 0; j <= segs; j++) {
          const ph = (j / segs) * 2 * Math.PI;
          // a slightly bumpy "rock" so face normals differ visibly
          const bump = 1 + 0.06 * Math.sin(3 * th) * Math.cos(4 * ph);
          const p = [Math.sin(th) * Math.cos(ph) * bump, Math.cos(th) * bump, Math.sin(th) * Math.sin(ph) * bump];
          V.push(p); N.push([0, 0, 0]);
        }
      }
      const idx = (i, j) => i * (segs + 1) + j;
      for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
        const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
        if (i > 0) F.push([a, b, d]);
        if (i < rings - 1) F.push([b, c, d]);
      }
      // vertex normals: average of adjacent face normals
      F.forEach(([a, b, c]) => {
        const n = v3.cross(v3.sub(V[c], V[a]), v3.sub(V[b], V[a])); // outward
        [a, b, c].forEach((k) => { N[k] = v3.add(N[k], n); });
      });
      for (let k = 0; k < N.length; k++) N[k] = v3.norm(N[k]);
      return { V, N, F };
    }

    function draw() {
      const m = build(R.value());
      const L = v3.norm([-0.5, 0.6, 0.8]);
      const scale = S * 0.36;
      const P = m.V.map((p) => rotateYX(p, yaw, pitch));
      const Nr = m.N.map((n) => rotateYX(n, yaw, pitch));
      const proj = (p) => [S / 2 + p[0] * scale, S / 2 - p[1] * scale, p[2]];
      const Q = P.map(proj);

      const img = ctx.createImageData(S, S);
      const zbuf = new Float32Array(S * S).fill(-Infinity);
      for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 22; img.data[i + 1] = 23; img.data[i + 2] = 15; img.data[i + 3] = 255; }
      if (mode !== "wire") {
        for (const [a, b, c] of m.F) {
          const A = Q[a], B = Q[b], C = Q[c];
          const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
          if (area <= 0) continue; // back face (screen y points down)
          const fn = v3.norm(v3.cross(v3.sub(P[c], P[a]), v3.sub(P[b], P[a])));
          const minx = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxx = Math.min(S - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
          const miny = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxy = Math.min(S - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
          for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area;
            const w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
            const k = y * S + x;
            if (z <= zbuf[k]) continue;
            zbuf[k] = z;
            const n = mode === "flat" ? fn : v3.norm(v3.add(v3.add(v3.mul(Nr[a], w0), v3.mul(Nr[b], w1)), v3.mul(Nr[c], w2)));
            const d = Math.max(0, v3.dot(n, L));
            const lum = 0.12 + 0.88 * d;
            img.data[k * 4] = 207 * lum; img.data[k * 4 + 1] = 185 * lum; img.data[k * 4 + 2] = 125 * lum;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      if (mode === "wire" || mode === "normals") {
        ctx.strokeStyle = mode === "wire" ? GOLD : "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
        for (const [a, b, c] of m.F) {
          const A = Q[a], B = Q[b], C = Q[c];
          const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
          if (mode === "normals" && area <= 0) continue;
          ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.stroke();
        }
      }
      if (mode === "normals") {
        ctx.strokeStyle = "#6fd3ff"; ctx.lineWidth = 1.2;
        P.forEach((p, k) => {
          if (Nr[k][2] < 0.05) return;
          const a = proj(p), b = proj(v3.add(p, v3.mul(Nr[k], 0.18)));
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        });
      }
      readout.innerHTML = `<b>${m.V.length}</b> vertices and <b>${m.F.length}</b> triangles. ` +
        ({ wire: "Wireframe: only the edges of each triangle.",
           flat: "Flat shading: one normal per triangle, so the facets show.",
           smooth: "Smooth shading: vertex normals are interpolated across each triangle, hiding the facets.",
           normals: "Vertex normals (blue): the average direction of the faces around each vertex." })[mode] +
        " Drag to rotate.";
    }

    $$(root, "[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        mode = b.dataset.mode;
        $$(root, "[data-mode]").forEach((x) => x.classList.toggle("is-on", x === b));
        draw();
      })
    );
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY, yaw, pitch]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      yaw = drag[2] + (e.clientX - drag[0]) * 0.01;
      pitch = clamp(drag[3] + (e.clientY - drag[1]) * 0.01, -1.4, 1.4);
      draw();
    });
    canvas.addEventListener("pointerup", () => (drag = null));
    R.init();
  }

  /* ---------- 5. Rasterization and the z-buffer ---------- */
  function raster() {
    const root = document.getElementById("raster-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const W = 28, H = 18, C = 22;
    canvas.width = W * C; canvas.height = H * C;
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    // Two triangles in pixel units with a depth at each vertex (smaller is nearer)
    const tris = [
      { name: "gold", color: [207, 185, 125], v: [[2, 2, 0.8], [24, 4, 0.8], [8, 16, 0.2]] },
      { name: "teal", color: [70, 160, 150], v: [[4, 12, 0.5], [26, 15, 0.5], [18, 1, 0.5]] }
    ];
    let order = [0, 1], useZ = true, view = "color";
    let frags = [], step = 0, timer = null;
    let color, depth;

    function fragments() {
      const out = [];
      for (const ti of order) {
        const [A, B, Cc] = tris[ti].v;
        const area = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((B[0] - px) * (Cc[1] - py) - (B[1] - py) * (Cc[0] - px)) / area;
          const w1 = ((Cc[0] - px) * (A[1] - py) - (Cc[1] - py) * (A[0] - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 >= 0 && w1 >= 0 && w2 >= 0) out.push({ x, y, ti, z: w0 * A[2] + w1 * B[2] + w2 * Cc[2] });
        }
      }
      return out;
    }

    function reset() {
      clearInterval(timer); timer = null;
      frags = fragments(); step = 0;
      color = Array(W * H).fill(null);
      depth = new Float32Array(W * H).fill(1);
      draw(null);
    }

    function apply(f) {
      const k = f.y * W + f.x;
      const pass = !useZ || f.z < depth[k];
      if (pass) { color[k] = f.ti; depth[k] = f.z; }
      return pass;
    }

    function draw(cur, pass) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        let fill;
        if (view === "depth") {
          const g = Math.round(255 * (1 - depth[k]));
          fill = color[k] === null ? "#0d0e0a" : `rgb(${g},${g},${g})`;
        } else {
          const c = color[k] === null ? null : tris[color[k]].color;
          fill = c ? `rgb(${c[0]},${c[1]},${c[2]})` : "#16170f";
        }
        ctx.fillStyle = fill; ctx.fillRect(x * C, y * C, C - 1, C - 1);
      }
      // true triangle outlines
      ctx.lineWidth = 2;
      tris.forEach((t) => {
        ctx.strokeStyle = `rgba(${t.color[0]},${t.color[1]},${t.color[2]},0.9)`;
        ctx.beginPath(); t.v.forEach((p, i) => (i ? ctx.lineTo(p[0] * C, p[1] * C) : ctx.moveTo(p[0] * C, p[1] * C))); ctx.closePath(); ctx.stroke();
      });
      if (cur) {
        ctx.strokeStyle = pass ? "#fff" : "#ff5a5a"; ctx.lineWidth = 3;
        ctx.strokeRect(cur.x * C + 1, cur.y * C + 1, C - 3, C - 3);
        readout.innerHTML = `Pixel (${cur.x}, ${cur.y}) of the <b>${tris[cur.ti].name}</b> triangle, depth ${cur.z.toFixed(2)}: ` +
          (useZ ? (pass ? "nearer than what is stored, so it is written." : "farther than what is stored, so it is <b>discarded</b>.") : "z-test off, so it is written regardless.") +
          ` (${step} of ${frags.length} fragments)`;
      } else {
        readout.innerHTML = `${frags.length} fragments to process. The gold triangle tilts toward the camera; the teal one is flat at depth 0.5.`;
      }
    }

    function next() {
      if (step >= frags.length) { clearInterval(timer); timer = null; return false; }
      const f = frags[step++];
      const pass = apply(f);
      draw(f, pass);
      return true;
    }

    $(root, "[data-act=step]").addEventListener("click", () => next());
    $(root, "[data-act=row]").addEventListener("click", () => { for (let i = 0; i < W && next(); i++); });
    $(root, "[data-act=run]").addEventListener("click", () => {
      if (timer) return;
      timer = setInterval(() => { for (let i = 0; i < 6; i++) if (!next()) break; }, 30);
    });
    $(root, "[data-act=reset]").addEventListener("click", reset);
    const swap = $(root, "[data-act=swap]");
    swap.addEventListener("click", () => { order.reverse(); swap.textContent = `Draw ${tris[order[0]].name} first`; reset(); });
    const zt = $(root, "[data-act=ztest]");
    zt.addEventListener("click", () => { useZ = !useZ; zt.textContent = `Depth test: ${useZ ? "on" : "off"}`; zt.classList.toggle("is-on", useZ); reset(); });
    $$(root, "[data-view]").forEach((b) => b.addEventListener("click", () => {
      view = b.dataset.view;
      $$(root, "[data-view]").forEach((x) => x.classList.toggle("is-on", x === b));
      draw(null);
    }));
    reset();
  }

  /* ---------- 6. Shading playground ---------- */
  function shading() {
    const root = document.getElementById("shading-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const S = 300;
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let light = v3.norm([-0.5, 0.55, 0.65]);
    let model = "phong", bumps = false;
    const Ka = slider(root, "ka", draw, (v) => v.toFixed(2));
    const Kd = slider(root, "kd", draw, (v) => v.toFixed(2));
    const Ks = slider(root, "ks", draw, (v) => v.toFixed(2));
    const Sh = slider(root, "shine", draw, (v) => v);
    const base = [207, 185, 125];
    const viewDir = [0, 0, 1];

    function draw() {
      const img = ctx.createImageData(S, S);
      const ka = Ka.value(), kd = Kd.value(), ks = Ks.value(), sh = Sh.value();
      const r = S * 0.42;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const nx = (x - S / 2) / r, ny = (S / 2 - y) / r;
        const rr = nx * nx + ny * ny;
        if (rr > 1) { img.data[i] = 22; img.data[i + 1] = 23; img.data[i + 2] = 15; img.data[i + 3] = 255; continue; }
        let n = [nx, ny, Math.sqrt(1 - rr)];
        if (bumps) {
          // a procedural normal map: perturb the normal, not the geometry
          const u = Math.atan2(n[0], n[2]) * 6, v = Math.asin(n[1]) * 6;
          n = v3.norm([n[0] + 0.35 * Math.cos(u * 2) * Math.sin(v * 2), n[1] + 0.35 * Math.sin(u * 2) * Math.cos(v * 2), n[2]]);
        }
        const ndl = v3.dot(n, light);
        const diff = Math.max(0, ndl);
        let spec = 0;
        if (ndl > 0 && model !== "lambert") {
          if (model === "phong") {
            const rdir = v3.sub(v3.mul(n, 2 * ndl), light);
            spec = Math.pow(Math.max(0, v3.dot(rdir, viewDir)), sh);
          } else {
            const h = v3.norm(v3.add(light, viewDir));
            spec = Math.pow(Math.max(0, v3.dot(n, h)), sh * 4);
          }
        }
        for (let c = 0; c < 3; c++) {
          img.data[i + c] = clamp(base[c] * (ka + kd * diff) + 255 * ks * spec, 0, 255);
        }
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      // light direction marker
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(S / 2 + light[0] * r, S / 2 - light[1] * r, 8, 0, 7); ctx.fill(); ctx.stroke();
      readout.innerHTML =
        `${({ lambert: "Lambert", phong: "Phong", blinn: "Blinn-Phong" })[model]}: brightness = ` +
        `k<sub>a</sub> + k<sub>d</sub> max(0, n·l)` + (model === "lambert" ? "" : ` + k<sub>s</sub> (${model === "phong" ? "r·v" : "n·h"})<sup>α</sup>`) +
        `. Drag on the sphere to move the light.` + (bumps ? " The bumps come only from the normal map; the outline is still a perfect circle." : "");
    }

    function setLight(e) {
      const rect = canvas.getBoundingClientRect();
      const r = S * 0.42;
      let x = ((e.clientX - rect.left) / rect.width * S - S / 2) / r;
      let y = (S / 2 - (e.clientY - rect.top) / rect.height * S) / r;
      const d = Math.hypot(x, y);
      if (d > 0.98) { x *= 0.98 / d; y *= 0.98 / d; }
      light = v3.norm([x, y, Math.sqrt(Math.max(0.0004, 1 - x * x - y * y))]);
      draw();
    }
    let down = false;
    canvas.addEventListener("pointerdown", (e) => { down = true; canvas.setPointerCapture(e.pointerId); setLight(e); });
    canvas.addEventListener("pointermove", (e) => { if (down) setLight(e); });
    canvas.addEventListener("pointerup", () => (down = false));
    $$(root, "[data-model]").forEach((b) => b.addEventListener("click", () => {
      model = b.dataset.model;
      $$(root, "[data-model]").forEach((x) => x.classList.toggle("is-on", x === b));
      draw();
    }));
    const bb = $(root, "[data-act=bumps]");
    bb.addEventListener("click", () => { bumps = !bumps; bb.classList.toggle("is-on", bumps); draw(); });
    Ka.init(); Kd.init(); Ks.init(); Sh.init();
  }

  /* ---------- 7. Ray casting, step by step ---------- */
  function raycast() {
    const root = document.getElementById("raycast-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const strip = $(root, "canvas");
    const readout = $(root, ".sim__readout");
    const N = 24;
    strip.width = N * 20; strip.height = 22;
    const sctx = strip.getContext("2d");
    const layer = el("g", {}, svg);
    const cam = { x: 330, y: 360 };
    const imgY = 250, imgX0 = 270, imgX1 = 390;
    const lightP = { x: 110, y: 235 };
    const spheres = [
      { x: 250, y: 150, r: 48, color: [207, 185, 125], mirror: 0 },
      { x: 420, y: 120, r: 60, color: [70, 160, 150], mirror: 0 },
      { x: 330, y: 40, r: 26, color: [190, 90, 80], mirror: 0 }
    ];
    const mirror = { y: 18, x0: 120, x1: 560 }; // a mirror along the top edge
    let k = 0, bounces = 1;
    let pixels = Array(N).fill(null);
    const B = slider(root, "bounces", () => { reset(); }, (v) => v);

    function hit(o, d) {
      let best = null;
      spheres.forEach((s, i) => {
        const oc = { x: o.x - s.x, y: o.y - s.y };
        const b = oc.x * d.x + oc.y * d.y, c = oc.x * oc.x + oc.y * oc.y - s.r * s.r;
        const disc = b * b - c;
        if (disc < 0) return;
        const t = -b - Math.sqrt(disc);
        if (t > 0.5 && (!best || t < best.t)) {
          const p = { x: o.x + d.x * t, y: o.y + d.y * t };
          best = { t, p, n: { x: (p.x - s.x) / s.r, y: (p.y - s.y) / s.r }, obj: i };
        }
      });
      if (d.y < 0) {
        const t = (mirror.y - o.y) / d.y;
        const px = o.x + d.x * t;
        if (t > 0.5 && px > mirror.x0 && px < mirror.x1 && (!best || t < best.t)) {
          best = { t, p: { x: px, y: mirror.y }, n: { x: 0, y: 1 }, obj: "mirror" };
        }
      }
      return best;
    }

    // Returns color and the list of segments for drawing
    function trace(o, d, depth, segs) {
      const h = hit(o, d);
      if (!h) { segs.push({ a: o, b: { x: o.x + d.x * 600, y: o.y + d.y * 600 }, kind: "miss" }); return [26, 27, 20]; }
      segs.push({ a: o, b: h.p, kind: depth === 0 ? "primary" : "bounce" });
      if (h.obj === "mirror") {
        if (depth >= bounces) return [60, 60, 60];
        const dn = d.x * h.n.x + d.y * h.n.y;
        const r = { x: d.x - 2 * dn * h.n.x, y: d.y - 2 * dn * h.n.y };
        const c = trace(h.p, r, depth + 1, segs);
        return c.map((v) => v * 0.85);
      }
      const s = spheres[h.obj];
      const l = { x: lightP.x - h.p.x, y: lightP.y - h.p.y };
      const ll = Math.hypot(l.x, l.y);
      const ld = { x: l.x / ll, y: l.y / ll };
      const blocker = hit({ x: h.p.x + h.n.x, y: h.p.y + h.n.y }, ld);
      const shadow = blocker && blocker.obj !== "mirror" && blocker.t < ll;
      segs.push({ a: h.p, b: shadow ? blocker.p : lightP, kind: shadow ? "shadow-blocked" : "shadow" });
      const diff = shadow ? 0 : Math.max(0, h.n.x * ld.x + h.n.y * ld.y);
      return s.color.map((v) => v * (0.18 + 0.82 * diff));
    }

    function reset() { k = 0; pixels = Array(N).fill(null); bounces = B.value(); draw(null); }

    function rayFor(i) {
      const px = imgX0 + ((i + 0.5) / N) * (imgX1 - imgX0);
      const d = { x: px - cam.x, y: imgY - cam.y };
      const l = Math.hypot(d.x, d.y);
      return { d: { x: d.x / l, y: d.y / l }, px };
    }

    function draw(segs) {
      layer.innerHTML = "";
      el("line", { x1: mirror.x0, y1: mirror.y, x2: mirror.x1, y2: mirror.y, class: "rc-mirror" }, layer);
      el("text", { x: mirror.x1 - 4, y: mirror.y + 16, class: "cr-label", "text-anchor": "end" }, layer).textContent = "mirror";
      spheres.forEach((s) => el("circle", { cx: s.x, cy: s.y, r: s.r, fill: `rgb(${s.color})`, class: "rc-obj" }, layer));
      el("circle", { cx: lightP.x, cy: lightP.y, r: 10, class: "rc-light" }, layer);
      el("text", { x: lightP.x, y: lightP.y - 16, class: "cr-label" }, layer).textContent = "light";
      el("line", { x1: imgX0, y1: imgY, x2: imgX1, y2: imgY, class: "rc-plane" }, layer);
      el("circle", { cx: cam.x, cy: cam.y, r: 6, class: "rc-cam" }, layer);
      el("text", { x: cam.x, y: cam.y + 22, class: "cr-label" }, layer).textContent = "camera";
      (segs || []).forEach((s) => el("line", { x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, class: "rc-ray rc-ray--" + s.kind }, layer));
      sctx.fillStyle = "#0d0e0a"; sctx.fillRect(0, 0, strip.width, strip.height);
      pixels.forEach((c, i) => {
        if (!c) return;
        sctx.fillStyle = `rgb(${c.map(Math.round)})`;
        sctx.fillRect(i * 20 + 1, 1, 18, 20);
      });
      if (k > 0 && k <= N) { sctx.strokeStyle = "#fff"; sctx.lineWidth = 2; sctx.strokeRect((k - 1) * 20 + 1, 1, 18, 20); }
    }

    function next() {
      if (k >= N) return false;
      const { d } = rayFor(k);
      const segs = [];
      pixels[k] = trace(cam, d, 0, segs);
      k++;
      draw(segs);
      const kinds = segs.map((s) => s.kind);
      readout.innerHTML = `Ray ${k} of ${N}: ` +
        (kinds[0] === "miss" ? "misses everything, so the pixel gets the background." :
          `hits ${kinds.includes("bounce") ? "the mirror, bounces, then hits an object" : "an object"}; a shadow ray toward the light is ` +
          (kinds.includes("shadow-blocked") ? "<b>blocked</b>, so the point is in shadow." : "clear, so the point is lit."));
      return true;
    }

    $(root, "[data-act=next]").addEventListener("click", next);
    $(root, "[data-act=all]").addEventListener("click", () => {
      while (k < N) { const { d } = rayFor(k); pixels[k] = trace(cam, d, 0, []); k++; }
      draw(null);
      readout.textContent = "All rays traced. Each pixel's color came from following one ray into the scene.";
    });
    $(root, "[data-act=reset]").addEventListener("click", reset);
    B.init();
    readout.textContent = "Press Next ray to follow one ray from the camera through a pixel.";
  }

  /* ---------- 8. What a renderer computes (Blender passes) ---------- */
  function passes() {
    const root = document.getElementById("passes-sim");
    if (!root) return;
    const stage = $(root, ".cr-wipe");
    const [under, over] = $$(stage, "img");
    const handle = $(stage, ".cr-wipe__handle");
    const readout = $(root, ".sim__readout");
    const base = "media/curves-rendering/";
    const names = { final: "Final render", shading: "Shading only", normals: "Surface normals", depth: "Depth", mesh: "Mesh" };
    let left = "mesh", right = "final", pos = 0.5;
    ["final", "shading", "normals", "depth", "mesh"].forEach((n) => { new Image().src = base + n + ".jpg"; });

    function show() {
      under.src = base + right + ".jpg";
      over.src = base + left + ".jpg";
      over.style.clipPath = `inset(0 ${(1 - pos) * 100}% 0 0)`;
      handle.style.left = pos * 100 + "%";
      $$(root, "[data-left]").forEach((b) => b.classList.toggle("is-on", b.dataset.left === left));
      $$(root, "[data-right]").forEach((b) => b.classList.toggle("is-on", b.dataset.right === right));
      readout.innerHTML = `Left: <b>${names[left]}</b>. Right: <b>${names[right]}</b>. Drag across the image to compare.`;
    }
    $$(root, "[data-left]").forEach((b) => b.addEventListener("click", () => { left = b.dataset.left; show(); }));
    $$(root, "[data-right]").forEach((b) => b.addEventListener("click", () => { right = b.dataset.right; show(); }));
    let down = false;
    const move = (e) => {
      const r = stage.getBoundingClientRect();
      pos = clamp((e.clientX - r.left) / r.width, 0, 1);
      show();
    };
    stage.addEventListener("pointerdown", (e) => { down = true; stage.setPointerCapture(e.pointerId); move(e); });
    stage.addEventListener("pointermove", (e) => { if (down) move(e); });
    stage.addEventListener("pointerup", () => (down = false));
    show();
  }

  function init() {
    curveKinds(); bezier(); bspline(); mesh(); raster(); shading(); raycast(); passes();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
