let faceapi;
let detections = [];
let video;
let gfx;

const labels = ["neutral", "happy", "angry", "sad", "disgusted", "surprised", "fearful"];

let drawScale = 1;
let drawOffX = 0;
let drawOffY = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  video = createCapture({
    video: { width: 640, height: 480 }
  });
  video.size(640, 480);
  video.hide();

  textFont("Courier New");

  gfx = createGraphics(video.width, video.height);
  gfx.pixelDensity(1);

  const faceOptions = {
    withLandmarks: true,
    withExpressions: true,
    withDescriptors: false,
    minConfidence: 0.5
  };

  faceapi = ml5.faceApi(video, faceOptions, () => {
    console.log("✅ FaceAPI loaded");
    detectFaces();
  });

  updateVideoTransform();
}

function detectFaces() {
  faceapi.detect((err, result) => {
    if (err) {
      console.error(err);
      return;
    }
    detections = result || [];
    setTimeout(detectFaces, 200);
  });
}

// Compute a centre-cropped, aspect-preserving transform (like CSS background-size: cover)
function updateVideoTransform() {
  const vw = video.width;
  const vh = video.height;

  drawScale = Math.max(width / vw, height / vh);
  const dw = vw * drawScale;
  const dh = vh * drawScale;

  drawOffX = (width - dw) * 0.5;
  drawOffY = (height - dh) * 0.5;
}

function toScreenX(x) {
  return drawOffX + x * drawScale;
}
function toScreenY(y) {
  return drawOffY + y * drawScale;
}

function draw() {
  background(0);

  drawDuotoneVideo();
  image(gfx, drawOffX, drawOffY, video.width * drawScale, video.height * drawScale);

  if (detections.length > 0) {
    drawFaceBoxes();
    drawLandmarks();

    // Face 1: bottom-left, left-aligned
    drawExpressionsForFace(0, "left");

    // Face 2: bottom-right, right-aligned (only if present)
    if (detections.length > 1) drawExpressionsForFace(1, "right");
  }
}

function drawDuotoneVideo() {
  gfx.loadPixels();
  video.loadPixels();

  for (let y = 0; y < video.height; y++) {
    for (let x = 0; x < video.width; x++) {
      const index = (x + y * video.width) * 4;
      const r = video.pixels[index];
      const g = video.pixels[index + 1];
      const b = video.pixels[index + 2];
      const avg = (r + g + b) / 3;

      // Gradient map from dark blue to white
      const rMap = map(avg, 0, 255, 0, 255);
      const gMap = map(avg, 0, 255, 0, 255);
      const bMap = map(avg, 0, 255, 255, 255);

      gfx.pixels[index] = rMap;
      gfx.pixels[index + 1] = gMap;
      gfx.pixels[index + 2] = bMap;
      gfx.pixels[index + 3] = 255;
    }
  }

  gfx.updatePixels();
}

function drawFaceBoxes() {
  for (let det of detections) {
    const { _x, _y, _width, _height } = det.alignedRect._box;

    stroke(0, 255, 255);
    strokeWeight(2);
    noFill();

    rect(
      toScreenX(_x),
      toScreenY(_y),
      _width * drawScale,
      _height * drawScale
    );
  }
}

function drawLandmarks() {
  for (let det of detections) {
    const points = det.landmarks.positions;

    stroke(255);
    strokeWeight(2);

    for (let pt of points) {
      point(toScreenX(pt._x), toScreenY(pt._y));
    }
  }
}

function drawExpressionsForFace(faceIndex, alignSide) {
  const det = detections[faceIndex];
  if (!det) return;

  const expr = det.expressions || {};

  const margin = 20;
  const lineH = 28;

  textSize(22);
  noStroke();
  fill(255);

  let x, y;
  if (alignSide === "left") {
    textAlign(LEFT, TOP);
    x = margin;
    y = height - margin - (lineH * (labels.length + 2)); // title + blank + 7 lines
    text(`FACE ${faceIndex + 1}`, x, y);
    y += lineH + 8;

    for (let i = 0; i < labels.length; i++) {
      const key = labels[i];
      const val = expr[key] ?? 0;
      text(`${key}: ${nf(val * 100, 2, 2)}%`, x, y + i * lineH);
    }
  } else {
    textAlign(RIGHT, TOP);
    x = width - margin;
    y = height - margin - (lineH * (labels.length + 2));
    text(`FACE ${faceIndex + 1}`, x, y);
    y += lineH + 8;

    for (let i = 0; i < labels.length; i++) {
      const key = labels[i];
      const val = expr[key] ?? 0;
      text(`${key}: ${nf(val * 100, 2, 2)}%`, x, y + i * lineH);
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateVideoTransform();
}
