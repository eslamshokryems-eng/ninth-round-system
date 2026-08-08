#!/usr/bin/env node
// Next.js 14 ships its own private, peer-satisfied copies of `react` /
// `react-dom` under `next/node_modules/`, and `styled-jsx` (a dependency
// of `next`, used for Next's built-in /404 and /500 pages) gets its OWN
// separate private copy of `react` on top of that — three physically
// distinct installations of the same 18.2.0 version. Because this repo's
// `apps/mobile` needs React 19 (RN 0.81's exact requirement) while
// `apps/web` needs React 18 (Next 14's peer requirement), pnpm can't
// simply hoist one shared `react` to the workspace root the way it could
// in a single-React-version repo — that's what forces `next` to nest its
// own private copy to satisfy its peer dependency in the first place.
//
// The bug: pnpm doesn't reuse `next`'s already-correctly-resolved nested
// `react` for `styled-jsx`'s *own* peer requirement (even though `next`'s
// copy already satisfies it), so `styled-jsx` gets a fourth, separate
// physical copy. Three different `react` module instances (`apps/web`'s,
// `next`'s nested one, and `styled-jsx`'s nested one) each have their own
// independent copy of React's internal dispatcher state. When Next
// pre-renders its built-in /404 and /500 pages, react-dom-server (bound
// to `next`'s nested react) calls into `styled-jsx`'s `<StyleRegistry>`
// (bound to yet another react instance), which calls `useContext` against
// a dispatcher that was never set on *that* instance — crashing
// `next build` outright ("Cannot read properties of null (reading
// 'useContext')"), even though every one of the 13 real Reception routes
// still compiles and renders correctly.
//
// Fix: force `next/node_modules/{react,react-dom}` and
// `styled-jsx/node_modules/react` to be the *same physical directory* as
// `apps/web/node_modules/{react,react-dom}` (all already 18.2.0 — this
// isn't a version change, purely a dedup) via a directory junction, which
// needs no elevated privileges on Windows (unlike a regular symlink) and
// is a plain symlink on macOS/Linux. Run automatically via the root
// `postinstall` script, since a fresh `pnpm install` re-creates the
// separate nested copies every time.

import { existsSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const WEB_REACT = join(REPO_ROOT, "apps/web/node_modules/react");
const WEB_REACT_DOM = join(REPO_ROOT, "apps/web/node_modules/react-dom");

const TARGETS = [
  { link: join(REPO_ROOT, "node_modules/next/node_modules/react"), pointAt: WEB_REACT },
  { link: join(REPO_ROOT, "node_modules/next/node_modules/react-dom"), pointAt: WEB_REACT_DOM },
  { link: join(REPO_ROOT, "node_modules/styled-jsx/node_modules/react"), pointAt: WEB_REACT },
];

// A fresh clone or an environment that hasn't built apps/web's own
// dependencies yet (e.g. this ran before apps/web was ever installed) —
// nothing to dedup against, skip quietly rather than error.
if (!existsSync(WEB_REACT) || !existsSync(WEB_REACT_DOM)) {
  console.log("[fix-next-react-dedup] apps/web/node_modules/react(-dom) not found yet — skipping.");
  process.exit(0);
}

for (const { link, pointAt } of TARGETS) {
  if (!existsSync(link)) continue; // nothing to fix for this install (e.g. styled-jsx not present at all)

  try {
    if (realpathSync(link) === realpathSync(pointAt)) continue; // already deduped
  } catch {
    // realpathSync can throw on a broken/self-referential symlink left over from a previous run — fall through and recreate it.
  }

  rmSync(link, { recursive: true, force: true });
  symlinkSync(pointAt, link, "junction");
  console.log(`[fix-next-react-dedup] linked ${link} -> ${pointAt}`);
}
