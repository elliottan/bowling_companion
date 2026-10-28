import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Driver } from "./driver";

/**
 * The store app, walked feature by feature on a real web view (ADR-155).
 *
 * Not a replacement for the Playwright suite, which covers the features in
 * depth in two browsers. This is the part only a device can say: that the app
 * boots from its own bundle, finds its catalogs offline, keeps what it saves
 * across a relaunch, answers the platform's back, and that taps land where the
 * page is painted. Every check is recorded and the walk carries on past a
 * failure, so one run reports everything, with a screenshot at each step.
 */

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  ms: number;
}

/** In-page helpers, installed on every evaluate (a reload clears them). */
const PAGE_HELPERS = String.raw`
(() => {
  if (window.__dc) return;
  const nameOf = (el) =>
    (el.getAttribute("aria-label") ||
      (el.getAttribute("aria-labelledby") || "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ") ||
      el.getAttribute("placeholder") ||
      el.textContent ||
      "").replace(/\s+/g, " ").trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.01;
  };
  const scopeFor = (dialog) => {
    if (!dialog) return document;
    const re = new RegExp(dialog, "i");
    const all = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
    return all.reverse().find((d) => re.test(nameOf(d))) || null;
  };
  const CONTROLS = 'button, a[href], [role="button"], [role="tab"], [role="link"], input, textarea, select, summary';
  window.__dc = {
    find(label, dialog, kinds) {
      const scope = scopeFor(dialog);
      if (!scope) return null;
      const re = new RegExp(label, "i");
      const els = [...scope.querySelectorAll(kinds || CONTROLS)].filter(
        (el) =>
          visible(el) &&
          !el.disabled &&
          (re.test(nameOf(el)) || re.test(el.getAttribute("placeholder") || ""))
      );
      // The topmost match: the last in document order is the one stacked
      // above the rest, the way a sheet sits over the screen it came from.
      const el = els[els.length - 1];
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      // What a finger at that point would hit. On iOS a stray document scroll
      // once left every tap 62px off its target (docs/VIEWPORT-BUG.md).
      const hit = document.elementFromPoint(x, y);
      const hits = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      const over = hit ? (hit.tagName.toLowerCase() + " " + nameOf(hit)).slice(0, 60) : "nothing";
      return { x, y, hits, over };
    },
    text() {
      return document.body.innerText;
    },
    dialogs() {
      return [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(nameOf);
    },
    async count(store) {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("BowlingCompanionDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        if (!db.objectStoreNames.contains(store)) return -2;
        return await new Promise((resolve) => {
          const req = db.transaction(store).objectStore(store).count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(-1);
        });
      } finally {
        // An open connection held by the walk would block the app's own
        // upgrade of the database.
        db.close();
      }
    },
    blur() {
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      return true;
    }
  };
})();
`;

export class Flow {
  readonly results: CheckResult[] = [];
  private shot = 0;

  constructor(
    private readonly d: Driver,
    private readonly outDir: string,
    private readonly slow = 1
  ) {
    mkdirSync(outDir, { recursive: true });
  }

  async js<T>(expression: string): Promise<T> {
    // The helpers are a statement; the comma joins them to the expression as
    // one expression, which leaves no room for the statement's semicolon.
    return this.d.evaluate<T>(`(${PAGE_HELPERS.trim().replace(/;$/, "")}, ${expression})`);
  }

  /** Poll until `expression` is truthy, scaled for a slow emulator. */
  async until(
    expression: string,
    what: string,
    timeoutMs = 20_000,
    accept: (value: unknown) => boolean = Boolean
  ): Promise<unknown> {
    const deadline = Date.now() + timeoutMs * this.slow;
    let last: unknown;
    while (Date.now() < deadline) {
      try {
        last = await this.js(expression);
        if (accept(last)) return last;
      } catch {
        // The page may be mid-reload.
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for ${what}${last === undefined ? "" : ` (last read ${JSON.stringify(last).slice(0, 80)})`}`);
  }

  async hasText(text: string, timeoutMs?: number) {
    await this.until(`__dc.text().includes(${JSON.stringify(text)})`, `"${text}" on screen`, timeoutMs);
  }

  async tap(label: string, dialog?: string, kinds?: string) {
    const find = `__dc.find(${JSON.stringify(label)}, ${JSON.stringify(dialog ?? null)}, ${JSON.stringify(kinds ?? null)})`;
    const what = `a control named /${label}/${dialog ? ` in "${dialog}"` : ""}`;
    await this.until(find, what);
    // Then wait for nothing to be over it: a sheet still sliding in, or one
    // fading out, takes the tap meant for the control under it.
    let target: { x: number; y: number; hits: boolean; over: string } | null = null;
    try {
      target = (await this.until(`(t => t && t.hits && t)(${find})`, `${what} to be uncovered`)) as typeof target;
    } catch {
      const last = await this.js<{ over: string } | null>(find);
      throw new Error(`/${label}/ stays covered at its own centre, by ${last?.over ?? "something"}`);
    }
    // Let a scroll into view settle before the finger comes down.
    await new Promise((r) => setTimeout(r, 300 * this.slow));
    await this.d.tapAt(target!.x, target!.y);
    await new Promise((r) => setTimeout(r, 400 * this.slow));
  }

  /**
   * Tap a tab. The web app and the Android app draw the tab bar in the page,
   * where it is found like any control. The iPhone app's is the phone's own
   * (ADR-161), which the page cannot see, so it is tapped where it is: the
   * shell publishes the bar's height as `--tab-bar-h`, and the five tabs share
   * the width equally.
   */
  async tab(label: "Home" | "Score" | "History" | "Stats" | "Settings") {
    const kinds = "nav button, [role=navigation] button";
    if (await this.js(`__dc.find("^${label}$", null, ${JSON.stringify(kinds)})`)) {
      await this.tap(`^${label}$`, undefined, kinds);
      return;
    }
    const index = ["Home", "Score", "History", "Stats", "Settings"].indexOf(label);
    const point = await this.js<{ x: number; y: number }>(
      `(() => { const h = parseFloat(getComputedStyle(document.getElementById("app-shell")).getPropertyValue("--tab-bar-h")) || 83; return { x: innerWidth * (${index} + 0.5) / 5, y: innerHeight - h + 25 }; })()`
    );
    await this.d.tapAt(point.x, point.y);
    await new Promise((r) => setTimeout(r, 600 * this.slow));
  }

  /** The platform's back, with the keyboard put away first, as a person would:
   *  on iOS an open keyboard takes the edge swipe for itself. */
  async back() {
    await this.js("__dc.blur()").catch(() => {});
    await new Promise((r) => setTimeout(r, 500 * this.slow));
    await this.d.systemBack();
  }

  /** Types into the field with this placeholder, and checks the text landed:
   *  a sheet still sliding up when the keys arrive can lose them (iOS 26), so
   *  an empty field is cleared and typed into once more. */
  async fill(placeholder: string, text: string, dialog?: string) {
    const field = `[...document.querySelectorAll("input, textarea")].find((e) => new RegExp(${JSON.stringify(placeholder)}, "i").test(e.placeholder || ""))`;
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.tap(placeholder, dialog, "input, textarea");
      await this.d.type(text);
      const landed = await this.until(`(${field})?.value === ${JSON.stringify(text)}`, `"${text}" in the field`, 3_000)
        .then(() => true)
        .catch(() => false);
      if (landed) return;
      // Clear whatever half arrived, the way React hears a person do it.
      await this.js(`(() => {
        const el = ${field};
        if (!el) return false;
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await new Promise((r) => setTimeout(r, 1000 * this.slow));
    }
    throw new Error(`"${text}" never reached the ${placeholder} field`);
  }

  async snap(name: string) {
    this.shot++;
    const file = join(this.outDir, `${String(this.shot).padStart(2, "0")}-${name}.png`);
    try {
      await this.d.screenshot(file);
    } catch (err) {
      console.warn(`screenshot ${name} failed: ${(err as Error).message}`);
    }
  }

  async check(name: string, fn: () => Promise<string | void>) {
    const start = Date.now();
    try {
      const detail = await fn();
      this.results.push({ name, ok: true, detail: detail || undefined, ms: Date.now() - start });
      console.log(`PASS  ${name}${detail ? `: ${detail}` : ""}`);
    } catch (err) {
      const detail = (err as Error).message.split("\n")[0];
      this.results.push({ name, ok: false, detail, ms: Date.now() - start });
      console.log(`FAIL  ${name}: ${detail}`);
      await this.snap(`FAIL-${name.replace(/\W+/g, "-").toLowerCase()}`);
    }
  }

  report(): boolean {
    writeFileSync(join(this.outDir, "results.json"), JSON.stringify(this.results, null, 2));
    const failed = this.results.filter((r) => !r.ok);
    console.log(`\n${this.results.length - failed.length}/${this.results.length} checks passed`);
    return failed.length === 0;
  }

  /** Close sheets and pushed screens with the page's own Back and Close. */
  async toTabs() {
    for (let i = 0; i < 6; i++) {
      const open = await this.js<string[]>("__dc.dialogs()");
      if (open.length === 0) return;
      const top = open[open.length - 1];
      const closer = await this.js<{ x: number; y: number } | null>(
        `__dc.find("^(Back|Close|Done)$", ${JSON.stringify(top.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))})`
      );
      if (!closer) return;
      await this.d.tapAt(closer.x, closer.y);
      await new Promise((r) => setTimeout(r, 600 * this.slow));
    }
  }
}

/** True once a tab bar is there to tap: the page's own, or the room the shell
 *  leaves for the phone's. */
const TAB_BAR_PRESENT = `!!document.querySelector("nav button, [role=navigation] button") || parseFloat(getComputedStyle(document.getElementById("app-shell") || document.body).getPropertyValue("--tab-bar-h")) > 0`;

/** The walk itself. */
export async function runFlow(d: Driver, outDir: string, opts: { slow?: number; online: boolean }) {
  const f = new Flow(d, outDir, opts.slow ?? 1);
  const ALLEY = "Device Lanes";

  await f.check("boots into the first run from the app's own bundle", async () => {
    await f.until(`__dc.dialogs().some((n) => /Set up Headpin/i.test(n)) || __dc.text().includes("Start session")`, "the first screen", 120_000);
    await f.snap("first-run");
    const origin = await f.js<string>("location.origin");
    return `origin ${origin}`;
  });

  await f.check("knows it is the store app: no service worker, no install prompt", async () => {
    const native = await f.js<boolean>("window.Capacitor?.isNativePlatform?.() === true");
    if (!native) throw new Error("window.Capacitor does not report a native platform");
    const workers = await f.js<number>("navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0");
    if (workers !== 0) throw new Error(`${workers} service worker(s) registered`);
    const link = await f.js<unknown>(`__dc.find("^What is Headpin\\\\?$")`);
    if (link) throw new Error('"What is Headpin?" links out to the landing page');
  });

  await f.check("first run: start fresh and pick a hand", async () => {
    await f.tap("^Start fresh$", "Set up Headpin");
    await f.tap("right-handed", "Set up Headpin");
    await f.tap("^Next$", "Set up Headpin");
    await f.until(`!__dc.dialogs().some((n) => /Set up Headpin/i.test(n))`, "the first run to close");
    await f.snap("home");
  });

  await f.check("pattern catalog seeds the bowler's patterns", async () => {
    const n = (await f.until(`__dc.count("oil_patterns")`, "pattern rows", 120_000, (n) => (n as number) > 10)) as number;
    return `${n} patterns`;
  });

  await f.check(`ball catalog loads when the catalog opens (${opts.online ? "online" : "offline, from the built-in snapshot"})`, async () => {
    // Launch only syncs it for an arsenal with catalog balls in it (ADR-143);
    // the catalog screen always does.
    await f.toTabs();
    await f.tab("Home");
    await f.tap("^Ball catalog");
    const n = (await f.until(`__dc.count("ball_catalog")`, "catalog rows", 180_000, (n) => (n as number) > 100)) as number;
    return `${n} balls`;
  });

  await f.check("catalog screen: search, and photos load from headpin.app", async () => {
    await f.fill("Search name, brand, coverstock", "phaze");
    await f.until(`__dc.find("Phaze")`, "a Phaze in the results");
    if (!opts.online) {
      // With no signal a photo fails, and the tile keeps its brand-coloured
      // ball instead of a broken image, which is the app working.
      await f.snap("catalog");
      return "offline: photos fall back to the brand placeholder";
    }
    const srcs = (await f.until(
      `(() => { const s = [...document.images].map((i) => i.getAttribute("src")).filter((s) => s && s.includes("/catalog/img/")); return s.length > 0 && s; })()`,
      "catalog photos on the screen"
    )) as string[];
    if (!srcs.every((s) => s.startsWith("https://headpin.app/"))) throw new Error(`a photo is not from headpin.app: ${srcs[0]}`);
    let loaded = 0;
    if (opts.online) {
      loaded = (await f.until(
        `(() => { const n = [...document.images].filter((i) => i.src.includes("/catalog/img/") && i.complete && i.naturalWidth > 0).length; return n > 0 && n; })()`,
        "a photo to load",
        60_000
      )) as number;
    }
    await f.snap("catalog");
    return opts.online ? `${loaded} photos loaded` : `${srcs.length} photos point at headpin.app (no network here)`;
  });

  await f.check("system back closes the catalog", async () => {
    await f.back();
    await f.until(`!__dc.dialogs().some((n) => /Catalog/i.test(n))`, "the catalog to close");
  });

  await f.check("arsenal: add a ball", async () => {
    await f.toTabs();
    await f.tap("^(Add the balls you throw|Arsenal)$");
    await f.tap("^Add ball$");
    await f.fill("e.g. Storm Phaze II", "Device Phaze");
    await f.tap("^Add$");
    await f.hasText("Device Phaze");
    await f.snap("arsenal");
  });

  await f.check("start a session", async () => {
    await f.toTabs();
    await f.tab("Home");
    await f.tap("^Start scoring$");
    await f.fill("Pinecrest Lanes", ALLEY, "Start session");
    await f.snap("keyboard-up");
    await f.tap("^Start session$", "Start session");
    await f.tap("^Close$", "lanes");
    await f.until(`__dc.find("^Next")`, "the scorer");
    await f.snap("scorer");
  });

  await f.check("score a game: taps on the pin deck, strike, spare, open", async () => {
    // Frame 1, a strike: on the first ball every pin starts down, so Next
    // with nothing tapped records ten.
    await f.tap("^Next");
    // Frame 2, 7 left standing then picked up: a spare.
    await f.tap("^Pin 7 down$");
    await f.tap("^Next");
    await f.tap("^Pin 7 standing$");
    await f.tap("^Next");
    // Frame 3, an open: leave the 10, then miss it.
    await f.tap("^Pin 10 down$");
    await f.tap("^Next");
    await f.tap("^Next");
    // Frame 1 = 10 + 9 + 1 = 20, frame 2 = 10 + 9 = 39, frame 3 = 48.
    await f.hasText("48");
    await f.snap("scored");
  });

  await f.check("finish the game with strikes: 48 plus seven strikes is a 258", async () => {
    // Frames 4 to 10: strike, strike, strike... with two fill balls.
    for (let i = 0; i < 9; i++) await f.tap("^Next");
    await f.until(`!__dc.find("^Next")`, "the game to finish", 30_000);
    await f.hasText("258");
    await f.snap("game-finished");
  });

  await f.check("history lists the session", async () => {
    await f.toTabs();
    await f.tab("History");
    await f.until(`__dc.find(${JSON.stringify(ALLEY)})`, "the session row");
    await f.snap("history");
  });

  await f.check("stats show the game", async () => {
    await f.tab("Stats");
    await f.hasText("258");
    await f.snap("stats");
  });

  // The iOS app sells Pro (ADR-158), so a deeper card is locked and offers the
  // purchase, and Settings carries Restore purchase. The Android app sells
  // nothing yet and keeps every card open. The purchase itself needs Apple's
  // sheet and a sandbox account, so it is tried by hand, in Xcode, against
  // ios/App/App/Headpin.storekit.
  if (d.platform === "ios") {
    await f.check("the app's own plugins answer: the tab bar is the phone's, and the store reports ownership", async () => {
      // The phone's bar replaces the page's own, so no tab bar in the page means
      // the native one is up; the page's own comes back if the phone never answers.
      // Only a drawn button counts: the wide screen's header keeps its own nav in
      // the page at every width, hidden on a phone, and a bare querySelector
      // found it there whichever bar was up, so this never once passed.
      await f.until(
        `![...document.querySelectorAll("nav button, [role=navigation] button")].some((b) => b.getClientRects().length > 0)`,
        "the page to hand its tab bar to the phone",
        30_000
      );
      // StoreKit answers `entitlements` from the phone, and the page writes its
      // answer down, so a stored answer proves a call reached native and came back.
      await f.until(`localStorage.getItem("headpin.proOwned") !== null`, "the store plugin to answer", 30_000);
    });
  }

  await f.check("Pro: what the app offers, and Restore purchase", async () => {
    const offer = `__dc.find("^Get Headpin Pro")`;
    if (d.platform === "ios") {
      await f.until(offer, "a locked card offering Headpin Pro");
      await f.snap("pro-locked");
      await f.tab("Settings");
      await f.until(`__dc.find("^Restore purchase")`, "Restore purchase in Settings");
      await f.snap("pro-settings");
      return "locked, with the purchase and Restore purchase";
    }
    if (await f.js(offer)) throw new Error("the Android app offers Pro, which it cannot sell yet");
    return "open: nothing sold on Android yet";
  });

  await f.check("oil patterns open, and a pattern draws on the lane", async () => {
    await f.toTabs();
    await f.tab("Home");
    await f.tap("^Oil patterns");
    await f.until(`__dc.dialogs().some((n) => /Oil patterns/i.test(n))`, "the pattern list");
    await f.snap("patterns");
    await f.back();
    await f.until(`!__dc.dialogs().some((n) => /Oil patterns/i.test(n))`, "back to Home");
  });

  await f.check("line sandbox and layout lab open", async () => {
    // Opened from their rows on Home, as a bowler opens them.
    await f.toTabs();
    await f.tab("Home");
    await f.tap("^Line visualizer");
    await f.until(`document.querySelector("svg") && __dc.dialogs().length > 0`, "the line sandbox");
    await f.snap("line-sandbox");
    await f.toTabs();
    await f.until(`__dc.dialogs().length === 0`, "the line sandbox to close");
    await f.tap("^Layouts");
    await f.until(`document.querySelectorAll("svg").length > 0 && __dc.dialogs().length > 0`, "the layout lab");
    await f.snap("layout-lab");
    await f.toTabs();
  });

  await f.check("backup: Save a backup opens the platform's share sheet", async () => {
    await f.tab("Settings");
    await f.tap("^Backup & restore");
    // Record every call the page makes to a native plugin, and any download it
    // tries: a file the platform drops leaves no trace in the page otherwise
    // (ADR-156).
    await f.js(`(() => {
      window.__dcSaved = [];
      const cap = window.Capacitor;
      const call = cap.nativePromise;
      cap.nativePromise = (plugin, method, options) => {
        window.__dcSaved.push(plugin + "." + method + (options && options.path ? ":" + options.path : ""));
        return call.call(cap, plugin, method, options);
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { window.__dcSaved.push("download:" + this.download); return click.call(this); };
      return true;
    })()`);
    await f.tap("^Save a backup$");
    await f.until(`window.__dcSaved.some((c) => c.startsWith("Share.share"))`, "the share sheet to be asked for", 30_000);
    await new Promise((r) => setTimeout(r, 2000 * (opts.slow ?? 1)));
    await f.snap("backup-share-sheet");
    const saved = await f.js<string[]>("window.__dcSaved");
    if (saved.some((c) => c.startsWith("download:"))) throw new Error("the page tried a download, which the app's web view drops");
    await d.dismissSystemSheet();
    await new Promise((r) => setTimeout(r, 1500 * (opts.slow ?? 1)));
    if (!(await d.appInForeground())) throw new Error("closing the sheet left the app");
    await f.snap("backup-sheet-closed");
    return saved.join(", ");
  });

  await f.check("system back steps out of Backup & restore", async () => {
    // Only a screen that is open can prove back closes it.
    await f.until(`__dc.dialogs().some((n) => /Backup & restore/i.test(n))`, "Backup & restore to be open", 5_000);
    await f.back();
    await f.until(`!__dc.dialogs().some((n) => /Backup & restore/i.test(n))`, "Backup & restore to close");
  });

  if (d.platform === "ios") {
    await f.check("the edge swipe on a tab stays in the app", async () => {
      await f.toTabs();
      await f.back();
      if (!(await d.appInForeground())) throw new Error("the swipe left the app");
      await f.until(TAB_BAR_PRESENT, "the tab bar");
    });
  } else await f.check("system back from the first screen leaves the app", async () => {
    for (let i = 0; i < 8 && (await d.appInForeground()); i++) {
      await f.back();
      await new Promise((r) => setTimeout(r, 800 * (opts.slow ?? 1)));
    }
    if (await d.appInForeground()) throw new Error("still in the app after eight backs");
  });

  await f.check("relaunch offline: the session, the game and the catalog are all still there", async () => {
    const cut = await d.setOnline(false);
    await d.relaunch();
    await f.until(`__dc.count("games")`, "the game", 120_000, (n) => (n as number) >= 1);
    const balls = await f.js<number>(`__dc.count("ball_catalog")`);
    if (balls < 100) throw new Error(`catalog has ${balls} rows after relaunch`);
    await f.toTabs();
    await f.tab("History");
    await f.until(`__dc.find(${JSON.stringify(ALLEY)})`, "the session row");
    await f.snap("relaunched-offline");
    await d.setOnline(true);
    return cut ? "network cut" : "network could not be cut here; relaunch only";
  });

  return f.report();
}
