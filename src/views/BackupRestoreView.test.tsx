import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupRestoreView } from "./BackupRestoreView";
import { db } from "../db/bowlingDb";
import { createBackup } from "../services/backupRepository";
import { createSession } from "../services/bowlingRepository";

/** A backup file holding one session, ready to drop on the input. */
async function backupFileWith(alley: string): Promise<File> {
  await createSession({ date: "2026-05-27", alley_name: alley });
  const backup = await createBackup();
  await db.sessions.clear();
  return new File([JSON.stringify(backup)], "headpin.json", { type: "application/json" });
}

describe("BackupRestoreView", () => {
  beforeEach(async () => {
    URL.createObjectURL = () => "blob:stub";
    URL.revokeObjectURL = () => {};
    await db.delete();
    await db.open();
  });

  it("refuses a file that is not a backup, in the app's own words", async () => {
    render(<BackupRestoreView />);

    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["not json at all"], "photo.json", { type: "application/json" })] }
    });

    expect(await screen.findByText("That file is not a Headpin backup.")).toBeInTheDocument();
  });

  /**
   * Import destroys every local row and there is no server copy behind it, so
   * the confirm has to be earned: the counts are shown and the word is typed.
   */
  it("holds the replace behind a typed word", async () => {
    const file = await backupFileWith("Imported Lanes");
    await createSession({ date: "2026-05-27", alley_name: "Local Lanes" });

    render(<BackupRestoreView />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

    const gate = (await screen.findByText("Replace all data?")).closest(
      "[role=dialog]"
    ) as HTMLElement;
    const confirm = within(gate).getByRole("button", { name: /Replace everything/ });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(gate).getByRole("textbox"), { target: { value: "replace" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(gate).getByRole("textbox"), { target: { value: "REPLACE" } });
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it("says what is about to be lost, in counts", async () => {
    const file = await backupFileWith("Imported Lanes");
    await createSession({ date: "2026-05-27", alley_name: "Local Lanes" });
    await createSession({ date: "2026-05-28", alley_name: "Local Lanes" });

    render(<BackupRestoreView />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

    // Two on the device against one in the file: the shortfall is said out loud.
    expect(await screen.findByText(/You would lose/)).toHaveTextContent("1 session");
  });

  it("takes no for an answer and writes nothing", async () => {
    const file = await backupFileWith("Imported Lanes");
    await createSession({ date: "2026-05-27", alley_name: "Local Lanes" });

    render(<BackupRestoreView />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

    const gate = (await screen.findByText("Replace all data?")).closest(
      "[role=dialog]"
    ) as HTMLElement;
    fireEvent.click(within(gate).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Replace all data?")).not.toBeInTheDocument());
    expect(await db.sessions.count()).toBe(1);
    expect((await db.sessions.toArray())[0].alley_name).toBe("Local Lanes");
  });

  it("offers a backup and a restore, without naming a file format", () => {
    render(<BackupRestoreView />);

    expect(screen.getByRole("button", { name: "Save a backup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore a backup" })).toBeInTheDocument();
    expect(screen.queryByText(/JSON/)).not.toBeInTheDocument();
  });
});

// The view reads `navigator.storage`, which jsdom does not implement.
vi.stubGlobal("navigator", navigator);
