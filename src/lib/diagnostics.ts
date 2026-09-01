import { countDatabase } from "../services/backupRepository";
import { feedbackMailto } from "./links";

/**
 * The state a bug report needs and a screenshot never carries.
 *
 * Nothing here leaves the device on its own: the app has no backend and no
 * telemetry, so the only way this text reaches anyone is the user copying it
 * and pasting it into the feedback form. That is the whole design. It keeps
 * the privacy promise literally true while still answering the two questions
 * every report raises, which build is this and how much data is in it.
 */
export interface Diagnostics {
  version: string;
  built: string;
  install: "installed" | "browser tab";
  storage: "persistent" | "best effort" | "unknown";
  screen: string;
  browser: string;
  counts: Record<string, number>;
}

function installMode(): Diagnostics["install"] {
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari never implemented the media query for its own home-screen mode.
    (navigator as { standalone?: boolean }).standalone === true;
  return standalone ? "installed" : "browser tab";
}

async function storageMode(): Promise<Diagnostics["storage"]> {
  if (!navigator.storage?.persisted) return "unknown";
  try {
    return (await navigator.storage.persisted()) ? "persistent" : "best effort";
  } catch {
    return "unknown";
  }
}

export async function collectDiagnostics(): Promise<Diagnostics> {
  const [storage, counts] = await Promise.all([storageMode(), countDatabase()]);
  return {
    version: __APP_VERSION__,
    built: __BUILD_TIME__,
    install: installMode(),
    storage,
    screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio ?? 1}x`,
    browser: navigator.userAgent,
    counts: counts as unknown as Record<string, number>
  };
}

/** Plain text, because it is pasted into a form field, not parsed. */
export function formatDiagnostics(d: Diagnostics): string {
  const counts = Object.entries(d.counts)
    .map(([table, n]) => `${table}=${n}`)
    .join(" ");
  return [
    "Headpin diagnostics",
    `version: ${d.version} (built ${d.built})`,
    `install: ${d.install}`,
    `storage: ${d.storage}`,
    `screen:  ${d.screen}`,
    `browser: ${d.browser}`,
    `data:    ${counts}`
  ].join("\n");
}

/**
 * Open a feedback email with the diagnostics already attached, both ways.
 *
 * Both ways because neither is reliable alone: mail clients differ on whether
 * they honour a prefilled `body`, and the clipboard is denied outright in some
 * embedded webviews. Between them, the report arrives with a build number on
 * it without anybody having to be asked for one.
 *
 * Still nothing automatic: the mail sits in the user's drafts, and they read
 * what is in it before they send it.
 */
export async function openFeedbackEmail(): Promise<void> {
  const text = formatDiagnostics(await collectDiagnostics());
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Denied. The mail body is the other half of this for exactly that reason.
  }
  window.location.href = feedbackMailto(text);
}
