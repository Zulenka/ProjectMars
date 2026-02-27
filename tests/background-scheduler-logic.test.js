const test = require("node:test");
const assert = require("node:assert/strict");
const {
  pruneTimestamps,
  canMakeRequest,
  computeBatchBudget,
  selectDueTargets
} = require("../src/background/scheduler-logic");

test("pruneTimestamps removes entries older than window", () => {
  const now = 100_000;
  const out = pruneTimestamps([10_000, 40_000, 50_001, 99_000], now, 60_000);
  assert.deepEqual(out, [40_000, 50_001, 99_000]);
});

test("canMakeRequest enforces per-minute limit after pruning", () => {
  const now = 100_000;
  const recent = Array.from({ length: 90 }, (_, i) => now - i);
  assert.equal(canMakeRequest(recent, now, 90), false);
  assert.equal(canMakeRequest(recent.slice(0, 89), now, 90), true);
  const withOld = recent.concat([1]); // old entry pruned
  assert.equal(canMakeRequest(withOld.slice(0, 89).concat([1]), now, 90), true);
});

test("computeBatchBudget respects poll interval and minimum floor", () => {
  assert.equal(computeBatchBudget(30, 90), 45);
  assert.equal(computeBatchBudget(60, 90), 90);
  assert.equal(computeBatchBudget(120, 90), 180);
  assert.equal(computeBatchBudget(10, 90), 45); // clamped to 30s
  assert.equal(computeBatchBudget(30, 3), 4); // min floor
});

test("selectDueTargets prioritizes by tier priority then oldest poll", () => {
  const now = 1000;
  const tierForTarget = (t) => t._tier;
  const targets = [
    { id: 1, lastPolled: 980, _tier: { interval: 30, priority: 5 } }, // not due
    { id: 2, lastPolled: 900, _tier: { interval: 30, priority: 5 } }, // due high
    { id: 3, lastPolled: 100, _tier: { interval: 120, priority: 1 } }, // due low
    { id: 4, lastPolled: 800, _tier: { interval: 60, priority: 3 } }, // due med
    { id: 5, lastPolled: 850, _tier: { interval: 60, priority: 3 } }  // due med older/newer ordering
  ];
  const batch = selectDueTargets(targets, now, tierForTarget, 3);
  assert.deepEqual(batch.map((x) => x.t.id), [2, 4, 5]);
});

test("selectDueTargets includes never-polled targets", () => {
  const now = 1000;
  const tierForTarget = () => ({ interval: 120, priority: 1 });
  const batch = selectDueTargets([{ id: 10, lastPolled: 0 }, { id: 11 }], now, tierForTarget, 5);
  assert.deepEqual(batch.map((x) => x.t.id), [10, 11]);
});
