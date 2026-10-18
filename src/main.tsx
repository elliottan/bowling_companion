import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initInstallPrompt } from "./lib/installPrompt";
import { isNativeApp } from "./lib/platform";
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
