(function () {
  const MSG = { GET_STATE: "GET_STATE", FORCE_REFRESH: "FORCE_REFRESH" };
  const ATTACK_URL = "https://www.torn.com/loader.php?sid=attack&user2ID=";
  const warStatus = document.getElementById("warStatus");
  const summary = document.getElementById("summary");
  const updatedAt = document.getElementById("updatedAt");
  const targetList = document.getElementById("targetList");
  const refreshBtn = document.getElementById("refreshBtn");
  const openOptions = document.getElementById("openOptions");

  document.addEventListener("DOMContentLoaded", load);
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: MSG.FORCE_REFRESH });
      await load();
    } finally {
      refreshBtn.disabled = false;
    }
  });
  openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

  async function load() {
    const state = await chrome.runtime.sendMessage({ type: MSG.GET_STATE });
    const war = state?.warData;
    if (!war) {
      warStatus.textContent = "Background not ready";
      summary.textContent = "";
      updatedAt.textContent = "";
      targetList.replaceChildren();
      return;
    }
    warStatus.textContent = describe(war);
    const targets = Object.values(war.targets || {});
    const okay = targets.filter((t) => t.status === "Okay").sort((a, b) => (a.lastActionSeconds || Infinity) - (b.lastActionSeconds || Infinity));
    const hospital = targets.filter((t) => t.status === "Hospital").length;
    summary.textContent = `Targets ${targets.length} | Okay ${okay.length} | Hosp ${hospital}`;
    updatedAt.textContent = war.lastUpdated ? `Updated ${new Date(war.lastUpdated * 1000).toLocaleTimeString()}` : "";
    const frag = document.createDocumentFragment();
    if (!okay.length) {
      const n = document.createElement("div");
      n.className = "popup__meta";
      n.textContent = "No attackable targets right now.";
      frag.appendChild(n);
    } else {
      for (const t of okay.slice(0, 10)) {
        const row = document.createElement("div");
        row.className = "popup__row";
        const left = document.createElement("div");
        const name = document.createElement("div");
        name.className = "popup__name";
        name.textContent = `${t.name} [${t.id}]`;
        const meta = document.createElement("div");
        meta.className = "popup__meta";
        meta.textContent = t.lastAction || "Unknown";
        left.append(name, meta);
        const a = document.createElement("a");
        a.className = "popup__attack";
        a.href = `${ATTACK_URL}${Number.parseInt(String(t.id), 10) || 0}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "⚔";
        row.append(left, a);
        frag.appendChild(row);
      }
    }
    targetList.replaceChildren(frag);
  }

  function describe(war) {
    switch (war.status) {
      case "active_war": return `Enemy: ${war.enemyFactionName || `Faction ${war.enemyFactionId}`}`;
      case "missing_key": return "API key required";
      case "no_active_war": return "No active war detected";
      case "no_faction": return "No faction detected";
      case "error": return `API error: ${war.errorMessage || "unknown"}`;
      default: return "Waiting for data";
    }
  }
})();
