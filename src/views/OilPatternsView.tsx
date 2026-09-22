import { OilPatternManager } from "../components/OilPatternManager";

/** Settings → Oil patterns. The manager itself is a component so the session
 *  form can open it too, without views importing views. */
export function OilPatternsView({
  onBack,
  mode,
  onOpenLineVisualizer
}: {
  onBack?: () => void;
  mode?: "inline" | "overlay";
  onOpenLineVisualizer?: (patternId: number) => void;
}) {
  return <OilPatternManager onBack={onBack} mode={mode} onOpenLineVisualizer={onOpenLineVisualizer} />;
}
