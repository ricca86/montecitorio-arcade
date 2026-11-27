import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "../vendor/three/three.module.min.js";
import { PixelSurface, hexToRgb, scaleRgb, mixRgb } from "../pixel-surface.js";
import { createDynamicCamera } from "../atmosphere.js";
import { defenseOutcome } from "../defense.js";
import { buildFighterModel, createFloorRing } from "../fighter-model.js";
import { fighters } from "../fighters.js";
import { sound } from "../sound-engine.js";

test("pixel-surface exports shared PixelSurface and color helpers with NearestFilter", () => {
  assert.deepEqual(hexToRgb("#ff0000"), [255, 0, 0]);
  assert.deepEqual(scaleRgb([100, 100, 100], 0.5), [50, 50, 50]);
  assert.deepEqual(mixRgb([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25]);

  const surface = new PixelSurface(16, 16);
  surface.fill([40, 80, 120]);
  surface.setPixel(4, 4, [255, 255, 255], 1);
  const tex = surface.toCanvasTexture([2, 3]);
  assert.equal(tex.magFilter, THREE.NearestFilter);
  assert.equal(tex.minFilter, THREE.NearestFilter);
  assert.equal(tex.repeat.x, 2);
  assert.equal(tex.repeat.y, 3);
  tex.dispose();
});

test("dynamicCamera.triggerShake applies and clamps shake cleanly", () => {
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
  const dyn = createDynamicCamera(cam);
  assert.equal(typeof dyn.triggerShake, "function");

  dyn.triggerShake(0.24);
  assert.equal(dyn.getState().shake, 0.24);

  dyn.triggerShake(99);
  assert.equal(dyn.getState().shake, 0.6);

  dyn.update(0.05, { player: { x: -2, y: 0, z: 0 }, opponent: { x: 2, y: 0, z: 0 } });
  assert.ok(dyn.getState().shake < 0.6);
});

test("defenseOutcome honors Tajani guard: true special during startup/active frames only", () => {
  const guardingTarget = {
    attack: { guard: true, age: 0.2, duration: 0.88, activeEnd: 0.6 }
  };
  assert.equal(defenseOutcome(guardingTarget, { unblockable: false, damage: 10 }), "block");
  assert.equal(defenseOutcome(guardingTarget, { unblockable: true, damage: 10 }), "hit");

  const recoveryTarget = {
    attack: { guard: true, age: 0.75, duration: 0.88, activeEnd: 0.6 }
  };
  assert.equal(defenseOutcome(recoveryTarget, { unblockable: false, damage: 10 }), "hit");
});

test("createFloorRing and buildFighterModel ringColor attach exactly one playerFloorRing", () => {
  const ring = createFloorRing("#ff5a36");
  assert.equal(ring.name, "playerFloorRing");
  assert.equal(ring.isMesh, true);
  assert.ok(ring.position.y > 0.11);

  const built = buildFighterModel(fighters[0], 1, { ringColor: "#48b8ff" });
  const rings = [];
  built.root.traverse((obj) => {
    if (obj.name === "playerFloorRing") rings.push(obj);
  });
  assert.equal(rings.length, 1);
});

test("sound-engine heavy impacts, knockout, and victoryFanfare run cleanly across repeated calls", () => {
  assert.doesNotThrow(() => {
    for (let i = 0; i < 4; i += 1) {
      sound.impact({ heavy: true });
      sound.knockout();
      sound.victoryFanfare();
    }
  });
});

test("index.html moves touch-toggle to header, fixes aria-live, and includes 2P UX elements", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const headerBlock = html.match(/<div class="header-actions">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.ok(headerBlock.includes('id="touch-toggle"'), "touch-toggle should be in .header-actions");
  assert.ok(/<div id="hud" class="hud">/.test(html), "#hud should not have aria-live");
  assert.ok(/<span class="clock-label" id="round-status" aria-live="polite">/.test(html), "#round-status should have aria-live=polite");
  assert.ok(/<button id="quit-button" class="secondary-button">/.test(html), "#quit-button should use secondary-button");
  assert.ok(html.includes('id="versus-mood-row"'));
  assert.ok(html.includes('id="versus-detail-grid"'));
  assert.ok(html.includes('id="pause-versus-combos"'));
});
