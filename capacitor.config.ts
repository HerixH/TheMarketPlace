import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shells for Google Play and the App Store.
 * The app is the website running inside a WebView, so payments, escrow, and
 * orders stay on the Next.js server.
 *
 *   npm run mobile:add      # create android/ and ios/ once
 *   npm run mobile:android  # open Android Studio
 *   npm run mobile:ios      # open Xcode (Mac only)
 *
 * Point the shell at a running server:
 *   CAP_SERVER_URL=http://192.168.1.20:3000 npm run mobile:sync
 * Android emulator reaches the host machine at http://10.0.2.2:3000.
 */
const config: CapacitorConfig = {
  appId: "app.themarketplace.stellar",
  appName: "The Market Place",
  webDir: "public",
  server: {
    url: process.env.CAP_SERVER_URL || "http://localhost:3000",
    cleartext: true,
    androidScheme: "https",
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
