const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDefaultWarData,
  buildDefaultSession,
  normalizeWarData,
  normalizeSession,
  mergeSettings,
  createStorageApi
} = require("../src/background/storage");

const utils = {
  safeInt(value, fallback = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  },
  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
};

test("buildDefaultWarData uses settings poll interval", () => {
  const war = buildDefaultWarData({ pollIntervalSeconds: 60 });
  assert.equal(war.status, "idle");
  assert.equal(war.pollCountdownSeconds, 60);
  assert.deepEqual(war.targets, {});
});

test("buildDefaultSession returns visible-by-default session", () => {
  assert.deepEqual(buildDefaultSession(), { panelHidden: false });
});

test("normalizeWarData recovers from non-object and malformed fields", () => {
  const base = normalizeWarData("bad", { pollIntervalSeconds: 45 });
  assert.equal(base.status, "idle");
  assert.equal(base.pollCountdownSeconds, 45);
  assert.deepEqual(base.targets, {});

  const out = normalizeWarData({
    status: 9,
    targets: [],
    pollCountdownSeconds: "wat",
    enemyFactionName: 123,
    rateLimited: "yes"
  }, { pollIntervalSeconds: 30 });
  assert.equal(out.status, "idle");
  assert.deepEqual(out.targets, {});
  assert.equal(out.pollCountdownSeconds, 30);
  assert.equal(out.enemyFactionName, null);
  assert.equal(out.rateLimited, true);
});

test("normalizeSession recovers malformed values", () => {
  assert.deepEqual(normalizeSession(null), { panelHidden: false });
  assert.deepEqual(normalizeSession("bad"), { panelHidden: false });
  assert.deepEqual(normalizeSession({ panelHidden: 1 }), { panelHidden: true });
});

test("mergeSettings merges current and patch with clamping", () => {
  const defaults = {
    pollIntervalSeconds: 30,
    maxVisibleTargets: 15,
    panelPosition: "right",
    defaultSort: "all"
  };
  const current = {
    panelPosition: "left",
    maxVisibleTargets: 20
  };
  const patch = {
    pollIntervalSeconds: 500,
    maxVisibleTargets: 2
  };
  const out = mergeSettings(defaults, current, patch, utils);
  assert.equal(out.panelPosition, "left");
  assert.equal(out.pollIntervalSeconds, 120);
  assert.equal(out.maxVisibleTargets, 5);
  assert.equal(out.defaultSort, "all");
});

test("mergeSettings handles non-numeric poll and target values", () => {
  const defaults = { pollIntervalSeconds: 30, maxVisibleTargets: 15 };
  const out = mergeSettings(defaults, {}, { pollIntervalSeconds: "abc", maxVisibleTargets: null }, utils);
  assert.equal(out.pollIntervalSeconds, 30);
  assert.equal(out.maxVisibleTargets, 15);
});

test("createStorageApi.initDefaults repairs malformed stored objects", async () => {
  const storageState = {
    settings: "oops",
    warData: [],
    sessionState: "bad"
  };
  const chromeApi = {
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) out[k] = storageState[k];
            return out;
          }
          return { [keys]: storageState[keys] };
        },
        async set(obj) {
          Object.assign(storageState, obj);
        },
        async clear() {
          for (const k of Object.keys(storageState)) delete storageState[k];
        }
      }
    }
  };
  const constants = {
    STORAGE_KEYS: {
      SETTINGS: "settings",
      WAR_DATA: "warData",
      SESSION: "sessionState"
    },
    DEFAULT_SETTINGS: {
      pollIntervalSeconds: 30,
      maxVisibleTargets: 15,
      panelPosition: "right"
    }
  };

  const api = createStorageApi(chromeApi, constants, utils);
  await api.initDefaults();

  assert.equal(typeof storageState.settings, "object");
  assert.equal(storageState.settings.pollIntervalSeconds, 30);
  assert.equal(typeof storageState.warData, "object");
  assert.deepEqual(storageState.warData.targets, {});
  assert.deepEqual(storageState.sessionState, { panelHidden: false });
});
