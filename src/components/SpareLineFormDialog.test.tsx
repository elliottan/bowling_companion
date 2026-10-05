import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../db/bowlingDb";
import { SpareLineFormDialog } from "./SpareLineFormDialog";

const noop = () => {};

function renderDialog(overrides: Partial<Parameters<typeof SpareLineFormDialog>[0]> = {}) {
  return render(
    <SpareLineFormDialog
      initialPins={[10]}
      lockPins
      onSaved={noop}
      onCancel={noop}
      {...overrides}
    />
  );
}

describe("SpareLineFormDialog strike ball move", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("steps half a board per tap, in both directions, through zero", () => {
    renderDialog();
    const box = screen.getByLabelText("target move") as HTMLInputElement;

    fireEvent.click(screen.getByLabelText("target move up half a board"));
    expect(box.value).toBe("0.5");
    fireEvent.click(screen.getByLabelText("target move up half a board"));
    expect(box.value).toBe("1");

    const down = screen.getByLabelText("target move down half a board");
    fireEvent.click(down);
    fireEvent.click(down);
    fireEvent.click(down);
    // A phone's numeric keyboard has no minus key, so the arrows are the only
    // way to the left half of the range. They have to cross zero to get there.
    expect(box.value).toBe("-0.5");
  });

  it("saves a negative move reached with the arrows", async () => {
    const onSaved = vi.fn();
    renderDialog({ onSaved });

    const down = screen.getByLabelText("stance move down half a board");
    fireEvent.click(down);
    fireEvent.click(down);
    fireEvent.click(screen.getByLabelText("Save spare line"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.spare_lines.toArray();
    expect(saved[0]?.strike_offset).toEqual({ stance: -1 });
  });

  it("still takes a typed move, minus sign and all", async () => {
    const onSaved = vi.fn();
    renderDialog({ onSaved });

    fireEvent.change(screen.getByLabelText("target move"), { target: { value: "-2.5" } });
    fireEvent.click(screen.getByLabelText("Save spare line"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.spare_lines.toArray();
    expect(saved[0]?.strike_offset).toEqual({ target: -2.5 });
  });
});

describe("SpareLineFormDialog reading and editing", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("opens to read, and the pencil turns into the tick that saves", async () => {
    const onSaved = vi.fn();
    renderDialog({ startInView: true, initialLine: { stance: 30, target: 15 }, onSaved });

    const stance = screen.getByLabelText("Stance") as HTMLInputElement;
    expect(stance.readOnly).toBe(true);
    expect(screen.queryByLabelText("Save spare line")).toBeNull();
    expect(screen.queryByLabelText("stance move up half a board")).toBeNull();

    fireEvent.click(screen.getByLabelText("Edit spare line"));
    expect(stance.readOnly).toBe(false);
    fireEvent.change(stance, { target: { value: "32" } });
    fireEvent.click(screen.getByLabelText("Save spare line"));

    // Back to reading, not closed: the sheet was opened to look at the leave.
    expect(await screen.findByLabelText("Edit spare line")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    const saved = await db.spare_lines.toArray();
    expect(saved[0]?.line?.stance).toBe(32);
  });

  it("titles a single pin with Pin and a combination with dashes", () => {
    const { unmount } = renderDialog({ initialPins: [7] });
    expect(screen.getByRole("dialog", { name: "Pin 7" })).toBeInTheDocument();
    unmount();
    renderDialog({ initialPins: [2, 4, 5, 8] });
    expect(screen.getByRole("dialog", { name: "2-4-5-8" })).toBeInTheDocument();
  });

  it("keeps a note written before the field was taken off the sheet", async () => {
    const onSaved = vi.fn();
    renderDialog({ initialNotes: "Hold the hand", onSaved });
    fireEvent.click(screen.getByLabelText("Save spare line"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.spare_lines.toArray();
    expect(saved[0]?.notes).toBe("Hold the hand");
  });

  it("copies another leave's boards onto this one", async () => {
    renderDialog({
      initialPins: [2, 4, 8],
      spareLines: [{ id: 1, pins: [2, 4, 5, 8], line: { stance: 25, target: 12 } }]
    });
    fireEvent.click(screen.getByLabelText("Use another leave's line"));
    fireEvent.click(await screen.findByLabelText("Use the line for pins 2, 4, 5, 8"));
    await waitFor(() =>
      expect((screen.getByLabelText("Target") as HTMLInputElement).value).toBe("12")
    );
  });
});
