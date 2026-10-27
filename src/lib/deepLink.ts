import { FREE_APP_PATH } from "./pro";
import { formatRoute } from "./appRoute";
import { isNativeApp, SITE_ORIGIN } from "./platform";

/**
 * A headpin.app link, opened in the store app (ADR-159).
 *
 * The site vouches for the app (`apple-app-site-association`, Android's
 * `assetlinks.json`), so a shared line, layout or guide link opens straight in
 * the app when it is installed, and in the web app when it is not. The phone
 * hands the app the link as it was written; this turns it into the app's own
 * address for the same screen.
 */
export function inAppLocation(url: string): string | null {
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return null;
  }
  if (link.origin !== SITE_ORIGIN) return null;
  // The free app: a shared line or layout rides in the query and the hash,
  // which the app reads on load just as the web app does.
  if (link.pathname === FREE_APP_PATH || link.pathname.startsWith(`${FREE_APP_PATH}/`)) {
    return `/${link.search}${link.hash}`;
  }
  // A guide's own page sends a browser on to the guide inside the app; the app
  // goes there directly (the route `guideAppPath` carries, without the path).
  const guide = /^\/guides\/([^/?#]+)\/?$/.exec(link.pathname);
  if (guide) {
    return `/${formatRoute({ view: "dashboard", overlays: ["guides"], guideId: decodeURIComponent(guide[1]) })}`;
  }
  return null;
}

/** Opens a link's screen in this copy of the app. A reload, because a shared
 *  line or layout is read from the address as the app starts. */
export function openInApp(url: string, loc: Pick<Location, "replace"> = window.location): boolean {
  const to = inAppLocation(url);
  if (!to) return false;
  loc.replace(to);
  return true;
}

const HANDLED_KEY = "headpin.launchLinkHandled";

/**
 * Listens for links the phone opens in the app. A link that launched the app
 * from cold arrives as the launch URL, and is opened once: the reload it
 * causes starts the app again with the same launch URL, which must not loop.
 */
export async function listenForLinks(
  native = isNativeApp(),
  storage: Pick<Storage, "getItem" | "setItem"> | null = sessionStorageOrNull(),
  open: (url: string) => boolean = (url) => openInApp(url),
  inbox: LinkInbox | null = iosLinkInbox()
): Promise<boolean> {
  if (!native) return false;
  // The iPhone app hands links over itself (ADR-214): Capacitor's own route
  // through the App plugin never reached the page on a phone.
  if (inbox) {
    window.addEventListener(LINK_EVENT, (e) => {
      const url = (e as CustomEvent<unknown>).detail;
      if (typeof url === "string") open(url);
    });
    inbox.postMessage("ready");
    return true;
  }
  const { App } = await import("@capacitor/app");
  await App.addListener("appUrlOpen", ({ url }) => {
    open(url);
  });
  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url && storage?.getItem(HANDLED_KEY) !== launch.url) {
    storage?.setItem(HANDLED_KEY, launch.url);
    open(launch.url);
  }
  return true;
}

/** The event the iPhone app raises on the page with a link it was handed. */
export const LINK_EVENT = "headpin:link";

/** Where the page tells the iPhone app it is ready for a link
 *  (`SceneDelegate.swift`); null anywhere else. */
interface LinkInbox {
  postMessage(message: "ready"): void;
}

function iosLinkInbox(): LinkInbox | null {
  const handlers = (window as { webkit?: { messageHandlers?: Record<string, LinkInbox | undefined> } }).webkit
    ?.messageHandlers;
  return handlers?.headpinLink ?? null;
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
