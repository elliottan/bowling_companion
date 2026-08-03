import { PushScreen } from "../components/PushScreen";
import { Chip } from "../components/ui/Chip";
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
      <h2 className="text-base font-bold text-ink">Theme</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
        Follow your device setting, or pin the app to light or dark.
      </p>
      <div className="mt-3 flex gap-2">
        {THEME_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            selected={theme === opt.value}
            onClick={() => setTheme(opt.value)}
            className="h-11 flex-1"
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen mode="inline" title="Appearance" backLabel="Settings" onBack={onBack}>
      {body}
    </PushScreen>
  );
}
