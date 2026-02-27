(function (global) {
  function normalizeApiPath(path) {
    const raw = String(path || "").replace(/^\/+|\/+$/g, "");
    if (!/^[a-z]+(?:\/\d+)?$/i.test(raw)) {
      throw new Error("Invalid API path");
    }
    return raw;
  }

  function redactSecret(text, secret) {
    if (!secret) return String(text || "");
    let out = String(text || "");
    const forms = [secret, encodeURIComponent(secret)];
    for (const value of forms) {
      if (!value) continue;
      out = out.split(value).join("[REDACTED]");
    }
    return out;
  }

  function buildApiUrl(apiBase, path, selections, key) {
    const safePath = normalizeApiPath(path);
    const url = new URL(`${apiBase}/${safePath}/`);
    if (selections) url.searchParams.set("selections", selections);
    if (key) url.searchParams.set("key", key);
    return url.toString();
  }

  function normalizeApiErrorMessage(data) {
    if (!data || !data.error) return null;
    return data.error.error || `API error ${data.error.code || ""}`.trim();
  }

  async function parseTornResponse(response) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const apiError = normalizeApiErrorMessage(data);
    if (apiError) {
      throw new Error(apiError);
    }
    return data;
  }

  function createTornApiClient(config) {
    const apiBase = config.apiBase;
    const fetchImpl = config.fetchImpl;
    const getApiKey = config.getApiKey;
    const queueRequest = config.queueRequest;

    async function tornFetch(path, selections, opts = {}) {
      const key = opts.key || await getApiKey();
      if (!key) throw new Error("API key not configured");
      try {
        return await queueRequest(async () => {
          try {
            const res = await fetchImpl(buildApiUrl(apiBase, path, selections, key));
            return await parseTornResponse(res);
          } catch (e) {
            throw new Error(redactSecret(e?.message || "API request failed", key));
          }
        }, opts.priority || 1);
      } catch (e) {
        throw new Error(redactSecret(e?.message || "API request failed", key));
      }
    }

    return {
      tornFetch,
      fetchOwn() {
        return tornFetch("user", "profile,basic", { priority: 5 }).catch(() =>
          tornFetch("user", "basic", { priority: 5 })
        );
      },
      fetchFactionBasic(id) {
        return tornFetch(id ? `faction/${id}` : "faction", "basic", { priority: 4 });
      },
      fetchUserProfile(id, priority) {
        return tornFetch(`user/${id}`, "profile", { priority: priority || 2 });
      }
    };
  }

  const api = {
    normalizeApiPath,
    redactSecret,
    buildApiUrl,
    normalizeApiErrorMessage,
    parseTornResponse,
    createTornApiClient
  };

  global.MARS_API = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
