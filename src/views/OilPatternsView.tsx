import { OilPatternManager } from "../components/OilPatternManager";

/** Settings → Oil Patterns. The manager itself is a component so the session
 *  form can open it too, without views importing views. */
export function OilPatternsView() {
  return <OilPatternManager />;
}
