let faceapi;
let detections = [];

let video;
let gfx;

const LABELS = ["neutral", "happy", "angry", "sad", "disgusted", "surprised", "fearful"];

// Mobile behaviour
const MIRROR_CAMERA = true;

// Low resolution is the single biggest performance win on iPhone
const IDEAL_W = 320;
const IDEAL_H = 240;

// Throttle expensive work
const DETECT_INTERVAL_MS = 450; // face detection rate
const PROCESS_EVERY_N_FRAMES = 3; // pixel processing rate

// State
let started = false;
let cameraReady = false;
let modelsReady = false;

let statusLine = "TAP TO START";
let lastError = "";

// Camera draw transform (contain, centred)
let s = 1;
let ox = 0;
let oy = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  textFont("Courier New");

  // Create capture
  video = createCapture({
    video: {
      facingMode: "user",
      width: { ideal: IDEAL_W },
      height: { ideal: IDEAL_H }
    },
    audio: false
  });
  video.hide();

  // iOS Safari: inline video
  const v = video.elt;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.muted = true;

  // Load FaceAPI models
  statusLine = "LOADING FACE MODELS…";
  faceapi = ml5.faceApi(
    video,
    {
      withLandmarks: true,
      withExpressions: true,
      withDescriptors: false,
      minConfidence: 0.6
    },
    () => {
      modelsReady = true;
      statusLine = "TAP TO START";
    }
  );

  // Do not rely on onloadedmetadata on iOS, poll instead
  pollForCameraDimensions();
}

function draw() {
  background(0);

  if (!started) {
    drawOverlay(statusLine);
    return;
  }

  if (!cameraReady) {
    drawOverlay("STARTING CAMERA…");
    return;
  }

  // Light, fast processing (optional). This is intentionally minimal.
  if (frameCount % PROCESS_EVERY_N_FRAMES === 0) {
    processVideoFast();
  }

  drawVideoContained();

  // UI always at bottom, regardless of detection state
  drawBottomReadouts();

  // Optional overlays
  if (detections.length > 0) {
    drawFaceBoxes();
    drawLandmarks();
  }
}

function touchStarted() {
  return startIfNeeded();
}

function mousePressed() {
  return startIfNeeded();
}

function startIfNeeded() {
  if (started) return false;

  started = true;

  // iOS needs a gesture to actually start the stream in many cases
  try {
    video.elt.play();
  } catch (e) {}

  pollForCameraDimensions();
  waitForReadyThenDetect();

  return false;
}

function waitForReadyThenDetect() {
  if (!modelsReady) {
    statusLine = "LOADING FACE MODELS…";
    setTimeout(waitForReadyThenDetect, 120);
    return;
  }
  if (!cameraReady) {
    statusLine = "STARTING CAMERA…";
    setTimeout(waitForReadyThenDetect, 120);
    return;
  }

  statusLine = "RUNNING";
  detectLoop();
}

function detectLoop() {
  faceapi.detect((err, res) => {
    if (err) {
      lastError = "FaceAPI error. Refresh, allow camera, try again.";
    } else {
      detections = res || [];
    }
    setTimeout(detectLoop, DETECT_INTERVAL_MS);
  });
}

function pollForCameraDimensions() {
  const v = video?.elt;
  if (!v) {
    setTimeout(pollForCameraDimensions, 100);
    return;
  }

  const vw = v.videoWidth;
  const vh = v.videoHeight;

  if (vw && vh) {
    // Lock p5 video size to the real stream size
    video.size(vw, vh);

    gfx = createGraphics(vw, vh);
    gfx.pixelDensity(1);

    updateContainTransform();
    cameraReady = true;
    return;
  }

  setTimeout(pollForCameraDimensions, 120);
}

// Contain transform (no crop, no stretch)
function updateContainTransform() {
  if (!video || !video.width || !video.height) return;

  s = Math.min(width / video.width, height / video.height);
  ox = (width - video.width * s) * 0.5;
  oy = (height - video.height * s) * 0.5;
}

function drawVideoContained() {
  push();
  translate(ox, oy);
  scale(s);

  if (MIRROR_CAMERA) {
    translate(video.width, 0);
    scale(-1, 1);
  }

  image(gfx, 0, 0);
  pop();
}

// Minimal, fast “look” without heavy duotone mapping
// This avoids huge pixel cost that can stall mobile ML.
function processVideoFast() {
  gfx.loadPixels();
  video.loadPixels();
  if (!video.pixels || video.pixels.length === 0) return;

  const n = video.width * video.height * 4;

  // Simple cool tint and contrast-ish curve
  for (let i = 0; i < n; i += 4) {
    const r = video.pixels[i];
    const g = video.pixels[i + 1];
    const b = video.pixels[i + 2];

    // Luma
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Curve: keep it cheap
    const c = constrain(y * 1.05, 0, 255);

    // Cool tint
    gfx.pixels[i] = c * 0.85;
    gfx.pixels[i + 1] = c * 0.95;
    gfx.pixels[i + 2] = 255 - (255 - c) * 0.6;
    gfx.pixels[i + 3] = 255;
  }

  gfx.updatePixels();
}

function drawBottomReadouts() {
  const margin = 16;
  const lineH = 20;

  // Reserve space at bottom
  const blockH = (LABELS.length + 1) * lineH;
  const yBase = height - margin - blockH;

  fill(255);
  noStroke();
  textSize(16);

  if (!cameraReady) {
    textAlign(CENTER, TOP);
    text("Starting camera…", width / 2, yBase);
    return;
  }

  if (!modelsReady) {
    textAlign(CENTER, TOP);
    text("Loading FaceAPI…", width / 2, yBase);
    return;
  }

  if (detections.length === 0) {
    textAlign(CENTER, TOP);
    text("No face detected", width / 2, yBase);
    if (lastError) {
      textSize(12);
      text(lastError, width / 2, yBase + 26);
    }
    return;
  }

  // Face 1 left, face 2 right
  drawExpressions(0, margin, yBase, "left");

  if (detections.length > 1) {
    drawExpressions(1, width - margin, yBase, "right");
  }
}

function drawExpressions(faceIndex, x, y, side) {
  const det = detections[faceIndex];
  if (!det) return;

  const expr = det.expressions || {};

  textAlign(side === "left" ? LEFT : RIGHT, TOP);
  text(`FACE ${faceIndex + 1}`, x, y);
  y += 20;

  for (let i = 0; i < LABELS.length; i++) {
    const k = LABELS[i];
    const v = expr[k] ?? 0;
    text(`${k}: ${nf(v * 100, 2, 2)}%`, x, y + i * 20);
  }
}

function drawOverlay(msg) {
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);

  textSize(22);
  text(msg, width / 2, height / 2);

  textSize(13);
  text(
    "If stuck: iOS Settings → Safari → Camera → Allow",
    width / 2,
    height / 2 + 40
  );
}

function toScreenX(x) {
  return ox + x * s;
}

function toScreenY(y) {
  return oy + y * s;
}

function drawFaceBoxes() {
  stroke(0, 255, 255);
  strokeWeight(2);
  noFill();

  for (const det of detections) {
    const { _x, _y, _width, _height } = det.alignedRect._box;

    let bx = _x;
    if (MIRROR_CAMERA) bx = video.width - _x - _width;

    rect(
      toScreenX(bx),
      toScreenY(_y),
      _width * s,
      _height * s
    );
  }
}

function drawLandmarks() {
  stroke(255);
  strokeWeight(2);

  for (const det of detections) {
    const pts = det.landmarks.positions;
    for (const p of pts) {
      let px = p._x;
      if (MIRROR_CAMERA) px = video.width - px;
      point(toScreenX(px), toScreenY(p._y));
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateContainTransform();
}
