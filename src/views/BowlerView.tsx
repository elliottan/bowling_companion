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
 */
export function BowlerView({ handedness, onHandednessChange, onOpenGuide, onBack }: BowlerViewProps) {
  const grip: GripStyle = useLiveQuery(getGripStyle, [], undefined) ?? "1h";

  const body = (
    <section className="mx-auto w-full max-w-3xl space-y-6 px-3 py-4 sm:px-6">
      <div>
        <h2 className={GROUP_HEADING}>Handedness</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-secondary">
          Boards count in from your side of the lane, so every line, spare target and drift
          reads from the hand you bowl with. Sessions already recorded keep their numbers.
        </p>
        <HandednessPicker value={handedness} onSelect={onHandednessChange} />
      </div>

      <div>
        <h2 className={GROUP_HEADING}>Grip</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-secondary">
          How the layout lab draws your ball. Scoring is the same either way.
        </p>
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
