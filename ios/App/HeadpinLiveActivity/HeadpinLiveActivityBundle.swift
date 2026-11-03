import ActivityKit
import SwiftUI
import WidgetKit

/// The widget extension's entry point. It holds one thing: the Live Activity for
/// the game being scored (ADR-221), started and updated by the app's
/// `HeadpinLiveActivityPlugin`.
@main
struct HeadpinLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        HeadpinGameLiveActivity()
    }
}

/// The Lock Screen, the Dynamic Island, and an Apple Watch's Smart Stack.
///
/// `supplementalActivityFamilies` is iOS 18, and it is why the extension's
/// floor is 18 (ADR-227): without it the watch shows only the island's two
/// compact slots, a pin and the total. Switching it on and off by iOS version
/// was tried, and the bundle's builder does not type-check an iOS 18 widget
/// behind a conditional on a 16.1 floor.
struct HeadpinGameLiveActivity: Widget {
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

/// The Dynamic Island.
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
