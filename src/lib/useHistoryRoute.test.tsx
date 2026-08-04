import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { navReducer } from "./appNavigation";
import { initialNavFromHash } from "./appRoute";
import { useHistoryRoute } from "./useHistoryRoute";

/**
 * A stand-in for the shell: it can push overlays, switch tabs, and go back the
 * way every real back path does.
 *
 * These spy on `history` rather than driving jsdom's real stack, because one
 * jsdom window is shared by every test in the file: entries left behind by an
 * earlier test are still there to be popped by a later one, which makes real
 * `back()` assertions test the leftovers instead of the hook.
 */
function Harness() {
  const [nav, dispatch] = useReducer(navReducer, window.location.hash, initialNavFromHash);
  const goBack = useHistoryRoute(nav, dispatch);
  return (
    <div>
      <span data-testid="overlays">{nav.overlays.join(",")}</span>
      <span data-testid="view">{nav.view}</span>
      <span data-testid="section">{nav.settingsSection}</span>
      <button onClick={() => dispatch({ type: "pushOverlay", overlay: "arsenal" })}>arsenal</button>
      <button onClick={() => dispatch({ type: "pushOverlay", overlay: "catalog" })}>catalog</button>
      <button onClick={() => dispatch({ type: "goTo", view: "history" })}>history tab</button>
      <button onClick={() => goBack({ type: "popOverlay" })}>back</button>
    </div>
  );
}

const at = (id: string) => screen.getByTestId(id).textContent;

async function click(name: string) {
  await act(async () => {
    screen.getByText(name).click();
  });
}

/** What the browser does on back: move the URL, then fire popstate. */
async function browserBack(toHash: string) {
  await act(async () => {
    window.history.replaceState(null, "", toHash);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

let pushSpy: ReturnType<typeof vi.spyOn>;
let replaceSpy: ReturnType<typeof vi.spyOn>;
let backSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  pushSpy = vi.spyOn(window.history, "pushState");
  replaceSpy = vi.spyOn(window.history, "replaceState");
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHistoryRoute", () => {
  it("writes the URL from the state", async () => {
    render(<Harness />);
    await click("arsenal");
    expect(window.location.hash).toBe("#/home/arsenal");

    await click("catalog");
    expect(window.location.hash).toBe("#/home/arsenal/catalog");
  });

  it("stacks an entry per screen the user navigates into", async () => {
    render(<Harness />);
    pushSpy.mockClear();

    await click("arsenal");
    await click("catalog");

    expect(pushSpy).toHaveBeenCalledTimes(2);
    const urls = pushSpy.mock.calls.map((call: unknown[]) => call[2]);
    expect(urls).toEqual(["#/home/arsenal", "#/home/arsenal/catalog"]);
  });

  it("a tab switch replaces rather than stacking, so back still leaves the app", async () => {
    render(<Harness />);
    pushSpy.mockClear();
    replaceSpy.mockClear();

    await click("history tab");

    expect(window.location.hash).toBe("#/history");
    expect(pushSpy).not.toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
  });

  it("routes back through the browser, so one gesture cannot pop twice", async () => {
    render(<Harness />);
    await click("arsenal");

    await click("back");

    // The in-app control asks the browser to go back; it does NOT pop state
    // itself. The state change arrives with the popstate that follows.
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(at("overlays")).toBe("arsenal");
  });

  it("the platform's own back pops exactly one screen", async () => {
    render(<Harness />);
    await click("arsenal");
    await click("catalog");
    expect(at("overlays")).toBe("arsenal,catalog");

    // Android's hardware back, or iOS's left-edge swipe.
    await browserBack("#/home/arsenal");
    expect(at("overlays")).toBe("arsenal");

    await browserBack("#/home");
    expect(at("overlays")).toBe("");
  });

  it("does not push the entry a popstate just moved us to", async () => {
    render(<Harness />);
    await click("arsenal");
    pushSpy.mockClear();

    await browserBack("#/home");

    expect(at("overlays")).toBe("");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("keeps working after a back, rather than getting stuck", async () => {
    render(<Harness />);
    await click("arsenal");
    await browserBack("#/home");
    pushSpy.mockClear();

    // The guard that ignores our own popstate has to clear itself, or the next
    // navigation never reaches the history stack.
    await click("catalog");

    expect(window.location.hash).toBe("#/home/catalog");
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it("closes the overlay directly when the app pushed no entry of its own", async () => {
    // A deep link straight into an overlay: history.back() would leave the app.
    window.history.replaceState(null, "", "/#/home/arsenal");
    render(<Harness />);
    await act(async () => {});
    expect(at("overlays")).toBe("arsenal");

    await click("back");

    expect(backSpy).not.toHaveBeenCalled();
    expect(at("overlays")).toBe("");
  });

  it("restores the screen the URL names on load", async () => {
    window.history.replaceState(null, "", "/#/settings/lanes");
    render(<Harness />);
    await act(async () => {});

    expect(at("view")).toBe("settings");
    expect(at("section")).toBe("lanes");
  });
});
