import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initInstallPrompt } from "./lib/installPrompt";
import { setNeedsRefresh, setUpdateFn } from "./lib/swUpdate";
import "./index.css";

const updateSW = registerSW({
  onNeedRefresh() {
    setNeedsRefresh(true);
  },
  onOfflineReady() {}
});
setUpdateFn(updateSW);

initInstallPrompt();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
