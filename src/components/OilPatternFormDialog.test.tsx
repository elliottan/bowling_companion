import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OilPatternFormDialog } from "./OilPatternFormDialog";

function renderForm(props: Partial<React.ComponentProps<typeof OilPatternFormDialog>> = {}) {
  return render(
    <OilPatternFormDialog open onSubmit={async () => {}} onCancel={() => {}} {...props} />
  );
}

describe("OilPatternFormDialog", () => {
  it("leads with the name, which is the only thing a pattern must have", () => {
    const { container } = renderForm();
    const first = container.querySelector("input") as HTMLInputElement;
    expect(first.placeholder).toBe("Kegel Main Street");
  });

  // The sheet readers moved out of the app and into the catalog pipeline
  // (ADR-104), so the form takes a load table by hand or from the catalog, and
  // carries no PDF reader of its own.
  it("carries no sheet import", () => {
    const { container } = renderForm();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /read/i })).toBeNull();
  });

  it("takes a load table by hand, and totals it as it is typed", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /add pass/i }));

    await waitFor(() => expect(screen.getAllByLabelText("Loads")).toHaveLength(1));
    // The seeded row is 10L to 10R, 2 loads at 40 microlitres over 21 boards.
    expect(screen.getByText(/35 ft · 1\.68 mL/)).toBeInTheDocument();
  });

  it("takes boards in the sheet's own notation", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /add pass/i }));
    await waitFor(() => expect(screen.getByLabelText("Start board")).toBeInTheDocument());
    expect((screen.getByLabelText("Start board") as HTMLInputElement).value).toBe("10L");
  });

  it("submits the name and the table together", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });
    fireEvent.change(screen.getByPlaceholderText("Kegel Main Street"), {
      target: { value: "Thursday league" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add pass/i }));
    fireEvent.submit(document.getElementById("oil-pattern-form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Thursday league" });
    expect(onSubmit.mock.calls[0][0].passes).toHaveLength(1);
  });
});
