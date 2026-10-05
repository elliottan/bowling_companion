import { useState } from "react";
import { FormSheet } from "./ui/FormSheet";
import { ErrorBanner } from "./ErrorBanner";
import { FIELD, FIELD_LABEL } from "./ui/field";
import { BOWLER_NAME_MAX, setBowlerName } from "../services/bowlingRepository";

interface BowlerNameSheetProps {
  /** The name stored now, or null when there is none. */
  name: string | null;
  onClose: () => void;
}

/**
 * What the bowler wants to be called. Opened from Home's "Add your name" and from
 * Settings, so the two edit one setting through one sheet. Clearing the field
 * and saving forgets the name, and Home goes back to the greeting alone.
 */
export function BowlerNameSheet({ name, onClose }: BowlerNameSheetProps) {
  const [value, setValue] = useState(name ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError("");
    try {
      await setBowlerName(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your name.");
      setSaving(false);
    }
  }

  return (
    <FormSheet
      title="Your name"
      onClose={onClose}
      onConfirm={() => void save()}
      confirmLabel="Save name"
      confirmDisabled={saving}
      banner={error ? <ErrorBanner>{error}</ErrorBanner> : undefined}
    >
      <form onSubmit={(e) => void save(e)}>
        <label htmlFor="bowler-name" className={FIELD_LABEL}>
          What do you want to be called?
        </label>
        <input
          id="bowler-name"
          className={FIELD}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={BOWLER_NAME_MAX}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="done"
          autoFocus
        />
      </form>
    </FormSheet>
  );
}
