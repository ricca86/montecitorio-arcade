import * as THREE from "./vendor/three/three.module.min.js";
import { fighters } from "./fighters.js";

const mount = document.querySelector("#game-canvas");
const rosterNode = document.querySelector("#roster");
const selectScreen = document.querySelector("#select-screen");
const resultScreen = document.querySelector("#result-screen");
const calloutLayer = document.querySelector("#callout-layer");
const announcer = document.querySelector("#announcer");
const toast = document.querySelector("#signature-toast");
const startButton = document.querySelector("#start-button");
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

scene.add(new THREE.HemisphereLight("#b5a5bf", "#1a1424", 0.7));
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
const keys = new Set();
const lastTap = { w: 0, s: 0, ArrowUp: 0, ArrowDown: 0 };
const fightersInMatch = [];
const ballots = [];
const particles = [];
const impactEffects = [];
const comicWords = ["RIBALTONE!", "VETO!", "FIDUCIA!", "QUORUM!"];
const cameraRig = new THREE.Vector3(0, 7.4, 17.4);
const cameraTarget = new THREE.Vector3(0, 1.5, -0.5);
const sparkGeometry = new THREE.OctahedronGeometry(0.07, 0);
const ringGeometry = new THREE.RingGeometry(0.68, 0.82, 16);

let selectedId = null;
let player = null;
let opponent = null;
let matchActive = false;
let matchOver = false;
let elapsed = 60;
let hitStop = 0;
let shake = 0;
let cameraTilt = 0;
let toastTimer = 0;
let bannerTimer = 0;
let bannerPending = false;
let nextBallot = 0;

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
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 9), material(color));
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
    const lens = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.018, 5, 12),
      material("#28272d", 0.36, 0.25)
    );
    lens.position.set(x, 0.08, 0.38);
    group.add(lens);
  }
  addBox(group, [0.1, 0.026, 0.03], [0, 0.08, 0.39], "#29272b");
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
      break;
    }
    case "briefcase":
      addBox(prop, [0.55, 0.4, 0.2], [0.12, -0.15, 0], "#8c5c37");
      addBox(prop, [0.19, 0.045, 0.045], [0.12, 0.1, 0.12], "#d7b15d");
      break;
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
  const leftShoulder = makeJoint(torso, "leftShoulder", [-0.46, 0.62, 0.23]);
  const rightShoulder = makeJoint(torso, "rightShoulder", [0.46, 0.62, 0.04]);
  const leftElbow = makeJoint(leftShoulder, "leftElbow", [0, -0.34, 0]);
  const rightElbow = makeJoint(rightShoulder, "rightElbow", [0, -0.34, 0]);
  const leftHip = makeJoint(hips, "leftHip", [-0.23, 0, 0]);
  const rightHip = makeJoint(hips, "rightHip", [0.23, 0, 0]);
  const leftKnee = makeJoint(leftHip, "leftKnee", [0, -0.37, 0]);
  const rightKnee = makeJoint(rightHip, "rightKnee", [0, -0.37, 0]);
  const joints = { hips, torso, head, leftShoulder, leftElbow, rightShoulder, rightElbow, leftHip, leftKnee, rightHip, rightKnee };

  addBox(hips, [0.55, 0.22, 0.38], [0, 0, 0], "#34303b");
  const shoulders = definition.id === "schlein" ? 0.91 : definition.id === "meloni" ? 0.73 : 0.84;
  addBox(torso, [shoulders, 0.72, 0.45], [0, 0.38, 0], definition.suit);
  addBox(torso, [0.23, 0.6, 0.035], [0, 0.37, 0.24], definition.tie);
  addBox(torso, [0.28, 0.17, 0.035], [0, 0.67, 0.24], "#f2eee4");
  if (definition.id === "salvini") {
    addBox(torso, [0.035, 0.66, 0.025], [0, 0.36, 0.25], "#afd0e3");
    addBox(torso, [0.22, 0.12, 0.025], [-0.23, 0.48, 0.25], "#245d9c");
  }
  if (definition.id === "conte") addBox(torso, [0.15, 0.1, 0.025], [-0.26, 0.52, 0.25], "#f4ede0");
  if (definition.pin) addSphere(torso, 0.06, [-0.29, 0.52, 0.25], "#edc735", [1, 1, 0.4]);

  const upperColor = definition.id === "salvini" ? "#d8dfdf" : definition.suit;
  const forearmColor = definition.rolledSleeves ? definition.skin : upperColor;
  for (const [shoulder, elbow] of [[leftShoulder, leftElbow], [rightShoulder, rightElbow]]) {
    addBox(shoulder, [0.25, 0.37, 0.29], [0, -0.17, 0], upperColor);
    addSphere(shoulder, 0.13, [0, 0, 0], upperColor);
    addBox(elbow, [0.21, 0.32, 0.23], [0, -0.16, 0], forearmColor);
    if (definition.rolledSleeves) addBox(elbow, [0.25, 0.11, 0.26], [0, -0.02, 0], "#f1eee5");
    if (definition.id === "tajani") addStarCuff(elbow);
  }
  const leftHand = makeJoint(leftElbow, "leftHand", [0, -0.34, 0.02]);
  const rightHand = makeJoint(rightElbow, "rightHand", [0, -0.34, 0.02]);
  addSphere(leftHand, 0.13, [0, 0, 0], definition.skin);
  addSphere(rightHand, 0.13, [0, 0, 0], definition.skin);

  for (const [hip, knee] of [[leftHip, leftKnee], [rightHip, rightKnee]]) {
    addBox(hip, [0.27, 0.4, 0.3], [0, -0.18, 0], "#34303b");
    addSphere(hip, 0.14, [0, 0, 0], "#34303b");
    addBox(knee, [0.23, 0.37, 0.26], [0, -0.18, 0], "#34303b");
    addBox(knee, [0.3, 0.15, 0.42], [0, -0.36, 0.08], "#201e26");
  }

  addSphere(head, 0.46, [0, 0, 0], definition.skin, [0.9, 1.05, 0.88]);
  addSphere(head, 0.36, [0, 0.32, -0.04], definition.hair, [1.06, 0.48, 0.94]);
  if (definition.id === "meloni") {
    addBox(head, [0.2, 0.53, 0.46], [-0.34, 0.05, -0.02], definition.hair, { rotation: [0, 0, -0.1] });
    addBox(head, [0.2, 0.53, 0.46], [0.34, 0.05, -0.02], definition.hair, { rotation: [0, 0, 0.1] });
    addBox(head, [0.48, 0.11, 0.15], [0, 0.28, 0.28], definition.hair, { rotation: [0, 0, -0.12] });
  } else if (definition.wavyHair) {
    for (let i = 0; i < 5; i += 1) {
      addSphere(head, 0.16, [-0.27 + i * 0.135, 0.31 + (i % 2) * 0.05, 0.08], definition.hair, [1, 0.8, 0.8]);
    }
  } else if (definition.slickHair) {
    addSphere(head, 0.32, [0, 0.32, -0.1], definition.hair, [1.1, 0.7, 1]);
    addBox(head, [0.6, 0.13, 0.38], [0, 0.29, -0.03], definition.hair, { rotation: [0.12, 0, 0] });
  } else if (definition.id === "renzi") {
    addBox(head, [0.56, 0.17, 0.35], [0, 0.31, -0.02], definition.hair, { rotation: [0, 0, -0.1] });
  }

  for (const x of [-0.15, 0.15]) {
    addSphere(head, 0.065, [x, 0.08, 0.39], "#fff8ec", [1, 1, 0.45]);
    addSphere(head, 0.029, [x + 0.018, 0.08, 0.42], "#2c2830", [1, 1, 0.5]);
    addBox(head, [0.14, 0.035, 0.03], [x, 0.18, 0.39], definition.hair, { rotation: [0, 0, definition.id === "meloni" ? Math.sign(x) * 0.18 : 0] });
  }
  addSphere(head, 0.07, [0, -0.03, 0.44], definition.skin, [0.8, 0.75, 0.7]);
  addBox(head, [0.16, 0.035, 0.025], [0, -0.19, 0.41], "#8c4c4a");

  if (definition.beard) {
    addSphere(head, 0.28, [0, -0.2, 0.13], definition.hair, [0.92, 0.56, 0.85]);
    addBox(head, [0.42, 0.18, 0.14], [0, -0.14, 0.33], definition.hair);
  }
  if (definition.glasses) addGlasses(head);
  if (definition.scarf) {
    addBox(torso, [0.72, 0.17, 0.5], [0, 0.74, 0.02], "#428555");
    addBox(torso, [0.17, 0.62, 0.08], [-0.25, 0.58, -0.34], "#3e9257", { rotation: [-0.8, 0, -0.4] });
    addBox(torso, [0.14, 0.46, 0.08], [-0.42, 0.48, -0.57], "#5ca565", { rotation: [-0.5, 0, -0.6] });
  }

  const prop = createProp(rightHand, definition);
  return { root, model, joints, leftHand, rightHand, prop };
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
    blockTimer: 0,
    blocking: false,
    stun: 0,
    spinTimer: 0,
    comboCount: 0,
    comboWindow: 0,
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
  announcer.classList.add("show");
  window.setTimeout(() => announcer.classList.remove("show"), 1700);
}

function disposeFighter(combatant) {
  scene.remove(combatant.root);
  combatant.root.traverse((part) => {
    if (!part.isMesh) return;
    part.geometry.dispose();
    if (Array.isArray(part.material)) part.material.forEach((entry) => entry.dispose());
    else part.material.dispose();
  });
}

function beginMatch() {
  if (!selectedId || matchActive) return;
  if (fightersInMatch.length) {
    fightersInMatch.forEach(disposeFighter);
    fightersInMatch.length = 0;
  }
  const choices = fighters.filter((fighter) => fighter.id !== selectedId);
  const rival = choices[Math.floor(Math.random() * choices.length)];
  player = createCombatant(fightersById.get(selectedId), -2.7, 0.25, 1, true);
  opponent = createCombatant(rival, 2.7, -0.15, -1, false);
  fightersInMatch.push(player, opponent);
  elapsed = 60;
  matchOver = false;
  matchActive = true;
  hitStop = 0;
  for (const trail of [playerTrailNode, opponentTrailNode]) {
    trail.style.transition = "none";
    trail.style.width = "100%";
    void trail.offsetWidth;
    trail.style.transition = "";
  }
  selectScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");
  document.querySelector("#hud").classList.add("active");
  document.querySelector("#player-name").textContent = player.definition.name;
  document.querySelector("#opponent-name").textContent = opponent.definition.name;
  toast.textContent = `SIGNATURE: ${player.definition.special.toUpperCase()}  ·  PRESS L`;
  updateHealthDisplay();
  showAnnouncer();
  window.setTimeout(() => {
    if (matchActive) announcer.classList.remove("show");
  }, 1700);
}

function resetToSelect() {
  matchActive = false;
  matchOver = false;
  resultScreen.classList.add("hidden");
  selectScreen.classList.remove("hidden");
  document.querySelector("#hud").classList.remove("active");
  fightersInMatch.forEach(disposeFighter);
  fightersInMatch.length = 0;
  player = null;
  opponent = null;
  buildRoster();
}

function updateHealthDisplay() {
  if (!player || !opponent) return;
  const playerHealth = clamp(player.health, 0, 100);
  const opponentHealth = clamp(opponent.health, 0, 100);
  playerHealthNode.style.width = `${playerHealth}%`;
  opponentHealthNode.style.width = `${opponentHealth}%`;
  playerTrailNode.style.width = `${playerHealth}%`;
  opponentTrailNode.style.width = `${opponentHealth}%`;
  document.querySelector("#player-percent").textContent = `${Math.ceil(playerHealth)}%`;
  document.querySelector("#opponent-percent").textContent = `${Math.ceil(opponentHealth)}%`;
  timerNode.textContent = `${Math.ceil(elapsed)}`;
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
  window.setTimeout(() => element.remove(), 950);
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

function spawnImpact(point, { launch = false, special = false, direction = 1 } = {}) {
  const colors = special ? ["#ff3d42", "#ffba62"] :
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
  base.windup = Math.max(0.07, base.windup - fast * 0.012);
  return base;
}

function queueAttack(combatant, kind, extra = {}) {
  if (!matchActive || combatant.health <= 0 || combatant.stun > 0) return;
  if (combatant.cooldown > 0 && combatant.attack) return;
  const attack = attackDefinition(combatant, kind, extra);
  combatant.attack = { ...attack, age: 0, hit: false };
  combatant.cooldown = attack.duration + 0.04;
  combatant.blocking = false;
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
  if (!matchActive || combatant.cooldown > 0 || combatant.stun > 0) return;
  const special = getSpecial(combatant);
  if (special.guard) combatant.blockTimer = 0.52;
  if (special.kind === "rush") {
    combatant.x += combatant.facing * 0.48;
    combatant.root.position.x = combatant.x;
  }
  if (special.kind === "spin" || special.kind === "eco-spin") combatant.spinTimer = special.duration;
  queueAttack(combatant, special.kind, special);
  announceSpecial(combatant);
  if (special.projectile) {
    spawnBallot(
      combatant.x + combatant.facing * 0.75,
      combatant.y + 1.65,
      combatant.z,
      combatant.facing,
      special.color,
      special.kind === "dossier" ? 1.7 : 1.45,
      { ...special, owner: combatant }
    );
  } else {
    spawnBurst(combatant, special.color, 16);
  }
}

function playerAttack(key) {
  if (!player || !matchActive) return;
  if (key === "i" && keys.has("s")) {
    queueAttack(player, "launcher", { damage: 10, range: 1.38, windup: 0.17, duration: 0.42, launch: true, limb: "rightPunch" });
    return;
  }
  if (key === "u") {
    if (player.comboWindow > 0) player.comboCount += 1;
    else player.comboCount = 1;
    player.comboWindow = 0.72;
    queueAttack(player, "punch", { limb: "leftPunch" });
  } else if (key === "i") {
    if (player.comboCount >= 2 && player.comboWindow > 0) {
      queueAttack(player, "combo-finisher", { damage: 12, range: 1.5, launch: true, duration: 0.4, limb: "rightPunch" });
    } else queueAttack(player, "punch", { damage: 8, range: 1.18, limb: "rightPunch" });
    player.comboCount = 0;
    player.comboWindow = 0;
  }
  else if (key === "j" || key === "k") queueAttack(player, "kick", { damage: 8, range: 1.4, low: true, limb: key === "j" ? "leftKick" : "rightKick" });
}

function tryHit(attacker, target) {
  const attack = attacker.attack;
  if (!attack || attack.hit || attack.age < attack.windup) return;
  attack.hit = true;
  if (attack.projectile) return;
  const dx = Math.abs(attacker.x - target.x);
  const dz = Math.abs(attacker.z - target.z);
  const targetAirborne = target.y > 0.35;
  if (dx > attack.range || dz > 0.95 || (targetAirborne && !attack.launch && attack.kind !== "kick" && attack.kind !== "spin" && attack.kind !== "eco-spin")) return;
  if (target.dodgeTimer > 0) {
    spawnCallout("SCHIVATA!", target.x, target.y + 2.4, target.z);
    return;
  }

  let damage = attack.damage;
  if (target.blocking && attack.high && !attack.unblockable) damage *= 0.18;
  target.health = Math.max(0, target.health - damage);
  target.stun = target.blocking ? 0.12 : 0.25;
  target.vx = attacker.facing * (attack.knockdown ? 4.4 : 2.2);
  if (attack.launch && !targetAirborne) target.vy = 5.1;
  else if (attack.knockdown) target.vy = 2.2;
  attacker.vx = -attacker.facing * 0.22;
  hitStop = Math.max(hitStop, 0.06);
  shake = Math.max(shake, attack.knockdown ? 0.38 : 0.22);
  if (attack.launch || attack.knockdown || attack.kind === "heavy") {
    cameraTilt = attacker.facing * (attack.launch ? 0.045 : 0.03);
  }
  spawnCallout(target.blocking ? "BLOCCATO!" : comicWords[Math.floor(Math.random() * comicWords.length)], target.x, target.y + 2.65, target.z);
  spawnImpact(contactPoint(attacker, target, attack), {
    launch: attack.launch,
    special: attack.special,
    direction: attacker.facing
  });
  updateHealthDisplay();
  if (target.health <= 0) finishMatch(attacker);
}

function finishMatch(winner) {
  if (matchOver) return;
  matchOver = true;
  matchActive = false;
  document.querySelector("#result-title").textContent = winner.isPlayer ? "FIDUCIA!" : "VETO!";
  document.querySelector("#result-copy").textContent = `${winner.definition.name} wins the chamber vote. The session is adjourned.`;
  resultScreen.classList.remove("hidden");
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
  const dx = player.x - ai.x;
  const dz = player.z - ai.z;
  const distance = Math.abs(dx);
  ai.facing = dx >= 0 ? 1 : -1;
  ai.root.scale.x = ai.facing;
  ai.aiTimer -= dt;

  if (player.attack && player.attack.age < player.attack.windup && ai.aiState !== "SIDESTEP") {
    if (Math.random() < 0.035 && distance < 2.4) {
      ai.dodgeTimer = 0.42;
      ai.aiSide = Math.random() < 0.5 ? -1 : 1;
      setAIState("SIDESTEP", 0.35);
    } else if (player.attack.high && Math.random() < 0.12) {
      ai.blockTimer = 0.45;
    }
  }

  if (player.y > 0.4 && distance < 3.2) {
    if (ai.aiState !== "JUGGLE_FOLLOWUP") setAIState("JUGGLE_FOLLOWUP", 0.42);
  } else if (ai.aiState === "JUGGLE_FOLLOWUP" && ai.aiTimer <= 0) {
    setAIState("IDLE", 0.4);
  }

  switch (ai.aiState) {
    case "IDLE":
      if (distance > 2.1) setAIState("APPROACH", 0.8);
      else if (distance < 1.25 && Math.random() < 0.012) setAIState("SIDESTEP", 0.32);
      else if (ai.aiTimer <= 0 && ai.cooldown <= 0) setAIState("ATTACK", 0.6);
      break;
    case "APPROACH":
      ai.vx = ai.facing * ai.definition.stats.speed * 0.18;
      if (distance < 1.75) setAIState("ATTACK", 0.62);
      break;
    case "ATTACK":
      if (ai.aiCombo < 2 && ai.cooldown <= 0) {
        queueAttack(ai, ai.aiCombo === 0 ? "punch" : "kick", { damage: ai.aiCombo ? 8 : 6, range: 1.45, limb: ai.aiCombo === 0 ? "leftPunch" : "rightKick" });
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
      if (distance > 1.2) ai.vx = ai.facing * ai.definition.stats.speed * 0.2;
      if (distance < 1.8 && ai.cooldown <= 0 && player.y > 0.25) {
        queueAttack(ai, "kick", { damage: 6, range: 1.9, windup: 0.1, limb: "rightKick" });
      }
      if (ai.aiTimer <= 0 && player.y < 0.1) setAIState("IDLE", 0.45);
      break;
    default:
      setAIState("IDLE");
  }

  ai.blocking = ai.blockTimer > 0;
  if (distance > 1.7) ai.vz += clamp(dz, -1, 1) * 0.55;
}

function movePlayer(dt) {
  if (!player || player.stun > 0) return;
  let direction = 0;
  if (keys.has("a") || keys.has("arrowleft")) direction -= 1;
  if (keys.has("d") || keys.has("arrowright")) direction += 1;
  if (direction) {
    player.vx += direction * player.definition.stats.speed * 0.38;
  }
  player.blocking = keys.has("shift") || player.blockTimer > 0;
}

function poseFighter(combatant, dt) {
  const { joints, definition, attack } = combatant;
  const movement = clamp(Math.hypot(combatant.vx, combatant.vz) / 2.5, 0, 1);
  combatant.walkPhase += dt * (3 + movement * 6);
  const step = Math.sin(combatant.walkPhase) * movement;
  const wide = definition.id === "renzi" ? 0.34 : definition.id === "schlein" ? 0.27 : 0.2;
  const guard = combatant.blocking ? 0.3 : 0;

  joints.hips.rotation.set(0, 0, step * 0.05);
  joints.torso.rotation.set(0, -0.1, definition.id === "schlein" ? -0.12 : -0.06);
  joints.head.rotation.set(0, 0.1, 0.04);
  joints.leftShoulder.rotation.set(-0.2, 0, 0.8 + guard);
  joints.rightShoulder.rotation.set(-0.2, 0, 1.05 + guard);
  joints.leftElbow.rotation.set(-0.2, 0, 1.5 + guard);
  joints.rightElbow.rotation.set(-0.2, 0, 1.2 + guard);
  joints.leftHip.rotation.set(step * 0.2, 0, -wide + step * 0.24);
  joints.rightHip.rotation.set(-step * 0.2, 0, wide - step * 0.24);
  joints.leftKnee.rotation.set(Math.max(0, -step) * 0.4, 0, 0.16);
  joints.rightKnee.rotation.set(Math.max(0, step) * 0.4, 0, -0.16);
  combatant.model.position.y = Math.sin(combatant.walkPhase) * 0.018;

  if (!attack) return;
  const strike = clamp(
    attack.age <= attack.windup
      ? attack.age / attack.windup
      : 1 - (attack.age - attack.windup) / Math.max(0.01, attack.duration - attack.windup),
    0, 1
  );
  joints.torso.rotation.z -= strike * 0.12;
  if (attack.limb === "leftPunch" || attack.limb === "rightPunch") {
    const shoulder = attack.limb === "leftPunch" ? joints.leftShoulder : joints.rightShoulder;
    const elbow = attack.limb === "leftPunch" ? joints.leftElbow : joints.rightElbow;
    shoulder.rotation.z = THREE.MathUtils.lerp(shoulder.rotation.z, 1.45, strike);
    shoulder.rotation.x = THREE.MathUtils.lerp(shoulder.rotation.x, -0.05, strike);
    elbow.rotation.z = THREE.MathUtils.lerp(elbow.rotation.z, 0.08, strike);
  } else if (attack.limb === "leftKick" || attack.limb === "rightKick") {
    const hip = attack.limb === "leftKick" ? joints.leftHip : joints.rightHip;
    const knee = attack.limb === "leftKick" ? joints.leftKnee : joints.rightKnee;
    hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, 1.35, strike);
    knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0.12, strike);
    joints.torso.rotation.z -= strike * 0.12;
  }
}

function updateCombatant(combatant, dt, opponentBody) {
  if (!combatant) return;
  combatant.cooldown = Math.max(0, combatant.cooldown - dt);
  combatant.comboWindow = Math.max(0, combatant.comboWindow - dt);
  combatant.stun = Math.max(0, combatant.stun - dt);
  combatant.dodgeTimer = Math.max(0, combatant.dodgeTimer - dt);
  combatant.blockTimer = Math.max(0, combatant.blockTimer - dt);
  if (!combatant.isPlayer && combatant.blockTimer <= 0) combatant.blocking = false;
  if (combatant.isPlayer) combatant.blocking = keys.has("shift") || combatant.blockTimer > 0;
  combatant.spinTimer = Math.max(0, combatant.spinTimer - dt);

  if (combatant.attack) {
    combatant.attack.age += dt;
    tryHit(combatant, opponentBody);
    if (combatant.attack.age > combatant.attack.duration) combatant.attack = null;
  }

  combatant.vy -= 13.5 * dt;
  combatant.y += combatant.vy * dt;
  if (combatant.y < 0) {
    combatant.y = 0;
    combatant.vy = 0;
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
  combatant.root.rotation.y = combatant.spinTimer > 0 && combatant.attack
    ? combatant.attack.age / combatant.attack.duration * Math.PI * 2 : 0;
  poseFighter(combatant, dt);
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
      Math.abs(ballot.mesh.position.y - target.y - 1.1) < 1.25 &&
      target.dodgeTimer <= 0) {
    ballot.hit = true;
    ballot.life = 0;
    target.health = Math.max(0, target.health - (ballot.damage || 14));
    target.stun = 0.22;
    target.vx = source.facing * 2.1;
    if (ballot.launch) target.vy = 4.6;
    spawnCallout(ballot.unblockable ? "VETO!" : comicWords[Math.floor(Math.random() * comicWords.length)], target.x, target.y + 2.5, target.z);
    spawnImpact(ballot.mesh.position, {
      launch: ballot.launch,
      special: ballot.special,
      direction: Math.sign(ballot.vx)
    });
    hitStop = Math.max(hitStop, 0.06);
    shake = 0.2;
    if (ballot.launch) cameraTilt = Math.sign(ballot.vx) * 0.045;
    updateHealthDisplay();
    if (target.health <= 0) finishMatch(source);
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
    const winner = player.health >= opponent.health ? player : opponent;
    finishMatch(winner);
  }
}

function update(dt) {
  if (dt <= 0) return;
  if (matchActive) {
    movePlayer(dt);
    updateAI(dt);
    updateCombatant(player, dt, opponent);
    if (hitStop <= 0) updateCombatant(opponent, dt, player);
    checkTimer(dt);
  }
  updateBallots(dt);
  updateParticles(dt);
  toastTimer -= dt;
  if (toastTimer <= 0) toast.classList.remove("show");
}

function updateCamera(dt) {
  const focus = new THREE.Vector3(0, 1.5, -0.5);
  let distance = 17.4;
  if (player && opponent) {
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
  const desired = new THREE.Vector3(focus.x, focus.y + distance * 0.3, focus.z + distance);
  const smoothing = 1 - Math.exp(-3.5 * dt);
  cameraRig.lerp(desired, smoothing);
  cameraTarget.lerp(focus, smoothing);
  camera.position.copy(cameraRig);
  if (shake > 0) {
    camera.position.x += random(-shake, shake);
    camera.position.y += random(-shake * 0.4, shake * 0.4);
  }
  camera.lookAt(cameraTarget);
  camera.rotateZ(cameraTilt);
  shake = Math.max(0, shake - dt * 1.8);
  cameraTilt *= Math.exp(-6 * dt);
}

function animate() {
  requestAnimationFrame(animate);
  const elapsedFrame = clock.getDelta();
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

window.addEventListener("keydown", (event) => {
  const key = event.key.startsWith("Arrow") ? event.key : event.key.toLowerCase();
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();

  if (!matchActive) {
    if (!selectScreen.classList.contains("hidden")) {
      if (key.startsWith("Arrow")) navigateRoster(key);
      if (key === "enter" && selectedId) {
        event.preventDefault();
        beginMatch();
      }
    }
    if (matchOver && (key === "enter" || key === " ")) {
      event.preventDefault();
      resetToSelect();
    }
    return;
  }

  if (["a", "d", "w", "s", "shift", "arrowleft", "arrowright"].includes(key)) keys.add(key);
  if (key === "w" || key === "s" || key === "ArrowUp" || key === "ArrowDown") {
    const previousKey = key === "ArrowUp" ? "w" : key === "ArrowDown" ? "s" : key;
    const currentTime = performance.now();
    const last = lastTap[previousKey] || 0;
    if (currentTime - last < 280) {
      if (player) {
        player.vz = (previousKey === "w" ? -1 : 1) * 5.2;
        player.dodgeTimer = 0.36;
      }
      lastTap[previousKey] = 0;
    } else lastTap[previousKey] = currentTime;
  }
  if (["u", "i", "j", "k"].includes(key)) playerAttack(key);
  if (key === "l") useSpecial(player);
});

window.addEventListener("keyup", (event) => {
  const key = event.key.startsWith("Arrow") ? event.key : event.key.toLowerCase();
  keys.delete(key);
});
window.addEventListener("blur", () => keys.clear());

startButton.addEventListener("click", beginMatch);
document.querySelector("#rematch-button").addEventListener("click", resetToSelect);

createArena();
buildRoster();
animate();
