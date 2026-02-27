const test = require("node:test");
const assert = require("node:assert/strict");
const { createPoller } = require("../src/background/poller");

function makePollerHarness(overrides = {}) {
  const writes = [];
  const broadcasts = [];
  const store = {
    warData: overrides.warData || null,
    settings: overrides.settings || { pollIntervalSeconds: 30 }
  };
  const g = async (keyOrKeys) => {
    const map = { warData: store.warData, settings: store.settings };
    if (Array.isArray(keyOrKeys)) {
      const out = {};
      for (const k of keyOrKeys) out[k] = map[k];
      return out;
    }
    return { [keyOrKeys]: map[keyOrKeys] };
  };
  const s = async (obj) => {
    writes.push(obj);
    if (obj.warData) store.warData = obj.warData;
  };
  const patchWar = async (patch) => {
    store.warData = { ...(store.warData || {}), ...patch };
  };
  const broadcast = async (type) => broadcasts.push(type);
  const constants = {
    STORAGE_KEYS: { WAR_DATA: "warData", SETTINGS: "settings" },
    DEFAULT_SETTINGS: { pollIntervalSeconds: 30 },
    MESSAGE_TYPES: { WAR_DATA_UPDATED: "WAR_DATA_UPDATED" }
  };
  const utils = {
    normalizeTarget(raw) { return raw; },
    toUnixSeconds() { return 5000; },
    parseRelativeLastAction() { return 12; }
  };
  const logic = { tierForTarget: overrides.tierForTarget || ((t) => t._tier || { interval: 30, priority: 1 }) };
  const scheduler = overrides.scheduler || {
    computeBatchBudget: () => 10,
    selectDueTargets: (targets, now, tierFn) =>
      targets.map((t) => ({ t, tier: tierFn(t, now) })).slice(0, 10)
  };
  const api = overrides.api || {
    fetchUserProfile: async (id) => ({ id, name: `P${id}`, status: "Okay", lastAction: "1 minute ago" })
  };
  const poller = createPoller({ constants, storageGet: g, storageSet: s, api, logic, scheduler, utils, patchWar, broadcast });
  return { poller, store, writes, broadcasts };
}

test("poller no-ops when war is not active", async () => {
  const h = makePollerHarness({ warData: { status: "no_active_war", targets: {} } });
  await h.poller.pollBatch();
  assert.equal(h.writes.length, 0);
  assert.equal(h.broadcasts.length, 0);
});

test("poller updates lastUpdated/countdown when no targets are due", async () => {
  const h = makePollerHarness({
    warData: { status: "active_war", targets: { "1": { id: 1, name: "A", status: "Okay" } } },
    scheduler: {
      computeBatchBudget: () => 10,
      selectDueTargets: () => []
    }
  });
  await h.poller.pollBatch();
  assert.equal(h.store.warData.lastUpdated, 5000);
  assert.equal(h.store.warData.pollCountdownSeconds, 30);
});

test("poller fetches target profiles and writes updated target cache", async () => {
  const h = makePollerHarness({
    warData: {
      status: "active_war",
      targets: {
        "101": { id: 101, name: "Alpha", status: "Hospital", _tier: { interval: 30, priority: 5 } },
        "102": { id: 102, name: "Bravo", status: "Okay", _tier: { interval: 30, priority: 4 } }
      }
    },
    api: {
      fetchUserProfile: async (id) => ({
        id,
        name: `User${id}`,
        status: "Okay",
        lastAction: "Online",
        lastActionSeconds: 0
      })
    },
    utils: {
      normalizeTarget(raw) { return raw; },
      toUnixSeconds() { return 5000; },
      parseRelativeLastAction() { return 0; }
    }
  });
  await h.poller.pollBatch();
  assert.equal(h.store.warData.lastUpdated, 5000);
  assert.equal(h.store.warData.targets["101"].name, "User101");
  assert.equal(h.store.warData.targets["102"].name, "User102");
  assert.deepEqual(h.broadcasts, ["WAR_DATA_UPDATED"]);
});

test("poller preserves target and marks error when fetch fails", async () => {
  const h = makePollerHarness({
    warData: {
      status: "active_war",
      targets: { "101": { id: 101, name: "Alpha", status: "Okay", _tier: { interval: 30, priority: 5 } } }
    },
    api: {
      fetchUserProfile: async () => {
        throw new Error("fetch failed");
      }
    }
  });
  await h.poller.pollBatch();
  assert.equal(h.store.warData.targets["101"].name, "Alpha");
  assert.match(h.store.warData.targets["101"].error, /fetch failed/);
});
