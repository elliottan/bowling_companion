import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { clearDatabase } from "./helpers";

/**
 * Text fit, in every language at the largest text size.
 *
 * A translation is longer or wider than the English it replaces, and the
 * largest text size multiplies that. Nobody should have to open six languages
 * on a phone to find the label that runs off the edge, so this walks every main
 * screen in every shipped language at `largest` and fails when text is cut off
 * or pushed past the viewport.
 *
 * What it reports (see `detectOverflow`):
 *   page-scroll-x    the page itself scrolls sideways
 *   clipped-x        an element that holds text hides its sideways overflow
 *   clipped-y        an element that holds text hides its vertical overflow
 *                    (line clamp or overflow-y hidden)
 *   clipped-by-box   text wider than an ancestor that clips sideways
 *   past-viewport    visible text drawn beyond the left or right edge
 *   clipped-select   a native select whose chosen option is wider than the
 *                    room inside the box (the option text is not in the DOM
 *                    walk, so it is measured on a canvas)
 *   spills-x         text drawn past the sides of its own box, with nothing
 *                    clipping it: a fixed-width label held to one line runs
 *                    on over the control beside it
 *   spills-y         text drawn past the top or bottom of its own box: a
 *                    button of fixed height whose label took two lines
 *   spills-card      a control or text inside a bordered box (a card) drawn
 *                    past that box's edge, over whatever sits beside it
 *
 * The three spills are measured from where the text and controls are drawn,
 * never from scrollWidth or scrollHeight, which also count the invisible
 * absolute boxes that widen a small control's tap target.
 *
 * What it ignores: anything inside a deliberate scroller (overflow-x
 * auto/scroll, e.g. a chip row), hidden or zero-size elements, sr-only
 * content, SVG and canvas, and anything under `data-fit="exempt"`, the opt-out
 * a screen can carry (with a reason beside it) where the cut is intended.
 *
 * `FIT_SCREENS=a,b` limits the run to named screens, for working on one.
 * `FIT_SHOTS=<dir>` also saves a screenshot per locale x screen x size.
 */

/**
 * The same faces on every machine. The app draws in the phone's own face
 * (`system-ui`: SF on iPhone, Roboto on Android), which a Linux runner does
 * not have: there `system-ui` falls back to whatever is installed, DejaVu Sans
 * on CI and Inter here, and DejaVu is so much wider that English failed on CI
 * and passed here. So the page is pinned to Inter, whose widths are close to
 * SF's and Roboto's, and to Noto Sans CJK for Japanese, Korean and Chinese
 * (CI installs both: `.github/workflows/ci.yml`). A machine without them
 * measures wider than a phone, never narrower, so it fails rather than passes.
 */
function pinFonts() {
  const css = `
    :root, :root * { font-family: "Inter", "Noto Sans CJK JP", "Noto Sans JP", sans-serif !important; }
    :root:lang(ko), :root:lang(ko) * { font-family: "Inter", "Noto Sans CJK KR", "Noto Sans KR", sans-serif !important; }
    :root:lang(zh-Hans), :root:lang(zh-Hans) * { font-family: "Inter", "Noto Sans CJK SC", "Noto Sans SC", sans-serif !important; }
    :root:lang(zh-Hant), :root:lang(zh-Hant) * { font-family: "Inter", "Noto Sans CJK TC", "Noto Sans TC", sans-serif !important; }`;
  // An init script runs before the document has an element to hang a style
  // on, so the style goes in once the page is parsed, before the app renders.
  const add = () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  };
  if (document.head) add();
  else document.addEventListener("DOMContentLoaded", add, { once: true });
}

// `src/lib/i18n.ts` imports the message macro and `import.meta.glob`, neither
// of which the Playwright runtime can load, so the list is read from the file.
const I18N_SRC = readFileSync(fileURLToPath(new URL("../src/lib/i18n.ts", import.meta.url)), "utf8");
const LOCALES: string[] = [
  ...(/SUPPORTED_LOCALES\s*=\s*\[([^\]]*)\]/.exec(I18N_SRC)?.[1] ?? "").matchAll(/"([^"]+)"/g)
].map((m) => m[1]);

const WIDTHS = [390, 360];
const HEIGHT = 844;
const SHOTS_DIR = process.env.FIT_SHOTS;

interface Failure {
  locale: string;
  screen: string;
  width: number;
  text: string;
  path: string;
  kind: string;
  widths: string;
}

interface Seeded {
  sessionId: number;
  liveSessionId: number;
  patternId: number;
}

/** A card token per frame: X strike, 9/ spare, 81 open, S split leave left open. */
const GAME_ONE = "X 9/ 81 S X X 7/ 9- X 8/ XXX";
const GAME_TWO = "9/ X 8- 7/ X X 9/ S/ 81 X9/";
const GAME_LIVE = "X 9/ 81 S";

async function seed(page: Page): Promise<Seeded> {
  return page.evaluate(
    async ({ one, two, live }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a source module the dev server serves, untyped here
      const load = new Function("p", "return import(p)") as (p: string) => Promise<any>;
      const repo = await load("/src/services/bowlingRepository.ts");
      const balls = await load("/src/services/ballRepository.ts");
      const { calculateGameScore, isStrike } = await load("/src/lib/scoring.ts");
      const { syncPatternCatalog } = await load("/src/services/patternCatalog.ts");

      await repo.setBowlerName("Taylor");
      await balls.ensureDefaultSpareLines();
      await syncPatternCatalog().catch(() => {});

      const strikeBall = await balls.addBall({
        name: "Hyroad",
        is_spare_ball: false,
        weight: 15,
        notes: "Medium oil",
        layout_spec: { drillingAngle: 55, pinToPap: 4.5, valAngle: 40, symmetric: false, pinToCore: 5.5, system: "dual" }
      });
      await balls.addBall({ name: "Plastic spare", is_spare_ball: true, weight: 15 });
      await balls.addBall({ name: "Phaze 4", is_spare_ball: false, weight: 15 });
      await balls.upsertLaneNote?.("Ace Lanes", "12", "Hooks early on the left");

      const all = (await balls.getOilPatterns()) as Array<{ id: number; passes?: unknown[] }>;
      const withTable = all.find((p) => (p.passes?.length ?? 0) > 0) ?? all[0];
      const patternId =
        withTable?.id ?? (await balls.addOilPattern("House shot", undefined, undefined, 40));

      const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const ORDER = [10, 7, 4, 6, 2, 8, 3, 9, 5, 1];
      const shotsOf = (token: string) => {
        const shots: Array<{ pins_standing: number[]; ball_id: number }> = [];
        let standing = ALL;
        const push = (s: number[]) => shots.push({ pins_standing: s, ball_id: strikeBall });
        if (token === "S" || token === "S/") {
          push([7, 10]);
          push(token === "S" ? [10] : []);
          return shots;
        }
        for (const ch of token) {
          if (ch === "X" || ch === "/") standing = [];
          else if (ch !== "-") {
            const n = Number(ch);
            const from = standing.length === 10 ? ORDER.filter((p) => standing.includes(p)) : standing;
            standing = from.slice(0, from.length - n).sort((a, b) => a - b);
          }
          push(standing);
          if (standing.length === 0) standing = ALL;
        }
        return shots;
      };

      const writeGame = async (sessionId: number, n: number, card: string, finished: boolean) => {
        const lanes = ["11", "12"];
        const gameId = Number(await (await load("/src/db/bowlingDb.ts")).db.games.add({ session_id: sessionId, game_number: n, lanes, start_lane: "11" }));
        const { db } = await load("/src/db/bowlingDb.ts");
        const frames = card.split(" ").map((token, f) => {
          const shots = shotsOf(token);
          const fr = { game_id: gameId, frame_number: f + 1, shots };
          return { ...fr, is_strike: isStrike(fr), is_spare: !isStrike(fr) && shots.length > 1 && shots[1].pins_standing.length === 0 };
        });
        await db.frames.bulkAdd(frames);
        if (finished) await db.games.update(gameId, { final_score: calculateGameScore(frames).total });
      };

      // Stored the way the app stores a day: YYYY-MM-DD, in the device's own day.
      const dayKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const today = dayKey(new Date());
      const sessionId = await repo.createSession({
        date: today,
        alley_name: "Ace Lanes",
        description: "League night",
        oil_pattern_id: patternId,
        general_notes: "Dry late."
      });
      await writeGame(sessionId, 1, one, true);
      await writeGame(sessionId, 2, two, true);

      const earlier = dayKey(new Date(Date.now() - 7 * 86_400_000));
      // A long alley name, as bowlers type them: the scorer's title has to
      // hold one whole, at every size, without running into what is under it.
      const liveSessionId = await repo.createSession({
        date: earlier,
        alley_name: "Chinese Swimming Club Bowling Centre",
        description: "Practice, the Thursday doubles"
      });
      await writeGame(liveSessionId, 1, one, true);
      await writeGame(liveSessionId, 2, live, false);
      return { sessionId, liveSessionId, patternId };
    },
    { one: GAME_ONE, two: GAME_TWO, live: GAME_LIVE }
  );
}

/**
 * Runs in the page. Returns one entry per problem found.
 * Kept self-contained: it is serialised into the browser.
 */
function detectOverflow(): Array<{ text: string; path: string; kind: string; widths: string }> {
  const out: Array<{ text: string; path: string; kind: string; widths: string }> = [];
  const vw = window.innerWidth;
  const seen = new Set<string>();

  const describe = (el: Element) => {
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let i = 0; cur && cur !== document.body && i < 5; i += 1, cur = cur.parentElement) {
      let s = cur.tagName.toLowerCase();
      const tid = cur.getAttribute("data-testid");
      if (cur.id) s += `#${cur.id}`;
      else if (tid) s += `[data-testid=${tid}]`;
      else {
        const cls = (typeof cur.className === "string" ? cur.className : "")
          .split(/\s+/)
          .filter((c) => c && !/^(?:sm|md|lg|dark|hover|focus|active):/.test(c))
          .slice(0, 2);
        if (cls.length) s += "." + cls.join(".");
      }
      const label = cur.getAttribute("aria-label");
      if (label && i === 0) s += `[aria-label="${label.slice(0, 24)}"]`;
      parts.unshift(s);
    }
    return parts.join(" > ");
  };

  const ownText = (el: Element) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();

  // One entry per element: the same too-long label is usually clipped,
  // clamped and past the edge all at once, and that is one bug.
  const found = new Map<Element, { kinds: string[]; widths: string[] }>();
  const record = (el: Element, kind: string, widths: string) => {
    const e = found.get(el) ?? { kinds: [], widths: [] };
    e.kinds.push(kind);
    e.widths.push(widths);
    found.set(el, e);
  };

  // Page-level sideways scroll.
  const se = document.scrollingElement;
  if (se && se.scrollWidth > window.innerWidth + 1) {
    out.push({ text: "(document)", path: "html", kind: "page-scroll-x", widths: `scrollWidth ${se.scrollWidth} > viewport ${window.innerWidth}` });
  }

  const isClipping = (v: string) => v === "hidden" || v === "clip";
  const isScroller = (v: string) => v === "auto" || v === "scroll";
  // A box that is meant to scroll sideways, such as a chip row. Computed
  // overflow-x is not enough to tell: `overflow-y-auto` forces overflow-x to
  // auto as well, so every page pane would read as a sideways scroller and
  // hide exactly the text this guard exists to check. The class says which
  // axis the author asked for.
  const isSidewaysScroller = (a: Element, v: string) => {
    if (!isScroller(v)) return false;
    const cls = typeof a.className === "string" ? a.className : "";
    if (/(^|\s)overflow-(x-)?(auto|scroll)(\s|$)/.test(cls)) return true;
    return !/(^|\s)overflow-y-(auto|scroll)(\s|$)/.test(cls);
  };

  // A native select draws its value inside the box, minus its padding (and the
  // room kept for a chevron), and cuts it off there: "Cualq" for "Cualquiera".
  // The walker below never sees that text, since it lives in the option, so the
  // selected option's width is measured here against the box it is drawn in.
  for (const sel of Array.from(document.querySelectorAll("select"))) {
    if (sel.closest('[data-fit="exempt"]') || sel.closest("[inert]")) continue;
    const r = sel.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const scs = getComputedStyle(sel);
    if (scs.display === "none" || scs.visibility === "hidden") continue;
    const label = sel.selectedOptions[0]?.textContent?.trim() ?? "";
    if (!label || !sel.parentElement) continue;
    // Measured in the DOM, in the select's own font and language, as a canvas
    // picks a different face for Han and Hangul and reads wide.
    const probe = document.createElement("span");
    probe.textContent = label;
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${scs.font};letter-spacing:${scs.letterSpacing};`;
    sel.parentElement.appendChild(probe);
    const need = probe.getBoundingClientRect().width;
    probe.remove();
    const room = sel.clientWidth - parseFloat(scs.paddingLeft) - parseFloat(scs.paddingRight);
    if (need > room + 1) {
      out.push({ text: label, path: describe(sel), kind: "clipped-select", widths: `value ${Math.round(need)} > room ${Math.round(room)}` });
    }
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode() as Element | null; node; node = walker.nextNode() as Element | null) {
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (["svg", "canvas", "script", "style", "noscript", "img", "video", "path"].includes(tag)) continue;
    if (el.closest("svg, canvas")) continue;
    if (el.closest('[data-fit="exempt"]')) continue;
    if (el.closest("[inert]")) continue;
    const text = ownText(el);
    const cs0 = getComputedStyle(el);
    const bordered = ["Top", "Right", "Bottom", "Left"].some(
      (side) => (parseFloat(cs0.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0) > 0
    );
    if (!text && !bordered) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (!text) {
      // A card (anything with a border) whose contents run past its edge. A
      // control too wide for the card it sits in is drawn half outside it, over
      // the card beside it, and nothing clips it, so no check below sees it.
      // Measured from the boxes of what is drawn inside (text and controls in
      // the flow), not from scrollWidth, which counts the invisible absolute
      // boxes that widen a small control's tap target.
      if (cs0.display === "inline" || isClipping(cs0.overflowX) || isScroller(cs0.overflowX)) continue;
      if (el.closest(".sr-only")) continue;
      if (typeof el.checkVisibility === "function" && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
      let inScroller = false;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        if (isSidewaysScroller(a, getComputedStyle(a).overflowX)) { inScroller = true; break; }
      }
      if (inScroller) continue;
      const inner = rect.left + (parseFloat(cs0.borderLeftWidth) || 0);
      const innerRight = rect.right - (parseFloat(cs0.borderRightWidth) || 0);
      if (rect.right <= 0 || rect.left >= vw) continue;
      for (const d of Array.from(el.querySelectorAll("select, input, button, textarea, span, p, div"))) {
        if (d.closest("svg, .sr-only")) continue;
        // Not a box drawn out of the flow (a tap target, a popup), and not a
        // row inside the card that scrolls or clips on purpose: a chip row
        // runs past the card's edge by design, and a clipped one is the
        // clipped-by-box check's to judge.
        let floating = false;
        for (let a: Element | null = d; a && a !== el; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.position === "absolute" || acs.position === "fixed") { floating = true; break; }
          if (a !== d && (isScroller(acs.overflowX) || isClipping(acs.overflowX))) { floating = true; break; }
        }
        if (floating) continue;
        if (typeof d.checkVisibility === "function" && !d.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
        const dr = d.getBoundingClientRect();
        if (dr.width === 0 || dr.height === 0) continue;
        if (dr.left < inner - 1 || dr.right > innerRight + 1) {
          record(el, "spills-card", `${describe(d).split(" > ").pop()} ${Math.round(dr.left)}..${Math.round(dr.right)} outside ${Math.round(inner)}..${Math.round(innerRight)}`);
          break;
        }
      }
      continue;
    }
    // checkVisibility covers display none, visibility hidden, and a row that
    // `content-visibility: auto` is skipping: its box is left as it was last
    // laid out, so a list under a pushed screen still reads at the width it
    // had before the viewport narrowed. It is laid out again when it shows.
    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) continue;
    // The sr-only recipe: a 1px clipped box.
    if (el.closest(".sr-only")) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "absolute" && (cs.clip === "rect(0px, 0px, 0px, 0px)" || cs.clipPath === "inset(50%)") && rect.width <= 1) continue;

    // Ancestor chain: an intentional sideways scroller exempts the text, and a
    // box that clips sideways is the thing text must fit inside.
    let inScroller = false;
    const clippers: HTMLElement[] = [];
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (isSidewaysScroller(a, acs.overflowX)) {
        inScroller = true;
        break;
      }
      if (isClipping(acs.overflowX) && a !== document.body) clippers.push(a);
    }

    // The text's own boxes, tighter than the element's when it is a wide block.
    const range = document.createRange();
    let left = Infinity;
    let right = -Infinity;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? "").trim()) continue;
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width === 0) continue;
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      }
    }

    if (!inScroller) {
      // Own clip, sideways.
      const ellipsis = cs.textOverflow === "ellipsis";
      if ((isClipping(cs.overflowX) || ellipsis) && el.scrollWidth > el.clientWidth + 1) {
        record(el, "clipped-x", `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
      }
      // An ancestor that clips cuts the text off.
      if (right > left) {
        for (const c of clippers) {
          const cr = c.getBoundingClientRect();
          const ccs = getComputedStyle(c);
          const inner = cr.left + (parseFloat(ccs.borderLeftWidth) || 0);
          const innerRight = cr.right - (parseFloat(ccs.borderRightWidth) || 0);
          // Only a box that is on screen: a sheet parked off-screen is not a bug.
          if (cr.right <= 0 || cr.left >= vw) continue;
          if (left < inner - 1 || right > innerRight + 1) {
            record(el, "clipped-by-box", `text ${Math.round(left)}..${Math.round(right)} outside ${c.tagName.toLowerCase()} ${Math.round(inner)}..${Math.round(innerRight)}`);
            break;
          }
        }
      }
      // Viewport edge, for text that is on screen at all.
      if (right > left && right > 0 && left < vw && (left < -1 || right > vw + 1)) {
        record(el, "past-viewport", `text ${Math.round(left)}..${Math.round(right)} vs viewport 0..${vw}`);
      }
    }

    // Text that spills out of its own box without being clipped: a label held
    // to a fixed width with nowrap runs on over the control beside it, and a
    // button held to a fixed height draws its second line across its own
    // border. Nothing clips either, so the checks above never see them.
    if (!inScroller && cs.display !== "inline" && cs.display !== "contents" && right > left) {
      // The text's own boxes against the element's: the tap-target boxes that
      // scrollWidth and scrollHeight would count are not text. Slack up and
      // down of a third of the font size, since a tight line height draws the
      // glyphs past the line box on purpose (a big score at leading-none); a
      // second line spilling is a whole line.
      let top = Infinity;
      let bottom = -Infinity;
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? "").trim()) continue;
        range.selectNodeContents(n);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width === 0) continue;
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }
      }
      const slackY = Math.max(4, (parseFloat(cs.fontSize) || 16) / 3);
      if (!isClipping(cs.overflowX) && cs.textOverflow !== "ellipsis" && (left < rect.left - 1 || right > rect.right + 1)) {
        record(el, "spills-x", `text ${Math.round(left)}..${Math.round(right)} outside its box ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
      if (!isClipping(cs.overflowY) && (top < rect.top - slackY || bottom > rect.bottom + slackY)) {
        record(el, "spills-y", `text ${Math.round(top)}..${Math.round(bottom)} outside its box ${Math.round(rect.top)}..${Math.round(rect.bottom)}`);
      }
    }

    // Vertical clip: line clamp or overflow-y hidden, whatever the horizontal.
    const clamp = (cs as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp;
    const clamped = !!clamp && clamp !== "none";
    if ((isClipping(cs.overflowY) || clamped) && !isScroller(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      record(el, "clipped-y", `scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}${clamped ? ` (line-clamp ${clamp})` : ""}`);
    }
  }
  for (const [el, e] of found) {
    const text = ownText(el) || (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const path = describe(el);
    const key = `${path}|${text.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: text.slice(0, 60), path, kind: e.kinds.join("+"), widths: e.widths.join("; ") });
  }
  return out;
}

interface Screen {
  name: string;
  /** The route, or a function for one that needs an id read from the page. */
  hash: string | ((page: Page) => Promise<string>);
  /** Anything beyond navigating: a tap that opens a sheet, a tab to pick. */
  prepare?: (page: Page) => Promise<void>;
}

/** A message's translation, read from the catalog, for a control that is found
 *  by the name it carries in this language. English is the id itself. */
function tr(locale: string, msgid: string): string {
  if (locale === "en") return msgid;
  const po = readFileSync(fileURLToPath(new URL(`../src/locales/${locale}/messages.po`, import.meta.url)), "utf8");
  const head = `msgid ${JSON.stringify(msgid)}\nmsgstr "`;
  const at = po.indexOf(head);
  if (at < 0) return msgid;
  const rest = po.slice(at + head.length);
  const end = rest.search(/(?<!\\)"\n/);
  const out = end > 0 ? JSON.parse(`"${rest.slice(0, end)}"`) : "";
  return out || msgid;
}

/** Waits for screen transitions and sheet slides to land: a measurement taken
 *  mid-slide reads the whole screen as past the edge. Endless animations (a
 *  spinner) are not waited for. */
async function settle(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
      undefined,
      { timeout: 3000 }
    )
    .catch(() => {});
  await page.waitForTimeout(120);
}

async function tap(page: Page, loc: ReturnType<Page["locator"]>) {
  // The last match: screens stack in the DOM and the top one is last.
  await loc.last().waitFor({ state: "visible", timeout: 3000 });
  // Settled first, so a slide-in is not in the way; forced only if something
  // invisible (a leaving screen's shield) still reports as covering the row.
  await settle(page);
  await loc.last().click({ timeout: 3000 }).catch(() => loc.last().click({ force: true, timeout: 2000 }));
}

function screensFor(ids: Seeded, locale: string): Screen[] {
  const row = 'li button[class*="text-left"]';
  const byName = (page: Page, msgid: string) => page.getByRole("button", { name: tr(locale, msgid), exact: true });
  return [
    { name: "home", hash: "#/home" },
    { name: "session-form", hash: "#/home", prepare: (page) => tap(page, byName(page, "Start session").last()) },
    { name: "history", hash: "#/history" },
    { name: "session-detail", hash: `#/history/session/${ids.sessionId}` },
    { name: "scorer-live", hash: `#/session/${ids.liveSessionId}` },
    // The same session pushed from History, where its name is the large title.
    { name: "scorer-pushed", hash: `#/history/session/${ids.liveSessionId}` },
    { name: "stats", hash: "#/stats" },
    { name: "stats-3-months", hash: "#/stats", prepare: (page) => tap(page, page.locator(".segmented-track").first().locator("button").first()) },
    { name: "stats-by-game", hash: "#/stats", prepare: (page) => tap(page, page.locator(".segmented-track").nth(1).locator("button").nth(1)) },
    { name: "settings", hash: "#/settings" },
    { name: "appearance", hash: "#/settings/section/appearance" },
    { name: "profile", hash: "#/settings/section/profile" },
    { name: "tools", hash: "#/settings/section/tools" },
    { name: "legal", hash: "#/settings/section/legal" },
    { name: "backup", hash: "#/settings/backup" },
    { name: "arsenal", hash: "#/home/arsenal" },
    { name: "ball-form", hash: "#/home/arsenal", prepare: (page) => tap(page, page.locator(row)) },
    { name: "ball-add-form", hash: "#/home/arsenal", prepare: (page) => tap(page, byName(page, "Add ball")) },
    { name: "spares", hash: "#/home/spares" },
    { name: "spare-line-detail", hash: "#/home/spares", prepare: (page) => tap(page, page.locator('section ul li button')) },
    { name: "lane-notes", hash: "#/home/lanes" },
    { name: "lane-note-form", hash: "#/home/lanes", prepare: (page) => tap(page, page.locator(row)) },
    { name: "oil-patterns", hash: "#/home/oil-patterns" },
    { name: "oil-pattern-sheet", hash: "#/home/oil-patterns", prepare: (page) => tap(page, page.locator(row).filter({ hasText: "Bear 41" })) },
    { name: "oil-pattern-add-form", hash: "#/home/oil-patterns", prepare: (page) => tap(page, byName(page, "Add oil pattern")) },
    { name: "catalog", hash: "#/home/catalog" },
    {
      name: "catalog-ball",
      hash: async (page) => {
        const id = await page.evaluate(async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a source module the dev server serves, untyped here
      const load = new Function("p", "return import(p)") as (p: string) => Promise<any>;
          const { db } = await load("/src/db/bowlingDb.ts");
          for (let i = 0; i < 50; i += 1) {
            const first = await db.ball_catalog.orderBy("id").first();
            if (first) return first.id as string;
            await new Promise((r) => setTimeout(r, 200));
          }
          return "";
        });
        return `#/home/catalog/ball/${encodeURIComponent(id)}`;
      }
    },
    { name: "guides", hash: "#/home/guides" },
    { name: "guide-article", hash: "#/home/guides/guide/layout-vocabulary" },
    { name: "layout-lab", hash: "#/home/layout-lab" },
    { name: "layout-lab-pap", hash: "#/home/layout-lab", prepare: (page) => tap(page, byName(page, "More")) },
    { name: "line-visualizer", hash: "#/home/line" },
    { name: "game-plan", hash: "#/home/game-plan" },
    { name: "open-frames", hash: "#/home/open-frames" },
    { name: "game-trend", hash: "#/home/game-trend" },
    { name: "pro-offer", hash: "#/home/pro" }
  ];
}

test.describe("text fit", () => {
  test.describe.configure({ mode: "parallel" });
  test.skip(({ browserName }) => browserName !== "chromium", "font metrics need one engine only");
  test.setTimeout(SHOTS_DIR ? 600_000 : 300_000);

  for (const locale of LOCALES) {
    test(`${locale} fits at the largest text size`, async ({ page }) => {
      await page.addInitScript(pinFonts);
      await clearDatabase(page);
      const ids = await seed(page);
      const failures: Failure[] = [];
      const only = process.env.FIT_SCREENS?.split(",");
      const screens = screensFor(ids, locale).filter((sc) => !only || only.includes(sc.name));
      const sizes = SHOTS_DIR ? (["default", "largest"] as const) : (["largest"] as const);
      if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });

      for (const size of sizes) {
        await page.evaluate(
          ([l, s]) => {
            localStorage.setItem("language", l);
            if (s === "default") localStorage.removeItem("textSize");
            else localStorage.setItem("textSize", s);
          },
          [locale, size]
        );
        for (const screen of screens) {
          await page.setViewportSize({ width: WIDTHS[0], height: HEIGHT });
          // A fresh document at this route, in this language and size. Going
          // through about:blank rather than reloading: the app keeps the
          // screen it was on in the history entry, and a reload of that entry
          // lands back on the previous screen.
          const hash = typeof screen.hash === "string" ? screen.hash : await screen.hash(page);
          await page.goto("about:blank");
          await page.goto(`/app?pro${hash}`);
          await page.evaluate(() => document.fonts.ready);
          await settle(page);
          if (screen.prepare) {
            // A screen that cannot be reached is a failure, not a silent skip:
            // a guard that quietly checks less is worse than none.
            let why = "the control that opens this screen was not found";
            const reached = await screen.prepare(page).then(() => true, (e: Error) => { why = String(e.message).split("\n")[0]; return false; });
            if (!reached) failures.push({ locale, screen: screen.name, width: WIDTHS[0], text: "(screen)", path: "-", kind: "unreachable", widths: why });
          }
          await settle(page);
          if (SHOTS_DIR) {
            await page.screenshot({ path: join(SHOTS_DIR, `${locale}-${size}-${screen.name}.png`), fullPage: true });
          }
          if (size !== "largest") continue;
          for (const width of WIDTHS) {
            if (width !== WIDTHS[0]) {
              await page.setViewportSize({ width, height: HEIGHT });
              await page.waitForTimeout(250);
            }
            let found = await page.evaluate(detectOverflow);
            if (found.length > 0) {
              // Measured twice: a slide that no animation API reports (a
              // spring driven from script) reads as text past the edge for a
              // frame. A real overflow is still there 400ms later.
              await page.waitForTimeout(400);
              const again = new Set((await page.evaluate(detectOverflow)).map((f) => `${f.path}|${f.text}`));
              found = found.filter((f) => again.has(`${f.path}|${f.text}`));
            }
            for (const f of found) failures.push({ locale, screen: screen.name, width, ...f });
          }
        }
      }

      expect(failures.length, report(failures)).toBe(0);
    });
  }
});

/**
 * One line per kind of problem, not per row: a list of two hundred patterns
 * whose subtitle is cut off is one bug, and two hundred lines of it would bury
 * the next one.
 */
function report(failures: Failure[]): string {
  if (failures.length === 0) return "";
  const groups = new Map<string, Failure[]>();
  for (const f of failures) {
    const key = `${f.locale}|${f.screen}|${f.kind}|${f.path}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const lines = [...groups.values()].map((g) => {
    const f = g[0];
    const widths = [...new Set(g.map((x) => x.width))].join(",");
    const texts = [...new Set(g.map((x) => x.text))];
    const shown = texts.slice(0, 2).map((t) => `"${t}"`).join(", ");
    const more = texts.length > 2 ? ` (+${texts.length - 2} more)` : "";
    return `  [${f.locale}] ${f.screen} @${widths} ${f.kind}: ${shown}${more}\n      ${f.path}\n      ${f.widths}`;
  });
  return `\n${groups.size} text-fit problem(s), ${failures.length} element(s):\n${lines.join("\n")}`;
}
