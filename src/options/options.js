(function () {
  const MSG = {
    GET_STATE: "GET_STATE",
    VALIDATE_API_KEY: "VALIDATE_API_KEY",
    SETTINGS_UPDATED: "SETTINGS_UPDATED",
    RESET_EXTENSION_DATA: "RESET_EXTENSION_DATA"
  };
  const MARS_CUSTOM_KEY_URL =
    "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=MARS%20War%20Tracker&user=basic,profile&faction=basic";
  const ACCESS_TIER_LABELS = {
    1: "Public",
    2: "Minimal",
    3: "Limited",
    4: "Full"
  };
  const D = {
    pollIntervalSeconds: 30, maxVisibleTargets: 15, panelPosition: "right", defaultSort: "all",
    showLastAction: true, showLifeBar: true, flashOnOkay: true, soundAlerts: false,
    panelWidth: 320, panelSizeLocked: false
  };
  const q = (id) => document.getElementById(id);
  const apiKey = q("apiKey"), validateBtn = q("validateBtn"), apiStatus = q("apiStatus");
  const saveBtn = q("saveSettingsBtn"), settingsStatus = q("settingsStatus");
  const poll = q("pollIntervalSeconds"), pollValue = q("pollIntervalValue");
  const importSettingsFile = q("importSettingsFile");

  document.addEventListener("DOMContentLoaded", init);
  validateBtn.addEventListener("click", validateAndSave);
  saveBtn.addEventListener("click", () => saveSettings());
  q("openCustomKeyBtn").addEventListener("click", () => {
    window.open(MARS_CUSTOM_KEY_URL, "_blank", "noopener");
  });
  q("copyCustomKeyLinkBtn").addEventListener("click", copyBuilderLink);
  q("openApiDocsBtn").addEventListener("click", () => {
    window.open("https://www.torn.com/api.html#", "_blank", "noopener");
  });
  poll.addEventListener("input", () => pollValue.textContent = `${poll.value}s`);
  q("resetPositionBtn").addEventListener("click", () => saveSettings({ panelOffsetTop: null, panelOffsetLeft: null }));
  q("clearDataBtn").addEventListener("click", async () => {
    await chrome.storage.local.remove("warData");
    setStatus(settingsStatus, "Cleared cached war data.", "success");
  });
  q("exportSettingsBtn").addEventListener("click", exportSettingsJson);
  importSettingsFile.addEventListener("change", importSettingsJson);
  q("clearAllDataBtn").addEventListener("click", clearAllExtensionData);

  async function init() {
    const state = await chrome.runtime.sendMessage({ type: MSG.GET_STATE });
    const s = { ...D, ...(state?.settings || {}) };
    poll.value = String(s.pollIntervalSeconds);
    pollValue.textContent = `${s.pollIntervalSeconds}s`;
    q("maxVisibleTargets").value = String(s.maxVisibleTargets);
    q("panelPosition").value = s.panelPosition;
    q("defaultSort").value = s.defaultSort;
    q("showLastAction").checked = !!s.showLastAction;
    q("showLifeBar").checked = !!s.showLifeBar;
    q("flashOnOkay").checked = !!s.flashOnOkay;
    q("soundAlerts").checked = !!s.soundAlerts;
    setStatus(apiStatus, state?.hasApiKey ? "API key saved (hidden)." : "No key saved.");
  }

  async function validateAndSave() {
    const value = apiKey.value.trim();
    if (!value) return setStatus(apiStatus, "Enter an API key.", "error");
    validateBtn.disabled = true;
    setStatus(apiStatus, "Validating...");
    try {
      const res = await chrome.runtime.sendMessage({ type: MSG.VALIDATE_API_KEY, apiKey: value, persist: true });
      if (res?.ok) {
        const tierName = ACCESS_TIER_LABELS[res.accessLevel] || null;
        const lvl = res.accessLevel
          ? ` Access level: ${res.accessLevel}${tierName ? ` (${tierName})` : ""}.`
          : "";
        const warn = res.accessLevel && res.accessLevel < 3
          ? " MARS works best with a Limited or Full key."
          : "";
        const checks = Array.isArray(res.checks) && res.checks.length
          ? ` Checks: ${res.checks.map((c) => {
              const base = `${c.name}=${c.ok ? "ok" : "fail"}`;
              return c.ok || !c.message ? base : `${base} (${c.message})`;
            }).join(", ")}.`
          : "";
        setStatus(apiStatus, `Valid key for ${res.name || "player"} [${res.playerId || "?"}].${lvl}${warn}${checks}`, "success");
        apiKey.value = "";
      } else {
        setStatus(apiStatus, res?.message || "Validation failed.", "error");
      }
    } catch (e) {
      setStatus(apiStatus, e.message || "Validation failed.", "error");
    } finally {
      validateBtn.disabled = false;
    }
  }

  async function saveSettings(extra) {
    const patch = extra || {
      pollIntervalSeconds: Number(poll.value),
      maxVisibleTargets: Number(q("maxVisibleTargets").value),
      panelPosition: q("panelPosition").value,
      defaultSort: q("defaultSort").value,
      showLastAction: q("showLastAction").checked,
      showLifeBar: q("showLifeBar").checked,
      flashOnOkay: q("flashOnOkay").checked,
      soundAlerts: q("soundAlerts").checked
    };
    try {
      const res = await chrome.runtime.sendMessage({ type: MSG.SETTINGS_UPDATED, settings: patch });
      setStatus(settingsStatus, res?.ok ? "Settings saved." : "Failed to save settings.", res?.ok ? "success" : "error");
    } catch (e) {
      setStatus(settingsStatus, e.message || "Failed to save settings.", "error");
    }
  }

  async function copyBuilderLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(MARS_CUSTOM_KEY_URL);
        setStatus(apiStatus, "Copied MARS custom-key builder link.", "success");
      } else {
        setStatus(apiStatus, "Clipboard API unavailable. Use 'Generate MARS Custom Key'.", "error");
      }
    } catch (e) {
      setStatus(apiStatus, e.message || "Failed to copy builder link.", "error");
    }
  }

  async function exportSettingsJson() {
    try {
      const state = await chrome.runtime.sendMessage({ type: MSG.GET_STATE });
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "MARS War Tracker",
        version: 1,
        settings: normalizeImportedSettings(state?.settings || D)
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mars-settings.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus(settingsStatus, "Settings exported.", "success");
    } catch (e) {
      setStatus(settingsStatus, e.message || "Failed to export settings.", "error");
    }
  }

  async function importSettingsJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = normalizeImportedSettings(parsed?.settings || parsed);
      applySettingsToForm(imported);
      await saveSettings(imported);
      setStatus(settingsStatus, "Settings imported and applied.", "success");
    } catch (e) {
      setStatus(settingsStatus, e.message || "Failed to import settings JSON.", "error");
    } finally {
      importSettingsFile.value = "";
    }
  }

  async function clearAllExtensionData() {
    const ok = window.confirm("Clear API key, settings, cached war data, and panel state?");
    if (!ok) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: MSG.RESET_EXTENSION_DATA });
      if (!res?.ok) throw new Error("Reset failed");
      await init();
      setStatus(apiStatus, "API key removed. Extension data reset.", "success");
      setStatus(settingsStatus, "All extension data cleared and defaults restored.", "success");
    } catch (e) {
      setStatus(settingsStatus, e.message || "Failed to clear extension data.", "error");
    }
  }

  function applySettingsToForm(s) {
    poll.value = String(s.pollIntervalSeconds);
    pollValue.textContent = `${s.pollIntervalSeconds}s`;
    q("maxVisibleTargets").value = String(s.maxVisibleTargets);
    q("panelPosition").value = s.panelPosition;
    q("defaultSort").value = s.defaultSort;
    q("showLastAction").checked = !!s.showLastAction;
    q("showLifeBar").checked = !!s.showLifeBar;
    q("flashOnOkay").checked = !!s.flashOnOkay;
    q("soundAlerts").checked = !!s.soundAlerts;
  }

  function normalizeImportedSettings(input) {
    const s = { ...D, ...(input || {}) };
    const allowedSort = new Set(["all", "okay", "hospital", "traveling", "abroad"]);
    const allowedSide = new Set(["left", "right"]);
    s.pollIntervalSeconds = clampInt(s.pollIntervalSeconds, 30, 120, D.pollIntervalSeconds, 30);
    s.maxVisibleTargets = clampInt(s.maxVisibleTargets, 5, 30, D.maxVisibleTargets, 1);
    s.panelPosition = allowedSide.has(s.panelPosition) ? s.panelPosition : D.panelPosition;
    s.defaultSort = allowedSort.has(s.defaultSort) ? s.defaultSort : D.defaultSort;
    s.showLastAction = !!s.showLastAction;
    s.showLifeBar = !!s.showLifeBar;
    s.flashOnOkay = !!s.flashOnOkay;
    s.soundAlerts = !!s.soundAlerts;
    s.panelWidth = clampInt(s.panelWidth, 280, 560, D.panelWidth, 1);
    s.panelSizeLocked = !!s.panelSizeLocked;
    s.panelOffsetTop = Number.isFinite(Number(s.panelOffsetTop)) ? Number(s.panelOffsetTop) : null;
    s.panelOffsetLeft = Number.isFinite(Number(s.panelOffsetLeft)) ? Number(s.panelOffsetLeft) : null;
    return s;
  }

  function clampInt(value, min, max, fallback, step) {
    let n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) n = fallback;
    n = Math.max(min, Math.min(max, n));
    if (step && step > 1) n = Math.round(n / step) * step;
    n = Math.max(min, Math.min(max, n));
    return n;
  }

  function setStatus(node, text, kind) {
    node.textContent = text;
    node.className = `status${kind ? ` ${kind}` : ""}`;
  }
})();
