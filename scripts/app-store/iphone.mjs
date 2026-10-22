// The iPhone every Headpin screenshot is taken on and drawn in: the 6.9 inch
// iPhone (16 Pro Max, 17 Pro Max), in points. One model for the App Store set
// (screenshots.mjs, frame.html) and the landing page (capture-shots.mjs and the
// CSS phone in index.html, which copies these numbers as ratios), so the two
// sets of pictures are the same phone.
//
// Plain data with no Node imports: frame.html loads it in the browser.

/** The screen, in points, and the scale App Store Connect wants it at. */
export const SCREEN = { width: 440, height: 956 };
export const STORE_DPR = 3;

/** The safe areas the app lays itself out around, as the phone reports them. */
export const INSETS = { top: 62, bottom: 34, left: 0, right: 0 };

/**
 * The glass's own corner (UIScreen's display corner radius, 55pt on the 14 to
 * 15 Pro and 62pt from the 16 Pro on), the Dynamic Island's pill and how far
 * it sits from the top edge. The drawn phone was 55 with a 125 x 37 island at
 * 11, the 15 Pro's numbers, and with a thick bezel it read as an older phone.
 */
export const CORNER = 62;
export const ISLAND = { width: 126, height: 37, top: 14 };

/**
 * The black border round the glass plus the titanium edge, each side: the body
 * is 77.6mm across and the screen 72.9mm, so 2.35mm a side, 14pt at this
 * screen's 0.166mm a point. The body's outer corner is the glass's plus that.
 */
export const BEZEL = 14;
export const EDGE = 3;

/**
 * The status bar, drawn into the top inset where the phone's own would be: the
 * time centred in the left ear and signal, Wi-Fi and battery centred in the
 * right, each ear the space between the corner's curve and the island. A
 * screenshot taken on a phone carries no island, so a plain shot has none; the
 * phone it is set in draws it.
 */
const ICONS = `<svg viewBox="0 0 78 13" width="78" height="13" fill="currentColor"><rect x="0" y="8" width="3.2" height="4.5" rx="1"/><rect x="4.7" y="6" width="3.2" height="6.5" rx="1"/><rect x="9.4" y="3.5" width="3.2" height="9" rx="1"/><rect x="14.1" y="1" width="3.2" height="11.5" rx="1"/><path d="M31 2.6a10 10 0 0 1 7 2.9l1.3-1.3A11.9 11.9 0 0 0 31 .7a11.9 11.9 0 0 0-8.3 3.5L24 5.5a10 10 0 0 1 7-2.9Zm0 3.7a6.3 6.3 0 0 1 4.4 1.8l1.3-1.3A8.1 8.1 0 0 0 31 4.4a8.1 8.1 0 0 0-5.7 2.4l1.3 1.3A6.3 6.3 0 0 1 31 6.3Zm0 3.7c.7 0 1.3.3 1.8.7L31 12.5l-1.8-1.8c.5-.4 1.1-.7 1.8-.7Z"/><rect x="50.5" y="0.5" width="24" height="12" rx="3.6" fill="none" stroke="currentColor" stroke-opacity="0.4"/><rect x="52.5" y="2.5" width="20" height="8" rx="2"/><path d="M76 4.2v4.6a2.5 2.5 0 0 0 0-4.6Z" fill-opacity="0.45"/></svg>`;

/** Draws the status bar over `page`, in `colour`. `removeStatusBar` takes it
 *  off again. */
export async function drawStatusBar(page, colour) {
  await page.evaluate(
    ({ icons, colour, top, island, width }) => {
      document.getElementById("store-status-bar")?.remove();
      const ear = (width - island.width) / 2;
      const bar = document.createElement("div");
      bar.id = "store-status-bar";
      bar.innerHTML = `<span>9:41</span><span>${icons}</span>`;
      Object.assign(bar.style, {
        position: "fixed", left: "0", right: "0", top: "0", height: `${top}px`, zIndex: "2147483647",
        pointerEvents: "none", display: "grid", gridTemplateColumns: `${ear}px 1fr ${ear}px`,
        alignItems: "center", color: colour,
        font: "600 17px/1 Inter, system-ui, sans-serif", letterSpacing: "-0.01em"
      });
      // Centred in each ear, a little in from the corner's curve, and on the
      // island's centre line, as iOS sets them.
      const [time, right] = bar.children;
      for (const [el, col] of [[time, "1"], [right, "3"]]) {
        Object.assign(el.style, { gridColumn: col, gridRow: "1", justifySelf: "center", display: "flex",
          paddingTop: `${(island.top + island.height / 2) * 2 - top}px` });
      }
      time.style.paddingLeft = "12px";
      right.style.paddingRight = "12px";
      document.body.appendChild(bar);
    },
    { icons: ICONS, colour, top: INSETS.top, island: ISLAND, width: SCREEN.width }
  );
}

export async function removeStatusBar(page) {
  await page.evaluate(() => document.getElementById("store-status-bar")?.remove());
}

/**
 * Runs before the app on every page of `context`: the page is told it is
 * inside the iPhone app, as Capacitor's native side tells it (ADR-155), so it
 * shows the app's own copy (no "this browser may clear your scores") and sells
 * Pro through the store plugin, which answers as StoreKit would at the US
 * price. Pro is owned only where `localStorage["store-shots.pro"]` is "1", so a
 * free screen shows exactly what a free download does. Every other plugin is
 * missing, and the app falls back as it does when one is (the tab bar is then
 * the page's own, ADR-161).
 */
export async function actAsIphoneApp(context) {
  await context.addInitScript(() => {
    const owned = localStorage.getItem("store-shots.pro") === "1";
    const ids = owned ? ["app.headpin.pro"] : [];
    const answers = {
      HeadpinStore: {
        product: { id: "app.headpin.pro", name: "Headpin Pro", price: "$9.99" },
        entitlements: { ids },
        restore: { ids },
        removeListener: {}
      }
    };
    const methods = (names) => names.map((name) => ({ name, rtype: name === "addListener" ? "callback" : "promise" }));
    window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      PluginHeaders: [{ name: "HeadpinStore", methods: methods(["product", "purchase", "entitlements", "restore", "addListener", "removeListener"]) }],
      nativePromise: (plugin, method) =>
        answers[plugin]?.[method] ? Promise.resolve(answers[plugin][method]) : Promise.reject(new Error(`${plugin}.${method} is not in the screenshot bridge`)),
      nativeCallback: () => Promise.resolve("store-shots"),
      convertFileSrc: (path) => path
    };
  });
}

/** The phone's safe areas on `page`, so the app pads round the status bar and
 *  the home indicator as it does on the phone. */
export async function emulateSafeAreas(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: INSETS });
}
