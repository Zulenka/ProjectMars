const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ownFactionFromUser,
  enemyFromFactionBasic,
  membersFromFactionBasic,
  tierForTarget
} = require("../src/background/logic");

const safeInt = (v, fallback = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

test("ownFactionFromUser extracts faction id/name with fallbacks", () => {
  const out = ownFactionFromUser({ faction: { faction_id: "123", faction_name: "Mars" } }, safeInt);
  assert.deepEqual(out, { id: 123, name: "Mars" });
});

test("enemyFromFactionBasic prefers ranked war direct enemy", () => {
  const out = enemyFromFactionBasic({
    ranked_war: { enemy_id: 222, enemy_name: "EnemyFaction" }
  }, safeInt);
  assert.deepEqual(out, { id: 222, name: "EnemyFaction" });
});

test("enemyFromFactionBasic falls back to wars object opponent", () => {
  const out = enemyFromFactionBasic({
    wars: {
      "1": { opponent: { faction_id: "333", name: "WarOpp" } }
    }
  }, safeInt);
  assert.deepEqual(out, { id: 333, name: "WarOpp" });
});

test("enemyFromFactionBasic returns null when no enemy found", () => {
  assert.equal(enemyFromFactionBasic({}, safeInt), null);
});

test("membersFromFactionBasic parses object map and filters invalid ids", () => {
  const out = membersFromFactionBasic({
    members: {
      "1001": { name: "Alpha" },
      "0": { name: "Bad" },
      "1002": { player_name: "Bravo" }
    }
  }, safeInt);
  assert.deepEqual(out, [
    { id: 1001, name: "Alpha" },
    { id: 1002, name: "Bravo" }
  ]);
});

test("tierForTarget prioritizes okay and short hospital targets", () => {
  const now = 1000;
  assert.deepEqual(tierForTarget({ status: "Okay" }, now), { interval: 30, priority: 5 });
  assert.deepEqual(tierForTarget({ status: "Hospital", hospitalUntil: now + 120 }, now), { interval: 30, priority: 5 });
  assert.deepEqual(tierForTarget({ status: "Hospital", hospitalUntil: now + 900 }, now), { interval: 60, priority: 4 });
  assert.deepEqual(tierForTarget({ status: "Hospital", hospitalUntil: now + 7200 }, now), { interval: 120, priority: 2 });
  assert.deepEqual(tierForTarget({ status: "Traveling" }, now), { interval: 60, priority: 3 });
  assert.deepEqual(tierForTarget({ status: "Abroad" }, now), { interval: 120, priority: 1 });
});
