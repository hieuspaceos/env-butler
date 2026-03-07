#!/usr/bin/env node
// Generate update.json manifest for Tauri auto-updater from release artifacts.
// Reads .sig files produced by tauri-action when TAURI_SIGNING_PRIVATE_KEY is set.

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const version = (process.env.VERSION || "0.1.0").replace(/^v/, "");
const repo = process.env.REPO || "hieuspaceos/env-butler";
const artifactsDir = "./artifacts";
const tag = `v${version}`;

// Map Tauri platform targets to file patterns and their .sig counterparts
const platforms = {
  "darwin-universal": { pattern: /\.dmg$/, sigPattern: /\.dmg\.sig$/ },
  "darwin-aarch64": { pattern: /\.dmg$/, sigPattern: /\.dmg\.sig$/ },
  "darwin-x86_64": { pattern: /\.dmg$/, sigPattern: /\.dmg\.sig$/ },
  "windows-x86_64": { pattern: /\.msi$/, sigPattern: /\.msi\.sig$/ },
  "linux-x86_64": { pattern: /\.AppImage$/, sigPattern: /\.AppImage\.sig$/ },
};

const files = readdirSync(artifactsDir);
const manifestPlatforms = {};

// For universal macOS build, use same file for all darwin targets
for (const [target, { pattern, sigPattern }] of Object.entries(platforms)) {
  const assetFile = files.find((f) => pattern.test(f) && !f.endsWith(".sig"));
  const sigFile = files.find((f) => sigPattern.test(f));

  if (!assetFile) {
    console.warn(`⚠ No asset matching for ${target}`);
    continue;
  }

  const signature = sigFile
    ? readFileSync(join(artifactsDir, sigFile), "utf-8").trim()
    : "";

  if (!signature) {
    console.warn(`⚠ No .sig file for ${target} (${assetFile})`);
    continue;
  }

  manifestPlatforms[target] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${assetFile}`,
  };
}

const manifest = {
  version,
  notes: `See [CHANGELOG.md](https://github.com/${repo}/blob/main/CHANGELOG.md)`,
  pub_date: new Date().toISOString(),
  platforms: manifestPlatforms,
};

const outPath = join(artifactsDir, "update.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`✓ Manifest written to ${outPath}`);
console.log(`  Platforms: ${Object.keys(manifestPlatforms).join(", ") || "(none)"}`);
