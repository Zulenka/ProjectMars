(function () {
  if (window.__MARS_PANEL_INSTALLED__) return;
  window.__MARS_PANEL_INSTALLED__ = true;

  const MSG = {
    GET_STATE: "GET_STATE",
    FORCE_REFRESH: "FORCE_REFRESH",
    WAR_DATA_UPDATED: "WAR_DATA_UPDATED",
    SETTINGS_UPDATED: "SETTINGS_UPDATED",
    PANEL_VISIBILITY_SET: "PANEL_VISIBILITY_SET"
  };
  const DEFAULTS = {
    pollIntervalSeconds: 30,
    maxVisibleTargets: 15,
    panelPosition: "right",
    panelCollapsed: false,
    defaultSort: "all",
    showLastAction: true,
    showLifeBar: true,
    panelWidth: 320,
    panelSizeLocked: false,
    panelOffsetTop: null,
    panelOffsetLeft: null
  };
  const ATTACK_URL = "https://www.torn.com/loader.php?sid=attack&user2ID=";
  const PANEL_WIDTH_MIN = 280;
  const PANEL_WIDTH_MAX = 560;
  const VIEWPORT_MARGIN = 10;

  const state = {
    settings: { ...DEFAULTS },
    warData: null,
    session: { panelHidden: false },
    sortMode: "all",
    collapsed: false,
    rows: new Map(),
    drag: null,
    resize: null
  };

  const host = document.createElement("div");
  host.id = "mars-war-tracker-host";
  const shadow = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);
  for (const path of ["src/styles/mars-theme.css", "src/styles/panel.css"]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL(path);
    shadow.appendChild(link);
  }

  const ui = buildShell();
  shadow.appendChild(ui.wrapper);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MSG.WAR_DATA_UPDATED || message?.type === MSG.SETTINGS_UPDATED) loadState();
  });
  window.addEventListener("keydown", (e) => {
    if (e.altKey && String(e.key).toLowerCase() === "m") {
      e.preventDefault();
      toggleCollapsed();
    }
  });
  window.addEventListener("resize", () => {
    if (!state.drag && !state.resize) applyLayout();
  });
  setInterval(tick, 1000);
  loadState();

  function e(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function buildShell() {
    const wrapper = e("div", "mars-shell");
    const panel = e("section", "mars-panel");
    const fab = e("button", "mars-fab");
    fab.type = "button";
    fab.append(e("span", "mars-fab__icon", "⚔"), e("span", "mars-fab__count", "0"));
    fab.addEventListener("click", () => setCollapsed(false));

    const header = e("div", "mars-panel__header");
    const titleWrap = e("div");
    titleWrap.append(e("div", "mars-panel__title", "MARS"), e("div", "mars-panel__subtitle", "War Tracker"));
    const meta = e("div", "mars-panel__meta");
    const enemy = e("div", "mars-enemy-label", "Loading...");
    const refresh = e("div", "mars-refresh-label", "⟳ --s");
    meta.append(enemy, refresh);
    const controls = e("div", "mars-panel__controls");
    const mkBtn = (label, title, fn) => {
      const b = e("button", "mars-btn", label);
      b.type = "button";
      b.title = title;
      b.addEventListener("click", fn);
      return b;
    };
    const lockSizeBtn = mkBtn("🔓", "Lock size", () => setSizeLocked(!state.settings.panelSizeLocked));
    controls.append(
      mkBtn("⟳", "Refresh", () => chrome.runtime.sendMessage({ type: MSG.FORCE_REFRESH })),
      lockSizeBtn,
      mkBtn("_", "Collapse", () => setCollapsed(true)),
      mkBtn("×", "Hide", () => setHidden(true))
    );
    header.append(titleWrap, meta, controls);
    makeDraggable(header, wrapper);

    const filters = e("div", "mars-panel__filters");
    const filterButtons = new Map();
    for (const [mode, label] of [["all","All"],["okay","Okay"],["hospital","Hospital"],["traveling","Traveling"],["abroad","Abroad"]]) {
      const b = e("button", "mars-pill", label);
      b.type = "button";
      b.dataset.mode = mode;
      b.addEventListener("click", () => {
        state.sortMode = mode;
        persistSettings({ defaultSort: mode });
        render();
      });
      filters.appendChild(b);
      filterButtons.set(mode, b);
    }

    const body = e("div", "mars-panel__body");
    const empty = e("div", "mars-empty", "Waiting for data...");
    const list = e("div", "mars-target-list");
    body.append(empty, list);
    const footer = e("div", "mars-panel__footer");
    const counts = e("div", "mars-counts", "Targets: 0 | Okay: 0 | Hosp: 0");
    footer.appendChild(counts);
    const resizeHandle = e("button", "mars-panel__resize-handle");
    resizeHandle.type = "button";
    resizeHandle.title = "Resize panel";
    resizeHandle.setAttribute("aria-label", "Resize panel");

    panel.append(header, filters, body, footer, resizeHandle);
    wrapper.append(panel, fab);
    makeResizable(resizeHandle, wrapper);
    return { wrapper, panel, fab, enemy, refresh, filters, filterButtons, empty, list, counts, lockSizeBtn, resizeHandle };
  }

  function makeDraggable(handle, wrapper) {
    handle.addEventListener("mousedown", (ev) => {
      if (ev.target instanceof HTMLElement && ev.target.closest("button")) return;
      const rect = wrapper.getBoundingClientRect();
      state.drag = { x: ev.clientX, y: ev.clientY, left: rect.left, top: rect.top };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp, { once: true });
      ev.preventDefault();
    });
    function onMove(ev) {
      if (!state.drag) return;
      const rect = wrapper.getBoundingClientRect();
      const left = clamp(
        state.drag.left + (ev.clientX - state.drag.x),
        0,
        Math.max(0, window.innerWidth - rect.width)
      );
      const top = clamp(
        state.drag.top + (ev.clientY - state.drag.y),
        0,
        Math.max(0, window.innerHeight - rect.height)
      );
      ui.wrapper.style.left = `${left}px`;
      ui.wrapper.style.right = "auto";
      ui.wrapper.style.top = `${top}px`;
      ui.wrapper.style.transform = "none";
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      if (!state.drag) return;
      const rect = ui.wrapper.getBoundingClientRect();
      persistSettings({ panelOffsetLeft: Math.round(rect.left), panelOffsetTop: Math.round(rect.top) });
      state.drag = null;
    }
  }

  function makeResizable(handle, wrapper) {
    handle.addEventListener("mousedown", (ev) => {
      if (state.settings.panelSizeLocked) return;
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const rect = wrapper.getBoundingClientRect();
      const anchorRight = ui.wrapper.style.right !== "auto";
      const anchorOffset = anchorRight
        ? parsePx(ui.wrapper.style.right, 16)
        : parsePx(ui.wrapper.style.left, rect.left);
      state.resize = {
        x: ev.clientX,
        width: sanitizePanelWidth(rect.width),
        anchorOffset
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp, { once: true });
    });
    function onMove(ev) {
      if (!state.resize) return;
      if (state.settings.panelSizeLocked) return;
      const desired = state.resize.width + (ev.clientX - state.resize.x);
      const maxByAnchor = window.innerWidth - VIEWPORT_MARGIN - state.resize.anchorOffset;
      const maxWidth = Math.min(PANEL_WIDTH_MAX, viewportWidthLimit(), Math.max(PANEL_WIDTH_MIN, Math.floor(maxByAnchor)));
      const nextWidth = clamp(Math.round(desired), PANEL_WIDTH_MIN, maxWidth);
      state.settings.panelWidth = sanitizePanelWidth(nextWidth);
      applyPanelWidth(nextWidth);
      clampWrapperIntoViewport();
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      if (!state.resize) return;
      const width = sanitizePanelWidth(Math.round(ui.wrapper.getBoundingClientRect().width));
      state.settings.panelWidth = width;
      state.resize = null;
      persistSettings({ panelWidth: width });
    }
  }

  async function loadState() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: MSG.GET_STATE });
      if (!resp?.ok) return;
      state.settings = { ...DEFAULTS, ...(resp.settings || {}) };
      state.settings.panelWidth = sanitizePanelWidth(state.settings.panelWidth);
      state.settings.panelSizeLocked = Boolean(state.settings.panelSizeLocked);
      state.warData = resp.warData || null;
      state.session = resp.session || { panelHidden: false };
      state.sortMode = state.settings.defaultSort || "all";
      state.collapsed = Boolean(state.settings.panelCollapsed);
      applyLayout();
      render();
    } catch {
      // background may be spinning up
    }
  }

  async function persistSettings(patch) {
    state.settings = { ...state.settings, ...(patch || {}) };
    try {
      await chrome.runtime.sendMessage({ type: MSG.SETTINGS_UPDATED, settings: patch || {} });
    } catch {}
  }

  function setHidden(hidden) {
    state.session.panelHidden = hidden;
    ui.wrapper.classList.toggle("is-hidden", hidden);
    try {
      chrome.runtime.sendMessage({ type: MSG.PANEL_VISIBILITY_SET, hidden });
    } catch {}
  }
  function setCollapsed(collapsed) {
    state.collapsed = collapsed;
    persistSettings({ panelCollapsed: collapsed });
    applyLayout();
  }
  function toggleCollapsed() {
    if (state.session.panelHidden) {
      setHidden(false);
      setCollapsed(false);
      return;
    }
    setCollapsed(!state.collapsed);
  }
  function setSizeLocked(locked) {
    state.settings.panelSizeLocked = Boolean(locked);
    persistSettings({ panelSizeLocked: state.settings.panelSizeLocked });
    applyLayout();
  }

  function applyLayout() {
    ui.wrapper.classList.toggle("is-collapsed", state.collapsed);
    ui.wrapper.classList.toggle("is-hidden", !!state.session.panelHidden);
    ui.wrapper.classList.toggle("is-left", state.settings.panelPosition === "left");
    ui.wrapper.classList.toggle("is-size-locked", !!state.settings.panelSizeLocked);
    ui.lockSizeBtn.textContent = state.settings.panelSizeLocked ? "🔒" : "🔓";
    ui.lockSizeBtn.title = state.settings.panelSizeLocked ? "Unlock size" : "Lock size";
    ui.lockSizeBtn.classList.toggle("is-active", !!state.settings.panelSizeLocked);
    ui.lockSizeBtn.setAttribute("aria-label", ui.lockSizeBtn.title);
    ui.resizeHandle.title = state.settings.panelSizeLocked ? "Size locked" : "Resize panel";
    ui.resizeHandle.setAttribute("aria-label", state.settings.panelSizeLocked ? "Panel size locked" : "Resize panel");
    applyPanelWidth(panelWidthForLayout(state.settings.panelWidth));
    if (Number.isFinite(state.settings.panelOffsetTop)) {
      ui.wrapper.style.top = `${state.settings.panelOffsetTop}px`;
      ui.wrapper.style.transform = "none";
    } else {
      ui.wrapper.style.top = "50%";
      ui.wrapper.style.transform = "translateY(-50%)";
    }
    if (Number.isFinite(state.settings.panelOffsetLeft)) {
      ui.wrapper.style.left = `${state.settings.panelOffsetLeft}px`;
      ui.wrapper.style.right = "auto";
    } else if (state.settings.panelPosition === "left") {
      ui.wrapper.style.left = "16px";
      ui.wrapper.style.right = "auto";
    } else {
      ui.wrapper.style.right = "16px";
      ui.wrapper.style.left = "auto";
    }
    clampWrapperIntoViewport();
  }

  function render() {
    for (const [mode, btn] of ui.filterButtons.entries()) btn.classList.toggle("is-active", mode === state.sortMode);
    const war = state.warData;
    if (!war) {
      ui.enemy.textContent = "Loading...";
      ui.refresh.textContent = "⟳ --s";
      ui.empty.hidden = false;
      ui.empty.textContent = "Waiting for background...";
      ui.list.replaceChildren();
      return;
    }
    const targets = Object.values(war.targets || {});
    const counts = summarize(targets);
    ui.fab.querySelector(".mars-fab__count").textContent = String(counts.okay);
    ui.counts.textContent = `Targets: ${counts.total} | Okay: ${counts.okay} | Hosp: ${counts.hospital}`;
    ui.refresh.textContent = `⟳ ${Math.max(0, Number(war.pollCountdownSeconds || state.settings.pollIntervalSeconds))}s`;

    if (war.status !== "active_war") {
      ui.enemy.textContent = labelForWar(war);
      ui.empty.hidden = false;
      ui.empty.textContent = emptyForWar(war);
      ui.list.replaceChildren();
      return;
    }

    ui.enemy.textContent = `Enemy: ${war.enemyFactionName || `Faction ${war.enemyFactionId}`}${war.rateLimited ? " | Rate limit" : ""}`;
    const sorted = sortTargets(targets).slice(0, state.settings.maxVisibleTargets);
    if (!sorted.length) {
      ui.empty.hidden = false;
      ui.empty.textContent = "No targets in current filter.";
    } else {
      ui.empty.hidden = true;
    }
    const frag = document.createDocumentFragment();
    for (const t of sorted) {
      const row = ensureRow(t);
      updateRow(row, t);
      frag.appendChild(row.root);
    }
    ui.list.replaceChildren(frag);
  }

  function summarize(targets) {
    let okay = 0, hospital = 0;
    for (const t of targets) {
      if (t.status === "Okay") okay++;
      if (t.status === "Hospital") hospital++;
    }
    return { total: targets.length, okay, hospital };
  }

  function ensureRow(target) {
    if (state.rows.has(target.id)) return state.rows.get(target.id);
    const root = e("div", "mars-target");
    const top = e("div", "mars-target__top");
    const left = e("div", "mars-target__left");
    const dot = e("span", "mars-target__dot");
    const name = e("span", "mars-target__name");
    left.append(dot, name);
    const right = e("div", "mars-target__right");
    const status = e("span", "mars-target__status");
    const attack = e("a", "mars-attack", "⚔");
    attack.target = "_blank";
    attack.rel = "noopener noreferrer";
    right.append(status, attack);
    top.append(left, right);
    const sub = e("div", "mars-target__sub");
    const subline = e("span");
    sub.appendChild(subline);
    const life = e("div", "mars-life");
    const bar = e("div", "mars-life__bar");
    const fill = e("div", "mars-life__fill");
    bar.appendChild(fill);
    life.appendChild(bar);
    root.append(top, sub, life);
    const row = { root, dot, name, status, attack, subline, life, fill };
    state.rows.set(target.id, row);
    return row;
  }

  function updateRow(row, t) {
    row.root.className = `mars-target ${statusClass(t.status)}`;
    row.root.dataset.hospitalUntil = String(t.hospitalUntil || 0);
    row.name.textContent = `${t.name} [${t.id}]`;
    row.status.textContent = t.status || "Unknown";
    row.attack.href = `${ATTACK_URL}${Number.parseInt(String(t.id), 10) || 0}`;
    row.subline.textContent = sublineFor(t);
    const showLife = state.settings.showLifeBar && (t.lifeMax || 0) > 0;
    row.life.hidden = !showLife;
    if (showLife) {
      const pct = clamp(Math.round(((t.lifeCurrent || 0) / Math.max(1, t.lifeMax || 1)) * 100), 0, 100);
      row.fill.style.width = `${pct}%`;
    }
  }

  function sublineFor(t) {
    const now = unix();
    if (t.status === "Hospital") return `⏱ ${fmt(Math.max(0, (t.hospitalUntil || 0) - now))} remaining`;
    if (t.status === "Traveling") return `✈ ${t.travelDestination || "Unknown"}${t.travelTimeLeft ? ` ~${fmt(t.travelTimeLeft)}` : ""}`;
    if (t.status === "Abroad") return `📍 ${t.travelDestination || "Abroad"}`;
    if (state.settings.showLastAction) return `Last active: ${t.lastAction || "Unknown"}`;
    return t.statusDescription || "";
  }

  function sortTargets(targets) {
    const mode = state.sortMode || "all";
    const now = unix();
    const list = targets.filter((t) => {
      if (mode === "all") return true;
      return String(t.status || "").toLowerCase() === mode;
    });
    if (mode !== "all" && list.length === 0) {
      state.sortMode = "all";
      persistSettings({ defaultSort: "all" });
      return sortTargets(targets);
    }
    const lastScore = (t) => Number.isFinite(t.lastActionSeconds) ? t.lastActionSeconds : Infinity;
    const hosp = (t) => Math.max(0, (t.hospitalUntil || 0) - now);
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
      if (mode === "hospital") return hosp(a) - hosp(b);
      if (mode === "traveling") return travel(a) - travel(b);
      if (mode === "abroad") return String(a.travelDestination || "").localeCompare(String(b.travelDestination || "")) || (lastScore(a) - lastScore(b));
      if (mode === "okay") return lastScore(a) - lastScore(b);
      return (rank(a) - rank(b))
        || (a.status === "Okay" ? (lastScore(a) - lastScore(b)) : 0)
        || (a.status === "Hospital" ? (hosp(a) - hosp(b)) : 0)
        || (a.status === "Traveling" ? (travel(a) - travel(b)) : 0)
        || String(a.name || "").localeCompare(String(b.name || ""));
    });
    return list;
  }

  function statusClass(status) {
    switch (String(status || "").toLowerCase()) {
      case "okay": return "status-okay";
      case "hospital": return "status-hospital";
      case "traveling": return "status-traveling";
      case "abroad": return "status-abroad";
      case "jail":
      case "federal": return "status-restricted";
      default: return "";
    }
  }

  function tick() {
    if (state.warData) {
      const cur = Number(state.warData.pollCountdownSeconds || state.settings.pollIntervalSeconds);
      state.warData.pollCountdownSeconds = cur <= 0 ? state.settings.pollIntervalSeconds : cur - 1;
      ui.refresh.textContent = `⟳ ${Math.max(0, state.warData.pollCountdownSeconds)}s`;
    }
    const now = unix();
    for (const row of state.rows.values()) {
      if (!row.root.isConnected || !row.root.classList.contains("status-hospital")) continue;
      const until = Number(row.root.dataset.hospitalUntil || 0);
      const rem = Math.max(0, until - now);
      row.subline.textContent = `⏱ ${fmt(rem)} remaining`;
      row.root.classList.toggle("is-hospital-soon", rem > 0 && rem < 300);
      if (rem === 0) {
        row.status.textContent = "Okay*";
        row.root.classList.add("status-okay");
      }
    }
  }

  function labelForWar(w) {
    switch (w.status) {
      case "missing_key": return "API key required";
      case "no_faction": return "No faction";
      case "no_active_war": return "No active war";
      case "error": return "API error";
      default: return "War tracker";
    }
  }
  function emptyForWar(w) {
    switch (w.status) {
      case "missing_key": return "Set your Torn API key in extension options.";
      case "no_faction": return "Your account is not in a faction.";
      case "no_active_war": return "No active war detected.";
      case "error": return w.errorMessage || "Failed to load war data.";
      default: return "Waiting for war data...";
    }
  }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function viewportWidthLimit() { return Math.max(PANEL_WIDTH_MIN, window.innerWidth - (VIEWPORT_MARGIN * 2)); }
  function sanitizePanelWidth(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return 320;
    return clamp(n, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX);
  }
  function panelWidthForLayout(value) {
    return clamp(sanitizePanelWidth(value), PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, viewportWidthLimit()));
  }
  function applyPanelWidth(width) {
    ui.wrapper.style.setProperty("--mars-panel-width", `${Math.round(width)}px`);
  }
  function parsePx(value, fallback) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function clampWrapperIntoViewport() {
    const rect = ui.wrapper.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const clampedLeft = clamp(Math.round(rect.left), 0, Math.round(maxLeft));
    const clampedTop = clamp(Math.round(rect.top), 0, Math.round(maxTop));
    if (Math.abs(clampedLeft - rect.left) > 0.5 || Math.abs(clampedTop - rect.top) > 0.5) {
      ui.wrapper.style.left = `${clampedLeft}px`;
      ui.wrapper.style.right = "auto";
      ui.wrapper.style.top = `${clampedTop}px`;
      ui.wrapper.style.transform = "none";
    }
  }
  function unix() { return Math.floor(Date.now() / 1000); }
  function fmt(seconds) {
    const t = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h > 0 ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
})();
