const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDuration, hospitalRemaining, timerBand } = require("../src/shared/testable-logic");

test("formatDuration formats mm:ss for under an hour", () => {
  assert.equal(formatDuration(65), "01:05");
});

test("formatDuration formats hh:mm:ss for an hour or more", () => {
  assert.equal(formatDuration(3661), "01:01:01");
});

test("hospitalRemaining clamps at zero", () => {
  const now = 1000;
  assert.equal(hospitalRemaining({ hospitalUntil: 900 }, now), 0);
  assert.equal(hospitalRemaining({ hospitalUntil: 1100 }, now), 100);
});

test("timerBand categorizes hospital countdown windows", () => {
  const now = 1000;
  assert.equal(timerBand({ status: "Hospital", hospitalUntil: now + 120 }, now), "soon");
  assert.equal(timerBand({ status: "Hospital", hospitalUntil: now + 900 }, now), "warm");
  assert.equal(timerBand({ status: "Hospital", hospitalUntil: now + 3600 }, now), "dim");
  assert.equal(timerBand({ status: "Okay" }, now), "none");
});
