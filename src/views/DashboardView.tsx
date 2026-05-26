import { SessionForm, type NewSessionFormValues } from "../components/SessionForm";

interface DashboardViewProps {
  onStartSession: (values: NewSessionFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
  error?: string;
}

export function DashboardView({
  onStartSession,
  isSubmitting = false,
  error
}: DashboardViewProps) {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
      <div className="flex min-h-[420px] flex-col justify-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-felt-700">
          Bowling Companion
        </p>
        <h1 className="max-w-3xl text-4xl font-bold text-slate-950 sm:text-5xl">
          Score games quickly, keep the history on this device.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
          Start a local session, add games in order, and keep frame-by-frame
          scoring data in IndexedDB for offline access.
        </p>
        {error ? (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <SessionForm onSubmit={onStartSession} isSubmitting={isSubmitting} />
    </section>
  );
}
