import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../vendor/three/three.module.min.js";
import { createArena } from "../arena.js";
import {
  createAtmosphereRig,
  createDynamicCamera,
  getStageLightingPreset
} from "../atmosphere.js";

test("three-point arcade lighting rig, dust motes, and 8-stage tournament progression", () => {
  const scene = new THREE.Scene();
  const mockRenderer = { toneMappingExposure: 1.0 };
  const arena = createArena(scene);
  const atmosphere = createAtmosphereRig(scene, mockRenderer, arena);
  const { rig } = atmosphere;

  assert.equal(rig.keyLight.isSpotLight, true);
  assert.equal(rig.keyLight.castShadow, true);
  assert.equal(rig.keyLight.shadow.mapSize.x, 2048);
  assert.equal(rig.leftBounce.isPointLight, true);
  assert.equal(rig.rightBounce.isPointLight, true);
  assert.equal(rig.rimLight.isDirectionalLight, true);
  assert.equal(rig.rimAccent.isDirectionalLight, true);
  assert.equal(rig.dustMotes.isPoints, true);
  assert.ok(rig.dustMotes.material.map, "dust motes should use a soft radial glow texture");
  assert.equal(scene.fog.isFogExp2, true);

  // Verify floating dust motes drift slowly over time
  const posAttr = rig.dustMotes.geometry.attributes.position;
  const initialY = posAttr.getY(0);
  atmosphere.update(0.5);
  assert.ok(posAttr.getY(0) !== initialY, "dust motes should drift on update()");

  // Stages 1-3: Morning Session
  for (const s of [1, 2, 3]) {
    const p = atmosphere.applyStage(s);
    assert.equal(p.id, "morning");
    assert.equal(getStageLightingPreset(s).label, "MORNING SESSION");
  }
  const morningKeyY = rig.keyLight.position.y;
  const morningKeyAngle = rig.keyLight.angle;

  // Stages 4-6: Late Afternoon Debate (golden-hour amber + lower/angled key light for longer shadows)
  for (const s of [4, 5, 6]) {
    const p = atmosphere.applyStage(s);
    assert.equal(p.id, "afternoon");
    assert.equal(getStageLightingPreset(s).label, "LATE AFTERNOON DEBATE");
  }
  assert.ok(rig.keyLight.position.y < morningKeyY, "afternoon spotlight should sit lower/more angled for longer shadows");

  // Stages 7-8: Midnight Confidence Vote / Final Boss (moody crimson + tighter white overhead ring spotlight)
  for (const s of [7, 8]) {
    const p = atmosphere.applyStage(s);
    assert.equal(p.id, "midnight");
    assert.equal(getStageLightingPreset(s).label, "MIDNIGHT CONFIDENCE VOTE");
  }
  assert.equal(rig.keyLight.color.getHexString(), "ffffff");
  assert.ok(rig.keyLight.angle < morningKeyAngle, "midnight stage should tighten overhead ring spotlight cone");
  assert.ok(mockRenderer.toneMappingExposure > 1.2, "midnight stage should heighten exposure contrast");

  atmosphere.dispose();
  arena.dispose();
});

test("dynamic Tekken camera tracks midpoint, zooms on combos, and triggers tilt/zoom on launchers, counters, and KOs", () => {
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
  const dyn = createDynamicCamera(cam);

  const p1Far = { x: -4.0, y: 0, z: 0, facing: 1, comboWindow: 0, stun: 0, attack: null, definition: { height: 1 } };
  const p2Far = { x: 4.0, y: 0, z: 0, facing: -1, comboWindow: 0, stun: 0, attack: null, definition: { height: 1 } };
  for (let i = 0; i < 60; i += 1) {
    dyn.update(0.03, { player: p1Far, opponent: p2Far });
  }
  const farZ = cam.position.z;

  const p1Combo = { x: -0.6, y: 0, z: 0, facing: 1, comboWindow: 0.5, stun: 0, attack: { age: 0.1 }, definition: { height: 1 } };
  const p2Combo = { x: 0.6, y: 0, z: 0, facing: -1, comboWindow: 0, stun: 0.25, attack: null, definition: { height: 1 } };
  for (let i = 0; i < 60; i += 1) {
    dyn.update(0.03, { player: p1Combo, opponent: p2Combo });
  }
  const closeZ = cam.position.z;
  assert.ok(closeZ < farZ - 3.0, `camera should zoom in closer during close-range combos (closeZ=${closeZ.toFixed(2)}, farZ=${farZ.toFixed(2)})`);

  // Launcher & Counter-Hit trigger zoomPunch, exchangeHold & camera tilt
  dyn.triggerImpact({ launch: true, direction: 1 });
  assert.ok(dyn.getState().zoomPunch >= 1.4);
  assert.ok(Math.abs(dyn.getState().tilt) > 0.04);
  assert.ok(dyn.getState().exchangeHold > 0.5);

  dyn.triggerImpact({ counter: true, direction: -1 });
  assert.ok(dyn.getState().zoomPunch >= 1.8);
  assert.ok(dyn.getState().tilt < -0.05);

  // Damage-proportional micro camera shake
  const camLow = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
  const dynLow = createDynamicCamera(camLow);
  dynLow.triggerImpact({ damage: 6, direction: 1 });
  const lowShake = dynLow.getState().shake;
  const camHigh = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
  const dynHigh = createDynamicCamera(camHigh);
  dynHigh.triggerImpact({ damage: 28, direction: 1 });
  assert.ok(dynHigh.getState().shake > lowShake * 2, "shake should scale proportionally with move damage");

  // K.O. slow-motion finish framing -> loser lands -> low-angle victory sweep
  dyn.triggerKO(1);
  assert.ok(dyn.getState().zoomPunch >= 2.3);
  dyn.update(0.03, {
    player: p1Combo,
    opponent: p2Combo,
    victory: { winner: p1Combo, loser: p2Combo, time: 0.2, reason: "knockout", koSlammed: false, groundAt: null },
    koSlowMo: 0.9
  });
  const slowMoY = cam.position.y;
  for (let i = 0; i < 40; i += 1) {
    dyn.update(0.03, {
      player: p1Combo,
      opponent: p2Combo,
      victory: { winner: p1Combo, loser: p2Combo, time: 0.6 + i * 0.03, reason: "knockout", koSlammed: true, groundAt: 0.5 },
      koSlowMo: 0
    });
  }
  assert.ok(cam.position.y < slowMoY, "post-KO victory camera should sweep to a low-angle close-up of the winner");
  assert.ok(Number.isFinite(cam.position.x) && Number.isFinite(cam.position.y) && Number.isFinite(cam.position.z));
});
