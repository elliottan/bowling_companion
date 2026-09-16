import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OilPatternFormDialog } from "./OilPatternFormDialog";
import type { ParsedSheet } from "../lib/oilPatternSheet";

const readPatternSheet = vi.fn();
const readPatternSheetFromUrl = vi.fn();
vi.mock("../lib/oilPatternPdf", () => ({
  readPatternSheet: (file: File) => readPatternSheet(file),
  readPatternSheetFromUrl: (url: string) => readPatternSheetFromUrl(url),
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
    readPatternSheetFromUrl.mockReset();
  });

  it("leads the form with the import, above the name it fills in", () => {
    const { container } = renderForm();
    const fields = [...container.querySelectorAll("input")];
    const file = fields.findIndex((f) => f.type === "file");
    const name = fields.findIndex((f) => f.placeholder === "Kegel Main Street");
    expect(file).toBeGreaterThanOrEqual(0);
    expect(file).toBeLessThan(name);
    expect(screen.getByText(/nothing is uploaded/i)).toBeInTheDocument();
  });

  it("offers a link as well as a file", () => {
    renderForm();
    expect(screen.getByPlaceholderText(/chromium-6742\.pdf/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /read/i })).toBeInTheDocument();
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

describe("OilPatternFormDialog import from a link", () => {
  beforeEach(() => {
    readPatternSheet.mockReset();
    readPatternSheetFromUrl.mockReset();
  });

  function typeLink(url = "https://example.com/chromium-6742.pdf") {
    fireEvent.change(screen.getByPlaceholderText(/chromium-6742\.pdf/i), {
      target: { value: url },
    });
    return url;
  }

  it("reads a sheet from a link and fills the form", async () => {
    readPatternSheetFromUrl.mockResolvedValue(verified);
    renderForm();
    const url = typeLink();
    fireEvent.click(screen.getByRole("button", { name: /read/i }));

    await waitFor(() => expect(screen.getByText(/2 passes read/i)).toBeInTheDocument());
    expect(readPatternSheetFromUrl).toHaveBeenCalledWith(url);
    expect(screen.getByDisplayValue("Kegel Chromium 6742")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loads")).toHaveLength(2);
  });

  it("fills the sheet link from the link it imported, rather than asking twice", async () => {
    readPatternSheetFromUrl.mockResolvedValue(verified);
    renderForm();
    const url = typeLink();
    fireEvent.click(screen.getByRole("button", { name: /read/i }));

    await waitFor(() => expect(screen.getByText(/2 passes read/i)).toBeInTheDocument());
    const link = screen.getByPlaceholderText(/main-street\.pdf/i) as HTMLInputElement;
    expect(link.value).toBe(url);
  });

  it("keeps a sheet link the bowler already typed", async () => {
    readPatternSheetFromUrl.mockResolvedValue(verified);
    renderForm({ initial: { name: "", url: "https://kegel.net/mine.pdf" } });
    typeLink();
    fireEvent.click(screen.getByRole("button", { name: /read/i }));

    await waitFor(() => expect(screen.getByText(/2 passes read/i)).toBeInTheDocument());
    expect(screen.getByDisplayValue("https://kegel.net/mine.pdf")).toBeInTheDocument();
  });

  it("reads on Enter without submitting the form", async () => {
    readPatternSheetFromUrl.mockResolvedValue(verified);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });
    typeLink();
    fireEvent.keyDown(screen.getByPlaceholderText(/chromium-6742\.pdf/i), { key: "Enter" });

    await waitFor(() => expect(readPatternSheetFromUrl).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // A link the browser is not allowed to read is the common case, not an edge
  // one, so it has to say what to do about it.
  it("says what to do when the site will not let the page read the file", async () => {
    readPatternSheetFromUrl.mockRejectedValue(
      new Error(
        "Could not fetch that link. The site may not allow other pages to read its files, or you may be offline. Open the link and import the downloaded file instead."
      )
    );
    renderForm();
    typeLink();
    fireEvent.click(screen.getByRole("button", { name: /read/i }));

    await waitFor(() =>
      expect(screen.getByText(/import the downloaded file instead/i)).toBeInTheDocument()
    );
  });

  it("will not read an empty link", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /read/i })).toBeDisabled();
  });

  it("shows the distance and volume it read, which are derived and not typed", async () => {
    readPatternSheetFromUrl.mockResolvedValue(verified);
    renderForm();
    typeLink();
    fireEvent.click(screen.getByRole("button", { name: /read/i }));

    // Both passes run 2L to 2R (37 boards): 3 loads then 2, at 50 microlitres.
    // Twice on screen on purpose: the receipt says what the import read, the
    // load table says what the rows come to, and they part company the moment
    // a row is edited.
    await waitFor(() => expect(screen.getAllByText(/10 ft · 9\.25 mL/)).toHaveLength(2));
  });
});
