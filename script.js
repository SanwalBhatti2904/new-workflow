/* ==========================================================================
   PART 1: FRAME SEQUENCER (ezgif-frame-001.jpg -> 241.jpg)
   ========================================================================== */
(function () {
  const canvas = document.getElementById("bg-canvas");
  const context = canvas.getContext("2d");
  const frameCount = 241;

  const currentFrame = (index) =>
    `person/ezgif-frame-${index.toString().padStart(3, "0")}.jpg`;

  const images = [];
  const state = { frame: 0 };

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
  }

  for (let i = 1; i <= frameCount; i++) {
    const img = new Image();
    img.src = currentFrame(i);
    images.push(img);
  }

  function render() {
    const img = images[state.frame];
    if (!img || !img.complete) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgWidth = img.width;
    const imgHeight = img.height;

    const ratio = Math.max(canvasWidth / imgWidth, canvasHeight / imgHeight);
    const newWidth = imgWidth * ratio;
    const newHeight = imgHeight * ratio;
    const x = (canvasWidth - newWidth) / 2;
    const y = (canvasHeight - newHeight) / 2;

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(img, x, y, newWidth, newHeight);
  }

  function updateFrameOnScroll() {
    const partOne = document.querySelector(".part-one-wrapper");
    const partOneHeight = partOne.offsetHeight - window.innerHeight;
    const scrollTop = window.scrollY;

    if (partOneHeight > 0) {
      const scrollFraction = Math.max(
        0,
        Math.min(1, scrollTop / partOneHeight),
      );
      const frameIndex = Math.min(
        frameCount - 1,
        Math.floor(scrollFraction * frameCount),
      );

      state.frame = frameIndex;
      requestAnimationFrame(render);
    }
  }

  images[0].onload = render;
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("scroll", updateFrameOnScroll);

  resizeCanvas();
})();

/* ==========================================================================
   PART 2: LATTICE WEBGL2 SHADER BACKDROP
   ========================================================================== */
(function () {
  "use strict";

  const CFG = {
    clear: "#05060b",
    bg: "#06070d",
    line: "#2c3d6b",
    hot: "#5cf2ff",
    cells: 1.4,
    speed: 0.28,
    grain: 0.016,
    dprCap: 1.5,
    maxFragments: 2400000,
    fps: 60,
    pointer: true,
  };

  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COARSE = matchMedia("(hover: none) and (pointer: coarse)").matches;
  const FINE = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const MOBILE = innerWidth < 768 || COARSE;

  const cv = document.getElementById("lattice-bg");
  const gl = cv.getContext("webgl2", {
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });

  if (!gl) {
    cv.style.background = CFG.clear;
    return;
  }

  const VERT = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 uRes; uniform float uTime; uniform vec2 uPointer; uniform float uOn;
uniform vec3 uBg, uLine, uHot; uniform float uCells, uSpeed, uGrain;

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

float grid(vec2 g, float w){
  vec2 d = abs(fract(g) - 0.5);
  vec2 f = fwidth(g) * w;
  vec2 l = smoothstep(f, vec2(0.0), d - f);
  return max(l.x, l.y);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 sp = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float horizon = 0.30;
  float y = sp.y - horizon;
  if (y > -0.006) {
    float glow = exp(-(y * y) / 0.0016) * 0.55;
    vec3 sky = uBg + uHot * glow;
    sky += (h21(gl_FragCoord.xy + fract(uTime) * 33.7) - 0.5) * uGrain;
    O = vec4(max(sky, 0.0), 1.0); return;
  }
  float z = 0.36 / -y;
  vec2 g = vec2(sp.x * z, z + uTime * uSpeed) * uCells;

  float line = grid(g, 0.9);

  vec2 pw = vec2((uPointer.x - 0.5) * uRes.x / uRes.y, 0.0);
  float pz = 0.36 / max(0.02, (0.5 - uPointer.y) + horizon);
  float d = length(vec2(sp.x * z, z) - vec2(pw.x * pz / max(pz, 0.001), pz));
  float ring = exp(-pow(d - 1.4, 2.0) * 1.6) * uOn;

  float fade = exp(-z * 0.10);
  vec3 col = uBg;
  col += uLine * line * fade;
  col += uHot * line * ring * 1.8 * fade;
  col += uHot * exp(-(y * y) / 0.0022) * 0.20;

  col += (h21(gl_FragCoord.xy + fract(uTime) * 33.7) - 0.5) * uGrain;
  O = vec4(max(col, 0.0), 1.0);
}`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || "";
      console.error(
        log +
          "\n" +
          src
            .split("\n")
            .map((l, i) => String(i + 1).padStart(3) + " | " + l)
            .join("\n"),
      );
      throw new Error("shader: " + log.split("\n")[0]);
    }
    return sh;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("link: " + gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  const U = {};
  for (
    let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    i < n;
    i++
  ) {
    const nm = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, "");
    U[nm] = gl.getUniformLocation(prog, nm);
  }

  const rgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  const MAX_FRAG = CFG.maxFragments || 2.6e6;
  let W = 0,
    H = 0;
  function fit() {
    const w = cv.clientWidth || innerWidth,
      h = cv.clientHeight || innerHeight;
    const byTier = Math.min(
      devicePixelRatio || 1,
      MOBILE ? 1.25 : CFG.dprCap || 1.75,
    );
    const byArea = Math.sqrt(MAX_FRAG / Math.max(1, w * h));
    const dpr = Math.max(0.6, Math.min(byTier, byArea));
    const nw = Math.round(w * dpr),
      nh = Math.round(h * dpr);
    if (nw === W && nh === H) return false;
    W = nw;
    H = nh;
    cv.width = W;
    cv.height = H;
    gl.viewport(0, 0, W, H);
    return true;
  }
  fit();

  let lastW = innerWidth;
  addEventListener(
    "resize",
    () => {
      if (MOBILE && innerWidth === lastW) return;
      lastW = innerWidth;
      fit();
    },
    { passive: true },
  );

  const P = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0 };
  if (FINE && !MOBILE && CFG.pointer !== false) {
    addEventListener(
      "pointermove",
      (e) => {
        P.tx = e.clientX / innerWidth;
        P.ty = 1 - e.clientY / innerHeight;
        P.on = 1;
      },
      { passive: true },
    );
  }

  gl.uniform3fv(U.uBg, rgb(CFG.bg));
  gl.uniform3fv(U.uLine, rgb(CFG.line));
  gl.uniform3fv(U.uHot, rgb(CFG.hot));
  gl.uniform1f(U.uCells, CFG.cells);
  gl.uniform1f(U.uSpeed, CFG.speed);
  gl.uniform1f(U.uGrain, CFG.grain);

  function draw(t) {
    if (fit()) gl.viewport(0, 0, W, H);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uTime, RM ? 3.0 : t);
    gl.uniform2f(U.uPointer, P.x, P.y);
    gl.uniform1f(U.uOn, P.on);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const t0 = performance.now();
  let last = t0,
    budget = 1000 / (MOBILE ? 30 : CFG.fps || 60);
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - last < budget) return;
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;
    const k = 1 - Math.pow(1 - 0.08, dt * 60);
    P.x += (P.tx - P.x) * k;
    P.y += (P.ty - P.y) * k;
    draw((now - t0) / 1000);
  }

  draw(0);
  requestAnimationFrame(loop);
})();

/* ==========================================================================
   PART 3: THREE.JS INTERACTIVE 3D BENTO MODEL
   ========================================================================== */
(function () {
  const canvas = document.getElementById("bento-3d-canvas");
  if (!canvas || typeof THREE === "undefined") return;

  const parent = canvas.parentElement;
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    45,
    parent.clientWidth / parent.clientHeight,
    0.1,
    100,
  );
  camera.position.z = 4.5;

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setSize(parent.clientWidth, parent.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Model container. Either the fallback primitives below, or the loaded
  // Tripo3D mesh, gets added to this group — everything downstream (mouse
  // interaction, resize, animate) treats the two identically.
  const group = new THREE.Group();
  scene.add(group);

  const WIRE_COLOR = 0x5cf2ff;

  // Original procedural wireframe. Kept as a fallback so the card never
  // renders empty before assets/prism-core.glb exists, or if it fails to load.
  function buildFallback() {
    const outerGeo = new THREE.IcosahedronGeometry(1.4, 1);
    const outerMat = new THREE.MeshBasicMaterial({
      color: WIRE_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    group.add(new THREE.Mesh(outerGeo, outerMat));

    const innerGeo = new THREE.OctahedronGeometry(0.8, 0);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xf3efe6,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });
    group.add(new THREE.Mesh(innerGeo, innerMat));
  }

  // Drop the .glb exported from Tripo3D here.
  const MODEL_URL = "assets/prism-core.glb";

  if (typeof THREE.GLTFLoader === "function") {
    new THREE.GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;

        // Force every mesh to the same cyan wireframe used across the site,
        // regardless of the model's own materials/textures. This keeps it
        // visually consistent with the lattice background and keeps the
        // card cheap to render (no texture downloads, no shading passes) —
        // handy on lower-spec machines and slow connections alike.
        model.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshBasicMaterial({
              color: WIRE_COLOR,
              wireframe: true,
              transparent: true,
              opacity: 0.55,
            });
          }
        });

        // Center the model and scale it to roughly the footprint the
        // fallback shape used, whatever size it came out of Tripo3D at.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        model.scale.setScalar(2.6 / maxDim);

        group.add(model);
      },
      undefined,
      buildFallback,
    );
  } else {
    buildFallback();
  }

  // Mouse Interaction
  let mouseX = 0,
    mouseY = 0;
  let targetX = 0,
    targetY = 0;

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    if (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      mouseX = (e.clientX - rect.left) / rect.width - 0.5;
      mouseY = (e.clientY - rect.top) / rect.height - 0.5;
    }
  });

  function resize() {
    if (!parent) return;
    camera.aspect = parent.clientWidth / parent.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(parent.clientWidth, parent.clientHeight);
  }

  window.addEventListener("resize", resize);

  function animate() {
    requestAnimationFrame(animate);

    targetX += (mouseX - targetX) * 0.05;
    targetY += (mouseY - targetY) * 0.05;

    group.rotation.y += 0.006;
    group.rotation.x = -targetY * 1.3;
    group.rotation.z = targetX * 0.4;

    renderer.render(scene, camera);
  }

  animate();
})();

/* ==========================================================================
   PART 3: DAWN / EPILOGUE — WEBGL SKY + POINTER-DRIVEN SUN
   ========================================================================== */
(function () {
  const canvas = document.getElementById("sol-scene");
  if (!canvas) return;

  const sunWrap = document.getElementById("sol-sunWrap");
  const sunTilt = document.getElementById("sol-sunTilt");
  const wrapper = canvas.parentElement;

  const HORIZON = 0.42;
  const REST_AZIMUTH = 0.62;
  const REST_ELEV_NORM = 0.62;
  const BOB_AMP_PX = 6;
  const BOB_HZ = 0.065;
  const TILT_MAX_DEG = 3;
  const POINTER_EASE_BASE = 0.045;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fpsCap = coarse ? 30 : 60;
  const frameBudget = 1000 / fpsCap;

  function restSunY() {
    return HORIZON + REST_ELEV_NORM * (1.0 - HORIZON) * 0.85;
  }

  let gl = null;
  let program = null;
  let uRes, uTime, uSun, uSettled;
  let glOk = false;

  try {
    gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (e) {
    gl = null;
  }

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("Shader compile error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  if (gl) {
    const vsSrc = document.getElementById("sol-vertexShader").textContent;
    const fsSrc = document.getElementById("sol-fragmentShader").textContent;
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (vs && fs) {
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        glOk = true;
        uRes = gl.getUniformLocation(program, "u_resolution");
        uTime = gl.getUniformLocation(program, "u_time");
        uSun = gl.getUniformLocation(program, "u_sun");
        uSettled = gl.getUniformLocation(program, "u_settled");
      } else {
        console.warn("Program link error:", gl.getProgramInfoLog(program));
      }
    }
  }

  if (!glOk) {
    // No WebGL2 → the wrapper's own dark background shows through instead
    // of a blank/black rectangle.
    canvas.style.display = "none";
  }

  function resize() {
    const w = wrapper.clientWidth || window.innerWidth;
    const h = wrapper.clientHeight || window.innerHeight;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      1.6,
      Math.sqrt(2.4e6 / (w * h)),
    );
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    if (glOk) gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener("resize", resize);
  resize();

  let azimuth = REST_AZIMUTH;
  let elevNorm = REST_ELEV_NORM;
  let targetAzimuth = REST_AZIMUTH;
  let targetElevNorm = REST_ELEV_NORM;
  let pointerXNorm = 0.5;

  if (!coarse && !reduced) {
    window.addEventListener(
      "pointermove",
      (e) => {
        const w = window.innerWidth,
          h = window.innerHeight;
        pointerXNorm = e.clientX / w;
        targetAzimuth = 0.18 + pointerXNorm * 0.64;
        const yNorm = 1.0 - e.clientY / h;
        targetElevNorm = 0.22 + yNorm * 0.62;
      },
      { passive: true },
    );
  }

  function sunYFromNorm(norm) {
    return HORIZON + norm * (1.0 - HORIZON) * 0.85;
  }

  function placeSun(az, sunY, tiltDeg, bobPx) {
    sunWrap.style.left = az * 100 + "%";
    sunWrap.style.top = (1 - sunY) * 100 + "%";
    sunTilt.style.transform =
      "translate(-50%,-50%) translateY(" +
      bobPx +
      "px) rotate(" +
      tiltDeg +
      "deg)";
  }

  placeSun(REST_AZIMUTH, restSunY(), 0, 0);

  let lastTime = performance.now();
  let lastFrameTime = 0;
  let elapsed = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dtMs = now - lastTime;
    lastTime = now;

    if (now - lastFrameTime < frameBudget) return;
    lastFrameTime = now;

    const dt = Math.min(dtMs, 64) / 1000;
    elapsed += dt;

    if (!reduced) {
      const k = 1 - Math.pow(1 - POINTER_EASE_BASE, dt * 60);
      azimuth += (targetAzimuth - azimuth) * k;
      elevNorm += (targetElevNorm - elevNorm) * k;
    } else {
      azimuth = REST_AZIMUTH;
      elevNorm = REST_ELEV_NORM;
    }

    const sunY = sunYFromNorm(elevNorm);

    if (glOk) {
      gl.useProgram(program);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduced ? 0.0 : elapsed);
      gl.uniform2f(uSun, azimuth, sunY);
      gl.uniform1f(uSettled, reduced ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    let bobPx = 0;
    if (!reduced) {
      bobPx = Math.sin(elapsed * 2 * Math.PI * BOB_HZ) * BOB_AMP_PX;
    }
    let tiltDeg = 0;
    if (!reduced && !coarse) {
      tiltDeg = Math.max(
        -TILT_MAX_DEG,
        Math.min(TILT_MAX_DEG, (pointerXNorm - 0.5) * 2 * TILT_MAX_DEG),
      );
    }

    placeSun(azimuth, sunY, tiltDeg, bobPx);
  }
  requestAnimationFrame(frame);
})();

/* ==========================================================================
   INTERSECTION OBSERVER SCROLL REVEALS
   ========================================================================== */
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setFinalCount(el) {
    el.textContent = el.getAttribute("data-count-to");
  }

  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count-to"), 10);
    if (isNaN(target)) return;
    var duration = 900;
    var start = performance.now();
    function step(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var targets = document.querySelectorAll("[data-reveal]");

  if (reduced) {
    // Respect the no-motion preference, but still reveal the content —
    // skipping the observer entirely would leave it invisible forever.
    targets.forEach(function (t) {
      t.classList.add("is-visible");
      t.querySelectorAll("[data-count-to]").forEach(setFinalCount);
    });
    return;
  }

  var io = new IntersectionObserver(
    function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          entry.target
            .querySelectorAll("[data-count-to]")
            .forEach(animateCount);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
  );

  targets.forEach(function (t) {
    io.observe(t);
  });
})();

/* ==========================================================================
   GLOBAL BOOT LOADER
   Loads the frame sequence + fonts, then waits briefly for WebGL canvases
   to render. A timeout prevents a missing optional asset from blocking the site.
   ========================================================================== */
(function () {
  const loader = document.getElementById("site-loader");
  const fill = document.getElementById("site-loader-fill");
  const percent = document.getElementById("site-loader-percent");
  const status = document.getElementById("site-loader-status");
  if (!loader) return;

  const FRAME_COUNT = 241;
  const framePromises = [];
  let loadedFrames = 0;

  function setProgress(value, label) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    fill.style.width = v + "%";
    percent.textContent = v + "%";
    if (label) status.textContent = label;
  }

  // Use the same asset path as the existing scroll sequencer.
  for (let i = 1; i <= FRAME_COUNT; i++) {
    framePromises.push(
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          loadedFrames++;
          setProgress(
            (loadedFrames / FRAME_COUNT) * 72,
            "LOADING FRAME SEQUENCE",
          );
          resolve();
        };
        img.onerror = () => {
          loadedFrames++;
          setProgress(
            (loadedFrames / FRAME_COUNT) * 72,
            "LOADING FRAME SEQUENCE",
          );
          resolve();
        };
        img.src = `person/ezgif-frame-${String(i).padStart(3, "0")}.jpg`;
      }),
    );
  }

  const fontsReady = document.fonts
    ? document.fonts.ready.catch(() => {})
    : Promise.resolve();

  const firstPaint = new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const allFrames = Promise.all(framePromises);

  Promise.all([allFrames, fontsReady, firstPaint]).then(() => {
    setProgress(86, "INITIALISING ANIMATIONS");

    // Give WebGL/Three.js one or two frames to compile and draw.
    const started = performance.now();
    function waitForVisuals(now) {
      const canvasesReady =
        document.getElementById("lattice-bg") &&
        document.getElementById("sol-scene");
      if (canvasesReady || now - started > 900) {
        setProgress(100, "READY");
        setTimeout(() => loader.classList.add("is-done"), 220);
        return;
      }
      requestAnimationFrame(waitForVisuals);
    }
    requestAnimationFrame(waitForVisuals);
  });

  // Hard failsafe: never trap the user on a loader because of a missing frame.
  setTimeout(() => {
    if (!loader.classList.contains("is-done")) {
      setProgress(100, "READY");
      setTimeout(() => loader.classList.add("is-done"), 180);
    }
  }, 6500);
})();

/* ==========================================================================
   BUTTERY SCROLL — LENIS + GSAP-STYLE TYPOGRAPHY REVEALS
   Keeps native document flow and all existing scroll-driven canvases intact.
   ========================================================================== */
(function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasLenis = typeof window.Lenis === "function";
  const hasGSAP = typeof window.gsap !== "undefined";

  if (reduced) {
    document.documentElement.classList.add("motion-reduced");
  }

  /* Lenis is deliberately tuned for a slow, soft, premium glide rather than
     a fast inertial scroll. It does not change the page's actual height. */
  let lenis = null;
  if (hasLenis && !reduced) {
    lenis = new Lenis({
      duration: 1.35,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.78,
      touchMultiplier: 1,
      lerp: 0.075,
      orientation: "vertical",
      gestureOrientation: "vertical",
      autoRaf: false,
    });
    window.__prismaLenis = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  if (!hasGSAP) return;

  const ease = "power3.out";
  // Keep the hero wordmark out of the word-splitting system. The Prisma
  // wordmark already has its own entrance animation; splitting it into child
  // spans with opacity:0 can make the logo disappear if GSAP loads late.
  const targets = document.querySelectorAll(
    ".part-one-wrapper h2, .part-one-wrapper .lead, " +
      ".part-two-wrapper h2, .part-two-wrapper h3, .part-two-wrapper .lead, " +
      ".part-three-wrapper .sol-headline, .part-three-wrapper .sol-description",
  );

  /* Word-level masking gives the same restrained editorial feel as modern
     GSAP landing pages, without SplitText or another dependency. */
  targets.forEach(function (el) {
    if (el.dataset.gsapSplit === "1") return;
    el.dataset.gsapSplit = "1";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      const text = node.nodeValue;
      if (!text.trim()) return;
      const frag = document.createDocumentFragment();
      text.split(/(\s+)/).forEach(function (part) {
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else if (part) {
          const span = document.createElement("span");
          span.className = "reveal-word";
          span.textContent = part;
          frag.appendChild(span);
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.classList.add("gsap-text-reveal", "gsap-text-ready");
  });

  if (reduced) {
    gsap.set(".gsap-text-reveal .reveal-word", {
      yPercent: 0,
      opacity: 1,
      filter: "blur(0px)",
    });
    return;
  }

  const textEls = document.querySelectorAll(".gsap-text-reveal");
  textEls.forEach(function (el) {
    const words = el.querySelectorAll(".reveal-word");
    gsap.set(words, { yPercent: 105, opacity: 0, filter: "blur(3px)" });

    gsap.to(words, {
      yPercent: 0,
      opacity: 1,
      filter: "blur(0px)",
      duration: 1.15,
      stagger: 0.035,
      ease: ease,
      scrollTrigger: undefined,
      paused: true,
    });

    /* Lightweight viewport trigger so GSAP is used for the actual motion,
       while IntersectionObserver remains responsible for the site's existing
       reveal system. */
    const io = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          gsap.to(entry.target.querySelectorAll(".reveal-word"), {
            yPercent: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 1.15,
            stagger: 0.035,
            ease: ease,
            overwrite: true,
          });
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
  });

  /* Expose a tiny refresh hook for pages that dynamically resize their WebGL
     canvases. */
  window.__prismaRefreshScroll = function () {
    if (lenis && typeof lenis.resize === "function") lenis.resize();
  };
})();
