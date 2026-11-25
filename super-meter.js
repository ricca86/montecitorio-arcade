export const SUPER_METER_START = 0;
export const SUPER_METER_MAX = 100;
export const SUPER_METER_COST = 100;

export const SPECIAL_FRAME_DATA = {
  startupEnd: 0.38,
  activeStart: 0.38,
  activeEnd: 0.60,
  whiffRecoverySeconds: 0.55,
  juggleDamageScale: 0.60,
  blockChipDamage: 4,
  minBaseDamage: 24,
  maxBaseDamage: 28,
  startupInterruptRefund: 50
};

export const METER_GAIN = {
  light: 8,
  heavy: 14,
  launcher: 14,
  block: 12,
  counter: 12,
  damage: 6
};

function clampMeter(value) {
  return Math.max(0, Math.min(SUPER_METER_MAX, value));
}

export function addSuperMeter(combatant, amount) {
  if (!combatant || !Number.isFinite(amount)) return combatant?.superMeter ?? 0;
  const current = combatant.superMeter ?? 0;
  combatant.superMeter = clampMeter(current + amount);
  return combatant.superMeter;
}

export function canUseSpecial(combatant, cost = SUPER_METER_COST) {
  return Boolean(combatant && (combatant.superMeter ?? 0) >= cost);
}

export function spendSuperMeter(combatant, cost = SUPER_METER_COST) {
  if (!canUseSpecial(combatant, cost)) return false;
  combatant.superMeter = clampMeter((combatant.superMeter ?? 0) - cost);
  return true;
}

/**
 * Enforce anti-spam AI rules: CPU can cast a Signature Move only at 100% meter,
 * at most once per round, and never back-to-back.
 */
export function canAICastSpecial(ai) {
  return Boolean(ai && canUseSpecial(ai) && !ai.usedSpecialInRound && !ai.lastAttackWasSpecial);
}

/**
 * Interrupt a fighter caught in early Signature Move startup (`progress < 0.38`).
 * Cancels their move and refunds 50% of the spent meter so 50% remains consumed.
 */
export function interruptSpecialStartup(target) {
  const atk = target?.attack;
  if (!atk || !atk.special) return false;
  const duration = Math.max(atk.duration || 0, 0.001);
  const progress = (atk.age || 0) / duration;
  if (progress >= SPECIAL_FRAME_DATA.startupEnd) return false;
  target.attack = null;
  target.blocking = false;
  target.blockTimer = 0;
  addSuperMeter(target, SPECIAL_FRAME_DATA.startupInterruptRefund);
  return true;
}

/**
 * Compute Signature Move final damage with Standing Guard block chip (~4%),
 * mid-air juggle scaling (60%), and Counter-Hit bonus (1.25x, guard-breaking).
 */
export function computeSpecialDamage(baseDamage, { blocked = false, counterHit = false, targetAirborne = false } = {}) {
  if (blocked && !counterHit) {
    return SPECIAL_FRAME_DATA.blockChipDamage;
  }
  let dmg = baseDamage;
  if (targetAirborne) dmg *= SPECIAL_FRAME_DATA.juggleDamageScale;
  if (counterHit) dmg *= 1.25;
  return dmg;
}

export function classifyAttackMeterGain(attack) {
  if (!attack || attack.special) return 0;
  if (typeof attack.meterGain === "number") return attack.meterGain;
  if (attack.kind === "launcher" || attack.launch) return METER_GAIN.launcher;
  if (
    attack.kind === "heavy" ||
    attack.kind === "combo-finisher" ||
    attack.kind === "axe-kick" ||
    attack.limb === "rightPunch" ||
    attack.limb === "rightKick"
  ) {
    return METER_GAIN.heavy;
  }
  return METER_GAIN.light;
}

/**
 * Resolve Super Meter ("APPROVAZIONE / CONSENSO") gains for both combatants on hit/block/parry:
 * - Light strike (U, J): +8%
 * - Heavy strike (I, K) or Launcher (S+I): +14%
 * - Block / Counter-Hit / Parry: +12%
 * - Taking unblocked damage: +6%
 */
export function applyCombatMeter(attacker, target, { attack = null, blocked = false, counterHit = false } = {}) {
  let attackerGain = 0;
  let targetGain = 0;

  if (blocked) {
    targetGain = METER_GAIN.block;
    addSuperMeter(target, targetGain);
    return { attackerGain, targetGain };
  }

  targetGain = METER_GAIN.damage;
  addSuperMeter(target, targetGain);

  if (attacker && attack && !attack.special) {
    attackerGain = classifyAttackMeterGain(attack) + (counterHit ? METER_GAIN.counter : 0);
    addSuperMeter(attacker, attackerGain);
  } else if (attacker && counterHit) {
    attackerGain = METER_GAIN.counter;
    addSuperMeter(attacker, attackerGain);
  }

  return { attackerGain, targetGain };
}
