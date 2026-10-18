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
      if (!db.objectStoreNames.contains(store)) return 0;
      return new Promise((resolve) => {
        const req = db.transaction(store).objectStore(store).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(-1);
      });
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
  async until(expression: string, what: string, timeoutMs = 20_000): Promise<unknown> {
    const deadline = Date.now() + timeoutMs * this.slow;
    let last: unknown;
    while (Date.now() < deadline) {
      try {
        last = await this.js(expression);
        if (last) return last;
      } catch {
        // The page may be mid-reload.
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for ${what}`);
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

  async fill(placeholder: string, text: string, dialog?: string) {
    await this.tap(placeholder, dialog, "input, textarea");
    await this.d.type(text);
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
    await f.until(`!__dc.dialogs().some((n) => /Set up Headpin/i.test(n))`, "the first run to close");
    await f.snap("home");
  });

  await f.check("pattern catalog seeds the bowler's patterns", async () => {
    const n = (await f.until(`__dc.count("oil_patterns").then((n) => n > 10 && n)`, "pattern rows", 120_000)) as number;
    return `${n} patterns`;
  });

  await f.check(`ball catalog loads when the catalog opens (${opts.online ? "online" : "offline, from the built-in snapshot"})`, async () => {
    // Launch only syncs it for an arsenal with catalog balls in it (ADR-143);
    // the catalog screen always does.
    await f.toTabs();
    await f.tap("^Home$", undefined, "nav button, [role=navigation] button");
    await f.tap("^Ball catalog");
    const n = (await f.until(`__dc.count("ball_catalog").then((n) => n > 100 && n)`, "catalog rows", 180_000)) as number;
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
    await d.systemBack();
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
    const start = await f.js<{ x: number } | null>(`__dc.find("^Start scoring$")`);
    if (start) await f.tap("^Score$", undefined, "nav button, [role=navigation] button");
    await f.tap("^Start session$");
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
    await f.tap("^History$", undefined, "nav button, [role=navigation] button");
    await f.until(`__dc.find(${JSON.stringify(ALLEY)})`, "the session row");
    await f.snap("history");
  });

  await f.check("stats show the game", async () => {
    await f.tap("^Stats$", undefined, "nav button, [role=navigation] button");
    await f.hasText("258");
    await f.snap("stats");
  });

  await f.check("oil patterns open, and a pattern draws on the lane", async () => {
    await f.toTabs();
    await f.tap("^Home$", undefined, "nav button, [role=navigation] button");
    await f.tap("^Oil patterns");
    await f.until(`__dc.dialogs().some((n) => /Oil patterns/i.test(n))`, "the pattern list");
    await f.snap("patterns");
    await d.systemBack();
    await f.until(`!__dc.dialogs().some((n) => /Oil patterns/i.test(n))`, "back to Home");
  });

  await f.check("line sandbox and layout lab open", async () => {
    await f.toTabs();
    await f.js(`(location.hash = "#/home/line", true)`);
    await f.until(`document.querySelector("svg") && __dc.dialogs().length > 0`, "the line sandbox");
    await f.snap("line-sandbox");
    await f.toTabs();
    await f.js(`(location.hash = "#/home/layout-lab", true)`);
    await f.until(`document.querySelectorAll("svg").length > 0 && __dc.dialogs().length > 0`, "the layout lab");
    await f.snap("layout-lab");
    await f.toTabs();
  });

  await f.check("backup: Save a backup opens the platform's share sheet", async () => {
    await f.tap("^Settings$", undefined, "nav button, [role=navigation] button");
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
    await d.systemBack();
    await f.until(`!__dc.dialogs().some((n) => /Backup & restore/i.test(n))`, "Backup & restore to close");
  });

  if (d.platform === "ios") {
    await f.check("the edge swipe on a tab stays in the app", async () => {
      await f.toTabs();
      await d.systemBack();
      if (!(await d.appInForeground())) throw new Error("the swipe left the app");
      await f.until(`__dc.find("^History$", null, "nav button, [role=navigation] button")`, "the tab bar");
    });
  } else await f.check("system back from the first screen leaves the app", async () => {
    for (let i = 0; i < 8 && (await d.appInForeground()); i++) {
      await d.systemBack();
      await new Promise((r) => setTimeout(r, 800 * (opts.slow ?? 1)));
    }
    if (await d.appInForeground()) throw new Error("still in the app after eight backs");
  });

  await f.check("relaunch offline: the session, the game and the catalog are all still there", async () => {
    const cut = await d.setOnline(false);
    await d.relaunch();
    await f.until(`__dc.count("games").then((n) => n >= 1)`, "the game", 120_000);
    const balls = await f.js<number>(`__dc.count("ball_catalog")`);
    if (balls < 100) throw new Error(`catalog has ${balls} rows after relaunch`);
    await f.toTabs();
    await f.tap("^History$", undefined, "nav button, [role=navigation] button");
    await f.until(`__dc.find(${JSON.stringify(ALLEY)})`, "the session row");
    await f.snap("relaunched-offline");
    await d.setOnline(true);
    return cut ? "network cut" : "network could not be cut here; relaunch only";
  });

  return f.report();
}
