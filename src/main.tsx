import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initInstallPrompt } from "./lib/installPrompt";
import {
  initForegroundUpdateCheck,
  setNeedsRefresh,
  setRegistration,
  setUpdateFn
} from "./lib/swUpdate";
import "./index.css";

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
