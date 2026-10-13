import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionForm } from "./SessionForm";
import { db } from "../db/bowlingDb";
import { addOilPattern, getAllOilPatterns, setOilPatternArchived } from "../services/ballRepository";

function renderForm(onSubmit = vi.fn(), initial?: { oil_pattern_id?: number }) {
  render(
    <>
      <SessionForm formId="f" onSubmit={onSubmit} initial={initial} />
      <button type="submit" form="f">
        Start
      </button>
    </>
  );
  return onSubmit;
}

const patternField = () => screen.getByRole("combobox", { name: "Oil pattern" });
const start = () => fireEvent.click(screen.getByRole("button", { name: "Start" }));

describe("SessionForm oil pattern", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("links a pattern picked from the suggestions", async () => {
    const id = await addOilPattern("Kegel Main Street");
    const onSubmit = renderForm();
    fireEvent.focus(patternField());
    fireEvent.change(patternField(), { target: { value: "main" } });
    fireEvent.click(await screen.findByRole("button", { name: /Kegel Main Street/ }));
    start();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].oil_pattern_id).toBe(id);
  });

  it("takes a pattern's name typed in full, whatever its case", async () => {
    const id = await addOilPattern("Kegel Main Street");
    const onSubmit = renderForm();
    await waitFor(async () => expect(await getAllOilPatterns()).toHaveLength(1));
    fireEvent.change(patternField(), { target: { value: "kegel main street" } });
    start();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].oil_pattern_id).toBe(id);
    expect(await getAllOilPatterns()).toHaveLength(1);
  });

  it("adds a name it does not know as a new pattern, the way an alley is typed", async () => {
    const onSubmit = renderForm();
    fireEvent.change(patternField(), { target: { value: "Thursday league" } });
    expect(screen.getByText(/A new pattern/)).toBeInTheDocument();
    start();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const all = await getAllOilPatterns();
    expect(all.map((p) => p.name)).toEqual(["Thursday league"]);
    expect(onSubmit.mock.calls[0][0].oil_pattern_id).toBe(all[0].id);
  });

  it("reuses an archived pattern typed by name rather than adding a second", async () => {
    const id = await addOilPattern("Old league");
    await setOilPatternArchived(id, true);
    const onSubmit = renderForm();
    fireEvent.change(patternField(), { target: { value: "Old league" } });
    start();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].oil_pattern_id).toBe(id);
    expect(await getAllOilPatterns()).toHaveLength(1);
  });

  it("opens an edited session on its pattern's name, and an emptied field saves none", async () => {
    const id = await addOilPattern("Chromium");
    const onSubmit = renderForm(vi.fn(), { oil_pattern_id: id });
    await waitFor(() => expect(patternField()).toHaveValue("Chromium"));
    fireEvent.click(screen.getByRole("button", { name: "Clear oil pattern" }));
    start();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].oil_pattern_id).toBeUndefined();
  });
});
