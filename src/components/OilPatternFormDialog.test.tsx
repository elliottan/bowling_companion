import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OilPatternFormDialog } from "./OilPatternFormDialog";
import type { ParsedSheet } from "../lib/oilPatternSheet";

const readPatternSheet = vi.fn();
vi.mock("../lib/oilPatternPdf", () => ({
  readPatternSheet: (file: File) => readPatternSheet(file),
}));

const PASS = {
  direction: "forward" as const,
  left_board: 2,
  right_board: 38,
  loads: 3,
  microliters: 50,
  start_distance: 0,
  end_distance: 5.1,
};

const verified: ParsedSheet = {
  name: "Kegel Chromium 6742",
  passes: [PASS, { ...PASS, loads: 2, start_distance: 5.1, end_distance: 10.2 }],
  checks: [
    { label: "Row 1 crossings", stated: 111, derived: 111, ok: true },
    { label: "Total volume", stated: 25.56, derived: 25.56, ok: true },
  ],
  verified: true,
};

function renderForm(props: Partial<React.ComponentProps<typeof OilPatternFormDialog>> = {}) {
  return render(
    <OilPatternFormDialog
      open
      onSubmit={async () => {}}
      onCancel={() => {}}
      {...props}
    />
  );
}

function importFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "chromium-6742.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe("OilPatternFormDialog sheet import", () => {
  beforeEach(() => {
    readPatternSheet.mockReset();
  });

  it("offers the import above the load table, since it fills it in", () => {
    const { container } = renderForm();
    const file = container.querySelector('input[type="file"]');
    expect(file).not.toBeNull();
    expect(screen.getByText(/nothing is uploaded/i)).toBeInTheDocument();
  });

  it("fills the passes and the name from a sheet that checks out", async () => {
    readPatternSheet.mockResolvedValue(verified);
    const { container } = renderForm();
    importFile(container);

    await waitFor(() => expect(screen.getByText(/2 passes read/i)).toBeInTheDocument());
    expect(screen.getByText(/the sheet checks out/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Kegel Chromium 6742")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loads")).toHaveLength(2);
  });

  it("submits what the sheet gave it", async () => {
    readPatternSheet.mockResolvedValue(verified);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = renderForm({ onSubmit });
    importFile(container);
    await waitFor(() => expect(screen.getByText(/2 passes read/i)).toBeInTheDocument());

    fireEvent.submit(document.getElementById("oil-pattern-form")!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].passes).toHaveLength(2);
  });

  // The whole point of the checksums: a sheet that does not add up still fills
  // the rows in, and is never called verified.
  it("says so, and names the sum, when the sheet does not add up", async () => {
    readPatternSheet.mockResolvedValue({
      ...verified,
      checks: [
        { label: "Row 1 crossings", stated: 99, derived: 111, ok: false },
        { label: "Total volume", stated: 25.56, derived: 25.56, ok: true },
      ],
      verified: false,
    });
    const { container } = renderForm();
    importFile(container);

    await waitFor(() => expect(screen.getByText(/does not add up/i)).toBeInTheDocument());
    expect(screen.getByText(/Row 1 crossings: sheet says 99, rows come to 111/)).toBeInTheDocument();
    // Still filled in, so the one bad row can be fixed rather than retyped.
    expect(screen.getAllByLabelText("Loads")).toHaveLength(2);
  });

  it("reports a file with no load table in it", async () => {
    readPatternSheet.mockResolvedValue({ passes: [], checks: [], verified: false });
    const { container } = renderForm();
    importFile(container);

    await waitFor(() => expect(screen.getByText(/Is it a pattern sheet\?/i)).toBeInTheDocument());
  });

  it("reports a reader that throws rather than failing silently", async () => {
    readPatternSheet.mockRejectedValue(new Error("That file is too big to be a pattern sheet."));
    const { container } = renderForm();
    importFile(container);

    await waitFor(() =>
      expect(screen.getByText(/too big to be a pattern sheet/i)).toBeInTheDocument()
    );
  });

  it("keeps a name the bowler already typed", async () => {
    readPatternSheet.mockResolvedValue(verified);
    const { container } = renderForm();
    fireEvent.change(screen.getByPlaceholderText(/Kegel Main Street/i), {
      target: { value: "Thursday league" },
    });
    importFile(container);

    await waitFor(() => expect(screen.getByText(/2 passes read/i)).toBeInTheDocument());
    expect(screen.getByDisplayValue("Thursday league")).toBeInTheDocument();
  });
});
