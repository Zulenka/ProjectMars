const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeApiPath,
  redactSecret,
  buildApiUrl,
  normalizeApiErrorMessage,
  parseTornResponse,
  createTornApiClient
} = require("../src/background/api");

test("normalizeApiPath allows expected Torn endpoint paths and rejects invalid paths", () => {
  assert.equal(normalizeApiPath("user"), "user");
  assert.equal(normalizeApiPath("/faction/123/"), "faction/123");
  assert.throws(() => normalizeApiPath("../user"), /Invalid API path/);
  assert.throws(() => normalizeApiPath("user?x=1"), /Invalid API path/);
  assert.throws(() => normalizeApiPath("https://evil.test"), /Invalid API path/);
});

test("redactSecret removes raw and encoded key values from messages", () => {
  const key = "AbC+123/=";
  const msg = `bad key=${key} url=?key=${encodeURIComponent(key)}`;
  const out = redactSecret(msg, key);
  assert.doesNotMatch(out, /AbC\+123\/=/);
  assert.doesNotMatch(out, new RegExp(encodeURIComponent(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(out, /\[REDACTED\]/);
});

test("buildApiUrl builds Torn endpoint URL with selections and key", () => {
  const url = buildApiUrl("https://api.torn.com", "user/123", "profile", "abc");
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://api.torn.com");
  assert.equal(parsed.pathname, "/user/123/");
  assert.equal(parsed.searchParams.get("selections"), "profile");
  assert.equal(parsed.searchParams.get("key"), "abc");
});

test("buildApiUrl rejects invalid endpoint paths", () => {
  assert.throws(() => buildApiUrl("https://api.torn.com", "user?x=1", "basic", "abc"), /Invalid API path/);
});

test("normalizeApiErrorMessage extracts Torn API error text", () => {
  assert.equal(normalizeApiErrorMessage({ error: { error: "Bad key" } }), "Bad key");
  assert.equal(normalizeApiErrorMessage({ error: { code: 5 } }), "API error 5");
  assert.equal(normalizeApiErrorMessage({ ok: true }), null);
});

test("parseTornResponse throws on HTTP error", async () => {
  await assert.rejects(
    () => parseTornResponse({ ok: false, status: 503, json: async () => ({}) }),
    /HTTP 503/
  );
});

test("parseTornResponse throws on Torn API error payload", async () => {
  await assert.rejects(
    () => parseTornResponse({ ok: true, status: 200, json: async () => ({ error: { error: "Invalid key" } }) }),
    /Invalid key/
  );
});

test("createTornApiClient queues requests and uses fetched API key", async () => {
  const seen = [];
  const client = createTornApiClient({
    apiBase: "https://api.torn.com",
    fetchImpl: async (url) => {
      seen.push(url);
      return { ok: true, status: 200, json: async () => ({ ok: 1 }) };
    },
    getApiKey: async () => "KEY123",
    queueRequest: (fn, priority) => {
      seen.push(`priority:${priority}`);
      return fn();
    }
  });

  const data = await client.tornFetch("user", "basic", { priority: 7 });
  assert.deepEqual(data, { ok: 1 });
  assert.equal(seen[0], "priority:7");
  assert.match(String(seen[1]), /key=KEY123/);
});

test("createTornApiClient fetchOwn falls back from profile,basic to basic", async () => {
  let calls = 0;
  const client = createTornApiClient({
    apiBase: "https://api.torn.com",
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes("selections=profile%2Cbasic")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ name: "ok" }) };
    },
    getApiKey: async () => "KEY123",
    queueRequest: (fn) => fn()
  });

  const data = await client.fetchOwn();
  assert.equal(data.name, "ok");
  assert.equal(calls, 2);
});

test("createTornApiClient rejects when no API key is configured", async () => {
  const client = createTornApiClient({
    apiBase: "https://api.torn.com",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    getApiKey: async () => "",
    queueRequest: (fn) => fn()
  });

  await assert.rejects(() => client.tornFetch("user", "basic"), /API key not configured/);
});

test("createTornApiClient redacts API key from thrown fetch errors", async () => {
  const key = "SECRET123";
  const client = createTornApiClient({
    apiBase: "https://api.torn.com",
    fetchImpl: async (url) => {
      throw new Error(`Network failed for ${url}`);
    },
    getApiKey: async () => key,
    queueRequest: (fn) => fn()
  });

  await assert.rejects(
    () => client.tornFetch("user", "basic"),
    (err) => {
      assert.equal(err instanceof Error, true);
      assert.doesNotMatch(String(err.message), /SECRET123/);
      assert.match(String(err.message), /\[REDACTED\]/);
      return true;
    }
  );
});
