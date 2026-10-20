interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Colour of the switch when it is on; a CSS colour. */
  accent: string;
  /** The text beside it names it, so it needs no label of its own. */
  id?: string;
}

/**
 * An on/off setting, drawn by the system.
 *
 * `switch` on a checkbox is HTML's own switch: Safari draws iOS's, and the phone
 * restyles it with each release, which a hand-built one never would. Before iOS
 * 17.4 it is still a checkbox that works. Not sized or restyled on purpose, since
 * either would replace the system's drawing with ours.
 */
export function Switch({ checked, onChange, accent, id }: SwitchProps) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      // React has no prop for the attribute yet.
      {...{ switch: "" }}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="shrink-0"
      style={{ accentColor: accent }}
    />
  );
}
