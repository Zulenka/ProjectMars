const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeSettingsPatch, createMessageRouter } = require("../src/background/message-router");

const C = {
  DEFAULT_SETTINGS: {
    pollIntervalSeconds: 30,
    maxVisibleTargets: 15,
    panelPosition: "right",
    defaultSort: "all"
  },
  MESSAGE_TYPES: {
    GET_STATE: "GET_STATE",
    STATE_RESPONSE: "STATE_RESPONSE",
    VALIDATE_API_KEY: "VALIDATE_API_KEY",
    VALIDATE_API_KEY_RESPONSE: "VALIDATE_API_KEY_RESPONSE",
    FORCE_REFRESH: "FORCE_REFRESH",
    SETTINGS_UPDATED: "SETTINGS_UPDATED",
    PANEL_VISIBILITY_SET: "PANEL_VISIBILITY_SET",
    RESET_EXTENSION_DATA: "RESET_EXTENSION_DATA"
  }
};

test("sanitizeSettingsPatch rejects non-object and strips unknown keys", () => {
  assert.equal(sanitizeSettingsPatch(null, C.DEFAULT_SETTINGS), null);
  assert.equal(sanitizeSettingsPatch([], C.DEFAULT_SETTINGS), null);
  const out = sanitizeSettingsPatch({ pollIntervalSeconds: 60, evil: 1 }, C.DEFAULT_SETTINGS);
  assert.deepEqual(out, { pollIntervalSeconds: 60 });
});

function makeServices() {
  const calls = [];
  return {
    calls,
    stateResponse: async () => ({ state: 1 }),
    validateKey: async (k) => ({ ok: true, message: "ok", keySeen: k }),
    persistApiKey: async (k) => { calls.push(["persistApiKey", k]); },
    forceRefresh: async () => { calls.push(["forceRefresh"]); },
    saveSettings: async (patch) => { calls.push(["saveSettings", patch]); return { ...C.DEFAULT_SETTINGS, ...patch }; },
    afterSettingsUpdated: async () => { calls.push(["afterSettingsUpdated"]); },
    setPanelVisibility: async (hidden) => { calls.push(["setPanelVisibility", hidden]); },
    resetExtensionData: async () => { calls.push(["resetExtensionData"]); }
  };
}

test("router rejects invalid API key payloads", async () => {
  const services = makeServices();
  const route = createMessageRouter({ constants: C, services });
  const res = await route({ type: C.MESSAGE_TYPES.VALIDATE_API_KEY, apiKey: 123 });
  assert.equal(res.ok, false);
  assert.match(res.message, /Invalid API key payload/);
});

test("router validates and persists API key when requested", async () => {
  const services = makeServices();
  const route = createMessageRouter({ constants: C, services });
  const res = await route({ type: C.MESSAGE_TYPES.VALIDATE_API_KEY, apiKey: "KEY", persist: true });
  assert.equal(res.ok, true);
  assert.deepEqual(services.calls, [["persistApiKey", "KEY"]]);
});

test("router rejects invalid settings payload", async () => {
  const services = makeServices();
  const route = createMessageRouter({ constants: C, services });
  const res = await route({ type: C.MESSAGE_TYPES.SETTINGS_UPDATED, settings: "bad" });
  assert.equal(res.ok, false);
  assert.match(res.message, /Invalid settings payload/);
});

test("router saves sanitized settings and runs post-update hook", async () => {
  const services = makeServices();
  const route = createMessageRouter({ constants: C, services });
  const res = await route({
    type: C.MESSAGE_TYPES.SETTINGS_UPDATED,
    settings: { pollIntervalSeconds: 60, evil: true }
  });
  assert.equal(res.ok, true);
  assert.deepEqual(services.calls, [
    ["saveSettings", { pollIntervalSeconds: 60 }],
    ["afterSettingsUpdated"]
  ]);
});

test("router rejects non-boolean panel visibility payload", async () => {
  const services = makeServices();
  const route = createMessageRouter({ constants: C, services });
  const res = await route({ type: C.MESSAGE_TYPES.PANEL_VISIBILITY_SET, hidden: "yes" });
  assert.equal(res.ok, false);
  assert.match(res.message, /Invalid visibility payload/);
});

test("router routes force refresh and reset actions", async () => {
  const services = makeServices();
  const route = createMessageRouter({ constants: C, services });
  const res1 = await route({ type: C.MESSAGE_TYPES.FORCE_REFRESH });
  const res2 = await route({ type: C.MESSAGE_TYPES.RESET_EXTENSION_DATA });
  assert.equal(res1.ok, true);
  assert.equal(res2.ok, true);
  assert.deepEqual(services.calls, [["forceRefresh"], ["resetExtensionData"]]);
});

test("router returns state response shape for GET_STATE", async () => {
  const services = makeServices();
  const route = createMessageRouter({ constants: C, services });
  const res = await route({ type: C.MESSAGE_TYPES.GET_STATE });
  assert.equal(res.ok, true);
  assert.equal(res.type, C.MESSAGE_TYPES.STATE_RESPONSE);
  assert.equal(res.state, 1);
});
