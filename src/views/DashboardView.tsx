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
    <section className="mx-auto w-full max-w-xl px-3 py-5 sm:px-6 sm:py-8">
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <SessionForm onSubmit={onStartSession} isSubmitting={isSubmitting} />
    </section>
  );
}
