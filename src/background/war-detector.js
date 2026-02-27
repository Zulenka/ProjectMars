(function (global) {
  function createWarDetector(deps) {
    const {
      constants: C,
      storageGet: g,
      storageSet: s,
      api,
      logic: L,
      utils: U,
      patchWar,
      broadcast
    } = deps;
    const K = C.STORAGE_KEYS;
    const M = C.MESSAGE_TYPES;

    async function detectWar(getApiKey) {
      const key = await getApiKey();
      if (!key) {
        await s({
          [K.WAR_DATA]: {
            status: "missing_key",
            enemyFactionId: null,
            enemyFactionName: null,
            lastUpdated: 0,
            pollCountdownSeconds: C.DEFAULT_SETTINGS.pollIntervalSeconds,
            rateLimited: false,
            targets: {}
          }
        });
        await broadcast(M.WAR_DATA_UPDATED);
        return;
      }

      try {
        const ownUser = await api.fetchOwn();
        const ownFaction = L.ownFactionFromUser(ownUser, U.safeInt);
        if (!ownFaction.id) {
          await patchWar({ status: "no_faction", targets: {}, lastUpdated: U.toUnixSeconds() });
          await broadcast(M.WAR_DATA_UPDATED);
          return;
        }

        const ownFactionBasic = await api.fetchFactionBasic(ownFaction.id);
        const enemy = L.enemyFromFactionBasic(ownFactionBasic, U.safeInt);
        if (!enemy?.id) {
          await patchWar({
            status: "no_active_war",
            ownFactionId: ownFaction.id,
            ownFactionName: ownFaction.name,
            enemyFactionId: null,
            enemyFactionName: null,
            targets: {},
            lastUpdated: U.toUnixSeconds()
          });
          await broadcast(M.WAR_DATA_UPDATED);
          return;
        }

        const enemyFactionBasic = await api.fetchFactionBasic(enemy.id);
        const members = L.membersFromFactionBasic(enemyFactionBasic, U.safeInt);
        const curWar = (await g(K.WAR_DATA))[K.WAR_DATA] || {};
        const prevTargets = curWar.targets || {};
        const targets = {};

        for (const m of members) {
          targets[String(m.id)] = {
            id: m.id,
            name: m.name,
            status: prevTargets[String(m.id)]?.status || "Unknown",
            statusDescription: prevTargets[String(m.id)]?.statusDescription || "",
            hospitalUntil: prevTargets[String(m.id)]?.hospitalUntil || 0,
            travelDestination: prevTargets[String(m.id)]?.travelDestination || null,
            travelTimeLeft: prevTargets[String(m.id)]?.travelTimeLeft || 0,
            lastAction: prevTargets[String(m.id)]?.lastAction || "Unknown",
            lifeCurrent: prevTargets[String(m.id)]?.lifeCurrent || 0,
            lifeMax: prevTargets[String(m.id)]?.lifeMax || 0,
            lastPolled: prevTargets[String(m.id)]?.lastPolled || 0,
            lastActionSeconds: prevTargets[String(m.id)]?.lastActionSeconds || Infinity
          };
        }

        await s({
          [K.WAR_DATA]: {
            ...curWar,
            status: "active_war",
            ownFactionId: ownFaction.id,
            ownFactionName: ownFaction.name,
            enemyFactionId: enemy.id,
            enemyFactionName: enemy.name || `Faction ${enemy.id}`,
            targets,
            lastUpdated: U.toUnixSeconds(),
            pollCountdownSeconds: ((await g(K.SETTINGS))[K.SETTINGS] || C.DEFAULT_SETTINGS).pollIntervalSeconds,
            rateLimited: false
          }
        });
        await broadcast(M.WAR_DATA_UPDATED);
      } catch (e) {
        await patchWar({
          status: "error",
          errorMessage: e.message || "War detection failed",
          lastUpdated: U.toUnixSeconds()
        });
        await broadcast(M.WAR_DATA_UPDATED);
      }
    }

    return { detectWar };
  }

  const api = { createWarDetector };
  global.MARS_WAR_DETECTOR = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
