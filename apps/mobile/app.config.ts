import type { ExpoConfig } from "expo/config";

// Values are placeholders — see docs/08-deployment-plan.md for per-environment
// (development/staging/production) configuration strategy.
const config: ExpoConfig = {
  name: "9th Round",
  slug: "9th-round",
  scheme: "9thround",
  owner: "9th-round",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.ninthround.app",
    supportsTablet: false,
    usesAppleSignIn: true,
  },
  android: {
    package: "com.ninthround.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0B0B0C",
    },
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        backgroundColor: "#0B0B0C",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "9th Round needs access to your photo library to attach a member's profile photo.",
        cameraPermission: "9th Round needs access to your camera to take a member's profile photo.",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "REPLACE_WITH_EAS_PROJECT_ID",
    },
  },
};

export default config;
