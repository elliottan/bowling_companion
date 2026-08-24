import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SwipePanes } from "./SwipePanes";
import { clearViewMemory } from "../lib/viewMemory";

/** A horizontal drag, in the three events the component listens for. */
function swipeLeft(el: HTMLElement) {
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(el);
}

/** jsdom lays nothing out, so a scroller has to say so itself. */
function makeScrollable(el: HTMLElement) {
  Object.defineProperty(el, "scrollWidth", { value: 400, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: 200, configurable: true });
}

describe("SwipePanes", () => {
  it("switches pane on a horizontal drag", () => {
    const onIndexChange = vi.fn();
    render(
      <SwipePanes
        index={0}
        onIndexChange={onIndexChange}
        panes={[<span key="a">first</span>, <span key="b">second</span>]}
      />
    );
    swipeLeft(screen.getByText("first"));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("yields the drag to a row that scrolls sideways itself", () => {
    const onIndexChange = vi.fn();
    render(
      <SwipePanes
        index={0}
        onIndexChange={onIndexChange}
        panes={[
          <div key="a" style={{ overflowX: "auto" }} data-testid="row">
            <span>card</span>
          </div>,
          <span key="b">second</span>
        ]}
      />
    );
    makeScrollable(screen.getByTestId("row"));
    swipeLeft(screen.getByText("card"));
    // Scrolling the row is not a request to change tab.
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it("still switches when the sideways row has nothing to scroll", () => {
    const onIndexChange = vi.fn();
    render(
      <SwipePanes
        index={0}
        onIndexChange={onIndexChange}
        panes={[
          <div key="a" style={{ overflowX: "auto" }}>
            <span>card</span>
          </div>,
          <span key="b">second</span>
        ]}
      />
    );
    swipeLeft(screen.getByText("card"));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it("puts a pane's scroll offset back when the view is mounted again", () => {
    clearViewMemory();
    const panes = [<span key="a">first</span>, <span key="b">second</span>];
    const { container, unmount } = render(
      <SwipePanes index={0} onIndexChange={() => {}} panes={panes} scrollKey="test" />
    );
    const pane = container.querySelector(".overflow-y-auto") as HTMLElement;
    fireEvent.scroll(pane, { target: { scrollTop: 320 } });
    unmount();

    const again = render(
      <SwipePanes index={0} onIndexChange={() => {}} panes={panes} scrollKey="test" />
    );
    const restored = again.container.querySelector(".overflow-y-auto") as HTMLElement;
    expect(restored.scrollTop).toBe(320);
  });
});
