import { OilPatternManager } from "../components/OilPatternManager";

/** Settings → Oil patterns. The manager itself is a component so the session
 *  form can open it too, without views importing views. */
export function OilPatternsView({
  onBack,
  mode,
  onOpenLineVisualizer,
  covered,
  onShowSessions,
  initialPatternId
}: {
  onBack?: () => void;
  mode?: "inline" | "overlay";
  onOpenLineVisualizer?: (patternId: number) => void;
  /** True while the line visualizer is up over it. */
  covered?: boolean;
  /** History filtered to a pattern, from its sheet (ADR-247). */
  onShowSessions?: (patternName: string) => void;
  /** A pattern whose sheet opens on arrival, from the app's search. */
  initialPatternId?: number;
}) {
  return (
    <OilPatternManager
      onBack={onBack}
      mode={mode}
      onOpenLineVisualizer={onOpenLineVisualizer}
      covered={covered}
      onShowSessions={onShowSessions}
      initialPatternId={initialPatternId}
    />
  );
}
