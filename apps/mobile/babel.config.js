module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // As of Reanimated 4, the worklets transform lives in its own package
    // (react-native-reanimated/plugin now just re-exports this) — must
    // always be listed last.
    plugins: ["react-native-worklets/plugin"],
  };
};
