(function (global) {
  function obfuscateKey(key) {
    return key ? btoa(key).split("").reverse().join("") : "";
  }
  function deobfuscateKey(value) {
    if (!value) return "";
    try {
      return atob(value.split("").reverse().join(""));
    } catch {
      return "";
    }
  }
  function safeInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function toUnixSeconds(ms) {
    return Math.floor((ms || Date.now()) / 1000);
  }
  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function parseRelativeLastAction(relative) {
    if (!relative || typeof relative !== "string") return Infinity;
    const lower = relative.toLowerCase();
    if (lower.includes("online")) return 0;
    const m = lower.match(/(\d+)\s+(second|minute|hour|day)/);
    if (!m) return Infinity;
    const n = Number(m[1]);
    if (m[2].startsWith("second")) return n;
    if (m[2].startsWith("minute")) return n * 60;
    if (m[2].startsWith("hour")) return n * 3600;
    return n * 86400;
  }
  function normalizeTarget(raw) {
    const status = raw?.status || {};
    const travel = raw?.travel || {};
    const life = raw?.life || {};
    const state = String(status.state || raw.status || "Unknown");
    return {
      id: safeInt(raw?.id || raw?.player_id),
      name: String(raw?.name || "Unknown"),
      status: state,
      statusDescription: String(status.description || raw.statusDescription || ""),
      hospitalUntil: safeInt(status.until || raw.hospitalUntil, 0),
      travelDestination: travel.destination || raw.travelDestination || null,
      travelTimeLeft: safeInt(travel.time_left || raw.travelTimeLeft, 0),
      lastAction: raw?.last_action?.relative || raw.lastAction || "Unknown",
      lifeCurrent: safeInt(life.current || raw.lifeCurrent, 0),
      lifeMax: safeInt(life.maximum || raw.lifeMax, 0),
      isAbroad: state === "Abroad",
      isTraveling: state === "Traveling"
    };
  }
  global.MARS_UTILS = {
    obfuscateKey,
    deobfuscateKey,
    safeInt,
    clamp,
    toUnixSeconds,
    formatDuration,
    parseRelativeLastAction,
    normalizeTarget
  };
})(typeof self !== "undefined" ? self : window);
