import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArsenalView } from "./ArsenalView";
import { db } from "../db/bowlingDb";
import { addBall, getBalls } from "../services/ballRepository";
import { setLayoutSystem, setPap } from "../services/bowlingRepository";
import type { BallLayoutSpec } from "../types/bowling";
import { ProAccessContext } from "../lib/useProAccess";

const SPEC: BallLayoutSpec = {
  drillingAngle: 50,
  pinToPap: 4.5,
  valAngle: 40,
  symmetric: false,
  pinToCore: 6.75
};

/* The reading is a row of spans, not one text node: the fractions in it are set
 * a step smaller than the whole inches, which is the whole point of `Measure`.
 * So a row is found by what it reads as, whole, rather than by a text node. */
const reading = (match: RegExp) =>
  screen.findByText((_text, el) =>
    el?.tagName === "P" && match.test(el.textContent ?? "")
  );

describe("ArsenalView", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("writes a stored layout in the notation the bowler reads", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });

    render(<ArsenalView onBack={vi.fn()} />);
    expect(await reading(/^50° x 4 1\/2 x 40°$/)).toBeTruthy();
  });

  it("lets a ball override that notation, so a drill sheet reads back as written", async () => {
    await setLayoutSystem("dual");
    await addBall({
      name: "Phaze II",
      is_spare_ball: false,
      layout_spec: { ...SPEC, system: "vls" }
    });

    render(<ArsenalView onBack={vi.fn()} />);
    // VLS leads with the pin-to-PAP distance where the dual angle leads with a
    // drilling angle, so the same ball reads 4 1/2 first rather than 50.
    expect(await reading(/^4 1\/2 x /)).toBeTruthy();
  });

  it("shows each ball's weight on its row", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, weight: 15 });
    render(<ArsenalView onBack={vi.fn()} />);
    expect(await screen.findByText("15 lb")).toBeInTheDocument();
  });

  it("still shows what was typed on a ball entered before layouts were numbers", async () => {
    await addBall({ name: "Old ball", is_spare_ball: false, layout: "45 x 4-1/2 x 35" });

    render(<ArsenalView onBack={vi.fn()} />);
    expect(await reading(/^45 x 4-1\/2 x 35$/)).toBeTruthy();
  });

  it("sends the layout, the ball's core and the bowler's own axis to the lab", async () => {
    await setPap({ over: 4.75, up: -0.5 });
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const onViewLayout = vi.fn();

    render(<ArsenalView onBack={vi.fn()} onViewLayout={onViewLayout} />);
    const view = await screen.findByRole("button", { name: /View the layout on Phaze II/ });

    // The PAP arrives from Dexie a tick after the row, and a layout read
    // against the wrong axis is the wrong layout.
    const lastSeed = () => {
      const calls = onViewLayout.mock.calls;
      return calls[calls.length - 1]?.[0];
    };
    await waitFor(() => {
      fireEvent.click(view);
      expect(lastSeed().pap).toEqual({ over: 4.75, up: -0.5 });
    });
    const seed = lastSeed();
    expect(seed.layout).toEqual({ drillingAngle: 50, pinToPap: 4.5, valAngle: 40 });
    expect(seed.ball.pinToCore).toBe(6.75);
    expect(seed.ballName).toBe("Phaze II");
  });

  it("offers the layout on the ball's own sheet too, beside its numbers", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const onViewLayout = vi.fn();
    render(<ArsenalView onBack={vi.fn()} onViewLayout={onViewLayout} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Phaze II/ }));
    const sheet = await screen.findByRole("dialog", { name: "Phaze II" });
    await waitFor(() => {
      fireEvent.click(within(sheet).getByRole("button", { name: "View the layout on Phaze II" }));
      expect(onViewLayout).toHaveBeenCalled();
    });
    expect(onViewLayout.mock.lastCall![0].ballName).toBe("Phaze II");
  });

  it("without Pro, keeps View layout and says Pro draws it, rather than opening the lab (ADR-193)", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const onViewLayout = vi.fn();
    render(
      <ProAccessContext.Provider value={{ locked: true, appStoreUrl: "https://apps.apple.com/app/id1" }}>
        <ArsenalView onBack={vi.fn()} onViewLayout={onViewLayout} />
      </ProAccessContext.Provider>
    );
    fireEvent.click(await screen.findByRole("button", { name: /View the layout on Phaze II/ }));
    expect(await screen.findByText("Get Pro to visualize your ball layout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get the app" })).toBeInTheDocument();
    expect(onViewLayout).not.toHaveBeenCalled();
  });

  it("offers nothing to view on a ball with no layout", async () => {
    await addBall({ name: "Plastic", is_spare_ball: true });

    render(<ArsenalView onBack={vi.fn()} onViewLayout={vi.fn()} />);
    expect(await screen.findByText("Plastic")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /View the layout/ })).toBeNull();
  });

  it("retires a ball from its editor, keeps it below the bag, and brings it back (ADR-133)", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false });
    await addBall({ name: "Old Hammer", is_spare_ball: false });
    render(<ArsenalView onBack={vi.fn()} />);

    fireEvent.click(await screen.findByText("Old Hammer"));
    // Under the sheet's More, and asked first, rather than a button across its
    // foot that a stray tap could fire.
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retire ball" }));
    expect(await screen.findByRole("heading", { name: "Retire Old Hammer?" })).toBeInTheDocument();
    expect((await getBalls()).find((b) => b.name === "Old Hammer")?.retired).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));

    // Out of the bag, still in the database, and behind a toggle.
    await waitFor(() => expect(screen.queryByText("Old Hammer")).toBeNull());
    expect((await getBalls()).find((b) => b.name === "Old Hammer")?.retired).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show retired (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Bring back Old Hammer" }));

    await waitFor(async () =>
      expect((await getBalls()).find((b) => b.name === "Old Hammer")?.retired).toBe(false)
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /Show retired/ })).toBeNull());
  });
});
