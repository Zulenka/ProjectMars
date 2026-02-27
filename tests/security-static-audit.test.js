const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

const AUDIT_FILES = [
  "src/content/content.js",
  "src/options/options.js",
  "src/popup/popup.js",
  "src/background/background.js",
  "src/background/api.js",
  "src/background/message-router.js",
  "src/shared/utils.js"
];

test("security audit: no dangerous dynamic code or HTML injection APIs in audited sources", () => {
  const banned = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\beval\s*\(/,
    /\bnew Function\b/,
    /\bdocument\.write\s*\(/,
    /setTimeout\s*\(\s*["']/,
    /setInterval\s*\(\s*["']/
  ];

  for (const rel of AUDIT_FILES) {
    const src = read(rel);
    for (const re of banned) {
      assert.equal(
        re.test(src),
        false,
        `${rel} matched banned pattern ${re}`
      );
    }
  }
});

test("content script uses noopener+noreferrer for external attack link", () => {
  const src = read("src/content/content.js");
  assert.match(src, /attack\.target\s*=\s*"_blank"/);
  assert.match(src, /attack\.rel\s*=\s*"noopener noreferrer"/);
});

test("content script attack link is built from fixed base URL and numeric ID coercion", () => {
  const src = read("src/content/content.js");
  assert.match(src, /const ATTACK_URL = "https:\/\/www\.torn\.com\/loader\.php\?sid=attack&user2ID="/);
  assert.match(src, /row\.attack\.href\s*=\s*`?\$\{?ATTACK_URL\}?\$\{Number\.parseInt\(String\(t\.id\), 10\) \|\| 0\}`?/);
});

test("popup attack links and options external links use fixed URLs with safe window/link attributes", () => {
  const popupSrc = read("src/popup/popup.js");
  assert.match(popupSrc, /const ATTACK_URL = "https:\/\/www\.torn\.com\/loader\.php\?sid=attack&user2ID="/);
  assert.match(popupSrc, /a\.target\s*=\s*"_blank"/);
  assert.match(popupSrc, /a\.rel\s*=\s*"noopener noreferrer"/);

  const optionsSrc = read("src/options/options.js");
  assert.match(optionsSrc, /const MARS_CUSTOM_KEY_URL\s*=\s*"https:\/\/www\.torn\.com\/preferences\.php#tab=api\?step=addNewKey/);
  assert.match(optionsSrc, /window\.open\(MARS_CUSTOM_KEY_URL,\s*"_blank",\s*"noopener"\)/);
  assert.match(optionsSrc, /window\.open\("https:\/\/www\.torn\.com\/api\.html#"/);
});
