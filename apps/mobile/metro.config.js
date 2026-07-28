const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo + pnpm resolution — pnpm's node_modules is a strict symlink tree
// (not hoisted/flat), so Metro needs explicit help finding workspace
// packages: watch the whole workspace, look in both node_modules
// locations, and follow pnpm's symlinks. See
// https://docs.expo.dev/guides/monorepos/ (pnpm section).
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;

module.exports = withNativeWind(config, { input: "./global.css" });
