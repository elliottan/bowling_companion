import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initInstallPrompt } from "./lib/installPrompt";
import { applyNativeChrome, followThemeInSystemBars } from "./lib/nativeChrome";
import { listenForLinks } from "./lib/deepLink";
import { isNativeApp } from "./lib/platform";
import { startTextSize } from "./lib/textScale";
import { startI18n } from "./lib/i18n";
import { installPressCancel } from "./lib/pressCancel";
import {
  initForegroundUpdateCheck,
  setNeedsRefresh,
  setRegistration,
  setUpdateFn
} from "./lib/swUpdate";
import "./index.css";

// The store app has no service worker to register: the iOS web view does not
// run one for the app's own scheme, and its code updates come with an app
// release, not a deploy. Nor is there anything to install (ADR-155).
if (!isNativeApp()) {
  const updateSW = registerSW({
    onNeedRefresh() {
      setNeedsRefresh(true);
    },
    onRegisteredSW(_url, registration) {
      if (registration) setRegistration(registration);
    }
  });
  setUpdateFn(updateSW);

  // An installed app can sit in the background for weeks, so coming back to the
  // foreground is when to look for a new worker. A check, never an apply.
  initForegroundUpdateCheck();

  initInstallPrompt();
}

// The bowler's Text size, before the first screen is drawn (ADR-219).
startTextSize();
applyNativeChrome();
followThemeInSystemBars();
// A touch dragged off a control before it lifts presses nothing (ADR-185).
installPressCancel();
// A headpin.app link the phone opens in the store app (ADR-159).
void listenForLinks();

// The language is chosen before the first screen is drawn, so nothing flashes
// in English first (ADR-220). `startI18n` falls back to English if a catalog
// cannot be loaded, so it never leaves the app unrendered.
void startI18n().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
});
