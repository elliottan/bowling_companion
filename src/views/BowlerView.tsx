import { useLiveQuery } from "dexie-react-hooks";
import { PushScreen } from "../components/PushScreen";
import { HandednessPicker } from "../components/HandednessPicker";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { GROUP_HEADING } from "../components/ui/typography";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import { getGripStyle, setGripStyle } from "../services/bowlingRepository";
import type { GripStyle, Handedness } from "../types/bowling";

interface BowlerViewProps {
  handedness: Handedness;
  onHandednessChange: (value: Handedness) => void;
  /** Open the guide that explains what both answers change. */
  onOpenGuide: () => void;
  /** Present when pushed from Settings, which draws the shared nav bar. */
  onBack?: () => void;
}

/**
 * Hand and grip, a push behind one Settings row. They are answered once, at
 * first run, and almost never again, and flipping the hand mirrors every board
 * in the app, so neither should sit on the Settings list one stray tap away.
 * No prose under the headings: the controls say what they are, and what each
 * answer changes is the guide behind "Why it matters".
 */
export function BowlerView({ handedness, onHandednessChange, onOpenGuide, onBack }: BowlerViewProps) {
  const grip: GripStyle = useLiveQuery(getGripStyle, [], undefined) ?? "1h";

  const body = (
    <section className="mx-auto w-full max-w-3xl space-y-6 px-3 py-4 sm:px-6">
      <div>
        <h2 className={`mb-3 ${GROUP_HEADING}`}>Handedness</h2>
        <HandednessPicker value={handedness} onSelect={onHandednessChange} />
      </div>

      <div>
        <h2 className={`mb-3 ${GROUP_HEADING}`}>Grip</h2>
        <SegmentedControl
          label="Grip style"
          value={grip}
          onChange={(next) => void setGripStyle(next)}
          options={[
            { value: "1h", label: "One-handed" },
            { value: "2h", label: "Two-handed" }
          ]}
        />
      </div>

      <button
        type="button"
        onClick={onOpenGuide}
        className={`relative text-sm font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
      >
        Why it matters
      </button>
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen mode="inline" title="Hand and grip" onBack={onBack}>
      {body}
    </PushScreen>
  );
}
