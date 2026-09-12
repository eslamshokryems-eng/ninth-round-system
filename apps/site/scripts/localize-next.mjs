#!/usr/bin/env node
// Fully self-contained fix, scoped entirely to apps/site: this workspace
// hoists node_modules (node-linker=hoisted / shamefully-hoist=true in the
// root .npmrc, required by apps/mobile's Metro bundler), and apps/site
// pins an exact `next` version distinct from apps/web's so pnpm can't
// silently share one physical install between the two. But whichever of
// the two "wins" the shared workspace-root node_modules/next slot still
// leaves the *other* app resolving `next` (and its `styled-jsx`
// dependency) from outside its own node_modules — and `next`'s internal
// static-export/prerender code paths resolve `react`/`react-dom`
// relative to wherever `next` itself physically sits, not relative to
// the app importing it. A webpack `resolve.alias` (see next.config.mjs)
// fixes this for webpack-bundled code, but not for that internal
// prerender path, which resolves react directly via Node, not webpack.
//
// Step 1: make `next` (and `styled-jsx`) a genuinely *local* physical
// copy inside apps/site/node_modules — not a symlink, an actual copy —
// so every resolution path finds apps/site's own react via ordinary
// ancestor directory lookup, without depending on anything outside
// apps/site (mirrors how apps/web's own forced-local `next` copy, a
// side effect of its own version pin, already has zero issue).
//
// Step 2: `next` itself (like every Next install in this repo) ships
// its OWN nested `node_modules/react` + `node_modules/react-dom` to
// satisfy its peer dependency (the same reason
// scripts/fix-next-react-dedup.mjs exists at the repo root, for
// apps/web). A plain recursive copy preserves those as symlinks
// pointing at whatever they pointed at in the source tree (in this
// workspace, apps/web's react, via that same shared root script) — so
// after copying, explicitly re-point next's (and styled-jsx's) nested
// react/react-dom to apps/site's own local copies. This is the same
// fix, just entirely self-contained: nothing here is shared with, or
// depended on by, anything outside apps/site.
//
// Chained directly into apps/site's own build/dev/start/typecheck
// scripts (never a postinstall hook, and never invoked via the `next`
// CLI on PATH — see package.json, which calls
// ./node_modules/next/dist/bin/next explicitly) so it always runs
// deterministically last, right before the real command, using the
// local copy end to end — no race with, and no dependency on, any
// script outside this app, including the shared root postinstall.

import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url + "/");

const SITE_NODE_MODULES = join(SITE_ROOT, "node_modules");
const SITE_REACT = join(SITE_NODE_MODULES, "react");
const SITE_REACT_DOM = join(SITE_NODE_MODULES, "react-dom");

ensureLocalCopy("next");
ensureLocalCopy("styled-jsx");

// Order matters: fix next's and styled-jsx's own nested react copies
// only after both are guaranteed to exist locally.
fixNestedReact(join(SITE_NODE_MODULES, "next"));
fixNestedReact(join(SITE_NODE_MODULES, "styled-jsx"));

function ensureLocalCopy(packageName) {
  const localDir = join(SITE_NODE_MODULES, packageName);

  let resolvedPkgJson;
  try {
    resolvedPkgJson = require.resolve(`${packageName}/package.json`, { paths: [SITE_ROOT] });
  } catch {
    console.log(`[localize-next] ${packageName} not found — skipping (not installed yet?).`);
    return;
  }
  const resolvedDir = dirname(resolvedPkgJson);

  // Already a real, local, non-symlinked copy inside apps/site's own
  // node_modules — nothing to do. (realpathSync resolves through any
  // symlink; comparing against the literal local path, not its realpath,
  // is exactly the check that tells us "not a symlink to somewhere else".)
  if (existsSync(localDir) && realpathSync(localDir) === localDir && localDir === resolvedDir) {
    return;
  }

  // Already copied in a previous run, and the source hasn't changed —
  // skip re-copying ~150MB on every single build.
  if (existsSync(join(localDir, ".localized-from")) && existsSync(localDir)) {
    const markerTarget = readFileSync(join(localDir, ".localized-from"), "utf8").trim();
    if (markerTarget === resolvedDir) return;
  }

  console.log(`[localize-next] copying ${packageName} from ${resolvedDir} -> ${localDir}`);
  rmSync(localDir, { recursive: true, force: true });
  mkdirSync(localDir, { recursive: true });
  cpSync(resolvedDir, localDir, { recursive: true, dereference: true });
  writeFileSync(join(localDir, ".localized-from"), resolvedDir);
}

function fixNestedReact(packageDir) {
  if (!existsSync(packageDir)) return;
  fixLink(join(packageDir, "node_modules/react"), SITE_REACT);
  fixLink(join(packageDir, "node_modules/react-dom"), SITE_REACT_DOM);
}

function fixLink(link, pointAt) {
  if (!existsSync(link)) return; // this package has no nested copy to fix — fine

  try {
    if (realpathSync(link) === realpathSync(pointAt)) return; // already correct
  } catch {
    // broken/self-referential symlink from a previous run — fall through and recreate it.
  }

  rmSync(link, { recursive: true, force: true });
  symlinkSync(pointAt, link, "junction");
  console.log(`[localize-next] linked ${link} -> ${pointAt}`);
}
