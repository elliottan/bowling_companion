import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OilPatternFormDialog } from "./OilPatternFormDialog";
import { CHROMIUM_6742 } from "../lib/oilPattern.fixture";

function renderForm(props: Partial<React.ComponentProps<typeof OilPatternFormDialog>> = {}) {
  return render(
    <OilPatternFormDialog open onSubmit={async () => {}} onCancel={() => {}} {...props} />
  );
}

describe("OilPatternFormDialog", () => {
  it("asks for a name, a length and a link, and nothing else", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Kegel Main Street")).toBeInTheDocument();
    expect(screen.getByLabelText(/length/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/main-street\.pdf/i)).toBeInTheDocument();
  });

  // Typing a load table is fifteen rows of seven numbers, and the patterns
  // worth drawing come from the catalog already read and checked (ADR-104).
  it("offers no load table editor", () => {
    renderForm();
    expect(screen.queryByRole("button", { name: /add pass/i })).toBeNull();
    expect(screen.queryByLabelText("Loads")).toBeNull();
  });

  it("saves the length as a number", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });
    fireEvent.change(screen.getByPlaceholderText("Kegel Main Street"), {
      target: { value: "Thursday league" },
    });
    fireEvent.change(screen.getByLabelText(/length/i), { target: { value: "40" } });
    fireEvent.submit(document.getElementById("oil-pattern-form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Thursday league", distance: 40 });
  });

  it("leaves the length out when it is not given", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });
    fireEvent.change(screen.getByPlaceholderText("Kegel Main Street"), {
      target: { value: "Nameless" },
    });
    fireEvent.submit(document.getElementById("oil-pattern-form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].distance).toBeUndefined();
  });

  // Editing a catalog pattern must not quietly destroy the table that is the
  // only reason the lane can draw it.
  it("carries a catalog pattern's load table through an edit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({
      onSubmit,
      initial: { id: 1, name: "Chromium 6742", passes: CHROMIUM_6742 },
    });

    expect(screen.getByText(/From the catalog/i)).toBeInTheDocument();
    expect(screen.getByText(/42 ft · 25\.56 mL · 6\.7:1 · Challenge/)).toBeInTheDocument();
    // And no length box, because the table already says how long it is.
    expect(screen.queryByLabelText(/length/i)).toBeNull();

    fireEvent.submit(document.getElementById("oil-pattern-form")!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].passes).toHaveLength(15);
  });
});
