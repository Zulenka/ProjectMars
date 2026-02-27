(function (global) {
  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function buildDefaultWarData(defaultSettings) {
    return {
      status: "idle",
      enemyFactionId: null,
      enemyFactionName: null,
      lastUpdated: 0,
      pollCountdownSeconds: (defaultSettings && defaultSettings.pollIntervalSeconds) || 30,
      rateLimited: false,
      targets: {}
    };
  }

  function buildDefaultSession() {
    return { panelHidden: false };
  }

  function normalizeWarData(value, defaultSettings) {
    const base = buildDefaultWarData(defaultSettings);
    if (!isPlainObject(value)) return base;
    const out = { ...base, ...value };
    if (!isPlainObject(out.targets)) out.targets = {};
    if (typeof out.status !== "string") out.status = base.status;
    if (typeof out.enemyFactionName !== "string" && out.enemyFactionName !== null) out.enemyFactionName = null;
    if (!Number.isFinite(Number(out.lastUpdated))) out.lastUpdated = 0;
    if (!Number.isFinite(Number(out.pollCountdownSeconds))) {
      out.pollCountdownSeconds = base.pollCountdownSeconds;
    }
    out.rateLimited = Boolean(out.rateLimited);
    return out;
  }

  function normalizeSession(value) {
    const base = buildDefaultSession();
    if (!isPlainObject(value)) return base;
    return { ...base, panelHidden: Boolean(value.panelHidden) };
  }

  function mergeSettings(defaults, current, patch, utils) {
    const safe = utils || {};
    const clamp = safe.clamp || ((v, min, max) => Math.min(max, Math.max(min, v)));
    const safeInt = safe.safeInt || ((v, fallback) => {
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : (fallback || 0);
    });
    const baseDefaults = { ...(defaults || {}) };
    const merged = { ...baseDefaults };
    const currentObj = (current && typeof current === "object") ? current : {};
    const patchObj = (patch && typeof patch === "object") ? patch : {};
    // Only persist known settings keys to avoid storage pollution from malformed messages/imports.
    for (const key of Object.keys(baseDefaults)) {
      if (Object.prototype.hasOwnProperty.call(currentObj, key)) merged[key] = currentObj[key];
      if (Object.prototype.hasOwnProperty.call(patchObj, key)) merged[key] = patchObj[key];
    }
    merged.pollIntervalSeconds = clamp(safeInt(merged.pollIntervalSeconds, 30), 30, 120);
    merged.maxVisibleTargets = clamp(safeInt(merged.maxVisibleTargets, 15), 5, 30);
    return merged;
  }

  function createStorageApi(chromeApi, constants, utils) {
    const K = constants.STORAGE_KEYS;
    const D = constants.DEFAULT_SETTINGS;
    const store = chromeApi.storage.local;

    return {
      get(keys) {
        return store.get(keys);
      },
      set(obj) {
        return store.set(obj);
      },
      async initDefaults() {
        const cur = await store.get([K.SETTINGS, K.WAR_DATA, K.SESSION]);
        const updates = {};
        if (!isPlainObject(cur[K.SETTINGS])) updates[K.SETTINGS] = mergeSettings(D, {}, {}, utils);
        if (!isPlainObject(cur[K.WAR_DATA])) updates[K.WAR_DATA] = buildDefaultWarData(D);
        if (!isPlainObject(cur[K.SESSION])) updates[K.SESSION] = buildDefaultSession();
        if (Object.keys(updates).length) {
          await store.set(updates);
        }
      },
      mergeAndSaveSettings(current, patch) {
        const next = mergeSettings(D, current, patch, utils);
        return store.set({ [K.SETTINGS]: next }).then(() => next);
      },
      resetAll() {
        return store.clear();
      }
    };
  }

  const api = {
    isPlainObject,
    buildDefaultWarData,
    buildDefaultSession,
    normalizeWarData,
    normalizeSession,
    mergeSettings,
    createStorageApi
  };

  global.MARS_STORAGE = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
