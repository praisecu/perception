/*
 * Interactive figures for Chapter 2, Image Formation.
 * Each demo looks for its own element id and does nothing if it is absent.
 * Everything runs in the reader's browser; nothing is uploaded.
 */
(() => {
  const MEDIA = "media/image-formation/";
  const $ = (root, sel) => root.querySelector(sel);

  // Bind a range input to its <output> and a callback.
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

  // sRGB <-> linear lookup tables for physically sensible exposure math.
  const toLinear = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    toLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const toSRGB = (v) => {
    v = Math.min(1, Math.max(0, v));
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(c * 255);
  };

  function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------- 1. Pinhole projection ---------- */
  function pinhole() {
    const root = document.getElementById("pinhole-sim");
    if (!root) return;
    const svg = $(root, "svg");
    const readout = $(root, ".sim__readout");
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    svg.appendChild(g);

    const cx = 360, cy = 150;           // pinhole position
    const pxPerM = 30, pxPerMM = 3.0;   // drawing scales

    const Z = slider(root, "Z", draw, (v) => v.toFixed(1) + " m");
    const H = slider(root, "H", draw, (v) => v.toFixed(1) + " m");
    const F = slider(root, "f", draw, (v) => v + " mm");

    function line(x1, y1, x2, y2, cls) {
      const l = document.createElementNS(ns, "line");
      Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => l.setAttribute(k, v));
      l.setAttribute("class", cls);
      g.appendChild(l);
    }

    function draw() {
      g.innerHTML = "";
      const z = Z.value(), h = H.value(), f = F.value();
      const ox = cx - z * pxPerM;
      const oh = h * pxPerM;
      const ix = cx + f * pxPerMM;
      // image height in drawing units from similar triangles
      const ih = (oh * (ix - cx)) / (cx - ox);

      line(ox, cy, ix + 30, cy, "sim__axis");
      line(ox, cy, ox, cy - oh, "sim__object");
      line(ox, cy - oh, ix, cy + ih, "sim__ray");
      line(ox, cy, ix, cy, "sim__ray sim__ray--faint");
      line(ix, cy - 110, ix, cy + 110, "sim__plane");
      line(ix, cy, ix, cy + ih, "sim__projected");
      line(cx, cy - 120, cx, cy - 4, "sim__barrier");
      line(cx, cy + 4, cx, cy + 120, "sim__barrier");

      const label = (x, y, text) => {
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", x); t.setAttribute("y", y);
        t.setAttribute("class", "sim__label"); t.textContent = text;
        g.appendChild(t);
      };
      label(ox, cy - oh - 10, "Object");
      label(cx, cy - 128, "Pinhole");
      label(ix, cy + 132, "Image plane");
      label((ox + cx) / 2, cy + 22, "Z");
      label((cx + ix) / 2, cy - 10, "f");

      const imgMM = (f * h) / z;
      readout.innerHTML =
        `Image height <b>h = f·H / Z = ${f} mm × ${h.toFixed(1)} m / ${z.toFixed(1)} m = ${imgMM.toFixed(1)} mm</b> (upside down)`;
    }

    $(root, "[data-action=double]").addEventListener("click", () => {
      Z.input.value = Math.min(Number(Z.input.max), Z.value() * 2);
      H.input.value = Math.min(Number(H.input.max), H.value() * 2);
      Z.init(); H.init();
    });

    Z.init(); H.init(); F.init();
  }

  /* ---------- 2. Focal length and field of view ---------- */
  async function zoom() {
    const root = document.getElementById("fov-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const readout = $(root, ".sim__readout");
    let img;
    try { img = await loadImage(MEDIA + "pinhole.jpg"); } catch { return; }
    canvas.width = img.width; canvas.height = img.height;
    const base = 50; // the render's focal length in mm
    const F = slider(root, "f", draw, (v) => v + " mm");
    function draw() {
      const f = F.value();
      const s = base / f;
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
      const fov = (2 * Math.atan(36 / (2 * f)) * 180) / Math.PI;
      readout.innerHTML = `Horizontal field of view on a 36 mm wide sensor: <b>${fov.toFixed(1)}°</b>`;
    }
    F.init();
  }

  /* ---------- 3. Pinhole size trade-off ---------- */
  function pinholeSize() {
    const root = document.getElementById("aperture-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    const W = (canvas.width = 480), H = (canvas.height = 240);
    // A test chart: bars and text-like blocks
    const src = document.createElement("canvas");
    src.width = W; src.height = H;
    const s = src.getContext("2d");
    s.fillStyle = "#f2efe3"; s.fillRect(0, 0, W, H);
    s.fillStyle = "#1d1e00";
    for (let i = 0; i < 12; i++) s.fillRect(20 + i * 18, 30, 7 + (i % 3), 180);
    s.font = "bold 44px sans-serif"; s.fillText("PRAISe", 260, 110);
    s.font = "20px serif"; s.fillText("pinhole camera", 262, 150);
    s.beginPath(); s.arc(380, 195, 26, 0, Math.PI * 2); s.lineWidth = 3; s.stroke();
    const base = s.getImageData(0, 0, W, H);
    const readout = $(root, ".sim__readout");

    const D = slider(root, "d", draw, (v) => v.toFixed(1) + " mm");
    function draw() {
      const d = D.value();
      const r = Math.round(d * 3); // blur radius grows with hole size
      const bright = Math.min(2.5, (d / 1.0) ** 2 * 0.6); // light grows with area
      ctx.filter = `blur(${r}px) brightness(${bright})`;
      ctx.putImageData(base, 0, 0);
      ctx.drawImage(src, 0, 0);
      ctx.filter = "none";
      readout.innerHTML = d < 0.6
        ? "Sharp, but very little light reaches the sensor."
        : d > 2
          ? "Plenty of light, but every point spreads into a blur."
          : "A compromise: some blur, some light. A lens removes this trade-off.";
    }
    D.init();
  }

  /* ---------- 4. Depth of field explorer (Blender renders) ---------- */
  function depthOfField() {
    const root = document.getElementById("dof-sim");
    if (!root) return;
    const img = $(root, "img");
    const stops = ["1.4", "2.8", "5.6", "11", "22"];
    let focus = "mid";
    const N = slider(root, "n", show, (v) => "f/" + stops[v]);
    root.querySelectorAll("[data-focus]").forEach((b) =>
      b.addEventListener("click", () => {
        focus = b.dataset.focus;
        root.querySelectorAll("[data-focus]").forEach((x) => x.classList.toggle("is-on", x === b));
        show();
      })
    );
    // Preload all frames so the slider feels instant.
    ["near", "mid", "far"].forEach((f) => stops.forEach((n) => { new Image().src = `${MEDIA}dof_${f}_f${n}.jpg`; }));
    function show() {
      img.src = `${MEDIA}dof_${focus}_f${stops[N.value()]}.jpg`;
    }
    N.init();
  }

  /* ---------- 5. Exposure triangle ---------- */
  async function exposure() {
    const root = document.getElementById("exposure-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const readout = $(root, ".sim__readout");
    let img;
    try { img = await loadImage(MEDIA + "pinhole.jpg"); } catch { return; }
    const W = (canvas.width = 640), H = (canvas.height = Math.round((640 * img.height) / img.width));
    ctx.drawImage(img, 0, 0, W, H);
    const src = ctx.getImageData(0, 0, W, H);
    const lin = new Float32Array(W * H * 3);
    for (let i = 0, j = 0; i < src.data.length; i += 4, j += 3) {
      lin[j] = toLinear[src.data[i]]; lin[j + 1] = toLinear[src.data[i + 1]]; lin[j + 2] = toLinear[src.data[i + 2]];
    }
    const shutters = [1 / 4000, 1 / 1000, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 4];
    const shutterText = ["1/4000", "1/1000", "1/250", "1/125", "1/60", "1/30", "1/15", "1/4"];
    const apertures = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
    const isos = [100, 200, 400, 800, 1600, 3200, 6400, 12800];

    const T = slider(root, "t", draw, (v) => shutterText[v] + " s");
    const A = slider(root, "a", draw, (v) => "f/" + apertures[v]);
    const I = slider(root, "iso", draw, (v) => "ISO " + isos[v]);

    let pending = false;
    function draw() {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; render(); }, 0);
    }

    function render() {
      const t = shutters[T.value()], N = apertures[A.value()], iso = isos[I.value()];
      // Reference exposure: 1/125 s, f/4, ISO 100
      const gain = (t / (1 / 125)) * (4 / N) ** 2 * (iso / 100);
      const stops = Math.log2(gain);
      const noise = 0.006 * Math.sqrt(iso / 100);     // read and shot noise grow with gain
      const blur = Math.min(40, Math.round(t * 600)); // something in the scene moves sideways

      const out = ctx.createImageData(W, H);
      const d = out.data;
      // Smooth sideways motion blur: average over [x, x + blur] with prefix sums.
      const cum = new Float32Array((W + 1) * 3);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const j = (y * W + x) * 3, k = (x + 1) * 3;
          cum[k] = cum[k - 3] + lin[j]; cum[k + 1] = cum[k - 2] + lin[j + 1]; cum[k + 2] = cum[k - 1] + lin[j + 2];
        }
        for (let x = 0; x < W; x++) {
          const x2 = Math.min(W, x + blur + 1), n = x2 - x;
          const r = (cum[x2 * 3] - cum[x * 3]) / n;
          const g = (cum[x2 * 3 + 1] - cum[x * 3 + 1]) / n;
          const b = (cum[x2 * 3 + 2] - cum[x * 3 + 2]) / n;
          const i = (y * W + x) * 4;
          d[i] = toSRGB(r * gain + noise * gaussian());
          d[i + 1] = toSRGB(g * gain + noise * gaussian());
          d[i + 2] = toSRGB(b * gain + noise * gaussian());
          d[i + 3] = 255;
        }
      }      ctx.putImageData(out, 0, 0);
      const verdict = stops > 1.5 ? "Overexposed: highlights are clipped to white."
        : stops < -1.5 ? "Underexposed: dark and noisy once brightened."
        : "Well exposed.";
      readout.innerHTML = `Exposure ${stops >= 0 ? "+" : ""}${stops.toFixed(1)} stops relative to 1/125 s, f/4, ISO 100. <b>${verdict}</b>`;
    }
    T.init(); A.init(); I.init();
  }

  /* ---------- 6. Bayer mosaic ---------- */
  async function bayer() {
    const root = document.getElementById("bayer-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    let img;
    try { img = await loadImage(MEDIA + "pinhole.jpg"); } catch { return; }
    const w = 64, h = 36, S = 10;
    canvas.width = w * S; canvas.height = h * S;
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const t = tmp.getContext("2d");
    // A crop with fine detail from the middle of the render
    t.drawImage(img, img.width * 0.42, img.height * 0.42, img.width * 0.16, img.height * 0.16, 0, 0, w, h);
    const rgb = t.getImageData(0, 0, w, h).data;
    // RGGB pattern: which channel each photosite records
    const chan = (x, y) => (y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : (x % 2 === 0 ? 1 : 2));
    const mosaic = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mosaic[y * w + x] = rgb[(y * w + x) * 4 + chan(x, y)];

    function demosaic() {
      const out = new Uint8ClampedArray(w * h * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sum = [0, 0, 0], cnt = [0, 0, 0];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const c = chan(xx, yy);
          sum[c] += mosaic[yy * w + xx]; cnt[c]++;
        }
        for (let c = 0; c < 3; c++) out[(y * w + x) * 3 + c] = sum[c] / Math.max(1, cnt[c]);
      }
      return out;
    }
    const demo = demosaic();

    function draw(mode) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let r, g, b;
        const k = y * w + x;
        if (mode === "raw") {
          const v = mosaic[k], c = chan(x, y);
          r = c === 0 ? v : 0; g = c === 1 ? v : 0; b = c === 2 ? v : 0;
        } else if (mode === "gray") {
          r = g = b = mosaic[k];
        } else if (mode === "demosaic") {
          r = demo[k * 3]; g = demo[k * 3 + 1]; b = demo[k * 3 + 2];
        } else {
          r = rgb[k * 4]; g = rgb[k * 4 + 1]; b = rgb[k * 4 + 2];
        }
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x * S, y * S, S, S);
      }
      root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("is-on", x.dataset.mode === mode));
    }
    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => draw(b.dataset.mode)));
    draw("gray");
  }

  /* ---------- 7. Rolling versus global shutter ---------- */
  function rolling() {
    const root = document.getElementById("rolling-sim");
    if (!root) return;
    const [live, shot] = root.querySelectorAll("canvas");
    const S = 220;
    [live, shot].forEach((c) => { c.width = S; c.height = S; });
    const lctx = live.getContext("2d"), sctx = shot.getContext("2d");
    const Rps = slider(root, "rps", () => {}, (v) => v + " rev/s");
    const Ro = slider(root, "readout", () => {}, (v) => v + " ms");
    let global = false;
    $(root, "[data-action=global]").addEventListener("click", (e) => {
      global = !global;
      e.target.textContent = global ? "Global shutter: on" : "Global shutter: off";
      e.target.classList.toggle("is-on", global);
    });

    // Is pixel (x, y) on a blade when the propeller is at angle a?
    function onBlade(x, y, a) {
      const dx = x - S / 2, dy = y - S / 2;
      if (dx * dx + dy * dy < 100) return true; // hub
      // Into the propeller's frame; the two blades are ellipses along u.
      const u = dx * Math.cos(a) + dy * Math.sin(a);
      const v = -dx * Math.sin(a) + dy * Math.cos(a);
      const p = (Math.abs(u) - S * 0.22) / (S * 0.23), q = v / (S * 0.05);
      return p * p + q * q <= 1;
    }
    const img = sctx.createImageData(S, S);
    let start = performance.now();
    function frame(now) {
      const t = (now - start) / 1000;
      const w = Rps.value() * 2 * Math.PI / 30; // shown 30x slower than real time
      const a = w * t;
      // live view
      lctx.fillStyle = "#111"; lctx.fillRect(0, 0, S, S);
      lctx.save(); lctx.translate(S / 2, S / 2); lctx.rotate(a);
      lctx.fillStyle = "#cfb97d";
      for (let k = 0; k < 2; k++) {
        lctx.rotate(Math.PI);
        lctx.beginPath(); lctx.ellipse(S * 0.22, 0, S * 0.23, S * 0.05, 0, 0, Math.PI * 2); lctx.fill();
      }
      lctx.beginPath(); lctx.arc(0, 0, 10, 0, Math.PI * 2); lctx.fill();
      lctx.restore();

      // captured frame: each row is read at a slightly later time
      const readout = Ro.value() / 1000;
      const wReal = Rps.value() * 2 * Math.PI;
      const d = img.data;
      for (let y = 0; y < S; y++) {
        const ay = global ? a : a + wReal * readout * (y / S);
        for (let x = 0; x < S; x++) {
          const i = (y * S + x) * 4;
          const on = onBlade(x, y, ay);
          d[i] = on ? 207 : 17; d[i + 1] = on ? 185 : 17; d[i + 2] = on ? 125 : 17; d[i + 3] = 255;
        }
      }
      sctx.putImageData(img, 0, 0);
      requestAnimationFrame(frame);
    }
    Rps.init(); Ro.init();
    // Only animate while visible, to save battery.
    let running = false;
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) { running = true; start = performance.now(); requestAnimationFrame(frame); }
    }).observe(root);
  }

  /* ---------- 8. Chromatic aberration ---------- */
  async function chromatic() {
    const root = document.getElementById("chroma-sim");
    if (!root) return;
    const canvas = $(root, "canvas");
    const ctx = canvas.getContext("2d");
    let img;
    try { img = await loadImage(MEDIA + "pinhole.jpg"); } catch { return; }
    const W = (canvas.width = 640), H = (canvas.height = Math.round((640 * img.height) / img.width));
    ctx.drawImage(img, 0, 0, W, H);
    const src = ctx.getImageData(0, 0, W, H).data;
    const K = slider(root, "k", draw, (v) => v.toFixed(1) + " %");
    function draw() {
      const k = K.value() / 100;
      const out = ctx.createImageData(W, H);
      const d = out.data;
      const cx = W / 2, cy = H / 2;
      const sample = (x, y, c) => {
        const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
        const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
        return src[(yi * W + xi) * 4 + c];
      };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        // red focuses slightly larger, blue slightly smaller than green
        d[i] = sample(cx + (x - cx) / (1 + k), cy + (y - cy) / (1 + k), 0);
        d[i + 1] = src[i + 1];
        d[i + 2] = sample(cx + (x - cx) / (1 - k), cy + (y - cy) / (1 - k), 2);
        d[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
    }
    K.init();
  }

  /* ---------- 9. Webcam color channels ---------- */
  function channels() {
    const root = document.getElementById("channels-demo");
    if (!root) return;
    const video = $(root, "video");
    const canvases = root.querySelectorAll("canvas");
    const button = $(root, "button");
    const status = $(root, ".sim__readout");
    let stream = null, running = false;
    const work = document.createElement("canvas");
    const wctx = work.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      } catch (e) {
        status.textContent = "Camera not available: " + e.message;
        return;
      }
      video.srcObject = stream;
      await video.play();
      const W = video.videoWidth, H = video.videoHeight;
      work.width = W; work.height = H;
      canvases.forEach((c) => { c.width = W; c.height = H; });
      running = true;
      button.textContent = "Stop camera";
      status.textContent = "Running on your device. Nothing is uploaded.";
      const loop = () => {
        if (!running) return;
        wctx.drawImage(video, 0, 0, W, H);
        const frame = wctx.getImageData(0, 0, W, H);
        canvases.forEach((c, ch) => {
          const out = new ImageData(W, H);
          for (let i = 0; i < frame.data.length; i += 4) {
            const v = frame.data[i + ch];
            out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
          }
          c.getContext("2d").putImageData(out, 0, 0);
        });
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
    pinhole(); zoom(); pinholeSize(); depthOfField(); exposure(); bayer(); rolling(); chromatic(); channels();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
