import { i18n } from "@lingui/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";
import { PushScreen } from "../components/PushScreen";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { SETTING_HEADING } from "../components/ui/typography";
import { Check, Lock } from "lucide-react";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import {
  LANGUAGE_NAMES,
  SUPPORTED_LOCALES,
  detectLocale,
  readLanguagePreference,
  rememberLanguagePreference,
  type Locale
} from "../lib/i18n";
import { useTextSize } from "../components/ui/useTextSize";
import { TEXT_SIZES } from "../lib/textScale";
import { useTheme, type ThemePreference } from "../lib/theme";
import { PALETTES, usePalette } from "../lib/palette";
import { useProAccess } from "../lib/useProAccess";
import { useProOffer } from "../lib/proOffer";

const THEME_OPTIONS: { value: ThemePreference; label: MessageDescriptor }[] = [
  { value: "system", label: msg({ message: "System", comment: "Theme setting: follow the phone's light or dark choice" }) },
  { value: "light", label: msg({ message: "Light", comment: "Theme setting: the light theme" }) },
  { value: "dark", label: msg({ message: "Dark", comment: "Theme setting: the dark theme" }) }
];

interface AppearanceViewProps {
  /** Present when pushed from Settings, which draws the shared nav bar. */
  onBack?: () => void;
  /** Starts the app again in the language just picked. A test passes its own. */
  reload?: () => void;
}

/**
 * How the app looks, theme, text size and color. Split out of Preferences, which is about how you bowl.
 * The layout notation (dual angle or VLS) used to have a global switch here;
 * it went, because the Layouts page and each ball's form both carry their own.
 */
export function AppearanceView({ onBack, reload = () => window.location.reload() }: AppearanceViewProps = {}) {
  const [theme, setTheme] = useTheme();
  const [palette, setPalette] = usePalette();
  const [textSize, setTextSize] = useTextSize();
  const access = useProAccess();
  const openOffer = useProOffer();
  // A stored Pro color is not on while Pro is not open (`useAppliedPalette`).
  const shown = access.locked && PALETTES.find((x) => x.id === palette)?.pro ? "felt" : palette;

  // Built here, not at import: the labels are read in the active language.
  const themeOptions = THEME_OPTIONS.map((o) => ({ value: o.value, label: i18n._(o.label) }));
  // On top of the phone's own text size (ADR-219).
  const textSizeOptions = TEXT_SIZES.map((o) => ({ value: o.id, label: i18n._(o.label) }));

  const body = (
    <section className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-6">
      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>{t`Theme`}</h2>
        <SegmentedControl
          label={t`Theme`}
          options={themeOptions}
          value={theme}
          onChange={setTheme}
        />
      </div>

      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>{t`Text size`}</h2>
        <SegmentedControl
          label={t`Text size`}
          options={textSizeOptions}
          value={textSize}
          onChange={setTextSize}
        />
      </div>

      <LanguagePicker reload={reload} />

      <div>
        <h2 className={`mb-3 ${SETTING_HEADING}`}>{t`Color`}</h2>
        <div role="group" aria-label={t`Color`} className="grid grid-cols-5 gap-2">
          {PALETTES.map((p) => {
            const locked = p.pro && access.locked;
            const selected = !locked && shown === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected}
                aria-label={locked ? t`${{ name: p.name }}, needs Headpin Pro` : p.name}
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
    <PushScreen mode="inline" title={t`Appearance`} onBack={onBack}>
      {body}
    </PushScreen>
  );
}

/**
 * Which language the app speaks: the phone's, or one picked here (ADR-225). The
 * language is chosen once, before the first screen is drawn (ADR-220), so a
 * change starts the app again rather than redrawing every screen in place.
 */
function LanguagePicker({ reload }: { reload: () => void }) {
  const picked = readLanguagePreference();
  const phone = detectLocale() as Locale;

  function choose(next: Locale | null) {
    if (next === picked) return;
    rememberLanguagePreference(next);
    reload();
  }

  const mark = (on: boolean) =>
    on ? (
      <Check size={18} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-accent" />
    ) : (
      <span aria-hidden="true" className="w-[18px] shrink-0" />
    );

  return (
    <div>
      <h2 className={`mb-3 ${SETTING_HEADING}`}>{t`Language`}</h2>
      <ListGroup>
        <ListRow
          label={t({ message: "Automatic", comment: "Language setting: speak the phone's language" })}
          description={t`Follows your phone: ${{ language: LANGUAGE_NAMES[phone] }}`}
          pressed={picked === null}
          trailing={mark(picked === null)}
          onClick={() => choose(null)}
        />
        {SUPPORTED_LOCALES.map((locale) => (
          <ListRow
            key={locale}
            label={LANGUAGE_NAMES[locale]}
            labelLang={locale}
            pressed={picked === locale}
            trailing={mark(picked === locale)}
            onClick={() => choose(locale)}
          />
        ))}
      </ListGroup>
    </div>
  );
}
