import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirstRun } from "./FirstRun";
import { db } from "../db/bowlingDb";
import { createBackup } from "../services/backupRepository";
import { createSession } from "../services/bowlingRepository";

/** A backup file holding one session, ready to drop on the hidden input. */
async function backupFileWith(alley: string): Promise<File> {
  await createSession({ date: "2026-05-27", alley_name: alley });
  const backup = await createBackup();
  await db.sessions.clear();
  return new File([JSON.stringify(backup)], "headpin.json", { type: "application/json" });
}

function pickFile(file: File) {
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
}

describe("FirstRun", () => {
  beforeEach(async () => {
    URL.createObjectURL = () => "blob:stub";
    URL.revokeObjectURL = () => {};
    await db.delete();
    await db.open();
  });

  it("offers the restore before it asks the hand, because a backup carries it", () => {
    render(<FirstRun onSelectHandedness={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore from a backup" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /handed/ })).toBeNull();
  });

  it("walks a new bowler through to the handedness question and back", () => {
    const onSelectHandedness = vi.fn();
    render(<FirstRun onSelectHandedness={onSelectHandedness} />);

    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    expect(screen.getByText("Which hand do you bowl with?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Start fresh" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Right-handed" }));
    expect(onSelectHandedness).toHaveBeenCalledWith("right");
  });

  /**
   * A device holding a history is not new, so the welcome and the offer to
   * start fresh are both wrong for it (ADR-077).
   */
  it("asks a bowler with history only the question they have not answered", () => {
    render(<FirstRun onSelectHandedness={vi.fn()} hasSavedData />);

    expect(screen.getByText("Which hand do you bowl with?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start fresh" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("refuses a file that is not a backup without leaving the welcome", async () => {
    render(<FirstRun onSelectHandedness={vi.fn()} />);

    pickFile(new File(["not json at all"], "photo.json", { type: "application/json" }));

    expect(await screen.findByText("That file is not a Headpin backup.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore from a backup" })).toBeInTheDocument();
  });

  it("shows what a backup holds, and how old it is, before restoring it", async () => {
    render(<FirstRun onSelectHandedness={vi.fn()} />);

    pickFile(await backupFileWith("Restored Lanes"));

    expect(await screen.findByText(/^Backed up /)).toBeInTheDocument();
    expect(screen.getByText(/Holds/)).toHaveTextContent("1 session");
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  /**
   * The boot gate should mean a bowler with sessions never reaches the welcome,
   * but a slow read is a race, and the cost of losing it is every session on
   * the device. The same typed gate the Settings restore uses stands behind it.
   */
  it("puts the typed gate in front of a restore over existing sessions", async () => {
    const file = await backupFileWith("Restored Lanes");
    await createSession({ date: "2026-05-27", alley_name: "Local Lanes" });

    render(<FirstRun onSelectHandedness={vi.fn()} />);
    pickFile(file);

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    const gate = (await screen.findByText("Replace all data?")).closest(
      "[role=dialog]"
    ) as HTMLElement;
    expect(within(gate).getByRole("button", { name: /Replace everything/ })).toBeDisabled();
    expect(await db.sessions.count()).toBe(1);
  });

  it("restores an empty device with no gate and no safety copy of nothing", async () => {
    const downloads: string[] = [];
    URL.createObjectURL = () => {
      downloads.push("one");
      return "blob:stub";
    };
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload
    } as unknown as Location);

    render(<FirstRun onSelectHandedness={vi.fn()} />);
    pickFile(await backupFileWith("Restored Lanes"));

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.queryByText("Replace all data?")).not.toBeInTheDocument();
    expect(downloads).toHaveLength(0);
    expect((await db.sessions.toArray())[0].alley_name).toBe("Restored Lanes");
  });
});
