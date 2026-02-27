(function (global) {
  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function sanitizeSettingsPatch(patch, defaultSettings) {
    if (!isPlainObject(patch)) return null;
    const allowed = new Set(Object.keys(defaultSettings || {}));
    const out = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.has(key)) continue;
      out[key] = value;
    }
    return out;
  }

  function createMessageRouter(deps) {
    const { constants: C, services } = deps;
    const M = C.MESSAGE_TYPES;

    return async function routeMessage(msg) {
      switch (msg?.type) {
        case M.GET_STATE:
          return { ok: true, type: M.STATE_RESPONSE, ...(await services.stateResponse()) };

        case M.VALIDATE_API_KEY: {
          if (typeof msg.apiKey !== "string" || msg.apiKey.length > 256) {
            return { type: M.VALIDATE_API_KEY_RESPONSE, ok: false, message: "Invalid API key payload" };
          }
          const result = await services.validateKey(msg.apiKey);
          if (result.ok && msg.persist) {
            await services.persistApiKey(msg.apiKey.trim());
          }
          return { type: M.VALIDATE_API_KEY_RESPONSE, ...result };
        }

        case M.FORCE_REFRESH:
          await services.forceRefresh();
          return { ok: true };

        case M.SETTINGS_UPDATED: {
          const patch = sanitizeSettingsPatch(msg.settings, C.DEFAULT_SETTINGS);
          if (patch === null) {
            return { ok: false, message: "Invalid settings payload" };
          }
          const settings = await services.saveSettings(patch);
          await services.afterSettingsUpdated();
          return { ok: true, settings };
        }

        case M.PANEL_VISIBILITY_SET: {
          if (typeof msg.hidden !== "boolean") {
            return { ok: false, message: "Invalid visibility payload" };
          }
          await services.setPanelVisibility(msg.hidden);
          return { ok: true };
        }

        case M.RESET_EXTENSION_DATA:
          await services.resetExtensionData();
          return { ok: true };

        default:
          return { ok: false, message: "Unknown message type" };
      }
    };
  }

  const api = { isPlainObject, sanitizeSettingsPatch, createMessageRouter };
  global.MARS_MESSAGE_ROUTER = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
