export function attackHeight(attack) {
  return attack.height || (attack.low ? "low" : attack.high === false ? "mid" : "high");
}

export function defenseOutcome(target, attack) {
  if (!attack.unblockable && target.attack?.guard && target.attack.age <= (target.attack.duration || 0.88) * (target.attack.activeEnd || 0.6)) return "block";
  if (target.airborne || target.landingTime > 0) return "hit";
  if (!attack.projectile && !attack.special && target.dodgeTimer > 0) return "sidestep";
  const height = attackHeight(attack);
  if (target.guardMode === "low" && height === "high") return "duck";
  if (!attack.projectile && target.parryTimer > 0 && !attack.unblockable) return "parry";
  if (attack.unblockable) return "hit";
  if (target.guardMode === "low" && height === "low") return "block";
  if ((target.guardMode === "standing" || (!target.guardMode && target.blocking)) && height !== "low") return "block";
  return "hit";
}

export function isCounterHit(target) {
  return Boolean(target.attack && !target.attack.hit && target.attack.age < target.attack.windup);
}
