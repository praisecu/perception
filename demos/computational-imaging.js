/*
 * Interactive figures for Chapter 8, Computational Imaging.
 * Each demo initializes by element id and does nothing if it is absent.
 * Everything runs in the reader's browser.
 */
(() => {
  const MEDIA = "media/computational-imaging/";
  const SCENE = "media/image-formation/pinhole.jpg";
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

  function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Seeded random numbers, so figures look the same on every visit.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  /* ---------- FFT helpers (radix 2) ---------- */
  function fft1(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (2 * Math.PI) / len * (inverse ? 1 : -1);
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  // In-place 2D FFT of an N x N complex image stored row-major.
  function fft2(re, im, N, inverse) {
    const r = new Float64Array(N), i = new Float64Array(N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) { r[x] = re[y * N + x]; i[x] = im[y * N + x]; }
      fft1(r, i, inverse);
      for (let x = 0; x < N; x++) { re[y * N + x] = r[x]; im[y * N + x] = i[x]; }
    }
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) { r[y] = re[y * N + x]; i[y] = im[y * N + x]; }
      fft1(r, i, inverse);
      for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = i[y]; }
    }
  }

  // Place a small kernel (h x w, centered) into an N x N array with wraparound,
  // so that its FFT is the transfer function of a centered blur.
  function kernelSpectrum(kernel, kw, kh, N) {
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    let sum = 0;
    for (const v of kernel) sum += v;
    const cx = Math.floor(kw / 2), cy = Math.floor(kh / 2);
    for (let y = 0; y < kh; y++) for (let x = 0; x < kw; x++) {
      const v = kernel[y * kw + x];
      if (!v) continue;
      const xx = (x - cx + N) % N, yy = (y - cy + N) % N;
      re[yy * N + xx] += v / (sum || 1);
    }
    fft2(re, im, N, false);
    return { re, im };
  }

  // Grayscale N x N crop from the middle of an image, values in [0, 1].
  async function grayCrop(src, N) {
    const img = await loadImage(src);
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const s = img.height / N; // fit height, crop width
    const w = N * s;
    ctx.drawImage(img, (img.width - w) / 2, 0, w, img.height, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;
    const g = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) {
      g[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    }
    return g;
  }

  function drawGray(canvas, g, N, lo = 0, hi = 1) {
    canvas.width = N; canvas.height = N;
    const ctx = canvas.getContext("2d");
    const out = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = Math.max(0, Math.min(255, ((g[i] - lo) / (hi - lo)) * 255));
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }

  // Blur image g with a kernel via FFT; returns real result.
  function blurWith(g, N, spec) {
    const re = Float64Array.from(g), im = new Float64Array(N * N);
    fft2(re, im, N, false);
    for (let i = 0; i < N * N; i++) {
      const a = re[i], b = im[i];
      re[i] = a * spec.re[i] - b * spec.im[i];
      im[i] = a * spec.im[i] + b * spec.re[i];
    }
    fft2(re, im, N, true);
    return re;
  }

  // Draw |H| along the horizontal frequency axis as a line chart (log scale).
  function drawSpectrumChart(canvas, series, N) {
    const W = (canvas.width = 480), H = (canvas.height = 180);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    const pad = 28;
    const css = getComputedStyle(canvas);
    ctx.strokeStyle = css.color; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, 8); ctx.lineTo(pad, H - pad); ctx.lineTo(W - 8, H - pad); ctx.stroke();
    ctx.globalAlpha = 0.7; ctx.fillStyle = css.color; ctx.font = "12px sans-serif";
    ctx.fillText("frequency", W - 70, H - 10);
    ctx.save(); ctx.translate(12, H / 2 + 30); ctx.rotate(-Math.PI / 2); ctx.fillText("|H| (log)", 0, 0); ctx.restore();
    ctx.globalAlpha = 1;
    const half = N / 2;
    const y = (v) => {
      const l = Math.log10(Math.max(1e-4, v)); // 1e-4 .. 1
      return 8 + ((0 - l) / 4) * (H - pad - 8);
    };
    for (const s of series) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k <= half; k++) {
        const x = pad + (k / half) * (W - pad - 8);
        const v = s.mag[k];
        k ? ctx.lineTo(x, y(v)) : ctx.moveTo(x, y(v));
      }
      ctx.stroke();
    }
  }

  // Disc and coded aperture patterns on an n x n grid.
  function discMask(n) {
    const m = new Uint8Array(n * n), c = (n - 1) / 2, r = n / 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      m[y * n + x] = (x - c) ** 2 + (y - c) ** 2 <= r * r * 0.92 ? 1 : 0;
    }
    return m;
  }
  function codedMask(n) {
    // A fixed, deliberately asymmetric pattern inside the disc.
    const d = discMask(n), m = new Uint8Array(n * n), rand = rng(11);
    for (let i = 0; i < n * n; i++) m[i] = d[i] && rand() < 0.5 ? 1 : 0;
    return m;
  }
  function ringMask(n) {
    const d = discMask(n), m = new Uint8Array(n * n), c = (n - 1) / 2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      m[y * n + x] = d[y * n + x] && (x - c) ** 2 + (y - c) ** 2 > (n * 0.3) ** 2 ? 1 : 0;
    }
    return m;
  }

  // Scale a binary mask to a blur kernel of the given pixel size (nearest neighbor).
  function scaleMask(mask, n, size) {
    size = Math.max(1, Math.round(size));
    const k = new Float64Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      k[y * size + x] = mask[Math.floor((y * n) / size) * n + Math.floor((x * n) / size)];
    }
    let s = 0; for (const v of k) s += v;
    if (!s) k[Math.floor(size / 2) * size + Math.floor(size / 2)] = 1;
    return k;
  }

  /* ---------- 1. Aperture painter ---------- */
  async function painter() {
    const root = document.getElementById("psf-sim");
    if (!root) return;
    const n = 13, N = 256;
    const grid = $(root, ".ci-grid");
    const [imgCanvas, chart] = root.querySelectorAll("canvas");
    const readout = $(root, ".sim__readout");
    let mask = discMask(n);
    let g;
    try { g = await grayCrop(SCENE, N); } catch { return; }

    // Build the clickable grid
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement("span");
      b.className = "ci-grid__cell";
      grid.appendChild(b); cells.push(b);
    }
    let painting = null;
    const cellAt = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return cells.indexOf(el);
    };
    grid.addEventListener("pointerdown", (e) => {
      const i = cellAt(e); if (i < 0) return;
      painting = mask[i] ? 0 : 1; mask[i] = painting;
      grid.setPointerCapture(e.pointerId); paint(); e.preventDefault();
    });
    grid.addEventListener("pointermove", (e) => {
      if (painting === null) return;
      const i = cellAt(e); if (i < 0 || mask[i] === painting) return;
      mask[i] = painting; paint();
    });
    const stop = () => { if (painting !== null) { painting = null; update(); } };
    grid.addEventListener("pointerup", stop);
    grid.addEventListener("pointercancel", stop);

    root.querySelectorAll("[data-mask]").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.mask;
      mask = t === "open" ? discMask(n) : t === "coded" ? codedMask(n) : t === "ring" ? ringMask(n) : new Uint8Array(n * n).fill(0);
      if (t === "pin") mask[Math.floor(n * n / 2)] = 1;
      paint(); update();
    }));

    const S = slider(root, "blur", () => later(update), (v) => v + " px");

    function paint() {
      cells.forEach((c, i) => c.classList.toggle("is-open", !!mask[i]));
      let open = 0; for (const v of mask) open += v;
      root.querySelector(".ci-light").textContent = Math.round((open / (n * n)) * 100) + "% of the aperture open";
    }

    function update() {
      const size = S.value();
      const k = scaleMask(mask, n, size);
      const spec = kernelSpectrum(k, size, size, N);
      drawGray(imgCanvas, blurWith(g, N, spec), N);
      // Compare with an open disc of the same size
      const ref = kernelSpectrum(scaleMask(discMask(n), n, size), size, size, N);
      const mag = (s) => { const m = []; for (let x = 0; x <= N / 2; x++) m.push(Math.hypot(s.re[x], s.im[x])); return m; };
      const mine = mag(spec), open = mag(ref);
      drawSpectrumChart(chart, [{ mag: open, color: "rgba(150,150,150,0.8)" }, { mag: mine, color: "#cfb97d" }], N);
      let minMine = 1, minOpen = 1;
      for (let x = 1; x < N / 4; x++) { minMine = Math.min(minMine, mine[x]); minOpen = Math.min(minOpen, open[x]); }
      readout.innerHTML = `Smallest response at low and middle frequencies: <b>your aperture ${minMine.toExponential(1)}</b>, open disc ${minOpen.toExponential(1)}. ` +
        (minMine > minOpen * 1.5 ? "Your aperture keeps more frequencies alive, so the blur is easier to undo." : "Near-zero values mean detail at those frequencies is lost.");
    }
    paint(); S.init();
  }

  /* ---------- 2. Zeros move with depth ---------- */
  function scaling() {
    const root = document.getElementById("scale-sim");
    if (!root) return;
    const chart = $(root, "canvas");
    const readout = $(root, ".sim__readout");
    const N = 256;
    const patterns = {
      open: [1, 1, 1, 1, 1, 1, 1],
      coded: [1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0],
    };
    let which = "open";
    root.querySelectorAll("[data-pattern]").forEach((b) => b.addEventListener("click", () => {
      which = b.dataset.pattern;
      root.querySelectorAll("[data-pattern]").forEach((x) => x.classList.toggle("is-on", x === b));
      draw();
    }));
    const D = slider(root, "depth", draw, (v) => v.toFixed(1) + " m");
    const colors = ["#e36b5b", "#5fae6b", "#5a7fd6"];

    function spectrum(p, scale) {
      const re = new Float64Array(N), im = new Float64Array(N);
      const L = Math.round(p.length * scale);
      let s = 0;
      for (let i = 0; i < L; i++) { const v = p[Math.floor(i / scale)]; re[i] = v; s += v; }
      for (let i = 0; i < L; i++) re[i] /= s;
      fft1(re, im, false);
      const m = []; for (let k = 0; k <= N / 2; k++) m.push(Math.hypot(re[k], im[k]));
      return m;
    }
    function draw() {
      const focus = 1.5, z = D.value();
      const base = Math.abs(1 / z - 1 / focus) * 4 + 0.6; // blur grows away from focus
      const scales = [1, 1.5, 2.2].map((f) => base * f);
      const p = patterns[which];
      drawSpectrumChart(chart, scales.map((s, i) => ({ mag: spectrum(p, s), color: colors[i] })), N);
      readout.innerHTML = which === "open"
        ? "With an open aperture the three blur sizes have zeros at evenly spaced, nested frequencies. Their patterns look alike, so it is hard to tell which blur size, and hence which depth, produced an image."
        : "With a coded aperture each blur size has its own distinct pattern of dips. Matching the pattern in an image tells you the blur size, and from it the depth.";
    }
    D.init();
  }

  /* ---------- 3. Deconvolution ---------- */
  async function deconv() {
    const root = document.getElementById("deconv-sim");
    if (!root) return;
    const N = 256;
    const [blurredCanvas, restoredCanvas] = root.querySelectorAll("canvas");
    const readout = $(root, ".sim__readout");
    let g;
    try { g = await grayCrop(SCENE, N); } catch { return; }
    let method = "wiener";
    root.querySelectorAll("[data-method]").forEach((b) => b.addEventListener("click", () => {
      method = b.dataset.method;
      root.querySelectorAll("[data-method]").forEach((x) => x.classList.toggle("is-on", x === b));
      later(update);
    }));
    const R = slider(root, "r", () => later(update), (v) => v + " px");
    const Nz = slider(root, "noise", () => later(update), (v) => v.toFixed(1) + " %");
    const K = slider(root, "k", () => later(update), (v) => "10^" + v.toFixed(1));

    function update() {
      const size = R.value() * 2 + 1;
      const spec = kernelSpectrum(scaleMask(discMask(15), 15, size), size, size, N);
      const b = blurWith(g, N, spec);
      const sigma = Nz.value() / 100;
      const rand = rng(7);
      const noisy = b.map((v) => v + sigma * Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand()));
      drawGray(blurredCanvas, noisy, N);
      const re = Float64Array.from(noisy), im = new Float64Array(N * N);
      fft2(re, im, N, false);
      const k = Math.pow(10, K.value());
      for (let i = 0; i < N * N; i++) {
        const hr = spec.re[i], hi = spec.im[i], h2 = hr * hr + hi * hi;
        // multiply by conj(H) / (|H|^2 + k)  (k = 0 is the inverse filter)
        const den = method === "inverse" ? Math.max(h2, 1e-12) : h2 + k;
        const a = re[i], c = im[i];
        re[i] = (a * hr + c * hi) / den;
        im[i] = (c * hr - a * hi) / den;
      }
      fft2(re, im, N, true);
      drawGray(restoredCanvas, re, N);
      let e = 0; for (let i = 0; i < N * N; i++) e += (Math.min(1, Math.max(0, re[i])) - g[i]) ** 2;
      const rmse = Math.sqrt(e / (N * N));
      readout.innerHTML = `Error against the sharp image: <b>${(rmse * 100).toFixed(1)}%</b>. ` +
        (method === "inverse"
          ? "The inverse filter divides by tiny values of H, so noise at those frequencies explodes."
          : "The Wiener filter backs off where H is small. Raise λ for less noise and more blur, lower it for sharper but noisier results.");
    }
    R.init(); Nz.init(); K.init();
  }

  /* ---------- 4. Flutter shutter ---------- */
  async function flutter() {
    const root = document.getElementById("flutter-sim");
    if (!root) return;
    const N = 256, L = 40;
    const cs = root.querySelectorAll("canvas");
    const readout = $(root, ".sim__readout");
    let g;
    try { g = await grayCrop(SCENE, N); } catch { return; }

    // Choose a binary code of length L whose spectrum has no deep zeros.
    function minResponse(code) {
      const re = new Float64Array(N), im = new Float64Array(N);
      let s = 0; code.forEach((v, i) => { re[i] = v; s += v; });
      for (let i = 0; i < L; i++) re[i] /= s;
      fft1(re, im, false);
      let m = 1; for (let k = 1; k <= N / 2; k++) m = Math.min(m, Math.hypot(re[k], im[k]));
      return m;
    }
    const rand = rng(2024);
    let best = null, bestScore = -1;
    for (let t = 0; t < 400; t++) {
      const c = Array.from({ length: L }, () => (rand() < 0.5 ? 1 : 0));
      c[0] = 1; c[L - 1] = 1;
      const sc = minResponse(c);
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    const codes = { box: new Array(L).fill(1), flutter: best };
    $(root, ".ci-code").innerHTML = best.map((v) => `<span class="${v ? "on" : ""}"></span>`).join("");

    function rowSpectrum(code) {
      const re = new Float64Array(N), im = new Float64Array(N);
      let s = 0; code.forEach((v) => (s += v));
      code.forEach((v, i) => { re[(i - Math.floor(L / 2) + N) % N] = v / s; });
      fft1(re, im, false);
      return { re, im };
    }
    const Nz = slider(root, "noise", () => later(update), (v) => v.toFixed(1) + " %");

    function blurDeblur(code, sigma) {
      const H = rowSpectrum(code);
      const blurred = new Float64Array(N * N), restored = new Float64Array(N * N);
      const rand2 = rng(5);
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) { re[x] = g[y * N + x]; im[x] = 0; }
        fft1(re, im, false);
        for (let k = 0; k < N; k++) {
          const a = re[k], b = im[k];
          re[k] = a * H.re[k] - b * H.im[k]; im[k] = a * H.im[k] + b * H.re[k];
        }
        fft1(re, im, true);
        for (let x = 0; x < N; x++) {
          const v = re[x] + sigma * Math.sqrt(-2 * Math.log(rand2() + 1e-12)) * Math.cos(2 * Math.PI * rand2());
          blurred[y * N + x] = v; re[x] = v; im[x] = 0;
        }
        fft1(re, im, false);
        for (let k = 0; k < N; k++) {
          const hr = H.re[k], hi = H.im[k], den = hr * hr + hi * hi + 2e-4;
          const a = re[k], c = im[k];
          re[k] = (a * hr + c * hi) / den; im[k] = (c * hr - a * hi) / den;
        }
        fft1(re, im, true);
        for (let x = 0; x < N; x++) restored[y * N + x] = re[x];
      }
      let e = 0; for (let i = 0; i < N * N; i++) e += (Math.min(1, Math.max(0, restored[i])) - g[i]) ** 2;
      return { blurred, restored, rmse: Math.sqrt(e / (N * N)), H };
    }

    function update() {
      const sigma = Nz.value() / 100;
      const box = blurDeblur(codes.box, sigma), fl = blurDeblur(codes.flutter, sigma);
      drawGray(cs[0], box.blurred, N); drawGray(cs[1], box.restored, N);
      drawGray(cs[2], fl.blurred, N); drawGray(cs[3], fl.restored, N);
      const mag = (H) => { const m = []; for (let k = 0; k <= N / 2; k++) m.push(Math.hypot(H.re[k], H.im[k])); return m; };
      drawSpectrumChart(cs[4], [{ mag: mag(box.H), color: "rgba(150,150,150,0.85)" }, { mag: mag(fl.H), color: "#cfb97d" }], N);
      readout.innerHTML = `Error after deblurring: <b>open shutter ${(box.rmse * 100).toFixed(1)}%</b>, <b>fluttered shutter ${(fl.rmse * 100).toFixed(1)}%</b>. The fluttered shutter lets in less light, but its blur has no frequency nulls (gold curve), so it can be inverted.`;
    }
    Nz.init();
  }

  /* ---------- 5. High dynamic range ---------- */
  async function hdr() {
    const root = document.getElementById("hdr-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const readout = $(root, ".sim__readout");
    const evs = [-4, -2, 0, 2];
    let imgs;
    try { imgs = await Promise.all(evs.map((e) => loadImage(`${MEDIA}hdr_ev${e}.jpg`))); } catch { return; }
    const W = (canvas.width = imgs[0].width), H = (canvas.height = imgs[0].height);
    const lin = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
    const srgb = (v) => {
      v = Math.min(1, Math.max(0, v));
      return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
    };
    const data = imgs.map((im) => { ctx.drawImage(im, 0, 0); return ctx.getImageData(0, 0, W, H).data; });

    // Merge: weighted average of linear value / exposure time, trusting mid-tones most.
    const rad = new Float32Array(W * H * 3);
    for (let p = 0; p < W * H; p++) {
      for (let c = 0; c < 3; c++) {
        let num = 0, den = 0;
        data.forEach((d, k) => {
          const v = d[p * 4 + c];
          const w = Math.max(0.002, 1 - Math.abs(v - 127.5) / 127.5);
          num += w * (lin[v] / Math.pow(2, evs[k])); den += w;
        });
        rad[p * 3 + c] = num / den;
      }
    }
    const lum = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) lum[p] = 0.2126 * rad[p * 3] + 0.7152 * rad[p * 3 + 1] + 0.0722 * rad[p * 3 + 2];
    const sorted = Float32Array.from(lum).sort();
    const mx = sorted[Math.floor(sorted.length * 0.999)], mn = Math.max(1e-6, sorted[Math.floor(sorted.length * 0.005)]);

    let mode = "merged";
    root.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.ev;
      root.querySelectorAll("[data-ev]").forEach((x) => x.classList.toggle("is-on", x === b));
      later(draw);
    }));
    const E = slider(root, "key", () => later(draw), (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + " EV");

    function draw() {
      if (mode !== "merged") {
        ctx.drawImage(imgs[evs.indexOf(Number(mode))], 0, 0);
        let clipped = 0, dark = 0;
        const d = data[evs.indexOf(Number(mode))];
        for (let p = 0; p < W * H; p++) {
          const m = Math.max(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
          if (m >= 250) clipped++; if (m <= 6) dark++;
        }
        readout.innerHTML = `One exposure: <b>${((clipped / (W * H)) * 100).toFixed(1)}%</b> of pixels clipped to white and <b>${((dark / (W * H)) * 100).toFixed(1)}%</b> crushed to black.`;
        return;
      }
      const gain = Math.pow(2, E.value());
      const out = ctx.createImageData(W, H);
      for (let p = 0; p < W * H; p++) {
        const r = rad[p * 3] * gain, g = rad[p * 3 + 1] * gain, b = rad[p * 3 + 2] * gain;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const s = L > 0 ? (L / (1 + L)) / L : 0; // Reinhard tone mapping
        out.data[p * 4] = srgb(r * s); out.data[p * 4 + 1] = srgb(g * s); out.data[p * 4 + 2] = srgb(b * s);
        out.data[p * 4 + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
      readout.innerHTML = `Merged and tone mapped. The scene spans about <b>${Math.log2(mx / mn).toFixed(0)} stops</b> of brightness, more than any single 8-bit exposure can hold.`;
    }
    E.init();
  }

  /* ---------- 6. Event camera ---------- */
  async function events() {
    const root = document.getElementById("event-sim");
    if (!root) return;
    const [frameCanvas, eventCanvas] = root.querySelectorAll("canvas");
    const readout = $(root, ".sim__readout");
    const button = $(root, "[data-action=play]");
    let img;
    try { img = await loadImage(SCENE); } catch { return; }
    const W = 240, H = 160, steps = 48;
    const src = document.createElement("canvas");
    src.width = W; src.height = H;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    frameCanvas.width = eventCanvas.width = W; frameCanvas.height = eventCanvas.height = H;
    const fctx = frameCanvas.getContext("2d"), ectx = eventCanvas.getContext("2d");

    // The camera pans sideways and a little down across the scene.
    function frameAt(t) {
      const cw = img.width * 0.5, ch = (cw * H) / W;
      const x = img.width * 0.2 + t * img.width * 0.12;
      const y = img.height * 0.28 + Math.sin(t * Math.PI) * img.height * 0.04;
      sctx.drawImage(img, x, y, cw, ch, 0, 0, W, H);
      const d = sctx.getImageData(0, 0, W, H).data;
      const logI = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) logI[i] = Math.log(1 + 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
      return { d, logI };
    }

    const C = slider(root, "c", () => {}, (v) => v.toFixed(2));
    let ref = null, step = 0, timer = null, total = 0, pos = 0, neg = 0;
    const acc = new Int16Array(W * H);

    function reset() {
      step = 0; total = 0; pos = 0; neg = 0; acc.fill(0);
      const f = frameAt(0); ref = Float32Array.from(f.logI);
      fctx.putImageData(new ImageData(new Uint8ClampedArray(f.d), W, H), 0, 0);
      ectx.fillStyle = "#808080"; ectx.fillRect(0, 0, W, H);
      readout.textContent = "Press Play. Each pixel fires an event only when its brightness changes by the threshold.";
    }
    function tick() {
      step++;
      const t = step / steps;
      const f = frameAt(t);
      fctx.putImageData(new ImageData(new Uint8ClampedArray(f.d), W, H), 0, 0);
      const c = C.value();
      acc.fill(0);
      let n = 0;
      for (let i = 0; i < W * H; i++) {
        let diff = f.logI[i] - ref[i];
        while (diff >= c) { acc[i]++; ref[i] += c; diff -= c; n++; pos++; }
        while (diff <= -c) { acc[i]--; ref[i] -= c; diff += c; n++; neg++; }
      }
      total += n;
      const out = ectx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const a = acc[i];
        const o = i * 4;
        if (a > 0) { out.data[o] = 240; out.data[o + 1] = 240; out.data[o + 2] = 240; }
        else if (a < 0) { out.data[o] = 20; out.data[o + 1] = 20; out.data[o + 2] = 20; }
        else { out.data[o] = out.data[o + 1] = out.data[o + 2] = 128; }
        out.data[o + 3] = 255;
      }
      ectx.putImageData(out, 0, 0);
      const fullFrame = W * H * step;
      readout.innerHTML = `<b>${n}</b> events in this step (${((n / (W * H)) * 100).toFixed(1)}% of pixels). Total so far: ${total} events, compared with ${fullFrame.toLocaleString()} pixel values for ordinary frames. Bright: brighter, dark: darker.`;
      if (step >= steps) stopPlay();
    }
    function stopPlay() { clearInterval(timer); timer = null; button.textContent = "Play"; }
    button.addEventListener("click", () => {
      if (timer) { stopPlay(); return; }
      if (step >= steps) reset();
      button.textContent = "Pause";
      timer = setInterval(tick, 90);
    });
    $(root, "[data-action=reset]").addEventListener("click", () => { stopPlay(); reset(); });
    C.input.addEventListener("input", () => { if (!timer) reset(); });
    C.init(); reset();
  }

  /* ---------- 7. Light field refocusing ---------- */
  async function lightField() {
    const root = document.getElementById("lf-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    const views = [];
    try {
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) views.push({ i, j, img: await loadImage(`${MEDIA}lf_${j}_${i}.jpg`) });
    } catch { return; }
    const W = (canvas.width = views[0].img.width), H = (canvas.height = views[0].img.height);
    let center = { i: 2, j: 2 };
    const F = slider(root, "shift", () => later(draw), (v) => v.toFixed(1) + " px");
    const A = slider(root, "aperture", () => later(draw), (v) => ["1 view (pinhole)", "3 × 3 views", "5 × 5 views"][v]);

    function draw() {
      const s = F.value(), a = A.value();
      const r = a === 0 ? 0 : a === 1 ? 1 : 2;
      const chosen = views.filter((v) => Math.abs(v.i - center.i) <= r && Math.abs(v.j - center.j) <= r);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 1 / chosen.length;
      // Shift each view toward the center view; the shift sets the depth in focus.
      for (const v of chosen) ctx.drawImage(v.img, -(v.i - 2) * s, -(v.j - 2) * s);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      const which = s < 1.5 ? "the far drone and the wall" : s < 5 ? "the middle drone" : "the near drone";
      readout.innerHTML = r === 0
        ? "A single view: everything is sharp, like a pinhole camera."
        : `Averaging ${chosen.length} views focuses on <b>${which}</b>. Objects at other depths do not line up and blur, exactly like a large lens.`;
    }
    // Drag across the image to look from a different sub-aperture (a small change of viewpoint).
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const rect = canvas.getBoundingClientRect();
      center = {
        i: Math.max(0, Math.min(4, Math.round(2 + ((e.clientX - rect.left) / rect.width - 0.5) * 5))),
        j: Math.max(0, Math.min(4, Math.round(2 + ((e.clientY - rect.top) / rect.height - 0.5) * 5))),
      };
      if (A.value() === 0) later(draw);
    });
    const end = () => { drag = null; center = { i: 2, j: 2 }; later(draw); };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    F.init(); A.init();
  }

  function init() {
    painter(); scaling(); deconv(); flutter(); hdr(); events(); lightField();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
