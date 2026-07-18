import { Component, type ErrorInfo, type ReactNode } from "react";
import { exportBackup } from "../services/backupRepository";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  exportState: "idle" | "exporting" | "success" | "failure";
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, exportState: "idle" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught an error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleExport = () => {
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center text-neutral-900">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-neutral-600">
          Sorry about that — the app hit an unexpected error and couldn&apos;t continue.
        </p>
        <p className="max-w-sm truncate rounded bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
          {error.message}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={this.handleExport}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
          >
            Export backup
          </button>
        </div>
        {exportState === "success" && (
          <p className="text-xs text-green-600">Backup exported.</p>
        )}
        {exportState === "failure" && (
          <p className="text-xs text-red-600">Export failed. Please try again.</p>
        )}
      </div>
    );
  }
}
