import * as THREE from "./vendor/three/three.module.min.js";
import { fighters } from "./fighters.js";
import { sound } from "./sound.js";
import { TournamentManager, difficultyForStage, formatTournamentTime } from "./tournament.js";
import { createComboInput, bufferInput, advanceInputClock, resolveComboInput, endComboAttack, clearComboInput } from "./combo.js";
import { attackHeight, defenseOutcome, isCounterHit } from "./defense.js";
import { InputState, keyboardActions, gamepadActions } from "./input.js";
import { buildFighterModel, updateGroundedRig, applyKickAnimation, isKickHitboxActive, setSpecialReadyGlow, createFaceTexture } from "./fighter-model.js";
import { createArena } from "./arena.js";
import { createAtmosphereRig, createDynamicCamera } from "./atmosphere.js";
import {
  SUPER_METER_START,
  SUPER_METER_COST,
  SPECIAL_FRAME_DATA,
  METER_GAIN,
  addSuperMeter,
  applyCombatMeter,
  canUseSpecial,
  canAICastSpecial,
  spendSuperMeter,
  interruptSpecialStartup,
  computeSpecialDamage
} from "./super-meter.js";

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
const playerSuperTrack = document.querySelector("#player-super-track");
const playerSuperFill = document.querySelector("#player-super-fill");
const playerSuperPercent = document.querySelector("#player-super-percent");
const playerSuperBadge = document.querySelector("#player-super-badge");
const opponentSuperTrack = document.querySelector("#opponent-super-track");
const opponentSuperFill = document.querySelector("#opponent-super-fill");
const opponentSuperPercent = document.querySelector("#opponent-super-percent");
const opponentSuperBadge = document.querySelector("#opponent-super-badge");
const touchSpecialButton = document.querySelector(".touch-special");
const timerNode = document.querySelector("#timer");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#2b1e33");
scene.fog = new THREE.FogExp2("#2b1e33", 0.018);

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

const atmosphere = createAtmosphereRig(scene, renderer);
const ambientLight = atmosphere.rig.hemiLight;
const keyLight = atmosphere.rig.keyLight;
const rimLight = atmosphere.rig.rimLight;
const dynamicCamera = createDynamicCamera(camera);
const cameraRig = dynamicCamera.rigPos;
const cameraTarget = dynamicCamera.targetPos;

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
let koSlowMo = 0;
let shake = 0;
let cameraTilt = 0;
let toastTimer = 0;
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

const arena = createArena(scene);
atmosphere.bindArena(arena);

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
    superMeter: SUPER_METER_START,
    facing,
    attack: null,
    cooldown: 0,
    recovery: 0,
    dodgeTimer: 0,
    ghostTimer: 0,
    blockTimer: 0,
    blocking: false,
    guardMode: null,
    parryTimer: 0,
    parryRecovery: 0,
    parryPose: 0,
    risingTimer: 0,
    usedSpecialInRound: false,
    lastAttackWasSpecial: false,
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
  if (typeof atmosphere !== "undefined") {
    atmosphere.applyStage(stage + 1);
    return;
  }
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
  const faceTexture = createFaceTexture(fighter);
  if (faceTexture.image && typeof faceTexture.image.getContext === "function") {
    ctx.drawImage(faceTexture.image, 36, 36, 56, 62, 26, 32, 44, 45);
  }
  faceTexture.dispose();
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
  arena.resetProps();
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
  koSlowMo = 0;
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
  const stagePreset = atmosphere.applyStage(tournament.currentStage + 1);
  document.querySelector(".edition").innerHTML = `STAGE ${tournament.currentStage + 1}/8 <span>•</span> ${stagePreset.label}`;
  toast.textContent = `SIGNATURE: ${player.definition.special.toUpperCase()}  ·  BUILD 100% & PRESS L`;
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
  if (typeof koSlowMo !== "undefined") koSlowMo = 0;
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
  if (typeof arena !== "undefined" && arena.resetProps) arena.resetProps();
  player = null;
  opponent = null;
  document.querySelector("#player-combo").classList.add("hidden");
  document.querySelector("#cpu-combo").classList.add("hidden");
  tournament = null;
  if (typeof atmosphere !== "undefined") {
    atmosphere.applyStage(1);
    document.querySelector(".edition").innerHTML = `LIVE FROM THE CHAMBER <span>•</span> ROUND 1`;
  } else {
    scene.background.set("#33243b");
    scene.fog.color.set("#33243b");
    ambientLight.color.set("#b5a5bf");
    ambientLight.groundColor.set("#1a1424");
    ambientLight.intensity = 0.7;
    keyLight.color.set("#ffe1a0");
    keyLight.intensity = 190;
    rimLight.color.set("#788fce");
  }
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

  if (playerSuperFill && opponentSuperFill) {
    const playerMeter = clamp(player.superMeter ?? 0, 0, 100);
    const opponentMeter = clamp(opponent.superMeter ?? 0, 0, 100);
    const playerReady = canUseSpecial(player);
    const opponentReady = canUseSpecial(opponent);
    playerSuperFill.style.width = `${playerMeter}%`;
    opponentSuperFill.style.width = `${opponentMeter}%`;
    playerSuperPercent.textContent = `${Math.floor(playerMeter)}%`;
    opponentSuperPercent.textContent = `${Math.floor(opponentMeter)}%`;
    playerSuperTrack.classList.toggle("ready", playerReady);
    playerSuperBadge.classList.toggle("ready", playerReady);
    opponentSuperTrack.classList.toggle("ready", opponentReady);
    opponentSuperBadge.classList.toggle("ready", opponentReady);
    if (touchSpecialButton) touchSpecialButton.classList.toggle("ready", playerReady);
  }

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
  const heightScale = target.definition?.height || 1;
  let contactHeight = 1.4;
  if (kick) {
    if (attack.limb === "leftKick") contactHeight = 1.52 * heightScale;
    else if (attack.comboMove === "heel" || attack.comboMove === "roundhouse") contactHeight = 1.38 * heightScale;
    else contactHeight = 1.18 * heightScale;
  }
  return new THREE.Vector3(
    target.x - attacker.facing * 0.28,
    target.y + contactHeight,
    target.z + clamp(attacker.z - target.z, -0.2, 0.2)
  );
}

function attackDefinition(combatant, kind, extra = {}) {
  const fast = combatant.definition.stats.speed;
  const power = combatant.definition.stats.power;
  const ranged = combatant.definition.stats.range;
  const isKick = kind === "kick" || kind === "spin" || kind === "eco-spin" || kind === "axe-kick";
  const isLimbKick = extra.limb === "leftKick" || extra.limb === "rightKick";
  const isHeavy = kind === "heavy";
  const base = {
    kind,
    high: !extra.low,
    damage: (isHeavy ? 11 : isKick ? 8 : 6) + power * 0.7,
    range: (isHeavy ? 1.55 : isKick ? 1.42 : 1.08) + ranged * 0.12,
    windup: isHeavy ? 0.23 : 0.13,
    duration: isHeavy ? 0.48 : isKick ? 0.36 : 0.33,
    launch: false,
    knockdown: false,
    unblockable: false,
    projectile: false,
    color: combatant.definition.color,
    ...extra
  };
  base.height = extra.height || (extra.low ? "low" :
    kind === "punch" && extra.limb === "leftPunch" ? "high" : "mid");
  if (base.special) {
    base.height = "high";
    base.high = true;
    base.unblockable = false;
    base.activeStart = SPECIAL_FRAME_DATA.activeStart;
    base.activeEnd = SPECIAL_FRAME_DATA.activeEnd;
    base.windup = base.duration * SPECIAL_FRAME_DATA.startupEnd;
  } else if (isKick || isLimbKick) {
    base.activeStart = 0.30;
    base.activeEnd = 0.55;
    base.windup = base.duration * base.activeStart;
  } else {
    base.windup = kind === "punch" ? 0.08 : Math.max(0.07, base.windup - fast * 0.012);
  }
  return base;
}

function queueAttack(combatant, kind, extra = {}) {
  if (!matchActive || combatant.health <= 0 || combatant.stun > 0 || (combatant.recovery || 0) > 0 || combatant.airborne || combatant.landingTime > 0) return false;
  if (combatant.cooldown > 0) return false;
  const attack = attackDefinition(combatant, kind, extra);
  attack.damage *= combatant.difficulty?.damage || 1;
  combatant.attack = { ...attack, age: 0, hit: false, rushed: false, recoveryTriggered: false, landedUnblocked: false };
  combatant.lastAttackWasSpecial = Boolean(attack.special);
  combatant.cooldown = attack.duration + 0.04;
  combatant.blocking = false;
  combatant.guardMode = null;
  if (!attack.special) sound.swing(attack.limb === "leftKick" || attack.limb === "rightKick");
  return true;
}

function getSpecial(combatant) {
  const id = combatant.definition.id;
  const common = {
    damage: 25,
    duration: 0.90,
    color: combatant.definition.accent,
    special: true,
    high: true,
    unblockable: false,
    limb: id === "renzi" || id === "bonelli" ? "rightKick" : "rightPunch"
  };
  const details = {
    meloni: { kind: "rush", range: 2.15, launch: true, damage: 25, duration: 0.86 },
    salvini: { kind: "heavy", range: 1.75, knockdown: true, damage: 28, duration: 0.94 },
    tajani: { kind: "counter", range: 1.70, damage: 24, duration: 0.88, guard: true },
    renzi: { kind: "spin", range: 1.95, damage: 26, duration: 0.90, launch: true },
    calenda: { kind: "dossier", range: 7.0, damage: 26, duration: 0.90, projectile: true },
    schlein: { kind: "palette", range: 6.2, damage: 24, duration: 0.88, projectile: true, launch: true },
    conte: { kind: "decree", range: 5.0, damage: 27, duration: 0.90, projectile: true },
    bonelli: { kind: "eco-spin", range: 2.0, damage: 25, duration: 0.90, launch: true }
  };
  return { ...common, ...details[id] };
}

function useSpecial(combatant) {
  if (!combatant || !matchActive || combatant.cooldown > 0 || (combatant.recovery || 0) > 0 || combatant.stun > 0 || combatant.airborne || combatant.landingTime > 0) return false;
  if (!spendSuperMeter(combatant, SUPER_METER_COST)) {
    if (combatant.isPlayer) sound.emptyClick?.();
    return false;
  }
  combatant.usedSpecialInRound = true;
  if (typeof setSpecialReadyGlow === "function") setSpecialReadyGlow(combatant, false, combatant.animationTime || 0);
  updateHealthDisplay();
  const special = getSpecial(combatant);
  queueAttack(combatant, special.kind, special);
  sound.specialWindup?.();
  announceSpecial(combatant);
  spawnBurst(combatant, "#fff0a8", 12);
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
    queueAttack(combatant, "kick", { damage: 13, range: 1.55, knockdown: true, duration: 0.48, limb: "rightKick", comboMove: code === "u-i-k" ? "roundhouse" : "heel" });
  } else if (key === "u" || key === "i") {
    queueAttack(combatant, "punch", { ...(key === "i" ? { damage: heavy ? 10 : 8, range: 1.18, meterGain: 14 } : { meterGain: 8 }), height: key === "u" ? "high" : "mid", limb: key === "i" || cross ? "rightPunch" : "leftPunch" });
  } else {
    queueAttack(combatant, "kick", { damage: snap ? 10 : 8, range: 1.4, low: key === "j", duration: key === "j" ? 0.36 : 0.42, meterGain: key === "j" ? 8 : 14, limb: key === "j" ? "leftKick" : "rightKick" });
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
  if (!attack || attack.hit) return;

  const isWindowed = typeof attack.activeStart === "number" && typeof attack.activeEnd === "number";
  if (isWindowed) {
    if (!isKickHitboxActive(attack)) return;
  } else {
    if (attack.age < attack.windup) return;
    attack.hit = true;
  }

  if (attack.projectile) {
    attack.hit = true;
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
  attack.hit = true;
  resolveCombatImpact(attacker, target, attack, contactPoint(attacker, target, attack));
}

function resolveCombatImpact(attacker, target, attack, point) {
  const interruptedSpecial = interruptSpecialStartup(target);
  const outcome = interruptedSpecial ? "hit" : defenseOutcome(target, attack);
  if (outcome === "sidestep" || outcome === "duck") {
    spawnCallout(outcome === "duck" ? "SCHIVATA BASSA!" : "SCHIVATA!", target.x, target.y + 2.4, target.z);
    if (attack.special) {
      attacker.recovery = SPECIAL_FRAME_DATA.whiffRecoverySeconds;
      attacker.cooldown = Math.max(attacker.cooldown, SPECIAL_FRAME_DATA.whiffRecoverySeconds);
      attacker.blocking = false;
      attacker.guardMode = null;
      attack.recoveryTriggered = true;
    }
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
    addSuperMeter(target, METER_GAIN.block);
    spawnCallout("PARRIED! MOZIONE D'ORDINE!", target.x, target.y + 2.65, target.z);
    spawnImpact(point, { blocked: true, direction: attacker.facing });
    sound.impact({ blocked: true });
    updateHealthDisplay();
    hitStop = Math.max(hitStop, 0.06);
    return;
  }

  const direction = attack.projectile ? Math.sign(attack.vx) : attacker.facing;
  const targetAirborne = target.airborne;
  const counter = interruptedSpecial || (outcome !== "block" && isCounterHit(target));
  const blocked = outcome === "block" && !(attack.special && counter);

  let damage;
  if (attack.special) {
    damage = computeSpecialDamage(attack.damage, {
      blocked,
      counterHit: counter,
      targetAirborne: Boolean(targetAirborne || target.y > 0.25)
    });
  } else {
    damage = attack.damage * (blocked ? 0.15 : counter ? 1.35 : 1);
  }

  recordCombatHit(attacker, target, damage, attack, blocked);
  applyCombatMeter(attacker, target, { attack, blocked, counterHit: counter });

  if (attack.special) {
    if (blocked) {
      attacker.recovery = SPECIAL_FRAME_DATA.whiffRecoverySeconds;
      attacker.cooldown = Math.max(attacker.cooldown, SPECIAL_FRAME_DATA.whiffRecoverySeconds);
      attacker.blocking = false;
      attacker.guardMode = null;
      attack.recoveryTriggered = true;
    } else {
      attack.landedUnblocked = true;
    }
  }

  if (!blocked) {
    target.guardMode = null;
    target.blocking = false;
    target.blockTimer = 0;
    target.parryTimer = 0;
  }
  target.stun = blocked ? 0.12 : counter ? 0.36 : 0.25;
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
  if (typeof dynamicCamera !== "undefined") {
    dynamicCamera.triggerImpact({
      launch: launches,
      counter,
      knockdown: !blocked && attack.knockdown,
      heavy: attack.kind === "heavy" || attack.special,
      direction
    });
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
  if (reason === "knockout") {
    sound.knockout();
    koSlowMo = 0.85;
    if (typeof dynamicCamera !== "undefined") dynamicCamera.triggerKO(winner.facing);
  }
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
  if (ai.airborne || ai.landingTime > 0 || ai.stun > 0 || (ai.recovery || 0) > 0) {
    if ((ai.recovery || 0) > 0) {
      ai.blocking = false;
      ai.guardMode = null;
    }
    return;
  }
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
        if (difficulty.special && canAICastSpecial(ai) && Math.random() < difficulty.special && (missed || ai.aiCombo > 0)) useSpecial(ai);
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

  ai.blocking = ai.blockTimer > 0 && !(ai.attack?.special && ai.attack.age < ai.attack.windup);
  ai.guardMode = ai.blocking ? "standing" : null;
  if (distance > 1.7) ai.vz += clamp(dz, -1, 1) * 0.55;
}

function movePlayer(dt) {
  if (!player) return;
  if (opponent) player.facing = opponent.x >= player.x ? 1 : -1;
  let direction = 0;
  if (inputState.has("left")) direction -= 1;
  if (inputState.has("right")) direction += 1;
  const inRecovery = (player.recovery || 0) > 0;
  const canGuard = !inRecovery && !player.airborne && player.landingTime <= 0 && !player.attack &&
    player.parryTimer <= 0 && (player.stun <= 0 || player.blocking);
  const away = direction === -player.facing;
  const lowGuard = inputState.has("down") && (away || inputState.has("guard"));
  player.guardMode = canGuard && (away || inputState.has("guard") || (direction === 0 && !inputState.has("down"))) ?
    (lowGuard ? "low" : "standing") : null;
  if (!inRecovery && player.blockTimer > 0 && !player.airborne && !player.attack?.special) player.guardMode = "standing";
  player.blocking = Boolean(player.guardMode);
  if (player.stun > 0 || inRecovery || player.airborne || player.landingTime > 0 || player.parryTimer > 0) return;
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
  const baseKnee = 0.14 + (bounce + 1) * 0.06;
  const leftKneeBend = baseKnee + Math.max(0, -step) * 0.42;
  const rightKneeBend = baseKnee + Math.max(0, step) * 0.42;

  joints.hips.rotation.set(0, 0, step * 0.05 + bounce * 0.035);
  joints.torso.rotation.set(0, -0.1, (definition.id === "schlein" ? -0.12 : -0.06) + bounce * 0.025);
  const breath = Math.sin(combatant.animationTime * 2.4);
  joints.torso.scale.set(1 + breath * 0.012, 1 + breath * 0.006, 1 + breath * 0.018);
  joints.head.rotation.set(0, 0.1, 0.04 - bounce * 0.02);
  joints.leftShoulder.rotation.set(-0.2, 0, 0.8 + guard + bounce * 0.06);
  joints.rightShoulder.rotation.set(-0.2, 0, 1.05 + guard - bounce * 0.06);
  joints.leftElbow.rotation.set(-0.2, 0, 1.5 + guard + bounce * 0.08);
  joints.rightElbow.rotation.set(-0.2, 0, 1.2 + guard - bounce * 0.08);
  joints.leftHip.rotation.set(-leftKneeBend * 0.48 + step * 0.2, 0, -wide + step * 0.24 + bounce * 0.04);
  joints.rightHip.rotation.set(-rightKneeBend * 0.48 - step * 0.2, 0, wide - step * 0.24 - bounce * 0.04);
  joints.leftKnee.rotation.set(leftKneeBend, 0, 0.16);
  joints.rightKnee.rotation.set(rightKneeBend, 0, -0.16);
  if (joints.leftAnkle) joints.leftAnkle.rotation.set(0, 0, 0);
  if (joints.rightAnkle) joints.rightAnkle.rotation.set(0, 0, 0);
  combatant.model.position.set(0, 0, 0);
  combatant.prop.rotation.z = -2.2;

  let support = "both";
  let lift = 0;
  let handledKick = false;

  if (combatant.guardMode === "low") {
    joints.leftHip.rotation.x -= 0.38;
    joints.rightHip.rotation.x -= 0.38;
    joints.leftKnee.rotation.x += 0.75;
    joints.rightKnee.rotation.x += 0.75;
    joints.torso.rotation.z -= 0.2;
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
    joints.leftHip.rotation.x -= 0.16 * dip;
    joints.rightHip.rotation.x -= 0.16 * dip;
    joints.leftKnee.rotation.x += 0.32 * dip;
    joints.rightKnee.rotation.x += 0.32 * dip;
    combatant.root.rotation.y = side * 0.18 * dip;
  }
  if (attack && !combatant.airborne && combatant.landingTime <= 0) {
    const progress = clamp(attack.age / Math.max(attack.duration, 0.001), 0, 1);
    const impact = clamp(attack.windup / Math.max(attack.duration, 0.001), 0.01, 0.95);
    const holdEnd = Math.min(impact + 0.065 / Math.max(attack.duration, 0.001), 0.98);
    const strike = sampleKeyframes(progress, [
      [0, 0], [impact * 0.6, 0], [impact, 1], [holdEnd, 1], [1, 0]
    ]);
    const crouch = sampleKeyframes(progress, [
      [0, 0], [impact * 0.6, 1], [impact, 0], [1, 0]
    ]);
    const isKickLimb = attack.limb === "leftKick" || attack.limb === "rightKick";
    if (!isKickLimb) {
      joints.torso.rotation.y -= crouch * 0.32;
      joints.hips.rotation.y += crouch * 0.22;
      joints.leftKnee.rotation.x += crouch * 0.25 + strike * 0.08;
      joints.rightKnee.rotation.x += crouch * 0.12 + strike * 0.3;
      combatant.model.position.x += strike * 0.13 - crouch * 0.1;
    }
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

    const uppercut = attack.kind === "launcher" || (attack.special && definition.id === "meloni");
    if (attack.limb === "leftPunch") punch("left");
    else if (attack.limb === "rightPunch" && !uppercut) punch("right");
    else if (attack.limb === "leftKick") {
      applyKickAnimation(joints, { style: "roundhouse", side: "left", progress });
      handledKick = true;
    } else if (attack.limb === "rightKick") {
      const style = (attack.comboMove === "heel" || attack.comboMove === "roundhouse")
        ? "axe"
        : (attack.kind === "spin" || attack.kind === "eco-spin")
          ? "roundhouse"
          : "side";
      applyKickAnimation(joints, { style, side: "right", progress });
      handledKick = true;
    }

    if (uppercut) {
      const rise = sampleKeyframes(progress, [
        [0, 0], [impact * 0.6, 0], [impact, 1],
        [holdEnd, 1], [1, 0]
      ]);
      punch("right", 2.55, rise);
      joints.leftHip.rotation.x -= crouch * 0.42;
      joints.rightHip.rotation.x -= crouch * 0.42;
      joints.leftKnee.rotation.x += crouch * 0.80;
      joints.rightKnee.rotation.x += crouch * 0.80;
      joints.hips.rotation.z -= crouch * 0.18;
      lift = rise * 0.10;
    }

    if (attack.comboMove === "straight") {
      joints.torso.rotation.z -= strike * 0.2;
      combatant.model.position.x += strike * 0.18;
    }

    if (attack.special) {
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
          lift = Math.sin(progress * Math.PI) * 0.20;
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
          lift = Math.max(0, strike * 0.10 - crouch * 0.04);
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

  if (!handledKick) {
    updateGroundedRig(joints, { support, lift });
  }

  const recoil = clamp(combatant.reactionTime / 0.3, 0, 1);
  joints.torso.rotation.z += recoil * 0.55;
  if ((combatant.recovery || 0) > 0) {
    joints.torso.rotation.z -= clamp(combatant.recovery / SPECIAL_FRAME_DATA.whiffRecoverySeconds, 0, 1) * 0.22;
  }
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
  combatant.recovery = Math.max(0, (combatant.recovery || 0) - dt);
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
    const progress = combatant.attack.age / Math.max(combatant.attack.duration, 0.001);
    if (combatant.attack.special && combatant.attack.kind === "rush" && !combatant.attack.rushed && progress >= SPECIAL_FRAME_DATA.activeStart) {
      combatant.attack.rushed = true;
      combatant.x += combatant.facing * 0.48;
      combatant.root.position.x = combatant.x;
    }
    tryHit(combatant, opponentBody);
    if (combatant.attack && combatant.attack.special && !combatant.attack.recoveryTriggered && !combatant.attack.landedUnblocked && progress >= SPECIAL_FRAME_DATA.activeEnd) {
      combatant.attack.recoveryTriggered = true;
      combatant.recovery = SPECIAL_FRAME_DATA.whiffRecoverySeconds;
      combatant.cooldown = Math.max(combatant.cooldown, SPECIAL_FRAME_DATA.whiffRecoverySeconds);
      combatant.blocking = false;
      combatant.guardMode = null;
    }
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
    const pStartupFlash = Boolean(player?.attack?.special && player.attack.age < player.attack.windup);
    const oStartupFlash = Boolean(opponent?.attack?.special && opponent.attack.age < opponent.attack.windup);
    setSpecialReadyGlow(player, canUseSpecial(player) || pStartupFlash, player?.animationTime || 0);
    setSpecialReadyGlow(opponent, canUseSpecial(opponent) || oStartupFlash, opponent?.animationTime || 0);
    checkTimer(dt);
  } else if (victory) {
    updateVictory(dt);
  }
  arena.update(dt, [player, opponent], (bx, by, bz, dir) => {
    spawnBallot(bx, by, bz, dir, "#f6efdc", 1.15);
  });
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
  dynamicCamera.update(dt, { player, opponent, victory, koSlowMo });
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
  const simFrame = elapsedFrame - frozen;
  let simDt = Math.min(simFrame, 0.04);
  if (typeof koSlowMo !== "undefined" && koSlowMo > 0) {
    koSlowMo = Math.max(0, koSlowMo - elapsedFrame);
    simDt *= 0.28;
  }
  update(simDt);
  const visualDt = Math.min(elapsedFrame, 0.1);
  if (typeof atmosphere !== "undefined") atmosphere.update(visualDt);
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
  if (!player || player.stun > 0 || (player.recovery || 0) > 0 || player.airborne || player.landingTime > 0 || player.attack) return;
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

buildRoster();
updateTouchVisibility();
animate();
