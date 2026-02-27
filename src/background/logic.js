(function (global) {
  function ownFactionFromUser(user, safeInt) {
    return {
      id: safeInt(user?.faction?.faction_id || user?.faction?.id, 0),
      name: user?.faction?.faction_name || user?.faction?.name || null
    };
  }

  function enemyFromFactionBasic(factionData, safeInt) {
    const f = factionData || {};
    const ranked = f.ranked_war || f.rankedwar || {};
    const directId = ranked.enemy || ranked.enemy_id || f.enemy_faction_id || f.enemy_faction;
    if (directId) {
      return {
        id: safeInt(directId, 0),
        name: ranked.enemy_name || f.enemy_faction_name || null
      };
    }

    const wars = f.wars || f.war;
    const nodes = Array.isArray(wars) ? wars : (wars && typeof wars === "object" ? Object.values(wars) : []);
    for (const war of nodes) {
      if (!war) continue;
      const op = war.opponent || war.enemy || {};
      const id = safeInt(op.id || op.faction_id || war.enemy_id, 0);
      if (id) {
        return {
          id,
          name: op.name || war.enemy_name || null
        };
      }
    }
    return null;
  }

  function membersFromFactionBasic(factionData, safeInt) {
    const raw = factionData?.members || factionData?.members_list || {};
    const rows = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, v]) => ({ id, ...(v || {}) }));
    return rows.map((r) => ({
      id: safeInt(r.id || r.player_id, 0),
      name: r.name || r.player_name || `Player ${r.id}`
    })).filter((r) => r.id > 0);
  }

  function tierForTarget(target, nowUnix) {
    if (!target?.status) return { interval: 120, priority: 1 };
    if (target.status === "Okay") return { interval: 30, priority: 5 };
    if (target.status === "Hospital") {
      const remaining = Math.max(0, (target.hospitalUntil || 0) - nowUnix);
      if (remaining < 300) return { interval: 30, priority: 5 };
      if (remaining < 1800) return { interval: 60, priority: 4 };
      return { interval: 120, priority: 2 };
    }
    if (target.status === "Traveling") return { interval: 60, priority: 3 };
    return { interval: 120, priority: 1 };
  }

  const api = {
    ownFactionFromUser,
    enemyFromFactionBasic,
    membersFromFactionBasic,
    tierForTarget
  };

  global.MARS_BACKGROUND_LOGIC = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
