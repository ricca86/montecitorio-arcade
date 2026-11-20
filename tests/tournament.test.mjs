import assert from "node:assert/strict";
import test from "node:test";
import { fighters } from "../fighters.js";
import { TournamentManager, difficultyForStage, formatTournamentTime } from "../tournament.js";

test("each fighter faces every rival before the selected final boss", () => {
  for (const fighter of fighters) {
    const tournament = new TournamentManager(fighter.id);
    assert.equal(tournament.ladder.length, 8);
    assert.equal(new Set(tournament.ladder.slice(0, 7)).size, 7);
    assert.ok(!tournament.ladder.slice(0, 7).includes(fighter.id));
    assert.equal(tournament.ladder[7], fighter.id === "meloni" ? "schlein" : "meloni");
  }
});

test("best of three, score, streak, retry and champion progression", () => {
  const tournament = new TournamentManager("meloni");
  assert.equal(tournament.roundLabel, "ROUND 1");
  assert.equal(tournament.recordRound("player", 50), "round");
  assert.equal(tournament.totalScore, 1500);
  assert.equal(tournament.roundLabel, "ROUND 2");
  assert.equal(tournament.recordRound("cpu"), "round");
  assert.equal(tournament.roundLabel, "FINAL ROUND");
  assert.equal(tournament.winStreak, 0);
  assert.equal(tournament.recordRound("player", 100), "stage");
  assert.equal(tournament.currentStage, 1);
  assert.deepEqual(tournament.roundWins, { player: 0, cpu: 0 });
  assert.equal(tournament.recordRound("cpu"), "round");
  assert.equal(tournament.recordRound("cpu"), "continue");
  tournament.retry();
  assert.equal(tournament.currentStage, 1);
  assert.equal(tournament.totalScore, 0);
  assert.equal(tournament.winStreak, 0);
  assert.deepEqual(tournament.roundWins, { player: 0, cpu: 0 });
  for (let stage = 1; stage < 8; stage += 1) {
    assert.equal(tournament.recordRound("player", 100), "round");
    assert.equal(tournament.recordRound("player", 100), stage === 7 ? "champion" : "stage");
  }
  assert.equal(tournament.currentStage, 7);
});

test("stage difficulty escalates and boss health and damage increase by 20 percent", () => {
  assert.equal(difficultyForStage(0).combo, 1);
  assert.equal(difficultyForStage(2).block, 0.4);
  assert.equal(difficultyForStage(4).combo, 2);
  assert.ok(difficultyForStage(5).launcher > 0);
  assert.ok(difficultyForStage(6).special > 0);
  assert.equal(difficultyForStage(7).health, 120);
  assert.equal(difficultyForStage(7).damage, 1.2);
  assert.equal(difficultyForStage(7).combo, 3);
  assert.throws(() => difficultyForStage(8), RangeError);
});

test("champion time is formatted in minutes and hours", () => {
  assert.equal(formatTournamentTime(0), "00:00");
  assert.equal(formatTournamentTime(125999), "02:05");
  assert.equal(formatTournamentTime(3601000), "1:00:01");
});
