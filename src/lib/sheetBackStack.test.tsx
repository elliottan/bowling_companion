import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { StrictMode, useReducer, useState } from "react";
import { navReducer } from "./appNavigation";
import { initialNavFromHash } from "./appRoute";
import { useHistoryRoute } from "./useHistoryRoute";
import { useOverlay } from "./useOverlay";

/**
 * Back closing a sheet is a two-part behaviour: the registry says something is
 * open, `useHistoryRoute` turns that into a sentinel entry. Both halves are
 * driven here through a shell-shaped harness, because the bug this replaces
 * only ever appeared in the nested case: a sheet over a pushed screen.
 *
 * History is spied on rather than driven for real (see useHistoryRoute.test),
 * so `browserBack` stands in for what the browser does on a pop.
 */

function Sheet({ label, onClose, active = true }: { label: string; onClose: () => void; active?: boolean }) {
  useOverlay<HTMLDivElement>(onClose, active);
  return <span data-testid={label}>open</span>;
}

/** A pushed screen: routed, so history already closes it. */
function PushedScreen({ onClose }: { onClose: () => void }) {
  useOverlay<HTMLDivElement>(onClose, true, false);
  return <span data-testid="pushed">open</span>;
}

function Harness() {
  const [nav, dispatch] = useReducer(navReducer, window.location.hash, initialNavFromHash);
  const goBack = useHistoryRoute(nav, dispatch);
  const [sheet, setSheet] = useState(false);
  const [inner, setInner] = useState(false);

  return (
    <div>
      <span data-testid="overlays">{nav.overlays.join(",")}</span>
      <button onClick={() => dispatch({ type: "pushOverlay", overlay: "arsenal" })}>arsenal</button>
      <button onClick={() => setSheet(true)}>open sheet</button>
      <button onClick={() => setSheet(false)}>close sheet</button>
      <button onClick={() => setInner(true)}>open inner</button>
      <button onClick={() => goBack({ type: "popOverlay" })}>back</button>
      {/* What submitting the start-session form does: close, and navigate. */}
      <button
        onClick={() => {
          setSheet(false);
          dispatch({ type: "pushOverlay", overlay: "arsenal" });
        }}
      >
        submit sheet
      </button>
      {/* The outer sheet goes inactive while the inner one is up, exactly as
          the ball editor does behind its ball picker. */}
      {sheet && <Sheet label="sheet" onClose={() => setSheet(false)} active={!inner} />}
      {inner && <Sheet label="inner" onClose={() => setInner(false)} />}
    </div>
  );
}

const at = (id: string) => screen.getByTestId(id).textContent;
const isOpen = (id: string) => screen.queryByTestId(id) !== null;

async function click(name: string) {
  await act(async () => {
    screen.getByText(name).click();
  });
}

/** What the browser does on back. The sentinel carries the same hash as the
 *  entry under it, so a pop of the sentinel leaves the URL alone. */
async function browserBack(toHash = window.location.hash) {
  await act(async () => {
    window.history.replaceState(null, "", toHash);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

let pushSpy: ReturnType<typeof vi.spyOn>;
let backSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  pushSpy = vi.spyOn(window.history, "pushState");
  backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("back closes an open sheet", () => {
  it("closes the sheet over a pushed screen, and leaves the screen alone", async () => {
    render(<Harness />);
    await click("arsenal");
    await click("open sheet");
    expect(at("overlays")).toBe("arsenal");

    await browserBack();

    // The sheet is what the user sees in front, so it is what back closes.
    expect(isOpen("sheet")).toBe(false);
    expect(at("overlays")).toBe("arsenal");
    expect(window.location.hash).toBe("#/home/arsenal");
  });

  it("the next back then leaves the screen underneath", async () => {
    render(<Harness />);
    await click("arsenal");
    await click("open sheet");
    await browserBack();

    await browserBack("#/home");

    expect(at("overlays")).toBe("");
  });

  it("the sentinel keeps the URL, so opening a sheet is not a route change", async () => {
    render(<Harness />);
    await click("arsenal");
    pushSpy.mockClear();

    await click("open sheet");

    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][2]).toBe("#/home/arsenal");
    expect(window.location.hash).toBe("#/home/arsenal");
  });

  it("nested sheets share one sentinel, and back closes only the top one", async () => {
    render(<Harness />);
    await click("open sheet");
    pushSpy.mockClear();

    await click("open inner");
    expect(pushSpy).not.toHaveBeenCalled();

    await browserBack();
    expect(isOpen("inner")).toBe(false);
    expect(isOpen("sheet")).toBe(true);
  });

  it("re-arms the sentinel once the layer underneath is live again", async () => {
    render(<Harness />);
    await click("open sheet");
    await click("open inner");
    pushSpy.mockClear();

    await browserBack();

    // The outer sheet is still open, so the entry the pop consumed has to be
    // replaced; otherwise the next back walks out to the route.
    expect(pushSpy).toHaveBeenCalledTimes(1);
    await browserBack();
    expect(isOpen("sheet")).toBe(false);
  });

  it("a sheet that closes itself takes its own sentinel with it", async () => {
    render(<Harness />);
    await click("open sheet");

    await click("close sheet");

    expect(backSpy).toHaveBeenCalledTimes(1);
    // And the pop that follows must not close anything else.
    await click("arsenal");
    await browserBack();
    expect(at("overlays")).toBe("arsenal");
  });

  it("a sheet opened before that pop lands survives it", async () => {
    render(<Harness />);
    await click("open sheet");

    // The browser's back() is asynchronous, so the pop collecting the sentinel
    // can arrive after the user has opened something else. It must not be read
    // as "back was pressed" and close the new sheet.
    await click("close sheet");
    await click("open sheet");
    await browserBack();

    expect(isOpen("sheet")).toBe(true);
  });

  it("a screen opened before that pop lands is not undone by it", async () => {
    render(<Harness />);
    await click("open sheet");

    // Closing the sheet asks the browser to collect the sentinel, and back()
    // lands a moment later. A navigation in that gap used to write its entry
    // straight away, and the pending pop took it back off: the tap read as
    // doing nothing at all.
    await click("close sheet");
    await click("arsenal");
    // The pop takes whatever is on top of the stack when it runs, so it lands
    // on the entry under the sentinel.
    await browserBack("#/home");

    expect(at("overlays")).toBe("arsenal");
    expect(window.location.hash).toBe("#/home/arsenal");

    // And the entry is real, so back still leaves the screen.
    await browserBack("#/home");
    expect(at("overlays")).toBe("");
  });

  it("a screen opened from a sheet keeps its own entry", async () => {
    render(<Harness />);
    await click("open sheet");

    await click("submit sheet");

    // The sheet's entry becomes the screen's, so the navigation survives and
    // one back still lands where the sheet was opened from.
    expect(at("overlays")).toBe("arsenal");
    expect(window.location.hash).toBe("#/home/arsenal");
    expect(backSpy).not.toHaveBeenCalled();

    await browserBack("#/home");
    expect(at("overlays")).toBe("");
  });

  it("pushes one sentinel under StrictMode's double invoke", async () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );
    pushSpy.mockClear();
    backSpy.mockClear();

    await click("open sheet");

    expect(pushSpy).toHaveBeenCalledTimes(1);
    // The reverted attempt fired a real back() from the phantom cleanup here.
    expect(backSpy).not.toHaveBeenCalled();
  });

  it("leaves pushed screens to history, since they are routes already", async () => {
    function PushedHarness() {
      const [nav, dispatch] = useReducer(navReducer, window.location.hash, initialNavFromHash);
      useHistoryRoute(nav, dispatch);
      return <PushedScreen onClose={() => dispatch({ type: "popOverlay" })} />;
    }
    render(<PushedHarness />);
    pushSpy.mockClear();

    await act(async () => {});

    expect(pushSpy).not.toHaveBeenCalled();
  });
});
