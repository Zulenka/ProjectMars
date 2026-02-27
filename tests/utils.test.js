const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRelativeLastAction, normalizeSettings } = require("../src/shared/testable-logic");

test("parseRelativeLastAction parses common units", () => {
  assert.equal(parseRelativeLastAction("5 seconds ago"), 5);
  assert.equal(parseRelativeLastAction("5 minutes ago"), 300);
  assert.equal(parseRelativeLastAction("2 hours ago"), 7200);
  assert.equal(parseRelativeLastAction("1 day ago"), 86400);
});

test("parseRelativeLastAction returns zero for online", () => {
  assert.equal(parseRelativeLastAction("Online"), 0);
});

test("normalizeSettings clamps and sanitizes values", () => {
  const s = normalizeSettings({
    pollIntervalSeconds: 17,
    maxVisibleTargets: 99,
    panelPosition: "middle",
    defaultSort: "bad",
    showLastAction: 0,
    showLifeBar: "yes",
    panelWidth: 999,
    panelOffsetTop: "12",
    panelOffsetLeft: "nan"
  });
  assert.equal(s.pollIntervalSeconds, 30);
  assert.equal(s.maxVisibleTargets, 30);
  assert.equal(s.panelPosition, "right");
  assert.equal(s.defaultSort, "all");
  assert.equal(s.showLastAction, false);
  assert.equal(s.showLifeBar, true);
  assert.equal(s.panelWidth, 560);
  assert.equal(s.panelOffsetTop, 12);
  assert.equal(s.panelOffsetLeft, null);
});
