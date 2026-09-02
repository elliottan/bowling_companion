import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { exportBackup } from "../services/backupRepository";

vi.mock("../services/backupRepository", () => ({
  exportBackup: vi.fn()
}));

function Bomb(): never {
  throw new Error("kaboom");
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    vi.mocked(exportBackup).mockReset();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <AppErrorBoundary>
        <div>all good</div>
      </AppErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("shows fallback UI with the error message and action buttons when a child throws", () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    );

    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export backup/i })).toBeInTheDocument();
  });

  it("calls exportBackup and shows success text on resolve", async () => {
    vi.mocked(exportBackup).mockResolvedValue(undefined as never);

    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: /export backup/i }));

    expect(exportBackup).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/exported/i)).toBeInTheDocument();
    });
  });

  it("sends a shell older than its database to the update screen, not the crash screen", () => {
    // Dexie throws VersionError when the stored database is newer than the one
    // this build declares, which is a tab left open across a deploy.
    function StaleShell(): never {
      const err = new Error("newer version exists");
      err.name = "VersionError";
      throw err;
    }

    render(
      <AppErrorBoundary>
        <StaleShell />
      </AppErrorBoundary>
    );

    expect(screen.getByText("Headpin needs to update")).toBeInTheDocument();
    expect(screen.queryByText("The app crashed")).not.toBeInTheDocument();
  });

  it("offers a way back in beside Reload and Export", () => {
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("button", { name: /restore a backup/i })).toBeInTheDocument();
  });

  it("shows failure text when exportBackup rejects, without throwing", async () => {
    vi.mocked(exportBackup).mockRejectedValue(new Error("db locked"));

    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: /export backup/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });
  });
});
