import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "../vendor/three/three.module.min.js";
import { fighters } from "../fighters.js";

const source = await readFile(new URL("../game.js", import.meta.url), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const context = vm.createContext({
  THREE,
  clamp: THREE.MathUtils.clamp,
  tryHit() {},
  shake: 0,
  scene: { remove() {} },
  document: {
    createElement: () => {
      const operations = [];
      const ctx = {
        fillRect(...args) { operations.push([this.fillStyle, ...args]); },
        fillText() {}
      };
      return { operations, getContext: () => ctx };
    }
  }
});
vm.runInContext([
  section("function material(", "function createArena("),
  section("function addGlasses(", "function createCombatant("),
  section("function disposeFighter(", "function beginMatch("),
  section("function sampleKeyframes(", "function updateBallots(")
].join("\n"), context);

function combatant(definition, facing = 1) {
  return {
    definition,
    ...context.buildFighterModel(definition, facing),
    vx: 0, vz: 0, animationTime: 0, walkPhase: 0, blocking: false,
    attack: null, reactionTime: 0, airborne: false, airRotation: 0, landingTime: 0
  };
}

test("each roster member has articulated flat-shaded limbs and an attached prop", () => {
  for (const definition of fighters) {
    const body = combatant(definition);
    const { joints } = body;
    assert.equal(joints.torso.parent, joints.hips);
    assert.equal(joints.head.parent, joints.torso);
    for (const side of ["left", "right"]) {
      assert.equal(joints[`${side}Shoulder`].parent, joints.torso);
      assert.equal(joints[`${side}Elbow`].parent, joints[`${side}Shoulder`]);
      assert.equal(joints[`${side}Hip`].parent, joints.hips);
      assert.equal(joints[`${side}Knee`].parent, joints[`${side}Hip`]);
    }
    assert.equal(body.prop.parent, body.rightHand);
    body.root.traverse((part) => {
      if (part.isMesh && part.material.isMeshStandardMaterial) assert.equal(part.material.flatShading, true);
    });
  }
});

test("procedural fighters use crisp textures and sculpted anatomy", () => {
  for (const definition of fighters) {
    const body = combatant(definition);
    for (const kind of ["face", "suit", "shirt", "tie"]) {
      let texture;
      body.root.traverse((part) => {
        if (part.material?.map?.name === `${definition.id}-${kind}`) texture = part.material.map;
      });
      assert.ok(texture, `${definition.id} ${kind}`);
      assert.equal(texture.image.width, 64);
      assert.equal(texture.image.height, 64);
      assert.equal(texture.magFilter, THREE.NearestFilter);
      assert.equal(texture.minFilter, THREE.NearestFilter);
      assert.equal(texture.generateMipmaps, false);
      assert.ok(texture.image.operations.length > 4);
    }
    for (const name of ["head", "jacket", "forearm", "trouserThigh", "trouserShin", "shoe", "sole", "fist"]) {
      let found = false;
      body.root.traverse((part) => {
        if (part.name === name && part.geometry?.type === "LatheGeometry") found = true;
      });
      assert.ok(found, `${definition.id} ${name}`);
    }
    assert.equal(body.root.getObjectByName("lapel").geometry.type, "ExtrudeGeometry");
    assert.ok(body.leftHand.getObjectByName("thumb"));
    assert.ok(body.rightHand.getObjectByName("thumb"));
    if (definition.glasses) assert.ok(body.joints.head.children.some((part) => part.geometry?.type === "CircleGeometry"));
    if (definition.rolledSleeves) assert.ok(body.joints.leftElbow.getObjectByName("cuff"));
  }
  const beard = context.pixelTexture(fighters.find((fighter) => fighter.beard), "face");
  const wrinkles = context.pixelTexture(fighters.find((fighter) => fighter.id === "tajani"), "face");
  assert.notDeepEqual(beard.image.operations, wrinkles.image.operations);
});

test("clothing reacts to motion and generated textures are disposed", () => {
  for (const id of ["meloni", "bonelli"]) {
    const body = combatant(fighters.find((fighter) => fighter.id === id));
    const piece = body.clothing.find(({ kind }) => kind === (id === "meloni" ? "sash" : "scarf"));
    assert.ok(piece);
    context.poseFighter(body, 0);
    const idle = piece.joint.rotation.x;
    body.vx = 2.5;
    body.attack = { age: 0.5, duration: 1, windup: 0.3, kind: "punch", limb: "leftPunch" };
    context.poseFighter(body, 0);
    assert.notEqual(piece.joint.rotation.x, idle);
    const textures = [];
    body.root.traverse((part) => {
      if (part.material?.map) textures.push(part.material.map);
    });
    const disposed = [];
    textures.forEach((texture) => texture.addEventListener("dispose", () => disposed.push(texture)));
    context.disposeFighter(body);
    assert.equal(disposed.length, textures.length);
  }
});

test("attack progress drives snap, kick chamber, launcher crouch, and spin", () => {
  const body = combatant(fighters.find((fighter) => fighter.id === "renzi"));
  const pose = (attack) => {
    body.attack = attack;
    context.poseFighter(body, 0);
  };
  const base = { duration: 1, windup: 0.3 };
  pose({ ...base, kind: "punch", limb: "leftPunch", age: 0 });
  const guard = body.joints.leftElbow.rotation.z;
  pose({ ...base, kind: "punch", limb: "leftPunch", age: 0.3 });
  assert.ok(body.joints.leftElbow.rotation.z < guard);
  pose({ ...base, kind: "punch", limb: "leftPunch", age: 1 });
  assert.equal(body.joints.leftElbow.rotation.z, guard);

  pose({ ...base, kind: "kick", limb: "leftKick", age: 0.165 });
  assert.ok(body.joints.leftKnee.rotation.z < -0.5);
  pose({ ...base, kind: "kick", limb: "leftKick", age: 0.3 });
  assert.ok(body.joints.leftHip.rotation.z > 1.5);
  assert.ok(Math.abs(body.joints.leftKnee.rotation.z - 0.08) < 1e-10);

  pose({ ...base, kind: "launcher", limb: "rightPunch", age: 0.18 });
  assert.ok(body.joints.leftKnee.rotation.x > 1);
  pose({ ...base, kind: "launcher", limb: "rightPunch", age: 0.3 });
  assert.ok(body.joints.rightShoulder.rotation.z > 2.5);

  pose({ ...base, kind: "spin", limb: "rightKick", special: true, age: 1 });
  assert.equal(body.root.rotation.y, Math.PI * 2);
  body.airborne = true;
  body.airRotation = Math.PI / 2;
  context.poseFighter(body, 0);
  assert.equal(body.root.rotation.y, 0);
  assert.equal(body.model.rotation.z, Math.PI / 2);
});

test("airborne fighters tumble and settle without unwinding on landing", () => {
  const body = Object.assign(combatant(fighters[0]), {
    x: 0, y: 0, z: 0, vy: 5.1, cooldown: 0, comboWindow: 0, stun: 0,
    dodgeTimer: 0, blockTimer: 0, isPlayer: false, facing: 1, airborne: true
  });
  let maxRotation = 0;
  for (let i = 0; i < 80; i += 1) {
    const previous = body.airRotation;
    context.updateCombatant(body, 0.02, null);
    maxRotation = Math.max(maxRotation, body.airRotation);
    const delta = Math.atan2(Math.sin(body.airRotation - previous), Math.cos(body.airRotation - previous));
    assert.ok(Math.abs(delta) < 1, "pose should not jump during landing");
    assert.ok(body.y >= 0);
  }
  assert.ok(maxRotation > Math.PI);
  assert.ok(Math.abs(body.airRotation) < 0.01);
});
