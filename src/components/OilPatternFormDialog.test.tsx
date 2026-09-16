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

describe("OilPatternFormDialog catalog link", () => {
  // Backward compatibility: a pattern typed in before the catalog existed is
  // already on sessions, so it is enriched in place rather than replaced.
  it("offers a catalog load table to a pattern that has none", () => {
    const onLinkCatalog = vi.fn();
    renderForm({ initial: { id: 3, name: "Thursday league" }, onLinkCatalog });
    fireEvent.click(screen.getByRole("button", { name: /use a load table from the catalog/i }));
    expect(onLinkCatalog).toHaveBeenCalled();
  });

  // Linking is one way (ADR-105): a linked pattern is that catalog pattern, and
  // the only thing left that is the bowler's is its name.
  it("says a linked pattern is the catalog's, and offers only its name", () => {
    renderForm({
      initial: { id: 3, name: "Thursday shot", catalog_id: "stonehenge", passes: CHROMIUM_6742 },
      onLinkCatalog: vi.fn(),
    });
    expect(screen.getByText(/This is a catalog pattern/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Thursday shot")).toBeInTheDocument();
    // Its sheet link and its table belong to the catalog now.
    expect(screen.queryByPlaceholderText(/main-street\.pdf/i)).toBeNull();
    expect(screen.queryByLabelText(/length/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /use a load table/i })).toBeNull();
  });

  it("does not offer one to a pattern that already has a table", () => {
    renderForm({
      initial: { id: 3, name: "Chromium", passes: CHROMIUM_6742 },
      onLinkCatalog: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /use a load table/i })).toBeNull();
  });

  it("still lets the pattern be renamed", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ initial: { id: 3, name: "Kegel Main Street" }, onSubmit });
    fireEvent.change(screen.getByDisplayValue("Kegel Main Street"), {
      target: { value: "My house shot" },
    });
    fireEvent.submit(document.getElementById("oil-pattern-form")!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].name).toBe("My house shot");
  });
});
