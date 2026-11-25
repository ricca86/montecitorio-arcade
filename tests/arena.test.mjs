import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../vendor/three/three.module.min.js";
import {
  createArena,
  createFightFloorTexture,
  createVelarioTexture
} from "../arena.js";

test("arena procedural textures use NearestFilter and distinct crimson/marble/stained-glass palettes", () => {
  const floorTex = createFightFloorTexture();
  assert.equal(floorTex.isCanvasTexture, true);
  assert.equal(floorTex.magFilter, THREE.NearestFilter);
  assert.equal(floorTex.minFilter, THREE.NearestFilter);
  assert.equal(floorTex.image.width, 256);
  assert.equal(floorTex.image.height, 256);

  // Center of fight floor should be crimson carpet (R > G, B)
  const centerIdx = (128 * 256 + 128) * 4;
  const fPx = floorTex.userData.pixels;
  assert.ok(fPx[centerIdx] > fPx[centerIdx + 1] + 20);

  // Outer tile ring at y=148, x=225 (away from angle=0 radial grout line) should be bright Carrara marble
  const marbleIdx = (148 * 256 + 225) * 4;
  assert.ok(fPx[marbleIdx] > 140 && fPx[marbleIdx + 1] > 140 && fPx[marbleIdx + 2] > 135);

  const velarioTex = createVelarioTexture();
  assert.equal(velarioTex.isCanvasTexture, true);
  assert.equal(velarioTex.magFilter, THREE.NearestFilter);
  assert.equal(velarioTex.image.width, 256);
});

test("createArena builds Montecitorio landmarks, Velario skylight, reflective sheen, and reactive props", () => {
  const scene = new THREE.Scene();
  const arena = createArena(scene);

  assert.ok(arena.group);
  assert.ok(arena.group.getObjectByName("banco-del-governo"));
  assert.ok(arena.group.getObjectByName("presidents-podium"));
  assert.ok(arena.group.getObjectByName("velario-skylight"));
  assert.equal(arena.props.length, 4);

  // Verify meshes have finite geometry & valid normals
  let meshCount = 0;
  let transparentFloorSheenFound = false;
  arena.group.traverse((obj) => {
    if (!obj.isMesh) return;
    meshCount += 1;
    if (obj.material.transparent && obj.material.opacity > 0 && obj.material.roughness <= 0.12) {
      transparentFloorSheenFound = true;
    }
    const pos = obj.geometry.attributes.position;
    assert.ok(pos && pos.count > 0);
    for (let i = 0; i < pos.count; i += 1) {
      assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
    }
  });
  assert.ok(meshCount >= 40, `expected rich chamber geometry, got ${meshCount} meshes`);
  assert.equal(transparentFloorSheenFound, true, "expected semi-transparent reflective floor sheen");

  // Test reactive props: knockback near left ballot box tips it over and spawns flying ballots
  const ballotsSpawned = [];
  const knockedFighter = { x: -5.5, z: -1.0, vx: -3.2, vz: 0, stun: 0.25, airborne: true };
  arena.update(0.016, [knockedFighter], (x, y, z, dir) => {
    ballotsSpawned.push({ x, y, z, dir });
  });

  const leftUrna = arena.props.find((p) => p.kind === "urna" && p.x < 0);
  assert.equal(leftUrna.state, "tipped");
  assert.ok(ballotsSpawned.length >= 6, "tipped urna should burst with flying ballots");

  // Advance physics a few frames to confirm it tilts toward horizontal
  for (let f = 0; f < 20; f += 1) {
    arena.update(0.016, [], null);
  }
  assert.ok(leftUrna.tiltAngle > 0.5);

  // Reset restores all props upright
  arena.resetProps();
  assert.equal(leftUrna.state, "intact");
  assert.equal(leftUrna.tiltAngle, 0);

  arena.dispose();
  assert.equal(scene.children.length, 0);
});
