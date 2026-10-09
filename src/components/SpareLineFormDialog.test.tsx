import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../db/bowlingDb";
import { HandednessContext } from "../lib/handednessContext";
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

  it("steps half a board per tap, in both directions, through zero, and says which way", () => {
    renderDialog();
    const box = screen.getByLabelText("target move");
    expect(box).toHaveTextContent("None");

    fireEvent.click(screen.getByLabelText("target move left half a board"));
    expect(box).toHaveTextContent("0.5 left");
    fireEvent.click(screen.getByLabelText("target move left half a board"));
    expect(box).toHaveTextContent("1 left");

    const right = screen.getByLabelText("target move right half a board");
    fireEvent.click(right);
    fireEvent.click(right);
    fireEvent.click(right);
    // Through zero and out the other side, in words rather than a sign.
    expect(box).toHaveTextContent("0.5 right");
  });

  it("saves a move right as down the boards for a right-hander", async () => {
    const onSaved = vi.fn();
    renderDialog({ onSaved });

    const right = screen.getByLabelText("stance move right half a board");
    fireEvent.click(right);
    fireEvent.click(right);
    fireEvent.click(screen.getByLabelText("Save spare line"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.spare_lines.toArray();
    expect(saved[0]?.strike_offset).toEqual({ stance: -1 });
  });

  it("saves a move left as down the boards for a left-hander", async () => {
    const onSaved = vi.fn();
    render(
      <HandednessContext.Provider value="left">
        <SpareLineFormDialog initialPins={[10]} lockPins onSaved={onSaved} onCancel={noop} />
      </HandednessContext.Provider>
    );

    const left = screen.getByLabelText("target move left half a board");
    fireEvent.click(left);
    fireEvent.click(left);
    fireEvent.click(left);
    fireEvent.click(left);
    fireEvent.click(left);
    expect(screen.getByLabelText("target move")).toHaveTextContent("2.5 left");
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
    expect(screen.queryByLabelText("stance move left half a board")).toBeNull();

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

  it("offers a leave answered by a strike ball move, and copies the move", async () => {
    const onSaved = vi.fn();
    renderDialog({
      initialPins: [2, 8],
      onSaved,
      spareLines: [{ id: 1, pins: [2, 8, 10], strike_offset: { stance: -2, target: -1 } }]
    });
    fireEvent.click(screen.getByLabelText("Use another leave's line"));
    fireEvent.click(await screen.findByLabelText("Use the line for pins 2, 8, 10"));
    await waitFor(() => expect(screen.getByLabelText("stance move")).toHaveTextContent("2 right"));
    expect(screen.getByLabelText("target move")).toHaveTextContent("1 right");

    fireEvent.click(screen.getByLabelText("Save spare line"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.spare_lines.toArray();
    expect(saved[0]?.strike_offset).toEqual({ stance: -2, target: -1 });
  });
});

describe("SpareLineFormDialog at a pocket leave (ADR-123)", () => {
  it("says it needs no spare line, and asks for no boards", () => {
    renderDialog({ initialPins: [1, 3, 5] });
    expect(screen.getByText(/A pocket shot/)).toBeInTheDocument();
    expect(screen.queryByText("Spare ball line")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit spare line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save spare line" })).not.toBeInTheDocument();
  });
});
