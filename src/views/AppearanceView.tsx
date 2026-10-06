import { PushScreen } from "../components/PushScreen";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { GROUP_HEADING } from "../components/ui/typography";
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

/**
 * How the app looks. Split out of Preferences, which is about how you bowl.
 * The layout notation (dual angle or VLS) used to have a global switch here;
 * it went, because the Layouts page and each ball's form both carry their own.
 */
export function AppearanceView({ onBack }: AppearanceViewProps = {}) {
  const [theme, setTheme] = useTheme();

  const body = (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-6">
      <div>
        <h2 className={GROUP_HEADING}>Theme</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-secondary">
          Follow your device setting, or pin the app to light or dark.
        </p>
        <SegmentedControl
          label="Theme"
          options={THEME_OPTIONS}
          value={theme}
          onChange={setTheme}
        />
      </div>
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen mode="inline" title="Appearance" onBack={onBack}>
      {body}
    </PushScreen>
  );
}
