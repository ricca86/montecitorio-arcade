const opponentOrder = ["bonelli", "calenda", "tajani", "renzi", "salvini", "schlein", "conte", "meloni"];

export class TournamentManager {
  constructor(playerId) {
    if (!opponentOrder.includes(playerId)) throw new Error(`Unknown fighter: ${playerId}`);
    this.playerId = playerId;
    this.ladder = [...opponentOrder.filter((id) => id !== playerId), playerId === "meloni" ? "schlein" : "meloni"];
    this.currentStage = 0;
    this.roundWins = { player: 0, cpu: 0 };
    this.totalScore = 0;
    this.winStreak = 0;
  }

  get opponentId() {
    return this.ladder[this.currentStage];
  }

  get roundLabel() {
    const round = this.roundWins.player + this.roundWins.cpu + 1;
    return round === 3 ? "FINAL ROUND" : `ROUND ${round}`;
  }

  recordRound(winner, health = 0) {
    if (winner !== "player" && winner !== "cpu") throw new Error(`Invalid round winner: ${winner}`);
    this.roundWins[winner] += 1;
    if (winner === "player") {
      this.winStreak += 1;
      this.totalScore += 1000 + Math.round(health * 10);
    } else {
      this.winStreak = 0;
    }
    if (this.roundWins[winner] < 2) return "round";
    if (winner === "cpu") return "continue";
    if (this.currentStage === this.ladder.length - 1) return "champion";
    this.currentStage += 1;
    this.roundWins = { player: 0, cpu: 0 };
    return "stage";
  }

  retry() {
    this.roundWins = { player: 0, cpu: 0 };
    this.totalScore = 0;
    this.winStreak = 0;
  }
}

export function difficultyForStage(stage) {
  if (!Number.isInteger(stage) || stage < 0 || stage > 7) throw new RangeError(`Invalid stage: ${stage}`);
  if (stage < 2) return { reaction: 0.16, block: 0.08, sidestep: 0.03, speed: 0.7, combo: 1, launcher: 0, special: 0, damage: 1, health: 100 };
  if (stage < 5) return { reaction: 0.065, block: 0.4, sidestep: 0.12, speed: 1, combo: 2, launcher: 0.18, special: 0, damage: 1, health: 100 };
  if (stage < 7) return { reaction: 0.025, block: 0.5, sidestep: 0.32, speed: 1.25, combo: 2, launcher: 0.35, special: 0.25, damage: 1, health: 100 };
  return { reaction: 0.015, block: 0.55, sidestep: 0.4, speed: 1.4, combo: 3, launcher: 0.45, special: 0.35, damage: 1.2, health: 120 };
}

export function formatTournamentTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = seconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return hours ? `${hours}:${clock}` : clock;
}
