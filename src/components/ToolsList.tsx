import { BookOpen, Compass, GraduationCap } from "lucide-react";
import { LaneViewIcon, OilPatternIcon } from "./icons";
import { ListGroup, ListRow } from "./ui/ListGroup";

export interface ToolsActions {
  onOpenLayoutLab: () => void;
  onOpenLineVisualizer: () => void;
  onOpenOilPatterns: () => void;
  onOpenCatalog: () => void;
  onOpenGuides: () => void;
}

/**
 * The tools and reference that are the same for every bowler: the layout lab,
 * the line visualizer, the oil patterns, the ball catalog and the guides. One
 * list, on Home and behind a row in Settings, so both doors open the same
 * screens in the same order. Each row says what the tool does, since "Layouts"
 * and "Line visualizer" are names a new bowler would otherwise tap to learn.
 */
export function ToolsList({ heading, ...open }: ToolsActions & { heading?: string }) {
  return (
    <ListGroup heading={heading}>
      <ListRow
        icon={Compass}
        label="Layouts"
        description="A drilling layout, drawn on the ball"
        onClick={open.onOpenLayoutLab}
      />
      <ListRow
        icon={LaneViewIcon}
        label="Line visualizer"
        description="Draw a line on the lane, over the oil"
        onClick={open.onOpenLineVisualizer}
      />
      <ListRow
        icon={OilPatternIcon}
        label="Oil patterns"
        description="Look up a pattern's length and oil"
        onClick={open.onOpenOilPatterns}
      />
      <ListRow
        icon={BookOpen}
        label="Ball catalog"
        description="Specs and pictures of current balls"
        onClick={open.onOpenCatalog}
      />
      <ListRow
        icon={GraduationCap}
        label="Guides"
        description="Using Headpin, layouts and equipment"
        onClick={open.onOpenGuides}
      />
    </ListGroup>
  );
}
