const test = require("node:test");
const assert = require("node:assert/strict");
const { sortTargets } = require("../src/shared/testable-logic");

test("all sort prioritizes Okay before Hospital/Traveling", () => {
  const now = 1_700_000_000;
  const targets = [
    { id: 1, name: "HospLong", status: "Hospital", hospitalUntil: now + 3600 },
    { id: 2, name: "Travel", status: "Traveling", travelTimeLeft: 120 },
    { id: 3, name: "OkayRecent", status: "Okay", lastActionSeconds: 30 },
    { id: 4, name: "OkayOld", status: "Okay", lastActionSeconds: 300 },
    { id: 5, name: "HospSoon", status: "Hospital", hospitalUntil: now + 60 }
  ];
  const sorted = sortTargets(targets, "all", now);
  assert.deepEqual(sorted.map((t) => t.id), [3, 4, 5, 2, 1]);
});

test("hospital sort orders by time remaining ascending", () => {
  const now = 1_700_000_000;
  const targets = [
    { id: 1, status: "Hospital", hospitalUntil: now + 600 },
    { id: 2, status: "Hospital", hospitalUntil: now + 60 },
    { id: 3, status: "Hospital", hospitalUntil: now + 120 }
  ];
  const sorted = sortTargets(targets, "hospital", now);
  assert.deepEqual(sorted.map((t) => t.id), [2, 3, 1]);
});

test("okay sort orders by most recent last action", () => {
  const targets = [
    { id: 1, status: "Okay", lastActionSeconds: 500 },
    { id: 2, status: "Okay", lastActionSeconds: 10 },
    { id: 3, status: "Okay", lastActionSeconds: 60 }
  ];
  const sorted = sortTargets(targets, "okay", 0);
  assert.deepEqual(sorted.map((t) => t.id), [2, 3, 1]);
});

test("abroad sort groups alphabetically then activity", () => {
  const targets = [
    { id: 1, status: "Abroad", travelDestination: "Japan", lastActionSeconds: 200 },
    { id: 2, status: "Abroad", travelDestination: "Argentina", lastActionSeconds: 100 },
    { id: 3, status: "Abroad", travelDestination: "Japan", lastActionSeconds: 50 }
  ];
  const sorted = sortTargets(targets, "abroad", 0);
  assert.deepEqual(sorted.map((t) => t.id), [2, 3, 1]);
});
