function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function hospitalRemaining(target, nowUnix) {
  return Math.max(0, (target?.hospitalUntil || 0) - nowUnix);
}

function timerBand(target, nowUnix) {
  if (!target || target.status !== "Hospital") return "none";
  const rem = hospitalRemaining(target, nowUnix);
  if (rem < 300) return "soon";
  if (rem < 1800) return "warm";
  return "dim";
}

function normalizeSettings(input) {
  const defaults = {
    pollIntervalSeconds: 30,
    maxVisibleTargets: 15,
    panelPosition: "right",
    defaultSort: "all",
    showLastAction: true,
    showLifeBar: true,
    flashOnOkay: true,
    soundAlerts: false,
    panelWidth: 320,
    panelOffsetTop: null,
    panelOffsetLeft: null
  };
  const allowedSort = new Set(["all", "okay", "hospital", "traveling", "abroad"]);
  const allowedSide = new Set(["left", "right"]);
  const s = { ...defaults, ...(input || {}) };
  s.pollIntervalSeconds = normalizeInt(s.pollIntervalSeconds, 30, 120, defaults.pollIntervalSeconds, 30);
  s.maxVisibleTargets = normalizeInt(s.maxVisibleTargets, 5, 30, defaults.maxVisibleTargets, 1);
  s.panelPosition = allowedSide.has(s.panelPosition) ? s.panelPosition : defaults.panelPosition;
  s.defaultSort = allowedSort.has(s.defaultSort) ? s.defaultSort : defaults.defaultSort;
  s.showLastAction = !!s.showLastAction;
  s.showLifeBar = !!s.showLifeBar;
  s.flashOnOkay = !!s.flashOnOkay;
  s.soundAlerts = !!s.soundAlerts;
  s.panelWidth = normalizeInt(s.panelWidth, 280, 560, defaults.panelWidth, 1);
  s.panelOffsetTop = Number.isFinite(Number(s.panelOffsetTop)) ? Number(s.panelOffsetTop) : null;
  s.panelOffsetLeft = Number.isFinite(Number(s.panelOffsetLeft)) ? Number(s.panelOffsetLeft) : null;
  return s;
}

function normalizeInt(value, min, max, fallback, step) {
  let n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) n = fallback;
  n = clamp(n, min, max);
  if (step && step > 1) n = Math.round(n / step) * step;
  return clamp(n, min, max);
}

function sortTargets(targets, mode, nowUnix) {
  const activeMode = mode || "all";
  const list = (targets || []).filter((t) => {
    if (activeMode === "all") return true;
    return String(t.status || "").toLowerCase() === activeMode;
  });
  const lastScore = (t) => Number.isFinite(t.lastActionSeconds) ? t.lastActionSeconds : Infinity;
  const hosp = (t) => hospitalRemaining(t, nowUnix);
  const travel = (t) => t.travelTimeLeft || Infinity;
  const rank = (t) => {
    if (t.status === "Okay") return 0;
    if (t.status === "Hospital") return hosp(t) < 300 ? 1 : hosp(t) < 1800 ? 2 : 4;
    if (t.status === "Traveling") return 3;
    if (t.status === "Abroad") return 5;
    if (t.status === "Jail") return 6;
    if (t.status === "Federal") return 7;
    return 8;
  };
  list.sort((a, b) => {
    if (activeMode === "hospital") return hosp(a) - hosp(b);
    if (activeMode === "traveling") return travel(a) - travel(b);
    if (activeMode === "abroad") {
      return String(a.travelDestination || "").localeCompare(String(b.travelDestination || ""))
        || (lastScore(a) - lastScore(b));
    }
    if (activeMode === "okay") return lastScore(a) - lastScore(b);
    return (rank(a) - rank(b))
      || (a.status === "Okay" ? (lastScore(a) - lastScore(b)) : 0)
      || (a.status === "Hospital" ? (hosp(a) - hosp(b)) : 0)
      || (a.status === "Traveling" ? (travel(a) - travel(b)) : 0)
      || String(a.name || "").localeCompare(String(b.name || ""));
  });
  return list;
}

module.exports = {
  clamp,
  formatDuration,
  parseRelativeLastAction,
  hospitalRemaining,
  timerBand,
  normalizeSettings,
  sortTargets
};
