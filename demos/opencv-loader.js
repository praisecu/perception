/*
 * Loads OpenCV.js once per page and resolves with the ready `cv` object.
 * Every live demo calls window.loadOpenCV() and waits on it.
 */
(function () {
  const OPENCV_URL =
    "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
  let pending = null;

  window.loadOpenCV = function () {
    if (pending) return pending;

    pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = OPENCV_URL;
      script.async = true;
      script.onerror = () => reject(new Error("Could not download OpenCV.js"));
      script.onload = async () => {
        let cv = window.cv;
        // Recent builds expose a promise; older ones call onRuntimeInitialized.
        if (cv && cv.Mat) {
          resolve(cv);
        } else if (cv instanceof Promise) {
          cv = await cv;
          window.cv = cv;
          resolve(cv);
        } else if (cv && typeof cv.then === "function") {
          /*
           * The Emscripten module is "thenable" and resolves to itself, so
           * awaiting it never finishes. Take the module and drop its then.
           */
          cv.then((module) => {
            delete module.then;
            window.cv = module;
            resolve(module);
          });
        } else if (cv) {
          cv.onRuntimeInitialized = () => resolve(window.cv);
        } else {
          reject(new Error("OpenCV.js did not start"));
        }
      };
      document.head.appendChild(script);
    });

    return pending;
  };
})();
