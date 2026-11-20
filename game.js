import * as THREE from "./vendor/three/three.module.min.js";
import { fighters } from "./fighters.js";
import { sound } from "./sound.js";
import { TournamentManager, difficultyForStage, formatTournamentTime } from "./tournament.js";
import { createComboInput, bufferInput, advanceInputClock, resolveComboInput, endComboAttack, clearComboInput } from "./combo.js";
import { attackHeight, defenseOutcome, isCounterHit } from "./defense.js";
import { InputState, keyboardActions, gamepadActions } from "./input.js";

const mount = document.querySelector("#game-canvas");
const rosterNode = document.querySelector("#roster");
const selectScreen = document.querySelector("#select-screen");
const resultScreen = document.querySelector("#result-screen");
const ladderScreen = document.querySelector("#ladder-screen");
const continueScreen = document.querySelector("#continue-screen");
const pauseScreen = document.querySelector("#pause-screen");
const pauseButton = document.querySelector("#pause-button");
const stageElement = document.querySelector(".stage");
const calloutLayer = document.querySelector("#callout-layer");
const announcer = document.querySelector("#announcer");
const toast = document.querySelector("#signature-toast");
const controllerToast = document.querySelector("#controller-toast");
const startButton = document.querySelector("#start-button");
const musicToggle = document.querySelector("#music-toggle");
const touchToggle = document.querySelector("#touch-toggle");
const touchControls = document.querySelector("#touch-controls");
const rotatePrompt = document.querySelector("#rotate-prompt");
const playerHealthNode = document.querySelector("#player-health");
const opponentHealthNode = document.querySelector("#opponent-health");
const playerTrailNode = document.querySelector("#player-trail");
const opponentTrailNode = document.querySelector("#opponent-trail");
const timerNode = document.querySelector("#timer");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#33243b");
scene.fog = new THREE.FogExp2("#33243b", 0.025);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
camera.position.set(0, 7.4, 17.4);
camera.lookAt(0, 1.5, -0.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
mount.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight("#b5a5bf", "#1a1424", 0.7);
scene.add(ambientLight);
const keyLight = new THREE.SpotLight("#ffe1a0", 190, 32, Math.PI / 3.3, 0.32, 2);
keyLight.position.set(-2, 11, 3);
keyLight.target.position.set(0, 0, -0.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0003;
keyLight.shadow.normalBias = 0.025;
scene.add(keyLight, keyLight.target);
const rimLight = new THREE.DirectionalLight("#788fce", 1.1);
rimLight.position.set(2, 5, -6);
scene.add(rimLight);

const clock = new THREE.Clock();
const fightersById = new Map(fighters.map((fighter) => [fighter.id, fighter]));
const inputState = new InputState();
const lastTap = { up: 0, down: 0 };
const touchPointers = new Map();
const gamepadPrevious = new Map();
let touchEnabled = "ontouchstart" in window || navigator.maxTouchPoints > 0;
const fightersInMatch = [];
const ballots = [];
const particles = [];
const impactEffects = [];
const sidestepGhosts = [];
const callouts = [];
const comicWords = ["RIBALTONE!", "VETO!", "FIDUCIA!", "QUORUM!"];
const cameraRig = new THREE.Vector3(0, 7.4, 17.4);
const cameraTarget = new THREE.Vector3(0, 1.5, -0.5);
const sparkGeometry = new THREE.OctahedronGeometry(0.07, 0);
const ringGeometry = new THREE.RingGeometry(0.68, 0.82, 16);

let selectedId = null;
let player = null;
let opponent = null;
let tournament = null;
let tournamentStartedAt = 0;
let ladderTimeout = null;
let continueInterval = null;
let continueDeadline = 0;
let matchActive = false;
let isPaused = false;
let matchOver = false;
let matchCheckpoint = null;
let victory = null;
let elapsed = 60;
let hitStop = 0;
let shake = 0;
let cameraTilt = 0;
let toastTimer = 0;
let bannerTimer = 0;
let bannerPending = false;
let nextBallot = 0;
let announcerTimer = 0;
let pausedAnimations = [];
let controllerNoticeUntil = 0;

const clamp = THREE.MathUtils.clamp;
const random = (min, max) => min + Math.random() * (max - min);

function resize() {
  const width = Math.max(mount.clientWidth, 1);
  const height = Math.max(mount.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

function material(color, roughness = 0.78, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}

function addBox(parent, size, position, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    material(color, options.roughness, options.metalness)
  );
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = options.receiveShadow !== false;
  if (options.rotation) mesh.rotation.set(...options.rotation);
  parent.add(mesh);
  return mesh;
}

function addSphere(parent, radius, position, color, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeFlag(parent, x, y, z, colors) {
  addBox(parent, [0.035, 0.8, 0.035], [x, y + 0.38, z], "#d9c7a0");
  colors.forEach((color, index) => {
    addBox(parent, [0.29, 0.24, 0.025], [x + 0.16, y + 0.65 - index * 0.24, z], color);
  });
}

function createArena() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 20),
    material("#70533e", 0.94)
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  scene.add(floor);

  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(7.5, 7.7, 0.18, 48),
    material("#8e6042", 0.82)
  );
  stage.position.y = 0.02;
  stage.receiveShadow = true;
  stage.castShadow = true;
  scene.add(stage);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.7, 0.045, 8, 72),
    material("#eacb8b", 0.35, 0.38)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.13;
  scene.add(ring);

  addBox(scene, [21, 6, 0.45], [0, 3, -9], "#3e3043");
  addBox(scene, [19, 0.4, 0.52], [0, 5.7, -8.72], "#7b5143");

  for (let row = 0; row < 3; row += 1) {
    const radius = 4.4 + row * 1.05;
    const count = 18 + row * 2;
    for (let i = 0; i < count; i += 1) {
      const angle = -1.12 + (2.24 * i) / (count - 1);
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius - 1.55;
      const bench = new THREE.Group();
      bench.position.set(x, row * 0.24, z);
      bench.rotation.y = angle * 0.45;
      addBox(bench, [0.93, 0.4, 0.44], [0, 0.25, 0], "#552b3a");
      addBox(bench, [0.93, 0.43, 0.17], [0, 0.56, -0.15], "#77384a");
      addBox(bench, [0.82, 0.045, 0.035], [0, 0.46, 0.17], "#bd8a55");
      scene.add(bench);
    }
  }

  const podium = new THREE.Group();
  podium.position.set(0, 0.12, -6.55);
  addBox(podium, [1.8, 1.35, 0.84], [0, 0.66, 0], "#6e422c");
  addBox(podium, [2.05, 0.14, 1.05], [0, 1.39, 0], "#b17b4b");
  addBox(podium, [1.3, 0.65, 0.045], [0, 0.78, 0.43], "#8c5734");
  addBox(podium, [1.2, 0.08, 0.05], [0, 1.13, 0.47], "#e1bd79");
  const seal = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 16),
    material("#d8b15c", 0.35, 0.45)
  );
  seal.position.set(0, 0.78, 0.47);
  podium.add(seal);
  scene.add(podium);

  makeFlag(scene, -2.2, 3.35, -7.9, ["#17965d", "#f7f1e4", "#d94c4c"]);
  makeFlag(scene, 2.2, 3.35, -7.9, ["#2757ac", "#efc74b", "#2757ac"]);

  for (let i = 0; i < 10; i += 1) {
    const x = -8.2 + i * 1.82;
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 3.8, 8),
      material("#b18a69", 0.6)
    );
    column.position.set(x, 2.65, -8.56);
    column.castShadow = true;
    scene.add(column);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.18, 0.6),
      material("#d1ae84")
    );
    cap.position.set(x, 4.62, -8.56);
    scene.add(cap);
  }

  const ceiling = new THREE.Mesh(
    new THREE.SphereGeometry(12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: "#634b67", side: THREE.BackSide })
  );
  ceiling.position.y = 4.8;
  ceiling.rotation.x = Math.PI;
  scene.add(ceiling);

}

function addGlasses(group) {
  for (const x of [-0.14, 0.14]) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.018, 5, 12),
      material("#28272d", 0.36, 0.25)
    );
    rim.position.set(x, 0.08, 0.44);
    group.add(rim);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.095, 8),
      new THREE.MeshStandardMaterial({ color: "#b9dbe5", transparent: true, opacity: 0.2, depthWrite: false, flatShading: true })
    );
    lens.position.set(x, 0.08, 0.435);
    group.add(lens);
  }
  addBox(group, [0.1, 0.026, 0.03], [0, 0.08, 0.44], "#29272b");
}

function createProp(hand, fighter) {
  const prop = new THREE.Group();
  prop.name = `${fighter.id}-prop`;
  prop.rotation.z = -2.2;
  hand.add(prop);
  switch (fighter.prop) {
    case "shovel": {
      addBox(prop, [0.38, 0.16, 0.24], [0.15, 0.07, 0], "#dfaa22");
      addBox(prop, [0.12, 0.65, 0.14], [0.36, 0.32, 0], "#efc52e", { rotation: [0, 0, -0.55] });
      addSphere(prop, 0.09, [0.53, 0.58, 0], "#4b4b48");
      addBox(prop, [0.12, 0.48, 0.14], [0.68, 0.42, 0], "#f4ca36", { rotation: [0, 0, 0.65] });
      addBox(prop, [0.3, 0.18, 0.28], [0.79, 0.2, 0], "#efbd21", { rotation: [0, 0, 0.35] });
      addBox(prop, [0.3, 0.035, 0.29], [0.82, 0.11, 0], "#6e6145");
      const label = document.createElement("canvas");
      label.width = 128;
      label.height = 32;
      const context = label.getContext("2d");
      context.fillStyle = "#efbd21";
      context.fillRect(0, 0, label.width, label.height);
      context.fillStyle = "#302c24";
      context.font = "bold 24px sans-serif";
      context.textAlign = "center";
      context.fillText("RUSPA", 64, 24);
      const texture = new THREE.CanvasTexture(label);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      const lettering = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.07),
        new THREE.MeshBasicMaterial({ map: texture })
      );
      lettering.position.set(0.79, 0.2, 0.145);
      lettering.rotation.z = 0.35;
      prop.add(lettering);
      break;
    }
    case "briefcase": {
      addBox(prop, [0.55, 0.4, 0.2], [0.12, -0.15, 0], "#8c5c37");
      addBox(prop, [0.19, 0.045, 0.045], [0.12, 0.1, 0.12], "#d7b15d");
      addBox(prop, [0.035, 0.8, 0.035], [0.4, 0.38, 0], "#d9c7a0");
      addBox(prop, [0.48, 0.3, 0.025], [0.65, 0.64, 0], "#174a9e");
      for (let i = 0; i < 12; i += 1) {
        const angle = i * Math.PI / 6;
        addSphere(prop, 0.018, [0.65 + Math.cos(angle) * 0.1, 0.64 + Math.sin(angle) * 0.1, 0.02], "#f4d94c");
      }
      break;
    }
    case "dossier":
      for (let i = 0; i < 5; i += 1) {
        addBox(prop, [0.64, 0.11, 0.42], [0.12, i * 0.1 - 0.19, 0.05], i % 2 ? "#fffaf0" : "#e5e1d8");
        addBox(prop, [0.06, 0.105, 0.43], [-0.17, i * 0.1 - 0.19, 0.05], "#b9453c");
      }
      break;
    case "microphone":
      addBox(prop, [0.07, 0.48, 0.07], [0, 0.18, 0], "#33323a");
      addSphere(prop, 0.1, [0, 0.46, 0], "#55545d", [1, 1.25, 1]);
      break;
    case "palette":
      addBox(prop, [0.46, 0.31, 0.08], [0.07, 0.02, 0], "#e5d3b6");
      ["#e2655e", "#e7c854", "#70b988", "#618dc8"].forEach((color, index) => {
        addSphere(prop, 0.075, [-0.08 + index * 0.105, 0.05, 0.07], color);
      });
      break;
    case "pen": {
      addBox(prop, [0.09, 0.7, 0.09], [0, 0.16, 0], "#d8ad4c", { metalness: 0.45 });
      addBox(prop, [0.3, 0.06, 0.08], [0, 0.05, 0], "#f1d27b", { metalness: 0.45 });
      const nib = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), material("#ffdf7b", 0.3, 0.5));
      nib.position.y = 0.61;
      prop.add(nib);
      break;
    }
    case "plant": {
      addBox(prop, [0.09, 1.05, 0.09], [0, 0.28, 0], "#785a35");
      addBox(prop, [0.34, 0.27, 0.3], [0, -0.26, 0], "#b96951");
      addSphere(prop, 0.23, [0, 0.83, 0], "#5da465", [1, 1.25, 0.8]);
      addSphere(prop, 0.16, [-0.15, 0.68, 0], "#82b96d");
      addSphere(prop, 0.16, [0.15, 0.72, 0], "#73b568");
      break;
    }
    default:
      makeFlag(prop, 0, 0, 0, ["#17965d", "#f7f1e4", "#d94c4c"]);
  }
  return prop;
}

function makeJoint(parent, name, position) {
  const joint = new THREE.Group();
  joint.name = name;
  joint.position.set(...position);
  parent.add(joint);
  return joint;
}

function pixelTexture(definition, kind) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const rect = (color, x, y, width, height) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  };
  if (kind === "face") {
    const dark = definition.hair;
    for (const x of [10, 39]) {
      rect(dark, x, 14, 15, 3);
      rect(dark, x + (x < 32 ? 10 : 0), 17, 5, 2);
      rect("#fff5df", x + 1, 20, 13, 6);
      rect("#302c30", x + 6, 20, 4, 6);
      rect("#ffffff", x + 7, 20, 2, 2);
    }
    rect("#b67d68", 29, 34, 3, 5);
    rect("#b67d68", 32, 38, 6, 2);
    rect("#78443f", 23, 48, 18, 3);
    rect("#9e5c52", 26, 51, 12, 2);
    if (definition.beard) {
      for (let y = 43; y < 62; y += 4) {
        for (let x = 8 + (y % 8); x < 56; x += 6) {
          if (y < 48 && x > 19 && x < 45) continue;
          rect("#64473b", x, y, 2, 2);
        }
      }
    } else if (["tajani", "bonelli", "calenda"].includes(definition.id)) {
      for (const x of [8, 43]) {
        rect("#bf8a75", x, 28, 12, 1);
        rect("#bf8a75", x + 2, 31, 8, 1);
      }
    }
  } else if (kind === "suit") {
    rect(definition.suit, 0, 0, 64, 64);
    for (let x = 2; x < 64; x += 8) rect("rgba(255,255,255,0.12)", x, 0, 1, 64);
    rect("rgba(0,0,0,0.18)", 0, 0, 64, 4);
    rect("rgba(0,0,0,0.14)", 0, 57, 64, 7);
    rect("rgba(0,0,0,0.25)", 10, 38, 12, 2);
    rect("rgba(0,0,0,0.25)", 42, 38, 12, 2);
  } else if (kind === "shirt") {
    rect("#f2eee4", 0, 0, 64, 64);
    rect("#c9c4bc", 0, 0, 64, 7);
    rect("#c9c4bc", 29, 0, 6, 64);
    for (let y = 12; y < 64; y += 12) rect("#7f7b76", 31, y, 2, 2);
  } else if (kind === "tie") {
    rect(definition.tie, 0, 0, 64, 64);
    for (let y = 0; y < 64; y += 12) {
      for (let x = 0; x < 64; x += 4) rect("rgba(255,255,255,0.35)", x, (y + x) % 64, 4, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.name = `${definition.id}-${kind}`;
  return texture;
}

function sculpt(parent, name, profile, position, color, scale = [1, 1, 1], map = null) {
  const geometry = new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), 8);
  const surface = material(map ? "#ffffff" : color);
  surface.map = map;
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function panel(parent, name, points, position, color, depth = 0.025, map = null) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const surface = material(map ? "#ffffff" : color);
  surface.map = map;
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addFist(hand, color, side) {
  sculpt(hand, "fist", [[0.08, -0.12], [0.12, -0.08], [0.13, 0.04], [0.1, 0.1]], [0, 0, 0], color, [1, 1, 0.85]);
  for (let i = 0; i < 4; i += 1) {
    addSphere(hand, 0.035, [-0.09 + i * 0.06, -0.07, 0.085], color, [1, 0.7, 0.7]);
  }
  const thumb = addSphere(hand, 0.06, [side * 0.11, 0.005, 0.06], color, [0.65, 1.4, 0.75]);
  thumb.rotation.z = side * 0.55;
  thumb.name = "thumb";
}

function addStarCuff(elbow) {
  addBox(elbow, [0.24, 0.1, 0.25], [0, -0.23, 0], "#f2eee4");
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? 0.023 : 0.055;
    if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  star.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(star),
    new THREE.MeshStandardMaterial({ color: "#ffe064", emissive: "#c99214", emissiveIntensity: 1.1, flatShading: true })
  );
  mesh.position.set(0, -0.23, 0.13);
  elbow.add(mesh);
}

function buildFighterModel(definition, facing) {
  const root = new THREE.Group();
  root.scale.x = facing;
  const model = new THREE.Group();
  model.scale.setScalar(definition.height);
  root.add(model);

  const hips = makeJoint(model, "hips", [0, 0.9, 0]);
  const torso = makeJoint(hips, "torso", [0, 0.06, 0]);
  const head = makeJoint(torso, "head", [0, 1.08, 0.02]);
  head.rotation.order = "YXZ";
  const leftShoulder = makeJoint(torso, "leftShoulder", [-0.46, 0.62, 0.23]);
  const rightShoulder = makeJoint(torso, "rightShoulder", [0.46, 0.62, 0.04]);
  const leftElbow = makeJoint(leftShoulder, "leftElbow", [0, -0.34, 0]);
  const rightElbow = makeJoint(rightShoulder, "rightElbow", [0, -0.34, 0]);
  const leftHip = makeJoint(hips, "leftHip", [-0.23, 0, 0]);
  const rightHip = makeJoint(hips, "rightHip", [0.23, 0, 0]);
  const leftKnee = makeJoint(leftHip, "leftKnee", [0, -0.37, 0]);
  const rightKnee = makeJoint(rightHip, "rightKnee", [0, -0.37, 0]);
  const joints = { hips, torso, head, leftShoulder, leftElbow, rightShoulder, rightElbow, leftHip, leftKnee, rightHip, rightKnee };
  const clothing = [];

  sculpt(hips, "pelvis", [[0.21, -0.11], [0.3, -0.07], [0.3, 0.1], [0.23, 0.13]], [0, 0, 0], "#34303b", [1, 1, 0.68]);
  sculpt(hips, "belt", [[0.29, 0.04], [0.3, 0.1]], [0, 0, 0], "#29232a", [1, 1, 0.7]);
  addBox(hips, [0.12, 0.075, 0.035], [0, 0.07, 0.22], "#c5a45f", { metalness: 0.65 });
  const shoulders = definition.id === "schlein" ? 0.91 : definition.id === "meloni" ? 0.73 : 0.84;
  sculpt(torso, "jacket", [[0.34, 0], [0.37, 0.12], [0.34, 0.4], [0.43, 0.64], [0.35, 0.73], [0.17, 0.76]],
    [0, 0, 0], definition.suit, [shoulders / 0.86, 1, 0.58], pixelTexture(definition, "suit"));
  const shirt = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.61), material("#ffffff"));
  shirt.name = "shirt";
  shirt.material.map = pixelTexture(definition, "shirt");
  shirt.position.set(0, 0.39, 0.255);
  torso.add(shirt);
  const tie = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.46), material("#ffffff"));
  tie.name = "tie";
  tie.material.map = pixelTexture(definition, "tie");
  const tiePivot = makeJoint(torso, "tiePivot", [0, 0.63, 0.263]);
  tie.position.set(0, -0.23, 0);
  tiePivot.add(tie);
  clothing.push({ joint: tiePivot, side: 1, kind: "tie" });
  for (const side of [-1, 1]) {
    panel(torso, "lapel", [[side * 0.1, 0.66], [side * 0.31, 0.73], [side * 0.27, 0.53], [side * 0.17, 0.48], [side * 0.08, 0.19]],
      [0, 0, 0.25], definition.suit);
    panel(torso, "collar", [[side * 0.08, 0.68], [side * 0.27, 0.75], [side * 0.2, 0.57]],
      [0, 0, 0.28], "#e7e2da", 0.03);
    const tail = makeJoint(torso, "coatTail", [side * 0.19, 0.1, -0.15]);
    panel(tail, "coatTailPanel", [[-0.16, 0.03], [0.16, 0.03], [0.13, -0.28], [-0.14, -0.3]],
      [0, 0, 0], definition.suit, 0.04);
    clothing.push({ joint: tail, side, kind: "coat" });
  }
  if (definition.id === "meloni") {
    ["#17965d", "#f7f1e4", "#d94c4c"].forEach((color, index) => {
      addBox(torso, [0.075, 0.88, 0.03], [(index - 1) * 0.065, 0.39, 0.27], color, { rotation: [0, 0, -0.55] });
    });
    const sashEnd = makeJoint(torso, "sashEnd", [0.22, 0.07, 0.27]);
    ["#17965d", "#f7f1e4", "#d94c4c"].forEach((color, index) => {
      panel(sashEnd, "sashRibbon", [[index * 0.055 - 0.08, 0], [index * 0.055 - 0.025, 0], [index * 0.055, -0.35], [index * 0.055 - 0.055, -0.35]],
        [0, 0, 0], color, 0.015);
    });
    clothing.push({ joint: sashEnd, side: 1, kind: "sash" });
  }
  if (definition.id === "salvini") {
    addBox(torso, [0.035, 0.66, 0.025], [0, 0.36, 0.25], "#afd0e3");
    addBox(torso, [0.22, 0.12, 0.025], [-0.23, 0.48, 0.25], "#245d9c");
  }
  if (definition.id === "conte") addBox(torso, [0.15, 0.1, 0.025], [-0.26, 0.52, 0.25], "#f4ede0");
  if (definition.pin) addSphere(torso, 0.06, [-0.29, 0.52, 0.25], "#edc735", [1, 1, 0.4]);

  const upperColor = definition.id === "salvini" ? "#d8dfdf" : definition.suit;
  const forearmColor = definition.rolledSleeves ? definition.skin : upperColor;
  for (const [shoulder, elbow] of [[leftShoulder, leftElbow], [rightShoulder, rightElbow]]) {
    sculpt(shoulder, "upperSleeve", [[0.1, -0.35], [0.13, -0.27], [0.15, -0.08], [0.12, 0.02]], [0, 0, 0], upperColor);
    addSphere(shoulder, 0.13, [0, 0, 0], upperColor);
    sculpt(elbow, "forearm", [[0.075, -0.34], [0.1, -0.28], [0.13, -0.13], [0.11, 0.02]], [0, 0, 0], forearmColor);
    sculpt(elbow, "cuff", [[0.11, -0.08], [0.13, -0.065], [0.13, 0.015], [0.11, 0.03]], [0, definition.rolledSleeves ? 0 : -0.25, 0], "#f1eee5");
    if (definition.id === "tajani") addStarCuff(elbow);
  }
  const leftHand = makeJoint(leftElbow, "leftHand", [0, -0.34, 0.02]);
  const rightHand = makeJoint(rightElbow, "rightHand", [0, -0.34, 0.02]);
  addFist(leftHand, definition.skin, -1);
  addFist(rightHand, definition.skin, 1);

  for (const [hip, knee] of [[leftHip, leftKnee], [rightHip, rightKnee]]) {
    sculpt(hip, "trouserThigh", [[0.115, -0.39], [0.13, -0.28], [0.15, -0.08], [0.14, 0.04]], [0, 0, 0], "#34303b", [1, 1, 1.05]);
    sculpt(knee, "trouserShin", [[0.095, -0.34], [0.11, -0.26], [0.13, -0.1], [0.115, 0.02]], [0, 0, 0], "#34303b");
    sculpt(knee, "trouserCuff", [[0.105, -0.34], [0.12, -0.32], [0.12, -0.27]], [0, 0, 0], "#282630");
    sculpt(knee, "shoe", [[0.11, -0.44], [0.15, -0.42], [0.14, -0.36], [0.09, -0.31]], [0, 0, 0.07], "#201e26", [1, 1, 1.5]);
    sculpt(knee, "sole", [[0.14, -0.46], [0.15, -0.42]], [0, 0, 0.07], "#111016", [1, 1, 1.5]);
    addBox(knee, [0.2, 0.04, 0.14], [0, -0.46, -0.06], "#111016");
  }

  sculpt(head, "head", [[0.08, -0.42], [0.22, -0.38], [0.32, -0.26], [0.4, -0.05], [0.4, 0.18], [0.33, 0.34], [0.15, 0.42], [0, 0.43]],
    [0, 0, 0], definition.skin, [1, 1, 0.98]);
  for (const side of [-1, 1]) {
    addSphere(head, 0.09, [side * 0.39, -0.02, 0], definition.skin, [0.65, 1.3, 0.7]);
    addSphere(head, 0.12, [side * 0.24, -0.1, 0.28], definition.skin, [1, 0.65, 0.55]);
  }
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 0.6),
    new THREE.MeshStandardMaterial({ map: pixelTexture(definition, "face"), transparent: true, alphaTest: 0.1, flatShading: true })
  );
  face.name = "face";
  face.position.set(0, 0, 0.4);
  head.add(face);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.17, 4), material(definition.skin));
  nose.name = "nose";
  nose.position.set(0, -0.035, 0.43);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);
  const hairPivot = makeJoint(head, "hairPivot", [0, 0.25, 0]);
  const hair = makeJoint(hairPivot, "hair", [0, -0.25, 0]);
  clothing.push({ joint: hairPivot, side: 1, kind: "hair" });
  addSphere(hair, 0.36, [0, 0.32, -0.04], definition.hair, [1.06, 0.48, 0.94]);
  if (definition.id === "meloni") {
    for (const side of [-1, 1]) {
      const pivot = makeJoint(hair, "hairLockPivot", [side * 0.32, 0.25, 0]);
      const locks = makeJoint(pivot, "hairLocks", [-side * 0.32, -0.25, 0]);
      clothing.push({ joint: pivot, side, kind: "hair" });
      for (let i = 0; i < 3; i += 1) {
        const lock = addSphere(locks, 0.19, [side * (0.32 + i * 0.025), 0.13 - i * 0.12, -0.02 + i * 0.05], definition.hair, [0.65, 1.1, 1.2]);
        lock.rotation.z = side * 0.14;
      }
    }
    const fringe = addSphere(hair, 0.3, [-0.08, 0.28, 0.2], definition.hair, [1.05, 0.35, 0.6]);
    fringe.rotation.z = -0.16;
  } else if (definition.wavyHair) {
    for (let i = 0; i < 6; i += 1) {
      addSphere(hair, 0.17, [-0.33 + i * 0.13, 0.34 + (i % 2) * 0.06, 0.07], definition.hair, [0.85, 1, 0.85]);
    }
    for (const x of [-0.34, 0.34]) {
      const pivot = makeJoint(hair, "hairLockPivot", [x, 0.25, 0]);
      const locks = makeJoint(pivot, "hairLocks", [-x, -0.25, 0]);
      clothing.push({ joint: pivot, side: Math.sign(x), kind: "hair" });
      for (let i = 0; i < 4; i += 1) {
        addSphere(locks, 0.16, [x + Math.sign(x) * (i % 2) * 0.04, 0.15 - i * 0.14, -0.04], definition.hair, [0.85, 1.15, 0.85]);
      }
    }
  } else if (definition.slickHair) {
    for (let i = 0; i < 4; i += 1) {
      const lock = addSphere(hair, 0.24, [-0.23 + i * 0.15, 0.4 + (i === 1 ? 0.08 : 0), 0.08], definition.hair, [0.6, 0.75, 1.3]);
      lock.rotation.x = -0.35;
    }
  } else if (definition.id === "renzi") {
    const fringe = addSphere(hair, 0.3, [0, 0.32, 0.08], definition.hair, [1, 0.45, 0.9]);
    fringe.rotation.z = -0.1;
  }

  if (definition.beard) {
    for (const side of [-1, 1]) {
      addSphere(head, 0.18, [side * 0.25, -0.23, 0.19], definition.hair, [0.6, 0.85, 0.7]);
    }
    addSphere(head, 0.18, [0, -0.36, 0.2], definition.hair, [1, 0.4, 0.8]);
  }
  if (definition.glasses) addGlasses(head);
  if (definition.scarf) {
    sculpt(torso, "scarfCollar", [[0.34, 0.68], [0.36, 0.78], [0.25, 0.81]], [0, 0, 0], "#428555", [1, 1, 0.75]);
    for (const side of [-1, 1]) {
      const scarfEnd = makeJoint(torso, "scarfEnd", [side * 0.2, 0.73, -0.24]);
      panel(scarfEnd, "scarfPanel", [[-0.09, 0], [0.09, 0], [0.12, -0.55], [-0.07, -0.6]],
        [0, 0, 0], side < 0 ? "#3e9257" : "#5ca565", 0.025);
      scarfEnd.rotation.x = -0.4;
      clothing.push({ joint: scarfEnd, side, kind: "scarf" });
    }
  }

  const prop = createProp(rightHand, definition);
  return { root, model, joints, leftHand, rightHand, prop, clothing };
}

function createCombatant(definition, x, z, facing, isPlayer) {
  const body = buildFighterModel(definition, facing);
  scene.add(body.root);
  body.root.position.set(x, 0, z);
  return {
    definition,
    isPlayer,
    ...body,
    x,
    z,
    y: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    health: 100,
    facing,
    attack: null,
    cooldown: 0,
    dodgeTimer: 0,
    ghostTimer: 0,
    blockTimer: 0,
    blocking: false,
    guardMode: null,
    parryTimer: 0,
    parryRecovery: 0,
    parryPose: 0,
    risingTimer: 0,
    stun: 0,
    animationTime: 0,
    reactionTime: 0,
    airborne: false,
    airRotation: 0,
    landingTime: 0,
    input: createComboInput(),
    juggle: null,
    hitCombo: null,
    aiState: "IDLE",
    aiTimer: random(0.3, 0.9),
    aiCombo: 0,
    aiSide: 0,
    walkPhase: 0
  };
}

function buildRoster() {
  rosterNode.innerHTML = "";
  fighters.forEach((fighter, index) => {
    const button = document.createElement("button");
    button.className = "fighter-card";
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.style.setProperty("--accent", fighter.color);
    button.innerHTML = `<span class="portrait" aria-hidden="true">${fighter.initials}</span><strong>${fighter.name}</strong><small>SPD ${fighter.stats.speed} · POW ${fighter.stats.power} · RNG ${fighter.stats.range}</small>`;
    button.addEventListener("click", () => selectFighter(fighter.id, true));
    rosterNode.appendChild(button);
    if (index === 0 && !selectedId) selectedId = fighter.id;
  });
  selectFighter(selectedId, false);
}

function selectFighter(id, focusCard = false) {
  selectedId = id;
  const fighter = fightersById.get(id);
  if (!fighter) return;
  if (focusCard) sound.select();
  [...rosterNode.children].forEach((card, index) => {
    const selected = fighters[index].id === id;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-selected", String(selected));
    if (selected && focusCard) card.focus();
  });
  document.querySelector("#detail-name").textContent = fighter.name;
  document.querySelector("#detail-move").textContent = `Signature move: ${fighter.special}`;
  startButton.disabled = false;
}

function showAnnouncer() {
  announcer.querySelector("span").textContent = tournament.roundLabel;
  announcer.classList.add("show");
  announcerTimer = 1.7;
}

function disposeFighter(combatant) {
  clearSidestepGhosts(combatant);
  scene.remove(combatant.root);
  combatant.root.traverse((part) => {
    if (!part.isMesh) return;
    part.geometry.dispose();
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    materials.forEach((entry) => {
      if (entry.map) entry.map.dispose();
      entry.dispose();
    });
  });
}

function beginMatch() {
  if (!selectedId || matchActive) return;
  tournament = new TournamentManager(selectedId);
  tournamentStartedAt = performance.now();
  selectScreen.classList.add("hidden");
  showLadder();
}

function setStageMood(stage) {
  const mood = stage < 3
    ? { background: "#4b5267", sky: "#d7e5ff", ground: "#3d3442", ambient: 1.1, key: "#fff3d4", intensity: 210, rim: "#a7c6ff" }
    : stage < 6
      ? { background: "#5c3440", sky: "#ffd39b", ground: "#422332", ambient: 0.8, key: "#ffc278", intensity: 220, rim: "#e68165" }
      : { background: "#290f22", sky: "#9a5260", ground: "#160c19", ambient: 0.55, key: "#ff6654", intensity: 230, rim: "#ffb56b" };
  scene.background.set(mood.background);
  scene.fog.color.set(mood.background);
  ambientLight.color.set(mood.sky);
  ambientLight.groundColor.set(mood.ground);
  ambientLight.intensity = mood.ambient;
  keyLight.color.set(mood.key);
  keyLight.intensity = mood.intensity;
  rimLight.color.set(mood.rim);
}

function drawLadderPortrait(canvas, fighter) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fighter.color;
  ctx.fillRect(0, 0, 96, 112);
  ctx.fillStyle = "#25212b";
  ctx.fillRect(0, 89, 96, 23);
  ctx.fillStyle = fighter.suit;
  ctx.beginPath();
  ctx.moveTo(6, 112);
  ctx.lineTo(13, 88);
  ctx.lineTo(34, 79);
  ctx.lineTo(62, 79);
  ctx.lineTo(83, 88);
  ctx.lineTo(90, 112);
  ctx.fill();
  ctx.fillStyle = "#f4eee2";
  ctx.fillRect(40, 82, 16, 30);
  ctx.fillStyle = fighter.tie;
  ctx.fillRect(46, 83, 5, 29);
  ctx.fillStyle = fighter.hair;
  ctx.fillRect(19, 17, 58, 60);
  if (fighter.wavyHair || fighter.id === "meloni") {
    ctx.fillRect(15, 30, 12, 57);
    ctx.fillRect(69, 30, 12, 57);
  }
  ctx.fillStyle = fighter.skin;
  ctx.beginPath();
  ctx.moveTo(24, 30);
  ctx.lineTo(72, 30);
  ctx.lineTo(70, 65);
  ctx.lineTo(61, 78);
  ctx.lineTo(35, 78);
  ctx.lineTo(26, 65);
  ctx.fill();
  ctx.fillRect(19, 48, 7, 13);
  ctx.fillRect(70, 48, 7, 13);
  ctx.fillStyle = fighter.hair;
  ctx.fillRect(22, 18, 52, 14);
  ctx.fillRect(23, 28, fighter.id === "meloni" ? 29 : 18, 5);
  if (fighter.slickHair) ctx.fillRect(30, 12, 38, 9);
  const faceTexture = pixelTexture(fighter, "face");
  ctx.drawImage(faceTexture.image, 26, 34, 44, 37);
  faceTexture.dispose();
  if (fighter.beard) {
    ctx.fillStyle = fighter.hair;
    ctx.fillRect(26, 64, 8, 8);
    ctx.fillRect(62, 64, 8, 8);
    ctx.fillRect(34, 73, 28, 5);
  }
  if (fighter.glasses) {
    ctx.strokeStyle = "#201e25";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 44, 13, 9);
    ctx.strokeRect(53, 44, 13, 9);
    ctx.fillStyle = "#201e25";
    ctx.fillRect(43, 48, 10, 2);
  }
}

function showLadder() {
  matchActive = false;
  victory = null;
  clearTimeout(ladderTimeout);
  matchCheckpoint = { totalScore: tournament.totalScore, winStreak: tournament.winStreak };
  setStageMood(tournament.currentStage);
  document.querySelector("#hud").classList.remove("active");
  continueScreen.classList.add("hidden");
  ladderScreen.classList.remove("hidden");
  document.querySelector("#ladder-title").textContent = tournament.currentStage === 7 ? "FINAL BOSS: PALAZZO CHIGI" : `STAGE ${tournament.currentStage + 1}`;
  document.querySelector("#ladder-summary").textContent = `Score ${tournament.totalScore} · Win streak ${tournament.winStreak} · Best of 3`;
  const list = document.querySelector("#ladder-list");
  list.replaceChildren();
  for (let index = tournament.ladder.length - 1; index >= 0; index -= 1) {
    const item = document.createElement("li");
    const locked = index > tournament.currentStage;
    const silhouette = document.createElement("span");
    silhouette.className = "ladder-silhouette";
    silhouette.setAttribute("aria-hidden", "true");
    item.appendChild(silhouette);
    const label = document.createElement("span");
    label.className = "ladder-stage-name";
    const stage = index === 7 ? "FINAL BOSS: PALAZZO CHIGI" : `STAGE ${index + 1}`;
    label.textContent = `${stage} · ${locked ? "???" : fightersById.get(tournament.ladder[index]).name}`;
    item.appendChild(label);
    if (index === tournament.currentStage) item.className = "current";
    else if (locked) item.className = "locked";
    else {
      item.className = "completed";
      const stamp = document.createElement("span");
      stamp.className = "ladder-stamp";
      stamp.textContent = "ELETTO / DEFEATED";
      item.appendChild(stamp);
    }
    list.appendChild(item);
  }
  const chosen = fightersById.get(tournament.playerId);
  const rival = fightersById.get(tournament.opponentId);
  document.querySelector("#ladder-player-name").textContent = chosen.name;
  document.querySelector("#ladder-opponent-name").textContent = rival.name;
  drawLadderPortrait(document.querySelector("#ladder-player-portrait"), chosen);
  drawLadderPortrait(document.querySelector("#ladder-opponent-portrait"), rival);
  document.querySelector("#next-stage-button").focus();
  ladderTimeout = setTimeout(startRound, 3000);
}

function clearProjectiles() {
  for (let i = ballots.length - 1; i >= 0; i -= 1) {
    if (!ballots[i].projectile) continue;
    const ballot = ballots[i];
    scene.remove(ballot.mesh);
    ballot.mesh.traverse((part) => {
      if (!part.isMesh) return;
      part.geometry.dispose();
      part.material.dispose();
    });
    ballots.splice(i, 1);
  }
}

function clearCombatEffects() {
  clearProjectiles();
  clearSidestepGhosts();
  for (const particle of particles) {
    scene.remove(particle.mesh);
    particle.mesh.geometry.dispose();
    particle.mesh.material.dispose();
  }
  particles.length = 0;
  for (const effect of impactEffects) {
    scene.remove(effect.mesh);
    effect.mesh.material.dispose();
  }
  impactEffects.length = 0;
  for (const callout of callouts) callout.element.remove();
  callouts.length = 0;
  announcerTimer = 0;
  announcer.classList.remove("show");
  toastTimer = 0;
  toast.classList.remove("show");
}

function startRound() {
  if (!tournament || matchActive) return;
  clearTimeout(ladderTimeout);
  ladderTimeout = null;
  clearCombatEffects();
  clearInputs();
  sound.confirm();
  sound.startMatch();
  if (fightersInMatch.length) {
    fightersInMatch.forEach(disposeFighter);
    fightersInMatch.length = 0;
  }
  const difficulty = difficultyForStage(tournament.currentStage);
  player = createCombatant(fightersById.get(tournament.playerId), -2.7, 0.25, 1, true);
  opponent = createCombatant(fightersById.get(tournament.opponentId), 2.7, -0.15, -1, false);
  updateComboBadge(player);
  updateComboBadge(opponent);
  opponent.health = opponent.maxHealth = difficulty.health;
  opponent.difficulty = difficulty;
  if (tournament.currentStage === 7) {
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#ffd353", transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    aura.name = "bossAura";
    aura.scale.set(0.8, 1.65, 0.65);
    aura.position.y = 1.25;
    opponent.root.add(aura);
  }
  fightersInMatch.push(player, opponent);
  elapsed = 60;
  matchOver = false;
  matchActive = true;
  updateTouchVisibility();
  victory = null;
  hitStop = 0;
  for (const trail of [playerTrailNode, opponentTrailNode]) {
    trail.style.transition = "none";
    trail.style.width = "100%";
    void trail.offsetWidth;
    trail.style.transition = "";
  }
  selectScreen.classList.add("hidden");
  ladderScreen.classList.add("hidden");
  continueScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");
  document.querySelector("#hud").classList.add("active");
  document.querySelector("#player-name").textContent = player.definition.name;
  document.querySelector("#opponent-name").textContent = `${opponent.definition.name}${tournament.currentStage === 7 ? " · BOSS" : ""}`;
  toast.textContent = `SIGNATURE: ${player.definition.special.toUpperCase()}  ·  PRESS L`;
  updateHealthDisplay();
  showAnnouncer();
}

function setPaused(paused) {
  if (paused && (!matchActive || !player)) return;
  if (paused === isPaused) return;
  if (paused) {
    pausedAnimations = (stageElement.getAnimations?.({ subtree: true }) || [])
      .filter((animation) => animation.playState === "running");
    pausedAnimations.forEach((animation) => animation.pause());
  }
  isPaused = paused;
  clearInputs();
  updateTouchVisibility();
  stageElement.classList.toggle("paused", paused);
  if (!paused) {
    pausedAnimations.forEach((animation) => animation.play());
    pausedAnimations = [];
  }
  pauseScreen.classList.toggle("hidden", !paused);
  pauseButton.setAttribute("aria-expanded", String(paused));
  if (paused) {
    drawLadderPortrait(document.querySelector("#pause-portrait"), player.definition);
    document.querySelector("#pause-fighter-name").textContent = player.definition.name;
    document.querySelector("#pause-signature").textContent = `Signature: ${player.definition.special}`;
    document.querySelector("#resume-button").focus();
  } else if (matchActive) pauseButton.focus();
}

function restartMatch() {
  if (!isPaused || !tournament || !matchCheckpoint) return;
  tournament.roundWins = { player: 0, cpu: 0 };
  tournament.totalScore = matchCheckpoint.totalScore;
  tournament.winStreak = matchCheckpoint.winStreak;
  matchActive = false;
  setPaused(false);
  startRound();
  pauseButton.focus();
}

function returnToTitleScreen() {
  clearTimeout(ladderTimeout);
  ladderTimeout = null;
  clearInterval(continueInterval);
  continueInterval = null;
  continueDeadline = 0;
  clearInputs();
  sound.stopMatch();
  matchActive = false;
  matchOver = false;
  setPaused(false);
  updateTouchVisibility();
  clearCombatEffects();
  victory = null;
  hitStop = 0;
  shake = 0;
  cameraTilt = 0;
  elapsed = 60;
  tournamentStartedAt = 0;
  matchCheckpoint = null;
  resultScreen.classList.add("hidden");
  ladderScreen.classList.add("hidden");
  continueScreen.classList.add("hidden");
  selectScreen.classList.remove("hidden");
  document.querySelector("#hud").classList.remove("active");
  fightersInMatch.forEach(disposeFighter);
  fightersInMatch.length = 0;
  player = null;
  opponent = null;
  document.querySelector("#player-combo").classList.add("hidden");
  document.querySelector("#cpu-combo").classList.add("hidden");
  tournament = null;
  scene.background.set("#33243b");
  scene.fog.color.set("#33243b");
  ambientLight.color.set("#b5a5bf");
  ambientLight.groundColor.set("#1a1424");
  ambientLight.intensity = 0.7;
  keyLight.color.set("#ffe1a0");
  keyLight.intensity = 190;
  rimLight.color.set("#788fce");
  cameraRig.set(0, 7.4, 17.4);
  cameraTarget.set(0, 1.5, -0.5);
  camera.position.copy(cameraRig);
  camera.lookAt(cameraTarget);
  buildRoster();
  rosterNode.querySelector(".selected").focus();
}

function updateHealthDisplay() {
  if (!player || !opponent) return;
  const playerHealth = clamp(player.health / (player.maxHealth || 100) * 100, 0, 100);
  const opponentHealth = clamp(opponent.health / (opponent.maxHealth || 100) * 100, 0, 100);
  playerHealthNode.style.width = `${playerHealth}%`;
  opponentHealthNode.style.width = `${opponentHealth}%`;
  playerTrailNode.style.width = `${playerHealth}%`;
  opponentTrailNode.style.width = `${opponentHealth}%`;
  document.querySelector("#player-percent").textContent = `${Math.ceil(playerHealth)}%`;
  document.querySelector("#opponent-percent").textContent = `${Math.ceil(opponentHealth)}%`;
  timerNode.textContent = `${Math.ceil(elapsed)}`;
  document.querySelector("#round-status").textContent = `${tournament.roundLabel} · ${tournament.roundWins.player}–${tournament.roundWins.cpu}`;
}

function announceSpecial(combatant) {
  toast.textContent = `${combatant.definition.special.toUpperCase()}!`;
  toast.classList.add("show");
  toastTimer = 2.4;
  if (combatant.definition.quip) spawnCallout(combatant.definition.quip, combatant.x, combatant.y + 2.5, combatant.z);
}

function spawnCallout(text, x, y, z) {
  const point = new THREE.Vector3(x, y, z).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  const element = document.createElement("span");
  element.className = "comic-callout";
  element.textContent = text;
  element.style.left = `${(point.x * 0.5 + 0.5) * rect.width}px`;
  element.style.top = `${(-point.y * 0.5 + 0.5) * rect.height}px`;
  calloutLayer.appendChild(element);
  callouts.push({ element, life: 0.95 });
}

function spawnBallot(x, y, z, direction, color = "#f4ecd8", scale = 1, properties = {}) {
  const group = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28 * scale, 0.19 * scale),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
  );
  group.add(paper);
  group.position.set(x, y, z);
  scene.add(group);
  ballots.push({
    mesh: group,
    vx: direction * (properties.projectile ? 7 : random(1.6, 3.4)),
    vy: properties.projectile ? 0 : random(-0.1, 1.4),
    vz: properties.projectile ? 0 : random(-0.7, 0.7),
    spin: random(-5, 5),
    life: properties.projectile ? 1.5 : 4.2,
    projectile: Boolean(properties.projectile),
    damage: properties.damage,
    launch: properties.launch,
    unblockable: properties.unblockable,
    special: properties.special,
    limb: properties.limb,
    high: properties.high,
    height: properties.height,
    owner: properties.owner,
    color
  });
}

function spawnBurst(combatant, color = "#f4c96b", count = 12) {
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(random(0.035, 0.09), 0),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.set(combatant.x, combatant.y + 1.2, combatant.z);
    scene.add(mesh);
    particles.push({
      mesh,
      vx: random(-2.5, 2.5),
      vy: random(0.5, 3.8),
      vz: random(-1.6, 1.6),
      life: random(0.3, 0.75)
    });
  }
}

function spawnImpact(point, { launch = false, special = false, blocked = false, direction = 1 } = {}) {
  const colors = blocked ? ["#51bfff", "#c5f5ff"] : special ? ["#ff3d42", "#ffba62"] :
    launch ? ["#5cbfff", "#b8ecff"] : ["#ff8b19", "#fff285"];
  const count = launch || special ? 18 : 12;
  for (let i = 0; i < count; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(sparkGeometry, material);
    mesh.position.copy(point);
    mesh.scale.set(random(0.45, 0.9), random(1.4, 2.8), 0.6);
    mesh.rotation.z = random(-Math.PI, Math.PI);
    scene.add(mesh);
    const life = random(0.22, 0.42);
    impactEffects.push({
      mesh,
      kind: "spark",
      velocity: new THREE.Vector3(random(-2.2, 2.2) + direction, random(-0.4, 3.2), random(-1.5, 1.5)),
      life,
      duration: life
    });
  }
  if (launch || special) {
    const material = new THREE.MeshBasicMaterial({
      color: special ? "#ff3a42" : "#49b8ff",
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.position.copy(point);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.setScalar(0.2);
    scene.add(mesh);
    impactEffects.push({ mesh, kind: "ring", life: 0.38, duration: 0.38 });
  }
}

function contactPoint(attacker, target, attack) {
  const kick = attack.limb === "leftKick" || attack.limb === "rightKick";
  if (target.airborne || target.landingTime > 0) {
    return new THREE.Vector3(target.x - target.facing * 0.55, target.y + 0.5, target.z);
  }
  return new THREE.Vector3(
    target.x - attacker.facing * 0.28,
    target.y + (kick ? 0.95 : 1.4),
    target.z + clamp(attacker.z - target.z, -0.2, 0.2)
  );
}

function attackDefinition(combatant, kind, extra = {}) {
  const fast = combatant.definition.stats.speed;
  const power = combatant.definition.stats.power;
  const ranged = combatant.definition.stats.range;
  const isKick = kind === "kick" || kind === "heavy" || kind === "spin";
  const base = {
    kind,
    high: !extra.low,
    damage: (kind === "heavy" ? 11 : isKick ? 7 : 6) + power * 0.7,
    range: (kind === "heavy" ? 1.55 : isKick ? 1.3 : 1.08) + ranged * 0.12,
    windup: kind === "heavy" ? 0.23 : 0.13,
    duration: kind === "heavy" ? 0.48 : 0.33,
    launch: false,
    knockdown: false,
    unblockable: false,
    projectile: false,
    color: combatant.definition.color,
    ...extra
  };
  base.height = extra.height || (extra.low ? "low" :
    kind === "punch" && extra.limb === "leftPunch" ? "high" : "mid");
  base.windup = kind === "punch" ? 0.08 : Math.max(0.07, base.windup - fast * 0.012);
  return base;
}

function queueAttack(combatant, kind, extra = {}) {
  if (!matchActive || combatant.health <= 0 || combatant.stun > 0 || combatant.airborne || combatant.landingTime > 0) return false;
  if (combatant.cooldown > 0) return false;
  const attack = attackDefinition(combatant, kind, extra);
  attack.damage *= combatant.difficulty?.damage || 1;
  combatant.attack = { ...attack, age: 0, hit: false };
  combatant.cooldown = attack.duration + 0.04;
  combatant.blocking = false;
  combatant.guardMode = null;
  sound.swing(attack.limb === "leftKick" || attack.limb === "rightKick");
  return true;
}

function getSpecial(combatant) {
  const id = combatant.definition.id;
  const common = { damage: 15 + combatant.definition.stats.power, duration: 0.56, windup: 0.19, color: combatant.definition.accent, special: true, limb: id === "renzi" || id === "bonelli" ? "rightKick" : "rightPunch" };
  const details = {
    meloni: { kind: "rush", range: 2.15, launch: true, damage: 13, windup: 0.1, duration: 0.45 },
    salvini: { kind: "heavy", range: 1.7, knockdown: true, damage: 21, windup: 0.33, duration: 0.62, high: false },
    tajani: { kind: "counter", range: 1.65, damage: 13, windup: 0.14, duration: 0.54, guard: true },
    renzi: { kind: "spin", range: 1.9, damage: 16, windup: 0.15, duration: 0.62, launch: true },
    calenda: { kind: "dossier", range: 7, damage: 16, windup: 0.22, duration: 0.58, projectile: true },
    schlein: { kind: "palette", range: 6, damage: 14, windup: 0.17, duration: 0.52, projectile: true, launch: true },
    conte: { kind: "decree", range: 4.4, damage: 17, windup: 0.2, duration: 0.5, projectile: true, unblockable: true },
    bonelli: { kind: "eco-spin", range: 2, damage: 15, windup: 0.15, duration: 0.6, launch: true }
  };
  return { ...common, ...details[id] };
}

function useSpecial(combatant) {
  if (!matchActive || combatant.cooldown > 0 || combatant.stun > 0 || combatant.airborne || combatant.landingTime > 0) return false;
  const special = getSpecial(combatant);
  if (special.guard) combatant.blockTimer = 0.52;
  if (special.kind === "rush") {
    combatant.x += combatant.facing * 0.48;
    combatant.root.position.x = combatant.x;
  }
  queueAttack(combatant, special.kind, special);
  announceSpecial(combatant);
  if (!special.projectile) {
    spawnBurst(combatant, special.color, 16);
  }
  return true;
}

function playerAttack(key, parryShortcut = false) {
  if (!player || !matchActive || player.stun > 0 || player.airborne || player.landingTime > 0) return;
  const forward = player.facing === 1 ? "right" : "left";
  if (key === "u" && (parryShortcut || inputState.has(forward)) && !player.attack && player.cooldown <= 0 &&
      player.parryRecovery <= 0 && !player.input.chain.length && !player.input.queue.length) {
    player.parryTimer = 0.15;
    player.parryRecovery = 0.35;
    player.parryPose = 0.2;
    player.guardMode = null;
    player.blocking = false;
    clearComboInput(player.input);
    return;
  }
  if (parryShortcut) return;
  if (player.parryTimer > 0) return;
  bufferInput(player.input, key === "i" && (inputState.has("down") || player.risingTimer > 0) ? "launcher" : key);
  if (key === "i" || key === "launcher") player.risingTimer = 0;
  consumeBufferedAttack(player);
}

function consumeBufferedAttack(combatant) {
  const state = combatant.input;
  if (!state || !state.queue.length || !matchActive || combatant.stun > 0 || combatant.airborne || combatant.landingTime > 0) return;
  const current = combatant.attack;
  if (current && (current.special || current.age < Math.max(current.windup + 0.025, current.duration * 0.4))) return;
  if (!current && combatant.cooldown > 0) return;
  const { key } = state.queue.shift();
  const { code, cross, snap, heavy } = resolveComboInput(state, key);
  if (current) {
    combatant.attack = null;
    combatant.cooldown = 0;
  }
  if (key === "l") {
    useSpecial(combatant);
  } else if (key === "launcher") {
    queueAttack(combatant, "launcher", { damage: 10, range: 1.38, windup: 0.17, duration: 0.42, launch: true, limb: "rightPunch" });
  } else if (code === "u-u-i") {
    queueAttack(combatant, "combo-finisher", { damage: 14, range: 1.5, knockdown: true, duration: 0.4, limb: "rightPunch", comboMove: "straight" });
  } else if (code === "u-i-k" || code === "j-k-k") {
    queueAttack(combatant, "kick", { damage: 13, range: 1.55, knockdown: true, duration: 0.46, limb: "rightKick", comboMove: code === "u-i-k" ? "roundhouse" : "heel" });
  } else if (key === "u" || key === "i") {
    queueAttack(combatant, "punch", { ...(key === "i" ? { damage: heavy ? 10 : 8, range: 1.18 } : {}), height: key === "u" ? "high" : "mid", limb: key === "i" || cross ? "rightPunch" : "leftPunch" });
  } else {
    queueAttack(combatant, "kick", { damage: snap ? 10 : 8, range: 1.4, low: key === "j", limb: key === "j" ? "leftKick" : "rightKick" });
  }
}

function recordCombatHit(attacker, target, damage, attack, blocked = false) {
  const actualDamage = Math.min(target.health, damage);
  target.health = Math.max(0, target.health - damage);
  if (!blocked) {
    if (target.input) {
      clearComboInput(target.input);
      target.attack = null;
      target.cooldown = 0;
    }
    if (!target.hitCombo || target.hitCombo.attacker !== attacker) {
      target.hitCombo = { attacker, hits: 0, damage: 0 };
    }
    target.hitCombo.hits += 1;
    target.hitCombo.damage += actualDamage;
    if (target.airborne && target.juggle && target.juggle.hits < 4 &&
        ["leftPunch", "rightPunch", "leftKick", "rightKick"].includes(attack.limb) && !attack.special) {
      target.juggle.hits += 1;
      target.vy = Math.max(target.vy, 1.6);
    }
  }
  updateComboBadge(target);
}

function updateComboBadge(target) {
  const badge = document.querySelector(target.isPlayer ? "#cpu-combo" : "#player-combo");
  if (target.hitCombo && target.hitCombo.hits >= 2) {
    badge.textContent = `${target.hitCombo.hits} HIT COMBO! ${Math.round(target.hitCombo.damage)} DAMAGE!`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    badge.textContent = "";
  }
}

function tryHit(attacker, target) {
  const attack = attacker.attack;
  if (!attack || attack.hit || attack.age < attack.windup) return;
  attack.hit = true;
  if (attack.projectile) {
    spawnBallot(
      attacker.x + attacker.facing * 0.75,
      attacker.y + 1.65,
      attacker.z,
      attacker.facing,
      attack.color,
      attack.kind === "dossier" ? 1.7 : 1.45,
      { ...attack, owner: attacker }
    );
    return;
  }
  const dx = Math.abs(attacker.x - target.x);
  const dz = Math.abs(attacker.z - target.z);
  if (dx > attack.range || dz > 0.95 || (target.airborne && target.y > 2.2)) return;
  resolveCombatImpact(attacker, target, attack, contactPoint(attacker, target, attack));
}

function resolveCombatImpact(attacker, target, attack, point) {
  const outcome = defenseOutcome(target, attack);
  if (outcome === "sidestep" || outcome === "duck") {
    spawnCallout(outcome === "duck" ? "SCHIVATA BASSA!" : "SCHIVATA!", target.x, target.y + 2.4, target.z);
    return;
  }
  attack.connected = true;
  if (outcome === "parry") {
    target.parryTimer = 0;
    target.parryPose = 0.25;
    attacker.attack = null;
    attacker.cooldown = 0;
    attacker.stun = 0.6;
    attacker.reactionTime = 0.6;
    attacker.vx = -attacker.facing * 1.4;
    if (attacker.input) clearComboInput(attacker.input);
    spawnCallout("PARRIED! MOZIONE D'ORDINE!", target.x, target.y + 2.65, target.z);
    spawnImpact(point, { blocked: true, direction: attacker.facing });
    sound.impact({ blocked: true });
    hitStop = Math.max(hitStop, 0.06);
    return;
  }

  const direction = attack.projectile ? Math.sign(attack.vx) : attacker.facing;
  const targetAirborne = target.airborne;
  const blocked = outcome === "block";
  const counter = !blocked && isCounterHit(target);
  const damage = attack.damage * (blocked ? 0.15 : counter ? 1.35 : 1);
  recordCombatHit(attacker, target, damage, attack, blocked);
  if (!blocked) {
    target.guardMode = null;
    target.blocking = false;
    target.blockTimer = 0;
    target.parryTimer = 0;
  }
  target.stun = blocked ? 0.12 : 0.25;
  target.reactionTime = blocked ? 0.12 : 0.3;
  target.vx = direction * (blocked ? 0.5 : attack.knockdown ? 4.4 : attack.launch ? 0.8 : targetAirborne ? 0.15 : 2.2);
  const launches = !blocked && (attack.launch || (counter && attack.knockdown));
  if (launches && !targetAirborne) {
    target.vy = 5.1;
    target.airborne = true;
    target.juggle = { hits: 0 };
    target.landingTime = 0;
  } else if (!blocked && attack.knockdown && !targetAirborne) {
    target.vy = 2.2;
    target.airborne = true;
    target.landingTime = 0;
  }
  if (!attack.projectile) attacker.vx = targetAirborne ? 0 : -direction * 0.22;
  hitStop = Math.max(hitStop, counter ? 0.1 : 0.06);
  shake = Math.max(shake, !blocked && attack.knockdown ? 0.38 : 0.22);
  if (!blocked && (attack.launch || attack.knockdown || attack.kind === "heavy")) {
    cameraTilt = direction * (attack.launch ? 0.045 : 0.03);
  }
  spawnCallout(blocked ? "BLOCCATO!" : counter ? "COUNTER HIT!" : attack.unblockable && attack.projectile ? "VETO!" : comicWords[Math.floor(Math.random() * comicWords.length)], target.x, target.y + 2.65, target.z);
  spawnImpact(point, {
    launch: launches,
    special: !blocked && attack.special,
    blocked,
    direction
  });
  updateHealthDisplay();
  if (target.health <= 0) finishMatch(attacker);
  else sound.impact({ blocked, launch: launches });
}

function finishMatch(winner, reason = "knockout") {
  if (matchOver) return;
  matchOver = true;
  matchActive = false;
  clearInputs();
  updateTouchVisibility();
  sound.stopMatch();
  if (reason === "knockout") sound.knockout();
  const loser = winner === player ? opponent : player;
  winner.attack = null;
  loser.attack = null;
  const outcome = tournament.recordRound(winner === player ? "player" : "cpu", winner.health);
  updateHealthDisplay();
  victory = { winner, loser, time: 0, outcome, totalTime: performance.now() - tournamentStartedAt };
}

function showContinue() {
  continueScreen.classList.remove("hidden");
  continueDeadline = Date.now() + 9000;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((continueDeadline - Date.now()) / 1000));
    document.querySelector("#continue-count").textContent = remaining;
    if (remaining === 0) returnToTitleScreen();
  };
  tick();
  continueInterval = setInterval(tick, 100);
  document.querySelector("#continue-button").focus();
}

function retryStage() {
  if (continueScreen.classList.contains("hidden")) return;
  if (Date.now() >= continueDeadline) {
    returnToTitleScreen();
    return;
  }
  clearInterval(continueInterval);
  continueInterval = null;
  tournament.retry();
  showLadder();
}

function finishRoundTransition(outcome) {
  if (outcome !== "champion") victory = null;
  if (outcome === "round") startRound();
  else if (outcome === "stage") showLadder();
  else if (outcome === "continue") showContinue();
  else {
    victory.champion = true;
    document.querySelector("#hud").classList.remove("active");
    document.querySelector("#result-title").textContent = "NUOVO PREMIER!";
    document.querySelector("#result-copy").textContent = `${player.definition.name} · FINAL SCORE ${tournament.totalScore} · TOTAL TIME ${formatTournamentTime(victory.totalTime)}`;
    resultScreen.classList.remove("hidden");
    document.querySelector("#rematch-button").focus();
  }
}

function setAIState(state, duration = random(0.25, 0.65)) {
  if (!opponent) return;
  opponent.aiState = state;
  opponent.aiTimer = duration;
  opponent.aiSide = state === "SIDESTEP" ? (Math.random() < 0.5 ? -1 : 1) : 0;
}

function updateAI(dt) {
  if (!opponent || !player || opponent.health <= 0 || player.health <= 0) return;
  const ai = opponent;
  const difficulty = ai.difficulty;
  if (ai.airborne || ai.landingTime > 0 || ai.stun > 0) return;
  const dx = player.x - ai.x;
  const dz = player.z - ai.z;
  const distance = Math.abs(dx);
  ai.facing = dx >= 0 ? 1 : -1;
  ai.root.scale.x = ai.facing;
  ai.aiTimer -= dt;

  if (player.attack && ai.observedAttack !== player.attack) {
    ai.observedAttack = player.attack;
    ai.reactionTimer = difficulty.reaction;
    const comboThreat = difficulty.stage >= 3 && (player.input?.chain.length >= 2 || player.attack.comboMove);
    ai.defense = attackHeight(player.attack) !== "low" && Math.random() < (comboThreat ? Math.max(0.7, difficulty.block) : difficulty.block) ? "block" :
      (Math.random() < difficulty.sidestep ? "sidestep" : "none");
  }
  if (player.attack && ai.defense && ai.defense !== "none") {
    ai.reactionTimer -= dt;
    if (ai.reactionTimer <= 0) {
      if (ai.defense === "sidestep" && distance < 2.4 && !player.attack.special) {
        ai.dodgeTimer = 0.42;
        setAIState("SIDESTEP", 0.35);
      } else if (ai.defense === "block" && attackHeight(player.attack) !== "low" && !ai.attack && ai.stun <= 0) ai.blockTimer = 0.45;
      ai.defense = "none";
    }
  }

  const heavyWhiff = player.attack?.kind === "heavy" || player.attack?.kind === "launcher" ||
    player.attack?.kind === "combo-finisher" || player.attack?.special || player.attack?.knockdown;
  if ((difficulty.speed > 1 || (difficulty.stage >= 3 && heavyWhiff)) && player.attack?.hit && !player.attack.connected &&
      distance < 1.8 && ai.cooldown <= 0 && ai.stun <= 0 && ai.aiState !== "SIDESTEP") {
    ai.aiCombo = 0;
    ai.blockTimer = 0;
    setAIState("ATTACK", difficulty.combo * 0.48);
  }

  if (difficulty.combo > 1 && player.y > 0.4 && distance < 3.2) {
    if (ai.aiState !== "JUGGLE_FOLLOWUP") setAIState("JUGGLE_FOLLOWUP", 0.42);
  } else if (ai.aiState === "JUGGLE_FOLLOWUP" && ai.aiTimer <= 0) {
    setAIState("IDLE", 0.4);
  }

  switch (ai.aiState) {
    case "IDLE":
      if (distance > (difficulty.speed > 1 ? 1.65 : 2.1)) setAIState("APPROACH", 0.8);
      else if (distance < 1.25 && Math.random() < difficulty.sidestep * dt * 0.5) setAIState("SIDESTEP", 0.32);
      else if (ai.aiTimer <= 0 && ai.cooldown <= 0) setAIState("ATTACK", difficulty.combo * 0.48 + difficulty.reaction);
      break;
    case "APPROACH":
      ai.vx = ai.facing * ai.definition.stats.speed * 0.18 * difficulty.speed;
      if (distance < 1.75) setAIState("ATTACK", difficulty.combo * 0.48 + difficulty.reaction);
      break;
    case "ATTACK":
      if (ai.aiCombo < difficulty.combo && ai.cooldown <= 0 && ai.stun <= 0 && !(difficulty.stage >= 3 && ai.blockTimer > 0)) {
        const missed = player.attack && player.attack.hit && !player.attack.connected && distance < 1.8;
        if (difficulty.special && Math.random() < difficulty.special && (missed || ai.aiCombo > 0)) useSpecial(ai);
        else if (difficulty.launcher && Math.random() < difficulty.launcher && (missed || ai.aiCombo > 0)) {
          queueAttack(ai, "launcher", { damage: 10, range: 1.38, windup: 0.17, duration: 0.42, launch: true, limb: "rightPunch" });
        } else {
          queueAttack(ai, ai.aiCombo % 2 === 0 ? "punch" : "kick", { damage: ai.aiCombo % 2 ? 8 : 6, range: 1.45, limb: ai.aiCombo % 2 === 0 ? "leftPunch" : "rightKick" });
        }
        ai.aiCombo += 1;
      }
      if (ai.aiTimer <= 0) {
        ai.aiCombo = 0;
        setAIState(distance > 2.2 ? "APPROACH" : "IDLE", random(0.35, 0.75));
      }
      break;
    case "SIDESTEP":
      if (ai.aiSide === 0) ai.aiSide = Math.random() < 0.5 ? -1 : 1;
      ai.vz = ai.aiSide * 3.8;
      if (ai.aiTimer <= 0) setAIState("APPROACH", 0.55);
      break;
    case "JUGGLE_FOLLOWUP":
      if (distance > 1.2) ai.vx = ai.facing * ai.definition.stats.speed * 0.2 * difficulty.speed;
      if (distance < 1.8 && ai.cooldown <= 0 && player.y > 0.25) {
        queueAttack(ai, "kick", { damage: 6, range: 1.9, windup: 0.1, limb: "rightKick" });
      }
      if (ai.aiTimer <= 0 && player.y < 0.1) setAIState("IDLE", 0.45);
      break;
    default:
      setAIState("IDLE");
  }

  ai.blocking = ai.blockTimer > 0;
  ai.guardMode = ai.blocking ? "standing" : null;
  if (distance > 1.7) ai.vz += clamp(dz, -1, 1) * 0.55;
}

function movePlayer(dt) {
  if (!player) return;
  if (opponent) player.facing = opponent.x >= player.x ? 1 : -1;
  let direction = 0;
  if (inputState.has("left")) direction -= 1;
  if (inputState.has("right")) direction += 1;
  const canGuard = !player.airborne && player.landingTime <= 0 && !player.attack &&
    player.parryTimer <= 0 && (player.stun <= 0 || player.blocking);
  const away = direction === -player.facing;
  const lowGuard = inputState.has("down") && (away || inputState.has("guard"));
  player.guardMode = canGuard && (away || inputState.has("guard") || (direction === 0 && !inputState.has("down"))) ?
    (lowGuard ? "low" : "standing") : null;
  if (player.blockTimer > 0 && !player.airborne) player.guardMode = "standing";
  player.blocking = Boolean(player.guardMode);
  if (player.stun > 0 || player.airborne || player.landingTime > 0 || player.parryTimer > 0) return;
  if (direction) {
    player.vx += direction * player.definition.stats.speed * 0.38;
  }
}

function spawnSidestepGhost(combatant) {
  const ghost = combatant.root.clone();
  const ghostMaterial = new THREE.MeshBasicMaterial({
    color: combatant.definition.color, transparent: true, opacity: 0.13,
    depthWrite: false, side: THREE.DoubleSide
  });
  ghost.traverse((part) => {
    if (!part.isMesh) return;
    part.material = ghostMaterial;
    part.castShadow = false;
    part.receiveShadow = false;
  });
  scene.add(ghost);
  sidestepGhosts.push({ ghost, material: ghostMaterial, owner: combatant, life: 0.18 });
}

function clearSidestepGhosts(owner) {
  for (let i = sidestepGhosts.length - 1; i >= 0; i -= 1) {
    const entry = sidestepGhosts[i];
    if (owner && entry.owner !== owner) continue;
    scene.remove(entry.ghost);
    entry.material.dispose();
    sidestepGhosts.splice(i, 1);
  }
}

function updateSidestepGhosts(dt) {
  for (let i = sidestepGhosts.length - 1; i >= 0; i -= 1) {
    const entry = sidestepGhosts[i];
    entry.life -= dt;
    entry.material.opacity = 0.13 * Math.max(entry.life, 0) / 0.18;
    if (entry.life <= 0) {
      scene.remove(entry.ghost);
      entry.material.dispose();
      sidestepGhosts.splice(i, 1);
    }
  }
}

function springAccessory(piece, targetX, targetZ, dt) {
  if (!piece.spring) {
    piece.spring = { x: piece.joint.rotation.x, z: piece.joint.rotation.z, vx: 0, vz: 0 };
  }
  const spring = piece.spring;
  let remaining = Math.min(dt, 0.1);
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    spring.vx += ((targetX - spring.x) * 90 - spring.vx * 12) * step;
    spring.vz += ((targetZ - spring.z) * 90 - spring.vz * 12) * step;
    spring.x += spring.vx * step;
    spring.z += spring.vz * step;
    remaining -= step;
  }
  piece.joint.rotation.x = spring.x;
  piece.joint.rotation.z = spring.z;
}

function sampleKeyframes(time, frames) {
  for (let i = 1; i < frames.length; i += 1) {
    if (time <= frames[i][0]) {
      const [startTime, startValue] = frames[i - 1];
      const [endTime, endValue] = frames[i];
      const t = clamp((time - startTime) / Math.max(endTime - startTime, 0.001), 0, 1);
      return THREE.MathUtils.lerp(startValue, endValue, t * t * (3 - 2 * t));
    }
  }
  return frames[frames.length - 1][1];
}

function poseFighter(combatant, dt, opponentBody = null) {
  const { joints, definition, attack } = combatant;
  const movement = clamp(Math.hypot(combatant.vx, combatant.vz) / 2.5, 0, 1);
  combatant.animationTime += dt;
  combatant.walkPhase += dt * (3 + movement * 6);
  const step = Math.sin(combatant.walkPhase) * movement;
  const bounce = Math.sin(combatant.animationTime * 6.5);
  const wide = definition.id === "renzi" ? 0.34 : definition.id === "schlein" ? 0.27 : 0.2;
  const guard = combatant.blocking ? 0.3 : 0;
  const sidestep = combatant.dodgeTimer > 0 && Math.abs(combatant.vz) > 0.3 && !combatant.airborne;
  const side = sidestep ? Math.sign(combatant.vz) : 0;

  joints.hips.rotation.set(0, 0, step * 0.05 + bounce * 0.035);
  joints.torso.rotation.set(0, -0.1, (definition.id === "schlein" ? -0.12 : -0.06) + bounce * 0.025);
  const breath = Math.sin(combatant.animationTime * 2.4);
  joints.torso.scale.set(1 + breath * 0.012, 1 + breath * 0.006, 1 + breath * 0.018);
  joints.head.rotation.set(0, 0.1, 0.04 - bounce * 0.02);
  joints.leftShoulder.rotation.set(-0.2, 0, 0.8 + guard + bounce * 0.06);
  joints.rightShoulder.rotation.set(-0.2, 0, 1.05 + guard - bounce * 0.06);
  joints.leftElbow.rotation.set(-0.2, 0, 1.5 + guard + bounce * 0.08);
  joints.rightElbow.rotation.set(-0.2, 0, 1.2 + guard - bounce * 0.08);
  joints.leftHip.rotation.set(step * 0.2, 0, -wide + step * 0.24 + bounce * 0.04);
  joints.rightHip.rotation.set(-step * 0.2, 0, wide - step * 0.24 - bounce * 0.04);
  joints.leftKnee.rotation.set(Math.max(0, -step) * 0.4 + (bounce + 1) * 0.06, 0, 0.16);
  joints.rightKnee.rotation.set(Math.max(0, step) * 0.4 + (bounce + 1) * 0.06, 0, -0.16);
  combatant.model.position.set(0, (bounce + 1) * 0.025, 0);
  combatant.prop.rotation.z = -2.2;
  if (combatant.guardMode === "low") {
    joints.leftKnee.rotation.x += 0.75;
    joints.rightKnee.rotation.x += 0.75;
    joints.torso.rotation.z -= 0.2;
    combatant.model.position.y -= 0.25;
  } else if (combatant.parryPose > 0) {
    joints.leftShoulder.rotation.z = 1.9;
    joints.leftElbow.rotation.z = 0.45;
    joints.torso.rotation.y = 0.35;
  }

  combatant.root.rotation.y = 0;
  if (sidestep) {
    const dip = clamp(Math.abs(combatant.vz) / 3.8, 0, 1);
    joints.torso.rotation.x += side * 0.22 * dip;
    joints.torso.rotation.z -= side * 0.13 * dip;
    joints.hips.rotation.y += side * 0.3 * dip;
    joints.leftKnee.rotation.x += 0.32 * dip;
    joints.rightKnee.rotation.x += 0.32 * dip;
    combatant.model.position.y -= 0.09 * dip;
    combatant.root.rotation.y = side * 0.18 * dip;
  }
  if (attack && !combatant.airborne && combatant.landingTime <= 0) {
    const progress = clamp(attack.age / attack.duration, 0, 1);
    const impact = clamp(attack.windup / attack.duration, 0.01, 0.95);
    const holdEnd = Math.min(impact + 0.065 / attack.duration, 0.98);
    const strike = sampleKeyframes(progress, [
      [0, 0], [impact * 0.6, 0], [impact, 1], [holdEnd, 1], [1, 0]
    ]);
    const crouch = sampleKeyframes(progress, [
      [0, 0], [impact * 0.6, 1], [impact, 0], [1, 0]
    ]);
    joints.torso.rotation.y -= crouch * 0.32;
    joints.hips.rotation.y += crouch * 0.22;
    joints.leftKnee.rotation.x += crouch * 0.25 + strike * 0.08;
    joints.rightKnee.rotation.x += crouch * 0.12 + strike * 0.3;
    combatant.model.position.x += strike * 0.13 - crouch * 0.1;
    const punch = (side, angle = 1.45, amount = strike) => {
      const shoulder = side === "left" ? joints.leftShoulder : joints.rightShoulder;
      const elbow = side === "left" ? joints.leftElbow : joints.rightElbow;
      shoulder.rotation.z = THREE.MathUtils.lerp(shoulder.rotation.z - crouch * 0.4, angle, amount);
      shoulder.rotation.x = THREE.MathUtils.lerp(shoulder.rotation.x, -0.05, amount);
      elbow.rotation.z = THREE.MathUtils.lerp(elbow.rotation.z + crouch * 0.35, 0.08, amount);
      joints.hips.rotation.y = crouch * 0.22 + amount * 0.25;
      joints.torso.rotation.y = -0.1 - crouch * 0.32 + amount * 0.65;
      joints.torso.rotation.z -= amount * 0.12;
    };
    const kick = (side) => {
      const hip = side === "left" ? joints.leftHip : joints.rightHip;
      const knee = side === "left" ? joints.leftKnee : joints.rightKnee;
      const support = side === "left" ? joints.rightKnee : joints.leftKnee;
      const roundhouse = side === "left";
      const chamber = sampleKeyframes(progress, [
        [0, 0], [impact * 0.55, 1], [impact, 0.15], [holdEnd, 0.15], [1, 0]
      ]);
      const extension = sampleKeyframes(progress, [
        [0, 0], [impact * 0.55, 0], [impact, 1], [holdEnd, 1], [1, 0]
      ]);
      hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, roundhouse ? 1.8 : 1.6, strike + chamber * (1 - strike) * 0.55);
      hip.rotation.y = (roundhouse ? -0.85 : -0.15) * strike;
      hip.rotation.x = (roundhouse ? -0.4 : 0.1) * strike;
      knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, -1.1, chamber);
      knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0.08, extension);
      support.rotation.x += 0.45 * strike;
      joints.hips.rotation.y += (roundhouse ? 0.45 : 0.15) * strike;
      joints.torso.rotation.z -= strike * 0.38;
    };

    const uppercut = attack.kind === "launcher" || (attack.special && definition.id === "meloni");
    if (attack.limb === "leftPunch") punch("left");
    else if (attack.limb === "rightPunch" && !uppercut) punch("right");
    else if (attack.limb === "leftKick") kick("left");
    else if (attack.limb === "rightKick") kick("right");

    if (uppercut) {
      const rise = sampleKeyframes(progress, [
        [0, 0], [impact * 0.6, 0], [impact, 1],
        [holdEnd, 1], [1, 0]
      ]);
      punch("right", 2.55, rise);
      joints.leftHip.rotation.x -= crouch * 0.65;
      joints.rightHip.rotation.x -= crouch * 0.65;
      joints.leftKnee.rotation.x += crouch * 1.2;
      joints.rightKnee.rotation.x += crouch * 1.2;
      joints.hips.rotation.z -= crouch * 0.18;
      combatant.model.position.y += rise * 0.25 - crouch * 0.15;
    }

    if (attack.comboMove === "straight") {
      joints.torso.rotation.z -= strike * 0.2;
      combatant.model.position.x += strike * 0.18;
    } else if (attack.comboMove === "roundhouse") {
      combatant.root.rotation.y = sampleKeyframes(progress, [[0, 0], [impact, Math.PI], [1, Math.PI * 2]]);
      joints.rightHip.rotation.z = THREE.MathUtils.lerp(joints.rightHip.rotation.z, 1.95, strike);
    } else if (attack.comboMove === "heel") {
      combatant.model.position.y += Math.sin(progress * Math.PI) * 0.3;
      joints.rightHip.rotation.z = THREE.MathUtils.lerp(joints.rightHip.rotation.z, 2.4, strike);
      joints.torso.rotation.z -= strike * 0.2;
    }

    if (attack.special) {
      if (definition.id === "renzi" || definition.id === "bonelli") {
        combatant.root.rotation.y = sampleKeyframes(progress, [
          [0, 0], [impact * 0.25, 0], [impact, Math.PI],
          [1, Math.PI * 2]
        ]);
      }
      switch (definition.id) {
        case "meloni":
          joints.leftShoulder.rotation.z = THREE.MathUtils.lerp(joints.leftShoulder.rotation.z - crouch * 0.4, 1.65, strike);
          joints.rightShoulder.rotation.z = THREE.MathUtils.lerp(joints.rightShoulder.rotation.z - crouch * 0.4, 1.65, strike);
          joints.leftElbow.rotation.z = THREE.MathUtils.lerp(joints.leftElbow.rotation.z + crouch * 0.3, 0.12, strike);
          joints.rightElbow.rotation.z = THREE.MathUtils.lerp(joints.rightElbow.rotation.z + crouch * 0.3, 0.12, strike);
          combatant.model.position.x += strike * 0.22;
          break;
        case "salvini":
          joints.rightShoulder.rotation.z = sampleKeyframes(progress, [
            [0, 1.05], [impact * 0.6, 2.9], [impact, 1.4],
            [holdEnd, 1.4], [1, 1.05]
          ]);
          joints.rightElbow.rotation.z = THREE.MathUtils.lerp(1.2, 0.2, strike);
          joints.torso.rotation.z += crouch * 0.2 - strike * 0.24;
          joints.leftShoulder.rotation.z += crouch * 0.8;
          combatant.model.position.y += Math.sin(progress * Math.PI) * 0.24;
          joints.leftKnee.rotation.x += Math.sin(progress * Math.PI) * 0.45;
          break;
        case "tajani":
          joints.leftShoulder.rotation.z += crouch * 1.1;
          joints.leftElbow.rotation.z += crouch * 0.7;
          joints.rightShoulder.rotation.z -= crouch * 0.5;
          joints.rightElbow.rotation.z += crouch * 0.5;
          joints.torso.rotation.z += crouch * 0.2;
          break;
        case "renzi":
          joints.leftShoulder.rotation.z -= strike * 0.5;
          joints.torso.rotation.y += strike * 0.4;
          break;
        case "calenda":
          joints.rightShoulder.rotation.z = THREE.MathUtils.lerp(joints.rightShoulder.rotation.z + crouch * 1.6, 1.4, strike);
          joints.leftShoulder.rotation.z += crouch * 1.3 - strike * 0.5;
          joints.leftElbow.rotation.z -= strike * 0.7;
          joints.torso.rotation.z += crouch * 0.25 - strike * 0.3;
          combatant.model.position.x += strike * 0.16;
          break;
        case "schlein":
          joints.rightShoulder.rotation.z = THREE.MathUtils.lerp(joints.rightShoulder.rotation.z - crouch * 0.3, 2.45, strike);
          joints.rightShoulder.rotation.x -= strike * 0.9;
          joints.rightElbow.rotation.y += Math.sin(attack.age * 20) * strike * 0.5;
          joints.torso.rotation.z += crouch * 0.2 - strike * 0.2;
          combatant.model.position.y += strike * 0.12 - crouch * 0.08;
          break;
        case "conte":
          joints.rightShoulder.rotation.z -= crouch * 0.45;
          joints.rightShoulder.rotation.y -= strike * 0.6;
          joints.rightElbow.rotation.z += Math.sin(progress * Math.PI * 4) * strike * 0.25;
          joints.rightElbow.rotation.x += strike * 0.45;
          combatant.model.position.x += strike * 0.2;
          joints.head.rotation.z -= crouch * 0.15;
          break;
        case "bonelli":
          joints.rightShoulder.rotation.z = THREE.MathUtils.lerp(joints.rightShoulder.rotation.z, 2.6, strike);
          joints.rightElbow.rotation.z = THREE.MathUtils.lerp(joints.rightElbow.rotation.z, 0.3, strike);
          joints.leftShoulder.rotation.z -= strike * 0.5;
          combatant.prop.rotation.z += progress * Math.PI * 2;
          break;
      }
    }
  }

  const recoil = clamp(combatant.reactionTime / 0.3, 0, 1);
  joints.torso.rotation.z += recoil * 0.55;
  joints.head.rotation.z += recoil * 0.2;
  combatant.model.rotation.z = combatant.airRotation;
  combatant.model.position.y += Math.abs(Math.sin(combatant.airRotation)) * 0.38 * definition.height;
  if (opponentBody) {
    const target = new THREE.Vector3();
    opponentBody.joints.head.getWorldPosition(target);
    joints.head.parent.worldToLocal(target);
    target.sub(joints.head.position);
    const yaw = Math.atan2(target.x, target.z);
    const pitch = -Math.atan2(target.y, Math.hypot(target.x, target.z));
    const tracking = 1 - Math.exp(-8 * dt);
    const previousYaw = combatant.headYaw ?? 0;
    const yawDelta = Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw));
    combatant.headYaw = previousYaw + yawDelta * tracking;
    combatant.headPitch = THREE.MathUtils.lerp(combatant.headPitch ?? 0, pitch, tracking);
    joints.head.rotation.y = combatant.headYaw;
    joints.head.rotation.x = combatant.headPitch;
  }
  const action = attack ? Math.sin(clamp(attack.age / attack.duration, 0, 1) * Math.PI) : 0;
  const motionX = clamp(combatant.vz * 0.06 + (combatant.vy || 0) * 0.025, -0.35, 0.35);
  const motionZ = clamp(combatant.vx * combatant.facing * 0.04 + joints.torso.rotation.z * 0.5 + action * 0.2, -0.45, 0.45);
  for (const piece of combatant.clothing) {
    const { side: pieceSide, kind } = piece;
    const strength = kind === "hair" ? 0.35 : kind === "tie" ? 0.55 : 1;
    const baseX = kind === "scarf" ? -0.4 : 0;
    const baseZ = kind === "coat" || kind === "scarf" ? pieceSide * 0.08 : 0;
    const flutter = Math.sin(combatant.animationTime * 4 + pieceSide) * 0.025;
    springAccessory(piece, baseX - motionX * strength + flutter, baseZ - motionZ * strength + flutter, dt);
  }
}

function updateCombatant(combatant, dt, opponentBody) {
  if (!combatant) return;
  combatant.cooldown = Math.max(0, combatant.cooldown - dt);
  if (combatant.input) {
    advanceInputClock(combatant.input, dt);
    if (combatant.stun > 0 || combatant.airborne || combatant.landingTime > 0) clearComboInput(combatant.input);
  }
  combatant.stun = Math.max(0, combatant.stun - dt);
  combatant.reactionTime = Math.max(0, combatant.reactionTime - dt);
  combatant.dodgeTimer = Math.max(0, combatant.dodgeTimer - dt);
  combatant.blockTimer = Math.max(0, combatant.blockTimer - dt);
  combatant.parryTimer = Math.max(0, (combatant.parryTimer || 0) - dt);
  combatant.parryRecovery = Math.max(0, (combatant.parryRecovery || 0) - dt);
  combatant.parryPose = Math.max(0, (combatant.parryPose || 0) - dt);
  combatant.risingTimer = Math.max(0, (combatant.risingTimer || 0) - dt);
  if (!combatant.isPlayer && combatant.blockTimer <= 0) {
    combatant.blocking = false;
    combatant.guardMode = null;
  }

  if (combatant.attack) {
    combatant.attack.age += dt;
    tryHit(combatant, opponentBody);
    if (combatant.attack && combatant.attack.age > combatant.attack.duration) {
      combatant.attack = null;
      if (combatant.input) endComboAttack(combatant.input);
    }
  }

  if (combatant.isPlayer && combatant.input) consumeBufferedAttack(combatant);
  const aura = combatant.root.getObjectByName("bossAura");
  if (aura) aura.material.opacity = 0.1 + (Math.sin(combatant.animationTime * 5) + 1) * 0.035;
  combatant.vy -= (combatant.airborne && combatant.juggle?.hits ? 10.5 : 13.5) * dt;
  combatant.y += combatant.vy * dt;
  if (combatant.y < 0) {
    combatant.y = 0;
    if (combatant.airborne) {
      combatant.airborne = false;
      combatant.juggle = null;
      combatant.airRotation = Math.atan2(Math.sin(combatant.airRotation), Math.cos(combatant.airRotation));
      combatant.landingTime = 0.55;
      combatant.stun = Math.max(combatant.stun, 0.55);
      shake = Math.max(shake, 0.18);
    }
    combatant.vy = 0;
  }
  if (combatant.airborne) {
    combatant.airRotation += 7 * dt;
  } else if (combatant.landingTime > 0) {
    combatant.landingTime = Math.max(0, combatant.landingTime - dt);
    const targetRotation = combatant.landingTime < 0.25 ? 0 : Math.PI / 2;
    const delta = Math.atan2(Math.sin(targetRotation - combatant.airRotation), Math.cos(targetRotation - combatant.airRotation));
    combatant.airRotation += delta * (1 - Math.exp(-12 * dt));
    combatant.airRotation = Math.atan2(Math.sin(combatant.airRotation), Math.cos(combatant.airRotation));
  } else {
    combatant.airRotation *= Math.exp(-12 * dt);
  }
  if (combatant.hitCombo && !combatant.airborne && combatant.landingTime <= 0 && combatant.stun <= 0) {
    combatant.hitCombo = null;
    updateComboBadge(combatant);
  }
  combatant.x += combatant.vx * dt;
  combatant.z += combatant.vz * dt;
  combatant.vx *= Math.pow(0.0007, dt);
  combatant.vz *= Math.pow(0.003, dt);
  combatant.x = clamp(combatant.x, -6.1, 6.1);
  combatant.z = clamp(combatant.z, -2.65, 2.65);

  const target = opponentBody;
  if (target) combatant.facing = target.x >= combatant.x ? 1 : -1;
  if (target && Math.abs(combatant.x - target.x) < 0.78 && Math.abs(combatant.z - target.z) < 0.55) {
    const direction = combatant.x <= target.x ? -1 : 1;
    combatant.x += direction * 0.6 * dt;
  }
  combatant.root.position.set(combatant.x, combatant.y, combatant.z);
  combatant.root.scale.x = combatant.facing;
  poseFighter(combatant, dt, opponentBody);
  if (combatant.dodgeTimer > 0 && Math.abs(combatant.vz) > 0.8 && !combatant.airborne) {
    combatant.ghostTimer = (combatant.ghostTimer ?? 0) - dt;
    if (combatant.ghostTimer <= 0) {
      spawnSidestepGhost(combatant);
      combatant.ghostTimer = 0.09;
    }
  } else combatant.ghostTimer = 0;
}

function updateBallots(dt) {
  nextBallot -= dt;
  if (nextBallot <= 0) {
    nextBallot = random(0.42, 1.2);
    spawnBallot(random(-7.5, 7.5), random(3, 7), random(-6.5, 0), Math.random() < 0.5 ? -1 : 1);
  }
  for (let i = ballots.length - 1; i >= 0; i -= 1) {
    const ballot = ballots[i];
    ballot.life -= dt;
    ballot.mesh.position.x += ballot.vx * dt;
    ballot.mesh.position.y += ballot.vy * dt;
    ballot.mesh.position.z += ballot.vz * dt;
    ballot.mesh.rotation.set(ballot.mesh.rotation.x + dt * ballot.spin, ballot.mesh.rotation.y + dt * ballot.spin * 0.5, ballot.mesh.rotation.z + dt * ballot.spin * 0.2);
    if (ballot.projectile) checkSingleProjectile(ballot);
    if (ballot.life <= 0 || Math.abs(ballot.mesh.position.x) > 10 || ballot.mesh.position.y < -1) {
      scene.remove(ballot.mesh);
      ballots.splice(i, 1);
    }
  }
}

function checkSingleProjectile(ballot) {
  if (ballot.hit || !matchActive) return;
  const source = ballot.owner;
  const target = source === player ? opponent : player;
  if (!source || !target) return;
  if (Math.abs(ballot.mesh.position.x - target.x) < 0.48 &&
      Math.abs(ballot.mesh.position.z - target.z) < 0.85 &&
      Math.abs(ballot.mesh.position.y - target.y - 1.1) < 1.25) {
    ballot.hit = true;
    ballot.life = 0;
    resolveCombatImpact(source, target, { ...ballot, damage: ballot.damage ?? 14 }, ballot.mesh.position);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= dt;
    particle.vy -= 8 * dt;
    particle.mesh.position.x += particle.vx * dt;
    particle.mesh.position.y += particle.vy * dt;
    particle.mesh.position.z += particle.vz * dt;
    particle.mesh.scale.multiplyScalar(0.985);
    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      particle.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function updateImpactEffects(dt) {
  for (let i = impactEffects.length - 1; i >= 0; i -= 1) {
    const effect = impactEffects[i];
    effect.life -= dt;
    const progress = 1 - Math.max(effect.life, 0) / effect.duration;
    effect.mesh.material.opacity = 1 - progress;
    if (effect.kind === "spark") {
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      effect.velocity.y -= 7 * dt;
    } else {
      effect.mesh.scale.setScalar(0.2 + progress * 1.25);
      effect.mesh.quaternion.copy(camera.quaternion);
    }
    if (effect.life <= 0) {
      scene.remove(effect.mesh);
      effect.mesh.material.dispose();
      impactEffects.splice(i, 1);
    }
  }
}

function checkTimer(dt) {
  if (!matchActive) return;
  elapsed = Math.max(0, elapsed - dt);
  timerNode.textContent = `${Math.ceil(elapsed)}`;
  if (elapsed === 0) {
    const winner = player.health / 100 >= opponent.health / (opponent.maxHealth || 100) ? player : opponent;
    finishMatch(winner, "timeout");
  }
}

function updateVictory(dt) {
  const { winner, loser } = victory;
  victory.time += dt;

  winner.vy -= 13.5 * dt;
  winner.y = Math.max(0, winner.y + winner.vy * dt);
  if (winner.y === 0) winner.vy = 0;
  winner.root.position.set(winner.x, winner.y, winner.z);
  winner.root.rotation.y = 0;
  winner.airRotation *= Math.exp(-8 * dt);
  winner.reactionTime = Math.max(0, winner.reactionTime - dt);
  poseFighter(winner, dt);
  const celebration = Math.min(victory.time / 0.55, 1);
  const pump = Math.sin(victory.time * 5);
  winner.joints.rightShoulder.rotation.z = THREE.MathUtils.lerp(
    winner.joints.rightShoulder.rotation.z, 2.8 + pump * 0.22, celebration
  );
  winner.joints.rightElbow.rotation.z = THREE.MathUtils.lerp(
    winner.joints.rightElbow.rotation.z, 0.25 + pump * 0.3, celebration
  );
  if (winner.definition.id === "conte" || winner.definition.id === "tajani") {
    winner.joints.leftElbow.rotation.z += Math.sin(victory.time * 3) * 0.25 * celebration;
  }

  loser.vy -= 13.5 * dt;
  loser.y = Math.max(0, loser.y + loser.vy * dt);
  if (loser.y === 0) loser.vy = 0;
  loser.x = clamp(loser.x + loser.vx * dt, -6.1, 6.1);
  loser.vx *= Math.exp(-5 * dt);
  loser.root.position.set(loser.x, loser.y, loser.z);
  loser.root.rotation.y = 0;
  const settle = 1 - Math.exp(-8 * dt);
  const fall = Math.atan2(Math.sin(Math.PI / 2 - loser.airRotation), Math.cos(Math.PI / 2 - loser.airRotation));
  loser.airRotation += fall * settle;
  loser.airRotation = Math.atan2(Math.sin(loser.airRotation), Math.cos(loser.airRotation));
  loser.model.rotation.z = loser.airRotation;
  loser.model.position.y = Math.abs(Math.sin(loser.airRotation)) * 0.38 * loser.definition.height;
  loser.joints.hips.rotation.z = THREE.MathUtils.lerp(loser.joints.hips.rotation.z, 0, settle);
  loser.joints.torso.rotation.y = THREE.MathUtils.lerp(loser.joints.torso.rotation.y, Math.PI / 2, settle);
  loser.joints.torso.rotation.z = THREE.MathUtils.lerp(loser.joints.torso.rotation.z, 0, settle);
  loser.joints.leftShoulder.rotation.z = THREE.MathUtils.lerp(loser.joints.leftShoulder.rotation.z, 1, settle);
  loser.joints.leftElbow.rotation.z = THREE.MathUtils.lerp(loser.joints.leftElbow.rotation.z, -0.4, settle);
  loser.joints.rightShoulder.rotation.z = THREE.MathUtils.lerp(loser.joints.rightShoulder.rotation.z, -1, settle);
  loser.joints.rightElbow.rotation.z = THREE.MathUtils.lerp(loser.joints.rightElbow.rotation.z, 0.4, settle);
  for (const joint of [loser.joints.leftHip, loser.joints.rightHip, loser.joints.leftKnee, loser.joints.rightKnee]) {
    joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x, 0, settle);
    joint.rotation.z = THREE.MathUtils.lerp(joint.rotation.z, 0, settle);
  }
  if (victory.time >= 1.8 && !victory.champion) finishRoundTransition(victory.outcome);
}

function update(dt) {
  if (dt <= 0) return;
  if (matchActive) {
    movePlayer(dt);
    updateAI(dt);
    updateCombatant(player, dt, opponent);
    if (matchActive && hitStop <= 0) updateCombatant(opponent, dt, player);
    checkTimer(dt);
  } else if (victory) {
    updateVictory(dt);
  }
  updateBallots(dt);
  updateParticles(dt);
  updateSidestepGhosts(dt);
  for (let i = callouts.length - 1; i >= 0; i -= 1) {
    callouts[i].life -= dt;
    if (callouts[i].life <= 0) {
      callouts[i].element.remove();
      callouts.splice(i, 1);
    }
  }
  if (announcerTimer > 0) {
    announcerTimer -= dt;
    if (announcerTimer <= 0) announcer.classList.remove("show");
  }
  toastTimer -= dt;
  if (toastTimer <= 0) toast.classList.remove("show");
}

function updateCamera(dt) {
  const focus = new THREE.Vector3(0, 1.5, -0.5);
  let distance = 17.4;
  let desired;
  if (victory) {
    const winner = victory.winner;
    const maxOffset = Math.min(0.8, camera.aspect * 0.5);
    const offset = clamp((victory.loser.x - winner.x) * 0.5, -maxOffset, maxOffset);
    focus.set(winner.x + offset, winner.y + 1.55 * winner.definition.height, winner.z);
    distance = Math.max(4.5, 1.3 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    desired = new THREE.Vector3(focus.x + 0.2, winner.y + 0.95, winner.z + distance);
  } else if (player && opponent) {
    focus.set(
      (player.x + opponent.x) / 2,
      1.45 + Math.max(player.y, opponent.y) * 0.35,
      (player.z + opponent.z) / 2
    );
    const span = Math.abs(player.x - opponent.x) + Math.abs(player.z - opponent.z) * 0.3;
    const horizontalFit = (span / 2 + 1.35) /
      (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    distance = clamp(Math.max(8.7 + span * 0.65, horizontalFit + 2.5), 9.5, 48);
  }
  if (!desired) {
    const lateStage = tournament && tournament.currentStage >= 6;
    desired = !tournament
      ? new THREE.Vector3(0, 7.4, 17.4)
      : new THREE.Vector3(focus.x + (lateStage ? 0.5 : 0), focus.y + distance * (lateStage ? 0.22 : 0.3), focus.z + distance);
  }
  const smoothing = 1 - Math.exp(-3.5 * dt);
  cameraRig.lerp(desired, smoothing);
  cameraTarget.lerp(focus, smoothing);
  camera.position.copy(cameraRig);
  if (shake > 0) {
    camera.position.x += random(-shake, shake);
    camera.position.y += random(-shake * 0.4, shake * 0.4);
  }
  camera.lookAt(cameraTarget);
  camera.rotateZ(cameraTilt + (matchActive && tournament.currentStage >= 6 ? 0.025 : 0));
  shake = Math.max(0, shake - dt * 1.8);
  cameraTilt *= Math.exp(-6 * dt);
}

function animate() {
  requestAnimationFrame(animate);
  const elapsedFrame = clock.getDelta();
  if (controllerNoticeUntil && performance.now() >= controllerNoticeUntil) {
    controllerToast.classList.add("hidden");
    controllerNoticeUntil = 0;
  }
  pollGamepads();
  if (isPaused) {
    renderer.render(scene, camera);
    return;
  }
  const frozen = Math.min(hitStop, elapsedFrame);
  hitStop -= frozen;
  update(Math.min(elapsedFrame - frozen, 0.04));
  const visualDt = Math.min(elapsedFrame, 0.1);
  updateCamera(visualDt);
  updateImpactEffects(visualDt);
  renderer.render(scene, camera);
}

function navigateRoster(key) {
  const current = fighters.findIndex((fighter) => fighter.id === selectedId);
  let next = current;
  if (key === "ArrowRight") next = (current + 1) % fighters.length;
  if (key === "ArrowLeft") next = (current + fighters.length - 1) % fighters.length;
  if (key === "ArrowDown") next = (current + 4) % fighters.length;
  if (key === "ArrowUp") next = (current + fighters.length - 4) % fighters.length;
  selectFighter(fighters[next].id, true);
}

function updateTouchVisibility() {
  const visible = touchEnabled && matchActive && !isPaused;
  touchControls.classList.toggle("hidden", !visible);
  rotatePrompt.classList.toggle("hidden", !visible || window.innerHeight <= window.innerWidth);
  touchToggle.textContent = `TOUCH PAD: ${touchEnabled ? "ON" : "OFF"}`;
  touchToggle.setAttribute("aria-pressed", String(touchEnabled));
  document.body.classList.toggle("touch-enabled", touchEnabled);
}

function clearInputs() {
  inputState.clear();
  lastTap.up = lastTap.down = 0;
  for (const { button } of touchPointers.values()) button.classList.remove("pressed");
  touchPointers.clear();
}

function sidestep(action) {
  if (!player || player.stun > 0 || player.airborne || player.landingTime > 0 || player.attack) return;
  player.vz = (action === "up" ? -1 : 1) * 5.2;
  player.dodgeTimer = 0.36;
}

function setInput(action, source, pressed, directSidestep = false) {
  const change = inputState.set(action, source, pressed);
  if (change.released && action === "down" && !isPaused && player?.guardMode === "low") player.risingTimer = 0.25;
  if (!change.pressed) return;
  if (action === "pause") {
    if (matchActive || isPaused) setPaused(!isPaused);
    return;
  }
  if (!matchActive || isPaused) return;
  if (action === "up" || action === "down") {
    const now = performance.now();
    if (directSidestep || (lastTap[action] && now - lastTap[action] < 280)) {
      sidestep(action);
      lastTap[action] = 0;
    } else lastTap[action] = now;
  }
  const attacks = { punchL: "u", punchR: "i", kickL: "j", kickR: "k", launcher: "launcher", special: "l" };
  if (action === "parry") playerAttack("u", true);
  if (attacks[action]) playerAttack(attacks[action]);
}

function handleGamepadMenu(action) {
  const directions = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown" };
  const confirm = action === "kickL" || action === "pause";
  if (!isPaused && !selectScreen.classList.contains("hidden")) {
    if (directions[action]) navigateRoster(directions[action]);
    else if (confirm) beginMatch();
    return;
  }
  let buttons;
  if (isPaused) buttons = [...pauseScreen.querySelectorAll("button")];
  else if (!ladderScreen.classList.contains("hidden")) {
    buttons = [document.querySelector("#next-stage-button"), document.querySelector("#change-fighter-button")];
  } else if (!continueScreen.classList.contains("hidden")) {
    buttons = [document.querySelector("#continue-button"), document.querySelector("#quit-button")];
  } else if (!resultScreen.classList.contains("hidden")) {
    buttons = [document.querySelector("#rematch-button")];
  } else return;

  const index = buttons.indexOf(document.activeElement);
  if (directions[action]) {
    const offset = action === "up" || action === "left" ? -1 : 1;
    buttons[index < 0 ? 0 : (index + offset + buttons.length) % buttons.length].focus();
  } else if (confirm) {
    (buttons[index < 0 ? 0 : index]).click();
  }
}

function pollGamepads() {
  const current = new Map();
  for (const pad of navigator.getGamepads?.() || []) {
    if (!pad || pad.mapping !== "standard") continue;
    for (const [action, pressed] of Object.entries(gamepadActions(pad))) {
      const source = `gamepad:${pad.index}:${action}`;
      if (pressed) current.set(source, action);
    }
  }
  for (const [source, action] of gamepadPrevious) {
    if (!current.has(source)) setInput(action, source, false);
  }
  for (const [source, action] of current) {
    if (gamepadPrevious.has(source)) continue;
    if (isPaused && action === "pause") setInput(action, source, true);
    else if (isPaused || !matchActive) handleGamepadMenu(action);
    else setInput(action, source, true);
  }
  gamepadPrevious.clear();
  for (const [source, action] of current) gamepadPrevious.set(source, action);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.startsWith("Arrow") ? event.key : event.key.toLowerCase();
  if ((key === "escape" || key === "p") && (matchActive || isPaused)) {
    event.preventDefault();
    if (!event.repeat) setInput("pause", `keyboard:${key}`, true);
    return;
  }
  if (isPaused) {
    if (key === "tab") {
      const buttons = [...pauseScreen.querySelectorAll("button")];
      if (!buttons.includes(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
      } else if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons[buttons.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
        event.preventDefault();
        buttons[0].focus();
      }
    }
    return;
  }
  if (event.target === musicToggle || event.target === touchToggle) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) ||
      (event.key === " " && event.target !== document.querySelector("#quit-button") &&
        event.target !== document.querySelector("#change-fighter-button"))) event.preventDefault();

  if (!matchActive) {
    if (!continueScreen.classList.contains("hidden")) {
      if (event.target === document.querySelector("#quit-button") && (key === "enter" || key === " ")) return;
      if (key === "enter" || key === " ") {
        event.preventDefault();
        retryStage();
      } else if (key === "escape") returnToTitleScreen();
      return;
    }
    if (!ladderScreen.classList.contains("hidden")) {
      if (event.target === document.querySelector("#change-fighter-button")) return;
      if (key === "enter" || key === " ") {
        event.preventDefault();
        startRound();
      }
      return;
    }
    if (!selectScreen.classList.contains("hidden")) {
      if (key.startsWith("Arrow")) navigateRoster(key);
      if (key === "enter" && selectedId) {
        event.preventDefault();
        beginMatch();
      }
    }
    if (!resultScreen.classList.contains("hidden") && (key === "enter" || key === " ")) {
      event.preventDefault();
      returnToTitleScreen();
    }
    return;
  }

  const action = keyboardActions[key.toLowerCase()];
  if (action && !event.repeat) setInput(action, `keyboard:${key.toLowerCase()}`, true);
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  const action = keyboardActions[key];
  if (action) setInput(action, `keyboard:${key}`, false);
});
window.addEventListener("blur", clearInputs);
window.addEventListener("gamepadconnected", () => {
  controllerToast.textContent = "CONTROLLER CONNECTED - PRESS START";
  controllerToast.classList.remove("hidden");
  controllerNoticeUntil = performance.now() + 2500;
});
window.addEventListener("gamepaddisconnected", () => {
  controllerToast.textContent = "CONTROLLER DISCONNECTED";
  controllerToast.classList.remove("hidden");
  controllerNoticeUntil = performance.now() + 2500;
});
window.addEventListener("resize", updateTouchVisibility);
touchToggle.addEventListener("click", () => {
  touchEnabled = !touchEnabled;
  clearInputs();
  updateTouchVisibility();
});
touchControls.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !matchActive || isPaused || !touchEnabled) return;
  event.preventDefault();
  button.setPointerCapture(event.pointerId);
  touchPointers.set(event.pointerId, { button, action: button.dataset.action });
  button.classList.add("pressed");
  setInput(button.dataset.action, `touch:${event.pointerId}`, true, true);
});
function releaseTouch(event) {
  const entry = touchPointers.get(event.pointerId);
  if (!entry) return;
  touchPointers.delete(event.pointerId);
  if (![...touchPointers.values()].some(({ button }) => button === entry.button)) entry.button.classList.remove("pressed");
  setInput(entry.action, `touch:${event.pointerId}`, false);
}
touchControls.addEventListener("pointerup", releaseTouch);
touchControls.addEventListener("pointercancel", releaseTouch);
touchControls.addEventListener("lostpointercapture", releaseTouch);

startButton.addEventListener("click", beginMatch);
document.querySelector("#next-stage-button").addEventListener("click", startRound);
document.querySelector("#continue-button").addEventListener("click", retryStage);
document.querySelector("#quit-button").addEventListener("click", returnToTitleScreen);
document.querySelector("#rematch-button").addEventListener("click", returnToTitleScreen);
document.querySelector("#change-fighter-button").addEventListener("click", returnToTitleScreen);
pauseButton.addEventListener("click", () => setPaused(true));
document.querySelector("#resume-button").addEventListener("click", () => setPaused(false));
document.querySelector("#restart-button").addEventListener("click", restartMatch);
document.querySelector("#pause-quit-button").addEventListener("click", returnToTitleScreen);

if (!sound.available) {
  musicToggle.disabled = true;
  musicToggle.title = "Web Audio is not available in this browser.";
}
function unlockAudio() {
  if (!sound.unlock()) {
    musicToggle.disabled = true;
    musicToggle.title = "Web Audio could not be initialized.";
  }
}
window.addEventListener("pointerdown", unlockAudio, true);
window.addEventListener("keydown", unlockAudio, true);
musicToggle.addEventListener("click", () => {
  const enabled = musicToggle.getAttribute("aria-pressed") !== "true";
  musicToggle.setAttribute("aria-pressed", String(enabled));
  musicToggle.textContent = `Music: ${enabled ? "On" : "Off"}`;
  sound.setMusicEnabled(enabled);
});

createArena();
buildRoster();
updateTouchVisibility();
animate();
