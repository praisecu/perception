/*
 * Live Canny edge detection on the reader's webcam with OpenCV.js.
 * Markup: demos/_canny.qmd. Video never leaves the reader's device.
 */
(function () {
  const root = document.getElementById("canny-demo");
  if (!root) return;

  const video = root.querySelector("video");
  const canvas = root.querySelector("canvas");
  const button = root.querySelector("button");
  const status = root.querySelector(".cv-demo__status");
  const low = root.querySelector('input[name="low"]');
  const high = root.querySelector('input[name="high"]');
  const blur = root.querySelector('input[name="blur"]');

  for (const input of [low, high, blur]) {
    const out = input.parentElement.querySelector("output");
    const show = () => (out.textContent = input.value);
    input.addEventListener("input", show);
    show();
  }

  let stream = null;
  let running = false;

  async function start() {
    button.disabled = true;
    status.textContent = "Loading OpenCV.js (about 10 MB, first time only)…";

    let cv;
    try {
      cv = await window.loadOpenCV();
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
      return;
    }

    status.textContent = "Asking for camera access…";
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
    } catch (error) {
      status.textContent = "Camera not available: " + error.message;
      button.disabled = false;
      return;
    }

    video.srcObject = stream;
    await video.play();
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const cap = new cv.VideoCapture(video);
    const frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    const gray = new cv.Mat();
    const edges = new cv.Mat();

    running = true;
    button.textContent = "Stop camera";
    button.disabled = false;
    status.textContent = "Running on your device. Nothing is uploaded.";

    const loop = () => {
      if (!running) {
        frame.delete();
        gray.delete();
        edges.delete();
        return;
      }
      cap.read(frame);
      cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
      const k = Number(blur.value) * 2 + 1;
      if (k > 1) cv.GaussianBlur(gray, gray, new cv.Size(k, k), 0);
      cv.Canny(gray, edges, Number(low.value), Number(high.value));
      cv.imshow(canvas, edges);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    button.textContent = "Start camera";
    status.textContent = "Camera stopped.";
  }

  button.addEventListener("click", () => (running ? stop() : start()));
})();
