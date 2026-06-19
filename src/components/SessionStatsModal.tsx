import { X } from "lucide-react";
import { useMemo } from "react";
import { Stats } from "./Stats";
import { calculateCommonLeaves, calculateStats } from "../lib/stats";
import type { SessionSummary } from "../types/bowling";

interface SessionStatsModalProps {
  summary: SessionSummary;
  onClose: () => void;
}

/** Per-session stats: the History Stats pane scoped to a single session. */
export function SessionStatsModal({ summary, onClose }: SessionStatsModalProps) {
  const stats = useMemo(() => calculateStats([summary]), [summary]);
  const leaves = useMemo(() => calculateCommonLeaves([summary]), [summary]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-lane-50 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-950">
              {summary.session.alley_name}
            </h2>
            <p className="truncate text-xs text-slate-500">
              {[summary.session.date, summary.session.oil_pattern].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <Stats stats={stats} leaves={leaves} />
      </div>
    </div>
  );
}
