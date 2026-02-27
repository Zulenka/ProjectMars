if (typeof importScripts === "function") {
  importScripts("../shared/compat.js", "../shared/constants.js", "../shared/utils.js", "./storage.js", "./logic.js", "./scheduler-logic.js", "./api.js", "./war-detector.js", "./poller.js", "./message-router.js");
}

(function () {
  const C = self.MARS_CONSTANTS;
  const U = self.MARS_UTILS;
  const ST = self.MARS_STORAGE;
  const L = self.MARS_BACKGROUND_LOGIC;
  const S = self.MARS_SCHEDULER_LOGIC;
  const A = self.MARS_API;
  const WD = self.MARS_WAR_DETECTOR;
  const P = self.MARS_POLLER;
  const MR = self.MARS_MESSAGE_ROUTER;
  const K = C.STORAGE_KEYS;
  const M = C.MESSAGE_TYPES;

  const runtimeState = {
    apiKey: null,
    queue: [],
    running: false,
    timestamps: []
  };

  const storage = ST.createStorageApi(chrome, C, U);
  const g = (keys) => storage.get(keys);
  const s = (obj) => storage.set(obj);

  async function init() {
    await storage.initDefaults();
  }

  function pruneWindow() {
    runtimeState.timestamps = S.pruneTimestamps(runtimeState.timestamps, Date.now(), 60_000);
  }
  function canRequest() {
    pruneWindow();
    return S.canMakeRequest(runtimeState.timestamps, Date.now(), 90);
  }
  function enqueue(fn, priority = 1) {
    return new Promise((resolve, reject) => {
      runtimeState.queue.push({ fn, priority, resolve, reject });
      pump();
    });
  }
  async function pump() {
    if (runtimeState.running) return;
    runtimeState.running = true;
    try {
      while (runtimeState.queue.length) {
        runtimeState.queue.sort((a, b) => b.priority - a.priority);
        if (!canRequest()) {
          await patchWar({ rateLimited: true });
          await delay(1000);
          continue;
        }
        await patchWar({ rateLimited: false });
        const task = runtimeState.queue.shift();
        runtimeState.timestamps.push(Date.now());
        try {
          task.resolve(await task.fn());
        } catch (e) {
          task.reject(e);
        }
      }
    } finally {
      runtimeState.running = false;
    }
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function getApiKey() {
    if (runtimeState.apiKey) return runtimeState.apiKey;
    const data = await g(K.API_KEY_OBF);
    runtimeState.apiKey = U.deobfuscateKey(data[K.API_KEY_OBF]) || null;
    return runtimeState.apiKey;
  }
  async function setApiKey(value) {
    runtimeState.apiKey = value || null;
    await s({ [K.API_KEY_OBF]: U.obfuscateKey(value || "") });
  }

  const api = A.createTornApiClient({
    apiBase: C.API_BASE,
    fetchImpl: fetch,
    getApiKey,
    queueRequest: enqueue
  });

  async function patchWar(patch) {
    const curRaw = (await g(K.WAR_DATA))[K.WAR_DATA];
    const cur = ST.normalizeWarData(curRaw, C.DEFAULT_SETTINGS);
    await s({ [K.WAR_DATA]: { ...cur, ...patch } });
  }

  async function broadcast(type, payload = {}) {
    try {
      await chrome.runtime.sendMessage({ type, ...payload });
    } catch {
      // no listeners
    }
  }
  const warDetector = WD.createWarDetector({
    constants: C,
    storageGet: g,
    storageSet: s,
    api,
    logic: L,
    utils: U,
    patchWar,
    broadcast
  });
  const poller = P.createPoller({
    constants: C,
    storageGet: g,
    storageSet: s,
    api,
    logic: L,
    scheduler: S,
    utils: U,
    patchWar,
    broadcast
  });
  const routeMessage = MR.createMessageRouter({
    constants: C,
    services: {
      stateResponse,
      validateKey,
      async persistApiKey(key) {
        await setApiKey(key);
        await warDetector.detectWar(getApiKey);
      },
      async forceRefresh() {
        await warDetector.detectWar(getApiKey);
        await poller.pollBatch();
      },
      saveSettings,
      async afterSettingsUpdated() {
        await broadcast(M.SETTINGS_UPDATED);
      },
      async setPanelVisibility(hidden) {
        const cur = ST.normalizeSession((await g(K.SESSION))[K.SESSION]);
        await s({ [K.SESSION]: { ...cur, panelHidden: Boolean(hidden) } });
      },
      async resetExtensionData() {
        await storage.resetAll();
        runtimeState.apiKey = null;
        await init();
        await broadcast(M.SETTINGS_UPDATED);
        await broadcast(M.WAR_DATA_UPDATED);
      }
    }
  });

  async function stateResponse() {
    const data = await g([K.SETTINGS, K.WAR_DATA, K.SESSION, K.API_KEY_OBF]);
    const settings = ST.mergeSettings(C.DEFAULT_SETTINGS, data[K.SETTINGS], {}, U);
    return {
      settings,
      warData: ST.normalizeWarData(data[K.WAR_DATA], settings),
      session: ST.normalizeSession(data[K.SESSION]),
      hasApiKey: Boolean(data[K.API_KEY_OBF])
    };
  }

  async function validateKey(candidate) {
    if (!candidate?.trim()) return { ok: false, message: "API key is required" };
    try {
      const key = candidate.trim();
      const data = await api.tornFetch("user", "basic", { key, priority: 10 });
      const checks = [{ name: "user.basic", ok: true }];
      let profileData = null;

      try {
        profileData = await api.tornFetch("user", "profile", { key, priority: 10 });
        checks.push({ name: "user.profile", ok: true });
      } catch (e) {
        checks.push({ name: "user.profile", ok: false, message: e.message || "Failed" });
      }

      let factionCheckPassed = false;
      let factionCheckError = null;
      try {
        // Prefer own-faction endpoint for capability validation.
        await api.tornFetch("faction", "basic", { key, priority: 10 });
        factionCheckPassed = true;
      } catch (e) {
        factionCheckError = e;
      }

      const factionId = U.safeInt(
        data?.faction?.faction_id ||
        data?.faction?.id ||
        profileData?.faction?.faction_id ||
        profileData?.faction?.id,
        0
      );

      if (!factionCheckPassed && factionId > 0) {
        try {
          await api.tornFetch(`faction/${factionId}`, "basic", { key, priority: 10 });
          factionCheckPassed = true;
        } catch (e2) {
          factionCheckError = e2 || factionCheckError;
        }
      }

      if (factionCheckPassed) {
        checks.push({ name: "faction.basic", ok: true });
      } else if (factionId > 0) {
        checks.push({ name: "faction.basic", ok: false, message: factionCheckError?.message || "Failed" });
      } else {
        checks.push({ name: "faction.basic", ok: false, message: factionCheckError?.message || "No faction on account to verify" });
      }

      return {
        ok: true,
        accessLevel: U.safeInt(data?.api?.access || data?.api_access_level, 0),
        name: data.name || null,
        playerId: U.safeInt(data.player_id, 0),
        checks,
        message: "API key validated"
      };
    } catch (e) {
      return { ok: false, message: e.message || "Validation failed" };
    }
  }

  async function saveSettings(patch) {
    const cur = ST.mergeSettings(C.DEFAULT_SETTINGS, (await g(K.SETTINGS))[K.SETTINGS], {}, U);
    const next = await storage.mergeAndSaveSettings(cur, patch || {});
    await scheduleAlarms(next.pollIntervalSeconds);
    return next;
  }

  async function scheduleAlarms(intervalSeconds) {
    const minutes = Math.max(0.5, intervalSeconds / 60);
    await chrome.alarms.clear(C.POLL_ALARM_NAME);
    await chrome.alarms.create(C.POLL_ALARM_NAME, { periodInMinutes: minutes });
    await chrome.alarms.clear(C.WAR_CHECK_ALARM_NAME);
    await chrome.alarms.create(C.WAR_CHECK_ALARM_NAME, { periodInMinutes: 5 });
  }

  chrome.runtime.onInstalled.addListener(async () => {
    await init();
    const settings = ST.mergeSettings(C.DEFAULT_SETTINGS, (await g(K.SETTINGS))[K.SETTINGS], {}, U);
    await scheduleAlarms(settings.pollIntervalSeconds);
    await warDetector.detectWar(getApiKey);
  });
  chrome.runtime.onStartup.addListener(async () => {
    await init();
    const settings = ST.mergeSettings(C.DEFAULT_SETTINGS, (await g(K.SETTINGS))[K.SETTINGS], {}, U);
    await scheduleAlarms(settings.pollIntervalSeconds);
    await warDetector.detectWar(getApiKey);
  });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === C.POLL_ALARM_NAME) await poller.pollBatch();
    if (alarm.name === C.WAR_CHECK_ALARM_NAME) await warDetector.detectWar(getApiKey);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      sendResponse(await routeMessage(msg));
    })();
    return true;
  });
})();
