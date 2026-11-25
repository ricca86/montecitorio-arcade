import assert from "node:assert/strict";
import test from "node:test";
import { fighters } from "../fighters.js";
import { buildFighterModel, setSpecialReadyGlow } from "../fighter-model.js";
import {
  SUPER_METER_START,
  SUPER_METER_COST,
  SPECIAL_FRAME_DATA,
  METER_GAIN,
  addSuperMeter,
  canUseSpecial,
  canAICastSpecial,
  spendSuperMeter,
  interruptSpecialStartup,
  computeSpecialDamage,
  applyCombatMeter
} from "../super-meter.js";

test("Super Meter economy awards +8 light, +14 heavy/launcher, +12 block/counter, +6 damage and caps at 100%", () => {
  const p1 = { superMeter: SUPER_METER_START };
  const cpu = { superMeter: SUPER_METER_START };

  assert.equal(p1.superMeter, 0);
  assert.equal(canUseSpecial(p1), false);

  // Light punch/kick (U, J): +8% attacker, +6% target taking damage
  let res = applyCombatMeter(p1, cpu, {
    attack: { kind: "punch", limb: "leftPunch" },
    blocked: false,
    counterHit: false
  });
  assert.equal(res.attackerGain, METER_GAIN.light);
  assert.equal(res.targetGain, METER_GAIN.damage);
  assert.equal(p1.superMeter, 8);
  assert.equal(cpu.superMeter, 6);

  res = applyCombatMeter(p1, cpu, {
    attack: { kind: "kick", limb: "leftKick" },
    blocked: false,
    counterHit: false
  });
  assert.equal(res.attackerGain, 8);
  assert.equal(p1.superMeter, 16);
  assert.equal(cpu.superMeter, 12);

  // Heavy punch/kick (I, K) & Launcher (S+I): +14% attacker
  res = applyCombatMeter(p1, cpu, {
    attack: { kind: "kick", limb: "rightKick" },
    blocked: false,
    counterHit: false
  });
  assert.equal(res.attackerGain, METER_GAIN.heavy);
  assert.equal(p1.superMeter, 30);

  res = applyCombatMeter(p1, cpu, {
    attack: { kind: "launcher", launch: true, limb: "rightPunch" },
    blocked: false,
    counterHit: false
  });
  assert.equal(res.attackerGain, METER_GAIN.launcher);
  assert.equal(p1.superMeter, 44);

  // Blocking an opponent's attack: +12% defender, 0 attacker
  res = applyCombatMeter(cpu, p1, {
    attack: { kind: "punch", limb: "rightPunch" },
    blocked: true,
    counterHit: false
  });
  assert.equal(res.attackerGain, 0);
  assert.equal(res.targetGain, METER_GAIN.block);
  assert.equal(p1.superMeter, 56);

  // Counter-Hit on light punch: +8% + 12% counter bonus = +20%
  res = applyCombatMeter(p1, cpu, {
    attack: { kind: "punch", limb: "leftPunch" },
    blocked: false,
    counterHit: true
  });
  assert.equal(res.attackerGain, 20);
  assert.equal(p1.superMeter, 76);

  // Specials do not gain attacker meter, but unblocked target still receives +6% comeback meter
  const cpuBeforeSpecial = cpu.superMeter;
  res = applyCombatMeter(p1, cpu, {
    attack: { kind: "rush", special: true, limb: "rightPunch" },
    blocked: false,
    counterHit: false
  });
  assert.equal(res.attackerGain, 0);
  assert.equal(p1.superMeter, 76);
  assert.equal(cpu.superMeter, cpuBeforeSpecial + 6);

  // Cannot spend special under 100%
  addSuperMeter(p1, 23);
  assert.equal(p1.superMeter, 99);
  assert.equal(canUseSpecial(p1), false);
  assert.equal(spendSuperMeter(p1, SUPER_METER_COST), false);
  assert.equal(p1.superMeter, 99);

  // Reaches 100% cap and spends 100 cleanly
  addSuperMeter(p1, 15);
  assert.equal(p1.superMeter, 100);
  assert.equal(canUseSpecial(p1), true);
  assert.equal(spendSuperMeter(p1, SUPER_METER_COST), true);
  assert.equal(p1.superMeter, 0);
  assert.equal(canUseSpecial(p1), false);
});

test("setSpecialReadyGlow illuminates hands and prop when at 100% and clears otherwise", () => {
  const meloni = fighters.find((f) => f.id === "meloni");
  const model = buildFighterModel(meloni, 1);

  const collectIntensities = (group) => {
    const vals = [];
    group.traverse((obj) => {
      if (obj.isMesh && obj.material) vals.push(obj.material.emissiveIntensity);
    });
    return vals;
  };

  setSpecialReadyGlow(model, true, 0.4);
  for (const part of [model.leftHand, model.rightHand, model.prop]) {
    const intensities = collectIntensities(part);
    assert.ok(intensities.length > 0);
    assert.ok(intensities.every((v) => v > 0.3), "hands and prop should emit gold/cyan glow when ready");
  }
  const headEmissive = model.joints.head.children[0].children[0].material.emissiveIntensity;
  assert.equal(headEmissive, 0, "ready glow should only affect hands and prop");

  setSpecialReadyGlow(model, false, 0.4);
  for (const part of [model.leftHand, model.rightHand, model.prop]) {
    const intensities = collectIntensities(part);
    assert.ok(intensities.every((v) => v === 0), "glow must clear once special is spent");
  }
});

test("Signature Move startup interruption, damage/juggle/chip rules, and AI anti-spam gate", () => {
  assert.equal(SPECIAL_FRAME_DATA.startupEnd, 0.38);
  assert.equal(SPECIAL_FRAME_DATA.activeStart, 0.38);
  assert.equal(SPECIAL_FRAME_DATA.activeEnd, 0.60);
  assert.equal(SPECIAL_FRAME_DATA.whiffRecoverySeconds, 0.55);

  // Startup interruption (< 0.38 progress) cancels special and leaves 50% meter consumed (50% refunded)
  const victim = {
    superMeter: 100,
    blocking: true,
    blockTimer: 0.2,
    attack: { special: true, age: 0.20, duration: 0.90 }
  };
  assert.equal(spendSuperMeter(victim, SUPER_METER_COST), true);
  assert.equal(victim.superMeter, 0);
  const interrupted = interruptSpecialStartup(victim);
  assert.equal(interrupted, true);
  assert.equal(victim.attack, null);
  assert.equal(victim.superMeter, 50, "50% of spent meter must remain consumed after startup interrupt");

  // Past startup (>= 0.38 progress) is not a startup interrupt
  const lateTarget = { superMeter: 0, attack: { special: true, age: 0.40, duration: 0.90 } };
  assert.equal(interruptSpecialStartup(lateTarget), false);
  assert.ok(lateTarget.attack !== null);

  // Balanced damage rules: 24-28 base, 60% airborne juggle scaling, 4% block chip, guard-break on Counter-Hit
  assert.equal(computeSpecialDamage(25, { blocked: false, counterHit: false, targetAirborne: false }), 25);
  assert.equal(computeSpecialDamage(26, { blocked: true, counterHit: false, targetAirborne: false }), 4);
  assert.equal(computeSpecialDamage(25, { blocked: false, counterHit: false, targetAirborne: true }), 15);
  assert.ok(computeSpecialDamage(24, { blocked: true, counterHit: true, targetAirborne: false }) >= 30);

  // AI anti-spam rules: requires 100% meter, max once per round, never back-to-back
  assert.equal(canAICastSpecial({ superMeter: 99, usedSpecialInRound: false, lastAttackWasSpecial: false }), false);
  assert.equal(canAICastSpecial({ superMeter: 100, usedSpecialInRound: false, lastAttackWasSpecial: false }), true);
  assert.equal(canAICastSpecial({ superMeter: 100, usedSpecialInRound: true, lastAttackWasSpecial: false }), false);
  assert.equal(canAICastSpecial({ superMeter: 100, usedSpecialInRound: false, lastAttackWasSpecial: true }), false);
});
