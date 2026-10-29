import { PushScreen } from "../components/PushScreen";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { SETTING_HEADING } from "../components/ui/typography";
import { Check, Lock } from "lucide-react";
import { useTextSize } from "../components/ui/useTextSize";
import { TEXT_SIZES } from "../lib/textScale";
import { useTheme, type ThemePreference } from "../lib/theme";
import { PALETTES, usePalette } from "../lib/palette";
import { useProAccess } from "../lib/useProAccess";
import { useProOffer } from "../lib/proOffer";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

/** On top of the phone's own text size (ADR-219). */
const TEXT_SIZE_OPTIONS = TEXT_SIZES.map((s) => ({ value: s.id, label: s.label }));

interface AppearanceViewProps {
  /** Present when pushed from Settings, which draws the shared nav bar. */
  onBack?: () => void;
}

/**
 * How the app looks, theme, text size and color. Split out of Preferences, which is about how you bowl.
 * The layout notation (dual angle or VLS) used to have a global switch here;
 * it went, because the Layouts page and each ball's form both carry their own.
 */
export function AppearanceView({ onBack }: AppearanceViewProps = {}) {
  const [theme, setTheme] = useTheme();
  const [palette, setPalette] = usePalette();
  const [textSize, setTextSize] = useTextSize();
  const access = useProAccess();
  const openOffer = useProOffer();
  // A stored Pro color is not on while Pro is not open (`useAppliedPalette`).
  const shown = access.locked && PALETTES.find((x) => x.id === palette)?.pro ? "felt" : palette;

  const body = (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-6">
      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>Theme</h2>
        <SegmentedControl
          label="Theme"
          options={THEME_OPTIONS}
          value={theme}
          onChange={setTheme}
        />
      </div>

      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>Text size</h2>
        <SegmentedControl
          label="Text size"
          options={TEXT_SIZE_OPTIONS}
          value={textSize}
          onChange={setTextSize}
        />
      </div>

      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>Color</h2>
        <div role="group" aria-label="Color" className="grid grid-cols-5 gap-2">
          {PALETTES.map((p) => {
            const locked = p.pro && access.locked;
            const selected = !locked && shown === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected}
                aria-label={locked ? `${p.name}, needs Headpin Pro` : p.name}
                onClick={() => (locked ? openOffer?.() : setPalette(p.id))}
                className="flex min-h-11 flex-col items-center gap-1.5 rounded-xl py-1 active:opacity-70"
              >
                <span
                  className={`relative flex h-11 w-11 items-center justify-center rounded-full text-white ${
                    selected ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-sunken" : ""
                  }`}
                  style={{ backgroundColor: p.swatch }}
                >
                  {selected && <Check size={18} aria-hidden="true" />}
                  {locked && <Lock size={14} aria-hidden="true" className="drop-shadow" />}
                </span>
                <span className="text-xs font-semibold text-ink-secondary">{p.name}</span>
              </button>
            );
          })}
        </div>
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
