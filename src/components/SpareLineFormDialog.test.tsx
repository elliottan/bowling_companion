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
