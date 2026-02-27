(function (global) {
  function pruneTimestamps(timestamps, nowMs, windowMs) {
    const cutoff = nowMs - (windowMs || 60_000);
    return (timestamps || []).filter((t) => t >= cutoff);
  }

  function canMakeRequest(timestamps, nowMs, limitPerMinute) {
    const pruned = pruneTimestamps(timestamps, nowMs, 60_000);
    return pruned.length < (limitPerMinute || 90);
  }

  function computeBatchBudget(pollIntervalSeconds, limitPerMinute) {
    const interval = Math.max(30, Number(pollIntervalSeconds) || 30);
    const limit = Math.max(1, Number(limitPerMinute) || 90);
    return Math.max(4, Math.floor(limit / (60 / interval)));
  }

  function selectDueTargets(targets, nowUnix, tierForTarget, batchBudget) {
    const due = (targets || [])
      .map((t) => ({ t, tier: tierForTarget(t, nowUnix) }))
      .filter(({ t, tier }) => !t.lastPolled || nowUnix - t.lastPolled >= tier.interval)
      .sort((a, b) => (b.tier.priority - a.tier.priority) || ((a.t.lastPolled || 0) - (b.t.lastPolled || 0)));
    return due.slice(0, Math.max(0, Number(batchBudget) || 0));
  }

  const api = {
    pruneTimestamps,
    canMakeRequest,
    computeBatchBudget,
    selectDueTargets
  };

  global.MARS_SCHEDULER_LOGIC = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
