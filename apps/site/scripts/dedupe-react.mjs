#!/usr/bin/env node
/* eslint-disable no-undef, no-console -- Node build script (runs outside the app bundle). */
/*
 * Self-contained React dedup for @9thround/site.
 *
 * This monorepo runs two React majors side by side: apps/mobile needs
 * React 19 (React Native 0.81), apps/web + apps/site need React 18
 * (Next 14's peer). pnpm therefore can't hoist a single shared `react`,
 * and each Next app ends up with its own physical copy. `next` itself
 * binds `react-dom/server` to ONE physical copy (the root
 * `scripts/fix-next-react-dedup.mjs` junctions next's + styled-jsx's
 * nested react at `apps/web/node_modules/react`). If this app's own
 * `react` is a *different* physical 18.2.0 directory, `next build`
 * crashes while prerendering its built-in `/404` + `/500` pages
 * ("Cannot read properties of null (reading 'useContext')").
 *
 * Fix: point apps/site/node_modules/{react,react-dom} at the SAME
 * physical directory next uses. Same version (18.2.0) — a pure dedup,
 * never a version change. Mirrors the root script's approach exactly, but
 * lives entirely inside apps/site so no shared file is modified.
 *
 * Runs on this package's own `postinstall`.
 */
import { existsSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(SITE_ROOT));

// The canonical React 18 copy `next` is already bound to.
const CANON_REACT = join(REPO_ROOT, "apps/web/node_modules/react");
const CANON_REACT_DOM = join(REPO_ROOT, "apps/web/node_modules/react-dom");

if (!existsSync(CANON_REACT) || !existsSync(CANON_REACT_DOM)) {
  console.log("[site dedupe-react] canonical apps/web react(-dom) not present yet — skipping.");
  process.exit(0);
}

const targets = [
  { link: join(SITE_ROOT, "node_modules/react"), pointAt: CANON_REACT },
  { link: join(SITE_ROOT, "node_modules/react-dom"), pointAt: CANON_REACT_DOM },
];

for (const { link, pointAt } of targets) {
  if (!existsSync(link)) continue;
  try {
    if (realpathSync(link) === realpathSync(pointAt)) continue; // already deduped
  } catch {
    /* broken link from a previous run — fall through and recreate */
  }
  rmSync(link, { recursive: true, force: true });
  symlinkSync(pointAt, link, "junction");
  console.log(`[site dedupe-react] linked ${link} -> ${pointAt}`);
}
