import { useLiveQuery } from "dexie-react-hooks";
import { PushScreen } from "../components/PushScreen";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { GROUP_HEADING } from "../components/ui/typography";
import { useTheme, type ThemePreference } from "../lib/theme";
import { getLayoutSystem, setLayoutSystem } from "../services/bowlingRepository";
import type { LayoutSystem } from "../types/bowling";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

const LAYOUT_SYSTEM_OPTIONS: { value: LayoutSystem; label: string }[] = [
  { value: "dual", label: "Dual angle" },
  { value: "vls", label: "Storm VLS" }
];

interface AppearanceViewProps {
  /** Present when pushed from Settings, which draws the shared nav bar. */
  onBack?: () => void;
}

/** How the app looks. Split out of Preferences, which is about how you bowl. */
export function AppearanceView({ onBack }: AppearanceViewProps = {}) {
  const [theme, setTheme] = useTheme();
  // Dual angle until told otherwise: it is the notation the app's own geometry,
  // its presets and every chart in the guides are written in.
  const layoutSystem = useLiveQuery(getLayoutSystem, [], undefined) ?? "dual";

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

      {/* How a layout is written, not what it is: the two notations describe the
          same drilling, so this changes the reading and never the ball. It sits
          in Appearance rather than in Preferences for exactly that reason. A
          ball can still be pinned to one notation in its own form, which is
          what a drill sheet written in the other one calls for. */}
      <div>
        <h2 className={GROUP_HEADING}>Layout numbers</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-secondary">
          Which system layouts are shown in: the dual angle three, or Storm's VLS distances. Balls
          you have pinned to one system keep it.
        </p>
        <SegmentedControl
          label="Layout system"
          options={LAYOUT_SYSTEM_OPTIONS}
          value={layoutSystem}
          onChange={(value) => void setLayoutSystem(value)}
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
