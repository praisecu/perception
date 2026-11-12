/*
 * Interactive figures for Chapter 7, Single-View Geometry.
 * Each demo looks for its own element id and does nothing if it is absent.
 * Everything runs in the reader's browser; nothing is uploaded.
 */
(() => {
  const MEDIA = "media/single-view/";
  const NS = "http://www.w3.org/2000/svg";
  const $ = (root, sel) => root.querySelector(sel);

  /* ---------- small helpers ---------- */

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

  // Homogeneous helpers
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const lineThrough = (p, q) => cross([p[0], p[1], 1], [q[0], q[1], 1]);
  const fmt = (v, d = 2) => (Math.abs(v) < 5e-10 ? "0" : Number(v).toFixed(d));

  // Draw an infinite line ax + by + c = 0 clipped to a box.
  function clipLine(l, x0, y0, x1, y1) {
    const [a, b, c] = l;
    const pts = [];
    if (Math.abs(b) > 1e-12) {
      for (const x of [x0, x1]) {
        const y = -(a * x + c) / b;
        if (y >= y0 - 1e-6 && y <= y1 + 1e-6) pts.push([x, y]);
      }
    }
    if (Math.abs(a) > 1e-12) {
      for (const y of [y0, y1]) {
        const x = -(b * y + c) / a;
        if (x >= x0 - 1e-6 && x <= x1 + 1e-6) pts.push([x, y]);
      }
    }
    if (pts.length < 2) return null;
    // farthest pair
    let best = [pts[0], pts[1]], d = -1;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const dd = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
        if (dd > d) { d = dd; best = [pts[i], pts[j]]; }
      }
    return best;
  }

  // Pointer dragging of SVG circles. onMove(handle, x, y) receives SVG coords.
  function draggable(svg, handle, onMove) {
    handle.style.cursor = "grab";
    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        onMove(p.x, p.y);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  async function loadJSON(name) {
    const r = await fetch(MEDIA + name);
    if (!r.ok) throw new Error(name);
    return r.json();
  }

  /* ---------- 1. Points and lines in homogeneous coordinates ---------- */
  function lineLab() {
    const root = document.getElementById("line-lab");
    if (!root) return;
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const W = 640, H = 360;
    // math coordinates: origin at the center, y up; drawn with a flip
    const P = { a: [-220, -60], b: [180, 40], c: [-200, 110], d: [200, -90] };
    const layer = el("g", {}, svg);
    const handles = {};
    const toSvg = ([x, y]) => [x + W / 2, H / 2 - y];

    for (const k of Object.keys(P)) {
      handles[k] = el("circle", { r: 11, class: "sv-handle " + (k < "c" ? "sv-gold" : "sv-teal") }, svg);
      draggable(svg, handles[k], (x, y) => {
        P[k] = [Math.max(-W / 2 + 8, Math.min(W / 2 - 8, x - W / 2)), Math.max(-H / 2 + 8, Math.min(H / 2 - 8, H / 2 - y))];
        draw();
      });
    }

    function draw() {
      layer.innerHTML = "";
      el("line", { x1: 0, y1: H / 2, x2: W, y2: H / 2, class: "sv-axis" }, layer);
      el("line", { x1: W / 2, y1: 0, x2: W / 2, y2: H, class: "sv-axis" }, layer);
      const l = lineThrough(P.a, P.b), m = lineThrough(P.c, P.d);
      // convert to svg coordinates for drawing: y_svg = H/2 - y
      for (const [ln, cls] of [[l, "sv-line-gold"], [m, "sv-line-teal"]]) {
        const s = clipLine(ln, -W / 2, -H / 2, W / 2, H / 2);
        if (s) el("line", { x1: s[0][0] + W / 2, y1: H / 2 - s[0][1], x2: s[1][0] + W / 2, y2: H / 2 - s[1][1], class: cls }, layer);
      }
      const x = cross(l, m);
      let text;
      if (Math.abs(x[2]) > 1e-6 * Math.hypot(x[0], x[1])) {
        const ix = x[0] / x[2], iy = x[1] / x[2];
        if (Math.abs(ix) < W / 2 && Math.abs(iy) < H / 2) {
          const [sx, sy] = toSvg([ix, iy]);
          el("circle", { cx: sx, cy: sy, r: 7, class: "sv-meet" }, layer);
        }
        text = `They meet at (${fmt(ix, 1)}, ${fmt(iy, 1)}).`;
      } else {
        text = `w = 0: the lines are parallel and meet at a <b>point at infinity</b> in the direction (${fmt(x[0] / Math.hypot(x[0], x[1]), 3)}, ${fmt(x[1] / Math.hypot(x[0], x[1]), 3)}).`;
      }
      for (const k of Object.keys(P)) {
        const [sx, sy] = toSvg(P[k]);
        handles[k].setAttribute("cx", sx);
        handles[k].setAttribute("cy", sy);
      }
      const n = (v) => { const s = Math.hypot(v[0], v[1]) || 1; return v.map((t) => t / s); };
      const ln = n(l), mn = n(m);
      const big = Math.max(...x.map(Math.abs)) || 1;
      const xn = x.map((v) => v / big);
      readout.innerHTML =
        `<span class="sv-k sv-k--gold">l = a × b = (${fmt(ln[0])}, ${fmt(ln[1])}, ${fmt(ln[2], 1)})</span> ` +
        `<span class="sv-k sv-k--teal">m = c × d = (${fmt(mn[0])}, ${fmt(mn[1])}, ${fmt(mn[2], 1)})</span><br>` +
        `l × m ∝ (${xn.map((v) => fmt(v, 3)).join(", ")}). ${text}`;
    }

    $(root, "[data-action=parallel]").addEventListener("click", () => {
      // make c-d parallel to a-b, keeping its midpoint
      const dx = P.b[0] - P.a[0], dy = P.b[1] - P.a[1];
      const mx = (P.c[0] + P.d[0]) / 2, my = (P.c[1] + P.d[1]) / 2;
      P.c = [mx - dx / 2, my - dy / 2];
      P.d = [mx + dx / 2, my + dy / 2];
      draw();
    });
    draw();
  }

  /* ---------- 2. Vanishing points and the focal length ---------- */
  async function vpLab() {
    const root = document.getElementById("vp-lab");
    if (!root) return;
    let info;
    try { info = await loadJSON("room.json"); } catch { return; }
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const X0 = -220, X1 = 1500, Y0 = 0, Y1 = 720;
    svg.setAttribute("viewBox", `${X0} ${Y0} ${X1 - X0} ${Y1 - Y0}`);
    svg.classList.add("sv-big");
    el("rect", { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, class: "sv-pad" }, svg);
    el("image", { href: MEDIA + "room.jpg", x: 0, y: 0, width: 1280, height: 720 }, svg);
    const layer = el("g", {}, svg);
    const handleLayer = el("g", {}, svg);

    const fams = ["x", "y", "z"];
    const cls = { x: "gold", y: "teal", z: "rose" };
    const truth = JSON.parse(JSON.stringify(info.segments));
    let segs = JSON.parse(JSON.stringify(info.segments));
    const handles = [];
    let showTruth = false;

    fams.forEach((f) => segs[f].forEach((seg, si) => seg.forEach((pt, pi) => {
      const h = el("circle", { r: 13, class: `sv-handle sv-${cls[f]}` }, handleLayer);
      draggable(svg, h, (x, y) => { segs[f][si][pi] = [x, y]; draw(); });
      handles.push({ h, f, si, pi });
    })));

    function vp(f) {
      const [s1, s2] = segs[f];
      return cross(lineThrough(s1[0], s1[1]), lineThrough(s2[0], s2[1]));
    }

    function draw() {
      layer.innerHTML = "";
      const vps = {};
      for (const f of fams) {
        const v = vp(f);
        const finite = Math.abs(v[2]) > 1e-9 * Math.hypot(v[0], v[1]);
        vps[f] = finite ? [v[0] / v[2], v[1] / v[2]] : null;
        for (const seg of segs[f]) {
          const ln = lineThrough(seg[0], seg[1]);
          const s = clipLine(ln, X0, Y0, X1, Y1);
          if (s) el("line", { x1: s[0][0], y1: s[0][1], x2: s[1][0], y2: s[1][1], class: `sv-line-${cls[f]} sv-thin` }, layer);
          el("line", { x1: seg[0][0], y1: seg[0][1], x2: seg[1][0], y2: seg[1][1], class: `sv-line-${cls[f]}` }, layer);
        }
        const p = vps[f];
        if (p && p[0] > X0 && p[0] < X1 && p[1] > Y0 && p[1] < Y1) {
          el("circle", { cx: p[0], cy: p[1], r: 16, class: `sv-vp sv-vp--${cls[f]}` }, layer);
        }
      }
      // horizon: line through the two horizontal vanishing points
      let horizonText = "";
      if (vps.x && vps.y) {
        const hz = lineThrough(vps.x, vps.y);
        const s = clipLine(hz, X0, Y0, X1, Y1);
        if (s) el("line", { x1: s[0][0], y1: s[0][1], x2: s[1][0], y2: s[1][1], class: "sv-horizon" }, layer);
        const tilt = (Math.atan2(vps.x[1] - vps.y[1], vps.x[0] - vps.y[0]) * 180) / Math.PI;
        horizonText = `The horizon (dashed) passes through both, tilted ${fmt(tilt, 1)}°.`;
      }
      if (showTruth) {
        for (const k of ["vp_x", "vp_y"]) el("circle", { cx: info[k][0], cy: info[k][1], r: 6, class: "sv-truth" }, layer);
        el("line", { x1: X0, y1: info.cy, x2: X1, y2: info.cy, class: "sv-truth-line" }, layer);
      }
      for (const { h, f, si, pi } of handles) {
        h.setAttribute("cx", segs[f][si][pi][0]);
        h.setAttribute("cy", segs[f][si][pi][1]);
      }
      // focal length from two orthogonal vanishing points, principal point at the center
      let focal = "";
      if (vps.x && vps.y) {
        const c = [info.cx, info.cy];
        const dot = (vps.x[0] - c[0]) * (vps.y[0] - c[0]) + (vps.x[1] - c[1]) * (vps.y[1] - c[1]);
        focal = dot < 0
          ? `Focal length from the two vanishing points: <b>f ≈ ${fmt(Math.sqrt(-dot), 0)} px</b> (true value ${fmt(info.f_px, 0)} px).`
          : "These two vanishing points cannot come from perpendicular directions: (v₁ − c)·(v₂ − c) must be negative.";
      }
      const vz = vps.z;
      const vertical = !vz || Math.abs(vz[1]) > 2e4
        ? "The vertical lines stay parallel in the image, so their vanishing point is at infinity: the camera is level."
        : `The vertical lines meet at (${fmt(vz[0], 0)}, ${fmt(vz[1], 0)}), so the camera is tilted.`;
      const p = (v) => (v ? `(${fmt(v[0], 0)}, ${fmt(v[1], 0)})` : "at infinity");
      readout.innerHTML =
        `<span class="sv-k sv-k--gold">v<sub>x</sub> = ${p(vps.x)}</span> ` +
        `<span class="sv-k sv-k--teal">v<sub>y</sub> = ${p(vps.y)}</span><br>${horizonText} ${focal}<br>${vertical}`;
    }

    $(root, "[data-action=reset]").addEventListener("click", () => {
      segs = JSON.parse(JSON.stringify(truth)); draw();
    });
    $(root, "[data-action=jitter]").addEventListener("click", () => {
      fams.forEach((f) => segs[f].forEach((seg) => seg.forEach((pt) => {
        pt[0] += (Math.random() - 0.5) * 12; pt[1] += (Math.random() - 0.5) * 12;
      })));
      draw();
    });
    $(root, "[data-action=truth]").addEventListener("click", (e) => {
      showTruth = !showTruth;
      e.currentTarget.classList.toggle("is-on", showTruth);
      draw();
    });
    draw();
  }

  /* ---------- 3. Measuring heights with the horizon ---------- */
  async function heightLab() {
    const root = document.getElementById("height-lab");
    if (!root) return;
    let info;
    try { info = await loadJSON("room.json"); } catch { return; }
    const svg = $(root, "svg");
    svg.setAttribute("viewBox", "0 0 1280 720");
    svg.classList.add("sv-big");
    el("image", { href: MEDIA + "room.jpg", x: 0, y: 0, width: 1280, height: 720 }, svg);
    const layer = el("g", {}, svg);
    const hl = el("g", {}, svg);
    const readout = $(root, ".sim__readout");
    const objs = info.objects;
    const ref = objs["reference box"];
    let horizon = info.cy;
    let targetName = "column";
    // small deliberate offsets so readers adjust the handles themselves
    const pts = {
      rb: [ref.base[0], ref.base[1]], rt: [ref.top[0], ref.top[1]],
      tb: [objs[targetName].base[0] + 3, objs[targetName].base[1] + 4],
      tt: [objs[targetName].top[0] - 2, objs[targetName].top[1] - 6],
    };
    const handles = {};
    for (const k of Object.keys(pts)) {
      handles[k] = el("circle", { r: 12, class: "sv-handle " + (k[0] === "r" ? "sv-gold" : "sv-white") }, hl);
      draggable(svg, handles[k], (x, y) => { pts[k] = [x, y]; draw(); });
    }
    const hHandle = el("rect", { x: 1140, width: 130, height: 46, rx: 23, class: "sv-hz-handle" }, hl);
    const hLabel = el("text", { x: 1205, class: "sv-hz-label" }, hl);
    hLabel.textContent = "horizon";
    hLabel.style.pointerEvents = "none";
    draggable(svg, hHandle, (x, y) => { horizon = Math.max(40, Math.min(680, y)); draw(); });

    function draw() {
      layer.innerHTML = "";
      el("line", { x1: 0, y1: horizon, x2: 1280, y2: horizon, class: "sv-horizon" }, layer);
      el("line", { x1: pts.rb[0], y1: pts.rb[1], x2: pts.rt[0], y2: pts.rt[1], class: "sv-line-gold" }, layer);
      el("line", { x1: pts.tb[0], y1: pts.tb[1], x2: pts.tt[0], y2: pts.tt[1], class: "sv-line-white" }, layer);
      for (const k of Object.keys(pts)) {
        handles[k].setAttribute("cx", pts[k][0]); handles[k].setAttribute("cy", pts[k][1]);
      }
      hHandle.setAttribute("y", horizon - 23);
      hLabel.setAttribute("y", horizon + 9);

      // level camera: H / Hc = (y_base - y_top) / (y_base - y_horizon)
      const cam = (ref.height * (pts.rb[1] - horizon)) / (pts.rb[1] - pts.rt[1]);
      const h = (cam * (pts.tb[1] - pts.tt[1])) / (pts.tb[1] - horizon);
      const truth = objs[targetName].height;
      const err = ((h - truth) / truth) * 100;
      readout.innerHTML =
        `Camera height from the gold reference (0.60 m): <b>${fmt(cam)} m</b> (true ${fmt(info.camera_height)} m).<br>` +
        `Height of the ${targetName}: <b>${fmt(h)} m</b>. ` +
        `<span class="sv-truth-text">True height ${fmt(truth)} m, error ${err >= 0 ? "+" : ""}${fmt(err, 1)}%.</span>`;
    }

    root.querySelectorAll("[data-target]").forEach((b) => b.addEventListener("click", () => {
      targetName = b.dataset.target;
      const o = objs[targetName];
      pts.tb = [o.base[0] + 3, o.base[1] + 4];
      pts.tt = [o.top[0] - 2, o.top[1] - 6];
      root.querySelectorAll("[data-target]").forEach((x) => x.classList.toggle("is-on", x === b));
      draw();
    }));
    draw();
  }

  /* ---------- 4. The cross-ratio survives projection ---------- */
  function crossRatio() {
    const root = document.getElementById("cr-lab");
    if (!root) return;
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const layer = el("g", {}, svg);
    const hl = el("g", {}, svg);
    // world line y = 330; camera center O; image line through I0 at angle
    const world = { y: 330, xs: [90, 220, 330, 520] };
    let O = [330, 40];
    const names = ["A", "B", "C", "D"];
    const handles = world.xs.map((x, i) => {
      const h = el("circle", { r: 11, class: "sv-handle sv-gold" }, hl);
      draggable(svg, h, (px) => {
        const lo = i ? world.xs[i - 1] + 12 : 20, hi = i < 3 ? world.xs[i + 1] - 12 : 620;
        world.xs[i] = Math.max(lo, Math.min(hi, px));
        draw();
      });
      return h;
    });
    const oh = el("circle", { r: 12, class: "sv-handle sv-white" }, hl);
    draggable(svg, oh, (x, y) => { O = [Math.max(30, Math.min(610, x)), Math.max(20, Math.min(150, y))]; draw(); });
    const T = slider(root, "tilt", draw, (v) => v + "°");

    const crossR = (a, b, c, d) => ((c - a) * (d - b)) / ((c - b) * (d - a));

    function draw() {
      layer.innerHTML = "";
      el("line", { x1: 10, y1: world.y, x2: 630, y2: world.y, class: "sv-world" }, layer);
      // image line through (330, 160) with the chosen tilt
      const t = (T.value() * Math.PI) / 180;
      const I0 = [330, 165], dir = [Math.cos(t), Math.sin(t)];
      const imgL = lineThrough(I0, [I0[0] + dir[0], I0[1] + dir[1]]);
      const s = clipLine(imgL, 0, 0, 640, 360);
      if (s) el("line", { x1: s[0][0], y1: s[0][1], x2: s[1][0], y2: s[1][1], class: "sv-imgline" }, layer);
      const proj = [];
      world.xs.forEach((x, i) => {
        const P = [x, world.y];
        const ray = lineThrough(O, P);
        const q = cross(ray, imgL);
        const qp = [q[0] / q[2], q[1] / q[2]];
        proj.push(qp);
        el("line", { x1: O[0], y1: O[1], x2: P[0], y2: P[1], class: "sv-ray" }, layer);
        el("circle", { cx: qp[0], cy: qp[1], r: 6, class: "sv-proj" }, layer);
        const lab = el("text", { x: x, y: world.y + 30, class: "sv-label" }, layer);
        lab.textContent = names[i];
        const lab2 = el("text", { x: qp[0] + 8, y: qp[1] - 10, class: "sv-label sv-label--small" }, layer);
        lab2.textContent = names[i] + "′";
      });
      el("circle", { cx: O[0], cy: O[1], r: 4, class: "sv-center" }, layer);
      world.xs.forEach((x, i) => { handles[i].setAttribute("cx", x); handles[i].setAttribute("cy", world.y); });
      oh.setAttribute("cx", O[0]); oh.setAttribute("cy", O[1]);
      // signed positions along the image line
      const u = proj.map((p) => (p[0] - I0[0]) * dir[0] + (p[1] - I0[1]) * dir[1]);
      const w = world.xs;
      const crW = crossR(...w), crI = crossR(...u);
      readout.innerHTML =
        `Ratio AB/BC in the world: <b>${fmt((w[1] - w[0]) / (w[2] - w[1]))}</b>, in the image: <b>${fmt((u[1] - u[0]) / (u[2] - u[1]))}</b> (changes).<br>` +
        `Cross-ratio in the world: <b>${fmt(crW, 4)}</b>, in the image: <b>${fmt(crI, 4)}</b> (the same).`;
    }
    T.init();
  }

  /* ---------- 5. Forced perspective ---------- */
  async function forcedLab() {
    const root = document.getElementById("forced-lab");
    if (!root) return;
    let info;
    try { info = await loadJSON("forced.json"); } catch { return; }
    const img = $(root, "img");
    const map = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const n = info.camera_xy.length;
    for (let k = 0; k < n; k++) new Image().src = `${MEDIA}forced_${k}.jpg`;
    const layer = el("g", {}, map);
    // map coordinates: x in [-2.5, 2.5] m, y in [-0.5, 7] m
    const sx = (x) => 150 + x * 50, sy = (y) => 380 - y * 50;
    const K = slider(root, "k", draw, (v) => (v === 0 ? "start" : `${(v * 3.5).toFixed(1)}° around`));
    let reveal = false;
    $(root, "[data-action=reveal]").addEventListener("click", (e) => {
      reveal = !reveal;
      e.currentTarget.classList.toggle("is-on", reveal);
      map.classList.toggle("is-hidden", !reveal);
      draw();
    });
    function draw() {
      const k = K.value();
      img.src = `${MEDIA}forced_${k}.jpg`;
      layer.innerHTML = "";
      const c = info.camera_xy[k];
      for (const d of [info.small, info.big]) {
        el("line", { x1: sx(c[0]), y1: sy(c[1]), x2: sx(d.xy[0]), y2: sy(d.xy[1]), class: "sv-ray" }, layer);
        el("rect", { x: sx(d.xy[0]) - d.size * 25, y: sy(d.xy[1]) - d.size * 25, width: d.size * 50, height: d.size * 50, rx: 4, class: "sv-drone" }, layer);
        const t = el("text", { x: sx(d.xy[0]), y: sy(d.xy[1]) - d.size * 25 - 6, class: "sv-label sv-label--small" }, layer);
        t.textContent = `${d.size} m drone`;
      }
      info.camera_xy.forEach((p, i) => el("circle", { cx: sx(p[0]), cy: sy(p[1]), r: i === k ? 7 : 3, class: i === k ? "sv-cam" : "sv-cam sv-cam--past" }, layer));
      const t = el("text", { x: sx(c[0]) + 10, y: sy(c[1]) + 18, class: "sv-label sv-label--small" }, layer);
      t.textContent = "camera";
      readout.innerHTML = k === 0
        ? "From here the two drones look identical. Are they the same size, side by side?"
        : k < n - 1
          ? "As the camera moves, the drones shift by different amounts: <b>parallax</b> reveals that they are at different depths."
          : "The left drone passes in front of the right one. It is nearer, so it must also be smaller.";
    }
    K.init();
  }

  /* ---------- 6. Shape from shading ---------- */
  function shadingLab() {
    const root = document.getElementById("shading-lab");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = 480), H = (canvas.height = 320);
    const readout = $(root, ".sim__readout");
    let flipped = false;
    const A = slider(root, "light", draw, (v) => (v === 0 ? "from above" : v === 180 ? "from below" : v + "°"));
    function draw() {
      const ang = (A.value() * Math.PI) / 180;
      // light direction in the image plane, tilted toward the viewer
      const L = [Math.sin(ang) * 0.75, -Math.cos(ang) * 0.75, 0.66];
      const img = ctx.createImageData(W, H);
      const d = img.data;
      const bumps = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) bumps.push([90 + c * 150, 90 + r * 140, 52, (r + c) % 2 ? -1 : 1]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let n = [0, 0, 1];
        for (const [bx, by, br, sgn] of bumps) {
          const dx = (x - bx) / br, dy = (y - by) / br, rr = dx * dx + dy * dy;
          if (rr < 1) {
            const z = Math.sqrt(1 - rr);
            n = [sgn * dx, sgn * dy, z];
            const s = Math.hypot(...n); n = n.map((v) => v / s);
          }
        }
        const shade = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        const v = 40 + 200 * shade;
        const i = (y * W + x) * 4;
        d[i] = v * 0.98; d[i + 1] = v * 0.93; d[i + 2] = v * 0.82; d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      canvas.classList.toggle("is-flipped", flipped);
      readout.innerHTML = flipped
        ? "The same picture, upside down. Most people now see the bumps as dents and the dents as bumps."
        : "Three of these are bumps and three are dents. Most people decide which is which by assuming the light comes <b>from above</b>.";
    }
    $(root, "[data-action=flip]").addEventListener("click", (e) => {
      flipped = !flipped;
      e.currentTarget.classList.toggle("is-on", flipped);
      draw();
    });
    A.init();
  }

  /* ---------- 7. Metric versus relative depth ---------- */
  async function depthLab() {
    const root = document.getElementById("depth-lab");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const readout = $(root, ".sim__readout");
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    let photo, dimg;
    try { [photo, dimg] = await Promise.all([load(MEDIA + "room.jpg"), load(MEDIA + "room_depth.png")]); } catch { return; }
    const W = (canvas.width = 640), H = (canvas.height = 360);
    const dc = document.createElement("canvas");
    dc.width = dimg.width; dc.height = dimg.height;
    const dctx = dc.getContext("2d", { willReadFrequently: true });
    dctx.drawImage(dimg, 0, 0);
    const raw = dctx.getImageData(0, 0, dc.width, dc.height).data;
    const depth = new Float32Array(dc.width * dc.height);
    let dmin = Infinity, dmax = 0;
    for (let i = 0; i < depth.length; i++) {
      const v = ((raw[i * 4] << 8) | raw[i * 4 + 1]) / 1000;
      depth[i] = v;
      if (v > 0) { dmin = Math.min(dmin, v); dmax = Math.max(dmax, v); }
    }
    let mode = "photo";
    const S = slider(root, "scale", draw, (v) => "× " + Math.pow(2, v).toFixed(2));
    // Perceptually ordered gold-to-teal ramp
    const ramp = (t) => {
      const a = [247, 223, 145], b = [70, 140, 150], c = [20, 30, 45];
      const m = t < 0.5 ? [a, b, t * 2] : [b, c, (t - 0.5) * 2];
      return m[0].map((v, i) => v + (m[1][i] - v) * m[2]);
    };
    let hover = null;

    function draw() {
      if (mode === "photo") {
        ctx.drawImage(photo, 0, 0, W, H);
      } else {
        const img = ctx.createImageData(W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const v = depth[Math.floor((y / H) * dc.height) * dc.width + Math.floor((x / W) * dc.width)];
          const i = (y * W + x) * 4;
          if (v <= 0) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 230; }
          else {
            const c = ramp((v - dmin) / (dmax - dmin));
            img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2];
          }
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      const s = Math.pow(2, S.value());
      let text;
      if (hover) {
        const v = depth[Math.floor(hover[1] * dc.height) * dc.width + Math.floor(hover[0] * dc.width)];
        if (v <= 0) text = "Sky: no surface to measure.";
        else if (mode === "relative") text = `Relative depth here: <b>${fmt((v - dmin) / (dmax - dmin))}</b> (0 nearest, 1 farthest), no units.`;
        else text = `Depth here: <b>${fmt(v * s)} m</b>${s !== 1 ? ` in a world ${fmt(s)} times larger, which looks exactly the same` : ""}.`;
      } else {
        text = "Hover over or tap the picture to read the depth.";
      }
      const scaleText = Math.abs(s - 1) < 1e-3
        ? "Scale × 1: the true room."
        : `Every length × ${fmt(s)}: a room ${s > 1 ? "larger and farther" : "smaller and nearer"} that produces the <b>same picture</b>.`;
      readout.innerHTML = `${text}<br>${scaleText}`;
    }
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      hover = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
      hover = hover.map((v) => Math.min(0.999, Math.max(0, v)));
      readoutOnly();
    });
    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      hover = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height].map((v) => Math.min(0.999, Math.max(0, v)));
      readoutOnly();
    });
    // update the text without repainting the canvas
    function readoutOnly() {
      const s = Math.pow(2, S.value());
      const v = depth[Math.floor(hover[1] * dc.height) * dc.width + Math.floor(hover[0] * dc.width)];
      let text;
      if (v <= 0) text = "Sky: no surface to measure.";
      else if (mode === "relative") text = `Relative depth here: <b>${fmt((v - dmin) / (dmax - dmin))}</b> (0 nearest, 1 farthest), no units.`;
      else text = `Depth here: <b>${fmt(v * s)} m</b>${Math.abs(s - 1) > 1e-3 ? ` in a world ${fmt(s)} times larger, which looks exactly the same` : ""}.`;
      const second = readout.innerHTML.split("<br>")[1] || "";
      readout.innerHTML = `${text}<br>${second}`;
    }    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.mode;
      root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("is-on", x === b));
      draw();
    }));
    $(root, "[data-action=tile]").addEventListener("click", () => {
      S.input.value = 0; S.init();
    });
    S.init();
  }

  function init() {
    lineLab(); vpLab(); heightLab(); crossRatio(); forcedLab(); shadingLab(); depthLab();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
