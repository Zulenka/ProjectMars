const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const BROWSERS = [
  { name: "chrome", manifest: "manifest.json" },
  { name: "firefox", manifest: "manifest.firefox.json" },
  { name: "opera", manifest: "manifest.opera.json" }
];
const COPY_ROOT_FILES = ["README.txt"];
const COPY_DIRS = ["src", "docs"];

main();

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--bump")) {
    const kind = args[args.indexOf("--bump") + 1] || "patch";
    bumpVersion(kind);
  }
  if (args.includes("--clean")) {
    rmIfExists(DIST);
  }
  ensureDir(DIST);

  const baseManifest = readJson(path.join(ROOT, "manifest.json"));
  for (const browser of BROWSERS) {
    const outDir = path.join(DIST, browser.name);
    rmIfExists(outDir);
    ensureDir(outDir);
    for (const file of COPY_ROOT_FILES) {
      if (fs.existsSync(path.join(ROOT, file))) copyFile(path.join(ROOT, file), path.join(outDir, file));
    }
    for (const dir of COPY_DIRS) {
      if (fs.existsSync(path.join(ROOT, dir))) copyDir(path.join(ROOT, dir), path.join(outDir, dir));
    }
    const manifest = readJson(path.join(ROOT, browser.manifest));
    manifest.version = baseManifest.version;
    writeJson(path.join(outDir, "manifest.json"), manifest);
    zipBrowser(browser.name, outDir, baseManifest.version);
  }
  console.log("Build complete.");
}

function bumpVersion(kind) {
  const files = ["package.json", "manifest.json", "manifest.firefox.json", "manifest.opera.json"];
  const versions = files.map((f) => [f, readJson(path.join(ROOT, f))]);
  const current = versions.find(([f]) => f === "package.json")[1].version;
  const next = inc(current, kind);
  for (const [file, json] of versions) {
    json.version = next;
    writeJson(path.join(ROOT, file), json);
  }
  console.log(`Version bumped to ${next}`);
}

function inc(version, kind) {
  const [a, b, c] = String(version || "0.1.0").split(".").map((n) => Number.parseInt(n, 10) || 0);
  if (kind === "major") return `${a + 1}.0.0`;
  if (kind === "minor") return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

function zipBrowser(name, outDir, version) {
  const zipPath = path.join(DIST, `${name}-${version}.zip`);
  rmIfExists(zipPath);
  try {
    const srcGlob = path.join(outDir, "*").replace(/\\/g, "\\\\");
    const dst = zipPath.replace(/\\/g, "\\\\");
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${srcGlob}' -DestinationPath '${dst}' -Force"`, { stdio: "inherit" });
  } catch (e) {
    console.warn(`Zip failed for ${name}: ${e.message}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}
function copyDir(src, dst) {
  ensureDir(dst);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) copyFile(from, to);
  }
}
function rmIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}
