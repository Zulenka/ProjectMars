const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadMarsUtils() {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", "shared", "utils.js"), "utf8");
  const context = {
    self: {},
    window: {},
    btoa: (value) => Buffer.from(String(value), "utf8").toString("base64"),
    atob: (value) => {
      const input = String(value);
      if (!/^[A-Za-z0-9+/=]*$/.test(input) || input.length % 4 !== 0) {
        throw new Error("InvalidCharacterError");
      }
      return Buffer.from(input, "base64").toString("utf8");
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "utils.js" });
  return context.self.MARS_UTILS || context.window.MARS_UTILS;
}

test("shared utils obfuscate/deobfuscate round-trip API key", () => {
  const U = loadMarsUtils();
  const key = "abc123-secret-key";
  const obf = U.obfuscateKey(key);
  assert.notEqual(obf, key);
  assert.equal(U.deobfuscateKey(obf), key);
});

test("shared utils deobfuscate handles invalid input", () => {
  const U = loadMarsUtils();
  assert.equal(U.deobfuscateKey("%%%not-base64%%%"), "");
});

test("shared utils normalizeTarget maps nested Torn-like profile shape", () => {
  const U = loadMarsUtils();
  const normalized = U.normalizeTarget({
    id: 123,
    name: "EnemyOne",
    status: {
      state: "Hospital",
      description: "In hospital for 5 mins",
      until: 1700001000
    },
    travel: {
      destination: "Japan",
      time_left: 321
    },
    last_action: {
      relative: "4 minutes ago"
    },
    life: {
      current: 0,
      maximum: 7500
    }
  });

  assert.equal(normalized.id, 123);
  assert.equal(normalized.name, "EnemyOne");
  assert.equal(normalized.status, "Hospital");
  assert.equal(normalized.statusDescription, "In hospital for 5 mins");
  assert.equal(normalized.hospitalUntil, 1700001000);
  assert.equal(normalized.travelDestination, "Japan");
  assert.equal(normalized.travelTimeLeft, 321);
  assert.equal(normalized.lastAction, "4 minutes ago");
  assert.equal(normalized.lifeCurrent, 0);
  assert.equal(normalized.lifeMax, 7500);
  assert.equal(normalized.isTraveling, false);
  assert.equal(normalized.isAbroad, false);
});

test("shared utils parseRelativeLastAction parses online/minutes/hours", () => {
  const U = loadMarsUtils();
  assert.equal(U.parseRelativeLastAction("Online"), 0);
  assert.equal(U.parseRelativeLastAction("5 minutes ago"), 300);
  assert.equal(U.parseRelativeLastAction("2 hours ago"), 7200);
  assert.equal(U.parseRelativeLastAction("Unknown"), Number.POSITIVE_INFINITY);
});
