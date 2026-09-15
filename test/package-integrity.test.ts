import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pluginRoot = path.resolve("src/com.f00d4tehg0dz.aipaints.sdPlugin");
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "manifest.json"), "utf8"));

test("manifest preserves UUIDs and uses the modern Node runtime", () => {
  assert.equal(manifest.UUID, "com.f00d4tehg0dz.aipaints");
  assert.equal(manifest.Actions[0].UUID, "com.f00d4tehg0dz.aipaints.action");
  assert.equal(manifest.CodePath, "bin/plugin.js");
  assert.equal(manifest.Actions[0].PropertyInspectorPath, "ui/inspector.html");
  assert.equal(manifest.SDKVersion, 3);
  assert.equal(manifest.Nodejs.Version, "24");
});

test("modern package entry points exist after build and legacy SDK is absent", () => {
  for (const item of [manifest.CodePath, manifest.Actions[0].PropertyInspectorPath, "ui/inspector.js", "ui/popup.html"]) {
    assert.ok(fs.existsSync(path.join(pluginRoot, item)), `Missing ${item}`);
  }
  for (const item of ["app.html", "app.js", "cloudflare-ai.js", "libs/js/api.js", "libs/js/property-inspector.js"]) {
    assert.equal(fs.existsSync(path.join(pluginRoot, item)), false, `Legacy asset remains: ${item}`);
  }
});
