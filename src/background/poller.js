(function (global) {
  function createPoller(deps) {
    const {
      constants: C,
      storageGet: g,
      storageSet: s,
      api,
      logic: L,
      scheduler: S,
      utils: U,
      patchWar,
      broadcast
    } = deps;
    const K = C.STORAGE_KEYS;
    const M = C.MESSAGE_TYPES;

    function parseTarget(id, profile) {
      const t = U.normalizeTarget({ ...profile, id });
      return {
        ...t,
        lastPolled: U.toUnixSeconds(),
        lastActionSeconds: U.parseRelativeLastAction(t.lastAction)
      };
    }

    async function pollBatch() {
      const data = await g([K.WAR_DATA, K.SETTINGS]);
      const war = data[K.WAR_DATA];
      const settings = { ...C.DEFAULT_SETTINGS, ...(data[K.SETTINGS] || {}) };
      if (!war || war.status !== "active_war") return;

      const now = U.toUnixSeconds();
      const targets = Object.values(war.targets || {});
      if (!targets.length) return;

      const perTick = S.computeBatchBudget(settings.pollIntervalSeconds, 90);
      const batch = S.selectDueTargets(targets, now, L.tierForTarget, perTick);
      if (!batch.length) {
        await patchWar({ lastUpdated: now, pollCountdownSeconds: settings.pollIntervalSeconds });
        return;
      }

      const nextTargets = { ...(war.targets || {}) };
      await Promise.all(batch.map(async ({ t, tier }) => {
        try {
          nextTargets[String(t.id)] = parseTarget(t.id, await api.fetchUserProfile(t.id, tier.priority));
        } catch (e) {
          nextTargets[String(t.id)] = { ...t, lastPolled: now, error: e.message || "Fetch failed" };
        }
      }));

      await s({
        [K.WAR_DATA]: {
          ...war,
          targets: nextTargets,
          lastUpdated: now,
          pollCountdownSeconds: settings.pollIntervalSeconds
        }
      });
      await broadcast(M.WAR_DATA_UPDATED);
    }

    return { pollBatch, parseTarget };
  }

  const api = { createPoller };
  global.MARS_POLLER = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
