/**
 * The one "still reading" card. A live query returns `undefined` before its
 * first result, and a view that folds that into an empty array shows its empty
 * state for a frame, which says "you have nothing" to someone who has plenty.
 */
export function LoadingCard({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="rounded-xl border border-edge bg-surface p-4 text-sm text-ink-secondary shadow-sm">
      {label}
    </p>
  );
}
