/*
 * Interactive figures for Chapter 3, Features.
 * Each demo looks for its own element id and does nothing if it is absent.
 * Everything runs in the reader's browser; nothing is uploaded.
 */
(() => {
  const MEDIA = "media/";
  const $ = (root, sel) => root.querySelector(sel);
  const later = (fn) => setTimeout(fn, 0);

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

  /* ---------- Small image-processing toolkit on Float32 grayscale ---------- */

  // Draw an image into a W x H grayscale array in [0, 1].
  function grayFrom(img, W, H) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const g = new Float32Array(W * H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    return g;
  }

  // Convolve with a 3x3 kernel (border pixels clamp to the edge).
  function conv3(src, W, H, k) {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(H - 1, Math.max(0, y + j));
        for (let i = -1; i <= 1; i++) {
          const xx = Math.min(W - 1, Math.max(0, x + i));
          s += k[(j + 1) * 3 + (i + 1)] * src[yy * W + xx];
        }
      }
      out[y * W + x] = s;
    }
    return out;
  }

  // Separable Gaussian blur.
  function gauss(src, W, H, sigma) {
    if (sigma < 0.3) return Float32Array.from(src);
    const r = Math.ceil(3 * sigma);
    const k = new Float32Array(2 * r + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * src[y * W + Math.min(W - 1, Math.max(0, x + i))];
      tmp[y * W + x] = s;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(H - 1, Math.max(0, y + i)) * W + x];
      out[y * W + x] = s;
    }
    return out;
  }

  const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  // Paint a float array to a canvas. mode: "gray" maps [lo, hi]; "signed" maps 0 to mid-gray.
  function paint(canvas, a, W, H, mode = "gray", lo = 0, hi = 1) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const im = ctx.createImageData(W, H);
    for (let i = 0; i < a.length; i++) {
      let v;
      if (mode === "signed") v = 128 + (a[i] / hi) * 127;
      else v = ((a[i] - lo) / (hi - lo || 1)) * 255;
      v = Math.max(0, Math.min(255, v));
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
      im.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return ctx;
  }

  // Map a pointer event to pixel coordinates of a canvas drawn at any CSS size.
  function pixelAt(canvas, ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width - 1, Math.floor(((ev.clientX - r.left) / r.width) * canvas.width))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.floor(((ev.clientY - r.top) / r.height) * canvas.height)))
    };
  }

  /* ---------- 1. Convolution playground ---------- */
  async function convolution() {
    const root = document.getElementById("conv-sim");
    if (!root) return;
    const [inCanvas, outCanvas] = root.querySelectorAll("canvas");
    const cells = [...root.querySelectorAll(".kernel input")];
    const readout = $(root, ".sim__readout");
    let img;
    try { img = await loadImage(MEDIA + "features/view_a.jpg"); } catch { return; }
    const W = 400, H = 225;
    const g = grayFrom(img, W, H);
    paint(inCanvas, g, W, H);

    const presets = {
      identity: [[0, 0, 0, 0, 1, 0, 0, 0, 0], "Leaves the image unchanged."],
      box: [[1, 1, 1, 1, 1, 1, 1, 1, 1].map((v) => +(v / 9).toFixed(3)), "Box blur: every output pixel is the average of its 3 × 3 neighbourhood."],
      gauss: [[1, 2, 1, 2, 4, 2, 1, 2, 1].map((v) => v / 16), "Gaussian blur: nearby pixels count more than distant ones."],
      sharpen: [[0, -1, 0, -1, 5, -1, 0, -1, 0], "Sharpen: the pixel minus its neighbours, added back to itself."],
      sobelx: [SOBEL_X, "Sobel x: responds to vertical edges, where brightness changes from left to right."],
      sobely: [SOBEL_Y, "Sobel y: responds to horizontal edges, where brightness changes from top to bottom."],
      laplacian: [[0, 1, 0, 1, -4, 1, 0, 1, 0], "Laplacian: a second derivative that is zero on flat regions and ramps."]
    };

    function apply(note) {
      const k = cells.map((c) => Number(c.value) || 0);
      const out = conv3(g, W, H, k);
      const sum = k.reduce((a, b) => a + b, 0);
      if (Math.abs(sum) < 1e-6) {
        let m = 1e-6; for (const v of out) m = Math.max(m, Math.abs(v));
        paint(outCanvas, out, W, H, "signed", 0, m);
      } else {
        paint(outCanvas, out, W, H, "gray", 0, 1);
      }
      readout.innerHTML = (note ? note + " " : "") +
        `Kernel sum: <b>${+sum.toFixed(3)}</b>${Math.abs(sum) < 1e-6 ? " (a derivative filter: gray means zero, light and dark mean positive and negative)" : Math.abs(sum - 1) < 1e-3 ? " (overall brightness is preserved)" : " (overall brightness changes)"}.`;
    }

    root.querySelectorAll("[data-kernel]").forEach((b) =>
      b.addEventListener("click", () => {
        const [k, note] = presets[b.dataset.kernel];
        cells.forEach((c, i) => (c.value = +(+k[i]).toFixed(3)));
        root.querySelectorAll("[data-kernel]").forEach((x) => x.classList.toggle("is-on", x === b));
        later(() => apply(note));
      })
    );
    cells.forEach((c) => c.addEventListener("input", () => {
      root.querySelectorAll("[data-kernel]").forEach((x) => x.classList.remove("is-on"));
      later(() => apply("Custom kernel."));
    }));
    $(root, '[data-kernel="sharpen"]').click();
  }

  /* ---------- 2. Convolution, one step at a time ---------- */
  function convolutionSteps() {
    const root = document.getElementById("conv-step");
    if (!root) return;
    const inputGrid = $(root, ".grid--input");
    const kernelGrid = $(root, ".grid--kernel");
    const outputGrid = $(root, ".grid--output");
    const calc = $(root, ".sim__readout");
    const N = 7, M = N - 2;
    // A dark region on the left meets a bright region on the right, with one bright speck.
    const I = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) I.push(x < 3 ? 1 : 8);
    I[2 * N + 1] = 9;
    const kernels = {
      box: { k: [1, 1, 1, 1, 1, 1, 1, 1, 1], scale: 9, label: "Box blur (÷ 9)" },
      sobelx: { k: SOBEL_X, scale: 1, label: "Sobel x" },
      sharpen: { k: [0, -1, 0, -1, 5, -1, 0, -1, 0], scale: 1, label: "Sharpen" }
    };
    let current = "sobelx", step = -1, timer = null;

    function build(grid, n, values) {
      grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
      grid.innerHTML = values.map((v) => `<span>${v}</span>`).join("");
    }

    function render() {
      const { k, scale } = kernels[current];
      build(inputGrid, N, I);
      build(kernelGrid, 3, k);
      const outVals = Array(M * M).fill("");
      for (let s = 0; s <= step && s < M * M; s++) {
        const ox = s % M, oy = Math.floor(s / M);
        let sum = 0;
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) sum += k[j * 3 + i] * I[(oy + j) * N + ox + i];
        outVals[s] = +(sum / scale).toFixed(1);
      }
      build(outputGrid, M, outVals);
      if (step < 0) {
        calc.innerHTML = "Press <b>Next</b> to slide the kernel over the image one position at a time.";
        return;
      }
      const ox = step % M, oy = Math.floor(step / M);
      const spans = inputGrid.children;
      const terms = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        spans[(oy + j) * N + ox + i].classList.add("is-window");
        terms.push(`${k[j * 3 + i]}×${I[(oy + j) * N + ox + i]}`);
      }
      outputGrid.children[step].classList.add("is-current");
      calc.innerHTML = `Output (${ox}, ${oy}) = ${scale > 1 ? "(" : ""}${terms.join(" + ").replace(/\+ -/g, "− ").replace(/^-/, "−")}${scale > 1 ? `) ÷ ${scale}` : ""} = <b>${outVals[step]}</b>`;
    }

    root.querySelectorAll("[data-steps-kernel]").forEach((b) =>
      b.addEventListener("click", () => {
        current = b.dataset.stepsKernel; step = -1;
        root.querySelectorAll("[data-steps-kernel]").forEach((x) => x.classList.toggle("is-on", x === b));
        render();
      })
    );
    $(root, "[data-step=next]").addEventListener("click", () => { step = Math.min(M * M - 1, step + 1); render(); });
    $(root, "[data-step=prev]").addEventListener("click", () => { step = Math.max(-1, step - 1); render(); });
    $(root, "[data-step=play]").addEventListener("click", (e) => {
      if (timer) { clearInterval(timer); timer = null; e.target.textContent = "Play"; return; }
      e.target.textContent = "Pause";
      if (step >= M * M - 1) step = -1;
      timer = setInterval(() => {
        step++; render();
        if (step >= M * M - 1) { clearInterval(timer); timer = null; e.target.textContent = "Play"; }
      }, 450);
    });
    render();
  }

  /* ---------- 3. Gradient explorer ---------- */
  async function gradients() {
    const root = document.getElementById("grad-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const readout = $(root, ".sim__readout");
    let img;
    try { img = await loadImage(MEDIA + "features/view_a.jpg"); } catch { return; }
    const W = 400, H = 225;
    const g = gauss(grayFrom(img, W, H), W, H, 1);
    const ix = conv3(g, W, H, SOBEL_X), iy = conv3(g, W, H, SOBEL_Y);
    const mag = new Float32Array(W * H);
    let mmax = 1e-6;
    for (let i = 0; i < mag.length; i++) { mag[i] = Math.hypot(ix[i], iy[i]); mmax = Math.max(mmax, mag[i]); }
    let mode = "image", pick = { x: 288, y: 64 };

    function draw() {
      let ctx;
      if (mode === "image") ctx = paint(canvas, g, W, H);
      else if (mode === "mag") ctx = paint(canvas, mag, W, H, "gray", 0, mmax * 0.6);
      else {
        // orientation as hue, strength as brightness
        canvas.width = W; canvas.height = H;
        ctx = canvas.getContext("2d");
        const im = ctx.createImageData(W, H);
        for (let i = 0; i < mag.length; i++) {
          const h = (Math.atan2(iy[i], ix[i]) + Math.PI) / (2 * Math.PI);
          const v = Math.min(1, mag[i] / (mmax * 0.4));
          const [r, gg, b] = hsv(h, 0.85, v);
          im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(im, 0, 0);
      }
      // arrow at the picked pixel
      const k = pick.y * W + pick.x;
      const m = mag[k], len = 10 + 40 * Math.min(1, m / (mmax * 0.5));
      const ux = m > 1e-6 ? ix[k] / m : 0, uy = m > 1e-6 ? iy[k] / m : 0;
      ctx.strokeStyle = "#ff3b30"; ctx.fillStyle = "#ff3b30"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(pick.x, pick.y, 4, 0, Math.PI * 2); ctx.fill();
      if (m > 1e-4) {
        const ex = pick.x + ux * len, ey = pick.y + uy * len;
        ctx.beginPath(); ctx.moveTo(pick.x, pick.y); ctx.lineTo(ex, ey); ctx.stroke();
        const a = Math.atan2(uy, ux);
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 9 * Math.cos(a - 0.4), ey - 9 * Math.sin(a - 0.4));
        ctx.lineTo(ex - 9 * Math.cos(a + 0.4), ey - 9 * Math.sin(a + 0.4));
        ctx.closePath(); ctx.fill();
      }
      const deg = (Math.atan2(iy[k], ix[k]) * 180) / Math.PI;
      readout.innerHTML =
        `Pixel (${pick.x}, ${pick.y}): <b>I<sub>x</sub> = ${ix[k].toFixed(2)}</b>, <b>I<sub>y</sub> = ${iy[k].toFixed(2)}</b>, ` +
        `magnitude <b>${m.toFixed(2)}</b>, direction <b>${deg.toFixed(0)}°</b>. ` +
        (m < mmax * 0.05 ? "Almost flat here." : "The arrow points toward brighter pixels, across the edge.");
    }

    function hsv(h, s, v) {
      const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
      const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
      return [r * 255, g * 255, b * 255];
    }

    const move = (ev) => { pick = pixelAt(canvas, ev); draw(); };
    canvas.addEventListener("pointerdown", (ev) => { move(ev); canvas.setPointerCapture(ev.pointerId); });
    canvas.addEventListener("pointermove", (ev) => { if (ev.buttons || ev.pointerType === "mouse") move(ev); });
    root.querySelectorAll("[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        mode = b.dataset.view;
        root.querySelectorAll("[data-view]").forEach((x) => x.classList.toggle("is-on", x === b));
        draw();
      })
    );
    draw();
  }

  /* ---------- 4. Harris: what does a patch see? ---------- */
  function harrisPatch() {
    const root = document.getElementById("harris-patch");
    if (!root) return;
    const [scene, plot] = root.querySelectorAll("canvas");
    const readout = $(root, ".sim__readout");
    const W = 360, H = 220, P = 15; // patch half size
    // A synthetic scene: a dark square and a tilted triangle on a light background.
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const cx = c.getContext("2d");
    cx.fillStyle = "#e8e4d6"; cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#2b2b22"; cx.fillRect(50, 50, 110, 110);
    cx.beginPath(); cx.moveTo(220, 170); cx.lineTo(320, 150); cx.lineTo(250, 50); cx.closePath(); cx.fill();
    const g = gauss(grayFrom(c, W, H), W, H, 1);
    const ix = conv3(g, W, H, SOBEL_X), iy = conv3(g, W, H, SOBEL_Y);
    let pos = { x: 160, y: 160 };

    function tensor(px, py) {
      let a = 0, b = 0, d = 0, wsum = 0;
      for (let y = -P; y <= P; y++) for (let x = -P; x <= P; x++) {
        const xx = px + x, yy = py + y;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const w = Math.exp(-(x * x + y * y) / (2 * (P / 2) ** 2));
        const k = yy * W + xx;
        a += w * ix[k] * ix[k]; b += w * ix[k] * iy[k]; d += w * iy[k] * iy[k]; wsum += w;
      }
      return [a / wsum, b / wsum, d / wsum];
    }

    function draw() {
      const ctx = paint(scene, g, W, H);
      const [a, b, d] = tensor(pos.x, pos.y);
      const tr = a + d, det = a * d - b * b;
      const disc = Math.sqrt(Math.max(0, ((a - d) / 2) ** 2 + b * b));
      const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
      const theta = 0.5 * Math.atan2(2 * b, a - d);
      const T = 0.02; // "large" eigenvalue threshold for this scene
      const kind = l1 < T ? "flat" : l2 < T * 0.25 ? "edge" : "corner";
      const color = kind === "corner" ? "#2fbf71" : kind === "edge" ? "#f0a030" : "#7aa7ff";
      // patch and change ellipse (long axis = direction of largest intensity change)
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.strokeRect(pos.x - P, pos.y - P, 2 * P + 1, 2 * P + 1);
      const s = 12 / Math.sqrt(T);
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(theta);
      ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1.5, Math.min(P * 2.2, s * Math.sqrt(l1))), Math.max(1.5, Math.min(P * 2.2, s * Math.sqrt(l2))), 0, 0, Math.PI * 2);
      ctx.stroke(); ctx.restore();

      // eigenvalue plane
      const S = 200;
      plot.width = S; plot.height = S;
      const p = plot.getContext("2d");
      // x = larger eigenvalue, y = smaller one (so only the lower triangle is reachable)
      const max = 0.5, to = (v) => Math.min(S - 10, 10 + Math.sqrt(Math.max(0, v) / max) * (S - 20)); // square-root axes
      const X = to(T), Y = S - to(T * 0.25);
      p.fillStyle = "rgba(122,167,255,0.22)"; p.fillRect(10, 10, X - 10, S - 20);       // flat
      p.fillStyle = "rgba(240,160,48,0.22)"; p.fillRect(X, Y, S - 10 - X, S - 10 - Y);  // edge
      p.fillStyle = "rgba(47,191,113,0.22)"; p.fillRect(X, 10, S - 10 - X, Y - 10);     // corner
      p.strokeStyle = "rgba(128,128,128,0.8)"; p.lineWidth = 1;
      p.beginPath(); p.moveTo(10, 10); p.lineTo(10, S - 10); p.lineTo(S - 10, S - 10); p.stroke();
      p.fillStyle = "rgba(128,128,128,0.95)"; p.font = "12px sans-serif";
      p.fillText("λ₁", S - 24, S - 14); p.fillText("λ₂", 14, 22);
      p.fillText("flat", 16, S - 16); p.fillText("edge", S - 52, S - 26); p.fillText("corner", S - 62, 30);
      p.fillStyle = color;
      p.beginPath(); p.arc(to(l1), S - to(l2), 6, 0, Math.PI * 2); p.fill();

      const R = det - 0.05 * tr * tr;
      readout.innerHTML = `λ₁ = <b>${l1.toFixed(3)}</b>, λ₂ = <b>${l2.toFixed(3)}</b>, Harris response R = <b>${R.toFixed(4)}</b>. ` +
        `This patch is <b style="color:${color}">${kind === "flat" ? "flat: shifting it changes nothing" : kind === "edge" ? "an edge: it changes in one direction only" : "a corner: it changes in every direction"}</b>.`;
    }

    const move = (ev) => {
      const q = pixelAt(scene, ev);
      pos = { x: Math.max(P, Math.min(W - P - 1, q.x)), y: Math.max(P, Math.min(H - P - 1, q.y)) };
      draw();
    };
    scene.addEventListener("pointerdown", (ev) => { move(ev); scene.setPointerCapture(ev.pointerId); });
    scene.addEventListener("pointermove", (ev) => { if (ev.buttons) move(ev); });
    draw();
  }

  /* ---------- 5. Harris corners on a rendered scene ---------- */
  async function harrisCorners() {
    const root = document.getElementById("harris-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const readout = $(root, ".sim__readout");
    let img;
    try { img = await loadImage(MEDIA + "features/view_b.jpg"); } catch { return; }
    const W = 480, H = 270;
    const g = gauss(grayFrom(img, W, H), W, H, 0.8);
    const ix = conv3(g, W, H, SOBEL_X), iy = conv3(g, W, H, SOBEL_Y);
    const xx = new Float32Array(W * H), yy = new Float32Array(W * H), xy = new Float32Array(W * H);
    for (let i = 0; i < xx.length; i++) { xx[i] = ix[i] * ix[i]; yy[i] = iy[i] * iy[i]; xy[i] = ix[i] * iy[i]; }
    const sxx = gauss(xx, W, H, 1.5), syy = gauss(yy, W, H, 1.5), sxy = gauss(xy, W, H, 1.5);
    let showResponse = false;

    const K = slider(root, "k", () => later(draw), (v) => v.toFixed(2));
    const Th = slider(root, "thresh", () => later(draw), (v) => v + " %");

    function draw() {
      const k = K.value(), th = Th.value() / 100;
      const R = new Float32Array(W * H);
      let rmax = 1e-9;
      for (let i = 0; i < R.length; i++) {
        const tr = sxx[i] + syy[i];
        R[i] = sxx[i] * syy[i] - sxy[i] * sxy[i] - k * tr * tr;
        if (R[i] > rmax) rmax = R[i];
      }
      const ctx = showResponse ? paint(canvas, R.map((v) => Math.max(0, v)), W, H, "gray", 0, rmax * 0.15) : paint(canvas, g, W, H);
      // 7 x 7 non-maximum suppression above the threshold
      const pts = [];
      for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
        const v = R[y * W + x];
        if (v < th * rmax) continue;
        let best = true;
        for (let j = -3; j <= 3 && best; j++) for (let i = -3; i <= 3; i++) if (R[(y + j) * W + x + i] > v) { best = false; break; }
        if (best) pts.push([x, y]);
      }
      ctx.strokeStyle = "#ff3b30"; ctx.lineWidth = 1.6;
      for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke(); }
      readout.innerHTML = `<b>${pts.length}</b> corners found. Lower the threshold to find more, weaker corners. Notice how many sit on the brick mortar and the drones' propellers.`;
    }
    $(root, "[data-action=response]").addEventListener("click", (e) => {
      showResponse = !showResponse;
      e.target.classList.toggle("is-on", showResponse);
      e.target.textContent = showResponse ? "Showing response R" : "Show response R";
      later(draw);
    });
    K.init(); Th.init();
  }

  /* ---------- 6. Scale space and blobs ---------- */
  function scaleSpace() {
    const root = document.getElementById("scale-sim");
    if (!root) return;
    const [blurCanvas, logCanvas] = root.querySelectorAll("canvas");
    const readout = $(root, ".sim__readout");
    const W = 360, H = 220;
    // Dark discs of different sizes on a light background.
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const cx = c.getContext("2d");
    cx.fillStyle = "#ece8da"; cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#26261e";
    const discs = [[40, 50, 4], [90, 40, 6], [150, 55, 9], [235, 60, 14], [320, 70, 20], [55, 150, 24], [140, 165, 5], [190, 150, 11], [265, 165, 7], [320, 175, 3.5]];
    for (const [x, y, r] of discs) { cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); }
    const g = grayFrom(c, W, H);
    const LAP = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    const sigmas = [2, 2.8, 4, 5.6, 8, 11.3, 16];
    const cache = {};
    function logAt(s) {
      if (cache[s]) return cache[s];
      const L = conv3(gauss(g, W, H, s), W, H, LAP);
      for (let i = 0; i < L.length; i++) L[i] *= s * s; // scale normalization
      return (cache[s] = L);
    }
    let detected = null;
    const S = slider(root, "s", () => later(draw), (v) => "σ = " + sigmas[v]);

    function draw() {
      const s = sigmas[S.value()];
      paint(blurCanvas, gauss(g, W, H, s), W, H);
      const L = logAt(s);
      const lctx = paint(logCanvas, L, W, H, "signed", 0, 0.35);
      // strongest response at this scale
      let best = 0, bi = 0;
      for (let i = 0; i < L.length; i++) if (L[i] > best) { best = L[i]; bi = i; }
      if (detected) {
        const bctx = blurCanvas.getContext("2d");
        for (const [x, y, sc] of detected) {
          for (const ctx of [bctx, lctx]) {
            ctx.strokeStyle = sc === s ? "#ff3b30" : "rgba(255,59,48,0.45)"; ctx.lineWidth = sc === s ? 2.5 : 1.2;
            ctx.beginPath(); ctx.arc(x, y, sc * Math.SQRT2, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
      readout.innerHTML = `At σ = ${s}, the strongest response is at (${bi % W}, ${Math.floor(bi / W)}). ` +
        `At this scale, discs of radius about σ√2 ≈ ${(s * Math.SQRT2).toFixed(1)} px respond most strongly. ` +
        (detected ? `<b>${detected.length}</b> blobs found across all scales; circles drawn in bold were found at this σ.` : "");
    }

    $(root, "[data-action=detect]").addEventListener("click", () => {
      readout.textContent = "Searching all scales…";
      later(() => {
        const stack = sigmas.map(logAt);
        let top = 0;
        for (const L of stack) for (const v of L) if (v > top) top = v;
        const minResp = 0.3 * top;
        const found = [];
        for (let k = 0; k < sigmas.length; k++) for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
          const v = stack[k][y * W + x];
          if (v < minResp) continue;
          let max = true;
          for (let dk = -1; dk <= 1 && max; dk++) {
            const L = stack[k + dk]; if (!L) continue;
            for (let j = -2; j <= 2 && max; j++) for (let i = -2; i <= 2; i++) {
              if ((dk || j || i) && L[(y + j) * W + x + i] > v) { max = false; break; }
            }
          }
          if (max) found.push([x, y, sigmas[k], v]);
        }
        // Ties on symmetric blobs can report neighbours twice: keep the strongest.
        found.sort((a, b) => b[3] - a[3]);
        detected = [];
        for (const f of found) if (!detected.some((d) => Math.hypot(d[0] - f[0], d[1] - f[1]) < Math.max(d[2], f[2]))) detected.push(f);
        draw();
      });
    });
    S.init();
  }

  /* ---------- 7. ORB matching between two views (OpenCV.js) ---------- */
  function orbMatching() {
    const root = document.getElementById("orb-match");
    if (!root) return;
    const canvas = $(root, "canvas");
    const button = $(root, "[data-action=run]");
    const readout = $(root, ".sim__readout");
    let cv, A, B, kpA = [], kpB = [], knn = [];
    const Wd = 560, Hd = 315;

    const Ratio = slider(root, "ratio", () => knn.length && later(draw), (v) => v.toFixed(2));
    const Nf = slider(root, "nf", () => {}, (v) => v);
    Nf.input.addEventListener("change", () => cv && later(compute));

    async function start() {
      button.disabled = true;
      readout.textContent = "Loading OpenCV.js (about 10 MB, first time only)…";
      try {
        cv = await window.loadOpenCV();
        [A, B] = await Promise.all([loadImage(MEDIA + "features/view_a.jpg"), loadImage(MEDIA + "features/view_b.jpg")]);
      } catch (e) {
        readout.textContent = "Could not load: " + e.message;
        button.disabled = false;
        return;
      }
      button.textContent = "Recompute";
      button.disabled = false;
      compute();
    }

    function detect(img) {
      const c = document.createElement("canvas");
      c.width = Wd; c.height = Hd;
      c.getContext("2d").drawImage(img, 0, 0, Wd, Hd);
      const src = cv.imread(c), gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const orb = new cv.ORB(Nf.value());
      const kp = new cv.KeyPointVector(), des = new cv.Mat(), mask = new cv.Mat();
      orb.detectAndCompute(gray, mask, kp, des);
      const pts = [];
      for (let i = 0; i < kp.size(); i++) { const p = kp.get(i).pt; pts.push([p.x, p.y]); }
      src.delete(); gray.delete(); orb.delete(); kp.delete(); mask.delete();
      return [pts, des];
    }

    function compute() {
      readout.textContent = "Detecting and matching…";
      later(() => {
        const [pa, da] = detect(A), [pb, db] = detect(B);
        kpA = pa; kpB = pb; knn = [];
        const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
        const mv = new cv.DMatchVectorVector();
        bf.knnMatch(da, db, mv, 2);
        for (let i = 0; i < mv.size(); i++) {
          const m = mv.get(i);
          if (m.size() < 2) continue;
          const a = m.get(0), b = m.get(1);
          knn.push([a.queryIdx, a.trainIdx, a.distance, b.distance]);
        }
        mv.delete(); bf.delete(); da.delete(); db.delete();
        draw();
      });
    }

    function draw() {
      canvas.width = Wd; canvas.height = Hd * 2;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(A, 0, 0, Wd, Hd);
      ctx.drawImage(B, 0, Hd, Wd, Hd);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (const [x, y] of kpA) ctx.fillRect(x - 1, y - 1, 2, 2);
      for (const [x, y] of kpB) ctx.fillRect(x - 1, Hd + y - 1, 2, 2);
      const r = Ratio.value();
      const kept = knn.filter(([, , d1, d2]) => d1 < r * d2);
      kept.forEach(([qa, tb], n) => {
        const [x1, y1] = kpA[qa], [x2, y2] = kpB[tb];
        ctx.strokeStyle = `hsla(${(n * 47) % 360}, 90%, 55%, 0.85)`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, Hd + y2); ctx.stroke();
      });
      readout.innerHTML = `${kpA.length} and ${kpB.length} keypoints. <b>${kept.length}</b> matches pass the ratio test at ${r.toFixed(2)} (of ${knn.length} candidates). ` +
        (r > 0.9 ? "Many of these are wrong: lines cross the image at odd angles." : r < 0.65 ? "Few matches survive, but a larger share of them are correct." : "");
    }

    button.addEventListener("click", () => (cv ? compute() : start()));
    Ratio.init(); Nf.init();
  }

  /* ---------- 8. Live ORB keypoints on the webcam (OpenCV.js) ---------- */
  function orbLive() {
    const root = document.getElementById("orb-live");
    if (!root) return;
    const video = $(root, "video");
    const canvas = $(root, "canvas");
    const button = $(root, "button");
    const status = $(root, ".sim__readout");
    let stream = null, running = false;

    async function start() {
      button.disabled = true;
      status.textContent = "Loading OpenCV.js (about 10 MB, first time only)…";
      let cv;
      try { cv = await window.loadOpenCV(); } catch (e) { status.textContent = e.message; button.disabled = false; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
      } catch (e) {
        status.textContent = "Camera not available: " + e.message; button.disabled = false; return;
      }
      video.srcObject = stream;
      await video.play();
      video.width = video.videoWidth; video.height = video.videoHeight;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const cap = new cv.VideoCapture(video);
      const frame = new cv.Mat(video.height, video.width, cv.CV_8UC4), gray = new cv.Mat();
      const orb = new cv.ORB(300);
      running = true;
      button.textContent = "Stop camera"; button.disabled = false;
      status.textContent = "Move the camera or an object. Keypoints stick to corners and texture, not to plain walls.";
      const loop = () => {
        if (!running) { frame.delete(); gray.delete(); orb.delete(); return; }
        cap.read(frame);
        cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
        const kp = new cv.KeyPointVector();
        orb.detect(gray, kp);
        for (let i = 0; i < kp.size(); i++) {
          const k = kp.get(i);
          const r = Math.max(3, k.size / 4);
          cv.circle(frame, new cv.Point(k.pt.x, k.pt.y), r, [207, 185, 125, 255], 1);
          const a = (k.angle * Math.PI) / 180;
          cv.line(frame, new cv.Point(k.pt.x, k.pt.y), new cv.Point(k.pt.x + r * Math.cos(a), k.pt.y + r * Math.sin(a)), [255, 59, 48, 255], 1);
        }
        kp.delete();
        cv.imshow(canvas, frame);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      stream?.getTracks().forEach((t) => t.stop());
      button.textContent = "Start camera";
      status.textContent = "Camera stopped.";
    }
    button.addEventListener("click", () => (running ? stop() : start()));
  }

  function init() {
    convolution(); convolutionSteps(); gradients(); harrisPatch(); harrisCorners(); scaleSpace(); orbMatching(); orbLive();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
