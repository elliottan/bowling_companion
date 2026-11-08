import base from "./playwright.config";
export default {
  ...base,
  projects: (base.projects ?? [])
    .filter((p) => p.name !== "webkit")
    .map((p) => ({ ...p, use: { ...p.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } } }))
};
