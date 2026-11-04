import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type RefObject } from "react";
import { unthenable } from "./nativePlugin";
import { accentHex } from "./nativeTabBar";
import { isIOSApp } from "./platform";

/**
 * The bars' controls drawn by UIKit in the iPhone app (ADR-238,
 * `ios/App/App/HeadpinGlassPlugin.swift`).
 *
 * The page cannot draw Liquid Glass: the real thing bends what is behind it and
 * swells under a finger, and CSS can only blur. So on iOS 26 and later a round
 * bar button, a bar's confirm and a bar's segmented control are each drawn by
 * the phone, as a `UIButton` in its glass configuration or a
 * `UISegmentedControl`, laid over the page exactly where the page's own control
 * sits. The page keeps the layout, the words, the state and what a tap does;
 * the phone draws it and hands a tap back.
 *
 * A native view cannot scroll or slide with the page, so it is only shown over
 * a control that has stayed put for a few frames and that nothing covers (a
 * sheet, a pushed screen). The moment the control moves or is covered the
 * native view goes and the page's own glass shows again, so a screen sliding
 * in carries the page's copy and settles into the phone's. Bars are fixed, so
 * that is almost always.
 *
 * The page's control stays in the page, transparent, under the native one:
 * VoiceOver and a keyboard still find it, and a native tap is passed to it as
 * a click, so every handler stays where it is.
 */

export interface GlassFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GlassSpec =
  | {
      kind: "button";
      /** `prominent` is a commit, tinted in the accent. */
      prominent: boolean;
      /** An SF Symbol name, when the glyph has one. */
      symbol?: string;
      /** The glyph drawn by the page, as a PNG data URL, when it has none. */
      image?: string;
      /** A count on the button's corner: the filters applied. */
      badge?: string;
      enabled: boolean;
    }
  | {
      kind: "segmented";
      options: string[];
      /** -1 when nothing is chosen yet. */
      selected: number;
      enabled: boolean;
    };

export interface GlassPlugin {
  /** Whether this phone draws glass: iOS 26 and later. */
  probe(): Promise<{ supported: boolean }>;
  /** Puts a control on screen, moves or restyles it, or hides it. */
  set(
    options: { id: string; visible: boolean; frame: GlassFrame; dark: boolean; accent: string } & GlassSpec
  ): Promise<void>;
  remove(options: { id: string }): Promise<void>;
  addListener(event: "tap", listener: (data: { id: string }) => void): Promise<{ remove: () => Promise<void> }>;
  addListener(
    event: "change",
    listener: (data: { id: string; index: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

/** The marker on a page control the phone is drawing over; CSS makes it
 *  transparent (`index.css`). */
export const NATIVE_GLASS_ATTR = "data-native-glass";

/** Frames a control has to hold still before the phone draws it. About a
 *  tenth of a second: long enough that a slide or a sheet's spring has visibly
 *  stopped, short enough that the swap is done before a finger arrives. */
export const SETTLE_TICKS = 6;

/** How often a quiet screen is checked, when nothing has moved lately. */
const IDLE_MS = 250;
/** How long after an event (a touch, a scroll, an animation) every frame is
 *  checked, rather than every `IDLE_MS`. */
const BUSY_MS = 700;

// ---------------------------------------------------------------------------
// Glyphs

/**
 * The SF Symbol for each glyph a bar button carries, by the Lucide class or
 * the app's own icon name (`data-icon`). A glyph not here is drawn by the page
 * and sent as a picture, so a new icon still works, only less crisply.
 */
const SYMBOLS: Record<string, string> = {
  "lucide-check": "checkmark",
  "lucide-x": "xmark",
  "lucide-plus": "plus",
  "lucide-pencil": "pencil",
  "lucide-ellipsis": "ellipsis",
  "lucide-more-horizontal": "ellipsis",
  "lucide-sliders-horizontal": "slider.horizontal.3",
  "lucide-chevron-left": "chevron.left",
  "lucide-arrow-up-right": "arrow.up.right",
  "lucide-download": "arrow.down.to.line",
  "lucide-chart-column": "chart.bar",
  "lucide-bar-chart-3": "chart.bar",
  "lucide-chart-bar": "chart.bar",
  ShareIosIcon: "square.and.arrow.up"
};

/** The SF Symbol for the glyph inside a control, or null where there is none. */
export function symbolFor(el: Element): string | null {
  const svg = el.querySelector("svg");
  if (!svg) return null;
  const own = svg.getAttribute("data-icon");
  if (own && SYMBOLS[own]) return SYMBOLS[own];
  for (const name of Array.from(svg.classList)) {
    if (SYMBOLS[name]) return SYMBOLS[name];
  }
  return null;
}

const rasterCache = new Map<string, Promise<string | null>>();

/**
 * The control's glyph as a PNG, black on clear, which the phone tints as a
 * template. Null where the page cannot draw it (no canvas, a failed load), and
 * then the page keeps its own control.
 */
export function rasterizeIcon(el: Element, scale = 3): Promise<string | null> {
  const svg = el.querySelector("svg");
  if (!svg) return Promise.resolve(null);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("color", "#000");
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = new XMLSerializer().serializeToString(copy);
  const cached = rasterCache.get(markup);
  if (cached) return cached;
  const size = Number(svg.getAttribute("width")) || 24;
  const drawn = new Promise<string | null>((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.round(size * scale);
    const context = canvas.getContext?.("2d");
    if (!context || typeof Image === "undefined") return resolve(null);
    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
  rasterCache.set(markup, drawn);
  return drawn;
}

// ---------------------------------------------------------------------------
// The layer

/**
 * What a finger on the page's own control would have done to focus first.
 * A tap on a page button takes focus off the text field being typed in, and
 * the app reads that blur as the keyboard going away (App's `keyboardOpen`,
 * which hides the tab bar while it is up). A tap on the phone's button never
 * reaches the page as a touch, so the field kept focus; a sheet's Add then
 * unmounted it still focused, which fires no blur, and the tab bar stayed
 * hidden after the sheet had gone. So a native tap lets go of focus as a page
 * tap would, unless focus is inside the control itself.
 */
function settleFocus(control: HTMLElement): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !control.contains(active)) active.blur();
}

interface Entry {
  el: HTMLElement;
  spec: GlassSpec;
  onChange?: (index: number) => void;
  last: GlassFrame | null;
  still: number;
  /** What was last sent, so an unchanged control costs nothing. */
  sent: string | null;
  /** Shown by the phone, and so transparent in the page. */
  shown: boolean;
}

export interface GlassLayerDeps {
  plugin: GlassPlugin;
  /** The element a finger would land on at a point (`elementFromPoint`). */
  topAt: (x: number, y: number) => Element | null;
  theme: () => { dark: boolean; accent: string };
  viewport: () => { width: number; height: number };
  frame: (run: () => void) => number;
  cancelFrame: (handle: number) => void;
  later: (run: () => void, ms: number) => number;
  cancelLater: (handle: number) => void;
  now: () => number;
  /** The page is in the background, where nothing needs drawing. */
  hidden: () => boolean;
}

function sameFrame(a: GlassFrame | null, b: GlassFrame): boolean {
  return (
    !!a &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * Every control the phone draws, and the loop that keeps each over its page
 * control or out of the way. One per page.
 */
export class GlassLayer {
  private entries = new Map<string, Entry>();
  private pending: { kind: "frame" | "later"; handle: number } | null = null;
  private busyUntil = 0;

  constructor(private deps: GlassLayerDeps) {}

  /** Wires the phone's taps and changes back to the page's controls. */
  async listen(): Promise<void> {
    await this.deps.plugin.addListener("tap", ({ id }) => {
      const entry = this.entries.get(id);
      if (!entry) return;
      settleFocus(entry.el);
      entry.el.click();
    });
    await this.deps.plugin.addListener("change", ({ id, index }) => {
      const entry = this.entries.get(id);
      if (!entry) return;
      settleFocus(entry.el);
      entry.onChange?.(index);
    });
  }

  register(id: string, el: HTMLElement, spec: GlassSpec, onChange?: (index: number) => void): () => void {
    this.entries.set(id, { el, spec, onChange, last: null, still: 0, sent: null, shown: false });
    this.wake();
    return () => {
      const entry = this.entries.get(id);
      if (entry?.el === el) {
        el.removeAttribute(NATIVE_GLASS_ATTR);
        this.entries.delete(id);
        void this.deps.plugin.remove({ id }).catch(() => {});
      }
      if (this.entries.size === 0) this.stop();
    };
  }

  update(id: string, spec: GlassSpec, onChange?: (index: number) => void): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.spec = spec;
    entry.onChange = onChange;
    this.wake();
  }

  /** Something moved or may move: check every frame for a while. */
  wake(): void {
    this.busyUntil = this.deps.now() + BUSY_MS;
    if (this.pending?.kind === "later") {
      this.deps.cancelLater(this.pending.handle);
      this.pending = null;
    }
    this.schedule();
  }

  stop(): void {
    if (!this.pending) return;
    if (this.pending.kind === "frame") this.deps.cancelFrame(this.pending.handle);
    else this.deps.cancelLater(this.pending.handle);
    this.pending = null;
  }

  private schedule(): void {
    if (this.pending || this.entries.size === 0) return;
    const run = () => {
      this.pending = null;
      this.tick();
      this.schedule();
    };
    const busy =
      this.deps.now() < this.busyUntil || Array.from(this.entries.values()).some((e) => e.still < SETTLE_TICKS);
    this.pending = busy
      ? { kind: "frame", handle: this.deps.frame(run) }
      : { kind: "later", handle: this.deps.later(run, IDLE_MS) };
  }

  /** One look at every control: where it is, whether it is still, whether it
   *  is covered, and whether the phone should be drawing it. */
  tick(): void {
    if (this.entries.size === 0) return;
    const theme = this.deps.theme();
    const view = this.deps.viewport();
    const background = this.deps.hidden();
    for (const [id, entry] of this.entries) {
      const box = entry.el.getBoundingClientRect();
      const frame = { x: box.left, y: box.top, width: box.width, height: box.height };
      entry.still = sameFrame(entry.last, frame) ? entry.still + 1 : 0;
      entry.last = frame;
      const onScreen =
        frame.width > 0 &&
        frame.height > 0 &&
        frame.x >= 0 &&
        frame.y >= 0 &&
        frame.x + frame.width <= view.width + 0.5 &&
        frame.y + frame.height <= view.height + 0.5;
      const top = onScreen ? this.deps.topAt(frame.x + frame.width / 2, frame.y + frame.height / 2) : null;
      const uncovered = !!top && (top === entry.el || entry.el.contains(top));
      const want = !background && onScreen && uncovered && entry.still >= SETTLE_TICKS;
      this.apply(id, entry, want, frame, theme);
    }
  }

  private apply(
    id: string,
    entry: Entry,
    want: boolean,
    frame: GlassFrame,
    theme: { dark: boolean; accent: string }
  ): void {
    if (!want) {
      if (!entry.shown && entry.sent === null) return;
      // The page's own control first, so there is never a frame with neither.
      entry.el.removeAttribute(NATIVE_GLASS_ATTR);
      entry.shown = false;
      if (entry.sent !== "hidden") {
        entry.sent = "hidden";
        void this.deps.plugin.set({ id, visible: false, frame, ...theme, ...entry.spec }).catch(() => {});
      }
      return;
    }
    const message = { id, visible: true, frame, ...theme, ...entry.spec };
    const key = JSON.stringify(message);
    if (key === entry.sent) return;
    entry.sent = key;
    void this.deps.plugin
      .set(message)
      .then(() => {
        // Still the latest word on this control, and still wanted: the page's
        // copy can go now the phone's is up.
        if (this.entries.get(id) === entry && entry.sent === key) {
          entry.el.setAttribute(NATIVE_GLASS_ATTR, "on");
          entry.shown = true;
        }
      })
      .catch(() => {
        if (entry.sent === key) entry.sent = null;
      });
  }
}

// ---------------------------------------------------------------------------
// The one layer, in the iPhone app

let glassPlugin: Promise<GlassPlugin> | null = null;

function loadGlassPlugin(): Promise<GlassPlugin> {
  glassPlugin ??= import("@capacitor/core").then(({ registerPlugin }) =>
    unthenable(registerPlugin<GlassPlugin>("HeadpinGlass"))
  );
  return glassPlugin;
}

function browserDeps(plugin: GlassPlugin): GlassLayerDeps {
  return {
    plugin,
    topAt: (x, y) => document.elementFromPoint(x, y),
    theme: () => ({ dark: document.documentElement.dataset.theme === "dark", accent: accentHex() }),
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
    frame: (run) => window.requestAnimationFrame(run),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    later: (run, ms) => window.setTimeout(run, ms),
    cancelLater: (handle) => window.clearTimeout(handle),
    now: () => performance.now(),
    hidden: () => document.visibilityState === "hidden"
  };
}

/** Anything that can move a control, or cover one, starts a busy spell. */
const WAKE_EVENTS = ["pointerdown", "pointerup", "scroll", "animationstart", "transitionrun", "resize"] as const;

let layer: Promise<GlassLayer | null> | null = null;

/**
 * The layer, once the phone has said it draws glass; null on the web, on
 * Android, before iOS 26, and in an app built without the plugin, where the
 * page draws every control itself.
 */
export function loadGlassLayer(
  plugin: () => Promise<GlassPlugin> = loadGlassPlugin,
  native: boolean = isIOSApp()
): Promise<GlassLayer | null> {
  if (layer) return layer;
  if (!native) return Promise.resolve(null);
  layer = plugin()
    .then(async (p) => {
      const { supported } = await p.probe();
      if (!supported) return null;
      const made = new GlassLayer(browserDeps(p));
      await made.listen();
      const wake = () => made.wake();
      for (const name of WAKE_EVENTS) window.addEventListener(name, wake, { capture: true, passive: true });
      document.addEventListener("visibilitychange", wake);
      return made;
    })
    .catch(() => null);
  return layer;
}

/** For tests: forget the layer, so the next load probes again, or set the
 *  one every bar control will use. */
export function resetGlassLayer(next?: GlassLayer | null): void {
  layer = next === undefined ? null : Promise.resolve(next);
}

// ---------------------------------------------------------------------------
// Hooks

/**
 * Set by a bar (a tab's floating header, a pushed screen's bar, a sheet's
 * bar): the controls inside it are the phone's to draw. Controls in a page's
 * content scroll with it and stay the page's.
 */
export const GlassBarContext = createContext(false);

function useLayer(): GlassLayer | null {
  const inBar = useContext(GlassBarContext);
  const [ready, setReady] = useState<GlassLayer | null>(null);
  useEffect(() => {
    if (!inBar) return;
    let alive = true;
    void loadGlassLayer().then((made) => {
      if (alive) setReady(made);
    });
    return () => {
      alive = false;
    };
  }, [inBar]);
  return inBar ? ready : null;
}

/**
 * A round bar button (`IconButton`'s `round` or `confirm`), drawn by the phone
 * where it can be. Its glyph is the SF Symbol for the page's icon, or the
 * page's icon as a picture where there is none.
 */
export function useGlassButton(
  ref: RefObject<HTMLElement | null>,
  { prominent, badge, enabled, wanted }: { prominent: boolean; badge?: string; enabled: boolean; wanted: boolean }
): void {
  const made = useLayer();
  const id = useId();
  const [glyph, setGlyph] = useState<{ symbol?: string; image?: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!made || !wanted || !el) return;
    let alive = true;
    const symbol = symbolFor(el);
    if (symbol) setGlyph({ symbol });
    else
      void rasterizeIcon(el).then((image) => {
        if (alive && image) setGlyph({ image });
      });
    return () => {
      alive = false;
    };
  }, [made, wanted, ref]);

  const spec: GlassSpec | null = glyph ? { kind: "button", prominent, badge, enabled, ...glyph } : null;
  const specKey = JSON.stringify(spec);
  const registered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!made || !wanted || !el || !glyph) return;
    registered.current = true;
    const done = made.register(id, el, { kind: "button", prominent, badge, enabled, ...glyph });
    return () => {
      registered.current = false;
      done();
    };
    // Registered once per glyph; the spec's changes go through `update` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [made, wanted, glyph, id, ref]);

  useEffect(() => {
    if (made && spec && registered.current) made.update(id, spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [made, id, specKey]);
}

/** A bar's segmented control, drawn by the phone where it can be. */
export function useGlassSegmented(
  ref: RefObject<HTMLElement | null>,
  { options, selected, enabled, onChange }: { options: string[]; selected: number; enabled: boolean; onChange: (index: number) => void }
): void {
  const made = useLayer();
  const id = useId();
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  const relay = useCallback((index: number) => latest.current(index), []);
  const spec: GlassSpec = { kind: "segmented", options, selected, enabled };
  const specKey = JSON.stringify(spec);
  const registered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!made || !el) return;
    registered.current = true;
    const done = made.register(id, el, JSON.parse(specKey) as GlassSpec, relay);
    return () => {
      registered.current = false;
      done();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [made, id, ref, relay]);

  useEffect(() => {
    if (made && registered.current) made.update(id, JSON.parse(specKey) as GlassSpec, relay);
  }, [made, id, specKey, relay]);
}
