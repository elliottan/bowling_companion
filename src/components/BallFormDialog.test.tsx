import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BallFormDialog } from "./BallFormDialog";
import { db } from "../db/bowlingDb";
import { addBall, getBalls } from "../services/ballRepository";
import { setLayoutSystem } from "../services/bowlingRepository";
import type { BallLayoutSpec } from "../types/bowling";

const SPEC: BallLayoutSpec = {
  drillingAngle: 50,
  pinToPap: 4.5,
  valAngle: 40,
  symmetric: false,
  pinToCore: 6.75
};

const save = () => fireEvent.click(screen.getByRole("button", { name: /^(Add|Save)$/ }));

/** The ball this form just wrote. */
const saved = async (name: string) => (await getBalls()).find((b) => b.name === name);

describe("BallFormDialog layout", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("saves a ball with no layout, because a layout is optional", async () => {
    render(<BallFormDialog ball={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Plastic" } });
    save();

    await waitFor(async () => expect(await saved("Plastic")).toBeTruthy());
    expect((await saved("Plastic"))?.layout_spec).toBeUndefined();
  });

  it("stores the numbers a slider moved, not the text that was typed", async () => {
    render(<BallFormDialog ball={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Phaze II" } });
    fireEvent.click(screen.getByRole("button", { name: /Add a layout/ }));
    fireEvent.change(screen.getByRole("slider", { name: "Drilling angle" }), {
      target: { value: "60" }
    });
    save();

    await waitFor(async () => expect((await saved("Phaze II"))?.layout_spec).toBeTruthy());
    const spec = (await saved("Phaze II"))?.layout_spec;
    expect(spec?.drillingAngle).toBe(60);
    expect(spec?.pinToPap).toBe(4.5);
    expect(spec?.symmetric).toBe(false);
    // Nothing chose a notation, so the ball keeps following the preference.
    expect(spec?.system).toBeUndefined();
  });

  it("edits a layout in VLS and stores the dual angle it means", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Storm VLS/ }));
    fireEvent.change(await screen.findByRole("slider", { name: "Pin buffer" }), {
      target: { value: "1" }
    });
    save();

    await waitFor(async () => expect((await saved("Phaze II"))?.layout_spec?.system).toBe("vls"));
    const spec = (await saved("Phaze II"))?.layout_spec;
    // A VLS edit is an edit to the one layout underneath both notations: a
    // shorter pin buffer is a smaller VAL angle, and the angle is what gets
    // stored.
    expect(spec?.valAngle).toBeLessThan(SPEC.valAngle);
    expect(spec?.pinToPap).toBe(4.5);
  });

  it("opens the sliders in the notation the bowler reads", async () => {
    await setLayoutSystem("vls");
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole("slider", { name: "Pin buffer" })).toBeTruthy();
  });

  it("does not ask for a pin-to-PSA distance, which the core fixes at 6 3/4\"", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole("slider", { name: "Pin to PAP" })).toBeTruthy();
    expect(screen.queryByRole("slider", { name: "Pin to PSA" })).toBeNull();
  });

  it("moves the core marker with the core type, so the ball still exists", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Symmetric" }));
    save();

    await waitFor(async () =>
      expect((await saved("Phaze II"))?.layout_spec?.symmetric).toBe(true)
    );
    expect((await saved("Phaze II"))?.layout_spec?.pinToCore).toBe(3);
  });

  it("removes a layout without touching the rest of the ball", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC, notes: "keep me" });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove layout/ }));
    save();

    await waitFor(async () =>
      expect((await saved("Phaze II"))?.layout_spec).toBeUndefined()
    );
    expect((await saved("Phaze II"))?.notes).toBe("keep me");
  });

  it("keeps the text typed on a ball from before, until numbers replace it", async () => {
    await addBall({ name: "Old ball", is_spare_ball: false, layout: "45 x 4-1/2 x 35" });
    const ball = await saved("Old ball");

    const first = render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/carries the layout you typed before/)).toBeTruthy();
    save();
    await waitFor(async () => expect((await saved("Old ball"))?.layout).toBe("45 x 4-1/2 x 35"));
    first.unmount();

    render(<BallFormDialog ball={(await saved("Old ball"))!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Add a layout/ }));
    save();

    await waitFor(async () => expect((await saved("Old ball"))?.layout_spec).toBeTruthy());
    expect((await saved("Old ball"))?.layout).toBeUndefined();
  });
});
