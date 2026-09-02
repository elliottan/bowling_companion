import { Component, type ErrorInfo, type ReactNode } from "react";
import { exportBackup } from "../services/backupRepository";
import { Button } from "./ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  exportState: "idle" | "exporting" | "success" | "failure";
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, exportState: "idle" };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught an error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  // A crash the reload cannot clear leaves the bowler with a file and no way to
  // use it, so the third button is the road back in: set the hash first, then
  // reload, because this screen has replaced the app that reads the hash.
  handleRestore = () => {
    window.location.hash = "#/settings/backup";
    window.location.reload();
  };

  handleExport = () => {
    if (this.state.exportState === "exporting") return;
    this.setState({ exportState: "exporting" });
    exportBackup()
      .then(() => this.setState({ exportState: "success" }))
      .catch(() => this.setState({ exportState: "failure" }));
  };

  render() {
    const { error, exportState } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center text-ink">
        <h1 className="text-lg font-semibold">The app crashed</h1>
        <p className="text-sm text-ink-secondary">
          Your scores are still on this device.
        </p>
        <p className="max-w-sm truncate rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-secondary">
          {error.message}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={this.handleReload}>
            Reload
          </Button>
          <Button variant="secondary" onClick={this.handleExport}>
            Export backup
          </Button>
          <Button variant="secondary" onClick={this.handleRestore}>
            Restore a backup
          </Button>
        </div>
        {exportState === "success" && (
          <p className="text-xs text-success-700">Backup exported.</p>
        )}
        {exportState === "failure" && (
          <p className="text-xs text-danger-700">Export failed. Try again.</p>
        )}
      </div>
    );
  }
}
