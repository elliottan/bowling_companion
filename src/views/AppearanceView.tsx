import { PushScreen } from "../components/PushScreen";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { useTheme, type ThemePreference } from "../lib/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

interface AppearanceViewProps {
  /** Present when pushed from Settings, which draws the shared nav bar. */
  onBack?: () => void;
}

/** How the app looks. Split out of Preferences, which is about how you bowl. */
export function AppearanceView({ onBack }: AppearanceViewProps = {}) {
  const [theme, setTheme] = useTheme();

  const body = (
    <section className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
      {/* No "Theme" heading over a screen already titled Appearance whose whole
          content is the theme. The sentence says what the choice does. */}
      <p className="mb-3 text-sm leading-relaxed text-ink-secondary">
        Follow your device setting, or pin the app to light or dark.
      </p>
      <SegmentedControl
        label="Theme"
        options={THEME_OPTIONS}
        value={theme}
        onChange={setTheme}
      />
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen mode="inline" title="Appearance" onBack={onBack}>
      {body}
    </PushScreen>
  );
}
