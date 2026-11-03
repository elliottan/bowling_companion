import ActivityKit
import SwiftUI
import WidgetKit

/// The widget extension's entry point. It holds one thing: the Live Activity for
/// the game being scored (ADR-221), started and updated by the app's
/// `HeadpinLiveActivityPlugin`.
///
/// Two widgets for the one activity, and only ever one of them in the bundle.
/// iOS 18 lets an activity draw its own layout on an Apple Watch's Smart Stack
/// (`supplementalActivityFamilies`); without it the watch shows the island's
/// two compact slots, a pin and the total (ADR-227). The modifier changes the
/// configuration's type, so it cannot sit behind an `if #available` inside one
/// widget, and the bundle picks the widget instead.
@main
struct HeadpinLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 18.0, *) {
            HeadpinGameLiveActivityWithWatch()
        } else {
            HeadpinGameLiveActivity()
        }
    }
}

/// iOS 16.1 to 17: the Lock Screen and the Dynamic Island.
struct HeadpinGameLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HeadpinGameAttributes.self) { context in
            // The Lock Screen, and the banner at the top of the screen.
            // Its own background and tint, by the bowler's palette and theme.
            LockScreenGameView(state: context.state)
        } dynamicIsland: { context in
            HeadpinGameIsland.island(state: context.state)
        }
    }
}

/// iOS 18 and later: the same, plus the watch's own layout.
@available(iOS 18.0, *)
struct HeadpinGameLiveActivityWithWatch: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HeadpinGameAttributes.self) { context in
            // The Lock Screen and the banner are `.medium`; the watch is `.small`.
            GameViewForFamily(state: context.state)
        } dynamicIsland: { context in
            HeadpinGameIsland.island(state: context.state)
        }
        .supplementalActivityFamilies([.small])
    }
}

/// The Dynamic Island, shared by both widgets.
enum HeadpinGameIsland {
    static func island(state: HeadpinGameAttributes.ContentState) -> DynamicIsland {
        let island = HeadpinPalette.island(palette: state.palette)
        return DynamicIsland {
            DynamicIslandExpandedRegion(.leading) {
                HStack(spacing: 6) {
                    HeadpinMark(size: 24, fill: island.accentFill)
                    Text("Game \(state.game)")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(island.ink)
                }
            }
            DynamicIslandExpandedRegion(.trailing) {
                Text("\(state.total)")
                    .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(island.ink)
            }
            DynamicIslandExpandedRegion(.center) {
                VStack(spacing: 0) {
                    Text(state.done ? "Final score" : "Frame \(state.frame)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(island.accent)
                    if let max = state.max {
                        Text("Max \(max)")
                            .font(.system(size: 11).monospacedDigit())
                            .foregroundColor(island.secondary)
                    }
                }
            }
            DynamicIslandExpandedRegion(.bottom) {
                RecentFramesView(state: state, palette: island)
            }
        } compactLeading: {
            HeadpinPin()
                .frame(width: 10, height: 20)
                .accessibilityElement()
                .accessibilityLabel("Headpin")
        } compactTrailing: {
            Text("\(state.total)")
                .font(.system(size: 15, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundColor(island.ink)
        } minimal: {
            Text("\(state.total)")
                .font(.system(size: 13, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundColor(island.accent)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
        }
        .keylineTint(island.accent)
    }
}
