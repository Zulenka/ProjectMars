const test = require("node:test");
const assert = require("node:assert/strict");
const { createWarDetector } = require("../src/background/war-detector");

function makeDetectorHarness(overrides = {}) {
  const writes = [];
  const broadcasts = [];
  const store = {
    warData: overrides.initialWarData || {},
    settings: overrides.settings || { pollIntervalSeconds: 30 }
  };
  const g = async (keyOrKeys) => {
    const map = {
      warData: store.warData,
      settings: store.settings
    };
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
    if (obj.settings) store.settings = obj.settings;
  };
  const patchWar = async (patch) => {
    store.warData = { ...(store.warData || {}), ...patch };
  };
  const broadcast = async (type) => {
    broadcasts.push(type);
  };
  const constants = {
    STORAGE_KEYS: { WAR_DATA: "warData", SETTINGS: "settings" },
    DEFAULT_SETTINGS: { pollIntervalSeconds: 30 },
    MESSAGE_TYPES: { WAR_DATA_UPDATED: "WAR_DATA_UPDATED" }
  };
  const utils = {
    safeInt(v, fallback = 0) {
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    },
    toUnixSeconds() {
      return 1111;
    }
  };
  const logicOverrides = overrides.logic || {};
  const logic = {
    ownFactionFromUser: logicOverrides.ownFactionFromUser || overrides.ownFactionFromUser || ((u) => ({ id: u.faction?.id || 0, name: u.faction?.name || null })),
    enemyFromFactionBasic: logicOverrides.enemyFromFactionBasic || overrides.enemyFromFactionBasic || (() => null),
    membersFromFactionBasic: logicOverrides.membersFromFactionBasic || overrides.membersFromFactionBasic || (() => [])
  };
  const api = overrides.api || {
    fetchOwn: async () => ({ faction: { id: 1, name: "Own" } }),
    fetchFactionBasic: async () => ({})
  };
  const detector = createWarDetector({ constants, storageGet: g, storageSet: s, api, logic, utils, patchWar, broadcast });
  return { detector, writes, broadcasts, store };
}

test("war-detector writes missing_key state when no key is present", async () => {
  const h = makeDetectorHarness();
  await h.detector.detectWar(async () => "");
  assert.equal(h.store.warData.status, "missing_key");
  assert.deepEqual(h.broadcasts, ["WAR_DATA_UPDATED"]);
});

test("war-detector sets no_faction when own profile has no faction", async () => {
  const h = makeDetectorHarness({
    api: { fetchOwn: async () => ({}) }
  });
  await h.detector.detectWar(async () => "KEY");
  assert.equal(h.store.warData.status, "no_faction");
  assert.equal(h.store.warData.lastUpdated, 1111);
});

test("war-detector seeds active war targets from enemy roster", async () => {
  const h = makeDetectorHarness({
    initialWarData: {
      targets: {
        "200": { id: 200, name: "Old", status: "Hospital", hospitalUntil: 9999, lastActionSeconds: 20 }
      }
    },
    logic: {
      ownFactionFromUser: () => ({ id: 10, name: "Mars" }),
      enemyFromFactionBasic: () => ({ id: 20, name: "Enemy" }),
      membersFromFactionBasic: () => [{ id: 200, name: "Old" }, { id: 201, name: "New" }]
    },
    api: {
      fetchOwn: async () => ({ ok: true }),
      fetchFactionBasic: async () => ({ ok: true })
    }
  });
  await h.detector.detectWar(async () => "KEY");
  assert.equal(h.store.warData.status, "active_war");
  assert.equal(h.store.warData.enemyFactionId, 20);
  assert.equal(h.store.warData.enemyFactionName, "Enemy");
  assert.deepEqual(Object.keys(h.store.warData.targets).sort(), ["200", "201"]);
  assert.equal(h.store.warData.targets["200"].status, "Hospital");
  assert.equal(h.store.warData.targets["201"].status, "Unknown");
  assert.deepEqual(h.broadcasts, ["WAR_DATA_UPDATED"]);
});

test("war-detector captures error state on API failure", async () => {
  const h = makeDetectorHarness({
    api: {
      fetchOwn: async () => {
        throw new Error("boom");
      }
    }
  });
  await h.detector.detectWar(async () => "KEY");
  assert.equal(h.store.warData.status, "error");
  assert.match(h.store.warData.errorMessage, /boom/);
});
