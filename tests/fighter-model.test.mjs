import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import * as THREE from "../vendor/three/three.module.min.js";
import { fighters } from "../fighters.js";
import { SPECIAL_FRAME_DATA } from "../super-meter.js";
import {
  createSculptedLimb,
  buildFighterModel,
  generateFighterTextures,
  updateGroundedRig,
  evaluateKickCurve,
  applyKickAnimation,
  isKickHitboxActive
} from "../fighter-model.js";

test("createSculptedLimb sculpts vertices and applies Gouraud vertex colors", () => {
  const limb = createSculptedLimb(0.08, 0.11, 0.05, 0.5, 12, 8, "#305080");
  assert.ok(limb.isMesh);
  assert.equal(limb.material.vertexColors, true);
  assert.equal(limb.material.flatShading, false);

  const pos = limb.geometry.attributes.position;
  const col = limb.geometry.attributes.color;
  assert.ok(pos && col);
  assert.equal(col.count, pos.count);

  const midRadii = [];
  const bottomRadii = [];
  for (let i = 0; i < pos.count; i += 1) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r < 1e-4) continue;
    const y = pos.getY(i);
    if (Math.abs(y) < 0.04) midRadii.push(r);
    if (y < -0.23) bottomRadii.push(r);
  }
  const avgMid = midRadii.reduce((a, b) => a + b, 0) / midRadii.length;
  const avgBot = bottomRadii.reduce((a, b) => a + b, 0) / bottomRadii.length;
  assert.ok(avgMid > 0.10, `mid radius should bulge past 0.10, got ${avgMid}`);
  assert.ok(avgBot < 0.06, `bottom radius should taper below 0.06, got ${avgBot}`);

  let minLum = Infinity;
  let maxLum = -Infinity;
  for (let i = 0; i < col.count; i += 1) {
    const lum = col.getX(i) + col.getY(i) + col.getZ(i);
    minLum = Math.min(minLum, lum);
    maxLum = Math.max(maxLum, lum);
  }
  assert.ok(maxLum - minLum > 0.02, "Gouraud vertex colors must vary across vertices");
});

test("procedural 128x128 NearestFilter textures generate distinct PS1 face & suit details", () => {
  const salvini = fighters.find((f) => f.id === "salvini");
  const meloni = fighters.find((f) => f.id === "meloni");

  for (const fighter of [salvini, meloni]) {
    const texSet = generateFighterTextures(fighter);
    for (const [name, tex] of Object.entries(texSet)) {
      assert.equal(tex.isCanvasTexture, true, `${fighter.id}.${name} must be a CanvasTexture`);
      assert.equal(tex.magFilter, THREE.NearestFilter, `${fighter.id}.${name} must use NearestFilter`);
      assert.equal(tex.minFilter, THREE.NearestFilter, `${fighter.id}.${name} must use NearestFilter`);
      assert.equal(tex.image.width, 128);
      assert.equal(tex.image.height, 128);
      assert.equal(tex.userData.pixels.length, 128 * 128 * 4);
    }
  }

  // Verify Salvini's beard region has salt-and-pepper pixel variance vs Meloni's clean chin
  const salviniFace = generateFighterTextures(salvini).face.userData.pixels;
  const meloniFace = generateFighterTextures(meloni).face.userData.pixels;
  const chinPixelOffset = (98 * 128 + 64) * 4;
  const salviniChinLum = salviniFace[chinPixelOffset] + salviniFace[chinPixelOffset + 1] + salviniFace[chinPixelOffset + 2];
  const meloniChinLum = meloniFace[chinPixelOffset] + meloniFace[chinPixelOffset + 1] + meloniFace[chinPixelOffset + 2];
  assert.ok(salviniChinLum !== meloniChinLum, "Salvini beard chin pixels should differ from clean chin");
});

test("all 8 fighters have 16x16 sculpted heads, 7.5-heads-tall proportions, NearestFilter textures, and Gouraud vertex colors", () => {
  for (const definition of fighters) {
    for (const facing of [1, -1]) {
      const built = buildFighterModel(definition, facing);
      assert.ok(built.root);
      assert.ok(built.model);
      assert.ok(built.leftHand);
      assert.ok(built.rightHand);
      assert.ok(built.prop);

      const expectedJoints = [
        "hips", "torso", "head",
        "leftShoulder", "leftElbow", "rightShoulder", "rightElbow",
        "leftHip", "leftKnee", "leftAnkle", "rightHip", "rightKnee", "rightAnkle"
      ];
      for (const name of expectedJoints) {
        assert.ok(built.joints[name], `missing joint ${name} on ${definition.id}`);
      }
      for (const yxzJoint of ["hips", "torso", "leftHip", "rightHip"]) {
        assert.equal(built.joints[yxzJoint].rotation.order, "YXZ", `${yxzJoint} must use YXZ Euler order`);
      }

      built.root.updateMatrixWorld(true);

      let meshCount = 0;
      let texturedCount = 0;
      built.root.traverse((obj) => {
        if (!obj.isMesh) return;
        meshCount += 1;
        assert.equal(obj.material.vertexColors, true, `mesh in ${definition.id} missing vertexColors: true`);
        assert.equal(obj.material.flatShading, false, `mesh in ${definition.id} should use Gouraud shading`);
        if (obj.material.map) {
          texturedCount += 1;
          assert.equal(obj.material.map.isCanvasTexture, true);
          assert.equal(obj.material.map.magFilter, THREE.NearestFilter);
          assert.equal(obj.material.map.minFilter, THREE.NearestFilter);
          assert.equal(obj.material.map.image.width, 128);
          assert.equal(obj.material.map.image.height, 128);
          assert.ok(obj.geometry.attributes.uv, `textured mesh in ${definition.id} missing uv attribute`);
        }
        const pos = obj.geometry.attributes.position;
        const norm = obj.geometry.attributes.normal;
        const col = obj.geometry.attributes.color;
        assert.ok(pos && pos.count > 0, `mesh in ${definition.id} missing positions`);
        assert.ok(norm && norm.count === pos.count, `mesh in ${definition.id} missing normals`);
        assert.ok(col && col.count === pos.count, `mesh in ${definition.id} missing vertex colors`);
        for (let i = 0; i < pos.count; i += 1) {
          assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
          assert.ok(Number.isFinite(col.getX(i)) && Number.isFinite(col.getY(i)) && Number.isFinite(col.getZ(i)));
        }
      });
      assert.ok(meshCount >= 20, `expected rich multi-part mesh count on ${definition.id}, got ${meshCount}`);
      assert.ok(texturedCount >= 18, `expected textured PS1 meshes on ${definition.id}, got ${texturedCount}`);

      // Verify 16x16 sculpted head geometry and anatomical landmarks
      const headGroup = built.joints.head.children[0];
      const skullMesh = headGroup.children[0];
      assert.equal(skullMesh.geometry.parameters.widthSegments, 16);
      assert.equal(skullMesh.geometry.parameters.heightSegments, 16);
      assert.ok(skullMesh.material.map, `${definition.id} head mesh must have 128x128 face CanvasTexture`);

      // Nose bridge vertex (u=0.5, v~0.46) should protrude forward past recessed eye socket (u=0.4375, v~0.57)
      const hPos = skullMesh.geometry.attributes.position;
      const hUv = skullMesh.geometry.attributes.uv;
      let noseZ = -Infinity;
      let socketZ = Infinity;
      for (let i = 0; i < hPos.count; i += 1) {
        const u = hUv.getX(i);
        const v = hUv.getY(i);
        if (Math.abs(u - 0.5) < 0.02 && v > 0.40 && v < 0.52) noseZ = Math.max(noseZ, hPos.getZ(i));
        if (Math.abs(u - 0.4375) < 0.02 && v > 0.53 && v < 0.61) socketZ = Math.min(socketZ, hPos.getZ(i));
      }
      assert.ok(noseZ > socketZ + 0.02, `${definition.id} noseZ=${noseZ.toFixed(3)} should protrude past eye socketZ=${socketZ.toFixed(3)}`);

      if (facing === 1) {
        const bodyBox = new THREE.Box3().setFromObject(built.model);
        const totalHeight = (bodyBox.max.y - bodyBox.min.y) / definition.height;
        const skullBox = new THREE.Box3().setFromObject(skullMesh);
        const headHeight = (skullBox.max.y - skullBox.min.y) / definition.height;
        const headsTall = totalHeight / headHeight;

        assert.ok(
          headsTall >= 7.2 && headsTall <= 8.0,
          `${definition.id} headsTall=${headsTall.toFixed(2)} (total=${totalHeight.toFixed(3)}, head=${headHeight.toFixed(3)})`
        );
        assert.ok(
          bodyBox.min.y >= 0.09 && bodyBox.min.y <= 0.13,
          `${definition.id} feet min.y=${bodyBox.min.y.toFixed(3)} should align cleanly on stage top 0.11`
        );
      }
    }
  }
});

test("grounded rig lowers hips proportionally to standing knee bend and keeps ankle/kick pivots grounded", () => {
  const calenda = fighters.find((f) => f.id === "calenda");
  const built = buildFighterModel(calenda, 1);
  const { root, joints } = built;

  assert.equal(root.position.y, 0);
  const restHipY = joints.hips.position.y;
  updateGroundedRig(joints, { support: "both" });
  root.updateMatrixWorld(true);
  const restFootBox = new THREE.Box3().setFromObject(joints.leftAnkle);
  assert.ok(Math.abs(restFootBox.min.y - 0.11) < 0.02, `rest sole y=${restFootBox.min.y.toFixed(3)} should match stage 0.11`);

  // Roundhouse kick on left leg while standing knee (right) bends deeply
  joints.hips.rotation.set(0, 0.55, 0);
  joints.torso.rotation.set(0, -0.35, 0.34);
  joints.leftHip.rotation.set(-1.36, 0.88, 0.32);
  joints.leftKnee.rotation.set(0.06, 0, 0);
  joints.leftAnkle.rotation.set(0.45, 0, 0);
  joints.rightHip.rotation.set(-0.35, 0, 0.22);
  joints.rightKnee.rotation.set(0.70, 0, -0.16);

  const bentHipY = updateGroundedRig(joints, { support: "right" });
  assert.ok(bentHipY < restHipY - 0.05, `hips should lower proportionally when standing knee bends (rest=${restHipY.toFixed(3)}, bent=${bentHipY.toFixed(3)})`);
  assert.equal(root.position.y, 0);

  root.updateMatrixWorld(true);
  const standingFootBox = new THREE.Box3().setFromObject(joints.rightAnkle);
  assert.ok(
    Math.abs(standingFootBox.min.y - 0.11) < 0.025,
    `planted boot should stay glued near floor 0.11 (got ${standingFootBox.min.y.toFixed(3)})`
  );
  assert.equal(joints.leftAnkle.rotation.x, 0.45);
});

test("3-phase kick curve handles roundhouse (KICK_L), side kick (KICK_R), and jumping/spinning axe finisher", () => {
  // Verify exact 3-phase curve landmarks
  const c1 = evaluateKickCurve(0.28);
  assert.equal(c1.phase, "chamber");
  assert.ok(Math.abs(c1.kneeAngle - 1.65) < 0.03, `chamber knee should reach 1.65 rad, got ${c1.kneeAngle}`);

  const c2 = evaluateKickCurve(0.42);
  assert.equal(c2.phase, "extend");
  assert.ok(Math.abs(c2.kneeAngle - 0.08) < 0.01, `snap extension knee should reach 0.08 rad, got ${c2.kneeAngle}`);
  assert.equal(c2.extension, 1.0);

  const c3 = evaluateKickCurve(0.80);
  assert.equal(c3.phase, "rechamber");
  assert.ok(Math.abs(c3.kneeAngle - 1.2) < 0.03, `rechamber knee should fold to 1.2 rad, got ${c3.kneeAngle}`);

  const end = evaluateKickCurve(1.0);
  assert.equal(end.lift, 0);

  const renzi = fighters.find((f) => f.id === "renzi");
  const { root, joints } = buildFighterModel(renzi, 1);
  const resetStance = () => {
    joints.hips.rotation.set(0, 0, 0);
    joints.torso.rotation.set(0, -0.1, -0.06);
    joints.leftShoulder.rotation.set(-0.2, 0, 0.8);
    joints.rightShoulder.rotation.set(-0.2, 0, 1.05);
    joints.leftElbow.rotation.set(-0.2, 0, 1.5);
    joints.rightElbow.rotation.set(-0.2, 0, 1.2);
    joints.leftHip.rotation.set(-0.07, 0, -0.2);
    joints.rightHip.rotation.set(-0.07, 0, 0.2);
    joints.leftKnee.rotation.set(0.14, 0, 0.16);
    joints.rightKnee.rotation.set(0.14, 0, -0.16);
    joints.leftAnkle.rotation.set(0, 0, 0);
    joints.rightAnkle.rotation.set(0, 0, 0);
  };

  resetStance();
  const baseHipY = updateGroundedRig(joints, { support: "both" });

  // KICK_L (roundhouse): Phase 1 chamber dips hips ~0.08 & keeps standing foot grounded
  resetStance();
  applyKickAnimation(joints, { style: "roundhouse", side: "left", progress: 0.28 });
  const dipDelta = joints.hips.position.y - baseHipY;
  assert.ok(dipDelta <= -0.04 && dipDelta >= -0.13, `chamber dip should be ~ -0.08 (got ${dipDelta.toFixed(3)})`);
  root.updateMatrixWorld(true);
  const rhFootY = new THREE.Box3().setFromObject(joints.rightAnkle).min.y;
  assert.ok(Math.abs(rhFootY - 0.11) < 0.025, `standing foot should stay grounded during roundhouse chamber (got ${rhFootY.toFixed(3)})`);

  // KICK_L peak extension at progress 0.42
  resetStance();
  applyKickAnimation(joints, { style: "roundhouse", side: "left", progress: 0.42 });
  assert.ok(Math.abs(joints.leftAnkle.rotation.x - 0.45) < 0.05);
  assert.ok(joints.leftShoulder.rotation.z < 0.4, "lead arm should whip down for momentum");
  assert.ok(joints.rightElbow.rotation.z > 1.8, "rear arm should guard chin");

  // KICK_R (heavy side kick): perpendicular hips, flexed flat foot, strong torso counterbalance
  resetStance();
  applyKickAnimation(joints, { style: "side", side: "right", progress: 0.42 });
  assert.ok(Math.abs(joints.rightAnkle.rotation.x + 0.25) < 0.05, "side kick foot must flex flat (-0.25)");
  assert.ok(Math.abs(joints.torso.rotation.z) >= 0.42, "torso must lean back sharply to counterbalance side kick");

  // Combo Finisher Jumping/Spinning Heel-Axe Kick: +0.35 jump height & 2*PI spin
  let maxRise = -Infinity;
  for (const p of [0.2, 0.35, 0.45, 0.55, 0.7, 0.9]) {
    resetStance();
    const res = applyKickAnimation(joints, { style: "axe", side: "right", progress: p });
    maxRise = Math.max(maxRise, res.verticalLift);
  }
  assert.ok(maxRise >= 0.30, `axe kick finisher should rise ~ +0.35 off floor (got ${maxRise.toFixed(3)})`);
  resetStance();
  applyKickAnimation(joints, { style: "axe", side: "right", progress: 0.92 });
  assert.ok(joints.hips.rotation.y >= Math.PI * 1.9, `axe kick finisher should spin ~2*PI (got ${joints.hips.rotation.y.toFixed(3)})`);

  // Active hitbox window check for KICK_L (0.38s) & KICK_R (0.46s): strictly [0.30, 0.55]
  for (const duration of [0.38, 0.46]) {
    assert.equal(isKickHitboxActive({ age: duration * 0.28, duration, hit: false }), false, "chamber phase must not hit");
    assert.equal(isKickHitboxActive({ age: duration * 0.299, duration, hit: false }), false, "before 0.30 must not hit");
    assert.equal(isKickHitboxActive({ age: duration * 0.30, duration, hit: false }), true, "0.30 opens active hitbox");
    assert.equal(isKickHitboxActive({ age: duration * 0.42, duration, hit: false }), true, "0.42 peak extension must be active");
    assert.equal(isKickHitboxActive({ age: duration * 0.55, duration, hit: false }), true, "0.55 remains active");
    assert.equal(isKickHitboxActive({ age: duration * 0.56, duration, hit: false }), false, "past 0.55 enters re-chamber and must not hit");
    assert.equal(isKickHitboxActive({ age: duration * 0.42, duration, hit: true }), false, "already-landed kick must not double-hit");
  }
});

const gameSource = await readFile(new URL("../game.js", import.meta.url), "utf8");
const gameSection = (start, end) => gameSource.slice(gameSource.indexOf(start), gameSource.indexOf(end));

function createGamePoseContext() {
  const ctx = vm.createContext({
    THREE,
    clamp: THREE.MathUtils.clamp,
    SPECIAL_FRAME_DATA,
    updateGroundedRig,
    applyKickAnimation,
    tryHit() {},
    advanceInputClock() {},
    clearComboInput() {},
    consumeBufferedAttack() {},
    endComboAttack() {},
    updateComboBadge() {},
    shake: 0,
    sidestepGhosts: [],
    scene: new THREE.Scene()
  });
  vm.runInContext([
    gameSection("function disposeFighter(", "function beginMatch("),
    gameSection("function attackDefinition(", "function queueAttack("),
    gameSection("function getSpecial(", "function useSpecial("),
    gameSection("function spawnSidestepGhost(", "function updateBallots(")
  ].join("\n"), ctx);
  return ctx;
}

function makePoseCombatant(definition, facing = 1) {
  return {
    definition,
    ...buildFighterModel(definition, facing),
    vx: 0, vy: 0, vz: 0, facing, dodgeTimer: 0, recovery: 0, animationTime: 0, walkPhase: 0,
    blocking: false, guardMode: null, parryPose: 0, attack: null, reactionTime: 0,
    airborne: false, airRotation: 0, landingTime: 0
  };
}

test("clothing reacts to motion and generated textures are disposed", () => {
  const ctx = createGamePoseContext();
  const body = makePoseCombatant(fighters.find((f) => f.id === "bonelli"));
  const scarf = body.clothing.find(({ kind }) => kind === "scarf");
  assert.ok(scarf);
  ctx.poseFighter(body, 1 / 60);
  const idle = scarf.joint.rotation.x;
  body.vx = 2.5;
  body.attack = { age: 0.5, duration: 1, windup: 0.3, kind: "punch", limb: "leftPunch" };
  ctx.poseFighter(body, 1 / 60);
  assert.notEqual(scarf.joint.rotation.x, idle);

  const textures = new Set();
  body.root.traverse((part) => {
    if (part.isMesh && part.material?.map) textures.add(part.material.map);
  });
  assert.ok(textures.size > 0);
  const disposed = new Set();
  textures.forEach((texture) => texture.addEventListener("dispose", () => disposed.add(texture)));
  ctx.disposeFighter(body);
  assert.equal(disposed.size, textures.size);
});

test("attack progress drives punch snap, launcher crouch, and airborne tumble pose", () => {
  const ctx = createGamePoseContext();
  const body = makePoseCombatant(fighters.find((f) => f.id === "renzi"));
  const pose = (attack) => {
    body.attack = attack;
    ctx.poseFighter(body, 0);
  };
  const base = { duration: 1, windup: 0.3 };
  pose({ ...base, kind: "punch", limb: "leftPunch", age: 0 });
  const guard = body.joints.leftElbow.rotation.z;
  pose({ ...base, kind: "punch", limb: "leftPunch", age: 0.3 });
  assert.ok(body.joints.leftElbow.rotation.z < guard);
  pose({ ...base, kind: "punch", limb: "leftPunch", age: 1 });
  assert.equal(body.joints.leftElbow.rotation.z, guard);

  pose({ ...base, kind: "launcher", limb: "rightPunch", age: 0.18 });
  assert.ok(body.joints.leftKnee.rotation.x > 0.8);
  pose({ ...base, kind: "launcher", limb: "rightPunch", age: 0.3 });
  assert.ok(body.joints.rightShoulder.rotation.z > 2.4);

  body.attack = null;
  body.airborne = true;
  body.airRotation = Math.PI / 2;
  ctx.poseFighter(body, 0);
  assert.equal(body.root.rotation.y, 0);
  assert.equal(body.model.rotation.z, Math.PI / 2);
});

test("airborne fighters tumble and settle without unwinding on landing", () => {
  const ctx = createGamePoseContext();
  const body = Object.assign(makePoseCombatant(fighters[0]), {
    x: 0, y: 0, z: 0, vy: 5.1, cooldown: 0, stun: 0,
    dodgeTimer: 0, blockTimer: 0, isPlayer: false, facing: 1, airborne: true
  });
  let maxRotation = 0;
  for (let i = 0; i < 80; i += 1) {
    const previous = body.airRotation;
    ctx.updateCombatant(body, 0.02, null);
    maxRotation = Math.max(maxRotation, body.airRotation);
    const delta = Math.atan2(Math.sin(body.airRotation - previous), Math.cos(body.airRotation - previous));
    assert.ok(Math.abs(delta) < 1, "pose should not jump during landing");
    assert.ok(body.y >= 0);
  }
  assert.ok(maxRotation > Math.PI);
  assert.ok(Math.abs(body.airRotation) < 0.01);
});

test("hair and clothing spring behind motion and continue moving during recovery", () => {
  const ctx = createGamePoseContext();
  const body = makePoseCombatant(fighters.find((f) => f.id === "bonelli"));
  const hair = body.clothing.find((p) => p.kind === "hair");
  const tie = body.clothing.find((p) => p.kind === "tie");
  const scarf = body.clothing.find((p) => p.kind === "scarf");
  body.vx = 4;
  body.vz = 3;
  body.vy = 3;
  body.attack = { kind: "punch", limb: "rightPunch", age: 0.2, duration: 0.5, windup: 0.2 };
  for (let i = 0; i < 10; i += 1) ctx.poseFighter(body, 1 / 60);
  for (const piece of [hair, tie, scarf]) {
    assert.ok(Math.abs(piece.spring.x) + Math.abs(piece.spring.z) > 0.01, piece.kind);
  }
  const prior = scarf.joint.rotation.x;
  body.vx = body.vy = body.vz = 0;
  body.attack = null;
  ctx.poseFighter(body, 1 / 60);
  assert.notEqual(scarf.joint.rotation.x, prior, "motion should continue after the strike");
  for (let i = 0; i < 300; i += 1) ctx.poseFighter(body, 1 / 60);
  assert.ok(Math.abs(scarf.joint.rotation.x + 0.4) < 0.04, "spring should settle");
});

test("breathing and opponent head tracking respond to height and position", () => {
  const ctx = createGamePoseContext();
  const body = makePoseCombatant(fighters[0]);
  const rival = makePoseCombatant(fighters[1], -1);
  body.root.position.set(-2, 0, 0);
  rival.root.position.set(2, 0, 2);
  for (let i = 0; i < 60; i += 1) ctx.poseFighter(body, 1 / 60, rival);
  const yaw = body.joints.head.rotation.y;
  const pitch = body.joints.head.rotation.x;
  const chest = body.joints.torso.scale.x;
  rival.root.position.set(2, 2, -2);
  for (let i = 0; i < 60; i += 1) ctx.poseFighter(body, 1 / 60, rival);
  assert.ok(body.joints.head.rotation.y > yaw);
  assert.ok(body.joints.head.rotation.x < pitch);
  assert.notEqual(body.joints.torso.scale.x, chest);
  const headPosition = body.joints.head.getWorldPosition(new THREE.Vector3());
  const targetPosition = rival.joints.head.getWorldPosition(new THREE.Vector3());
  const direction = new THREE.Vector3(0, 0, 1).transformDirection(body.joints.head.matrixWorld);
  assert.ok(direction.dot(targetPosition.sub(headPosition).normalize()) > 0.99);
});

test("sidestep ghosts are faint, short-lived, and do not dispose fighter geometry", () => {
  const ctx = createGamePoseContext();
  const body = makePoseCombatant(fighters[0]);
  let geometry = null;
  body.root.traverse((part) => {
    if (!geometry && part.isMesh && part.geometry) geometry = part.geometry;
  });
  let geometryDisposed = false;
  geometry.addEventListener("dispose", () => { geometryDisposed = true; });
  ctx.spawnSidestepGhost(body);
  assert.equal(ctx.sidestepGhosts.length, 1);
  const ghost = ctx.sidestepGhosts[0];
  assert.ok(ghost.material.opacity < 0.2);
  ctx.updateSidestepGhosts(0.09);
  assert.ok(ghost.material.opacity < 0.13);
  ctx.updateSidestepGhosts(0.1);
  assert.equal(ctx.sidestepGhosts.length, 0);
  assert.equal(geometryDisposed, false);
  ctx.spawnSidestepGhost(body);
  ctx.disposeFighter(body);
  assert.equal(ctx.sidestepGhosts.length, 0);
  assert.equal(geometryDisposed, true);
});

test("sidestep poses dip and pivot in opposite directions and spawn a trail", () => {
  const ctx = createGamePoseContext();
  const body = Object.assign(makePoseCombatant(fighters[0]), {
    x: 0, y: 0, z: 0, cooldown: 0, stun: 0, blockTimer: 0, isPlayer: false, ghostTimer: 0
  });
  body.dodgeTimer = 0.36;
  body.vz = 4;
  ctx.updateCombatant(body, 0.02, null);
  assert.ok(body.root.rotation.y > 0);
  assert.ok(body.joints.torso.rotation.x > 0);
  assert.equal(ctx.sidestepGhosts.length, 1);
  body.vz = -4;
  ctx.poseFighter(body, 0);
  assert.ok(body.root.rotation.y < 0);
  assert.ok(body.joints.torso.rotation.x < 0);
  ctx.clearSidestepGhosts(body);
});

test("all punches shift weight through windup, extension and recovery", () => {
  const ctx = createGamePoseContext();
  const body = makePoseCombatant(fighters[0]);
  for (const limb of ["leftPunch", "rightPunch"]) {
    const attack = { kind: "punch", limb, windup: 0.3, duration: 1 };
    const weight = (age) => {
      body.attack = { ...attack, age };
      ctx.poseFighter(body, 0);
      return body.model.position.x;
    };
    assert.ok(weight(0.18) < 0, `${limb} anticipation`);
    assert.ok(weight(0.3) > 0, `${limb} extension`);
    assert.equal(weight(1), 0, `${limb} recovery`);
  }
});

test("all signatures have distinct windup, impact and recovery poses", () => {
  const ctx = createGamePoseContext();
  const impactPoses = new Set();
  for (const definition of fighters) {
    const body = makePoseCombatant(definition);
    const details = ctx.getSpecial(body);
    const special = ctx.attackDefinition(body, details.kind, details);
    const snapshot = (age) => {
      body.attack = { ...special, age };
      ctx.poseFighter(body, 0);
      return [
        body.joints.leftShoulder.rotation.z, body.joints.rightShoulder.rotation.z,
        body.joints.rightElbow.rotation.z, body.joints.torso.rotation.z,
        body.joints.hips.rotation.y, body.joints.rightHip.rotation.x,
        body.model.position.x, body.model.position.y, body.prop.rotation.z
      ].map((value) => Number(value.toFixed(3)));
    };
    const windup = snapshot(special.windup * 0.6);
    const impact = snapshot(special.windup);
    const recovery = snapshot(special.duration);
    assert.notDeepEqual(windup, impact, definition.id);
    assert.notDeepEqual(impact, recovery, definition.id);
    impactPoses.add(JSON.stringify(impact));
  }
  assert.equal(impactPoses.size, fighters.length);
});
