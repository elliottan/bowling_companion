import { useEffect, useState } from "react";
import { Stats } from "../components/Stats";
import { calculateStats, type BowlingStats } from "../lib/stats";
import { getSessionHistory } from "../services/bowlingRepository";

const EMPTY: BowlingStats = {
  totalSessions: 0,
  totalGames: 0,
  completedGames: 0,
  averageScore: null,
  highGame: null,
  strikePct: null,
  sparePct: null,
  byAlley: []
};

export function StatsView() {
  const [stats, setStats] = useState<BowlingStats>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const history = await getSessionHistory();
        if (isMounted) setStats(calculateStats(history));
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load stats.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <h1 className="mb-4 text-xl font-bold text-slate-950">Stats</h1>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <Stats stats={stats} isLoading={isLoading} />
    </section>
  );
}
