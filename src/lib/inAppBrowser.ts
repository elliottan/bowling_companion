/**
 * A web page shown over the app, in the store apps.
 *
 * The privacy policy and terms are a page on the site (`LEGAL_URL`). A plain
 * link would hand the bowler to Safari or Chrome and leave them to find their
 * way back; the platform's in-app browser (a Safari view controller on iOS, a
 * Custom Tab on Android) opens over the app with its own Done button and drops
 * them where they were. The plugin is imported on first use, so the web app's
 * bundle never loads it.
 */
export async function openInAppBrowser(url: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}
