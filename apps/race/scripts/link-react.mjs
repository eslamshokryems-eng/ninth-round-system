// The workspace hoists ONE copy of `next` (root node_modules/next), whose nested react/react-dom the repo's root
// postinstall (scripts/fix-next-react-dedup.mjs) points at a single physical React. THE NINTH's app must render with
// that very same React instance, or Next's built-in /404 and /500 pages crash the build ("Cannot read properties of
// null (reading 'useContext')": two React copies, two dispatchers).
//
// So: make this app's react / react-dom the same physical directories, when (and only when) they are the same version.
// Build-time only; it changes nothing that ships and touches no other app's files.
import { existsSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = dirname(dirname(fileURLToPath(import.meta.url)));
const SHARED = join(APP, "..", "web", "node_modules");
const version = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;

for (const pkg of ["react", "react-dom"]) {
  const mine = join(APP, "node_modules", pkg);
  const shared = join(SHARED, pkg);
  if (!existsSync(mine) || !existsSync(shared)) continue;
  if (realpathSync(mine) === realpathSync(shared)) continue;
  if (version(mine) !== version(shared)) {
    console.warn(`[race-web] ${pkg} versions differ (${version(mine)} vs ${version(shared)}) — not linking`);
    continue;
  }
  rmSync(mine, { recursive: true, force: true });
  symlinkSync(shared, mine, "junction");
  console.log(`[race-web] ${pkg} shares the workspace's single React instance`);
}
