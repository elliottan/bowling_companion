import { t } from "@lingui/core/macro";
import type { CoverstockCategory } from "../types/catalog";

/** What a coverstock category is called on screen. The stored value stays
 *  English; this is only the label. */
export function coverstockLabel(category: CoverstockCategory): string {
  switch (category) {
    case "Solid":
      return t({ message: "Solid", comment: "Bowling term: a coverstock type, a matte cover that grips early" });
    case "Pearl":
      return t({ message: "Pearl", comment: "Bowling term: a coverstock type, a shiny cover with mica that skids and then hooks" });
    case "Hybrid":
      return t({ message: "Hybrid", comment: "Bowling term: a coverstock type that blends solid and pearl" });
    case "Urethane":
      return t({ message: "Urethane", comment: "Bowling term: a coverstock material, a smooth low-friction cover" });
    case "Polyester":
      return t({ message: "Polyester", comment: "Bowling term: a coverstock material, plastic, used for straight shots and spares" });
    default:
      return category;
  }
}

/** What a core type is called on screen. The stored value stays English. */
export function coreTypeLabel(coreType: "Symmetric" | "Asymmetric"): string {
  return coreType === "Symmetric"
    ? t({ message: "Symmetric", comment: "Bowling term: a ball with a symmetric core, as opposed to asymmetric" })
    : t({ message: "Asymmetric", comment: "Bowling term: a ball with an asymmetric core, as opposed to symmetric" });
}
