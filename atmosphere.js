import * as THREE from "./vendor/three/three.module.min.js";

const clamp = THREE.MathUtils.clamp;

export const STAGE_LIGHTING_PRESETS = {
  morning: {
    id: "morning",
    label: "MORNING SESSION",
    background: "#362d47",
    fogColor: "#362d47",
    fogDensity: 0.013,
    exposure: 1.16,
    hemiSky: "#d8e9ff",
    hemiGround: "#422a36",
    hemiIntensity: 0.88,
    keyColor: "#fff8eb",
    keyIntensity: 215,
    keyPosition: [-1.2, 12.6, 2.2],
    keyAngle: Math.PI / 3.4,
    keyPenumbra: 0.36,
    bounceColor: "#ebb975",
    bounceIntensity: 19,
    rimColor: "#85b6ff",
    rimIntensity: 1.5,
    rimAccentColor: "#d972ff",
    rimAccentIntensity: 0.8,
    dustColor: "#fff4d2",
    dustOpacity: 0.48,
    velarioEmissive: "#ffdfa0",
    velarioEmissiveIntensity: 0.78,
    velarioLightColor: "#ffe9bc",
    velarioLightIntensity: 40,
    shaftColor: "#fff1ca",
    shaftOpacity: 0.048,
    sheenOpacity: 0.16
  },
  afternoon: {
    id: "afternoon",
    label: "LATE AFTERNOON DEBATE",
    background: "#2d1927",
    fogColor: "#2d1927",
    fogDensity: 0.017,
    exposure: 1.14,
    hemiSky: "#eba66c",
    hemiGround: "#26121d",
    hemiIntensity: 0.64,
    keyColor: "#ffb046",
    keyIntensity: 245,
    // Lower, strongly angled key spotlight for longer golden-hour floor shadows
    keyPosition: [-5.6, 8.4, 3.8],
    keyAngle: Math.PI / 3.5,
    keyPenumbra: 0.30,
    bounceColor: "#ff8629",
    bounceIntensity: 27,
    rimColor: "#6d82ff",
    rimIntensity: 1.65,
    rimAccentColor: "#ff5ca8",
    rimAccentIntensity: 1.15,
    dustColor: "#ffc86b",
    dustOpacity: 0.60,
    velarioEmissive: "#ff9b2a",
    velarioEmissiveIntensity: 0.86,
    velarioLightColor: "#ffb24d",
    velarioLightIntensity: 42,
    shaftColor: "#ffb857",
    shaftOpacity: 0.056,
    sheenOpacity: 0.19
  },
  midnight: {
    id: "midnight",
    label: "MIDNIGHT CONFIDENCE VOTE",
    background: "#12060e",
    fogColor: "#14060f",
    fogDensity: 0.023,
    exposure: 1.26,
    hemiSky: "#4d1226",
    hemiGround: "#0c050c",
    hemiIntensity: 0.42,
    // Moody crimson chamber with a tight, high-contrast white overhead ring spotlight
    keyColor: "#ffffff",
    keyIntensity: 295,
    keyPosition: [0.0, 12.6, 0.8],
    keyAngle: Math.PI / 5.2,
    keyPenumbra: 0.22,
    bounceColor: "#b81d3d",
    bounceIntensity: 24,
    rimColor: "#5298ff",
    rimIntensity: 2.2,
    rimAccentColor: "#ff3898",
    rimAccentIntensity: 1.65,
    dustColor: "#ffecf2",
    dustOpacity: 0.70,
    velarioEmissive: "#69142c",
    velarioEmissiveIntensity: 0.26,
    velarioLightColor: "#8c1934",
    velarioLightIntensity: 12,
    shaftColor: "#f4f7ff",
    shaftOpacity: 0.075,
    sheenOpacity: 0.22
  }
};

/**
 * Return the tournament stage lighting preset for Arcade Ladder stages 1..8:
 * - Stages 1-3: Morning Session
 * - Stages 4-6: Late Afternoon Debate
 * - Stages 7-8: Midnight Confidence Vote / Final Boss
 */
export function getStageLightingPreset(stage = 1) {
  const s = clamp(Math.round(stage), 1, 8);
  if (s <= 3) return STAGE_LIGHTING_PRESETS.morning;
  if (s <= 6) return STAGE_LIGHTING_PRESETS.afternoon;
  return STAGE_LIGHTING_PRESETS.midnight;
}

function createDustTexture() {
  const size = 32;
  const data = new Uint8ClampedArray(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const alpha = r >= 1 ? 0 : Math.pow(1 - r, 2.1);
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }

  let canvas;
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const img = ctx.createImageData(size, size);
      img.data.set(data);
      ctx.putImageData(img, 0, 0);
    }
  } else {
    canvas = { width: size, height: size, data };
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createDustMotes(count = 180) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    // Concentrate motes inside the Velario skylight shafts above the fighting pit
    const radius = Math.sqrt(Math.random()) * 6.2;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.6 + Math.random() * 6.0;
    positions[i * 3 + 2] = Math.sin(angle) * 3.8 - 0.5;

    seeds[i * 3] = Math.random() * Math.PI * 2;
    seeds[i * 3 + 1] = 0.10 + Math.random() * 0.22;
    seeds[i * 3 + 2] = 0.4 + Math.random() * 0.85;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dustTexture = createDustTexture();
  const mat = new THREE.PointsMaterial({
    color: "#fff4d2",
    map: dustTexture,
    size: 0.11,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.48,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const points = new THREE.Points(geo, mat);
  points.name = "skylight-dust-motes";
  points.userData.seeds = seeds;
  points.userData.time = 0;
  points.userData.dustTexture = dustTexture;
  return points;
}

/**
 * Build the 3-point Tekken 3 arcade lighting rig + depth fog + floating skylight dust motes.
 */
export function createAtmosphereRig(scene, renderer = null, initialArena = null) {
  let boundArena = initialArena;
  const hemiLight = new THREE.HemisphereLight("#d8e9ff", "#422a36", 0.88);
  scene.add(hemiLight);

  // High-contrast key spotlight shining down through the glass Velario dome
  const keyLight = new THREE.SpotLight("#fff8eb", 215, 36, Math.PI / 3.4, 0.36, 2);
  keyLight.position.set(-1.2, 12.6, 2.2);
  keyLight.target.position.set(0, 0.1, -0.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 2;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.focus = 1;
  keyLight.shadow.radius = 2;
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight, keyLight.target);

  // Warm golden/amber bounce fill lights from the wooden hemicycle
  const leftBounce = new THREE.PointLight("#ebb975", 19, 18, 1.6);
  leftBounce.position.set(-7.6, 2.4, -2.2);
  const rightBounce = new THREE.PointLight("#ebb975", 19, 18, 1.6);
  rightBounce.position.set(7.6, 2.4, -2.2);
  scene.add(leftBounce, rightBounce);

  // Cool blue & magenta rim lights behind the fighters to pop silhouettes, hair & suits
  const rimLight = new THREE.DirectionalLight("#85b6ff", 1.5);
  rimLight.position.set(-3.0, 4.4, -6.6);
  const rimAccent = new THREE.DirectionalLight("#d972ff", 0.8);
  rimAccent.position.set(3.2, 3.6, -6.4);
  scene.add(rimLight, rimAccent);

  const dustMotes = createDustMotes(180);
  scene.add(dustMotes);

  let currentPreset = STAGE_LIGHTING_PRESETS.morning;

  function applyStage(stage = 1, arenaOverride = null) {
    const preset = getStageLightingPreset(stage);
    currentPreset = preset;

    scene.background = new THREE.Color(preset.background);
    scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);
    if (renderer) renderer.toneMappingExposure = preset.exposure;

    hemiLight.color.set(preset.hemiSky);
    hemiLight.groundColor.set(preset.hemiGround);
    hemiLight.intensity = preset.hemiIntensity;

    keyLight.color.set(preset.keyColor);
    keyLight.intensity = preset.keyIntensity;
    keyLight.position.set(...preset.keyPosition);
    keyLight.angle = preset.keyAngle;
    keyLight.penumbra = preset.keyPenumbra;
    keyLight.shadow.camera.updateProjectionMatrix();

    leftBounce.color.set(preset.bounceColor);
    leftBounce.intensity = preset.bounceIntensity;
    rightBounce.color.set(preset.bounceColor);
    rightBounce.intensity = preset.bounceIntensity;

    rimLight.color.set(preset.rimColor);
    rimLight.intensity = preset.rimIntensity;
    rimAccent.color.set(preset.rimAccentColor);
    rimAccent.intensity = preset.rimAccentIntensity;

    dustMotes.material.color.set(preset.dustColor);
    dustMotes.material.opacity = preset.dustOpacity;

    const targetArena = arenaOverride || boundArena;
    if (targetArena && typeof targetArena.setLightingMood === "function") {
      targetArena.setLightingMood(preset);
    }

    return preset;
  }

  function bindArena(arena) {
    boundArena = arena;
    if (boundArena && typeof boundArena.setLightingMood === "function") {
      boundArena.setLightingMood(currentPreset);
    }
  }

  function update(dt) {
    dustMotes.userData.time += dt;
    const t = dustMotes.userData.time;
    const pos = dustMotes.geometry.attributes.position;
    const seeds = dustMotes.userData.seeds;

    for (let i = 0; i < pos.count; i += 1) {
      const phase = seeds[i * 3];
      const riseSpeed = seeds[i * 3 + 1];
      const swayAmp = seeds[i * 3 + 2];

      let x = pos.getX(i) + Math.sin(t * 0.65 + phase) * 0.08 * swayAmp * dt;
      let y = pos.getY(i) + riseSpeed * dt;
      const z = pos.getZ(i) + Math.cos(t * 0.55 + phase) * 0.06 * swayAmp * dt;

      if (y > 6.7) {
        y = 0.55;
        x = clamp(x, -6.0, 6.0);
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  function dispose() {
    if (dustMotes.userData.dustTexture) dustMotes.userData.dustTexture.dispose();
    dustMotes.geometry.dispose();
    dustMotes.material.dispose();
  }

  applyStage(1);

  return {
    rig: {
      hemiLight,
      keyLight,
      leftBounce,
      rightBounce,
      rimLight,
      rimAccent,
      dustMotes
    },
    getPreset: () => currentPreset,
    bindArena,
    applyStage,
    update,
    dispose
  };
}

/**
 * Dynamic Tekken 3 combat camera:
 * - Tracks midpoint between P1 and CPU
 * - Zooms closer during active close-range combo exchanges and pulls back when separated
 * - Fires dramatic camera roll/tilt & quick zoom-in punch on Launchers, Counter-Hits, and K.O.s
 */
export function createDynamicCamera(camera) {
  const rigPos = new THREE.Vector3(0, 7.4, 17.4);
  const targetPos = new THREE.Vector3(0, 1.5, -0.5);
  let shake = 0;
  let tilt = 0;
  let zoomPunch = 0;
  let exchangeHold = 0;

  function triggerImpact({
    launch = false,
    counter = false,
    knockdown = false,
    heavy = false,
    special = false,
    blocked = false,
    damage = 8,
    direction = 1
  } = {}) {
    exchangeHold = Math.max(exchangeHold, 0.72);
    const dmgShake = clamp((damage / 28) * 0.42, 0.06, 0.46) * (blocked ? 0.45 : 1);
    if (!blocked && (knockdown || counter || launch || special)) {
      shake = Math.max(shake, dmgShake, knockdown ? 0.40 : counter ? 0.34 : 0.28);
    } else {
      shake = Math.max(shake, dmgShake, !blocked && heavy ? 0.24 : 0.10);
    }
    if (!blocked && (launch || counter || knockdown || heavy || special)) {
      const tiltMag = counter ? 0.064 : launch ? 0.054 : special ? 0.048 : 0.032;
      tilt = direction * tiltMag;
    }
    if (!blocked && (launch || counter || special)) {
      zoomPunch = Math.max(zoomPunch, counter ? 1.9 : special ? 1.75 : 1.5);
    } else if (!blocked && knockdown) {
      zoomPunch = Math.max(zoomPunch, 1.15);
    }
  }

  function triggerKO(direction = 1) {
    shake = Math.max(shake, 0.52);
    tilt = direction * 0.085;
    zoomPunch = 2.65;
    exchangeHold = 1.4;
  }

  function update(dt, { player, opponent, victory, koSlowMo = 0 } = {}) {
    const focus = new THREE.Vector3(0, 1.5, -0.5);
    let distance = 17.4;
    let desired = null;
    let closeCombo = false;

    if (victory) {
      const winner = victory.winner;
      const loser = victory.loser;
      const fallingSlowMo = koSlowMo > 0 || (victory.reason === "knockout" && !victory.koSlammed);
      if (fallingSlowMo) {
        // Dramatic K.O. slow-motion zoom toward the falling loser
        focus.set(
          THREE.MathUtils.lerp(winner.x, loser.x, 0.72),
          1.05 + loser.y * 0.55,
          THREE.MathUtils.lerp(winner.z, loser.z, 0.72)
        );
        distance = clamp(6.0 - zoomPunch * 0.45, 4.4, 7.2);
        desired = new THREE.Vector3(focus.x + winner.facing * 0.65, focus.y + 0.95, focus.z + distance);
      } else {
        // Dramatic low-angle close-up orbit of the winner performing their victory pose
        const orbitTime = victory.groundAt !== null && victory.groundAt !== undefined
          ? Math.max(0, victory.time - victory.groundAt)
          : victory.time;
        const maxOffset = Math.min(0.6, camera.aspect * 0.4);
        const offset = clamp((loser.x - winner.x) * 0.25, -maxOffset, maxOffset);
        const wHeight = winner.definition?.height || 1;
        focus.set(winner.x + offset, winner.y + 1.48 * wHeight, winner.z);
        distance = Math.max(3.9, 1.15 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
        const orbitAngle = winner.facing * 0.36 - winner.facing * Math.min(orbitTime * 0.72, 0.95);
        desired = new THREE.Vector3(
          winner.x + Math.sin(orbitAngle) * distance,
          winner.y + 0.72,
          winner.z + Math.cos(orbitAngle) * distance
        );
      }
    } else if (player && opponent) {
      focus.set(
        (player.x + opponent.x) / 2,
        1.42 + Math.max(player.y, opponent.y) * 0.35,
        (player.z + opponent.z) / 2
      );
      const span = Math.abs(player.x - opponent.x) + Math.abs(player.z - opponent.z) * 0.3;
      const horizontalFit = (span / 2 + 1.35) /
        (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);

      // Zoom in closer during exchange combos; pull back cleanly when fighters separate
      const exchangeActive =
        (exchangeHold > 0 || player.comboWindow > 0 || opponent.stun > 0 || player.stun > 0 || Boolean(player.attack || opponent.attack)) &&
        span < 3.0;
      closeCombo = exchangeActive;
      const comboZoom = exchangeActive ? 1.65 : 0;

      distance = clamp(Math.max(8.6 + span * 0.68, horizontalFit + 2.4) - comboZoom - zoomPunch, 6.0, 48);
    }

    if (!desired) {
      const heightRatio = closeCombo ? 0.24 : 0.28;
      desired = new THREE.Vector3(focus.x, focus.y + distance * heightRatio, focus.z + distance);
    }

    const smoothing = 1 - Math.exp(-(zoomPunch > 0.2 ? 6.4 : 3.9) * dt);
    rigPos.lerp(desired, smoothing);
    targetPos.lerp(focus, smoothing);
    camera.position.copy(rigPos);

    if (shake > 0) {
      const jitterX = (Math.random() * 2 - 1) * shake;
      const jitterY = (Math.random() * 2 - 1) * shake * 0.4;
      camera.position.x += jitterX;
      camera.position.y += jitterY;
    }

    camera.lookAt(targetPos);
    camera.rotateZ(tilt);

    shake = Math.max(0, shake - dt * 1.85);
    tilt *= Math.exp(-5.8 * dt);
    zoomPunch *= Math.exp(-4.5 * dt);
    exchangeHold = Math.max(0, exchangeHold - dt);
  }

  return {
    rigPos,
    targetPos,
    getState: () => ({ shake, tilt, zoomPunch, exchangeHold }),
    triggerImpact,
    triggerKO,
    update
  };
}
